"""Parse provider offers into comparable, evidence-backed product details."""

from datetime import datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import re

from .quotes import (
    InsurerMetrics,
    InstallmentPayment,
    InstallmentPlan,
    MoneyDetail,
    Offer,
    PenaltyDetails,
    Premium,
    ProviderResult,
)
from .pricing import to_toman
from .third_mapping import MONTH_TITLES


def _decimal(value):
    if isinstance(value, bool) or value is None:
        return None
    try:
        number = Decimal(str(value).strip())
    except (InvalidOperation, ValueError, AttributeError):
        return None
    return number if number.is_finite() and number >= 0 else None


def _amount(value):
    number = _decimal(value)
    if number is None or number != number.to_integral_value():
        raise ValueError("مبلغ پیشنهاد معتبر نیست")
    return int(number)


def _money_toman(value, unit):
    """Convert optional response money, including fractional rial details."""
    number = _decimal(value)
    if number is None:
        return None
    if unit == "rial":
        number /= 10
    elif unit != "toman":
        return None
    return int(number.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _integer(value):
    number = _decimal(value)
    return int(number) if number is not None and number == number.to_integral_value() else None


def _number(value):
    number = _decimal(value)
    return float(number) if number is not None else None


def _boolean(value):
    return value if isinstance(value, bool) else None


def _texts(*values):
    """Collect short display text without exposing long/raw provider payloads."""
    result = []

    def visit(value):
        if isinstance(value, str):
            text = value.strip()
            words = text.split()
            for size in range(1, len(words) // 2 + 1):
                if len(words) % size == 0 and words == words[:size] * (len(words) // size):
                    text = " ".join(words[:size])
                    break
            if text and text not in {"-", "//"} and text not in result:
                result.append(text)
        elif isinstance(value, list):
            for item in value:
                visit(item)
        elif isinstance(value, dict):
            for key in ("title", "text", "label", "name"):
                if key in value:
                    visit(value[key])
                    break

    for value in values:
        visit(value)
    return result


def _details(unit, *items, include_zero=False):
    result = []
    for label, value in items:
        amount = _money_toman(value, unit)
        if amount is not None and (include_zero or amount > 0):
            result.append(MoneyDetail(label=label, amount_toman=amount))
    return result


def _metrics(**values):
    present = {key: value for key, value in values.items() if value is not None}
    return InsurerMetrics(**present) if present else None


def _penalty(*, days=None, total=None, daily=None, unit="toman",
             forgiven=None, description=None):
    fields = {
        "days": _integer(days),
        "total_toman": _money_toman(total, unit),
        "daily_toman": _money_toman(daily, unit),
        "forgiven": _boolean(forgiven),
        "description": description.strip() if isinstance(description, str) and description.strip() else None,
    }
    return PenaltyDetails(**fields) if any(value is not None for value in fields.values()) else None


def _azki_installments(price):
    plans = []
    for raw_plan in price.get("monthlyInstallments") or []:
        if not isinstance(raw_plan, dict):
            continue
        payments = []
        for sequence, raw_payment in enumerate(raw_plan.get("installments") or []):
            if not isinstance(raw_payment, dict):
                continue
            amount = _money_toman(raw_payment.get("price"), "toman")
            if amount is None:
                continue
            month = _integer(raw_payment.get("month"))
            due_date = raw_payment.get("dueDate")
            payments.append(InstallmentPayment(
                sequence=sequence, amount_toman=amount, months_after_purchase=month,
                due_date=due_date if isinstance(due_date, str) and due_date else None,
                is_down_payment=month == 0,
            ))
        if not payments:
            continue
        down_payments = [payment.amount_toman for payment in payments if payment.is_down_payment]
        count = sum(payment.months_after_purchase is not None and
                    payment.months_after_purchase > 0 for payment in payments)
        title = raw_plan.get("label") or raw_plan.get("title") or "پرداخت اقساطی"
        plans.append(InstallmentPlan(
            title=str(title),
            plan_type=str(raw_plan["type"]) if raw_plan.get("type") is not None else None,
            is_credit=_boolean(raw_plan.get("credit")), installment_count=count,
            down_payment_toman=sum(down_payments) if down_payments else None,
            total_payable_toman=sum(payment.amount_toman for payment in payments),
            operation_cost_toman=_money_toman(raw_plan.get("operationCost"), "toman"),
            operation_cost_in_installments=_boolean(raw_plan.get("operationCostInInstallment")),
            payments=payments,
        ))
    return plans


def _bimebazar_installments(row, selected_tariff):
    raw_plans = selected_tariff.get("installment_plans") or row.get("installment_plans") or []
    tara_plans = row.get("tara_installment_plans") or []
    raw_plans = [*raw_plans, *tara_plans]
    plans = []
    titles = {
        "bb_bnpl": "خرید اعتباری بیمه‌بازار",
        "bnpl": "خرید اعتباری",
        "promissory": "پرداخت با سفته",
        "tara": "اعتبار تارا",
    }
    for raw_plan in raw_plans:
        if not isinstance(raw_plan, dict):
            continue
        prices = raw_plan.get("installment_payment_prices") or []
        due_dates = raw_plan.get("installments_due") or []
        raw_months = str(raw_plan.get("payback_due") or "").split(",")
        payments = []
        for sequence, raw_price in enumerate(prices):
            amount = _money_toman(raw_price, "toman")
            if amount is None:
                continue
            month = _integer(raw_months[sequence]) if sequence < len(raw_months) else sequence
            due_date = due_dates[sequence] if sequence < len(due_dates) else None
            payments.append(InstallmentPayment(
                sequence=sequence, amount_toman=amount, months_after_purchase=month,
                due_date=due_date if isinstance(due_date, str) and due_date else None,
                is_down_payment=month == 0,
            ))
        if not payments:
            continue
        plan_type = str(raw_plan.get("installment_type") or "") or None
        count = sum(payment.months_after_purchase is not None and
                    payment.months_after_purchase > 0 for payment in payments)
        down_payments = [payment.amount_toman for payment in payments if payment.is_down_payment]
        title = titles.get(plan_type, "پرداخت اقساطی")
        plans.append(InstallmentPlan(
            title=title, plan_type=plan_type,
            is_credit=True if plan_type and ("bnpl" in plan_type or plan_type == "tara") else None,
            installment_count=count,
            down_payment_toman=sum(down_payments) if down_payments else None,
            total_payable_toman=_money_toman(raw_plan.get("price_with_interest"), "toman"),
            operation_cost_toman=_money_toman(
                raw_plan.get("operational_cost_total", raw_plan.get("interest_rate")), "toman"),
            operation_cost_in_installments=_boolean(raw_plan.get("operational_cost_split_applied")),
            payments=payments,
        ))
    return plans


def normalize(provider: str, data: dict, fetched_at: datetime, product: str,
              duration: int, coverage: int) -> ProviderResult:
    offers = []
    unit = "rial" if provider in ("sabim", "bimeh") else "toman"

    def add(name, amount, source, *, key=None, offer_id=None, months=None,
            coverage_amount=None, installments=None, installment_plans=None,
            payment_methods=None, penalty=None, price_breakdown=None,
            discount_breakdown=None, insurer_metrics=None, benefits=None,
            badges=None, is_recommended=None, sale_rank=None, codes=None,
            original_amount=None):
        if not isinstance(name, str) or not name.strip() or not isinstance(source, dict):
            raise ValueError("اطلاعات شرکت یا پیشنهاد ناقص است")
        raw_amount = _amount(amount)
        amount_toman = to_toman(raw_amount, unit)
        original_toman = None
        if original_amount is not None:
            original_toman = to_toman(_amount(original_amount), unit)
            if original_toman <= amount_toman:
                original_toman = None
        discount_toman = original_toman - amount_toman if original_toman is not None else None
        discount_percent = (round(discount_toman * 100 / original_toman, 2)
                            if discount_toman is not None and original_toman else None)
        plans = installment_plans or []
        offers.append(Offer(
            provider=provider, product=product, insurer_name=name.strip(),
            insurer_key=str(key) if key is not None else None,
            provider_offer_id=str(offer_id) if offer_id is not None else None,
            premium=Premium(raw_amount=raw_amount, raw_unit=unit, amount_toman=amount_toman),
            price_before_discount_toman=original_toman,
            discount_amount_toman=discount_toman, discount_percent=discount_percent,
            duration_months=months, financial_coverage_toman=coverage_amount,
            has_installments=(installments if installments is not None else
                              (True if plans else None)),
            installment_plans=plans, payment_methods=payment_methods or [], penalty=penalty,
            price_breakdown=price_breakdown or [], discount_breakdown=discount_breakdown or [],
            insurer_metrics=insurer_metrics, benefits=benefits or [], badges=badges or [],
            is_recommended=is_recommended, sale_rank=sale_rank, coverage_codes=codes or [],
            fetched_at=fetched_at, raw_offer=source,
        ))

    if provider == "azki":
        present_groups = [data[group] for group in ("top", "bottom", "others") if group in data]
        if not present_groups or any(not isinstance(group, list) for group in present_groups):
            raise ValueError("فهرست پیشنهادهای ازکی معتبر نیست")
        for companies in present_groups:
            for company in companies:
                if product == "body_car":
                    amount = company.get("discountedPrice")
                    if amount is None:
                        amount = company.get("price")
                    plans = _azki_installments(company)
                    methods = []
                    if plans or any(option.get("enable") for option in company.get("installments", [])
                                    if isinstance(option, dict)):
                        methods.append("اقساط")
                    if any(plan.is_credit for plan in plans):
                        methods.append("اعتباری")
                    add(
                        company["title"], amount, company, key=company.get("id"),
                        months=12, installments=bool(methods), installment_plans=plans,
                        payment_methods=methods,
                        discount_breakdown=_details(
                            "toman", ("تخفیف ازکی", company.get("bimitoDiscount")),
                            ("هدیه", company.get("giftAmount"))),
                        insurer_metrics=_metrics(
                            satisfaction=_number(company.get("satisfaction")),
                            financial_strength=_number(company.get("wealthLevel")),
                            branches_count=_integer(company.get("branchNumber")),
                            complaint_response_time=_number(company.get("complaintResponseTime")),
                            online_claims=_boolean(company.get("onlineDamage"))),
                        benefits=_texts(company.get("features"), company.get("giftTitle")),
                        badges=_texts(company.get("badges"), company.get("stick"),
                                      company.get("discountTitle")),
                        original_amount=company.get("price"),
                    )
                    continue
                prices = company.get("prices")
                if not isinstance(prices, list):
                    raise ValueError("قیمت‌های پیشنهاد ازکی معتبر نیست")
                for price in prices:
                    if int(price.get("durationID", -1)) != duration or int(price.get("coverAmount", -1)) != coverage:
                        continue
                    amount = price.get("discountedPrice")
                    if amount is None:
                        amount = price.get("price")
                    plans = _azki_installments(price)
                    installment_options = company.get("installments") or []
                    methods = []
                    if plans or any(option.get("enable") for option in installment_options if isinstance(option, dict)):
                        methods.append("اقساط")
                    if any(plan.is_credit for plan in plans):
                        methods.append("اعتباری")
                    add(
                        company["title"], amount, {"company": company, "price": price},
                        key=company.get("id"), months=duration, coverage_amount=coverage,
                        installments=bool(methods), installment_plans=plans, payment_methods=methods,
                        penalty=_penalty(
                            days=price.get("penaltyDays"), total=price.get("totalPenalty"),
                            daily=price.get("penaltyAmount"), forgiven=price.get("penaltyForgiveness"),
                            description=price.get("forgivenessDescription"),
                        ),
                        discount_breakdown=_details(
                            "toman", ("تخفیف ازکی", price.get("bimitoDiscount")),
                            ("هدیه", price.get("giftAmount")),
                            ("مزیت مقایسه", price.get("compareBenefitDiscountAmount")),
                            ("بازگشت نقدی", price.get("cashBackAmount")),
                        ),
                        insurer_metrics=_metrics(
                            satisfaction=_number(company.get("satisfaction")),
                            financial_strength=_number(company.get("wealthLevel")),
                            branches_count=_integer(company.get("branchNumber")),
                            complaint_response_time=_number(company.get("complaintResponseTime")),
                            online_claims=_boolean(company.get("onlineDamage")),
                        ),
                        benefits=_texts(price.get("features"), company.get("giftTitle")),
                        badges=_texts(price.get("badges"), company.get("stick"), company.get("discountTitle")),
                        is_recommended=_boolean(price.get("azkiRecommendation")),
                        original_amount=price.get("price"),
                    )
    elif provider == "bimebazar":
        if data.get("status") != "ok" or not isinstance(data.get("data", {}).get("offers"), list):
            raise ValueError("فهرست پیشنهادهای بیمه‌بازار معتبر نیست")
        for row in data["data"]["offers"]:
            selected_tariff = next((item for item in row.get("tariffs", [])
                                    if int(item.get("financial_coverage", -1)) == coverage), {})
            original = selected_tariff.get("tariff_without_discount")
            if original is None and row.get("total_discount_value") is not None:
                original = _amount(row["tariff"]) + _amount(row["total_discount_value"])
            plans = _bimebazar_installments(row, selected_tariff)
            method_fields = (
                ("has_installment_payment", "اقساط"), ("has_promissory_payment", "سفته"),
                ("has_bb_bnpl_payment", "اعتبار بیمه‌بازار"),
                ("has_non_cheque_installment_payment", "بدون چک"),
                ("has_bnpl_payment", "خرید اعتباری"), ("has_tara_payment", "اعتبار تارا"),
            )
            methods = [label for field, label in method_fields if row.get(field) is True]
            benefits = _texts(
                row.get("promotion_texts"), row.get("label"), row.get("description"),
                row.get("popup_label"), row.get("promissory_label"), row.get("bottom_label"),
                row.get("top_label"), row.get("right_label"),
            )
            if row.get("has_payment_on_delivery") is True:
                benefits.append("پرداخت در محل")
            if row.get("cheque_image_required") is True:
                benefits.append("نیازمند تصویر چک")
            if row.get("has_express") not in (None, False, "no_express"):
                benefits.append("ارسال سریع")
            add(
                row["company_name"], row["tariff"], row, key=row.get("cid"),
                installments=bool(methods or plans), installment_plans=plans, payment_methods=methods,
                penalty=_penalty(days=row.get("delay"), total=row.get("delay_penalty"),
                                 daily=row.get("daily_delay_cost")),
                price_breakdown=_details("toman", ("نرخ پایه", row.get("base_tariff")),
                                         ("مالیات", row.get("tax"))),
                discount_breakdown=_details(
                    "toman", ("تخفیف ویژه", row.get("special_discount")),
                    ("تخفیف بیمه‌بازار", row.get("extra_bimebazar_discount_value")),
                    ("تخفیف نمایندگی", row.get("agency_bimebazar_discount")),
                    ("تخفیف اقساط", row.get("installment_discount_value")),
                ),
                insurer_metrics=_metrics(
                    satisfaction=_number(row.get("satisfaction_rate")),
                    solvency_level=_number(row.get("solvency_level")),
                    market_share_percent=_number(row.get("market_share")),
                    branches_count=_integer(row.get("branches_num")),
                    claim_centers_count=_integer(row.get("claim_center_num")),
                    complaint_response_time=_number(row.get("complaint_response_time")),
                    mobile_compensation=_boolean(row.get("has_mobile_compensation")),
                ),
                benefits=benefits, badges=_texts(row.get("top_label"), row.get("right_label")),
                original_amount=original,
            )
    elif provider == "bimeh":
        companies = {str(company["Id"]): company for company in data["Companies"]}
        durations = {str(item["Id"]): MONTH_TITLES.get(item["Title"])
                     for item in data.get("Durations", [])}
        coverages = {}
        for item in data.get("Coverages", []):
            title = str(item.get("Title", "")).translate(str.maketrans("۰۱۲۳۴۵۶۷۸۹", "0123456789"))
            match = re.fullmatch(r"\s*(\d+)\s+(میلیون|میلیارد)\s+تومان\s*", title)
            if match:
                coverages[str(item["Id"])] = int(match[1]) * (
                    1_000_000 if match[2] == "میلیون" else 1_000_000_000)
        for row in data["Inquiries"]:
            key = row["CompanyId"]
            company = companies.get(str(key))
            if not company:
                raise ValueError("شناسهٔ شرکت بیمه‌دات‌کام در Companies پیدا نشد")
            row_duration = durations.get(str(row.get("DurationId")))
            details = row.get("Details") or {}
            row_coverage = coverages.get(str(details.get("CoverageId")))
            if product != "body_car" and (row_duration != duration or row_coverage != coverage):
                continue
            methods = []
            if row.get("HasInstallments") is True:
                methods.append("اقساط")
            if row.get("HasCreditInstallments") is True:
                methods.append("اقساط اعتباری")
            if row.get("HasUserCredit") is True:
                methods.append("اعتبار کاربر")
            cash_price = row["CashPrice"]
            add(
                company["Title"], cash_price["FinalAmount"], row, key=key,
                offer_id=row.get("Id"), installments=bool(methods), payment_methods=methods,
                months=(row_duration or 12), coverage_amount=row_coverage,
                penalty=_penalty(days=details.get("PenaltyDayCount"),
                                 total=details.get("DelayPenalty"), unit="rial"),
                price_breakdown=_details(
                    "rial", ("مالیات بر ارزش افزوده", cash_price.get("VatAmount")), include_zero=True),
                insurer_metrics=_metrics(
                    satisfaction=_number(company.get("CompanySatisfiedRating")),
                    financial_strength=_number(company.get("FinancialStrength")),
                    branches_count=_integer(company.get("CompensationBranchCount")),
                    complaint_response_time=_number(company.get("CompanyResponseTime")),
                    mobile_compensation=_boolean(company.get("MobileCompensation")),
                    online_issue=_boolean(company.get("HasOnlineIssue")),
                ),
                benefits=_texts(company.get("Notice"), row.get("Title"), row.get("SubTitle"), row.get("Hint")),
                badges=_texts(company.get("Tag"), row.get("InstallmentsTag")),
                is_recommended=_boolean(row.get("Pinned")), sale_rank=_integer(row.get("SaleRank")),
                original_amount=cash_price.get("FirstAmount"),
            )
    elif provider == "sabim":
        if data.get("result") != "ok" or not isinstance(data.get("data"), list):
            raise ValueError("پاسخ قیمت سابیم موفق یا قابل شناسایی نیست")
        for row in data["data"]:
            add(
                row["company_name"], row["price"], row, key=row.get("company_id"),
                offer_id=row.get("jsonpricing_id"),
                penalty=_penalty(days=row.get("numberOfDays"), total=row.get("pricefine"), unit="rial"),
                price_breakdown=_details(
                    "rial", ("حق بیمهٔ شخص ثالث اجباری", row.get("priceForcedThird")),
                    ("حوادث سرنشین", row.get("pricePassenger")),
                    ("تعهد مالی اضافه", row.get("priceEndExtraFinancial")),
                ),
                discount_breakdown=_details(
                    "rial", ("تخفیف تعهد مالی اضافه", row.get("discExtraFinancial"))),
                insurer_metrics=_metrics(
                    satisfaction=_number(row.get("company_customer_satisfaction")),
                    financial_strength=_number(row.get("company_levelof_prosperity")),
                    claim_centers_count=_integer(row.get("company_num_branchesdamages")),
                    complaint_response_time=_number(row.get("company_timeanswer_complaints")),
                ),
                benefits=_texts(row.get("tip"), row.get("fieldcompany_desc")),
            )
    else:
        raise ValueError("پارسر این منبع هنوز تأیید نشده است")
    return ProviderResult(provider=provider, status="ok" if offers else "empty",
                          offers=offers, raw_response=data)
