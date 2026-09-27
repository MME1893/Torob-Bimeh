"""Convert verified Iranian money units to whole toman for comparison."""

from decimal import Decimal, ROUND_HALF_UP


def to_toman(raw_amount: int, raw_unit: str) -> int | None:
    if type(raw_amount) is not int or raw_amount < 0:
        raise ValueError("raw_amount must be a nonnegative integer")
    if raw_unit == "toman":
        return raw_amount
    if raw_unit == "rial":
        # Provider totals commonly include a final rial digit after tax. Iranian
        # storefronts display those values as whole toman, rounded half-up.
        return int((Decimal(raw_amount) / 10).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    if raw_unit == "unknown":
        return None
    raise ValueError("unknown money unit")
