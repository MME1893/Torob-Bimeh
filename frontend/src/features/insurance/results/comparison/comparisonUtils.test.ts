import { describe, expect, it } from "vitest";
import type { Offer, Metrics } from "../../../search/searchTypes";
import {
  COMPARISON_ROWS,
  UNKNOWN,
  buildComparisonCaveats,
  getBranchCount,
  getComparisonBenefits,
  getComparisonDiscount,
  getComparisonPrice,
  getCoverageDuration,
  getFinancialCoverage,
  getOnlineClaimsLabel,
  getOnlineClaimsStatus,
  getPaymentLabel,
  getPaymentProgramLabel,
} from "./comparisonUtils";

const metrics = (overrides: Partial<Metrics>): Metrics => ({
  satisfaction: null,
  financial_strength: null,
  solvency_level: null,
  market_share_percent: null,
  branches_count: null,
  claim_centers_count: null,
  complaint_response_time: null,
  mobile_compensation: null,
  online_claims: null,
  online_issue: null,
  ...overrides,
});

const offer = (overrides: Partial<Offer> = {}): Offer => ({
  insurer_name: "رازی",
  provider: "azki",
  premium: { raw_amount: 1, raw_unit: "toman", amount_toman: 5_000_000 },
  price_before_discount_toman: null,
  discount_amount_toman: null,
  discount_percent: null,
  has_installments: null,
  installment_plans: [],
  payment_methods: [],
  penalty: null,
  price_breakdown: [],
  discount_breakdown: [],
  insurer_metrics: null,
  benefits: [],
  badges: [],
  is_recommended: null,
  sale_rank: null,
  financial_coverage_toman: null,
  duration_months: null,
  raw_offer: {},
  ...overrides,
});

const plan = (title: string) => ({
  title,
  plan_type: null,
  is_credit: null,
  installment_count: 12,
  down_payment_toman: null,
  total_payable_toman: null,
  operation_cost_toman: null,
  operation_cost_in_installments: null,
  payments: [],
});

describe("row order", () => {
  it("matches the reference order and labels", () => {
    expect(COMPARISON_ROWS.map((row) => row.key)).toEqual([
      "price",
      "discount",
      "paymentType",
      "paymentProgram",
      "duration",
      "financialCoverage",
      "onlineClaims",
      "branches",
      "benefits",
    ]);
    expect(COMPARISON_ROWS[0].label).toBe("قیمت نهایی");
    expect(COMPARISON_ROWS.at(-1)?.label).toBe("مزایا");
  });
});

describe("final price", () => {
  it("formats the factual premium in toman without recalculating it", () => {
    const text = getComparisonPrice(offer({ premium: { raw_amount: 1, raw_unit: "toman", amount_toman: 2_979_047 } }));
    expect(text).toBe("۲٬۹۷۹٬۰۴۷ تومان");
  });

  it("shows the unknown marker for a missing premium", () => {
    expect(getComparisonPrice(offer({ premium: { raw_amount: 0, raw_unit: "toman", amount_toman: null } }))).toBe(UNKNOWN);
  });

  it("renders zero as a real value, not as missing", () => {
    expect(getComparisonPrice(offer({ premium: { raw_amount: 0, raw_unit: "toman", amount_toman: 0 } }))).toBe("۰ تومان");
  });
});

describe("discount", () => {
  it("shows the amount and the percent when both exist", () => {
    const text = getComparisonDiscount(offer({ discount_amount_toman: 2_979_047, discount_percent: 12 }));
    expect(text).toContain("۲٬۹۷۹٬۰۴۷ تومان");
    expect(text).toContain("۱۲٪");
  });

  it("shows only the amount when no percent was reported", () => {
    expect(getComparisonDiscount(offer({ discount_amount_toman: 500_000 }))).toBe("۵۰۰٬۰۰۰ تومان");
  });

  it("does not invent a discount", () => {
    expect(getComparisonDiscount(offer())).toBe(UNKNOWN);
  });
});

describe("payment", () => {
  it("reports the installment flag from the offer", () => {
    expect(getPaymentLabel(offer({ has_installments: true }))).toBe("خرید اقساطی");
  });

  it("falls back to the first declared payment method", () => {
    expect(getPaymentLabel(offer({ payment_methods: ["نقدی", "کارت"] }))).toBe("نقدی");
  });

  it("does not infer installments from a null flag", () => {
    expect(getPaymentLabel(offer({ has_installments: null, payment_methods: [] }))).toBe(UNKNOWN);
  });

  it("counts the actual installment plans", () => {
    expect(getPaymentProgramLabel(offer({ installment_plans: [plan("الف"), plan("ب")] }))).toBe("۲ برنامه");
    expect(getPaymentProgramLabel(offer())).toBe(UNKNOWN);
  });
});

describe("coverage", () => {
  it("formats the duration", () => {
    expect(getCoverageDuration(offer({ duration_months: 12 }))).toBe("۱۲ ماه");
    expect(getCoverageDuration(offer())).toBe(UNKNOWN);
  });

  it("formats the financial coverage", () => {
    expect(getFinancialCoverage(offer({ financial_coverage_toman: 70_000_000 }))).toBe("۷۰٬۰۰۰٬۰۰۰ تومان");
    expect(getFinancialCoverage(offer())).toBe(UNKNOWN);
  });
});

describe("online claims: false is not unknown", () => {
  it("distinguishes true, false and null", () => {
    expect(getOnlineClaimsStatus(offer({ insurer_metrics: metrics({ online_claims: true }) }))).toBe("yes");
    expect(getOnlineClaimsStatus(offer({ insurer_metrics: metrics({ online_claims: false }) }))).toBe("no");
    expect(getOnlineClaimsStatus(offer({ insurer_metrics: metrics({ online_claims: null }) }))).toBe("unknown");
  });

  it("treats an absent metrics block as unknown, never as false", () => {
    expect(getOnlineClaimsStatus(offer())).toBe("unknown");
  });

  it("labels every state distinctly", () => {
    expect(getOnlineClaimsLabel(offer({ insurer_metrics: metrics({ online_claims: true }) }))).toBe("دارد");
    expect(getOnlineClaimsLabel(offer({ insurer_metrics: metrics({ online_claims: false }) }))).toBe("ندارد");
    expect(getOnlineClaimsLabel(offer())).toBe("اطلاعات موجود نیست");
  });
});

describe("branches", () => {
  it("formats a reported branch count", () => {
    expect(getBranchCount(offer({ insurer_metrics: metrics({ branches_count: 58 }) }))).toBe("۵۸ شعبه");
  });

  it("shows the unknown marker when the provider reported nothing", () => {
    expect(getBranchCount(offer({ insurer_metrics: metrics({ branches_count: null }) }))).toBe(UNKNOWN);
    expect(getBranchCount(offer())).toBe(UNKNOWN);
  });
});

describe("benefits", () => {
  it("deduplicates benefits and badges and caps the visible list", () => {
    const { shown, hidden } = getComparisonBenefits(
      offer({
        benefits: ["خسارت آنلاین", "پشتیبانی ۲۴ ساعته", "شبکه سراسری", "BONUS"],
        badges: ["خسارت آنلاین", "نشان برتر"],
      }),
    );
    expect(shown).toHaveLength(3);
    expect(shown[0]).toBe("خسارت آنلاین");
    // 5 unique entries, 3 shown, and the remainder is reported, not discarded silently.
    expect(hidden).toBe(2);
  });

  it("reports nothing hidden for a short list", () => {
    expect(getComparisonBenefits(offer({ benefits: ["یک"] }))).toEqual({ shown: ["یک"], hidden: 0 });
  });

  it("ignores blank entries", () => {
    expect(getComparisonBenefits(offer({ benefits: ["  ", ""] })).shown).toEqual([]);
  });
});

describe("deterministic caveats", () => {
  it("always gives the two general product notes", () => {
    const notes = buildComparisonCaveats([offer(), offer()]);
    expect(notes[0]).toBe("شرایط اقساط، خدمات و پوشش در همه منابع یکسان نیست.");
    expect(notes.at(-1)).toBe("برای تصمیم نهایی، جزئیات هر پیشنهاد را نیز بررسی کنید.");
  });

  it("mentions a missing price only when a compared offer lacks one", () => {
    const mixed = buildComparisonCaveats([offer(), offer({ premium: { raw_amount: 0, raw_unit: "toman", amount_toman: null } })]);
    expect(mixed.some((note) => note.includes("قیمت نهایی"))).toBe(true);
    const complete = buildComparisonCaveats([offer(), offer()]);
    expect(complete.some((note) => note.includes("قیمت نهایی"))).toBe(false);
  });

  it("mentions unreported installments without claiming a provider lacks them", () => {
    const notes = buildComparisonCaveats([offer({ has_installments: true }), offer({ has_installments: null })]);
    expect(notes.some((note) => note.includes("اقساطی"))).toBe(true);
  });

  it("mentions differing coverage durations", () => {
    const notes = buildComparisonCaveats([offer({ duration_months: 6 }), offer({ duration_months: 12 })]);
    expect(notes.some((note) => note.includes("مدت پوشش"))).toBe(true);
  });

  it("stays quiet about durations when they all match", () => {
    const notes = buildComparisonCaveats([offer({ duration_months: 12 }), offer({ duration_months: 12 })]);
    expect(notes.some((note) => note.includes("مدت پوشش"))).toBe(false);
  });

  it("mentions unreported online-claims status without calling it absent", () => {
    const notes = buildComparisonCaveats([
      offer({ insurer_metrics: metrics({ online_claims: true }) }),
      offer({ insurer_metrics: metrics({ online_claims: null }) }),
    ]);
    expect(notes.some((note) => note.includes("خسارت آنلاین"))).toBe(true);
  });

  it("never claims a provider-specific fact that no compared offer supports", () => {
    const notes = buildComparisonCaveats([
      offer({ has_installments: true, duration_months: 12, financial_coverage_toman: 70_000_000, insurer_metrics: metrics({ online_claims: true, branches_count: 58 }) }),
      offer({ has_installments: true, duration_months: 12, financial_coverage_toman: 70_000_000, insurer_metrics: metrics({ online_claims: true, branches_count: 58 }) }),
    ]);
    expect(notes).toHaveLength(2);
  });
});
