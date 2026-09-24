"""The three successful inquiry contracts captured in Bimeh.com HAR files."""

from urllib.parse import urlsplit

BASE_URL = "https://coreapi.bimeh.com"
PATHS = {
    "third_car": "/v1/insurance/third-party/inquiry",
    "body_car": "/v1/insurance/car-body/inquiry",
    "third_motor": "/v1/insurance/motor/inquiry",
}
COMPARE_PATHS = {
    "third_car": "/thirdparty/planlist",
    "body_car": "/carbody/planlist",
    "third_motor": "/thirdpartyMotor/planlist",
}
CAR = {"UsingTypeId", "VehicleCategoryId", "BrandId", "ModelId"}
HISTORY = {"PreviousCompanyId", "PreviousExpirationDate", "PreviousDurationId",
           "ThirdPartyDiscountId", "DriverDiscountId", "LifeLossId", "DriverLossId",
           "PropertyLossId", "Damage", "ownershipChange", "supplementDiscounts"}
COMMON = {"InquiryUrl", "isRenewal"}
ALLOWED = {
    "third_car": CAR | HISTORY | COMMON | {"ProductionYearId", "PreviousInsuranceStatusId",
              "ReleaseDate", "DurationId", "EncryptedPlaque"},
    "third_motor": HISTORY | COMMON | {"MotorTypeId", "ProductionYearId",
                   "PreviousInsuranceStatusId", "ReleaseDate", "DurationId"},
    "body_car": CAR | COMMON | {"hasInsurance", "CarBodyNoDamageYearId", "Imported",
                 "Price", "ProductionDate", "yearBuild", "monthBuild", "pYear", "pMonth",
                 "PreviousExpirationDate", "PreviousCompanyId", "ThirdPartyDiscountId",
                 "ThirdPartyCompanyId", "CoverageIds", "fromFilter"},
}
REQUIRED = {
    "third_car": CAR | COMMON | {"ProductionYearId", "PreviousInsuranceStatusId", "DurationId"},
    "third_motor": COMMON | {"MotorTypeId", "ProductionYearId", "PreviousInsuranceStatusId", "DurationId"},
    "body_car": CAR | COMMON | {"hasInsurance", "Imported", "Price", "ProductionDate",
                 "yearBuild", "monthBuild", "pYear", "pMonth", "ThirdPartyDiscountId",
                 "ThirdPartyCompanyId"},
}
BOOL_FIELDS = {"isRenewal", "hasInsurance", "Damage", "ownershipChange",
               "supplementDiscounts", "fromFilter"}
TEXT_FIELDS = {"InquiryUrl", "PreviousExpirationDate", "ReleaseDate", "ProductionDate"}


class InvalidBimehRequest(ValueError):
    pass


def validate_inquiry(product: str, body: object) -> dict:
    if product not in PATHS or not isinstance(body, dict) or len(body) > 35:
        raise InvalidBimehRequest("محصول یا بدنهٔ استعلام بیمه‌دات‌کام نامعتبر است")
    missing = REQUIRED[product] - body.keys()
    extra = body.keys() - ALLOWED[product]
    if missing or extra:
        raise InvalidBimehRequest("کلیدهای استعلام ناقص یا ناشناخته‌اند: " + ", ".join(sorted(missing | extra)))
    url = body["InquiryUrl"]
    if not isinstance(url, str) or len(url) > 12000:
        raise InvalidBimehRequest("لینک صفحهٔ مقایسه نامعتبر است")
    try:
        parsed = urlsplit(url)
        port = parsed.port
    except ValueError as exc:
        raise InvalidBimehRequest("لینک صفحهٔ مقایسه نامعتبر است") from exc
    if (parsed.scheme != "https" or parsed.hostname != "bimeh.com" or port is not None
            or parsed.username or parsed.password or parsed.path != COMPARE_PATHS[product]
            or not parsed.query or parsed.fragment):
        raise InvalidBimehRequest("لینک صفحهٔ مقایسه با محصول بیمه‌دات‌کام مطابقت ندارد")
    for key, value in body.items():
        if key in BOOL_FIELDS:
            valid = isinstance(value, bool)
        elif key in TEXT_FIELDS:
            valid = isinstance(value, str) and 0 < len(value) <= 12000 if key == "InquiryUrl" else isinstance(value, str) and 0 < len(value) <= 100
        elif key == "CoverageIds":
            valid = (isinstance(value, list) and len(value) <= 30 and
                     all(isinstance(v, int) and not isinstance(v, bool) for v in value))
        elif key == "EncryptedPlaque" or key in {"LifeLossId", "DriverLossId", "PropertyLossId",
                                                "CarBodyNoDamageYearId", "PreviousCompanyId"}:
            valid = value is None or isinstance(value, int) and not isinstance(value, bool)
        else:
            valid = isinstance(value, int) and not isinstance(value, bool)
        if not valid:
            raise InvalidBimehRequest("نوع مقدار «" + key + "» در استعلام نامعتبر است")
    if product == "body_car" and body["Price"] <= 0:
        raise InvalidBimehRequest("ارزش خودرو باید مثبت باشد")
    return body.copy()
