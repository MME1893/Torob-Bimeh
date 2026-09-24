"""Audited first vehicle crosswalk from the four supplied HTML catalogs.

The entries are deliberately explicit. Similar names must not create IDs by
fuzzy matching; expand only after checking each provider's actual catalog.
"""

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


def match_car(vehicle):
    row = CAR_MODELS.get(vehicle.model_key)
    if row and all(getattr(vehicle, key) == row[key] for key in
                   ("category_key", "brand_key", "usage_key")):
        return row
    return None
