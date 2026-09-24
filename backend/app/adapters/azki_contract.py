"""Azki car and motorcycle third-party GET and car-body POST contracts.

Only the fixed Azki host/path may be called. Authorization stays server-side.
"""

import os
import re
from datetime import date
from typing import Mapping
from urllib.parse import parse_qsl, urlsplit

AZKI_HOST = "www.azki.com"
THIRD_PATH = "/api/aggregator/v1/third/prices/compare"
BODY_PATH = "/api/aggregator/v1/body/prices/compare"
COMPARE_PATHS = {
    "third_car": "/car-insurance/third-party-insurance/compare",
    "third_motor": "/motorcycle-insurance/compare",
    "body_car": "/car-insurance/car-body-insurance/compare",
}
REQUIRED = {
    "vehicleTypeID", "vehicleModelID", "vehicleBrandID",
    "vehicleConstructionYear", "vehicleUsageID", "withoutInsure",
    "zeroKilometer", "durationID", "coverID", "orig_cover_amount",
}
BODY_FLAGS = {
    "acidicSpray", "war", "glassBreak", "naturalDisaster", "transportation",
    "franchiseRemoval", "unconventionalVehicle", "nail", "valueSubsidence",
    "depreciationRemoval", "zeroKilometer", "imported", "installment",
}
BODY_INTEGERS = {
    "vehicleTypeID", "vehicleModelID", "vehicleBrandID", "vehicleConstructionYear",
    "vehiclePrice", "accessoryPrice", "vehicleUsageID", "fuelTypeID",
    "bodyDiscountID", "provinceId", "cityId", "regionId", "thirdCompanyID",
    "thirdDiscountID", "oldCompanyID", "accessoryRobberyCoverID",
    "marketFluctuateCoverID",
}
BODY_OPTIONAL = {
    "clearanceDate", "oldInsureExpireDate", "fromEditModal", "accessories",
}
BODY_REQUIRED = (BODY_FLAGS | BODY_INTEGERS) - {
    "regionId", "thirdCompanyID", "thirdDiscountID", "oldCompanyID",
    "accessoryRobberyCoverID", "marketFluctuateCoverID",
} | {"locationSource"}


class InvalidPriceRequest(ValueError):
    pass


def price_params_from_url(url: str) -> dict[str, str]:
    try:
        parsed = urlsplit(url)
        port = parsed.port
    except ValueError as exc:
        raise InvalidPriceRequest("ساختار URL قیمت نامعتبر است") from exc
    if (parsed.scheme != "https" or parsed.hostname != AZKI_HOST
            or port is not None or parsed.username is not None
            or parsed.password is not None or parsed.path != THIRD_PATH
            or parsed.fragment):
        raise InvalidPriceRequest("فقط URL درخواست قیمت ثالث ازکی پذیرفته می‌شود")
    if not parsed.query or len(parsed.query) > 10000:
        raise InvalidPriceRequest("پارامترهای قیمت خالی یا بیش از حد طولانی است")
    try:
        pairs = parse_qsl(parsed.query, keep_blank_values=True, strict_parsing=True)
    except ValueError as exc:
        raise InvalidPriceRequest("پارامترهای URL قیمت نامعتبر است") from exc
    if len(pairs) != len({key for key, _ in pairs}):
        raise InvalidPriceRequest("پارامتر تکراری در URL قیمت وجود دارد")
    return validate_price_params(dict(pairs))


def validate_price_params(params: Mapping[str, object]) -> dict[str, str]:
    if not isinstance(params, Mapping):
        raise InvalidPriceRequest("پارامترهای قیمت باید یک شیء JSON باشند")
    clean = {}
    for key, value in params.items():
        if not isinstance(key, str) or not key or value is None or isinstance(value, (list, dict)):
            raise InvalidPriceRequest("نام یا مقدار پارامتر قیمت نامعتبر است")
        text = str(value).lower() if isinstance(value, bool) else str(value)
        if not text or len(text) > 512:
            raise InvalidPriceRequest("مقدار یکی از پارامترهای قیمت خالی یا طولانی است")
        clean[key] = text
    missing = REQUIRED - clean.keys()
    if missing:
        raise InvalidPriceRequest("پارامترهای الزامی قیمت ناقص است: " + ", ".join(sorted(missing)))
    return clean


def validate_body_payload(payload: Mapping[str, object]) -> dict[str, object]:
    """Keep the numeric/boolean JSON types captured in the body-price HAR."""
    if not isinstance(payload, Mapping) or len(payload) > 50:
        raise InvalidPriceRequest("بدنهٔ درخواست قیمت بدنه نامعتبر است")
    unknown = payload.keys() - (BODY_FLAGS | BODY_INTEGERS | BODY_OPTIONAL | {"locationSource"})
    missing = BODY_REQUIRED - payload.keys()
    if unknown or missing:
        raise InvalidPriceRequest("کلیدهای درخواست بدنه نامعتبر یا ناقص است: " + ", ".join(sorted(unknown | missing)))
    for key in BODY_FLAGS | {"fromEditModal"}:
        if key in payload and type(payload[key]) is not bool:
            raise InvalidPriceRequest("فلگ درخواست بدنه باید boolean باشد: " + key)
    for key in BODY_INTEGERS:
        if key in payload and (type(payload[key]) is not int or payload[key] < 0):
            raise InvalidPriceRequest("شناسه یا مبلغ درخواست بدنه باید عدد صحیح نامنفی باشد: " + key)
    if any(payload[key] <= 0 for key in ("vehiclePrice", "vehicleTypeID", "vehicleModelID", "vehicleBrandID", "bodyDiscountID")):
        raise InvalidPriceRequest("ارزش خودرو و شناسه‌های اصلی باید مثبت باشند")
    if not isinstance(payload["locationSource"], str) or not 0 < len(payload["locationSource"]) <= 100:
        raise InvalidPriceRequest("منبع مکان نامعتبر است")
    if ("thirdCompanyID" in payload) != ("thirdDiscountID" in payload):
        raise InvalidPriceRequest("شرکت و تخفیف ثالث قبلی باید با هم ارسال شوند")
    if ("oldCompanyID" in payload) != ("oldInsureExpireDate" in payload):
        raise InvalidPriceRequest("شرکت بدنه و تاریخ انقضای قبلی باید با هم ارسال شوند")
    if payload["zeroKilometer"] and "clearanceDate" not in payload:
        raise InvalidPriceRequest("تاریخ ترخیص خودرو صفرکیلومتر لازم است")
    for key in ("clearanceDate", "oldInsureExpireDate"):
        if key in payload and (not isinstance(payload[key], str) or
                               not re.fullmatch(r"\d{4}-\d{2}-\d{2}", payload[key])):
            raise InvalidPriceRequest("تاریخ درخواست بدنه باید میلادی با قالب YYYY-MM-DD باشد")
        if key in payload:
            try:
                date.fromisoformat(payload[key])
            except ValueError as exc:
                raise InvalidPriceRequest("تاریخ درخواست بدنه معتبر نیست") from exc
    if "accessories" in payload:
        items = payload["accessories"]
        if (not isinstance(items, list) or len(items) > 30 or
                any(not isinstance(item, dict) or set(item) != {"categoryId", "items", "price"} or
                    type(item["categoryId"]) is not int or
                    type(item["price"]) is not int or item["price"] <= 0 or
                    not isinstance(item["items"], list) or not 0 < len(item["items"]) <= 100 or
                    any(type(i) is not int for i in item["items"]) for item in items)):
            raise InvalidPriceRequest("لوازم غیرفابریک ساختار معتبر ندارند")
        if sum(item["price"] for item in items) != payload["accessoryPrice"]:
            raise InvalidPriceRequest("جمع ارزش لوازم با accessoryPrice یکسان نیست")
    elif payload["accessoryPrice"] != 0:
        raise InvalidPriceRequest("برای ارزش لوازم، فهرست accessories لازم است")
    return dict(payload)


def make_headers(product: str) -> dict[str, str]:
    if product not in COMPARE_PATHS:
        raise InvalidPriceRequest("محصول ثالث ناشناخته است")
    headers = {
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "fa-IR,fa;q=0.9",
        "Origin": "https://www.azki.com",
        "Referer": "https://www.azki.com" + COMPARE_PATHS[product],
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:155.0) Gecko/20100101 Firefox/155.0",
        "X-Locale": "fa",
        "X-Domain": AZKI_HOST,
        "Device": "web",
        "Request": "web",
        "Deviceid": os.getenv("AZKI_DEVICE_ID", "6"),
    }
    authorization = os.getenv("AZKI_AUTHORIZATION", "").strip()
    if authorization:
        headers["Authorization"] = authorization
    baggage = os.getenv("AZKI_BAGGAGE", "").strip()
    if baggage:
        headers["Baggage"] = baggage
    return headers
