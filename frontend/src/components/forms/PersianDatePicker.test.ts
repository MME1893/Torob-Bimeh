import { describe, expect, it } from "vitest";
import {
  isValidPersianDate,
  normalizePersianDate,
} from "./PersianDatePicker";

describe("PersianDatePicker date contract", () => {
  it("normalizes Persian and Arabic digits for API payloads", () => {
    expect(normalizePersianDate("۱۴۰۵/۰۷/۰۱")).toBe("1405/07/01");
    expect(normalizePersianDate("١٤٠٥-٠٧-٠١")).toBe("1405/07/01");
  });

  it("keeps the existing YYYY/MM/DD Jalali validation", () => {
    expect(isValidPersianDate("۱۴۰۵/۰۷/۰۱")).toBe(true);
    expect(isValidPersianDate("1405/13/01")).toBe(false);
    expect(isValidPersianDate("1405/07/31")).toBe(false);
  });
});
