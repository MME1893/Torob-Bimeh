"""Run with pytest once backend dependencies have been installed."""

import json

import httpx
from fastapi.testclient import TestClient

from torob_bimeh.adapters.azki.client import get_body_prices, get_third_prices
from torob_bimeh.main import app
from tests.test_contract import BASE, BODY, QUERY


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

    monkeypatch.setattr("torob_bimeh.routers.azki.get_third_prices", fake_upstream)
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


def test_body_adapter_posts_json_to_fixed_azki_endpoint(monkeypatch):
    monkeypatch.setenv("AZKI_AUTHORIZATION", "test-placeholder")

    def handler(request):
        assert request.method == "POST"
        assert request.url.path == "/api/aggregator/v1/body/prices/compare"
        assert request.url.query == b""
        assert request.headers["content-type"].startswith("application/json")
        assert request.headers["referer"] == "https://www.azki.com/car-insurance/car-body-insurance/compare"
        assert request.headers["authorization"] == "test-placeholder"
        assert json.loads(request.content) == BODY
        return httpx.Response(200, json={"top": [], "bottom": [], "others": [{"id": 1, "price": 1000}]})

    import asyncio
    result = asyncio.run(get_body_prices(BODY, httpx.MockTransport(handler)))
    assert result["others"][0]["price"] == 1000


def test_body_route_forwards_payload_and_rejects_wrong_types(monkeypatch):
    async def fake_upstream(body):
        assert body == BODY
        return {"top": [], "bottom": [], "others": []}

    monkeypatch.setattr("torob_bimeh.routers.azki.get_body_prices", fake_upstream)
    with TestClient(app) as client:
        valid = client.post("/api/azki/prices/body", json={"body": BODY})
        assert valid.status_code == 200
        assert valid.json()["others"] == []
        invalid = client.post("/api/azki/prices/body", json={"body": {**BODY, "zeroKilometer": "true"}})
        assert invalid.status_code == 422
