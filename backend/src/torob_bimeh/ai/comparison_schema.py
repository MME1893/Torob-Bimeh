"""Strict request and response contracts for the comparison analysis.

The browser sends only the offers the user actually picked, so the model can
never drift into an unrelated part of the inquiry.
"""

from __future__ import annotations

from typing import Literal

from pydantic import Field, model_validator

from .quote_schema import QuoteOffer, StrictModel


MIN_COMPARISON_OFFERS = 2
MAX_COMPARISON_OFFERS = 4
MAX_CARDS = 4
MAX_CARD_OFFER_IDS = 3
MAX_CAVEATS = 3

ComparisonCardType = Literal[
    "recommended",
    "cheapest",
    "payment",
    "coverage_services",
]
# The four insight cards are a fixed product surface, so the set is closed.
COMPARISON_CARD_TYPES: tuple[ComparisonCardType, ...] = (
    "recommended",
    "cheapest",
    "payment",
    "coverage_services",
)


class ComparisonAnalysisRequest(StrictModel):
    """One comparison of 2-4 offers, drawn from a single stored inquiry."""

    inquiry_id: str = Field(min_length=1, max_length=160)
    insurance_type: Literal["third_car", "body_car", "third_motor"]
    selected_offer_ids: list[str] = Field(
        min_length=MIN_COMPARISON_OFFERS, max_length=MAX_COMPARISON_OFFERS
    )
    offers: list[QuoteOffer] = Field(
        min_length=MIN_COMPARISON_OFFERS, max_length=MAX_COMPARISON_OFFERS
    )

    @model_validator(mode="after")
    def selection_matches_supplied_offers(self) -> "ComparisonAnalysisRequest":
        if len(set(self.selected_offer_ids)) != len(self.selected_offer_ids):
            raise ValueError("selected_offer_ids values must be unique")
        supplied = {offer.offer_id for offer in self.offers}
        if len(supplied) != len(self.offers):
            raise ValueError("offer_id values must be unique")
        if unknown := sorted(set(self.selected_offer_ids) - supplied):
            raise ValueError(f"selected_offer_ids are missing from offers: {unknown}")
        if extra := sorted(supplied - set(self.selected_offer_ids)):
            raise ValueError(f"offers must be exactly the selected offers, extra: {extra}")
        return self


class ComparisonSummary(StrictModel):
    headline: str = Field(min_length=1, max_length=80)
    body: str = Field(min_length=1, max_length=400)


class ComparisonCard(StrictModel):
    type: ComparisonCardType
    title: str = Field(min_length=1, max_length=60)
    description: str = Field(min_length=1, max_length=220)
    offer_ids: list[str] = Field(default_factory=list, max_length=MAX_CARD_OFFER_IDS)


class ComparisonAnalysisResponse(StrictModel):
    schema_version: Literal["1.0"]
    best_offer_id: str = Field(min_length=1, max_length=160)
    best_offer_reason: str = Field(min_length=1, max_length=300)
    summary: ComparisonSummary
    cards: list[ComparisonCard] = Field(min_length=MAX_CARDS, max_length=MAX_CARDS)
    caveats: list[str] = Field(default_factory=list, max_length=MAX_CAVEATS)

    @model_validator(mode="after")
    def every_card_type_is_present(self) -> "ComparisonAnalysisResponse":
        present = {card.type for card in self.cards}
        if len(present) != len(self.cards):
            raise ValueError("card types must be unique")
        if present != set(COMPARISON_CARD_TYPES):
            missing = sorted(set(COMPARISON_CARD_TYPES) - present)
            raise ValueError(f"cards must cover every comparison card type, missing: {missing}")
        return self


def referenced_offer_ids(result: ComparisonAnalysisResponse) -> set[str]:
    found: set[str] = {result.best_offer_id}
    for card in result.cards:
        found.update(card.offer_ids)
    return found
