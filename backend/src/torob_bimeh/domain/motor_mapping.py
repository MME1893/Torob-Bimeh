"""Pure request builders for the shared third-party motorcycle form."""

from urllib.parse import urlencode

from .crosswalk import catalog, match_motor
from .dates import jalali_to_gregorian
from .third_mapping import (
    MONTH_TITLES,
    MappingIssue,
    boolean,
    claims,
    dates,
    discount,
    lookup,
    need,
)

PROVIDERS = ("azki", "sabim", "bimebazar", "bimeh")
ENDPOINTS = {
    "azki": ("GET", "https://www.azki.com/api/aggregator/v1/third/prices/compare"),
    "sabim": ("POST", "https://api.sabim.com/api/price_thirdparty"),
    "bimebazar": ("GET", "https://bimebazar.com/thirdpartymotor/api/offers/"),
    "bimeh": ("POST", "https://coreapi.bimeh.com/v1/insurance/motor/inquiry"),
}


def resolve_motor(request):
    return dict(match_motor(request.vehicle) or {})


def insurer_id(key, provider):
    item = next((row for row in catalog()["motor_insurers"] if row["key"] == key), None)
    return need(item and item["providers"].get(provider), "شرکت بیمهٔ قبلی همین منبع")


def _history_mode(history):
    mode = history.ownership_mode
    if history.discount_transferred:
        return "other_plate"
    if history.ownership_changed and mode == "unchanged":
        return "same_plate"
    return mode


def _reject_conflicting_empty_history(history):
    if history.status != "no_previous_policy":
        return
    values = (
        history.previous_start_date, history.previous_expiry_date,
        history.previous_start_date_jalali, history.previous_expiry_date_jalali,
        history.previous_insurer_key, history.no_claim_discount_percent,
        history.driver_discount_percent, history.had_claim,
    )
    if any(value not in (None, 0, False) for value in values):
        raise MappingIssue("needs_input", "سابقهٔ واردشده با وضعیت فاقد بیمه سازگار نیست")


def prepare(request, provider, motor):
    try:
        return build(request, provider, motor), None, None
    except MappingIssue as error:
        return None, error.status, error.message


def build(r, provider, motor):
    if provider not in motor:
        raise MappingIssue("unmapped", "این نوع موتورسیکلت در کاتالوگ این منبع معادل تأییدشده ندارد")
    p = {key: value for key, value in motor[provider].items() if key != "imported"}
    h = r.previous_policy
    status = h.status
    old = status == "had_previous_policy"
    mode = _history_mode(h)
    year = r.vehicle.production_year_jalali
    options = catalog()["motor_options"][provider]
    _reject_conflicting_empty_history(h)

    if provider == "azki":
        cover = next((row for row in options["covers"]
                      if row["amount"] == r.financial_coverage_toman and row["enable"]), None)
        if not cover:
            raise MappingIssue("unmapped", "تعهد مالی در ازکی فعال نیست")
        duration = lookup(options["durations"], "id", r.duration_months, "مدت")
        p.update(
            vehicleConstructionYear=str(year),
            withoutInsure=boolean(status == "no_previous_policy"),
            zeroKilometer=boolean(status == "new_vehicle"),
            durationID=str(duration), coverID=str(cover["id"]),
            orig_cover_amount=str(cover["amount"]),
            isEdit="false", isExtend="false", sanhab="false",
        )
        if status == "new_vehicle":
            p["oldInsureExpireDate"] = need(h.first_use_date_jalali, "تاریخ ترخیص").replace("/", "-")
        if not old:
            p["vehicleChangedOwner"] = "0"
        else:
            start, expiry = dates(h)
            third, driver = ((0, 0) if mode == "no_discount" else
                             (h.no_claim_discount_percent, h.driver_discount_percent))
            p.update(
                oldInsureStartDate=start, oldInsureExpireDate=expiry,
                oldCompanyID=insurer_id(h.previous_insurer_key, provider),
                thirdDiscountID=str(discount(options["thirdDiscounts"], third, "تخفیف ثالث")),
                driverDiscountID=str(discount(options["driverDiscounts"], driver, "تخفیف راننده")),
                oldInsureUsed="0" if mode == "no_discount" else
                              ("1" if need(h.had_claim, "سابقهٔ خسارت") else "0"),
            )
            if mode != "unchanged":
                p["vehicleChangedOwner"] = {
                    "no_discount": "1", "same_plate": "2", "other_plate": "3"
                }[mode]
            if mode == "other_plate":
                p["unAttachedPlateNumber"] = need(h.transfer_plate, "پلاک مبدأ انتقال تخفیف")
            if p["oldInsureUsed"] == "1":
                financial, life, driver_claim = claims(h)
                for key, group, count in (
                    ("thirdFinancialDamageID", "thirdFinancialDamages", financial),
                    ("thirdLifeDamageID", "thirdLifeDamages", life),
                    ("driverLifeDamageID", "driverLifeDamages", driver_claim),
                ):
                    p[key] = str(lookup(options[group], "id", count + 1, "خسارت"))
        return p

    if provider == "sabim":
        if r.sabim_history:
            company = insurer_id(r.sabim_history.insurer_key, provider)
            start, expiry = (r.sabim_history.start_date_jalali,
                             r.sabim_history.expiry_date_jalali)
        elif old:
            company = insurer_id(h.previous_insurer_key, provider)
            start, expiry = dates(h)
        else:
            raise MappingIssue("needs_input", "سابیم دو تاریخ و شرکت مبنا می‌خواهد")
        year_id = next((row["id"] for row in options["years"]
                        if row["name"].endswith(f"-{year}")), None)
        duration = next((row["id"] for row in options["durations"]
                         if MONTH_TITLES.get(row["name"]) == r.duration_months), None)
        coverage = next((row["id"] for row in options["coverages"]
                         if int(row["rial"]) == r.financial_coverage_toman * 10), None)
        if year_id is None or duration is None or coverage is None:
            raise MappingIssue("unmapped", "سال، مدت یا تعهد مالی در سابیم موجود نیست")
        financial, life, driver_claim = claims(h) if old else (0, 0, 0)
        return {
            **p, "command": "get_price", "thirdparty_lastcompany": company,
            "thirdparty_discnt_thirdparty_id": str(discount(
                options["thirdDiscounts"],
                -5 if r.sabim_zero_km_third_discount else h.no_claim_discount_percent if old else 0,
                "تخفیف ثالث", percent_key="percent")),
            "thirdparty_discnt_driver_id": str(discount(
                options["driverDiscounts"],
                -5 if r.sabim_zero_km_driver_discount else h.driver_discount_percent if old else 0,
                "تخفیف راننده", percent_key="percent")),
            "thirdparty_last_date_sart": jalali_to_gregorian(start).isoformat(),
            "thirdparty_last_date_end": jalali_to_gregorian(expiry).isoformat(),
            "thirdparty_yearofcons_id": str(year_id), "thirdparty_time_id": str(duration),
            "thirdparty_coverage_id": str(coverage), "thirdparty_yadak": boolean(r.sabim_yadak),
            "thirdparty_damage_financial_id": str(financial + 1),
            "thirdparty_damage_human_id": str(life + 1),
            "thirdparty_damage_driver_id": str(driver_claim + 1),
            "transition": boolean(r.sabim_transition),
            "prev_damage": "darad" if old and h.had_claim else "nadarad",
        }

    if provider == "bimebazar":
        steps = options["steps"]
        years = {int(row["value"]) for row in steps["car_production_year_picker"]}
        durations = {int(row["value"]) for row in options["pricing"]["durations"]}
        coverages = {int(options["pricing"]["initialCoverage"]),
                     *(int(value) for value in options["pricing"]["coverages"])}
        if year not in years or r.duration_months not in durations or r.financial_coverage_toman not in coverages:
            raise MappingIssue("unmapped", "سال، مدت یا تعهد مالی در بیمه‌بازار موجود نیست")
        p.update(car_production_year=str(year),
                 policy_status={"no_previous_policy": "without", "had_previous_policy": "other",
                                "new_vehicle": "new"}[status],
                 policy_term=str(r.duration_months),
                 financial_coverage=str(r.financial_coverage_toman))
        if status == "new_vehicle":
            release = h.new_vehicle_expiry_jalali or h.first_use_date_jalali
            p["last_policy_exp_date"] = need(release, "تاریخ ترخیص").replace("-", "/")
        if old:
            start, expiry = dates(h)
            p.update(previous_company=insurer_id(h.previous_insurer_key, provider),
                     last_policy_start_date=start.replace("-", "/"),
                     last_policy_exp_date=expiry.replace("-", "/"),
                     has_ownership_change=boolean(mode != "unchanged"))
            if mode != "unchanged":
                p["change_ownership_status"] = {
                    "no_discount": "no_another_thirdparty_discount",
                    "same_plate": "has_discount_with_plate",
                    "other_plate": "new_plate_with_discount",
                }[mode]
            if mode != "no_discount":
                p["no_damage_factor"] = str(need(h.no_claim_discount_percent, "تخفیف ثالث") / 100)
                p["driver_no_damage_factor"] = str(need(h.driver_discount_percent, "تخفیف راننده") / 100)
            p["has_damage"] = boolean(need(h.had_claim, "سابقهٔ خسارت"))
            financial, life, driver_claim = claims(h)
            if h.had_claim:
                p.update(property_damage_count=str(financial), life_damage_count=str(life),
                         driver_damage_count=str(driver_claim))
        if r.discount_code:
            p["discount_code"] = r.discount_code
        return p

    if provider == "bimeh":
        duration = next((row["Id"] for row in options["durations"]
                         if MONTH_TITLES.get(row["Title"]) == r.duration_months), None)
        if duration is None:
            raise MappingIssue("unmapped", "مدت در بیمه‌دات‌کام موجود نیست")
        changed = mode != "unchanged" or h.policy_owner == "transfer"
        p.update(ProductionYearId=year + 621,
                 PreviousInsuranceStatusId=(0 if status == "new_vehicle" else
                                            1 if not old else 4 if changed else 2),
                 DurationId=int(duration), isRenewal=False)
        if status == "new_vehicle":
            p["ReleaseDate"] = jalali_to_gregorian(
                need(h.first_use_date_jalali, "تاریخ ترخیص")).isoformat()
        if old:
            previous_duration = need(h.previous_duration_months, "مدت بیمهٔ قبلی")
            p.update(
                PreviousExpirationDate=jalali_to_gregorian(
                    need(h.previous_expiry_date_jalali, "پایان بیمهٔ قبلی")).isoformat(),
                PreviousDurationId=1 if previous_duration == 12 else 0,
                ThirdPartyDiscountId=discount(options["ThirdPartyDiscounts"],
                                              h.no_claim_discount_percent, "تخفیف ثالث",
                                              id_key="Id", title_key="Title"),
                DriverDiscountId=discount(options["DriverDiscounts"],
                                          h.driver_discount_percent, "تخفیف راننده",
                                          id_key="Id", title_key="Title"),
                Damage=need(h.had_claim, "سابقهٔ خسارت"),
                ownershipChange=changed, supplementDiscounts=h.supplement_discounts,
            )
            if not changed:
                p["PreviousCompanyId"] = int(insurer_id(h.previous_insurer_key, provider))
            financial, life, driver_claim = claims(h)
            p.update(LifeLossId=life + 1 if h.had_claim else None,
                     PropertyLossId=financial + 1 if h.had_claim else None,
                     DriverLossId=driver_claim + 1 if h.had_claim else None)
        p["InquiryUrl"] = "https://bimeh.com/thirdpartyMotor/planlist?" + urlencode({
            key: boolean(value) if isinstance(value, bool) else value
            for key, value in p.items() if value is not None
        })
        return p

    raise ValueError("Unknown provider")


def preview(request):
    motor = resolve_motor(request)
    output = []
    for provider in PROVIDERS:
        params, status, message = prepare(request, provider, motor)
        method, endpoint = ENDPOINTS[provider]
        output.append({
            "provider": provider, "status": status or "ready", "message": message,
            "method": method, "url": endpoint + (
                "?" + urlencode(params) if params and provider != "bimeh" else ""),
            "query": params if params and provider != "bimeh" else {},
            "body": params if provider == "bimeh" else {},
            "mapping": motor.get(provider, {}),
        })
    return {"providers": output}
