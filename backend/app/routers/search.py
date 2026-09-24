"""One typed request; independent results and errors for all four providers."""

import asyncio
from datetime import datetime, timezone
from uuid import uuid4
from urllib.parse import urlencode

from fastapi import APIRouter, Body

from ..adapters.azki.client import get_third_prices
from ..adapters.bimebazar.client import get_offers
from ..adapters.bimeh.client import get_prices
from ..domain.crosswalk import CAR_MODELS, match_car
from ..domain.normalizers import normalize
from ..domain.quotes import ProviderResult, SearchInput, SearchResult, ThirdCarSearch

router = APIRouter(tags=["search"])
PROVIDERS = ("azki", "sabim", "bimebazar", "bimeh")


def _prepare(request: ThirdCarSearch, provider: str, car: dict):
    """Construct only the audited no-previous-policy, 12-month car scenario."""
    if request.previous_policy.status != "no_previous_policy":
        return None, "needs_input", "تبدیل سابقهٔ بیمه و تخفیف برای این منبع هنوز تأیید نشده است"
    if any(value not in (None, False, 0) for value in
           request.previous_policy.model_dump(exclude={"status"}).values()):
        return None, "needs_input", "اطلاعات بیمهٔ قبلی با وضعیت «بدون بیمهٔ قبلی» سازگار نیست"
    if request.vehicle.imported is True or request.vehicle.fuel_type_key not in (None, "gasoline"):
        return None, "unmapped", "نگاشت خودروی وارداتی یا سوخت انتخاب‌شده تأیید نشده است"
    if request.duration_months != 12 or request.financial_coverage_toman != 70_000_000:
        return None, "unmapped", "فعلاً فقط دورهٔ یک‌ساله و پوشش مالی ۷۰ میلیون تومان نگاشت شده است"
    year = request.vehicle.production_year_jalali
    if not 1390 <= year <= 1405:
        return None, "unmapped", "سال ساخت در کاتالوگ این سناریو تأیید نشده است"
    if provider == "sabim":
        return None, "needs_input", "سابیم تاریخ شروع و پایان بیمهٔ قبلی می‌خواهد؛ برای خودروی بدون بیمه مقدار آن تأیید نشده است"
    if provider == "azki":
        return {**car["azki"], "vehicleConstructionYear": str(year),
                "withoutInsure": "true", "zeroKilometer": "false", "durationID": "12",
                "coverID": "47", "orig_cover_amount": "70000000"}, None, None
    if provider == "bimebazar":
        return {**car["bimebazar"], "plk2": "1", "sb_id": "empty",
                "sanhab_submit_response_status": "regular", "has_plate_changed": "no_info_without_sb",
                "car_production_year": str(year), "policy_term": "12", "policy_status": "without",
                "inquiry_type": "regular", "financial_coverage": "70000000"}, None, None
    if provider == "bimeh":
        body = {**car["bimeh"], "ProductionYearId": year + 621,
                "PreviousInsuranceStatusId": 1, "DurationId": 2, "isRenewal": False}
        body["InquiryUrl"] = "https://bimeh.com/thirdparty/planlist?" + urlencode(
            {k: v for k, v in body.items() if k != "isRenewal"})
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
                              message="ساختار پیشنهادهای این منبع قابل پردازش نیست")


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
    """Only choices with an explicit crosswalk appear in the first car form."""
    return {
        "models": [
            {"key": key, "label": row["label"], "category_key": row["category_key"],
             "brand_key": row["brand_key"], "usage_key": row["usage_key"]}
            for key, row in CAR_MODELS.items()
        ],
        "production_years_jalali": list(range(1405, 1389, -1)),
        "third_car": {
            "duration_months": 12,
            "financial_coverage_toman": 70_000_000,
            "supported_previous_policy_status": "no_previous_policy",
        },
    }
