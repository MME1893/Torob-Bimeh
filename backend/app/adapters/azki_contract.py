"""Azki third-party request URL and header contract.

Only the fixed Azki host/path may be called. Authorization stays server-side.
"""

import os
from typing import Mapping
from urllib.parse import parse_qsl, urlsplit

AZKI_HOST = "www.azki.com"
THIRD_PATH = "/api/aggregator/v1/third/prices/compare"
COMPARE_PATHS = {
    "third_car": "/car-insurance/third-party-insurance/compare",
    "third_motor": "/motorcycle-insurance/compare",
}
REQUIRED = {
    "vehicleTypeID", "vehicleModelID", "vehicleBrandID",
    "vehicleConstructionYear", "vehicleUsageID", "withoutInsure",
    "zeroKilometer", "durationID", "coverID", "orig_cover_amount",
}


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

