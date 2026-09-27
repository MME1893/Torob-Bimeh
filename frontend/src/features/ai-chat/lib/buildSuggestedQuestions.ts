import type { AnalysisSectionKey } from "../../ai-analysis/lib/types";
import type { NormalizedQuoteOffer, NormalizedQuoteServices } from "../../ai-analysis/lib/normalizeQuote";
import { MAX_INITIAL_QUESTIONS, type ChatContextType } from "../types";

/**
 * Builds the initial suggestion chips deterministically from the stored inquiry.
 *
 * This never calls the AI: every question is only offered when the normalized
 * quote actually contains the field that would be needed to answer it.
 */

type Guards = {
  priced: boolean;
  twoPriced: boolean;
  threeOffers: boolean;
  discounted: boolean;
  installment: boolean;
  downPayment: boolean;
  totalPayable: boolean;
  twoWithPayment: boolean;
  coverage: boolean;
  services: boolean;
  benefits: boolean;
  branches: boolean;
  onlineClaims: boolean;
};

function inspect(offers: NormalizedQuoteOffer[]): Guards {
  const priced = offers.filter((offer) => offer.final_price != null);
  const withPlans = offers.filter(
    (offer) => offer.installment_available === true || offer.payment_program_count > 0,
  );
  const terms = offers.flatMap((offer) => offer.payment_terms);
  const services = offers.map((offer) => offer.services);
  const hasService = (key: keyof NormalizedQuoteServices) =>
    services.some((item) => item && item[key] != null);
  return {
    priced: priced.length > 0,
    twoPriced: priced.length > 1,
    threeOffers: offers.length >= 3,
    discounted: offers.some(
      (offer) => !!offer.discount_amount || (offer.discount_percent ?? 0) > 0,
    ),
    installment: withPlans.length > 0,
    downPayment: terms.some((term) => term.down_payment_toman != null),
    totalPayable: terms.some((term) => term.total_payable_toman != null),
    twoWithPayment: withPlans.length > 1,
    coverage: offers.some(
      (offer) => offer.coverage?.financial_coverage_toman != null || offer.coverage?.duration_months != null,
    ),
    services: hasService("branches_count") || hasService("claim_centers_count"),
    benefits: offers.some((offer) => offer.benefits.length > 0 || offer.badges.length > 0),
    branches: hasService("branches_count"),
    onlineClaims: hasService("online_claims"),
  };
}

/** Every catalog variant. A section thread borrows its section's own catalog. */
type CatalogKey = AnalysisSectionKey | "inquiry" | "comparison";

const CATALOG: Record<CatalogKey, Array<[string, keyof Guards]>> = {
  inquiry: [    ["کدام پیشنهاد ارزش خرید بیشتری دارد؟", "priced"],
    ["بهترین گزینه اقساطی کدام است؟", "installment"],
    ["سه پیشنهاد اول را مقایسه کن", "threeOffers"],
    ["ارزان‌ترین پیشنهاد چه محدودیت‌هایی دارد؟", "coverage"],
  ],
  comparison: [
    ["کدام گزینه از نظر قیمت به‌صرفه‌تر است؟", "priced"],
    ["کدام شرایط پرداخت بهتری دارد؟", "twoWithPayment"],
    ["تفاوت پوشش و خدمات این پیشنهادها چیست؟", "coverage"],
    ["اگر خرید اقساطی مهم باشد کدام مناسب‌تر است؟", "installment"],
    ["مزیت اصلی هر کدام چیست؟", "benefits"],
  ],
  smart_summary: [
    ["چرا این پیشنهادها برجسته شده‌اند؟", "priced"],
    ["مهم‌ترین تفاوت سه پیشنهاد چیست؟", "threeOffers"],
    ["چه اطلاعاتی برای مقایسه کامل نیست؟", "priced"],
  ],
  payment_terms: [
    ["کدام پیشنهاد قسط کمتری دارد؟", "installment"],
    ["کمترین پیش‌پرداخت مربوط به کدام است؟", "downPayment"],
    ["جمع پرداختی کدام گزینه کمتر است؟", "totalPayable"],
    ["شرایط پرداخت دو پیشنهاد را مقایسه کن", "twoWithPayment"],
  ],
  coverage_services: [
    ["کدام بیمه خدمات کامل‌تری دارد؟", "services"],
    ["کدام شرکت شعب بیشتری دارد؟", "branches"],
    ["کدام گزینه خسارت آنلاین دارد؟", "onlineClaims"],
    ["کدام پیشنهاد مزیت بیشتری اعلام کرده است؟", "benefits"],
  ],
  price_value: [
    ["ارزان‌ترین پیشنهاد کدام است؟", "priced"],
    ["ارزان‌ترین با بهترین ارزش خرید چه تفاوتی دارد؟", "twoPriced"],
    ["کدام تخفیف ارزش بیشتری ایجاد کرده است؟", "discounted"],
    ["قیمت ثبت‌شده هر سه پیشنهاد را مقایسه کن", "threeOffers"],
  ],
};

/**
 * Builds the initial suggestion chips deterministically from the stored inquiry.
 *
 * This never calls the AI: every question is only offered when the normalized
 * quote actually contains the field that would be needed to answer it. The
 * caller passes the already-scoped offer list, so a comparison thread only ever
 * suggests questions its own compared offers can support.
 */
export function buildSuggestedQuestions(
  offers: NormalizedQuoteOffer[],
  sectionKey: AnalysisSectionKey | null,
  options: { contextType?: ChatContextType; limit?: number } = {},
): string[] {
  if (!offers.length) return [];
  const { contextType = "inquiry", limit = MAX_INITIAL_QUESTIONS } = options;
  const guards = inspect(offers);
  const key: CatalogKey = contextType === "comparison"
    ? "comparison"
    : sectionKey ?? "inquiry";
  const questions = CATALOG[key].filter(([, guard]) => guards[guard]).map(([question]) => question);
  return questions.slice(0, Math.max(0, limit));
}
