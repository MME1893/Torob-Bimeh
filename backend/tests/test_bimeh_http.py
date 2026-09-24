"""Mock the upstream; no live quotes or credentials are used in these tests."""

import asyncio
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app.adapters.bimeh.client import BimehUpstreamError, get_prices
from app.adapters.bimeh.contract import BASE_URL, PATHS
from app.main import app
from tests.test_bimeh_contract import BODY, MOTOR, THIRD


@pytest.mark.parametrize("product,body", [("third_car", THIRD), ("body_car", BODY),
                                         ("third_motor", MOTOR)])
def test_post_sends_actual_payload_with_token_and_returns_json(product, body):
    def handler(request):
        assert request.method == "POST"
        assert str(request.url) == BASE_URL + PATHS[product]
        assert json.loads(request.content) == body
        assert request.headers.get("token")
        assert request.headers["origin"] == "https://bimeh.com"
        return httpx.Response(200, json={"Inquiries": [{"CompanyId": 1}],
                                         "Companies": [{"Id": 1, "Title": "نمونه"}]})

    result = asyncio.run(get_prices(product, body, httpx.MockTransport(handler)))
    assert result["Inquiries"][0]["CompanyId"] == 1


def test_upstream_failure_does_not_return_archived_prices():
    def handler(request):
        return httpx.Response(404, json={"message": "not found"})

    with pytest.raises(BimehUpstreamError, match="HTTP 404"):
        asyncio.run(get_prices("body_car", BODY, httpx.MockTransport(handler)))


def test_route_validates_product_and_forwards_inquiry(monkeypatch):
    async def upstream(product, body):
        assert product == "third_motor" and body == MOTOR
        return {"Inquiries": [], "Companies": []}

    monkeypatch.setattr("app.routers.bimeh.get_prices", upstream)
    with TestClient(app) as client:
        assert client.get("/labs/bimeh.html").status_code == 200
        result = client.post("/api/bimeh/prices", json={"product": "third_motor", "body": MOTOR})
        assert result.status_code == 200 and result.json()["Inquiries"] == []
        rejected = client.post("/api/bimeh/prices", json={"product": "body_motor", "body": MOTOR})
        assert rejected.status_code == 422
