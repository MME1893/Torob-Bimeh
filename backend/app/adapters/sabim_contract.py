"""Fixed Sabim POST endpoints and the query contract captured in the HTML lab."""

from datetime import date
from typing import Mapping

BASE_URL = "https://api.sabim.com"
PATHS = {
    "third_car": "/api/price_thirdparty",
    "third_motor": "/api/price_thirdparty",
    "body_car": "/api/price_bodycar",
}
THIRD_KEYS = {
    "command", "thirdparty_lastcompany", "thirdparty_discnt_thirdparty_id",
    "thirdparty_discnt_driver_id", "thirdparty_last_date_sart",
    "thirdparty_last_date_end", "thirdparty_usefor_id", "thirdparty_time_id",
    "thirdparty_coverage_id", "thirdparty_yadak", "thirdparty_damage_driver_id",
    "thirdparty_damage_human_id", "thirdparty_damage_financial_id",
    "carmode_id", "car_company_id", "car_id", "thirdparty_yearofcons_id",
    "transition", "prev_damage",
}
BODY_KEYS = {
    "command", "bodycar_discnt_id", "bodycar_discnt_thirdparty_id", "car_id",
    "bodycar_usefor_id", "bodycar_last_company_id", "bodycar_discnt_life_id",
    "bodycar_discnt_another_id", "bodycar_discnt_accbank_id", "bodycar_price",
    "carmode_id", "bodycar_time_id", "bodycar_cash", "car_company_id",
    "bodycar_yearofcons_id", "bodycar_prev", "bodycar_not_used",
    "body_car_import", "bodycar_coverage_id[]",
}


class InvalidSabimRequest(ValueError):
    pass


def validate_query(product: str, query: Mapping[str, object]) -> list[tuple[str, str]]:
    """Return ordered pairs, preserving repeated bodycar_coverage_id[] values."""
    if product not in PATHS or not isinstance(query, Mapping):
        raise InvalidSabimRequest("محصول یا Query سابیم نامعتبر است")
    required = THIRD_KEYS if product.startswith("third_") else BODY_KEYS
    if set(query) != required:
        raise InvalidSabimRequest("کلیدهای Query سابیم ناقص یا ناشناخته‌اند: " +
                                  ", ".join(sorted(set(query) ^ required)))
    pairs: list[tuple[str, str]] = []
    for key, value in query.items():
        if key == "bodycar_coverage_id[]":
            if (not isinstance(value, list) or len(value) > 9 or
                    any(not isinstance(item, str) or not item.isascii() or
                        not item.isdecimal() or len(item) > 12 for item in value) or
                    len(value) != len(set(value))):
                raise InvalidSabimRequest("شناسه‌های پوشش بدنه نامعتبرند")
            pairs.extend((key, item) for item in value)
        elif not isinstance(value, str) or len(value) > 100 or (not value and key != "bodycar_last_company_id"):
            raise InvalidSabimRequest("مقدار Query سابیم نامعتبر است: " + key)
        else:
            pairs.append((key, value))
    if query["command"] != "get_price":
        raise InvalidSabimRequest("دستور سابیم باید get_price باشد")
    mode = query["carmode_id"]
    if (product == "third_motor" and mode != "4" or
            product == "third_car" and mode not in {"1", "2", "3"} or
            product == "body_car" and mode != "1"):
        raise InvalidSabimRequest("نوع وسیله با مسیر قیمت سابیم سازگار نیست")
    if product == "body_car":
        if not query["bodycar_usefor_id"]:
            raise InvalidSabimRequest("کاربری بدنهٔ خودرو الزامی است")
        try:
            if int(query["bodycar_price"]) <= 0:
                raise ValueError
        except (ValueError, TypeError) as exc:
            raise InvalidSabimRequest("ارزش خودرو باید عدد مثبت باشد") from exc
    else:
        try:
            start = date.fromisoformat(query["thirdparty_last_date_sart"])
            end = date.fromisoformat(query["thirdparty_last_date_end"])
        except ValueError as exc:
            raise InvalidSabimRequest("تاریخ‌های بیمهٔ قبلی باید میلادی و معتبر باشند") from exc
        if end < start:
            raise InvalidSabimRequest("پایان بیمهٔ قبلی پیش از آغاز آن است")
        if query["prev_damage"] not in {"darad", "nadarad"}:
            raise InvalidSabimRequest("وضعیت خسارت قبلی نامعتبر است")
    return pairs
