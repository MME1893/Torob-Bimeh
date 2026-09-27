"""Strict request and response contracts for stateless inquiry chat."""

from __future__ import annotations

from typing import Literal

from pydantic import Field, field_validator, model_validator

from .quote_schema import (
    AnalysisPoint,
    QuoteAnalysisResponse,
    QuoteOffer,
    StrictModel,
)


MAX_USER_MESSAGE_CHARS = 2000
MAX_HISTORY_MESSAGES = 16
MAX_ATTACHMENTS_PER_MESSAGE = 2
MAX_ATTACHMENT_BYTES = 512 * 1024
MAX_ATTACHMENT_CHARS = 20_000
MAX_ANSWER_CHARS = 2500
MAX_REFERENCED_OFFER_IDS = 5
MAX_SUGGESTED_QUESTIONS = 3
MAX_SUGGESTION_CHARS = 120
ALLOWED_ATTACHMENT_SUFFIXES = (".txt", ".md", ".json", ".csv")

AnalysisSectionKey = Literal[
    "smart_summary",
    "coverage_services",
    "payment_terms",
    "price_value",
]
ChatContextType = Literal["inquiry", "analysis_section"]
ChatRole = Literal["user", "assistant"]


def _attachment_suffix(name: str) -> str:
    lowered = name.lower()
    for suffix in ALLOWED_ATTACHMENT_SUFFIXES:
        if lowered.endswith(suffix):
            return suffix
    return ""


class ChatAttachment(StrictModel):
    """Bounded textual attachment carried inside a single chat message."""

    id: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=160)
    mime_type: str = Field(default="text/plain", max_length=120)
    size_bytes: int = Field(ge=0, le=MAX_ATTACHMENT_BYTES)
    text_content: str = Field(min_length=1, max_length=MAX_ATTACHMENT_CHARS)

    @field_validator("text_content")
    @classmethod
    def text_content_is_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("attachment text_content must not be blank")
        return value

    @field_validator("name")
    @classmethod
    def name_is_a_supported_text_file(cls, value: str) -> str:
        if not _attachment_suffix(value):
            supported = ", ".join(ALLOWED_ATTACHMENT_SUFFIXES)
            raise ValueError(f"only text attachments are supported ({supported})")
        return value


class ChatHistoryMessage(StrictModel):
    role: ChatRole
    content: str = Field(min_length=1, max_length=MAX_USER_MESSAGE_CHARS)
    attachments: list[ChatAttachment] = Field(
        default_factory=list, max_length=MAX_ATTACHMENTS_PER_MESSAGE
    )

    @field_validator("content")
    @classmethod
    def content_is_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("message content must not be blank")
        return value


class ChatSectionSnapshot(StrictModel):
    """Immutable copy of one analysis section, captured when a thread was created.

    Only the price/value section of quote analysis carries cheapest/best-value IDs,
    so both are optional here to accept a snapshot from any section.
    """

    headline: str = Field(min_length=1, max_length=80)
    summary: str = Field(min_length=1, max_length=500)
    key_points: list[AnalysisPoint] = Field(default_factory=list, max_length=4)
    recommended_offer_ids: list[str] = Field(default_factory=list, max_length=3)
    caveats: list[str] = Field(default_factory=list, max_length=3)
    cheapest_offer_id: str | None = None
    best_value_offer_id: str | None = None


class ChatContext(StrictModel):
    type: ChatContextType
    section_key: AnalysisSectionKey | None = None
    referenced_offer_ids: list[str] = Field(default_factory=list, max_length=MAX_REFERENCED_OFFER_IDS)
    offers: list[QuoteOffer] = Field(min_length=1, max_length=250)
    analysis_section: ChatSectionSnapshot | None = None
    cached_analysis: QuoteAnalysisResponse | None = None

    @model_validator(mode="after")
    def context_is_consistent(self) -> "ChatContext":
        allowed = {offer.offer_id for offer in self.offers}
        if len(allowed) != len(self.offers):
            raise ValueError("offer_id values must be unique")
        if self.type == "analysis_section":
            if self.section_key is None:
                raise ValueError("section_key is required for an analysis_section context")
            if self.analysis_section is None:
                raise ValueError("analysis_section is required for an analysis_section context")
        elif self.section_key is not None:
            raise ValueError("section_key is not allowed for an inquiry context")
        if unknown := sorted(set(self.referenced_offer_ids) - allowed):
            raise ValueError(f"context references unknown offer IDs: {unknown}")
        if unknown := sorted(_snapshot_offer_ids(self.analysis_section) - allowed):
            raise ValueError(f"analysis_section references unknown offer IDs: {unknown}")
        return self


class ChatRequest(StrictModel):
    """One bounded chat turn. The browser owns all persistence and sends full context."""

    inquiry_id: str = Field(min_length=1, max_length=160)
    thread_id: str = Field(min_length=1, max_length=160)
    insurance_type: Literal["third_car", "body_car", "third_motor"]
    context: ChatContext
    history: list[ChatHistoryMessage] = Field(default_factory=list, max_length=MAX_HISTORY_MESSAGES)
    message: str = Field(min_length=1, max_length=MAX_USER_MESSAGE_CHARS)
    attachments: list[ChatAttachment] = Field(
        default_factory=list, max_length=MAX_ATTACHMENTS_PER_MESSAGE
    )

    @field_validator("message")
    @classmethod
    def message_is_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("message must not be blank")
        return value

    @model_validator(mode="after")
    def total_attachment_text_is_bounded(self) -> "ChatRequest":
        if len(self.history) > MAX_HISTORY_MESSAGES:
            raise ValueError(f"history must contain at most {MAX_HISTORY_MESSAGES} messages")
        total = sum(len(item.text_content) for item in self.attachments)
        total += sum(
            len(attachment.text_content)
            for message in self.history
            for attachment in message.attachments
        )
        if total > MAX_ATTACHMENT_CHARS:
            raise ValueError(
                f"total attachment text must not exceed {MAX_ATTACHMENT_CHARS} characters"
            )
        return self


class ChatResponse(StrictModel):
    schema_version: Literal["1.0"]
    answer: str = Field(min_length=1, max_length=MAX_ANSWER_CHARS)
    referenced_offer_ids: list[str] = Field(default_factory=list, max_length=MAX_REFERENCED_OFFER_IDS)
    suggested_questions: list[str] = Field(default_factory=list, max_length=MAX_SUGGESTED_QUESTIONS)


def _snapshot_offer_ids(snapshot: ChatSectionSnapshot | None) -> set[str]:
    if snapshot is None:
        return set()
    found: set[str] = set(snapshot.recommended_offer_ids)
    for point in snapshot.key_points:
        found.update(point.offer_ids)
    found.update(
        value
        for value in (snapshot.cheapest_offer_id, snapshot.best_value_offer_id)
        if value
    )
    return found
