"""One typed request; independent results and errors for all four providers."""

import asyncio
from datetime import datetime, timezone
from uuid import uuid4
from urllib.parse import urlencode

from fastapi import APIRouter, Body

from ..adapters.azki.client import get_third_prices
from ..adapters.bimebazar.client import get_offers
from ..adapters.bimeh.client import get_prices
from ..domain.crosswalk import CAR_MODELS, catalog, match_car
from ..domain.dates import jalali_to_gregorian
from ..adapters.sabim.client import get_prices as get_sabim_prices
from ..domain.normalizers import normalize
from ..domain.quotes import ProviderResult, SearchInput, SearchResult, ThirdCarSearch

router = APIRouter(tags=["search"])
PROVIDERS = ("azki", "sabim", "bimebazar", "bimeh")


def _prepare(request: ThirdCarSearch, provider: str, car: dict):
    """Build a separate provider request from catalog choices, never shared IDs."""
    if provider not in car:
        return None, "unmapped", "شناسهٔ دقیق این مدل برای این منبع در HTML تأیید نشده است"
    history = request.previous_policy
    if history.status == "no_previous_policy" and any(value not in (None, False, 0) for value in
            history.model_dump(exclude={"status"}).values()):
        return None, "needs_input", "اطلاعات بیمهٔ قبلی با وضعیت «بدون بیمهٔ قبلی» سازگار نیست"
    if history.ownership_changed or history.discount_transferred:
        return None, "needs_input", "تعویض پلاک و انتقال تخفیف به سؤال‌های شاخهٔ جداگانه نیاز دارد"
    year = request.vehicle.production_year_jalali
    opts = catalog()["options"][provider]
    insurer = next((r["providers"].get(provider) for r in catalog()["insurers"]
                    if r["key"] == history.previous_insurer_key), None)
    if history.status == "had_previous_policy":
        if not (history.previous_insurer_key and insurer and history.previous_start_date_jalali
                and history.previous_expiry_date_jalali and history.previous_duration_months
                and history.no_claim_discount_percent is not None
                and history.driver_discount_percent is not None and history.had_claim is not None):
            return None, "needs_input", "شرکت، دو تاریخ شمسی، مدت قبلی، هر دو تخفیف و سابقهٔ خسارت لازم است"
        start = jalali_to_gregorian(history.previous_start_date_jalali)
        expiry = jalali_to_gregorian(history.previous_expiry_date_jalali)
        if start >= expiry:
            return None, "needs_input", "پایان بیمهٔ قبلی باید پس از شروع آن باشد"
        counts = (history.property_claim_count, history.bodily_claim_count, history.driver_claim_count)
        if history.had_claim and (any(n is None for n in counts) or not any(counts)):
            return None, "needs_input", "برای خسارت، تعداد هر سه نوع و دست‌کم یک خسارت لازم است"
        if not history.had_claim and any(n not in (None, 0) for n in counts):
            return None, "needs_input", "تعداد خسارت با گزینهٔ «بدون خسارت» سازگار نیست"
    elif history.status == "new_vehicle":
        if not history.first_use_date_jalali:
            return None, "needs_input", "تاریخ ترخیص خودرو به شمسی لازم است"
    if provider == "azki" and car[provider].get("imported"):
        return None, "needs_input", "عنوان سال ساخت مدل وارداتی برای درخواست ازکی لازم است"
    if request.vehicle.imported is True and provider == "azki":
        return None, "unmapped", "وضعیت وارداتی با کاتالوگ مدل ازکی ناسازگار است"
    if request.vehicle.fuel_type_key not in (None, "gasoline"):
        return None, "unmapped", "نوع سوخت انتخاب‌شده برای این درخواست تأیید نشده است"
    if provider == "sabim" and history.status != "had_previous_policy":
        return None, "needs_input", "سابیم حتی برای فاقد بیمه/خودروی نو دو تاریخ و شرکت قبلی را اجباری می‌داند؛ HTML مقدار معتبر این شاخه را ندارد"
    if provider == "sabim":
        sabim_year = next((r["id"] for r in opts["years"] if r["name"].endswith(f"-{year}")), None)
        duration = {12: "1", 9: "2", 8: "3", 6: "4", 4: "5", 3: "6", 2: "7"}.get(request.duration_months)
        cover = next((r["id"] for r in opts["coverages"]
                      if int(r["rial"]) == request.financial_coverage_toman * 10), None)
        if sabim_year is None or duration is None or cover is None:
            return None, "unmapped", "سال، مدت یا تعهد در کاتالوگ سابیم یافت نشد"
        discount = lambda key, percent: next((r["id"] for r in opts[key] if int(r["percent"]) == percent), None)
        third = discount("thirdDiscounts", history.no_claim_discount_percent)
        driver = discount("driverDiscounts", history.driver_discount_percent)
        if not third or not driver:
            return None, "unmapped", "تخفیف در کاتالوگ سابیم تطبیق ندارد"
        n = lambda v: str(min(v or 0, 3) + 1)
        p = car[provider]
        return {"command": "get_price", "thirdparty_lastcompany": insurer,
                "thirdparty_discnt_thirdparty_id": third, "thirdparty_discnt_driver_id": driver,
                "thirdparty_last_date_sart": start.isoformat(), "thirdparty_last_date_end": expiry.isoformat(),
                "thirdparty_usefor_id": p["thirdparty_usefor_id"], "thirdparty_time_id": duration,
                "thirdparty_coverage_id": cover,
                # The Sabim HTML form initializes this opaque option to false;
                # its precise label is not captured. Expose the limitation.
                "thirdparty_yadak": "false",
                "thirdparty_damage_driver_id": n(history.driver_claim_count),
                "thirdparty_damage_human_id": n(history.bodily_claim_count),
                "thirdparty_damage_financial_id": n(history.property_claim_count),
                "carmode_id": p["carmode_id"], "car_company_id": p["car_company_id"],
                "car_id": p["car_id"], "thirdparty_yearofcons_id": sabim_year,
                "transition": "false", "prev_damage": "darad" if history.had_claim else "nadarad"}, None, None
    if provider == "azki":
        cover = next((r for r in opts["covers"] if r["amount"] == request.financial_coverage_toman
                      and r["enable"]), None)
        duration = next((r for r in opts["durations"] if r["id"] == request.duration_months), None)
        if not cover or not duration or not 1300 <= year <= 1500:
            return None, "unmapped", "مدت یا سقف پوشش در کاتالوگ ازکی موجود نیست"
        p = {**car["azki"], "vehicleConstructionYear": str(year),
             "withoutInsure": str(history.status == "no_previous_policy").lower(),
             "zeroKilometer": str(history.status == "new_vehicle").lower(),
             "durationID": str(duration["id"]), "coverID": str(cover["id"]),
             "orig_cover_amount": str(cover["amount"])}
        if history.status == "new_vehicle":
            p.update(oldInsureExpireDate=history.first_use_date_jalali.replace("/", "-"), vehicleChangedOwner="0")
        elif history.status == "had_previous_policy":
            third = next((r["id"] for r in opts["thirdDiscounts"]
                          if r["title"] == ("صفر درصد" if history.no_claim_discount_percent == 0 else f"{history.no_claim_discount_percent} درصد")), None)
            driver = next((r["id"] for r in opts["driverDiscounts"]
                           if r["title"] == ("صفر درصد" if history.driver_discount_percent == 0 else f"{history.driver_discount_percent} درصد")), None)
            if not third or not driver:
                return None, "unmapped", "درصد تخفیف در کاتالوگ ازکی یافت نشد"
            p.update(oldInsureStartDate=history.previous_start_date_jalali.replace("/", "-"),
                     oldInsureExpireDate=history.previous_expiry_date_jalali.replace("/", "-"),
                     thirdDiscountID=str(third), driverDiscountID=str(driver), oldCompanyID=insurer,
                     oldInsureUsed="1" if history.had_claim else "0")
            if history.had_claim:
                for field, count in (("thirdLifeDamageID", history.bodily_claim_count),
                                     ("thirdFinancialDamageID", history.property_claim_count),
                                     ("driverLifeDamageID", history.driver_claim_count)):
                    p[field] = str(min(count, 3) + 1)
        return p, None, None
    if provider == "bimebazar":
        if year not in {r["value"] for r in opts["car_production_year_picker"]}:
            return None, "unmapped", "سال ساخت در ویزارد بیمه‌بازار موجود نیست"
        p = {**car["bimebazar"], "plk2": "1", "sb_id": "empty",
                "sanhab_submit_response_status": "regular", "has_plate_changed": "no_info_without_sb",
                "car_production_year": str(year), "policy_term": str(request.duration_months),
                "policy_status": {"no_previous_policy": "without", "new_vehicle": "new", "had_previous_policy": "other"}[history.status],
                "inquiry_type": "regular", "financial_coverage": str(request.financial_coverage_toman)}
        if history.status == "new_vehicle":
            p["last_policy_exp_date"] = history.first_use_date_jalali.replace("-", "/")
        if history.status == "had_previous_policy":
            p.update(previous_company=insurer, last_policy_start_date=history.previous_start_date_jalali.replace("-", "/"),
                     last_policy_exp_date=history.previous_expiry_date_jalali.replace("-", "/"),
                     has_ownership_change="false", no_damage_factor=str(history.no_claim_discount_percent / 100),
                     driver_no_damage_factor=str(history.driver_discount_percent / 100),
                     has_damage=str(history.had_claim).lower())
            if history.had_claim:
                p.update(property_damage_count=str(min(history.property_claim_count, 3)),
                         life_damage_count=str(min(history.bodily_claim_count, 3)),
                         driver_damage_count=str(min(history.driver_claim_count, 3)))
        return p, None, None
    if provider == "bimeh":
        if request.duration_months != 12:
            return None, "unmapped", "شناسهٔ مدت این دوره در درخواست بیمه‌دات‌کام تأیید نشده است"
        years = opts["ProductionYears"]
        matched = next((r for r in years if str(year) in r["Title"]), None)
        if not matched:
            return None, "unmapped", "سال ساخت در کاتالوگ بیمه‌دات‌کام نیست"
        body = {**car["bimeh"], "ProductionYearId": year + 621,
                "PreviousInsuranceStatusId": {"no_previous_policy": 1, "new_vehicle": 0, "had_previous_policy": 2}[history.status],
                "DurationId": 2, "isRenewal": False}
        body["ProductionYearId"] = matched["Id"]
        if history.status == "new_vehicle":
            body["ReleaseDate"] = jalali_to_gregorian(history.first_use_date_jalali).strftime("%Y/%-m/%-d")
        if history.status == "had_previous_policy":
            if history.previous_duration_months != 12:
                return None, "unmapped", "مدت بیمهٔ قبلی در بیمه‌دات‌کام فقط یک‌ساله نگاشت شده است"
            body.update(PreviousCompanyId=int(insurer), PreviousExpirationDate=expiry.isoformat(),
                        PreviousDurationId=1, ThirdPartyDiscountId=history.no_claim_discount_percent // 5,
                        DriverDiscountId=history.driver_discount_percent // 5,
                        LifeLossId=min(history.bodily_claim_count or 0, 3) + 1,
                        PropertyLossId=min(history.property_claim_count or 0, 3) + 1,
                        DriverLossId=min(history.driver_claim_count or 0, 3) + 1,
                        Damage=history.had_claim, ownershipChange=False)
            if (history.no_claim_discount_percent % 5 or history.driver_discount_percent % 5
                or body["ThirdPartyDiscountId"] not in {r["Id"] for r in opts["ThirdPartyDiscounts"]}
                or body["DriverDiscountId"] not in {r["Id"] for r in opts["DriverDiscounts"]}):
                return None, "unmapped", "درصد تخفیف در کاتالوگ بیمه‌دات‌کام نیست"
        body["InquiryUrl"] = "https://bimeh.com/thirdparty/planlist?" + urlencode(
            {k: v for k, v in body.items() if k not in ("isRenewal", "EncryptedPlaque")})
        return body, None, None
    raise ValueError("unknown provider")


async def _one(provider, request, car, fetched_at):
    params, status, message = _prepare(request, provider, car)
    if status:
        return ProviderResult(provider=provider, status=status, message=message)
    try:
        if provider == "azki":
            raw = await asyncio.wait_for(get_third_prices(params, request.product), timeout=35)
        elif provider == "bimebazar":
            raw = await asyncio.wait_for(get_offers(request.product, params), timeout=35)
        elif provider == "sabim":
            raw = await asyncio.wait_for(get_sabim_prices(request.product, params), timeout=35)
        else:
            raw = await asyncio.wait_for(get_prices(request.product, params), timeout=65)
    except Exception:
        # Do not expose upstream text: it can contain request data or secrets.
        return ProviderResult(provider=provider, status="unavailable",
                              message="ارتباط با این منبع یا دریافت پاسخ ناموفق بود")
    try:
        return normalize(provider, raw, fetched_at, request.product,
                         request.duration_months, request.financial_coverage_toman)
    except Exception:
        # A valid empty list is handled inside normalize; malformed JSON or
        # an unknown offer shape must never be presented as zero offers.
        return ProviderResult(provider=provider, status="invalid_response",
                              message="ساختار پیشنهادهای این منبع قابل پردازش نیست",
                              raw_response=raw if isinstance(raw, (dict, list)) else None)


@router.post("/api/search", response_model=SearchResult)
async def search(request: SearchInput = Body(discriminator="product")):
    now = datetime.now(timezone.utc)
    if request.product != "third_car":
        return SearchResult(request_id=str(uuid4()), product=request.product, fetched_at=now,
                            providers=[ProviderResult(provider=p, status="unsupported",
                                                      message="نگاشت این محصول در جست‌وجوی واحد هنوز تکمیل نشده است")
                                       for p in PROVIDERS])
    car = match_car(request.vehicle)
    if car is None:
        providers = [ProviderResult(provider=p, status="unmapped",
                                    message="ترکیب دسته، برند، مدل یا کاربری در کاتالوگ مشترک تأیید نشده است")
                     for p in PROVIDERS]
    else:
        providers = await asyncio.gather(*(_one(p, request, car, now) for p in PROVIDERS))
    return SearchResult(request_id=str(uuid4()), product=request.product,
                        fetched_at=now, providers=providers)


@router.get("/api/search/catalog")
def search_catalog():
    """Full union from labs, with each model's provider and local usages."""
    data = catalog()
    return {
        "models": [{"key": g["key"], "label": g["label"], "category_key": g["category_key"],
                    "brand_key": g["brand_key"], "category": "سواری", "provider": "چند منبع",
                    "usages": [{"key": "personal", "label": "شخصی"}],
                    "source_count": len(g["sources"])} for g in data["joined"]] + [
            {"key": m["key"], "label": m["label"],
                    "category_key": f'{m["provider"]}:{m["mapping"]["category"]}',
                    "brand_key": f'{m["provider"]}:{m["mapping"]["brand"]}',
                    "category": m["category"], "provider": m["provider"],
                    "usages": m["usages"]} for m in data["models"]] + [
            {"key": key, "label": row["label"], "category_key": row["category_key"],
             "brand_key": row["brand_key"], "usages": [{"key": row["usage_key"], "label": "شخصی"}],
             "category": "سواری", "provider": "چند منبع"}
            for key, row in CAR_MODELS.items()
        ],
        "production_years_jalali": data["years_jalali"],
        "insurers": [{"key": x["key"], "label": x["label"]} for x in data["insurers"]],
        "durations": [12, 9, 8, 6, 4, 3, 2],
        "coverages_toman": data["coverages_toman"],
        "third_car": {
            "duration_months": 12,
            "financial_coverage_toman": 70_000_000,
            "supported_previous_policy_status": "no_previous_policy",
        },
    }
