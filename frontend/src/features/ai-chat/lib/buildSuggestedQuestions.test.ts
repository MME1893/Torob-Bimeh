import { describe, expect, it } from "vitest";
import type { NormalizedQuoteOffer } from "../../ai-analysis/lib/normalizeQuote";
import { buildSuggestedQuestions } from "./buildSuggestedQuestions";

const offer = (overrides: Partial<NormalizedQuoteOffer> = {}): NormalizedQuoteOffer => ({
  offer_id: "azki:ایران:0",
  insurer_name: "ایران",
  source_name: "azki",
  old_price: null,
  final_price: 1_000_000,
  discount_amount: null,
  discount_percent: null,
  installment_available: null,
  payment_program_count: 0,
  payment_terms: [],
  coverage: { financial_coverage_toman: null, duration_months: null },
  services: {
    branches_count: null,
    claim_centers_count: null,
    mobile_compensation: null,
    online_claims: null,
    online_issue: null,
  },
  benefits: [],
  badges: [],
  financial_strength: null,
  customer_satisfaction: null,
  ...overrides,
});

const term = (overrides: Partial<NormalizedQuoteOffer["payment_terms"][number]> = {}) => ({
  title: "برنامه ۱",
  plan_type: null,
  is_credit: null,
  installment_count: 12,
  down_payment_toman: null,
  total_payable_toman: null,
  operation_cost_toman: null,
  payments: [],
  ...overrides,
});

const emptyCoverage = { financial_coverage_toman: null, duration_months: null };
const emptyServices = {
  branches_count: null,
  claim_centers_count: null,
  mobile_compensation: null,
  online_claims: null,
  online_issue: null,
};

const withInstallments = offer({
  installment_available: true,
  payment_program_count: 2,
  payment_terms: [term({ down_payment_toman: 200_000, total_payable_toman: 1_400_000 })],
});

const withCoverage = offer({
  coverage: { financial_coverage_toman: 50_000_000, duration_months: 12 },
});

const withServices = offer({
  services: { ...emptyServices, branches_count: 300, mobile_compensation: true, online_claims: true },
  benefits: ["تخفیف ویژه"],
});

const priced = offer();
const discounted = offer({ offer_id: "sabim:سینا:1", discount_amount: 90_000, discount_percent: 8 });

describe("buildSuggestedQuestions", () => {
  it("returns nothing when there are no offers", () => {
    expect(buildSuggestedQuestions([], null)).toEqual([]);
  });

  it("never suggests an installment question when no installment data exists", () => {
    const questions = buildSuggestedQuestions([priced, discounted], null);
    expect(questions).toContain("کدام پیشنهاد ارزش خرید بیشتری دارد؟");
    expect(questions).not.toContain("بهترین گزینه اقساطی کدام است؟");
  });

  it("allows installment questions once installment data exists", () => {
    const questions = buildSuggestedQuestions([withInstallments, priced], null);
    expect(questions).toContain("بهترین گزینه اقساطی کدام است؟");
  });

  it("does not suggest a three-way comparison for fewer than three offers", () => {
    expect(buildSuggestedQuestions([priced, discounted], null)).not.toContain("سه پیشنهاد اول را مقایسه کن");
    expect(buildSuggestedQuestions([priced, discounted, withCoverage], null)).toContain("سه پیشنهاد اول را مقایسه کن");
  });

  it("does not suggest a limitations question without coverage data", () => {
    expect(buildSuggestedQuestions([priced], null)).not.toContain("ارزان‌ترین پیشنهاد چه محدودیت‌هایی دارد؟");
    expect(buildSuggestedQuestions([withCoverage], null)).toContain("ارزان‌ترین پیشنهاد چه محدودیت‌هایی دارد؟");
  });

  it("prioritises payment questions for the payment_terms context", () => {
    const questions = buildSuggestedQuestions([withInstallments, priced], "payment_terms");
    expect(questions[0]).toBe("کدام پیشنهاد قسط کمتری دارد؟");
    expect(questions).toContain("کمترین پیش‌پرداخت مربوط به کدام است؟");
    expect(questions).toContain("جمع پرداختی کدام گزینه کمتر است؟");
  });

  it("hides down-payment and total questions when no plan reports those values", () => {
    const bare = offer({ installment_available: true, payment_program_count: 1, payment_terms: [term()] });
    const questions = buildSuggestedQuestions([bare], "payment_terms");
    expect(questions).toContain("کدام پیشنهاد قسط کمتری دارد؟");
    expect(questions).not.toContain("کمترین پیش‌پرداخت مربوط به کدام است؟");
    expect(questions).not.toContain("جمع پرداختی کدام گزینه کمتر است؟");
  });

  it("hides the two-offer payment comparison until a second plan exists", () => {
    const one = offer({ installment_available: true, payment_program_count: 1, payment_terms: [term()] });
    expect(buildSuggestedQuestions([one, priced], "payment_terms")).not.toContain(
      "شرایط پرداخت دو پیشنهاد را مقایسه کن",
    );
    expect(buildSuggestedQuestions([withInstallments, offer({ installment_available: true })], "payment_terms")).toContain(
      "شرایط پرداخت دو پیشنهاد را مقایسه کن",
    );
  });

  it("prioritises services and coverage questions for coverage_services", () => {
    const questions = buildSuggestedQuestions([withServices, priced], "coverage_services");
    expect(questions[0]).toBe("کدام بیمه خدمات کامل‌تری دارد؟");
    expect(questions).toContain("کدام شرکت شعب بیشتری دارد؟");
    expect(questions).toContain("کدام گزینه خسارت آنلاین دارد؟");
  });

  it("hides the online-claims question when no offer reports it", () => {
    const noOnline = offer({ services: { ...emptyServices, branches_count: 10 } });
    expect(buildSuggestedQuestions([noOnline], "coverage_services")).not.toContain("کدام گزینه خسارت آنلاین دارد؟");
  });

  it("prioritises price and value questions for price_value", () => {
    const questions = buildSuggestedQuestions([priced, discounted, withCoverage], "price_value");
    expect(questions[0]).toBe("ارزان‌ترین پیشنهاد کدام است؟");
    expect(questions).toContain("ارزان‌ترین با بهترین ارزش خرید چه تفاوتی دارد؟");
    expect(questions).toContain("کدام تخفیف ارزش بیشتری ایجاد کرده است؟");
  });

  it("hides the discount question when no offer carries a discount", () => {
    expect(buildSuggestedQuestions([priced, withCoverage], "price_value")).not.toContain(
      "کدام تخفیف ارزش بیشتری ایجاد کرده است؟",
    );
  });

  it("uses smart-summary questions for the smart_summary context", () => {
    const questions = buildSuggestedQuestions([priced, discounted, withCoverage], "smart_summary");
    expect(questions[0]).toBe("چرا این پیشنهادها برجسته شده‌اند؟");
    expect(questions).toContain("چه اطلاعاتی برای مقایسه کامل نیست؟");
  });

  it("never returns duplicates or exceeds the requested limit", () => {
    const many = Array.from({ length: 6 }, (_, index) =>
      offer({
        offer_id: `azki:شرکت${index}:${index}`,
        installment_available: true,
        discount_amount: 10,
        coverage: { ...emptyCoverage, duration_months: 12 },
        services: { ...emptyServices, branches_count: 5, online_claims: true },
        benefits: ["مزیت ثبت‌شده"],
      }),
    );
    const questions = buildSuggestedQuestions(many, "coverage_services");
    expect(questions).toHaveLength(4);
    expect(new Set(questions).size).toBe(questions.length);
    expect(buildSuggestedQuestions(many, "payment_terms", 2)).toHaveLength(2);
  });
});
