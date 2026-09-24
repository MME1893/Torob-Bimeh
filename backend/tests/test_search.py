"""A real form reaches mapped adapters; an upstream failure stays isolated."""

from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

from app.main import app
from app.routers import search


FORM = {
    "product": "third_car",
    "vehicle": {"category_key": "passenger", "brand_key": "peugeot",
                "model_key": "peugeot_pars", "usage_key": "personal", "production_year_jalali": 1404},
    "previous_policy": {"status": "no_previous_policy"},
    "duration_months": 12, "financial_coverage_toman": 70_000_000,
}


def test_single_request_keeps_four_provider_statuses_and_full_raw_json(monkeypatch):
    async def azki(params, product):
        assert params["vehicleModelID"] == "182341"
        assert params["withoutInsure"] == "true"
        assert product == "third_car"
        return {"top": [], "bottom": [], "others": [{"id": 1, "title": "البرز", "prices": [
            {"durationID": 12, "coverAmount": 70_000_000,
             "discountedPrice": 12345678, "FutureField": {"kept": True}}]}], "newField": [1, 2]}

    async def bazaar(product, params):
        assert params["car_model"] == "car_peugeot_peugeot-pars"
        return {"status": "ok", "data": {"offers": [{"company_name": "رازی", "tariff": 10203040,
                                                       "FutureField": "preserved"}]}}

    async def bimeh(product, body):
        assert body["ModelId"] == 1023
        assert body["ProductionYearId"] == 2025
        return {"Companies": [{"Id": 9, "Title": "ایران"}], "Inquiries": [
            {"CompanyId": 9, "CashPrice": {"FinalAmount": 33445566}}]}

    monkeypatch.setattr(search, "get_third_prices", azki)
    monkeypatch.setattr(search, "get_offers", bazaar)
    monkeypatch.setattr(search, "get_prices", bimeh)
    response = TestClient(app).post("/api/search", json=FORM)
    assert response.status_code == 200, response.text
    sources = {p["provider"]: p for p in response.json()["providers"]}
    assert {key: p["status"] for key, p in sources.items()} == {
        "azki": "ok", "sabim": "needs_input", "bimebazar": "ok", "bimeh": "ok"}
    assert sources["azki"]["raw_response"]["newField"] == [1, 2]
    assert sources["azki"]["offers"][0]["raw_offer"]["price"]["FutureField"] == {"kept": True}
    assert sources["bimebazar"]["offers"][0]["raw_offer"]["FutureField"] == "preserved"
    assert all(o["premium"]["amount_toman"] is None for p in sources.values() for o in p["offers"])


def test_unknown_model_never_calls_upstream(monkeypatch):
    called = AsyncMock()
    monkeypatch.setattr(search, "get_third_prices", called)
    form = {**FORM, "vehicle": {**FORM["vehicle"], "model_key": "unknown"}}
    result = TestClient(app).post("/api/search", json=form)
    assert result.status_code == 200
    assert all(p["status"] == "unmapped" for p in result.json()["providers"])
    called.assert_not_called()


def test_conflicting_previous_policy_fields_do_not_go_upstream(monkeypatch):
    called = AsyncMock()
    monkeypatch.setattr(search, "get_third_prices", called)
    form = {**FORM, "previous_policy": {"status": "no_previous_policy",
                                        "no_claim_discount_percent": 30}}
    result = TestClient(app).post("/api/search", json=form)
    assert result.status_code == 200
    assert all(p["status"] == "needs_input" for p in result.json()["providers"])
    called.assert_not_called()


def test_one_source_failure_preserves_other_results(monkeypatch):
    async def broken(*args):
        raise RuntimeError("upstream failed")

    async def empty_azki(*args):
        return {"top": [], "bottom": [], "others": []}

    async def empty_bazaar(*args):
        return {"status": "ok", "data": {"offers": []}}

    monkeypatch.setattr(search, "get_third_prices", empty_azki)
    monkeypatch.setattr(search, "get_offers", empty_bazaar)
    monkeypatch.setattr(search, "get_prices", broken)
    response = TestClient(app).post("/api/search", json=FORM)
    assert response.status_code == 200
    assert [p["status"] for p in response.json()["providers"]] == [
        "empty", "needs_input", "empty", "unavailable"]
