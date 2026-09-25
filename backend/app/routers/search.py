"""One typed request; independent results and errors for all four providers."""

import asyncio
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Body

from ..adapters.errors import InvalidProviderResponse
from ..adapters.azki.client import get_body_prices, get_third_prices
from ..adapters.bimebazar.client import get_offers
from ..adapters.bimeh.client import get_prices
from ..domain.crosswalk import catalog, public_body_models, public_models
from ..domain.body_mapping import prepare as _prepare_body, preview as body_preview, resolve_body_car
from ..domain.third_mapping import prepare as _prepare, preview, resolve_car
from ..domain.motor_mapping import prepare as _prepare_motor, preview as motor_preview, resolve_motor
from ..adapters.sabim.client import get_prices as get_sabim_prices
from ..domain.normalizers import normalize
from ..domain.quotes import (BodyCarSearch, ProviderResult, SearchInput, SearchResult,
                             ThirdCarSearch, ThirdMotorSearch)

router = APIRouter(tags=["search"])
PROVIDERS = ("azki", "sabim", "bimebazar", "bimeh")


async def _one(provider, request, car, fetched_at):
    try:
        builder = (_prepare_body if request.product == "body_car" else
                   _prepare_motor if request.product == "third_motor" else _prepare)
        params, status, message = builder(request, provider, car)
    except Exception:
        return ProviderResult(provider=provider, status="unmapped",
                              message="ساخت درخواست این منبع با کاتالوگ موجود ناموفق بود")
    if status:
        public_message = ("بخشی از اطلاعات لازم برای این پیشنهاد کامل نیست" if status == "needs_input"
                          else "این منبع برای مشخصات انتخاب‌شده در دسترس نیست")
        return ProviderResult(provider=provider, status=status, message=public_message)
    try:
        if provider == "azki":
            call = get_body_prices(params) if request.product == "body_car" else get_third_prices(params, request.product)
            raw = await asyncio.wait_for(call, timeout=35)
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
                         request.duration_months,
                         request.financial_coverage_toman if request.product.startswith("third_") else None)
    except Exception:
        # A valid empty list is handled inside normalize; malformed JSON or
        # an unknown offer shape must never be presented as zero offers.
        return ProviderResult(provider=provider, status="invalid_response",
                              message="ساختار پیشنهادهای این منبع قابل پردازش نیست",
                              raw_response=raw if isinstance(raw, (dict, list)) else None)


@router.post("/api/search", response_model=SearchResult)
async def search(request: SearchInput = Body(discriminator="product")):
    now = datetime.now(timezone.utc)
    car = (resolve_body_car(request) if request.product == "body_car" else
           resolve_motor(request) if request.product == "third_motor" else resolve_car(request))
    if not car:
        providers = [ProviderResult(provider=p, status="unmapped",
                                    message="مشخصات وسیلهٔ نقلیه در کاتالوگ این محصول تأیید نشده است")
                     for p in PROVIDERS]
    else:
        providers = await asyncio.gather(*(_one(p, request, car, now) for p in PROVIDERS))
    return SearchResult(request_id=str(uuid4()), product=request.product,
                        fetched_at=now, providers=providers)


@router.post("/api/search/preview")
def search_preview(request: ThirdCarSearch | ThirdMotorSearch | BodyCarSearch = Body(discriminator="product")):
    # This endpoint is called by the product UI. Provider IDs, URLs and payloads
    # belong to the server-side integration and must not leak into the form.
    result = (body_preview(request) if request.product == "body_car" else
              motor_preview(request) if request.product == "third_motor" else preview(request))
    return {"providers": [{"provider": row["provider"], "status": row["status"]}
                           for row in result["providers"]]}


@router.get("/api/search/catalog")
def search_catalog():
    """Product-facing catalog; provider IDs and crosswalks stay server-side."""
    data = catalog()
    # A single insurer choice is reused for every provider.  Do not offer a
    # choice unless the committed lab catalogues provide an ID for all four;
    # otherwise the exact same form becomes `needs_input` for one source.
    common_insurers = [x for x in data["insurers"]
                       if all(provider in x["providers"] for provider in PROVIDERS)]
    common_motor_insurers = [x for x in data["motor_insurers"]
                             if all(provider in x["providers"] for provider in PROVIDERS)]
    motor_pricing = data["motor_options"]["bimebazar"]["pricing"]
    motor_coverages = sorted({int(motor_pricing["initialCoverage"]),
                              *(int(value) for value in motor_pricing["coverages"])})
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
        "third_motor": {
            "motor_types": [{key: value for key, value in row.items() if key != "mapping"}
                            for row in data["motor_types"]],
            "production_years_jalali": data["motor_years_jalali"],
            "insurers": [{"key": row["key"], "label": row["label"]}
                         for row in common_motor_insurers],
            "durations": [12, 9, 6, 4, 3, 2, 1],
            "discounts": sorted({int(row["percent"])
                                 for row in data["motor_options"]["sabim"]["thirdDiscounts"]
                                 if int(row["percent"]) >= 0}),
            "coverages_toman": motor_coverages,
            "duration_months": 12,
            "financial_coverage_toman": 70_000_000,
            "supported_previous_policy_statuses": [
                "no_previous_policy", "had_previous_policy", "new_vehicle"
            ],
        },
        "body_car": {
            "models": [{key: value for key, value in model.items()
                        if key not in {"sources"}}
                       for model in public_body_models()],
            "provider_models": [{key: value for key, value in model.items()
                                 if key not in {"mapping"}}
                                for model in data["body_models"]],
            "insurers": [{"key": x["key"], "label": x["label"]}
                         for x in data["body_insurers"]
                         if all(provider in x["providers"] for provider in PROVIDERS)],
            "months": list(range(1, 13)),
            "claim_free_years": list(range(0, 9)),
            "third_party_discounts": list(range(0, 71, 5)),
            "coverages": [
                {"key": "glass_break", "label": "شکست شیشه"},
                {"key": "acid_chemical", "label": "پاشیدن مواد شیمیایی و اسیدی"},
                {"key": "war", "label": "خسارت ناشی از جنگ"},
                {"key": "natural_disaster", "label": "بلایای طبیعی"},
                {"key": "transportation", "label": "ایاب و ذهاب"},
                {"key": "franchise_removal", "label": "حذف فرانشیز"},
                {"key": "unconventional_vehicle", "label": "خودروی نامتعارف"},
                {"key": "scratch", "label": "خراش با اجسام تیز"},
                {"key": "price_drop", "label": "افت قیمت"},
                {"key": "depreciation_removal", "label": "حذف استهلاک"},
            ],
            "provinces": data["body_options"]["azki"]["provinces_cities"],
            "accessory_categories": data["body_options"]["azki"]["non_factory_accessory_categories"],
            "sabim": {key: data["body_options"]["sabim"][key] for key in (
                "bodyLifeDiscounts", "bodyOtherDiscounts", "bodyBankDiscounts")},
        },
    }
