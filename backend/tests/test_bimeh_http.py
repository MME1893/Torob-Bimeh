"""Mock the upstream; no live quotes or credentials are used in these tests."""

import asyncio
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from torob_bimeh.adapters.bimeh.client import BimehUpstreamError, get_prices
from torob_bimeh.adapters.bimeh.contract import BASE_URL, PATHS
from torob_bimeh.main import app
from tests.test_bimeh_contract import BODY, MOTOR, THIRD


@pytest.mark.parametrize("product,body", [("third_car", THIRD), ("body_car", BODY),
                                         ("third_motor", MOTOR)])
def test_post_sends_actual_payload_with_token_and_returns_json(product, body, monkeypatch):
    monkeypatch.setenv("BIMEH_TOKEN", "current-session-token")

    def handler(request):
        assert request.method == "POST"
        assert str(request.url) == BASE_URL + PATHS[product]
        assert json.loads(request.content) == body
        assert request.headers["token"] == "current-session-token"
        assert request.headers["origin"] == "https://bimeh.com"
        assert request.headers["referer"] == "https://bimeh.com/"
        assert request.headers["accept"] == "*/*"
        assert request.headers["content-type"] == "application/json"
        assert "Chrome/153.0.0.0" in request.headers["user-agent"]
        assert request.headers["referer-data"] == ('{"fromFilter":"true"}' if product == "third_motor"
                                                    else '{"sort":"cheapestPrice"}')
        assert "cookie" not in request.headers
        return httpx.Response(200, json={"Inquiries": [{"CompanyId": 1}],
                                         "Companies": [{"Id": 1, "Title": "نمونه"}]})

    result = asyncio.run(get_prices(product, body, httpx.MockTransport(handler)))
    assert result["Inquiries"][0]["CompanyId"] == 1


def test_body_coverages_add_from_filter_header(monkeypatch):
    monkeypatch.setenv("BIMEH_TOKEN", "current-session-token")

    def handler(request):
        assert request.headers["referer-data"] == '{"fromFilter":"true"}'
        return httpx.Response(200, json={"Inquiries": [], "Companies": []})

    body = {**BODY, "CoverageIds": [3], "fromFilter": True}
    asyncio.run(get_prices("body_car", body, httpx.MockTransport(handler)))


def test_missing_token_returns_configuration_error(monkeypatch):
    from torob_bimeh.adapters.bimeh.client import BimehConfigurationError
    monkeypatch.delenv("BIMEH_TOKEN", raising=False)
    with pytest.raises(BimehConfigurationError, match="BIMEH_TOKEN"):
        asyncio.run(get_prices("third_car", THIRD))
    with TestClient(app) as client:
        result = client.post("/api/bimeh/prices", json={"product": "third_car", "body": THIRD})
        assert result.status_code == 503


def test_upstream_failure_does_not_return_archived_prices(monkeypatch):
    monkeypatch.setenv("BIMEH_TOKEN", "current-session-token")

    def handler(request):
        return httpx.Response(404, json={"message": "not found"})

    with pytest.raises(BimehUpstreamError, match="HTTP 404"):
        asyncio.run(get_prices("body_car", BODY, httpx.MockTransport(handler)))


def test_route_validates_product_and_forwards_inquiry(monkeypatch):
    async def upstream(product, body):
        assert product == "third_motor" and body == MOTOR
        return {"Inquiries": [], "Companies": []}

    monkeypatch.setattr("torob_bimeh.routers.bimeh.get_prices", upstream)
    with TestClient(app) as client:
        assert client.get("/labs/bimeh.html").status_code == 200
        result = client.post("/api/bimeh/prices", json={"product": "third_motor", "body": MOTOR})
        assert result.status_code == 200 and result.json()["Inquiries"] == []
        rejected = client.post("/api/bimeh/prices", json={"product": "body_motor", "body": MOTOR})
        assert rejected.status_code == 422
