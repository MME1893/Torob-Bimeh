"""Strict request and response contracts for quote analysis."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class QuoteOffer(StrictModel):
    offer_id: str = Field(min_length=1, max_length=160)
    insurer_name: str = Field(min_length=1, max_length=120)
    source_name: str = Field(min_length=1, max_length=80)
    old_price: int | None = Field(default=None, ge=0)
    final_price: int | None = Field(default=None, ge=0)
    discount_amount: int | None = Field(default=None, ge=0)
    discount_percent: float | None = Field(default=None, ge=0, le=100)
    installment_available: bool | None = None
    payment_program_count: int = Field(default=0, ge=0, le=100)
    payment_terms: list[dict[str, Any]] = Field(default_factory=list, max_length=20)
    coverage: dict[str, Any] = Field(default_factory=dict)
    services: dict[str, Any] = Field(default_factory=dict)
    benefits: list[str] = Field(default_factory=list, max_length=30)
    badges: list[str] = Field(default_factory=list, max_length=30)
    financial_strength: float | None = None
    customer_satisfaction: float | None = None


class QuoteAnalysisRequest(StrictModel):
    inquiry_id: str = Field(min_length=1, max_length=160)
    insurance_type: Literal["third_car", "body_car", "third_motor"]
    offers: list[QuoteOffer] = Field(min_length=1, max_length=250)

    @model_validator(mode="after")
    def unique_offer_ids(self):
        ids = [offer.offer_id for offer in self.offers]
        if len(ids) != len(set(ids)):
            raise ValueError("offer_id values must be unique")
        return self


class AnalysisPoint(StrictModel):
    title: str = Field(min_length=1, max_length=60)
    description: str = Field(min_length=1, max_length=250)
    offer_ids: list[str] = Field(default_factory=list, max_length=3)
    tone: Literal["positive", "neutral", "warning"]


class AnalysisSection(StrictModel):
    headline: str = Field(min_length=1, max_length=80)
    summary: str = Field(min_length=1, max_length=500)
    key_points: list[AnalysisPoint] = Field(default_factory=list, max_length=4)
    recommended_offer_ids: list[str] = Field(default_factory=list, max_length=3)
    caveats: list[str] = Field(default_factory=list, max_length=3)


class PriceValueSection(AnalysisSection):
    cheapest_offer_id: str | None = None
    best_value_offer_id: str | None = None


class AnalysisSections(StrictModel):
    smart_summary: AnalysisSection
    coverage_services: AnalysisSection
    payment_terms: AnalysisSection
    price_value: PriceValueSection


class QuoteAnalysisResponse(StrictModel):
    schema_version: Literal["1.0"]
    analysis_version: Literal["1"] = "1"
    sections: AnalysisSections


def referenced_offer_ids(result: QuoteAnalysisResponse) -> set[str]:
    found: set[str] = set()
    for section in (
        result.sections.smart_summary,
        result.sections.coverage_services,
        result.sections.payment_terms,
        result.sections.price_value,
    ):
        found.update(section.recommended_offer_ids)
        for point in section.key_points:
            found.update(point.offer_ids)
    price = result.sections.price_value
    found.update(value for value in (price.cheapest_offer_id, price.best_value_offer_id) if value)
    return found

