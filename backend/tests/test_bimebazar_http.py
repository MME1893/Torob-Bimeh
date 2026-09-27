"""HTTP contract tests; run with pytest after installing backend dependencies."""

import asyncio

import httpx
from fastapi.testclient import TestClient

from torob_bimeh.adapters.bimebazar.client import get_offers
from torob_bimeh.main import app
from tests.test_bimebazar_contract import CAR_BODY, CAR_THIRD, MOTOR_THIRD


def test_motor_uses_get_on_fixed_offer_path():
    def handler(request):
        assert request.method == "GET"
        assert request.url.host == "bimebazar.com"
        assert request.url.path == "/thirdpartymotor/api/offers/"
        assert request.url.params["car_brand"] == "one_cylinder"
        return httpx.Response(200, json={"status": "ok", "data": {"offers": [{"cid": "25"}]}})

    data = asyncio.run(get_offers("third_motor", MOTOR_THIRD, httpx.MockTransport(handler)))
    assert data["data"]["offers"][0]["cid"] == "25"


def test_car_third_and_body_keep_distinct_offer_paths():
    paths = []

    def handler(request):
        paths.append(request.url.path)
        return httpx.Response(200, json={"status": "ok", "data": {"offers": []}})

    for product, params in (("third_car", CAR_THIRD), ("body_car", CAR_BODY)):
        asyncio.run(get_offers(product, params, httpx.MockTransport(handler)))
    assert paths == ["/thirdparty/api/offers/", "/carbody/api/offers/"]


def test_local_route_rejects_compare_url_and_returns_upstream_json(monkeypatch):
    async def fake_upstream(product, params):
        assert product == "third_motor"
        assert params == MOTOR_THIRD
        return {"status": "ok", "data": {"offers": []}}

    monkeypatch.setattr("torob_bimeh.routers.bimebazar.get_offers", fake_upstream)
    with TestClient(app) as client:
        assert client.get("/labs/bimebazar.html").status_code == 200
        result = client.post("/api/bimebazar/offers", json={"product": "third_motor", "params": MOTOR_THIRD})
        assert result.status_code == 200
        assert result.json()["data"]["offers"] == []
        rejected = client.post("/api/bimebazar/offers", json={
            "product": "third_motor", "url": "https://bimebazar.com/compare/thirdpartymotor/?car_brand=x"})
        assert rejected.status_code == 422
