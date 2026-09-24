"""Forward Bimeh.com JSON inquiries from the server; never replay captured HAR responses."""

import os
import logging

import httpx

from .contract import BASE_URL, PATHS, validate_inquiry

logger = logging.getLogger(__name__)
USER_AGENT = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36")


class BimehConfigurationError(RuntimeError):
    pass


class BimehUpstreamError(RuntimeError):
    pass


async def get_prices(product: str, body: dict,
                     transport: httpx.AsyncBaseTransport | None = None):
    inquiry = validate_inquiry(product, body)
    token = os.getenv("BIMEH_TOKEN", "").strip()
    if not token:
        raise BimehConfigurationError("هدر token بیمه‌دات‌کام تنظیم نشده است؛ BIMEH_TOKEN را در backend/.env قرار دهید")
    # The captured motor requests use fromFilter; car/body requests use sorting
    # unless the body form has explicitly selected additional coverages.
    referer_data = ('{"fromFilter":"true"}' if product == "third_motor" or inquiry.get("fromFilter")
                    else '{"sort":"cheapestPrice"}')
    headers = {
        "Accept": "*/*", "Content-Type": "application/json",
        "Origin": "https://bimeh.com", "Referer": "https://bimeh.com/",
        "referer-data": referer_data, "User-Agent": USER_AGENT, "token": token,
    }
    try:
        async with httpx.AsyncClient(timeout=60.0, http2=False, follow_redirects=False,
                                     transport=transport) as client:
            response = await client.post(BASE_URL + PATHS[product], json=inquiry, headers=headers)
    except httpx.RequestError as exc:
        logger.warning("Bimeh inquiry network failure: product=%s error=%s", product, type(exc).__name__)
        raise BimehUpstreamError("ارتباط با API بیمه‌دات‌کام برقرار نشد (" + type(exc).__name__ + ")") from exc
    if response.is_redirect:
        logger.warning("Bimeh inquiry redirect: product=%s status=%s", product, response.status_code)
        raise BimehUpstreamError("API بیمه‌دات‌کام درخواست قیمت را تغییر مسیر داد")
    if response.status_code != 200:
        # Even a provider's error text can echo personal data or credentials.
        logger.warning("Bimeh inquiry failed: product=%s status=%s", product, response.status_code)
        raise BimehUpstreamError(f"API بیمه‌دات‌کام HTTP {response.status_code}")
    try:
        data = response.json()
    except ValueError as exc:
        raise BimehUpstreamError("پاسخ بیمه‌دات‌کام JSON معتبر نیست") from exc
    if not isinstance(data, dict) or not isinstance(data.get("Inquiries"), list) or not isinstance(data.get("Companies"), list):
        raise BimehUpstreamError("پاسخ بیمه‌دات‌کام فاقد Inquiries یا Companies است")
    return data
