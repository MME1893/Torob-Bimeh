"""Version 1 contracts for one form and comparable provider results.

These models are deliberately separate from the existing provider lab routes.
Provider ID crosswalks and output parsers must be verified before exposing an
aggregate search endpoint. No inferred price unit is silently converted here.
"""

from datetime import date, datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, model_validator

from .pricing import to_toman

Product = Literal["third_car", "body_car", "third_motor"]
Provider = Literal["azki", "sabim", "bimebazar", "bimeh"]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CarVehicle(Contract):
    category_key: str = Field(min_length=1)
    brand_key: str = Field(min_length=1)
    model_key: str = Field(min_length=1)
    usage_key: str = Field(min_length=1)
    production_year_jalali: int = Field(ge=1300, le=1500)
    production_month_jalali: int | None = Field(default=None, ge=1, le=12)
    imported: bool | None = None
    fuel_type_key: str | None = None


class MotorVehicle(Contract):
    motor_type_key: str = Field(min_length=1)
    production_year_jalali: int = Field(ge=1300, le=1500)


class PreviousThirdPartyPolicy(Contract):
    status: Literal["new_vehicle", "no_previous_policy", "had_previous_policy"]
    previous_insurer_key: str | None = None
    previous_start_date: date | None = None
    previous_expiry_date: date | None = None
    previous_duration_months: int | None = Field(default=None, ge=1, le=12)
    no_claim_discount_percent: int | None = Field(default=None, ge=0, le=100)
    driver_discount_percent: int | None = Field(default=None, ge=0, le=100)
    had_claim: bool | None = None
    property_claim_count: int | None = Field(default=None, ge=0)
    bodily_claim_count: int | None = Field(default=None, ge=0)
    driver_claim_count: int | None = Field(default=None, ge=0)
    ownership_changed: bool = False
    discount_transferred: bool = False
    first_use_date: date | None = None


class PreviousBodyPolicy(Contract):
    had_policy: bool
    previous_insurer_key: str | None = None
    previous_expiry_date: date | None = None
    claim_free_years: int | None = Field(default=None, ge=0)


class ThirdCarSearch(Contract):
    product: Literal["third_car"] = "third_car"
    vehicle: CarVehicle
    previous_policy: PreviousThirdPartyPolicy
    duration_months: int = Field(ge=1, le=12)
    financial_coverage_toman: int = Field(gt=0)


class ThirdMotorSearch(Contract):
    product: Literal["third_motor"] = "third_motor"
    vehicle: MotorVehicle
    previous_policy: PreviousThirdPartyPolicy
    duration_months: int = Field(ge=1, le=12)
    financial_coverage_toman: int = Field(gt=0)


class BodyCarSearch(Contract):
    product: Literal["body_car"] = "body_car"
    vehicle: CarVehicle
    previous_policy: PreviousBodyPolicy
    third_party_insurer_key: str | None = None
    third_party_discount_percent: int | None = Field(default=None, ge=0, le=100)
    vehicle_value_toman: int = Field(gt=0)
    accessories_value_toman: int = Field(default=0, ge=0)
    province_key: str = Field(min_length=1)
    city_key: str = Field(min_length=1)
    region_key: str | None = None
    selected_coverages: list[str] = Field(default_factory=list, max_length=30)

    @model_validator(mode="after")
    def body_needs_production_month(self):
        if self.vehicle.production_month_jalali is None:
            raise ValueError("ماه تولید برای استعلام بدنه لازم است")
        return self


# A discriminated union: the frontend sends one typed form, not four provider
# payloads. Each provider mapper will produce its own existing lab contract.
SearchInput = Annotated[ThirdCarSearch | ThirdMotorSearch | BodyCarSearch,
                        Field(discriminator="product")]


class Premium(Contract):
    raw_amount: int = Field(ge=0)
    raw_unit: Literal["toman", "rial", "unknown"]
    amount_toman: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def no_unverified_conversion(self):
        if self.amount_toman != to_toman(self.raw_amount, self.raw_unit):
            raise ValueError("قیمت تومان با مبلغ و واحد ثبت‌شده مطابقت ندارد")
        return self


class Offer(Contract):
    provider: Provider
    product: Product
    insurer_name: str = Field(min_length=1)
    insurer_key: str | None = None
    provider_offer_id: str | None = None
    premium: Premium
    duration_months: int | None = Field(default=None, ge=1, le=12)
    financial_coverage_toman: int | None = Field(default=None, ge=0)
    coverage_codes: list[str] = Field(default_factory=list)
    has_installments: bool | None = None
    comparison_url: HttpUrl | None = None
    fetched_at: datetime
    # Exact source row, including fields the common cards do not yet display.
    raw_offer: dict[str, Any] | None = None


class ProviderResult(Contract):
    provider: Provider
    status: Literal["ok", "empty", "needs_input", "unmapped", "unavailable", "invalid_response", "unsupported"]
    offers: list[Offer] = Field(default_factory=list)
    message: str | None = None
    # Preserve the complete upstream JSON in a provider-specific namespace.
    # Never include request headers, tokens or cookies in this value.
    raw_response: dict[str, Any] | list[Any] | None = None

    @model_validator(mode="after")
    def status_matches_offers(self):
        if self.status == "ok" and not self.offers:
            raise ValueError("وضعیت ok نیاز به پیشنهاد دارد")
        if self.status != "ok" and self.offers:
            raise ValueError("وضعیت بدون نتیجه نباید پیشنهاد داشته باشد")
        if any(offer.provider != self.provider for offer in self.offers):
            raise ValueError("پیشنهاد باید به همان منبع تعلق داشته باشد")
        return self


class SearchResult(Contract):
    request_id: str = Field(min_length=1)
    product: Product
    fetched_at: datetime
    providers: list[ProviderResult]

    @model_validator(mode="after")
    def report_every_provider(self):
        if (len(self.providers) != 4 or
                {result.provider for result in self.providers} !=
                {"azki", "sabim", "bimebazar", "bimeh"}):
            raise ValueError("نتیجهٔ جست‌وجو باید وضعیت هر چهار منبع را داشته باشد")
        if any(offer.product != self.product for result in self.providers for offer in result.offers):
            raise ValueError("محصول پیشنهاد با جست‌وجو مطابقت ندارد")
        return self
