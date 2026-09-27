"""Pure third-car request builders, ported from the four HTML laboratories.

No endpoint, header, credential or provider ID is accepted from the browser.
The preview and the live search use these same builders.
"""
from urllib.parse import urlencode
from .crosswalk import catalog, match_car
from .dates import jalali_to_gregorian

PROVIDERS = ("azki", "sabim", "bimebazar", "bimeh")
MONTH_TITLES = {"یک ساله": 12, "یک سال": 12, "نه ماهه": 9, "نه ماه": 9,
                "هشت ماهه": 8, "شش ماهه": 6, "شش ماه": 6, "چهار ماهه": 4,
                "چهار ماه": 4, "سه ماهه": 3, "سه ماه": 3, "دو ماهه": 2,
                "دو ماه": 2, "یک ماهه": 1, "یک ماه": 1}
ENDPOINTS = {"azki": ("GET", "https://www.azki.com/api/aggregator/v1/third/prices/compare"),
             "sabim": ("POST", "https://api.sabim.com/api/price_thirdparty"),
             "bimebazar": ("GET", "https://bimebazar.com/thirdparty/api/offers/"),
             "bimeh": ("POST", "https://coreapi.bimeh.com/v1/insurance/third-party/inquiry")}

class MappingIssue(ValueError):
    def __init__(self, status, message):
        self.status, self.message = status, message

def need(value, label):
    if value is None or value == "":
        raise MappingIssue("needs_input", f"{label} را تکمیل کنید")
    return value

def lookup(rows, key, value, label, result="id"):
    row = next((r for r in rows if str(r.get(key)) == str(value)), None)
    if row is None:
        raise MappingIssue("unmapped", f"{label} در کاتالوگ این منبع موجود نیست")
    return row[result]

def insurer_id(key, provider):
    item = next((r for r in catalog()["insurers"] if r["key"] == key), None)
    return need(item and item["providers"].get(provider), "شرکت بیمهٔ قبلی همین منبع")

def resolve_car(request):
    car = dict(match_car(request.vehicle) or {})
    for provider, selection in request.provider_selections.items():
        # An invalid explicit correction cannot silently fall back to a model.
        car.pop(provider, None)
        row = next((r for r in catalog()["models"] if r["provider"] == provider
                    and r["key"] == selection.model_key), None)
        if row:
            v = request.vehicle.model_copy(update={"model_key": row["key"],
                "category_key": provider + ":" + row["mapping"]["category"],
                "brand_key": provider + ":" + row["mapping"]["brand"], "usage_key": selection.usage_key})
            car.update(match_car(v) or {})
    return car

def boolean(value):
    return "true" if value else "false"

def discount(rows, percent, label, *, id_key="id", title_key="title", percent_key=None):
    need(percent, label)
    for row in rows:
        title = str(row.get(title_key, "")).replace("صفر", "0").replace("٪", " درصد")
        if (percent_key and str(row.get(percent_key)) == str(percent)) or title.strip() == f"{percent} درصد":
            return row[id_key]
    raise MappingIssue("unmapped", f"{label} در کاتالوگ این منبع موجود نیست")

def dates(history):
    start = need(history.previous_start_date_jalali, "شروع بیمهٔ قبلی")
    expiry = need(history.previous_expiry_date_jalali, "پایان بیمهٔ قبلی")
    if jalali_to_gregorian(start) >= jalali_to_gregorian(expiry):
        raise MappingIssue("needs_input", "پایان بیمهٔ قبلی باید پس از شروع باشد")
    return start.replace("/", "-"), expiry.replace("/", "-")

def claims(h):
    need(h.had_claim, "سابقهٔ خسارت")
    values = (h.property_claim_count, h.bodily_claim_count, h.driver_claim_count)
    if h.had_claim:
        if any(v is None for v in values) or not any(values):
            raise MappingIssue("needs_input", "تعداد سه نوع خسارت را مشخص کنید؛ حداقل یکی بیشتر از صفر باشد")
    elif any(v not in (None, 0) for v in values):
        raise MappingIssue("needs_input", "تعداد خسارت با گزینهٔ بدون خسارت سازگار نیست")
    return tuple(min(v or 0, 3) for v in values)

def prepare(request, provider, car):
    try:
        return build(request, provider, car), None, None
    except MappingIssue as error:
        return None, error.status, error.message

def build(r, provider, car):
    if provider not in car:
        raise MappingIssue("unmapped", "مدل و کاربری معادل را در زبانهٔ این منبع انتخاب کنید")
    p = {k: v for k, v in car[provider].items() if k != "imported"}
    h = r.previous_policy; options = catalog()["options"][provider]
    status = h.status; old = status == "had_previous_policy"
    mode = h.ownership_mode
    if h.discount_transferred: mode = "other_plate"
    elif h.ownership_changed and mode == "unchanged": mode = "same_plate"
    year = r.vehicle.production_year_jalali
    if status == "no_previous_policy" and any(v not in (None, 0, False) for v in (
            h.previous_start_date, h.previous_expiry_date, h.previous_start_date_jalali,
            h.previous_expiry_date_jalali, h.previous_insurer_key, h.no_claim_discount_percent,
            h.driver_discount_percent, h.had_claim)):
        raise MappingIssue("needs_input", "سابقهٔ واردشده با وضعیت فاقد بیمه سازگار نیست")

    if provider == "azki":
        lookup(options["fuelTypes"], "id", "1" if r.vehicle.fuel_type_key in (None, "gasoline") else r.vehicle.fuel_type_key, "سوخت")
        cover = next((c for c in options["covers"] if c["amount"] == r.financial_coverage_toman and c["enable"]), None)
        if not cover: raise MappingIssue("unmapped", "تعهد مالی در ازکی فعال نیست")
        duration = lookup(options["durations"], "id", r.duration_months, "مدت")
        p.update(vehicleConstructionYear=str(year), withoutInsure=boolean(status == "no_previous_policy"),
                 zeroKilometer=boolean(status == "new_vehicle"), durationID=str(duration),
                 coverID=str(cover["id"]), orig_cover_amount=str(cover["amount"]),
                 isEdit="false", isExtend="false", sanhab="false")
        if status == "new_vehicle": p["oldInsureExpireDate"] = need(h.first_use_date_jalali, "تاریخ ترخیص").replace("/", "-")
        if not old: p["vehicleChangedOwner"] = "0"
        else:
            start, expiry = dates(h)
            p.update(oldInsureStartDate=start, oldInsureExpireDate=expiry, oldCompanyID=insurer_id(h.previous_insurer_key, provider))
            third, driver = (0, 0) if mode == "no_discount" else (h.no_claim_discount_percent, h.driver_discount_percent)
            p.update(thirdDiscountID=str(discount(options["thirdDiscounts"], third, "تخفیف ثالث")),
                     driverDiscountID=str(discount(options["driverDiscounts"], driver, "تخفیف راننده")),
                     oldInsureUsed="0" if mode == "no_discount" else ("1" if need(h.had_claim, "سابقهٔ خسارت") else "0"))
            if mode != "unchanged": p["vehicleChangedOwner"] = {"no_discount": "1", "same_plate": "2", "other_plate": "3"}[mode]
            if mode == "other_plate": p["unAttachedPlateNumber"] = need(h.transfer_plate, "پلاک مبدأ انتقال تخفیف")
            if p["oldInsureUsed"] == "1":
                financial, life, driver = claims(h)
                for key, group, count in (("thirdFinancialDamageID", "thirdFinancialDamages", financial),
                                          ("thirdLifeDamageID", "thirdLifeDamages", life),
                                          ("driverLifeDamageID", "driverLifeDamages", driver)):
                    p[key] = str(lookup(options[group], "id", count + 1, "خسارت"))
        return p

    if provider == "sabim":
        if r.sabim_history:
            company = insurer_id(r.sabim_history.insurer_key, provider)
            start, expiry = r.sabim_history.start_date_jalali, r.sabim_history.expiry_date_jalali
        elif old:
            company = insurer_id(h.previous_insurer_key, provider); start, expiry = dates(h)
        else:
            raise MappingIssue("needs_input", "سابیم دو تاریخ و شرکت مبنا می‌خواهد؛ بخش اطلاعات سابیم را تکمیل کنید")
        y = next((x["id"] for x in options["years"] if x["name"].endswith(f"-{year}")), None)
        duration = next((x["id"] for x in options["durations"] if MONTH_TITLES.get(x["name"]) == r.duration_months), None)
        coverage = next((x["id"] for x in options["coverages"] if int(x["rial"]) == r.financial_coverage_toman * 10), None)
        if y is None or duration is None or coverage is None: raise MappingIssue("unmapped", "سال، مدت یا تعهد مالی در سابیم موجود نیست")
        financial, life, driver = claims(h) if old else (0, 0, 0)
        return {**p, "command": "get_price", "thirdparty_lastcompany": company,
                "thirdparty_discnt_thirdparty_id": str(discount(options["thirdDiscounts"], -5 if r.sabim_zero_km_third_discount else h.no_claim_discount_percent if old else 0, "تخفیف ثالث", percent_key="percent")),
                "thirdparty_discnt_driver_id": str(discount(options["driverDiscounts"], -5 if r.sabim_zero_km_driver_discount else h.driver_discount_percent if old else 0, "تخفیف راننده", percent_key="percent")),
                "thirdparty_last_date_sart": jalali_to_gregorian(start).isoformat(),
                "thirdparty_last_date_end": jalali_to_gregorian(expiry).isoformat(),
                "thirdparty_yearofcons_id": y, "thirdparty_time_id": duration,
                "thirdparty_coverage_id": coverage, "thirdparty_yadak": boolean(r.sabim_yadak),
                "thirdparty_damage_financial_id": str(financial + 1), "thirdparty_damage_human_id": str(life + 1),
                "thirdparty_damage_driver_id": str(driver + 1), "transition": boolean(r.sabim_transition),
                "prev_damage": "darad" if old and h.had_claim else "nadarad"}

    if provider == "bimebazar":
        if r.duration_months not in (2, 3, 4, 6, 9, 12):
            raise MappingIssue("unmapped", "مدت در فهرست ثالث خودروی بیمه‌بازار موجود نیست")
        lookup(options["car_production_year_picker"], "value", year, "سال", "value")
        p.update(plk2="1", sb_id="empty", sanhab_submit_response_status="regular", has_plate_changed="no_info_without_sb",
                 car_production_year=str(year), policy_term=str(r.duration_months), inquiry_type="regular",
                 policy_status={"no_previous_policy": "without", "had_previous_policy": "other", "new_vehicle": "new"}[status],
                 financial_coverage=str(r.financial_coverage_toman))
        if status == "new_vehicle": p["last_policy_exp_date"] = need(h.new_vehicle_expiry_jalali, "پایان بیمهٔ خودروی نو برای بیمه‌بازار").replace("-", "/")
        if old:
            start, expiry = dates(h)
            p.update(previous_company=insurer_id(h.previous_insurer_key, provider), last_policy_start_date=start.replace("-", "/"),
                     last_policy_exp_date=expiry.replace("-", "/"), has_ownership_change=boolean(mode != "unchanged"))
            if mode != "unchanged":
                p["change_ownership_status"] = {"no_discount": "no_another_thirdparty_discount", "same_plate": "has_discount_with_plate", "other_plate": "new_plate_with_discount"}[mode]
                # Ensure the branch string was actually recorded by this lab.
                allowed = {x["value"] for x in options["ownership_change_status_picker"]}
                if p["change_ownership_status"] not in allowed: raise MappingIssue("unmapped", "شاخهٔ انتقال تخفیف بیمه‌بازار تأیید نشده")
            if mode == "other_plate":
                for key, value in (("dis_plk1", h.transfer_plate_part1), ("dis_plk2", h.transfer_plate_part2),
                                   ("dis_plk3", h.transfer_plate_part3), ("dis_plkSrl", h.transfer_plate_serial),
                                   ("dis_national_id", h.transfer_national_id), ("sb_id_pre", h.transfer_inquiry_id)):
                    p[key] = need(value, "مشخصات مبدأ انتقال تخفیف: " + key)
                if h.transfer_relationship: p["transferor_owner_relationship"] = h.transfer_relationship
            if mode != "no_discount":
                for key, option, percent in (("no_damage_factor", "no_damage_factor_picker", h.no_claim_discount_percent),
                                              ("driver_no_damage_factor", "driver_no_damage_factor_picker", h.driver_discount_percent)):
                    value = need(percent, "درصد تخفیف") / 100
                    lookup(options[option], "value", value if value else 0, "تخفیف", "value")
                    p[key] = str(value)
                financial, life, driver = claims(h); p["has_damage"] = boolean(h.had_claim)
                if h.had_claim: p.update(property_damage_count=str(financial), life_damage_count=str(life), driver_damage_count=str(driver))
        return p

    if provider == "bimeh":
        year_row = next((x for x in options["ProductionYears"] if str(year) in x["Title"]), None)
        if not year_row: raise MappingIssue("unmapped", "سال ساخت در بیمه‌دات‌کام موجود نیست")
        duration = next((x["Id"] for x in options["QuoteDurations"] if MONTH_TITLES.get(x["Title"]) == r.duration_months), None)
        if duration is None: raise MappingIssue("unmapped", "مدت در بیمه‌دات‌کام موجود نیست")
        p.update(ProductionYearId=year_row["Id"], PreviousInsuranceStatusId=0 if status == "new_vehicle" else 1 if not old else
                 {"current": 2, "previous": 3, "transfer": 4}[h.policy_owner], DurationId=duration, isRenewal=False)
        if status == "new_vehicle": p["ReleaseDate"] = jalali_to_gregorian(need(h.first_use_date_jalali, "تاریخ ترخیص")).isoformat()
        if old:
            expiry = need(h.previous_expiry_date_jalali, "پایان بیمهٔ قبلی")
            previous_duration = need(h.previous_duration_months, "مدت بیمهٔ قبلی")
            p.update(PreviousExpirationDate=jalali_to_gregorian(expiry).isoformat(), PreviousDurationId=1 if previous_duration == 12 else 0,
                     ThirdPartyDiscountId=discount(options["ThirdPartyDiscounts"], h.no_claim_discount_percent, "تخفیف ثالث", id_key="Id", title_key="Title"),
                     DriverDiscountId=discount(options["DriverDiscounts"], h.driver_discount_percent, "تخفیف راننده", id_key="Id", title_key="Title"),
                     Damage=need(h.had_claim, "سابقهٔ خسارت"),
                     ownershipChange=mode != "unchanged" or h.policy_owner == "transfer",
                     EncryptedPlaque=None)
            if h.policy_owner != "transfer": p["PreviousCompanyId"] = int(insurer_id(h.previous_insurer_key, provider))
            else: p["supplementDiscounts"] = h.supplement_discounts
            financial, life, driver = claims(h)
            p.update(LifeLossId=life + 1 if h.had_claim else None, PropertyLossId=financial + 1 if h.had_claim else None,
                     DriverLossId=driver + 1 if h.had_claim else None)
        p["InquiryUrl"] = "https://bimeh.com/thirdparty/planlist?" + urlencode({k: boolean(v) if isinstance(v,bool) else v
            for k,v in p.items() if v is not None and k != "EncryptedPlaque"})
        return p
    raise ValueError("Unknown provider")

def preview(r):
    car = resolve_car(r); output = []
    for provider in PROVIDERS:
        params, status, message = prepare(r, provider, car)
        method, endpoint = ENDPOINTS[provider]
        source = None
        if provider in car:
            keys = {"azki": ("vehicleTypeID", "vehicleBrandID", "vehicleModelID", "vehicleUsageID"),
                    "sabim": ("carmode_id", "car_company_id", "car_id", "thirdparty_usefor_id"),
                    "bimebazar": ("vehicle_type", "car_brand", "car_model", "car_usage"),
                    "bimeh": ("VehicleCategoryId", "BrandId", "ModelId", "UsingTypeId")}[provider]
            row = next((m for m in catalog()["models"] if m["provider"] == provider and all(
                str(m["mapping"][field]) == str(car[provider].get(key, ""))
                for field, key in zip(("category", "brand", "model"), keys))), None)
            if row: source = {"key": row["key"], "label": row["label"], "usages": row["usages"], "usage_key": str(car[provider][keys[3]])}
        comparison_warning = None
        comparison = params.get("InquiryUrl") if params and provider == "bimeh" else None
        if params and provider == "bimebazar": comparison = "https://bimebazar.com/compare/thirdparty/?" + urlencode({"plkSrl": "", "plk3": "", "plk1": "", **params})
        if params and provider == "azki":
            page = {k: v for k, v in params.items() if k not in ("orig_cover_amount", "isEdit", "isExtend", "sanhab")}
            fuel = "1" if r.vehicle.fuel_type_key in (None, "gasoline") else r.vehicle.fuel_type_key
            fuel_title = lookup(catalog()["options"]["azki"]["fuelTypes"], "id", fuel, "سوخت", "title")
            page.update(insuranceType="30", fuelTypeID=fuel, fuelTypeIDTitle=fuel_title,
                        vehicleConstructionYearTitle=r.vehicle.construction_year_title or str(r.vehicle.production_year_jalali),
                        imported=boolean(r.vehicle.imported if r.vehicle.imported is not None else car[provider].get("imported", False)),
                        isUsingSanhabFlow="false", isFirstTime="false", coverAmount=params["orig_cover_amount"])
            if source:
                model = next(m for m in catalog()["models"] if m["key"] == source["key"])
                page.update(vehicleModelIDTitle=model["model"], vehicleBrandIDTitle=model["brand"],
                            vehicleUsageIDTitle=next(u["label"] for u in model["usages"] if u["key"] == source["usage_key"]))
            if r.previous_policy.status == "had_previous_policy":
                page["vehicleChangedOwner"] = params.get("vehicleChangedOwner", "-1")
                options = catalog()["options"]["azki"]
                page["oldCompanyIDTitle"] = lookup(options["insurers"], "id", params["oldCompanyID"], "شرکت", "title")
                for field, group in (("thirdDiscountID", "thirdDiscounts"), ("driverDiscountID", "driverDiscounts"),
                                     ("thirdFinancialDamageID", "thirdFinancialDamages"), ("thirdLifeDamageID", "thirdLifeDamages"),
                                     ("driverLifeDamageID", "driverLifeDamages")):
                    if field in params:
                        page[field + "Title"] = "صفر" if field in ("thirdDiscountID", "driverDiscountID") and params.get("vehicleChangedOwner") == "1" else lookup(options[group], "id", params[field], field, "title")
            else:
                page.pop("vehicleChangedOwner", None)
                page["oldCompanyIDTitle"] = "فاقد بیمه" if r.previous_policy.status == "no_previous_policy" else "صفر کیلومتر"
            comparison = "https://www.azki.com/car-insurance/third-party-insurance/compare?" + urlencode(page)
            if page["imported"] == "true" and not r.vehicle.construction_year_title:
                comparison = None
                comparison_warning = "لینک صفحهٔ ازکی برای خودروی وارداتی به عنوان سال نیاز دارد؛ درخواست قیمت آماده است"
        output.append({"provider": provider, "status": status or "ready", "message": message,
                       "method": method, "url": endpoint + ("?" + urlencode(params) if params and provider != "bimeh" else ""),
                       "query": params if params and provider != "bimeh" else {},
                       "body": params if provider == "bimeh" else {}, "mapping": car.get(provider, {}),
                       "vehicle": source, "comparison_url": comparison, "comparison_warning": comparison_warning})
    return {"providers": output}
