import json
import asyncio

from app.adapters.response_log import save_response


def test_provider_response_log_uses_provider_directory_and_json(monkeypatch, tmp_path):
    monkeypatch.setenv("PROVIDER_RESPONSE_LOG_DIR", str(tmp_path))
    payload = {"offers": [{"price": 123, "future": {"kept": True}}]}
    path = asyncio.run(save_response("azki", "third_car", payload))
    assert path is not None and path.parent == tmp_path / "azki"
    assert "third_car" in path.name
    assert json.loads(path.read_text(encoding="utf-8")) == payload
