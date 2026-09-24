"""Convert only verified Iranian money units; preserve raw amounts otherwise."""


def to_toman(raw_amount: int, raw_unit: str) -> int | None:
    if type(raw_amount) is not int or raw_amount < 0:
        raise ValueError("raw_amount must be a nonnegative integer")
    if raw_unit == "toman":
        return raw_amount
    if raw_unit == "rial":
        # Do not round a fractional toman into an apparently comparable price.
        return raw_amount // 10 if raw_amount % 10 == 0 else None
    if raw_unit == "unknown":
        return None
    raise ValueError("unknown money unit")
