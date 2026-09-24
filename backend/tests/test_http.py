"""Run with pytest once backend dependencies have been installed."""

import httpx
from fastapi.testclient import TestClient

from app.adapters.azki import get_third_prices
from app.main import app
from tests.test_contract import BASE, QUERY


def test_upstream_adapter_sends_get_with_server_headers(monkeypatch):
    monkeypatch.setenv("AZKI_AUTHORIZATION", "test-placeholder")

    def handler(request):
        assert request.method == "GET"
        assert request.url.path == "/api/aggregator/v1/third/prices/compare"
        assert request.url.params["vehicleModelID"] == QUERY["vehicleModelID"]
        assert request.headers["authorization"] == "test-placeholder"
        return httpx.Response(200, json={"top": [], "bottom": [], "others": [{"id": 1}]})

    import asyncio
    result = asyncio.run(get_third_prices(QUERY, "third_motor", httpx.MockTransport(handler)))
    assert len(result["others"]) == 1


def test_route_and_lab_are_on_same_origin(monkeypatch):
    async def fake_upstream(params, product):
        assert product == "third_motor"
        assert params["vehicleModelID"] == QUERY["vehicleModelID"]
        return {"top": [], "bottom": [], "others": []}

    monkeypatch.setattr("app.routers.azki.get_third_prices", fake_upstream)
    with TestClient(app) as client:
        assert client.get("/api/health").json() == {"status": "ok"}
        assert 'id="fetch-quotes"' in client.get("/labs/azki.html").text
        result = client.post("/api/azki/prices/third", json={"product": "third_motor", "url": BASE + "?" + str(httpx.QueryParams(QUERY))})
        assert result.status_code == 200
        assert result.json()["others"] == []


def test_route_rejects_foreign_url():
    with TestClient(app) as client:
        response = client.post("/api/azki/prices/third", json={"url": "https://example.org/private"})
        assert response.status_code == 422
