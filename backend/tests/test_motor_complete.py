"""Complete third-party motorcycle form, mappings, and captured responses."""

import json
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

from torob_bimeh.adapters.azki.contract import validate_price_params
from torob_bimeh.adapters.bimebazar.contract import validate_offer_params
from torob_bimeh.adapters.bimeh.contract import validate_inquiry
from torob_bimeh.adapters.sabim.contract import validate_query
from torob_bimeh.domain.motor_mapping import preview, resolve_motor
from torob_bimeh.domain.normalizers import normalize
from torob_bimeh.domain.quotes import ThirdMotorSearch
from torob_bimeh.main import app
from torob_bimeh.routers import search


CLIENT = TestClient(app)
ROOT = Path(__file__).resolve().parents[1]


def complete_form():
    motor = CLIENT.get("/api/search/catalog").json()["third_motor"]
    return {
        "product": "third_motor",
        "vehicle": {"motor_type_key": "one_cylinder", "production_year_jalali": 1404},
        "previous_policy": {
            "status": "had_previous_policy",
            "previous_insurer_key": motor["insurers"][0]["key"],
            "previous_start_date_jalali": "1403/07/01",
            "previous_expiry_date_jalali": "1404/07/01",
            "previous_duration_months": 12,
            "no_claim_discount_percent": 0,
            "driver_discount_percent": 0,
            "had_claim": False,
            "property_claim_count": 0,
            "bodily_claim_count": 0,
            "driver_claim_count": 0,
        },
        "duration_months": 12,
        "financial_coverage_toman": 70_000_000,
    }


def test_one_motor_form_builds_all_four_existing_adapter_contracts():
    request = ThirdMotorSearch.model_validate(complete_form())
    rows = {row["provider"]: row for row in preview(request)["providers"]}
    assert [rows[name]["status"] for name in ("azki", "sabim", "bimebazar", "bimeh")] == ["ready"] * 4
    validate_price_params(rows["azki"]["query"])
    validate_query("third_motor", rows["sabim"]["query"])
    validate_offer_params(rows["bimebazar"]["query"], "third_motor")
    validate_inquiry("third_motor", rows["bimeh"]["body"])


def test_motor_preview_route_keeps_four_provider_tabs_and_hides_provider_ids():
    response = CLIENT.post("/api/search/preview", json=complete_form())
    assert response.status_code == 200
    assert response.json() == {"providers": [
        {"provider": "azki", "status": "ready"},
        {"provider": "sabim", "status": "ready"},
        {"provider": "bimebazar", "status": "ready"},
        {"provider": "bimeh", "status": "ready"},
    ]}


def test_motor_catalog_is_the_union_without_inventing_missing_mappings():
    motor = CLIENT.get("/api/search/catalog").json()["third_motor"]
    types = {row["key"]: row for row in motor["motor_types"]}
    assert types["one_cylinder"]["providers"] == ["azki", "sabim", "bimebazar", "bimeh"]
    assert types["electric"]["providers"] == ["azki", "bimebazar", "bimeh"]
    assert types["sidecar"]["providers"] == ["azki"]
    assert all("mapping" not in row for row in types.values())


def test_live_search_uses_the_same_four_motor_builders(monkeypatch):
    seen = {}

    async def azki(params, product):
        seen["azki"] = (product, params)
        return {"top": [], "bottom": [], "others": []}

    async def sabim(product, params):
        seen["sabim"] = (product, params)
        return {"result": "ok", "data": []}

    async def bazaar(product, params):
        seen["bimebazar"] = (product, params)
        return {"status": "ok", "data": {"offers": []}}

    async def bimeh(product, params):
        seen["bimeh"] = (product, params)
        return {"Companies": [], "Inquiries": [], "Durations": [], "Coverages": []}

    monkeypatch.setattr(search, "get_third_prices", azki)
    monkeypatch.setattr(search, "get_sabim_prices", sabim)
    monkeypatch.setattr(search, "get_offers", bazaar)
    monkeypatch.setattr(search, "get_prices", bimeh)
    request = ThirdMotorSearch.model_validate(complete_form())
    internal = {row["provider"]: row for row in preview(request)["providers"]}
    response = CLIENT.post("/api/search", json=complete_form())
    assert response.status_code == 200
    assert [row["status"] for row in response.json()["providers"]] == ["empty"] * 4
    for provider, (_, params) in seen.items():
        assert seen[provider][0] == "third_motor"
        assert params == (internal[provider]["body"] if provider == "bimeh" else internal[provider]["query"])


def test_supplied_motor_samples_are_parsed_as_real_offers():
    samples = {
        "azki": ROOT / "logs/azki/20260925T184110_365674Z_third_motor_04ae7830.json",
        "bimebazar": ROOT / "logs/bimebazar/20260925T184338_843678Z_third_motor_dfd19c5a.json",
        "bimeh": ROOT / "logs/bimeh/20260925T184315_986785Z_third_motor_5030ac58.json",
        "sabim": ROOT / "logs/sabim/20260925T184451_751471Z_third_motor_8b7b7150.json",
    }
    now = datetime.now(timezone.utc)
    for provider, path in samples.items():
        raw = json.loads(path.read_text(encoding="utf-8"))
        result = normalize(provider, raw, now, "third_motor", 12, 70_000_000)
        assert result.status == "ok", provider
        assert result.raw_response == raw
        assert result.offers and all(offer.product == "third_motor" for offer in result.offers)
        assert all(offer.premium.amount_toman is not None for offer in result.offers)


def test_unknown_motor_type_never_calls_an_upstream(monkeypatch):
    form = complete_form()
    form["vehicle"]["motor_type_key"] = "invented"
    monkeypatch.setattr(search, "get_third_prices", AsyncMock())
    response = CLIENT.post("/api/search", json=form)
    assert response.status_code == 200
    assert [row["status"] for row in response.json()["providers"]] == ["unmapped"] * 4
    search.get_third_prices.assert_not_awaited()
