"""One typed request; independent results and errors for all four providers."""

import asyncio
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Body

from ..adapters.errors import InvalidProviderResponse
from ..adapters.azki.client import get_third_prices
from ..adapters.bimebazar.client import get_offers
from ..adapters.bimeh.client import get_prices
from ..domain.crosswalk import catalog, public_models
from ..domain.third_mapping import prepare as _prepare, preview, resolve_car
from ..adapters.sabim.client import get_prices as get_sabim_prices
from ..domain.normalizers import normalize
from ..domain.quotes import ProviderResult, SearchInput, SearchResult, ThirdCarSearch

router = APIRouter(tags=["search"])
PROVIDERS = ("azki", "sabim", "bimebazar", "bimeh")


async def _one(provider, request, car, fetched_at):
    try:
        params, status, message = _prepare(request, provider, car)
    except Exception:
        return ProviderResult(provider=provider, status="unmapped",
                              message="ساخت درخواست این منبع با کاتالوگ موجود ناموفق بود")
    if status:
        public_message = ("بخشی از اطلاعات لازم برای این پیشنهاد کامل نیست" if status == "needs_input"
                          else "این منبع برای مشخصات انتخاب‌شده در دسترس نیست")
        return ProviderResult(provider=provider, status=status, message=public_message)
    try:
        if provider == "azki":
            raw = await asyncio.wait_for(get_third_prices(params, request.product), timeout=35)
        elif provider == "bimebazar":
            raw = await asyncio.wait_for(get_offers(request.product, params), timeout=35)
        elif provider == "sabim":
            raw = await asyncio.wait_for(get_sabim_prices(request.product, params), timeout=35)
        else:
            raw = await asyncio.wait_for(get_prices(request.product, params), timeout=65)
    except InvalidProviderResponse as error:
        return ProviderResult(provider=provider, status="invalid_response",
                              message="پاسخ منبع قابل پردازش نیست", raw_response=error.raw_response)
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
    car = resolve_car(request)
    if not car:
        providers = [ProviderResult(provider=p, status="unmapped",
                                    message="ترکیب دسته، برند، مدل یا کاربری در کاتالوگ مشترک تأیید نشده است")
                     for p in PROVIDERS]
    else:
        providers = await asyncio.gather(*(_one(p, request, car, now) for p in PROVIDERS))
    return SearchResult(request_id=str(uuid4()), product=request.product,
                        fetched_at=now, providers=providers)


@router.post("/api/search/preview")
def search_preview(request: ThirdCarSearch):
    # This endpoint is called by the product UI. Provider IDs, URLs and payloads
    # belong to the server-side integration and must not leak into the form.
    return {"providers": [{"provider": row["provider"], "status": row["status"]}
                          for row in preview(request)["providers"]]}


@router.get("/api/search/catalog")
def search_catalog():
    """Product-facing catalog; provider IDs and crosswalks stay server-side."""
    data = catalog()
    # A single insurer choice is reused for every provider.  Do not offer a
    # choice unless the committed lab catalogues provide an ID for all four;
    # otherwise the exact same form becomes `needs_input` for one source.
    common_insurers = [x for x in data["insurers"]
                       if all(provider in x["providers"] for provider in PROVIDERS)]
    return {
        "models": [{key: value for key, value in model.items()
                    if key not in {"sources", "providers", "source_count"}}
                   for model in public_models()],
        "production_years_jalali": data["years_jalali"],
        "insurers": [{"key": x["key"], "label": x["label"]} for x in common_insurers],
        "durations": [12, 9, 8, 6, 4, 3, 2, 1],
        "discounts": sorted({int(r["percent"]) for r in data["options"]["sabim"]["thirdDiscounts"] if int(r["percent"]) >= 0}),
        "fuels": [{"key": str(r["id"]), "label": r["title"]} for r in data["options"]["azki"]["fuelTypes"]],
        "source_options": data["options"],
        "coverages_toman": data["coverages_toman"],
        "third_car": {
            "duration_months": 12,
            "financial_coverage_toman": 70_000_000,
            "supported_previous_policy_statuses": ["no_previous_policy", "had_previous_policy", "new_vehicle"],
        },
    }
