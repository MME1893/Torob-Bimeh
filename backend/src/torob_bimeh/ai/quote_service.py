"""Quote analysis orchestration and validation."""

from __future__ import annotations

import json
from typing import Callable

from pydantic import ValidationError

from .client import AIMessage, OpenRouterClient
from .prompts import QUOTE_ANALYSIS_SYSTEM_PROMPT, quote_analysis_repair_prompt
from .quote_schema import QuoteAnalysisRequest, QuoteAnalysisResponse, referenced_offer_ids


class AIResponseValidationError(RuntimeError):
    pass


class QuoteAnalysisService:
    def __init__(self, client_factory: Callable[[], OpenRouterClient] = OpenRouterClient):
        self.client_factory = client_factory

    async def analyze(self, request: QuoteAnalysisRequest) -> QuoteAnalysisResponse:
        client = self.client_factory()
        quote_json = request.model_dump_json(exclude_none=True)
        messages = [AIMessage("system", QUOTE_ANALYSIS_SYSTEM_PROMPT), AIMessage("user", quote_json)]
        schema = QuoteAnalysisResponse.model_json_schema()
        raw = await client.complete_json(messages, json_schema=schema)
        try:
            return self._validate(raw, request)
        except AIResponseValidationError as exc:
            # Empty-output retry and JSON repair share one global extra-call budget.
            if getattr(client, "last_attempt_count", 1) > 1:
                raise
            allowed_ids = [offer.offer_id for offer in request.offers]
            repaired = await client.complete_json(
                [
                    AIMessage("system", QUOTE_ANALYSIS_SYSTEM_PROMPT),
                    AIMessage("assistant", raw),
                    AIMessage("user", quote_analysis_repair_prompt(str(exc), allowed_ids)),
                ],
                json_schema=schema,
                allow_empty_retry=False,
            )
            return self._validate(repaired, request)

    # @staticmethod
    # def _validate(raw: str, request: QuoteAnalysisRequest) -> QuoteAnalysisResponse:
    #     try:
    #         result = QuoteAnalysisResponse.model_validate(json.loads(_clean_json(raw)))
    #     except json.JSONDecodeError as exc:
    #         raise AIResponseValidationError(
    #             f"AI response is not valid JSON at line {exc.lineno}, column {exc.colno}"
    #         ) from exc
    #     except ValidationError as exc:
    #         first = exc.errors(include_url=False, include_input=False)[0]
    #         location = ".".join(str(part) for part in first.get("loc", ())) or "root"
    #         raise AIResponseValidationError(
    #             f"AI response schema validation failed at {location}: {first.get('type', 'invalid')}"
    #         ) from exc
    #     allowed = {offer.offer_id for offer in request.offers}
    #     if unknown := referenced_offer_ids(result) - allowed:
    #         raise AIResponseValidationError(f"AI response contains unknown offer IDs: {sorted(unknown)}")
    #     return result
    @staticmethod
    def _validate(raw: str, request: QuoteAnalysisRequest) -> QuoteAnalysisResponse:
        try:
            payload = json.loads(_clean_json(raw))
        except json.JSONDecodeError as exc:
            raise AIResponseValidationError(
                f"AI response is not valid JSON at line {exc.lineno}, column {exc.colno}"
            ) from exc

        # First, verify that the raw AI payload did not invent offer IDs.
        allowed = {offer.offer_id for offer in request.offers}
        raw_ids = _raw_referenced_offer_ids(payload)

        if unknown := raw_ids - allowed:
            raise AIResponseValidationError(
                f"AI response contains unknown offer IDs: {sorted(unknown)}"
            )

        # Safely normalize only presentation-size constraints.
        # This prevents a valid response from failing just because the model
        # referenced 4-5 valid offers instead of the UI maximum of 3.
        payload = _normalize_analysis_payload(payload)

        try:
            result = QuoteAnalysisResponse.model_validate(payload)
        except ValidationError as exc:
            first = exc.errors(include_url=False, include_input=False)[0]
            location = ".".join(str(part) for part in first.get("loc", ())) or "root"

            message = first.get("msg") or first.get("type", "invalid")

            raise AIResponseValidationError(
                f"AI response schema validation failed at {location}: {message}"
            ) from exc

        # Keep the typed validation as a second safety check.
        if unknown := referenced_offer_ids(result) - allowed:
            raise AIResponseValidationError(
                f"AI response contains unknown offer IDs: {sorted(unknown)}"
            )

        return result

def _normalize_analysis_payload(payload: object) -> object:
    """
    Apply only deterministic UI-bound normalization.

    We intentionally do NOT repair semantic data here.
    We only:
      - deduplicate valid string offer IDs
      - keep at most 3 offer IDs per key point
      - keep at most 3 recommended offer IDs

    Unknown offer IDs are checked BEFORE this function is called.
    """

    if not isinstance(payload, dict):
        return payload

    sections = payload.get("sections")
    if not isinstance(sections, dict):
        return payload

    section_names = (
        "smart_summary",
        "coverage_services",
        "payment_terms",
        "price_value",
    )

    for section_name in section_names:
        section = sections.get(section_name)

        if not isinstance(section, dict):
            continue

        recommended = section.get("recommended_offer_ids")
        if isinstance(recommended, list) and all(
            isinstance(value, str) for value in recommended
        ):
            section["recommended_offer_ids"] = _unique_strings(
                recommended,
                limit=3,
            )

        key_points = section.get("key_points")

        if isinstance(key_points, list):
            for point in key_points:
                if not isinstance(point, dict):
                    continue

                offer_ids = point.get("offer_ids")

                if isinstance(offer_ids, list) and all(
                    isinstance(value, str) for value in offer_ids
                ):
                    point["offer_ids"] = _unique_strings(
                        offer_ids,
                        limit=3,
                    )

    return payload


def _unique_strings(values: list[str], *, limit: int) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()

    for value in values:
        if value in seen:
            continue

        seen.add(value)
        result.append(value)

        if len(result) >= limit:
            break

    return result


def _raw_referenced_offer_ids(payload: object) -> set[str]:
    """
    Extract offer IDs directly from the raw parsed JSON.

    This is intentionally performed before list truncation so an invented ID
    cannot be hidden simply because it appeared as the 4th or 5th item.
    """

    if not isinstance(payload, dict):
        return set()

    sections = payload.get("sections")
    if not isinstance(sections, dict):
        return set()

    found: set[str] = set()

    for section_name in (
        "smart_summary",
        "coverage_services",
        "payment_terms",
        "price_value",
    ):
        section = sections.get(section_name)

        if not isinstance(section, dict):
            continue

        recommended = section.get("recommended_offer_ids")

        if isinstance(recommended, list):
            found.update(
                value for value in recommended if isinstance(value, str)
            )

        key_points = section.get("key_points")

        if isinstance(key_points, list):
            for point in key_points:
                if not isinstance(point, dict):
                    continue

                offer_ids = point.get("offer_ids")

                if isinstance(offer_ids, list):
                    found.update(
                        value for value in offer_ids if isinstance(value, str)
                    )

    price_value = sections.get("price_value")

    if isinstance(price_value, dict):
        for field in ("cheapest_offer_id", "best_value_offer_id"):
            value = price_value.get(field)

            if isinstance(value, str):
                found.add(value)

    return found

def _clean_json(raw: str) -> str:
    """Trim whitespace and one optional surrounding Markdown fence; do not mutate JSON."""
    cleaned = raw.strip()
    if cleaned.startswith("```") and cleaned.endswith("```"):
        first_newline = cleaned.find("\n")
        if first_newline != -1:
            language = cleaned[3:first_newline].strip().lower()
            if language in ("", "json"):
                cleaned = cleaned[first_newline + 1 : -3].strip()
    return cleaned
