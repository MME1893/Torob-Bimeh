"""Parse known provider offers, retaining the complete upstream JSON.

Money units are unknown until a provider contract confirms them. An unexpected
offer shape fails the provider rather than silently dropping its rows.
"""

from datetime import datetime
from decimal import Decimal

from .quotes import Offer, Premium, ProviderResult


def _amount(value):
    if isinstance(value, bool) or not isinstance(value, (int, float, Decimal)):
        raise ValueError("مبلغ پیشنهاد عددی نیست")
    number = Decimal(str(value))
    if not number.is_finite() or number < 0 or number != number.to_integral_value():
        raise ValueError("مبلغ پیشنهاد معتبر نیست")
    return int(number)


def normalize(provider: str, data: dict, fetched_at: datetime, product: str,
              duration: int, coverage: int) -> ProviderResult:
    offers = []

    def add(name, amount, source, *, key=None, offer_id=None, months=None,
            coverage_amount=None, installments=None, codes=None):
        if not isinstance(name, str) or not name.strip() or not isinstance(source, dict):
            raise ValueError("اطلاعات شرکت یا پیشنهاد ناقص است")
        offers.append(Offer(provider=provider, product=product, insurer_name=name.strip(),
                            insurer_key=str(key) if key is not None else None,
                            provider_offer_id=str(offer_id) if offer_id is not None else None,
                            premium=Premium(raw_amount=_amount(amount), raw_unit="unknown"),
                            duration_months=months, financial_coverage_toman=coverage_amount,
                            has_installments=installments, coverage_codes=codes or [],
                            fetched_at=fetched_at, raw_offer=source))

    if provider == "azki":
        for group in ("top", "bottom", "others"):
            for company in data[group]:
                for price in company["prices"]:
                    if int(price["durationID"]) == duration and int(price["coverAmount"]) == coverage:
                        add(company["title"], price["discountedPrice"],
                            {"company": company, "price": price}, key=company.get("id"),
                            months=duration, coverage_amount=coverage,
                            installments=bool(company.get("installments")))
    elif provider == "bimebazar":
        for row in data["data"]["offers"]:
            # Offers can contain multiple terms/coverages. The upstream row is
            # retained intact and used only when its dimensions are explicit.
            add(row["company_name"], row["tariff"], row, key=row.get("cid"),
                installments=row.get("has_installment_payment"))
    elif provider == "bimeh":
        companies = {str(c["Id"]): c["Title"] for c in data["Companies"]}
        for row in data["Inquiries"]:
            key = row["CompanyId"]
            name = companies.get(str(key))
            if not name:
                raise ValueError("شناسهٔ شرکت بیمه‌دات‌کام در Companies پیدا نشد")
            add(name, row["CashPrice"]["FinalAmount"], row, key=key,
                offer_id=row.get("Id"), installments=row.get("HasInstallments"))
    else:
        raise ValueError("پارسر این منبع هنوز تأیید نشده است")
    return ProviderResult(provider=provider, status="ok" if offers else "empty",
                          offers=offers, raw_response=data)
