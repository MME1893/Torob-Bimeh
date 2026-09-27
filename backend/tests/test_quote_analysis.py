import asyncio
import json

import pytest

from torob_bimeh.ai.quote_schema import QuoteAnalysisRequest, QuoteAnalysisResponse
from torob_bimeh.ai.quote_service import AIResponseValidationError, QuoteAnalysisService, _clean_json


def request_payload():
    return QuoteAnalysisRequest.model_validate({
        "inquiry_id": "inq_test",
        "insurance_type": "third_car",
        "offers": [{
            "offer_id": "azki:Iran:0",
            "insurer_name": "ایران",
            "source_name": "azki",
            "final_price": 1_000_000,
        }],
    })


def analysis_payload(offer_id="azki:Iran:0"):
    section = {
        "headline": "خلاصه",
        "summary": "نتیجه بر اساس داده‌های موجود است.",
        "key_points": [{
            "title": "قیمت",
            "description": "این پیشنهاد کمترین قیمت ثبت‌شده را دارد.",
            "offer_ids": [offer_id],
            "tone": "positive",
        }],
        "recommended_offer_ids": [offer_id],
        "caveats": [],
    }
    return {
        "schema_version": "1.0",
        "analysis_version": "1",
        "sections": {
            "smart_summary": section,
            "coverage_services": section,
            "payment_terms": section,
            "price_value": {**section, "cheapest_offer_id": offer_id, "best_value_offer_id": offer_id},
        },
    }


def test_schema_rejects_arbitrary_tone_and_extra_fields():
    payload = analysis_payload()
    payload["sections"]["smart_summary"]["key_points"][0]["tone"] = "great"
    payload["unexpected"] = True
    with pytest.raises(Exception):
        QuoteAnalysisResponse.model_validate(payload)


def test_unknown_offer_ids_are_rejected():
    with pytest.raises(AIResponseValidationError):
        QuoteAnalysisService._validate(json.dumps(analysis_payload("invented")), request_payload())


def test_service_repairs_invalid_output_at_most_once():
    class FakeClient:
        def __init__(self):
            self.calls = 0
            self.last_attempt_count = 1

        async def complete_json(self, messages, **kwargs):
            self.calls += 1
            return "not json" if self.calls == 1 else json.dumps(analysis_payload())

    fake = FakeClient()
    result = asyncio.run(QuoteAnalysisService(lambda: fake).analyze(request_payload()))
    assert result.sections.price_value.cheapest_offer_id == "azki:Iran:0"
    assert fake.calls == 2


def test_json_fence_is_removed_without_aggressive_repair():
    raw = "  ```json\n" + json.dumps(analysis_payload()) + "\n```  "
    result = QuoteAnalysisService._validate(raw, request_payload())
    assert result.schema_version == "1.0"
    assert _clean_json("not json") == "not json"


def test_empty_retry_consumes_the_single_extra_call_budget():
    class FakeClient:
        last_attempt_count = 2
        calls = 0

        async def complete_json(self, messages, **kwargs):
            self.calls += 1
            return "not json"

    fake = FakeClient()
    with pytest.raises(AIResponseValidationError):
        asyncio.run(QuoteAnalysisService(lambda: fake).analyze(request_payload()))
    assert fake.calls == 1
