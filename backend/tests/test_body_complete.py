import json
from datetime import datetime, timezone
from pathlib import Path

from fastapi.testclient import TestClient

from torob_bimeh.adapters.azki.contract import validate_body_payload
from torob_bimeh.adapters.bimebazar.contract import validate_offer_params
from torob_bimeh.adapters.bimeh.contract import validate_inquiry
from torob_bimeh.adapters.sabim.contract import validate_query
from torob_bimeh.domain.body_mapping import preview
from torob_bimeh.domain.crosswalk import catalog as source_catalog
from torob_bimeh.domain.normalizers import normalize
from torob_bimeh.domain.quotes import BodyCarSearch
from torob_bimeh.main import app


client = TestClient(app)
ROOT = Path(__file__).resolve().parents[1]


def complete_form():
    catalog = client.get("/api/search/catalog").json()
    body = catalog["body_car"]
    model = next(row for row in body["models"] if row["source_count"] == 4)
    province = body["provinces"][0]
    city = province["cities"][0]
    return {
        "product": "body_car",
        "vehicle": {
            "category_key": model["category_key"], "brand_key": model["brand_key"],
            "model_key": model["key"], "usage_key": "personal",
            "production_year_jalali": 1404, "production_month_jalali": 1,
            "imported": False, "fuel_type_key": "1",
        },
        "previous_policy": {"had_policy": False},
        "third_party_insurer_key": body["insurers"][0]["key"],
        "third_party_discount_percent": 0,
        "vehicle_value_toman": 1_000_000_000,
        "province_key": str(province["id"]), "city_key": str(city["id"]),
    }


def test_one_body_form_builds_all_four_existing_adapter_contracts():
    request = BodyCarSearch.model_validate(complete_form())
    rows = {row["provider"]: row for row in preview(request)["providers"]}
    assert [rows[name]["status"] for name in ("azki", "sabim", "bimebazar", "bimeh")] == ["ready"] * 4
    validate_body_payload(rows["azki"]["request"])
    validate_query("body_car", rows["sabim"]["request"])
    validate_offer_params(rows["bimebazar"]["request"], "body_car")
    validate_inquiry("body_car", rows["bimeh"]["request"])


def test_body_preview_route_keeps_four_provider_status_tabs():
    response = client.post("/api/search/preview", json=complete_form())
    assert response.status_code == 200
    assert response.json() == {"providers": [
        {"provider": "azki", "status": "ready"},
        {"provider": "sabim", "status": "ready"},
        {"provider": "bimebazar", "status": "ready"},
        {"provider": "bimeh", "status": "ready"},
    ]}


def test_history_accessories_and_all_cover_branches_remain_valid_for_four_sources():
    form = complete_form()
    body = client.get("/api/search/catalog").json()["body_car"]
    insurer = next(row["key"] for row in source_catalog()["body_insurers"]
                   if row["providers"].get("azki") == "3")
    category = body["accessory_categories"][0]
    form.update({
        "previous_policy": {"had_policy": True, "previous_insurer_key": insurer,
                            "previous_expiry_date_jalali": "1405/07/01",
                            "claim_free_years": 2, "had_claim": False,
                            "previous_war_coverage": True},
        "third_party_insurer_key": insurer, "third_party_discount_percent": 25,
        "accessories_value_toman": 10_000_000,
        "accessories": [{"category_key": str(category["id"]),
                         "item_keys": [str(category["items"][0]["id"])],
                         "value_toman": 10_000_000}],
        "selected_coverages": ["glass_break", "natural_disaster", "acid_chemical",
                               "transportation", "war", "franchise_removal", "scratch",
                               "price_drop", "depreciation_removal"],
        "theft_parts_percent": 10, "price_fluctuation_percent": 50,
        "sabim_life_discount_key": "22", "sabim_other_discount_key": "3",
        "sabim_bank_discount_key": "10",
    })
    rows = {row["provider"]: row for row in preview(BodyCarSearch.model_validate(form))["providers"]}
    assert all(row["status"] == "ready" for row in rows.values())
    validate_body_payload(rows["azki"]["request"])
    validate_query("body_car", rows["sabim"]["request"])
    validate_offer_params(rows["bimebazar"]["request"], "body_car")
    validate_inquiry("body_car", rows["bimeh"]["request"])


def test_supplied_body_samples_are_parsed_as_real_offers():
    samples = {
        "azki": ROOT / "logs/azki/20260925T170500_544169Z_body_car_d7383f95.json",
        "bimebazar": ROOT / "logs/bimebazar/20260925T171116_231043Z_body_car_76dce6d0.json",
        "bimeh": ROOT / "logs/bimeh/20260925T170621_406275Z_body_car_fc81d989.json",
    }
    if not all(path.exists() for path in samples.values()):
        return
    now = datetime.now(timezone.utc)
    expected_counts = {"azki": 13, "bimebazar": 12, "bimeh": 13}
    for provider, path in samples.items():
        raw = json.loads(path.read_text(encoding="utf-8"))
        result = normalize(provider, raw, now, "body_car", 12, None)
        assert result.status == "ok"
        assert len(result.offers) == expected_counts[provider]
        assert all(offer.product == "body_car" and offer.premium.amount_toman for offer in result.offers)
