import asyncio
from types import SimpleNamespace

from app.ai.client import (
    AIMessage,
    AIProviderError,
    AISettings,
    OpenRouterClient,
    supports_native_json_schema,
)


def completion(content, *, finish_reason="stop", completion_tokens=20, reasoning_tokens=3):
    return SimpleNamespace(
        id="response-test",
        model="stealth/space-bunny-alpha",
        choices=[SimpleNamespace(
            finish_reason=finish_reason,
            message=SimpleNamespace(content=content, reasoning=None, reasoning_details=None),
        )],
        usage=SimpleNamespace(
            prompt_tokens=10,
            completion_tokens=completion_tokens,
            completion_tokens_details=SimpleNamespace(reasoning_tokens=reasoning_tokens),
        ),
    )


class FakeCompletions:
    def __init__(self, responses):
        self.responses = iter(responses)
        self.requests = []

    async def create(self, **kwargs):
        self.requests.append(kwargs)
        return next(self.responses)


def fake_sdk(*responses):
    completions = FakeCompletions(responses)
    return SimpleNamespace(chat=SimpleNamespace(completions=completions)), completions


def test_openrouter_client_sends_server_key_and_returns_content():
    sdk, requests = fake_sdk(completion('{"ok":true}'))
    client = OpenRouterClient(
        AISettings(api_key="test-key", base_url="https://openrouter.test/api/v1"),
        sdk_client=sdk,
    )
    assert asyncio.run(client.complete_json([AIMessage("user", "hello")])) == '{"ok":true}'
    request = requests.requests[0]
    assert request["messages"] == [{"role": "user", "content": "hello"}]
    assert request["response_format"] == {"type": "json_object"}
    assert request["max_tokens"] == 3000
    assert request["extra_body"] == {"reasoning": {"effort": "low"}}


def test_space_bunny_does_not_use_native_json_schema():
    assert not supports_native_json_schema(
        "stealth/space-bunny-alpha", ("stealth/space-bunny-alpha",)
    )


def test_empty_content_retries_exactly_once(caplog):
    sdk, requests = fake_sdk(
        completion("", finish_reason="length", completion_tokens=3000),
        completion('{"ok":true}'),
    )
    client = OpenRouterClient(AISettings(api_key="test-key"), sdk_client=sdk)
    assert asyncio.run(client.complete_json([AIMessage("user", "hello")])) == '{"ok":true}'
    assert len(requests.requests) == 2
    assert client.last_attempt_count == 2
    assert "finish_reason=length" in caplog.text


def test_two_empty_responses_raise_controlled_error():
    sdk, requests = fake_sdk(completion(""), completion(None))
    client = OpenRouterClient(AISettings(api_key="test-key"), sdk_client=sdk)
    try:
        asyncio.run(client.complete_json([AIMessage("user", "hello")]))
    except AIProviderError as exc:
        assert "after retry" in str(exc)
    else:
        raise AssertionError("expected AIProviderError")
    assert len(requests.requests) == 2
