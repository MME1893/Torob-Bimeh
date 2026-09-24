"""One typed request; independent results and errors for all four providers."""

import asyncio
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Body

from ..adapters.errors import InvalidProviderResponse
from ..adapters.azki.client import get_third_prices
from ..adapters.bimebazar.client import get_offers
from ..adapters.bimeh.client import get_prices
from ..domain.crosswalk import CAR_MODELS, catalog
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
    return preview(request)


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
