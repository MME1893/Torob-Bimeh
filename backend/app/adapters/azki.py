"""Fetch current Azki third-party quotations through a fixed server-side endpoint."""

from typing import Mapping

import httpx

from .azki_contract import THIRD_PATH, make_headers, validate_price_params


class AzkiUpstreamError(RuntimeError):
    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


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
    if response.is_redirect:
        raise AzkiUpstreamError("ازکی درخواست قیمت را به مسیر دیگری هدایت کرد")
    if response.status_code != 200:
        raise AzkiUpstreamError(f"ازکی کد HTTP {response.status_code} برگرداند")
    try:
        data = response.json()
    except ValueError as exc:
        raise AzkiUpstreamError("پاسخ ازکی JSON معتبر نیست") from exc
    if not isinstance(data, dict) or not any(isinstance(data.get(k), list) for k in ("top", "bottom", "others")):
        raise AzkiUpstreamError("ساختار پاسخ قیمت ازکی شناخته‌شده نیست")
    return data
