"""Fetch current Azki third-party and car-body quotations."""

from typing import Mapping

import httpx

from ..errors import InvalidProviderResponse

from .contract import BODY_PATH, THIRD_PATH, make_headers, validate_body_payload, validate_price_params


class AzkiUpstreamError(RuntimeError):
    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


class AzkiInvalidResponse(InvalidProviderResponse, AzkiUpstreamError):
    pass


async def get_third_prices(params: Mapping[str, object], product: str,
                           transport: httpx.AsyncBaseTransport | None = None) -> dict:
    query = validate_price_params(params)
    headers = make_headers(product)
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=False, transport=transport) as client:
            response = await client.get("https://www.azki.com" + THIRD_PATH,
                                        params=query, headers=headers)
    except httpx.RequestError as exc:
        raise AzkiUpstreamError("ارتباط با API قیمت ازکی برقرار نشد") from exc
    return _read_price_response(response)


async def get_body_prices(payload: Mapping[str, object],
                          transport: httpx.AsyncBaseTransport | None = None) -> dict:
    body = validate_body_payload(payload)
    headers = make_headers("body_car")
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=False, transport=transport) as client:
            response = await client.post("https://www.azki.com" + BODY_PATH,
                                         json=body, headers=headers)
    except httpx.RequestError as exc:
        raise AzkiUpstreamError("ارتباط با API قیمت ازکی برقرار نشد") from exc
    return _read_price_response(response)


def _read_price_response(response: httpx.Response) -> dict:
    if response.is_redirect:
        raise AzkiUpstreamError("ازکی درخواست قیمت را به مسیر دیگری هدایت کرد")
    if response.status_code != 200:
        raise AzkiUpstreamError(f"ازکی کد HTTP {response.status_code} برگرداند")
    try:
        data = response.json()
    except ValueError as exc:
        raise AzkiInvalidResponse("پاسخ ازکی JSON معتبر نیست") from exc
    if not isinstance(data, dict) or not any(isinstance(data.get(k), list) for k in ("top", "bottom", "others")):
        raise AzkiInvalidResponse("ساختار پاسخ قیمت ازکی شناخته‌شده نیست", raw=data)
    return data
