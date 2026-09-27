"""A real form reaches mapped adapters; an upstream failure stays isolated."""

from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

from torob_bimeh.main import app
from torob_bimeh.routers import search
from torob_bimeh.domain.crosswalk import catalog
from torob_bimeh.domain.dates import jalali_to_gregorian
from torob_bimeh.adapters.sabim.contract import validate_query


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
        return {"Companies": [{"Id": 9, "Title": "ایران"}],
                "Durations": [{"Id": 2, "Title": "یک ساله"}],
                "Coverages": [{"Id": 188, "Title": "۷۰ میلیون تومان"}],
                "Inquiries": [{"CompanyId": 9, "DurationId": 2,
                               "Details": {"CoverageId": 188},
                               "CashPrice": {"FinalAmount": 33445566}}]}

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
    assert all(o["premium"]["amount_toman"] is not None for p in sources.values() for o in p["offers"])
    assert sources["azki"]["offers"][0]["premium"]["raw_unit"] == "toman"
    assert sources["bimeh"]["offers"][0]["premium"]["raw_unit"] == "rial"


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


def test_catalog_contains_the_complete_lab_union_and_scoped_identifiers():
    response = TestClient(app).get("/api/search/catalog")
    assert response.status_code == 200
    data = response.json()
    assert 5_000 < len(data["models"]) < 8_000
    assert len([m for m in data["models"] if m["category"] == "سواری" and
                m["category_key"] == "category:سواری"]) > 100
    assert "provider" not in data["models"][0]
    assert {"peugeot_pars", "peugeot_206_type2", "peugeot_206_type5"} <= {
        m["key"] for m in data["models"]}
    assert all(m["brand_key"].startswith("brand:") for m in data["models"])
    assert data["models"][0]["usages"]
    assert any(r["key"] == "آسیا" for r in data["insurers"])
    assert len(data["third_car"]["supported_previous_policy_statuses"]) == 3
    assert 1404 in data["production_years_jalali"]


def test_product_insurer_choices_are_mappable_for_every_provider():
    public = TestClient(app).get("/api/search/catalog").json()["insurers"]
    internal = {row["key"]: row for row in catalog()["insurers"]}
    providers = {"azki", "sabim", "bimebazar", "bimeh"}

    assert public
    assert all(providers <= set(internal[row["key"]]["providers"]) for row in public)
    assert "امید" not in {row["key"] for row in public}
    assert providers <= set(internal["خاورمیانه"]["providers"])
    assert providers <= set(internal["حکمت صبا"]["providers"])


def test_malformed_provider_response_is_not_an_empty_result(monkeypatch):
    async def empty_azki(*args):
        return {"top": [], "bottom": [], "others": []}

    async def empty_bazaar(*args):
        return {"status": "ok", "data": {"offers": []}}

    async def malformed_bimeh(*args):
        return {"Companies": [], "Inquiries": [
            {"CompanyId": 99, "CashPrice": {"FinalAmount": 12000000}}]}

    monkeypatch.setattr(search, "get_third_prices", empty_azki)
    monkeypatch.setattr(search, "get_offers", empty_bazaar)
    monkeypatch.setattr(search, "get_prices", malformed_bimeh)
    response = TestClient(app).post("/api/search", json=FORM)
    assert response.status_code == 200
    providers = {p["provider"]: p for p in response.json()["providers"]}
    assert providers["azki"]["status"] == "empty"
    assert providers["bimebazar"]["status"] == "empty"
    assert providers["bimeh"]["status"] == "invalid_response"
    assert providers["bimeh"]["raw_response"]["Inquiries"][0]["CompanyId"] == 99
    assert providers["bimeh"]["offers"] == []


def test_two_audited_206_trims_map_exact_bimeh_ids_automatically(monkeypatch):
    async def azki(params, product):
        assert params["vehicleModelID"] in {"182091", "182121"}
        return {"top": [], "bottom": [], "others": []}

    async def bazaar(product, params):
        assert params["car_model"] in {"car_peugeot_206-type2", "car_peugeot_206-type5"}
        return {"status": "ok", "data": {"offers": []}}

    seen = []
    async def bimeh(product, params):
        seen.append(params["ModelId"])
        return {"Companies": [], "Inquiries": []}
    monkeypatch.setattr(search, "get_third_prices", azki)
    monkeypatch.setattr(search, "get_offers", bazaar)
    monkeypatch.setattr(search, "get_prices", bimeh)
    for key in ("peugeot_206_type2", "peugeot_206_type5"):
        form = {**FORM, "vehicle": {**FORM["vehicle"], "model_key": key}}
        response = TestClient(app).post("/api/search", json=form)
        assert response.status_code == 200
        assert [p["status"] for p in response.json()["providers"]] == [
            "empty", "needs_input", "empty", "empty"]
    assert seen == [1030, 1033]


def test_jalali_conversion_and_invalid_esfand():
    assert jalali_to_gregorian("1405/07/01").isoformat() == "2026-09-23"
    assert jalali_to_gregorian("1403/01/01").isoformat() == "2024-03-20"
    import pytest
    with pytest.raises(ValueError):
        jalali_to_gregorian("1405/12/30")


def test_each_lab_contributes_provider_scoped_models_and_uses():
    from collections import Counter
    from torob_bimeh.domain.crosswalk import match_car
    from torob_bimeh.domain.quotes import CarVehicle
    rows = catalog()["models"]
    assert Counter(m["provider"] for m in rows) == {
        "sabim": 4061, "azki": 1879, "bimeh": 1750, "bimebazar": 1212}
    assert len(catalog()["joined"]) == 622
    for provider in ("azki", "sabim", "bimebazar", "bimeh"):
        m = next(m for m in rows if m["provider"] == provider)
        vehicle = CarVehicle(category_key=f'{provider}:{m["mapping"]["category"]}',
                             brand_key=f'{provider}:{m["mapping"]["brand"]}',
                             model_key=m["key"], usage_key=m["usages"][0]["key"],
                             production_year_jalali=1404)
        assert set(match_car(vehicle)) == {provider}
        assert match_car(vehicle.model_copy(update={"brand_key": "another:brand"})) is None

    joined = next(g for g in catalog()["joined"] if g["label"] == "آئودی A4")
    selected = CarVehicle(category_key=joined["category_key"], brand_key=joined["brand_key"],
                          model_key=joined["key"], usage_key="personal", production_year_jalali=1404)
    assert match_car(selected)["azki"]["vehicleModelID"] == "806880"
    assert match_car(selected)["bimebazar"]["car_model"] == "car_audi_a4"
    assert match_car(selected.model_copy(update={"usage_key": "taxi"})) is None


def test_previous_policy_builds_four_different_lab_requests_and_isolates_response(monkeypatch):
    form = {**FORM, "previous_policy": {
        "status": "had_previous_policy", "previous_insurer_key": "آسیا",
        "previous_start_date_jalali": "1403/07/01", "previous_expiry_date_jalali": "1404/07/01",
        "previous_duration_months": 12, "no_claim_discount_percent": 0,
        "driver_discount_percent": 0, "had_claim": True,
        "property_claim_count": 1, "bodily_claim_count": 0, "driver_claim_count": 0}}

    async def azki(params, product):
        assert params["oldCompanyID"] == "3"
        assert params["thirdFinancialDamageID"] == "2"
        assert params["oldInsureExpireDate"] == "1404-07-01"
        return {"top": [], "bottom": [], "others": []}

    async def sabim(product, params):
        assert params["thirdparty_lastcompany"] == "3"
        assert params["thirdparty_last_date_end"] == "2025-09-23"
        assert params["thirdparty_coverage_id"] == "70"
        validate_query(product, params)
        return {"unknownPriceShape": [{"keep": 1}]}

    async def bazaar(product, params):
        assert params["previous_company"] == "asia"
        assert params["has_damage"] == "true"
        return {"status": "ok", "data": {"offers": []}}

    async def bimeh(product, params):
        assert params["PreviousCompanyId"] == 1024
        assert params["PreviousExpirationDate"] == "2025-09-23"
        return {"Companies": [], "Inquiries": []}

    monkeypatch.setattr(search, "get_third_prices", azki)
    monkeypatch.setattr(search, "get_sabim_prices", sabim)
    monkeypatch.setattr(search, "get_offers", bazaar)
    monkeypatch.setattr(search, "get_prices", bimeh)
    response = TestClient(app).post("/api/search", json=form)
    assert response.status_code == 200, response.text
    providers = {r["provider"]: r for r in response.json()["providers"]}
    assert [providers[p]["status"] for p in ("azki", "sabim", "bimebazar", "bimeh")] == [
        "empty", "invalid_response", "empty", "empty"]
    assert providers["sabim"]["raw_response"] == {"unknownPriceShape": [{"keep": 1}]}


def test_new_vehicle_requires_real_release_date_and_converts_per_provider():
    from torob_bimeh.domain.quotes import ThirdCarSearch
    from torob_bimeh.domain.crosswalk import CAR_MODELS
    form = {**FORM, "previous_policy": {"status": "new_vehicle",
                                        "first_use_date_jalali": "1405/07/01",
                                        "new_vehicle_expiry_jalali": "1405/07/01"}}
    request = ThirdCarSearch.model_validate(form)
    expected = {"azki": ("oldInsureExpireDate", "1405-07-01"),
                "bimebazar": ("last_policy_exp_date", "1405/07/01"),
                "bimeh": ("ReleaseDate", "2026-09-23")}
    for provider, (key, value) in expected.items():
        params, status, _ = search._prepare(request, provider, CAR_MODELS["peugeot_pars"])
        assert status is None and params[key] == value
    assert search._prepare(request, "sabim", CAR_MODELS["peugeot_pars"])[1] == "needs_input"
