"""Provider-scoped union generated from the four supplied HTML catalogs.

The entries are deliberately explicit. Similar names must not create IDs by
fuzzy matching; expand only after checking each provider's actual catalog.
"""

import json
from functools import lru_cache
from pathlib import Path

CAR_MODELS = {
    "peugeot_pars": {
        "label": "پژو پارس",
        "category_key": "passenger",
        "brand_key": "peugeot",
        "usage_key": "personal",
        "azki": {"vehicleTypeID": "1", "vehicleBrandID": "18", "vehicleModelID": "182341", "vehicleUsageID": "1"},
        "sabim": {"carmode_id": "1", "car_company_id": "22", "car_id": "13", "thirdparty_usefor_id": "1"},
        "bimebazar": {"vehicle_type": "car", "car_brand": "car_peugeot",
                       "car_model": "car_peugeot_peugeot-pars", "car_usage": "passenger"},
        "bimeh": {"UsingTypeId": 1, "VehicleCategoryId": 1, "BrandId": 1001, "ModelId": 1023},
    },
    "peugeot_206_type2": {
        "label": "پژو ۲۰۶ تیپ ۲",
        "category_key": "passenger",
        "brand_key": "peugeot",
        "usage_key": "personal",
        "azki": {"vehicleTypeID": "1", "vehicleBrandID": "18", "vehicleModelID": "182091", "vehicleUsageID": "1"},
        "sabim": {"carmode_id": "1", "car_company_id": "22", "car_id": "31", "thirdparty_usefor_id": "1"},
        "bimebazar": {"vehicle_type": "car", "car_brand": "car_peugeot",
                       "car_model": "car_peugeot_206-type2", "car_usage": "passenger"},
        # Bimeh lists generic 206; no type-2-equivalent ID is established.
    },
    "peugeot_206_type5": {
        "label": "پژو ۲۰۶ تیپ ۵",
        "category_key": "passenger",
        "brand_key": "peugeot",
        "usage_key": "personal",
        "azki": {"vehicleTypeID": "1", "vehicleBrandID": "18", "vehicleModelID": "182121", "vehicleUsageID": "1"},
        "sabim": {"carmode_id": "1", "car_company_id": "22", "car_id": "111", "thirdparty_usefor_id": "1"},
        "bimebazar": {"vehicle_type": "car", "car_brand": "car_peugeot",
                       "car_model": "car_peugeot_206-type5", "car_usage": "passenger"},
        # Bimeh lists generic 206; no type-5-equivalent ID is established.
    }
}


@lru_cache(maxsize=1)
def catalog():
    snapshot = Path(__file__).with_name("third_catalog.json")
    if snapshot.exists():
        return json.loads(snapshot.read_text(encoding="utf-8"))
    # The checked-in HTML labs are the source of truth. Production can build
    # the snapshot as a deploy artifact; a source checkout works directly.
    from scripts.build_third_catalog import build
    return build()


def _provider_mapping(provider, mapping, usage_key):
    if provider == "azki":
        return {"vehicleTypeID": mapping["category"], "vehicleBrandID": mapping["brand"],
                "vehicleModelID": mapping["model"], "vehicleUsageID": usage_key,
                "imported": mapping.get("imported", False)}
    if provider == "sabim":
        return {"carmode_id": mapping["category"], "car_company_id": mapping["brand"],
                "car_id": mapping["model"], "thirdparty_usefor_id": usage_key}
    if provider == "bimebazar":
        result = {"vehicle_type": mapping["category"], "car_brand": mapping["brand"],
                  "car_usage": usage_key}
        if mapping["model"]:
            result["car_model"] = mapping["model"]
        return result
    return {"VehicleCategoryId": int(mapping["category"]), "BrandId": int(mapping["brand"]),
            "ModelId": int(mapping["model"]), "UsingTypeId": int(usage_key)}


def match_car(vehicle):
    row = CAR_MODELS.get(vehicle.model_key)
    if row and all(getattr(vehicle, key) == row[key] for key in
                   ("category_key", "brand_key", "usage_key")):
        return row
    group = next((g for g in catalog()["joined"] if g["key"] == vehicle.model_key), None)
    if group:
        if (vehicle.category_key, vehicle.brand_key, vehicle.usage_key) != (
                group["category_key"], group["brand_key"], group["usage_key"]):
            return None
        return {source["provider"]: _provider_mapping(source["provider"], source["mapping"],
                                                       source["usage_key"])
                for source in group["sources"]}
    # The full union retains provider scope. A source ID is used only for its
    # originating provider; independent catalogs never share an inferred ID.
    item = next((m for m in catalog()["models"] if m["key"] == vehicle.model_key), None)
    if not item or (vehicle.category_key != f'{item["provider"]}:{item["mapping"]["category"]}'
                    or vehicle.brand_key != f'{item["provider"]}:{item["mapping"]["brand"]}'
                    or vehicle.usage_key not in {u["key"] for u in item["usages"]}):
        return None
    return {item["provider"]: _provider_mapping(item["provider"], item["mapping"], vehicle.usage_key)}
