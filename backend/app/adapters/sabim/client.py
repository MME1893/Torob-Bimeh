"""Send the lab's query to Sabim as POST with an empty JSON body."""

from typing import Mapping

import httpx

from ..errors import InvalidProviderResponse
from ..response_log import save_response

from .contract import BASE_URL, PATHS, validate_query


class SabimUpstreamError(RuntimeError):
    pass


class SabimInvalidResponse(InvalidProviderResponse, SabimUpstreamError):
    pass


async def get_prices(product: str, query: Mapping[str, object],
                     transport: httpx.AsyncBaseTransport | None = None):
    pairs = validate_query(product, query)
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=False, transport=transport) as client:
            response = await client.post(BASE_URL + PATHS[product], params=pairs, json={},
                                         headers={"Accept": "application/json"})
    except httpx.RequestError as exc:
        raise SabimUpstreamError("ارتباط با API قیمت سابیم برقرار نشد") from exc
    if response.is_redirect:
        raise SabimUpstreamError("سابیم درخواست قیمت را به مسیر دیگری هدایت کرد")
    if response.status_code != 200:
        raise SabimUpstreamError(f"سابیم کد HTTP {response.status_code} برگرداند")
    try:
        data = response.json()
    except ValueError as exc:
        raise SabimInvalidResponse("پاسخ قیمت سابیم JSON معتبر نیست") from exc
    if transport is None:
        await save_response("sabim", product, data)
    if not isinstance(data, (dict, list)):
        raise SabimInvalidResponse("ساختار JSON قیمت سابیم شناخته‌شده نیست", raw=data)
    return data
