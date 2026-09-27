"""Live OpenRouter checks using the production client. Never prints secrets or full prompts."""

from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timezone
import gzip
import json
from pathlib import Path

from dotenv import load_dotenv
import httpx

from torob_bimeh.ai.client import AIMessage, OpenRouterClient
from torob_bimeh.ai.quote_schema import QuoteAnalysisResponse
from torob_bimeh.domain.normalizers import normalize
from torob_bimeh.main import app


load_dotenv(Path(__file__).resolve().parents[1] / ".env")


async def json_sanity() -> None:
    raw = await OpenRouterClient().complete_json([
        AIMessage("system", "Return only valid JSON. No Markdown or commentary."),
        AIMessage("user", 'Return exactly: {"ok":true,"message":"سلام"}'),
    ])
    parsed = json.loads(raw)
    if parsed.get("ok") is not True or not parsed.get("message"):
        raise RuntimeError("sanity response did not match the requested JSON")
    print("JSON sanity passed: non-empty content parsed successfully")


async def quote_sanity() -> None:
    request = {
        "inquiry_id": "inq_live_sanity",
        "insurance_type": "third_car",
        "offers": [
            {"offer_id": "offer-1", "insurer_name": "ایران", "source_name": "azki", "final_price": 1200000},
            {"offer_id": "offer-2", "insurer_name": "آسیا", "source_name": "sabim", "final_price": 1350000, "installment_available": True, "payment_program_count": 1},
            {"offer_id": "offer-3", "insurer_name": "دانا", "source_name": "bimebazar", "final_price": 1280000, "discount_amount": 100000},
        ],
    }
    await post_and_validate(request, "Quote sanity")


async def fixture_sanity() -> None:
    fixtures = Path(__file__).resolve().parents[1] / "tests" / "fixtures"
    offers = []
    when = datetime.now(timezone.utc)
    for provider in ("azki", "sabim", "bimebazar", "bimeh"):
        raw = json.loads(gzip.decompress((fixtures / f"{provider}-third-response.json.gz").read_bytes()))
        result = normalize(provider, raw, when, "third_car", 12, 70_000_000)
        for index, offer in enumerate(result.offers):
            metrics = offer.insurer_metrics
            offers.append({
                "offer_id": f"{provider}:{index}",
                "insurer_name": offer.insurer_name,
                "source_name": provider,
                "old_price": offer.price_before_discount_toman,
                "final_price": offer.premium.amount_toman,
                "discount_amount": offer.discount_amount_toman,
                "discount_percent": offer.discount_percent,
                "installment_available": offer.has_installments,
                "payment_program_count": len(offer.installment_plans),
                "payment_terms": [plan.model_dump(mode="json") for plan in offer.installment_plans],
                "coverage": {
                    "financial_coverage_toman": offer.financial_coverage_toman,
                    "duration_months": offer.duration_months,
                },
                "services": metrics.model_dump(mode="json") if metrics else {},
                "benefits": offer.benefits,
                "badges": offer.badges,
                "financial_strength": metrics.financial_strength if metrics else None,
                "customer_satisfaction": metrics.satisfaction if metrics else None,
            })
    await post_and_validate({
        "inquiry_id": "inq_real_fixture_sanity",
        "insurance_type": "third_car",
        "offers": offers,
    }, f"Real fixture sanity ({len(offers)} offers)")


async def post_and_validate(request: dict, label: str) -> None:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://sanity.local"
    ) as client:
        response = await client.post("/api/ai/quote-analysis", json=request)
    response.raise_for_status()
    result = QuoteAnalysisResponse.model_validate(response.json())
    keys = list(result.sections.model_dump().keys())
    print(f"{label} passed: schema={result.schema_version}, sections={keys}")


async def main(run_quote: bool, quote_only: bool, run_fixture: bool) -> None:
    if not quote_only:
        await json_sanity()
    if run_quote:
        await quote_sanity()
    if run_fixture:
        await fixture_sanity()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--quote", action="store_true", help="also run a live three-offer analysis")
    parser.add_argument("--quote-only", action="store_true", help="run only the live endpoint check")
    parser.add_argument("--fixture", action="store_true", help="analyze the captured real 42-offer fixture")
    args = parser.parse_args()
    asyncio.run(main(args.quote or args.quote_only, args.quote_only or args.fixture, args.fixture))
