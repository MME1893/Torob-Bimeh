import asyncio
import json

import pytest
from pydantic import ValidationError

from torob_bimeh.ai.comparison_prompts import COMPARISON_ANALYSIS_SYSTEM_PROMPT
from torob_bimeh.ai.comparison_schema import (
    ComparisonAnalysisRequest,
    ComparisonAnalysisResponse,
)
from torob_bimeh.ai.comparison_service import ComparisonAnalysisService
from torob_bimeh.ai.quote_service import AIResponseValidationError


OFFER_A = "azki:رازی:0"
OFFER_B = "sabim:سینا:1"
OFFER_C = "bimebazar:پردیس:2"
ALL_IDS = [OFFER_A, OFFER_B, OFFER_C]
OUTSIDE_ID = "azki:خارجی:9"


def offer(offer_id: str, name: str, price: int = 1_000_000) -> dict:
    return {
        "offer_id": offer_id,
        "insurer_name": name,
        "source_name": "azki" if offer_id == OFFER_A else "sabim",
        "final_price": price,
    }


def request_payload(**overrides) -> dict:
    payload = {
        "inquiry_id": "inq_test",
        "insurance_type": "third_car",
        "selected_offer_ids": [OFFER_A, OFFER_B],
        "offers": [offer(OFFER_A, "رازی"), offer(OFFER_B, "سینا", 1_200_000)],
    }
    payload.update(overrides)
    return payload


def card(card_type: str, offer_ids: list[str] | None = None) -> dict:
    return {
        "type": card_type,
        "title": "عنوان",
        "description": "توضیح کوتاه بر اساس داده‌های ثبت‌شده.",
        "offer_ids": offer_ids if offer_ids is not None else [OFFER_A],
    }


def response_payload(**overrides) -> dict:
    payload = {
        "schema_version": "1.0",
        "best_offer_id": OFFER_A,
        "best_offer_reason": "قیمت پایین‌تر و پوشش گسترده‌تر.",
        "summary": {"headline": "رازی متعادل‌تر است.", "body": "دو جمله کوتاه."},
        "cards": [
            card("recommended", [OFFER_A]),
            card("cheapest", [OFFER_A]),
            card("payment", [OFFER_A, OFFER_B]),
            card("coverage_services", [OFFER_A]),
        ],
        "caveats": [],
    }
    payload.update(overrides)
    return payload


class _Client:
    """Returns a fixed body and records every message list it receives."""

    last_attempt_count = 1

    def __init__(self, raw: str, seen: list | None = None):
        self.raw = raw
        self.seen = seen if seen is not None else []
        self.calls = 0

    async def complete_json(self, messages, **kwargs):
        self.calls += 1
        self.seen.append(messages)
        return self.raw


def analyze(raw: dict, **overrides):
    request = ComparisonAnalysisRequest.model_validate(request_payload(**overrides))
    return asyncio.run(ComparisonAnalysisService(lambda: _Client(json.dumps(raw, ensure_ascii=False))).analyze(request))


# ------------------------------------------------------------------ request


def test_request_accepts_two_to_four_offers():
    assert len(ComparisonAnalysisRequest.model_validate(request_payload()).offers) == 2
    four_offers = [
        offer(OFFER_A, "رازی"),
        offer(OFFER_B, "سینا", 1_200_000),
        offer(OFFER_C, "پردیس", 1_300_000),
        offer("bimeh:آیین:3", "آیین", 1_400_000),
    ]
    four = ComparisonAnalysisRequest.model_validate(
        {
            "inquiry_id": "inq_test",
            "insurance_type": "third_car",
            "selected_offer_ids": [*ALL_IDS, "bimeh:آیین:3"],
            "offers": four_offers,
        }
    )
    assert len(four.offers) == 4


@pytest.mark.parametrize(
    "overrides",
    [
        {"selected_offer_ids": [OFFER_A], "offers": [offer(OFFER_A, "رازی")]},
        {
            "selected_offer_ids": [*ALL_IDS, "bimeh:چهارم:3", "bimeh:پنجم:4"],
            "offers": [
                offer(OFFER_A, "رازی"),
                offer(OFFER_B, "سینا"),
                offer(OFFER_C, "پردیس"),
                offer("bimeh:چهارم:3", "چهارم"),
                offer("bimeh:پنجم:4", "پنجم"),
            ],
        },
    ],
)
def test_request_rejects_a_selection_outside_two_to_four(overrides):
    with pytest.raises(ValidationError):
        ComparisonAnalysisRequest.model_validate(request_payload(**overrides))


def test_request_rejects_an_offer_that_is_not_selected():
    with pytest.raises(ValidationError):
        ComparisonAnalysisRequest.model_validate(
            request_payload(offers=[offer(OFFER_A, "رازی"), offer(OUTSIDE_ID, "خارجی")])
        )


def test_request_rejects_a_selected_id_that_is_not_supplied():
    with pytest.raises(ValidationError):
        ComparisonAnalysisRequest.model_validate(
            request_payload(selected_offer_ids=[OFFER_A, OUTSIDE_ID])
        )


def test_request_rejects_duplicate_ids():
    with pytest.raises(ValidationError):
        ComparisonAnalysisRequest.model_validate(
            request_payload(
                selected_offer_ids=[OFFER_A, OFFER_A],
                offers=[offer(OFFER_A, "رازی"), offer(OFFER_A, "رازی")],
            )
        )


# ----------------------------------------------------------------- response


def test_valid_response_is_accepted_and_ordered():
    result = analyze(response_payload())
    assert isinstance(result, ComparisonAnalysisResponse)
    assert result.best_offer_id == OFFER_A
    assert [card_item.type for card_item in result.cards] == [
        "recommended",
        "cheapest",
        "payment",
        "coverage_services",
    ]


def test_cards_are_reordered_regardless_of_the_returned_order():
    shuffled = response_payload()
    shuffled["cards"] = [
        card("coverage_services", [OFFER_A]),
        card("payment", [OFFER_A]),
        card("recommended", [OFFER_A]),
        card("cheapest", [OFFER_A]),
    ]
    result = analyze(shuffled)
    assert [item.type for item in result.cards][0] == "recommended"


def test_best_offer_id_outside_the_compared_set_is_rejected():
    with pytest.raises(AIResponseValidationError):
        analyze(response_payload(best_offer_id=OUTSIDE_ID))


def test_a_card_referencing_an_uncompared_offer_is_rejected():
    payload = response_payload()
    payload["cards"][0] = card("recommended", [OUTSIDE_ID])
    with pytest.raises(AIResponseValidationError):
        analyze(payload)


def test_an_invented_id_in_a_later_card_cannot_hide_behind_truncation():
    payload = response_payload()
    payload["cards"][0] = card("recommended", [OFFER_A, OFFER_B, OFFER_C, OUTSIDE_ID])
    with pytest.raises(AIResponseValidationError):
        analyze(payload)


@pytest.mark.parametrize("cards", [
    [card("recommended"), card("cheapest"), card("payment")],
    [card("recommended"), card("cheapest"), card("payment"), card("payment")],
    [card("recommended"), card("cheapest"), card("payment"), card("unknown_type")],
    [card("recommended"), card("cheapest"), card("payment"), card("cheapest")],
])
def test_every_card_type_must_be_present_exactly_once(cards):
    with pytest.raises(AIResponseValidationError):
        analyze(response_payload(cards=cards))


def test_non_json_response_is_rejected():
    request = ComparisonAnalysisRequest.model_validate(request_payload())
    with pytest.raises(AIResponseValidationError):
        asyncio.run(
            ComparisonAnalysisService(lambda: _Client("not json at all")).analyze(request)
        )


def test_fenced_json_is_accepted():
    request = ComparisonAnalysisRequest.model_validate(request_payload())
    raw = "```json\n" + json.dumps(response_payload(), ensure_ascii=False) + "\n```"
    result = asyncio.run(ComparisonAnalysisService(lambda: _Client(raw)).analyze(request))
    assert result.best_offer_id == OFFER_A


def test_a_repair_call_reuses_the_same_system_prompt():
    request = ComparisonAnalysisRequest.model_validate(request_payload())
    seen: list = []
    bad = _Client(json.dumps(response_payload(best_offer_id=OUTSIDE_ID), ensure_ascii=False), seen)
    bad.last_attempt_count = 1
    fixed = json.dumps(response_payload(), ensure_ascii=False)

    class _Repairing(_Client):
        async def complete_json(self, messages, **kwargs):
            self.calls += 1
            self.seen.append(messages)
            return fixed if self.calls > 1 else self.raw

    client = _Repairing(bad.raw, seen)
    result = asyncio.run(ComparisonAnalysisService(lambda: client).analyze(request))
    assert result.best_offer_id == OFFER_A
    assert client.calls == 2
    repair_system = seen[1][0].content
    assert repair_system == COMPARISON_ANALYSIS_SYSTEM_PROMPT


# ------------------------------------------------------------------ context


def test_only_the_compared_offers_travel_in_the_context_block():
    request = ComparisonAnalysisRequest.model_validate(
        request_payload(
            selected_offer_ids=[OFFER_A, OFFER_B],
            offers=[offer(OFFER_A, "رازی"), offer(OFFER_B, "سینا")],
        )
    )
    seen: list = []
    asyncio.run(
        ComparisonAnalysisService(lambda: _Client(json.dumps(response_payload(), ensure_ascii=False), seen)).analyze(request)
    )
    system_text, user_text = seen[0][0].content, seen[0][1].content
    assert "COMPARISON SET" in user_text
    assert "never refer to an offer outside" in user_text
    assert OFFER_C not in user_text
    assert system_text == COMPARISON_ANALYSIS_SYSTEM_PROMPT


def test_the_prompt_forbids_invented_facts_and_mandates_four_cards():
    prompt = COMPARISON_ANALYSIS_SYSTEM_PROMPT
    assert "Never invent prices." in prompt
    assert "best_offer_id MUST be one of the supplied selected_offer_ids." in prompt
    for card_type in ("recommended", "cheapest", "payment", "coverage_services"):
        assert card_type in prompt
    assert "Return EXACTLY four cards" in prompt


def test_the_endpoint_is_registered_next_to_the_existing_ai_routes():
    from torob_bimeh.main import app

    # Routers are included lazily in this FastAPI version, so the resolved
    # OpenAPI schema is the reliable view of what is actually served.
    paths = set(app.openapi()["paths"])
    assert "/api/ai/comparison-analysis" in paths
    assert "/api/ai/chat" in paths
    assert "/api/ai/quote-analysis" in paths


def test_the_endpoint_rejects_a_comparison_with_one_offer():
    from fastapi.testclient import TestClient

    from torob_bimeh.main import app

    with TestClient(app) as client:
        response = client.post(
            "/api/ai/comparison-analysis",
            json={
                "inquiry_id": "inq_test",
                "insurance_type": "third_car",
                "selected_offer_ids": [OFFER_A],
                "offers": [offer(OFFER_A, "رازی")],
            },
        )
    assert response.status_code == 422
