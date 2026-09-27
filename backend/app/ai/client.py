"""Small reusable OpenRouter-compatible chat client."""

from __future__ import annotations

import os
import logging
from dataclasses import dataclass
from typing import Any

from openai import APIError, AsyncOpenAI


logger = logging.getLogger(__name__)


class AIConfigurationError(RuntimeError):
    """The server-side AI provider is not configured."""


class AIProviderError(RuntimeError):
    """The configured AI provider failed or returned an unusable response."""


@dataclass(frozen=True)
class AIMessage:
    role: str
    content: str


@dataclass(frozen=True)
class AISettings:
    api_key: str
    model: str = "stealth/space-bunny-alpha"
    base_url: str = "https://openrouter.ai/api/v1"
    http_referer: str = "http://localhost:3000"
    app_title: str = "Torobimeh"
    timeout_seconds: float = 45.0
    max_tokens: int = 3000
    temperature: float = 0.2
    reasoning_effort: str = "low"
    native_json_schema_models: tuple[str, ...] = ()
    fallback_models: tuple[str, ...] = ()

    @classmethod
    def from_env(cls) -> "AISettings":
        api_key = os.getenv("AI_API_KEY", "").strip()
        if not api_key:
            raise AIConfigurationError("AI_API_KEY is not configured")
        return cls(
            api_key=api_key,
            model=os.getenv("OPENROUTER_MODEL", cls.model).strip() or cls.model,
            base_url=os.getenv("OPENROUTER_BASE_URL", cls.base_url).rstrip("/"),
            http_referer=os.getenv("OPENROUTER_HTTP_REFERER", cls.http_referer),
            app_title=os.getenv("OPENROUTER_APP_TITLE", cls.app_title),
            timeout_seconds=float(os.getenv("OPENROUTER_TIMEOUT_SECONDS", "45")),
            max_tokens=int(os.getenv("OPENROUTER_MAX_TOKENS", "3000")),
            temperature=float(os.getenv("OPENROUTER_TEMPERATURE", "0.2")),
            reasoning_effort=os.getenv("OPENROUTER_REASONING_EFFORT", "low").strip(),
            native_json_schema_models=_csv_env("OPENROUTER_NATIVE_JSON_SCHEMA_MODELS"),
            fallback_models=_csv_env("OPENROUTER_FALLBACK_MODELS"),
        )


def _csv_env(name: str) -> tuple[str, ...]:
    return tuple(value.strip() for value in os.getenv(name, "").split(",") if value.strip())


def supports_native_json_schema(model: str, configured_models: tuple[str, ...] = ()) -> bool:
    """Native schema mode is opt-in; Space Bunny Alpha intentionally uses JSON mode."""
    if model == "stealth/space-bunny-alpha":
        return False
    return model in configured_models


class OpenRouterClient:
    """Transport shared by quote analysis and future structured AI features."""

    def __init__(self, settings: AISettings | None = None, sdk_client: Any | None = None):
        self.settings = settings or AISettings.from_env()
        self.sdk_client = sdk_client
        self.last_attempt_count = 0

    async def complete_json(
        self,
        messages: list[AIMessage],
        *,
        json_schema: dict[str, Any] | None = None,
        allow_empty_retry: bool = True,
    ) -> str:
        response_format: dict[str, Any] = {"type": "json_object"}
        if json_schema and supports_native_json_schema(
            self.settings.model, self.settings.native_json_schema_models
        ):
            response_format = {
                "type": "json_schema",
                "json_schema": {"name": "structured_response", "strict": True, "schema": json_schema},
            }
        request_options: dict[str, Any] = {
            "model": self.settings.model,
            "messages": [message.__dict__ for message in messages],
            "temperature": self.settings.temperature,
            "max_tokens": self.settings.max_tokens,
            "response_format": response_format,
            "extra_headers": {
                "HTTP-Referer": self.settings.http_referer,
                "X-Title": self.settings.app_title,
            },
        }
        if self.settings.reasoning_effort:
            request_options["extra_body"] = {
                "reasoning": {"effort": self.settings.reasoning_effort}
            }
        attempts = 2 if allow_empty_retry else 1
        try:
            if self.sdk_client is not None:
                return await self._request_loop(self.sdk_client, request_options, attempts)
            # Disable SDK-level retries so the explicit two-call budget remains authoritative.
            async with AsyncOpenAI(
                base_url=self.settings.base_url,
                api_key=self.settings.api_key,
                timeout=self.settings.timeout_seconds,
                max_retries=0,
            ) as client:
                return await self._request_loop(client, request_options, attempts)
        except AIProviderError:
            raise
        except (APIError, KeyError, IndexError, ValueError, TypeError) as exc:
            raise AIProviderError("AI provider request failed") from exc

    async def _request_loop(
        self, client: Any, request_options: dict[str, Any], attempts: int
    ) -> str:
        for attempt in range(1, attempts + 1):
            self.last_attempt_count = attempt
            response = await client.chat.completions.create(**request_options)
            content = self._content_or_none(response)
            if content:
                return content
            self._log_empty_response(response, attempt, attempts)
        raise AIProviderError("AI provider returned empty content after retry")

    @staticmethod
    def _content_or_none(response: Any) -> str | None:
        choices = getattr(response, "choices", None)
        if not choices:
            return None
        message = getattr(choices[0], "message", None)
        content = getattr(message, "content", None)
        return content.strip() if isinstance(content, str) and content.strip() else None

    def _log_empty_response(self, response: Any, attempt: int, attempts: int) -> None:
        choices = getattr(response, "choices", None) or []
        choice = choices[0] if choices else None
        message = getattr(choice, "message", None)
        usage = getattr(response, "usage", None)
        completion_details = getattr(usage, "completion_tokens_details", None)
        logger.warning(
            "OpenRouter returned empty content model=%s response_model=%s response_id=%s "
            "finish_reason=%s prompt_tokens=%s completion_tokens=%s reasoning_tokens=%s "
            "choice_count=%s reasoning_present=%s reasoning_details_present=%s attempt=%s/%s",
            self.settings.model,
            getattr(response, "model", None),
            getattr(response, "id", None),
            getattr(choice, "finish_reason", None),
            getattr(usage, "prompt_tokens", None),
            getattr(usage, "completion_tokens", None),
            getattr(completion_details, "reasoning_tokens", None),
            len(choices),
            bool(getattr(message, "reasoning", None)),
            bool(getattr(message, "reasoning_details", None)),
            attempt,
            attempts,
        )
