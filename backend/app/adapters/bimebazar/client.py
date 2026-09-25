"""Fetch live JSON offers from Bimebazar's fixed GET endpoints."""

from collections.abc import Mapping

import httpx

from ..errors import InvalidProviderResponse
from ..response_log import save_response

from .contract import HOST, OFFER_PATHS, validate_offer_params


class BimebazarUpstreamError(RuntimeError):
    pass


class BimebazarInvalidResponse(InvalidProviderResponse, BimebazarUpstreamError):
    pass


async def get_offers(product: str, params: Mapping[str, object],
                     transport: httpx.AsyncBaseTransport | None = None) -> dict:
    query = validate_offer_params(params, product)
    try:
        # async with httpx.AsyncClient(timeout=30.0, follow_redirects=False, transport=transport) as client:
        #     response = await client.get("https://" + HOST + OFFER_PATHS[product],
        #                                 params=query, headers={"Accept": "application/json"})
        async with httpx.AsyncClient(
        timeout=30.0,
        follow_redirects=False,
        transport=transport
        ) as client:

            headers = {
                "Accept": "application/json",
                "User-Agent": "Mozilla/5.0",
                "Referer": "https://bimebazar.com/",
            }

            # Warm the live session before fetching offers. A supplied transport
            # is a controlled contract test and should receive only the offer request.
            if transport is None:
                await client.get("https://bimebazar.com/", headers=headers)

            # درخواست اصلی
            response = await client.get(
                "https://" + HOST + OFFER_PATHS[product],
                params=query,
                headers=headers
            )
    except httpx.RequestError as exc:
        raise BimebazarUpstreamError("ارتباط با API پیشنهادهای بیمه‌بازار برقرار نشد") from exc
    if response.is_redirect:
        raise BimebazarUpstreamError("بیمه‌بازار درخواست پیشنهادها را به مسیر دیگری هدایت کرد")
    if response.status_code != 200:
        raise BimebazarUpstreamError(f"بیمه‌بازار کد HTTP {response.status_code} برگرداند")
    try:
        data = response.json()
    except ValueError as exc:
        raise BimebazarInvalidResponse("پاسخ بیمه‌بازار JSON معتبر نیست") from exc
    if transport is None:
        await save_response("bimebazar", product, data)
    if (not isinstance(data, dict) or data.get("status") != "ok"
            or not isinstance(data.get("data"), dict)
            or not isinstance(data["data"].get("offers"), list)):
        raise BimebazarInvalidResponse("ساختار پاسخ پیشنهادهای بیمه‌بازار شناخته‌شده نیست", raw=data)
    return data
