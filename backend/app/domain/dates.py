"""Convert an explicitly entered Persian calendar date to Gregorian ISO.

Algorithm counts days from the Jalali epoch; round-trip validation rejects
invalid month lengths, including invalid Esfand leap days.
"""

from datetime import date
import re


def jalali_to_gregorian(value: str) -> date:
    if not isinstance(value, str) or not re.fullmatch(r"14\d\d[-/]\d\d[-/]\d\d", value):
        raise ValueError("تاریخ شمسی باید ۱۴xx/ماه/روز باشد")
    jy, jm, jd = map(int, re.split("[-/]", value))
    if not 1 <= jm <= 12 or not 1 <= jd <= (31 if jm <= 6 else 30):
        raise ValueError("روز یا ماه شمسی معتبر نیست")
    y = jy + 1595
    days = -355668 + 365 * y + (y // 33) * 8 + ((y % 33 + 3) // 4)
    days += jd + (jm - 1) * 31 if jm <= 7 else jd + 186 + (jm - 7) * 30
    gy = 400 * (days // 146097)
    days %= 146097
    if days > 36524:
        gy += 100 * ((days - 1) // 36524)
        days = (days - 1) % 36524
        if days >= 365:
            days += 1
    gy += 4 * (days // 1461)
    days %= 1461
    if days > 365:
        gy += (days - 1) // 365
        days = (days - 1) % 365
    leap = gy % 4 == 0 and (gy % 100 != 0 or gy % 400 == 0)
    month_days = [31, 29 if leap else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    gm = 1
    while days >= month_days[gm - 1]:
        days -= month_days[gm - 1]
        gm += 1
    result = date(gy, gm, days + 1)
    # Day-count conversion can otherwise normalize 30 Esfand in an ordinary
    # year to 1 Farvardin; check against the next Jalali year boundary.
    if jm == 12 and jd == 30 and result >= jalali_to_gregorian(f"{jy + 1:04d}/01/01"):
        raise ValueError("اسفند این سال ۳۰ روز ندارد")
    return result
