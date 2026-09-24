"""Allow only Bimebazar offer endpoints and parameters built by its HTML lab."""

from collections.abc import Mapping
from urllib.parse import parse_qsl, urlsplit

HOST = "bimebazar.com"
OFFER_PATHS = {
    "third_car": "/thirdparty/api/offers/",
    "third_motor": "/thirdpartymotor/api/offers/",
    "body_car": "/carbody/api/offers/",
}
THIRD_CAR_REQUIRED = {
    "plk2", "sb_id", "sanhab_submit_response_status", "has_plate_changed",
    "car_production_year", "vehicle_type", "policy_term", "policy_status",
    "inquiry_type", "car_usage", "car_brand", "financial_coverage",
}
THIRD_MOTOR_REQUIRED = {
    "car_brand", "car_production_year", "policy_status", "policy_term",
    "financial_coverage",
}
BODY_CAR_REQUIRED = {
    "plk2", "sb_id", "sanhab_submit_response_status", "has_plate_changed",
    "car_production_year", "car_brand", "car_usage", "discount_third_party",
    "inquiry_type", "car_production_month", "has_previous_policy", "car_is_new",
    "car_value", "car_accessories_value",
}
THIRD_OPTIONAL = {
    "car_model", "last_policy_exp_date", "previous_company",
    "last_policy_start_date", "has_ownership_change", "change_ownership_status",
    "no_damage_factor", "driver_no_damage_factor", "has_damage",
    "property_damage_count", "life_damage_count", "driver_damage_count",
    "discount_code", "dis_plk1", "dis_plk2", "dis_plk3", "dis_plkSrl",
    "dis_national_id", "transferor_owner_relationship", "sb_id_pre",
}
BODY_OPTIONAL = {
    "car_model", "previous_company", "last_policy_exp_date",
    "years_without_incident", "discount_code",
    "cover_theft_of_parts_key", "cover_price_fluctuation_key",
    "cover_chemical", "cover_glass_break", "cover_natural_disasters",
    "cover_transportation", "cover_war_damages", "cover_scratch",
    "cover_without_franchise", "cover_depreciation_cost", "cover_price_drop",
}
REQUIRED = {
    "third_car": THIRD_CAR_REQUIRED,
    "third_motor": THIRD_MOTOR_REQUIRED,
    "body_car": BODY_CAR_REQUIRED,
}
ALLOWED = {
    "third_car": THIRD_CAR_REQUIRED | THIRD_OPTIONAL,
    "third_motor": THIRD_MOTOR_REQUIRED | (THIRD_OPTIONAL - {
        "car_model", "dis_plk1", "dis_plk2", "dis_plk3", "dis_plkSrl",
        "dis_national_id", "transferor_owner_relationship", "sb_id_pre",
    }),
    "body_car": BODY_CAR_REQUIRED | BODY_OPTIONAL,
}


class InvalidOfferRequest(ValueError):
    pass


def offer_params_from_url(url: str, product: str) -> dict[str, str]:
    if product not in OFFER_PATHS or not isinstance(url, str):
        raise InvalidOfferRequest("محصول یا URL پیشنهاد بیمه‌بازار نامعتبر است")
    try:
        parsed = urlsplit(url)
        port = parsed.port
    except ValueError as exc:
        raise InvalidOfferRequest("ساختار URL پیشنهاد نامعتبر است") from exc
    if (parsed.scheme != "https" or parsed.hostname != HOST or port is not None
            or parsed.username is not None or parsed.password is not None
            or parsed.path != OFFER_PATHS[product] or parsed.fragment):
        raise InvalidOfferRequest("فقط URL درخواست پیشنهاد همین محصول در بیمه‌بازار پذیرفته می‌شود")
    if not parsed.query or len(parsed.query) > 10000:
        raise InvalidOfferRequest("Query درخواست پیشنهاد خالی یا بیش از حد طولانی است")
    try:
        pairs = parse_qsl(parsed.query, keep_blank_values=True, strict_parsing=True)
    except ValueError as exc:
        raise InvalidOfferRequest("Query درخواست پیشنهاد نامعتبر است") from exc
    if len(pairs) != len({key for key, _ in pairs}):
        raise InvalidOfferRequest("کلید تکراری در Query پیشنهاد وجود دارد")
    return validate_offer_params(dict(pairs), product)


def validate_offer_params(params: Mapping[str, object], product: str) -> dict[str, str]:
    if product not in OFFER_PATHS or not isinstance(params, Mapping) or len(params) > 50:
        raise InvalidOfferRequest("محصول یا پارامترهای پیشنهاد نامعتبرند")
    missing = REQUIRED[product] - params.keys()
    unknown = params.keys() - ALLOWED[product]
    if missing or unknown:
        raise InvalidOfferRequest("کلیدهای پیشنهاد ناقص یا ناشناخته‌اند: " +
                                  ", ".join(sorted(missing | unknown)))
    clean = {}
    for key, value in params.items():
        if (not isinstance(key, str) or not isinstance(value, (str, int, bool))
                or isinstance(value, bool) and key != "has_previous_policy"):
            raise InvalidOfferRequest("مقدار یکی از پارامترهای پیشنهاد نامعتبر است")
        text = str(value).lower() if isinstance(value, bool) else str(value)
        if not text or len(text) > 256 or any(ord(char) < 32 for char in text):
            raise InvalidOfferRequest("مقدار یکی از پارامترهای پیشنهاد خالی یا طولانی است")
        clean[key] = text
    if product == "body_car":
        for key in ("car_value", "car_accessories_value"):
            if not clean[key].isascii() or not clean[key].isdecimal():
                raise InvalidOfferRequest("ارزش خودرو یا لوازم باید عددی باشد")
        if int(clean["car_value"]) <= 0:
            raise InvalidOfferRequest("ارزش خودرو باید مثبت باشد")
    elif not clean["financial_coverage"].isascii() or not clean["financial_coverage"].isdecimal():
        raise InvalidOfferRequest("پوشش مالی باید عددی باشد")
    return clean
