"""The unified DTO must retain source fields and report all four providers."""

from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from app.domain.quotes import Offer, Premium, ProviderResult, SearchResult


def test_preserves_full_source_json_and_unknown_price_unit():
    raw = {"Inquiries": [{"CompanyId": 1, "CashPrice": {"FinalAmount": 14000123},
                           "FutureField": {"nested": [True, 7, "value"]}}],
           "Companies": [{"Id": 1, "Title": "نمونه"}]}
    offer = Offer(provider="bimeh", product="third_car", insurer_name="نمونه",
                  premium=Premium(raw_amount=14000123, raw_unit="unknown"),
                  fetched_at=datetime.now(timezone.utc), raw_offer=raw["Inquiries"][0])
    result = SearchResult(
        request_id="test", product="third_car", fetched_at=datetime.now(timezone.utc),
        providers=[ProviderResult(provider="bimeh", status="ok", offers=[offer],
                                  raw_response=raw),
                   ProviderResult(provider="azki", status="empty", raw_response={"data": []}),
                   ProviderResult(provider="sabim", status="unavailable", message="HTTP 500"),
                   ProviderResult(provider="bimebazar", status="unmapped", message="model")],
    )
    payload = result.model_dump(mode="json")
    assert payload["providers"][0]["raw_response"] == raw
    assert payload["providers"][0]["offers"][0]["raw_offer"]["FutureField"]["nested"] == [True, 7, "value"]
    assert payload["providers"][0]["offers"][0]["premium"]["amount_toman"] is None


def test_rejects_made_up_conversions_and_missing_provider_status():
    with pytest.raises(ValidationError):
        Premium(raw_amount=101, raw_unit="unknown", amount_toman=10)
    with pytest.raises(ValidationError):
        Premium(raw_amount=1000, raw_unit="rial", amount_toman=1000)
    with pytest.raises(ValidationError):
        SearchResult(request_id="test", product="body_car",
                     fetched_at=datetime.now(timezone.utc), providers=[])
