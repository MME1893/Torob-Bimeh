"""Forward Bimeh.com JSON inquiries from the server; never replay captured HAR responses."""

import os
from uuid import uuid4

import httpx

from .contract import BASE_URL, PATHS, validate_inquiry

# HAR requests share a UUID v4 token across a browser session. Keep one per server
# process unless the operator supplies their own current session token.
_SESSION_TOKEN = str(uuid4())


class BimehUpstreamError(RuntimeError):
    pass


async def get_prices(product: str, body: dict,
                     transport: httpx.AsyncBaseTransport | None = None):
    inquiry = validate_inquiry(product, body)
    token = os.getenv("BIMEH_TOKEN") or _SESSION_TOKEN
    headers = {"Accept": "application/json", "Origin": "https://bimeh.com",
               "Referer": "https://bimeh.com/", "token": token}
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=False, transport=transport) as client:
            response = await client.post(BASE_URL + PATHS[product], json=inquiry, headers=headers)
    except httpx.RequestError as exc:
        raise BimehUpstreamError("ارتباط با API بیمه‌دات‌کام برقرار نشد") from exc
    if response.is_redirect:
        raise BimehUpstreamError("API بیمه‌دات‌کام درخواست قیمت را تغییر مسیر داد")
    if response.status_code != 200:
        raise BimehUpstreamError(f"API بیمه‌دات‌کام HTTP {response.status_code} برگرداند")
    try:
        data = response.json()
    except ValueError as exc:
        raise BimehUpstreamError("پاسخ بیمه‌دات‌کام JSON معتبر نیست") from exc
    if not isinstance(data, dict) or not isinstance(data.get("Inquiries"), list) or not isinstance(data.get("Companies"), list):
        raise BimehUpstreamError("پاسخ بیمه‌دات‌کام فاقد Inquiries یا Companies است")
    return data
