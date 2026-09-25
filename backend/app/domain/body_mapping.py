"""Pure car-body builders ported from the four committed HTML laboratories."""

import re
from urllib.parse import urlencode

from .crosswalk import catalog, match_body_car
from .dates import jalali_to_gregorian
from .third_mapping import MappingIssue, boolean, need

PROVIDERS = ("azki", "sabim", "bimebazar", "bimeh")
ENDPOINTS = {
    "azki": ("POST", "https://www.azki.com/api/aggregator/v1/body/prices/compare"),
    "sabim": ("POST", "https://api.sabim.com/api/price_bodycar"),
    "bimebazar": ("GET", "https://bimebazar.com/carbody/api/offers/"),
    "bimeh": ("POST", "https://coreapi.bimeh.com/v1/insurance/car-body/inquiry"),
}

COVERAGE_KEYS = (
    "glass_break", "acid_chemical", "war", "natural_disaster", "transportation",
    "franchise_removal", "unconventional_vehicle", "scratch", "price_drop",
    "depreciation_removal",
)
AZKI_FLAGS = {
    "glass_break": "glassBreak", "acid_chemical": "acidicSpray", "war": "war",
    "natural_disaster": "naturalDisaster", "transportation": "transportation",
    "franchise_removal": "franchiseRemoval", "unconventional_vehicle": "unconventionalVehicle",
    "scratch": "nail", "price_drop": "valueSubsidence",
    "depreciation_removal": "depreciationRemoval",
}
BAZAAR_FLAGS = {
    "glass_break": "cover_glass_break", "acid_chemical": "cover_chemical",
    "war": "cover_war_damages", "natural_disaster": "cover_natural_disasters",
    "transportation": "cover_transportation", "franchise_removal": "cover_without_franchise",
    "scratch": "cover_scratch", "price_drop": "cover_price_drop",
    "depreciation_removal": "cover_depreciation_cost",
}
BIMEH_COVERS = {
    "glass_break": 10, "natural_disaster": 11, "acid_chemical": 8,
    "depreciation_removal": 9, "war": 20, "franchise_removal": 5,
    "transportation": 12,
}
SABIM_COVER_WORDS = {
    "glass_break": "شیشه", "acid_chemical": "مواد", "war": "جنگ",
    "natural_disaster": "طبیعی", "transportation": "ایاب", "franchise_removal": "فرانشیز",
    "scratch": "خراش", "price_drop": "افت", "depreciation_removal": "استهلاک",
}


def _provider_insurer(key, provider):
    item = next((row for row in catalog()["body_insurers"] if row["key"] == key), None)
    return need(item and item["providers"].get(provider), "شرکت بیمه")


def _percent(rows, percent, *, id_key="id", percent_key="percent"):
    for row in rows:
        value = str(row.get(percent_key, ""))
        match = re.search(r"-?\d+(?:\.\d+)?", value)
        if match and float(match.group()) == float(percent):
            return row[id_key]
        title = str(row.get("title", row.get("Title", row.get("name", ""))))
        if float(percent) == 0 and "صفر" in title:
            return row[id_key]
        match = re.search(r"-?\d+", title.translate(str.maketrans("۰۱۲۳۴۵۶۷۸۹", "0123456789")))
        if match and int(match.group()) == int(percent):
            return row[id_key]
    raise MappingIssue("unmapped", "درصد تخفیف در کاتالوگ منبع موجود نیست")


def _body_discount(provider, request, insurer_id=None):
    history = request.previous_policy
    if not history.had_policy:
        return {"azki": 9, "sabim": "1", "bimebazar": None, "bimeh": None}[provider]
    years = need(history.claim_free_years, "سابقه عدم خسارت بدنه")
    if provider == "azki":
        if history.had_claim:
            return 10
        rows = catalog()["body_options"]["azki"]["body_discounts_by_company"].get(str(insurer_id), [])
        wanted_id = 11 if years == 0 else min(years, 8)
        row = next((item for item in rows if int(item["discountId"]) == wanted_id), None)
        if not row and request.azki_body_discount_id:
            return request.azki_body_discount_id
        if not row:
            raise MappingIssue("unmapped", "تخفیف بدنه این شرکت در کاتالوگ ازکی ثبت نشده است")
        return int(row["discountId"])
    if provider == "sabim":
        if history.had_claim:
            return "1"
        row = next((item for item in catalog()["body_options"]["sabim"]["bodyDiscounts"]
                    if (years == 0 and "صفر" in item["name"]) or
                    (years > 0 and str(years) in item["name"])), None)
        if not row:
            # Sabim orders the captured choices as claim, one year, two years, ...
            row = next((item for item in catalog()["body_options"]["sabim"]["bodyDiscounts"]
                        if int(item["id"]) == min(years + 1, 10)), None)
        return need(row and row["id"], "تخفیف بدنه سابیم")
    if provider == "bimebazar":
        return -1 if history.had_claim else min(years, 8)
    rows = catalog()["body_options"]["bimeh"]["CarBodyNoDamageYears"]
    if history.had_claim:
        return -1
    if years == 0:
        return next(row["Id"] for row in rows if "صفر" in row["Title"])
    return min(years, 5)


def resolve_body_car(request):
    return match_body_car(request.vehicle, request.provider_selections)


def prepare(request, provider, car):
    try:
        return build(request, provider, car), None, None
    except MappingIssue as error:
        return None, error.status, error.message


def build(request, provider, car):
    if provider not in car:
        raise MappingIssue("unmapped", "مدل و کاربری معادل این منبع انتخاب نشده است")
    mapping = car[provider]
    options = catalog()["body_options"][provider]
    history = request.previous_policy
    year = request.vehicle.production_year_jalali
    month = need(request.vehicle.production_month_jalali, "ماه تولید")
    imported = request.vehicle.imported
    if imported is None:
        imported = bool(mapping.get("imported", False))
    third_percent = need(request.third_party_discount_percent, "تخفیف شخص ثالث")
    third_insurer = _provider_insurer(need(request.third_party_insurer_key, "شرکت بیمه ثالث"), provider)
    previous_insurer = (_provider_insurer(history.previous_insurer_key, provider)
                        if history.had_policy else None)
    expiry_jalali = history.previous_expiry_date_jalali

    if provider == "azki":
        province = next((row for row in options["provinces_cities"]
                         if str(row["id"]) == str(request.province_key)), None)
        city = next((row for row in (province or {}).get("cities", [])
                     if str(row["id"]) == str(request.city_key)), None)
        if not province or not city:
            raise MappingIssue("unmapped", "استان یا شهر در کاتالوگ ازکی موجود نیست")
        payload = {
            "vehicleTypeID": int(mapping["vehicleTypeID"]),
            "vehicleModelID": int(mapping["vehicleModelID"]),
            "vehicleBrandID": int(mapping["vehicleBrandID"]),
            "vehicleConstructionYear": year,
            "vehiclePrice": request.vehicle_value_toman * 10,
            "accessoryPrice": request.accessories_value_toman * 10,
            "zeroKilometer": request.zero_kilometer,
            "vehicleUsageID": int(mapping["vehicleUsageID"]),
            "fuelTypeID": int(request.vehicle.fuel_type_key or 1),
            "imported": imported, "installment": False,
            "bodyDiscountID": _body_discount(provider, request, previous_insurer),
            "provinceId": int(province["id"]), "cityId": int(city["id"]),
            "locationSource": "INCOMPLETE_ADDRESS",
            **{flag: key in request.selected_coverages for key, flag in AZKI_FLAGS.items()},
        }
        if request.region_key:
            region = next((row for row in city.get("regions", [])
                           if str(row["id"]) == str(request.region_key)), None)
            if not region:
                raise MappingIssue("unmapped", "منطقه در کاتالوگ ازکی موجود نیست")
            payload["regionId"] = int(region["id"])
        if not request.zero_kilometer:
            payload.update(thirdCompanyID=int(third_insurer),
                           thirdDiscountID=int(_percent(options["third_no_claim_discounts"], third_percent,
                                                        id_key="id", percent_key="percent")))
        else:
            payload["clearanceDate"] = jalali_to_gregorian(request.clearance_date_jalali).isoformat()
        if history.had_policy:
            payload.update(oldCompanyID=int(previous_insurer),
                           oldInsureExpireDate=jalali_to_gregorian(expiry_jalali).isoformat())
        if request.accessories:
            categories = options["non_factory_accessory_categories"]
            built = []
            for accessory in request.accessories:
                category = next((row for row in categories if str(row["id"]) == accessory.category_key), None)
                if not category:
                    raise MappingIssue("unmapped", "دسته لوازم در ازکی موجود نیست")
                allowed = {str(row["id"]): int(row["id"]) for row in category["items"]}
                if any(key not in allowed for key in accessory.item_keys):
                    raise MappingIssue("unmapped", "قلم لوازم در ازکی موجود نیست")
                built.append({"categoryId": int(category["id"]),
                              "items": [allowed[key] for key in accessory.item_keys],
                              "price": accessory.value_toman * 10})
            payload["accessories"] = built
        if request.theft_parts_percent:
            payload["accessoryRobberyCoverID"] = {5: 1, 10: 2, 20: 4}[request.theft_parts_percent]
        if request.price_fluctuation_percent:
            payload["marketFluctuateCoverID"] = {25: 1, 50: 2, 100: 3}[request.price_fluctuation_percent]
        return payload

    if provider == "sabim":
        sabim_year = next((row for row in options["years"] if str(row["name"]).endswith(str(year))), None)
        if not sabim_year:
            raise MappingIssue("unmapped", "سال ساخت در سابیم موجود نیست")
        body_discount = _body_discount(provider, request, previous_insurer)
        third_discount = _percent(options["bodyThirdDiscounts"], third_percent)
        cover_ids = []
        for key in request.selected_coverages:
            word = SABIM_COVER_WORDS.get(key)
            row = next((item for item in options["bodyCoverages"] if word and word in item["name"]), None)
            if row and row["id"] not in cover_ids:
                cover_ids.append(row["id"])
        for word in (("سرقت" if request.theft_parts_percent else None),
                     ("نوسان" if request.price_fluctuation_percent else None)):
            row = next((item for item in options["bodyCoverages"] if word and word in item["name"]), None)
            if row and row["id"] not in cover_ids:
                cover_ids.append(row["id"])
        return {
            "command": "get_price", "bodycar_discnt_id": str(body_discount),
            "bodycar_discnt_thirdparty_id": str(third_discount), "car_id": str(mapping["car_id"]),
            "bodycar_usefor_id": str(mapping["thirdparty_usefor_id"]),
            "bodycar_last_company_id": str(third_insurer),
            "bodycar_discnt_life_id": request.sabim_life_discount_key or "22",
            "bodycar_discnt_another_id": request.sabim_other_discount_key or "3",
            "bodycar_discnt_accbank_id": request.sabim_bank_discount_key or "10",
            "bodycar_price": str(request.vehicle_value_toman), "carmode_id": str(mapping["carmode_id"]),
            "bodycar_time_id": "1", "bodycar_cash": boolean(request.cash_discount),
            "car_company_id": str(mapping["car_company_id"]),
            "bodycar_yearofcons_id": str(sabim_year["id"]),
            "bodycar_prev": "darad" if history.had_policy else "nadarad",
            "bodycar_not_used": boolean(request.zero_kilometer), "body_car_import": boolean(imported),
            "bodycar_coverage_id[]": cover_ids,
        }

    if provider == "bimebazar":
        params = {
            "plk2": "1", "sb_id": "empty", "sanhab_submit_response_status": "regular",
            "has_plate_changed": "no_info_without_sb", "car_production_year": str(year),
            "car_brand": str(mapping["car_brand"]), "car_usage": str(mapping["car_usage"]),
            "discount_third_party": str(min(third_percent // 5, 14)), "inquiry_type": "regular",
            "car_production_month": str(month), "has_previous_policy": boolean(history.had_policy),
            "car_is_new": boolean(request.zero_kilometer), "car_value": str(request.vehicle_value_toman),
            "car_accessories_value": str(request.accessories_value_toman),
        }
        if mapping.get("car_model"):
            params["car_model"] = str(mapping["car_model"])
        if history.had_policy:
            params.update(previous_company=str(previous_insurer), last_policy_exp_date=expiry_jalali,
                          years_without_incident=str(_body_discount(provider, request, previous_insurer)))
        if request.discount_code:
            params["discount_code"] = request.discount_code
        for key in request.selected_coverages:
            if key in BAZAAR_FLAGS:
                params[BAZAAR_FLAGS[key]] = "true"
        if request.theft_parts_percent:
            params["cover_theft_of_parts_key"] = str(request.theft_parts_percent)
        if request.price_fluctuation_percent:
            params["cover_price_fluctuation_key"] = str(request.price_fluctuation_percent)
        return params

    production = jalali_to_gregorian(f"{year:04d}/{month:02d}/01")
    body = {
        "UsingTypeId": int(mapping["UsingTypeId"]),
        "VehicleCategoryId": int(mapping["VehicleCategoryId"]),
        "BrandId": int(mapping["BrandId"]), "ModelId": int(mapping["ModelId"]),
        "hasInsurance": history.had_policy,
        "CarBodyNoDamageYearId": _body_discount(provider, request, previous_insurer) if history.had_policy else None,
        "Imported": int(imported), "Price": request.vehicle_value_toman * 10,
        "ProductionDate": f"{production.year}/{production.month}/01",
        "yearBuild": production.year, "monthBuild": production.month,
        "pYear": year, "pMonth": month,
        "PreviousExpirationDate": (jalali_to_gregorian(expiry_jalali).isoformat()
                                   if history.had_policy else production.isoformat()),
        "PreviousCompanyId": int(previous_insurer) if history.had_policy else None,
        "ThirdPartyDiscountId": int(_percent(options["ThirdPartyDiscounts"], third_percent,
                                              id_key="Id", percent_key="percent")),
        "ThirdPartyCompanyId": int(third_insurer), "isRenewal": False,
    }
    coverage_ids = [value for key, value in BIMEH_COVERS.items()
                    if key in request.selected_coverages]
    if request.theft_parts_percent:
        coverage_ids.append(15)
    if request.price_fluctuation_percent:
        coverage_ids.append(7)
    if coverage_ids:
        body.update(CoverageIds=sorted(set(coverage_ids)), fromFilter=True)
    query = urlencode({key: str(value).lower() if isinstance(value, bool) else value
                       for key, value in body.items() if key not in {"CoverageIds"} and value is not None})
    body["InquiryUrl"] = "https://bimeh.com/carbody/planlist?" + query
    return body


def preview(request):
    car = resolve_body_car(request) or {}
    rows = []
    for provider in PROVIDERS:
        built, status, message = prepare(request, provider, car)
        method, endpoint = ENDPOINTS[provider]
        row = {"provider": provider, "status": status or "ready", "message": message,
               "method": method, "endpoint": endpoint}
        if built is not None:
            row["request"] = built
        rows.append(row)
    return {"providers": rows}
