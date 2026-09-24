"""Run with pytest and backend dependencies installed."""

import asyncio

import httpx
from fastapi.testclient import TestClient

from app.adapters.sabim import get_prices
from app.main import app
from tests.test_sabim_contract import BODY, THIRD


def test_third_motor_posts_query_and_empty_json_without_authorization():
    motor = {**THIRD, "carmode_id": "4"}

    def handler(request):
        assert request.method == "POST"
        assert str(request.url).startswith("https://api.sabim.com/api/price_thirdparty?")
        assert request.url.params["carmode_id"] == "4"
        assert request.content == b"{}"
        assert "authorization" not in request.headers
        return httpx.Response(200, json={"prices": []})

    result = asyncio.run(get_prices("third_motor", motor, httpx.MockTransport(handler)))
    assert result == {"prices": []}


def test_body_coverages_are_repeated_and_errors_are_not_fake_prices():
    body = {**BODY, "bodycar_coverage_id[]": ["1", "2"]}

    def handler(request):
        assert request.url.path == "/api/price_bodycar"
        assert request.url.params.get_list("bodycar_coverage_id[]") == ["1", "2"]
        assert request.content == b"{}"
        return httpx.Response(500, json={"message": "upstream unavailable"})

    from app.adapters.sabim import SabimUpstreamError
    import pytest
    with pytest.raises(SabimUpstreamError, match="HTTP 500"):
        asyncio.run(get_prices("body_car", body, httpx.MockTransport(handler)))


def test_route_rejects_motor_body_and_forwards_car_quotes(monkeypatch):
    async def upstream(product, query):
        assert product == "third_car"
        assert query == THIRD
        return {"prices": [123]}

    monkeypatch.setattr("app.routers.sabim.get_prices", upstream)
    with TestClient(app) as client:
        assert client.get("/labs/sabim.html").status_code == 200
        result = client.post("/api/sabim/prices", json={"product": "third_car", "query": THIRD})
        assert result.status_code == 200
        assert result.json() == {"prices": [123]}
        rejected = client.post("/api/sabim/prices", json={"product": "motor_body", "query": BODY})
        assert rejected.status_code == 422
