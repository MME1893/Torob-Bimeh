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
    }
}


def match_car(vehicle):
    row = CAR_MODELS.get(vehicle.model_key)
    if row and all(getattr(vehicle, key) == row[key] for key in
                   ("category_key", "brand_key", "usage_key")):
        return row
    return None
