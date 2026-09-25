# Captured third-car response fixtures

Only JSON **response bodies** are included, gzip compressed with mtime=0. No HAR request headers, cookies, authorization values or request URLs are committed. These are archived parser evidence, not live quotations.

- `azki-third-response.json.gz`: first car third-party compare response from `Aski.zip` (not motor/body).
- `bimebazar-third-response.json.gz`: first successful `/thirdparty/api/offers/` response from `BimehBazar.zip`.
- `bimeh-third-response.json.gz`: first successful third-party inquiry response from `Bimeh.com(1).zip`; all 188 inquiry rows and all response fields retained. Each opaque `Inquiries[].UniqueId` **value** is replaced by `archived-offer-{index}` to avoid storing encrypted ephemeral identifiers. No field was removed. Runtime responses are not subjected to this fixture-only substitution.
- `sabim-third-response.json.gz`: first successful `/api/price_thirdparty` response from the previously supplied `www.sabim.com-shakhse-sales-va-motor.har` (30 successful responses inspected).

`test_third_complete.py` verifies full-response and offer-row preservation, plus unknown premium units. Bimeh duration and financial coverage are decoded only from explicit response catalogs. Monetary premium units remain unknown for every provider.
