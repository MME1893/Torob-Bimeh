import type { Offer } from "../../../search/searchTypes";
import { formatToman, number } from "../offerPresentation";

/** Shown for every field the source offer simply does not carry. */
export const UNKNOWN = "—";

export type ComparisonRowKey =
  | "price"
  | "discount"
  | "paymentType"
  | "paymentProgram"
  | "duration"
  | "financialCoverage"
  | "onlineClaims"
  | "branches"
  | "benefits";

/**
 * Row order and labels of the comparison matrix.
 *
 * Icons live in the table component, so this stays a pure, testable list.
 */
export const COMPARISON_ROWS: { key: ComparisonRowKey; label: string }[] = [
  { key: "price", label: "قیمت نهایی" },
  { key: "discount", label: "میزان تخفیف" },
  { key: "paymentType", label: "نوع پرداخت" },
  { key: "paymentProgram", label: "برنامه پرداخت" },
  { key: "duration", label: "مدت پوشش" },
  { key: "financialCoverage", label: "تعهد مالی" },
  { key: "onlineClaims", label: "خسارت آنلاین" },
  { key: "branches", label: "تعداد شعب" },
  { key: "benefits", label: "مزایا" },
];

/** The strongest visual value in the table: the factual final premium, never recalculated. */
export const getComparisonPrice = (offer: Offer): string => {
  const amount = offer.premium.amount_toman;
  return amount == null ? UNKNOWN : formatToman(amount);
};

/** Discount amount with its percent, only when the source offer actually carries them. */
export const getComparisonDiscount = (offer: Offer): string => {
  const amount = offer.discount_amount_toman;
  if (amount == null) return UNKNOWN;
  const percent = offer.discount_percent;
  return percent != null ? `${formatToman(amount)} (${number.format(percent)}٪)` : formatToman(amount);
};

/** "خرید اقساطی" when the offer supports installments, else the first declared method. */
export const getPaymentLabel = (offer: Offer): string => {
  if (offer.has_installments === true) return "خرید اقساطی";
  return offer.payment_methods[0] ?? UNKNOWN;
};

export const getPaymentProgramLabel = (offer: Offer): string =>
  offer.installment_plans.length ? `${number.format(offer.installment_plans.length)} برنامه` : UNKNOWN;

export const getCoverageDuration = (offer: Offer): string =>
  offer.duration_months != null ? `${number.format(offer.duration_months)} ماه` : UNKNOWN;

export const getFinancialCoverage = (offer: Offer): string =>
  offer.financial_coverage_toman != null ? formatToman(offer.financial_coverage_toman) : UNKNOWN;

/**
 * Tri-state service flag.
 *
 * `false` and `null` are different facts: an offer that declares no online
 * claims is not the same as an offer whose provider never reported the field.
 */
export type OnlineClaimsStatus = "yes" | "no" | "unknown";

export const getOnlineClaimsStatus = (offer: Offer): OnlineClaimsStatus => {
  const online = offer.insurer_metrics?.online_claims;
  if (online === true) return "yes";
  if (online === false) return "no";
  return "unknown";
};

export const getOnlineClaimsLabel = (offer: Offer): string => {
  const status = getOnlineClaimsStatus(offer);
  if (status === "yes") return "دارد";
  if (status === "no") return "ندارد";
  return "اطلاعات موجود نیست";
};

export const getBranchCount = (offer: Offer): string => {
  const branches = offer.insurer_metrics?.branches_count;
  return branches != null ? `${number.format(branches)} شعبه` : UNKNOWN;
};

export const MAX_VISIBLE_BENEFITS = 3;

export type ComparisonBenefits = { shown: string[]; hidden: number };

/** Deduplicates badges and benefits, keeps the row short, and reports the remainder. */
export const getComparisonBenefits = (offer: Offer, limit = MAX_VISIBLE_BENEFITS): ComparisonBenefits => {
  const all = [...new Set([...offer.benefits, ...offer.badges].map((item) => item.trim()).filter(Boolean))];
  return { shown: all.slice(0, limit), hidden: Math.max(0, all.length - limit) };
};

const missing = (offers: Offer[], has: (offer: Offer) => boolean) => offers.filter((offer) => !has(offer)).length;

/**
 * Deterministic caveats.
 *
 * Every message is either general product guidance or a difference that is
 * visible in the compared offers themselves. No claim is made about a provider
 * beyond what its own offer contains.
 */
export function buildComparisonCaveats(offers: Offer[]): string[] {
  const notes = ["شرایط اقساط، خدمات و پوشش در همه منابع یکسان نیست."];
  if (offers.length && missing(offers, (offer) => offer.premium.amount_toman != null)) {
    notes.push("قیمت نهایی برای برخی از این پیشنهادها در پاسخ منبع ثبت نشده است.");
  }
  if (offers.length && missing(offers, (offer) => offer.has_installments !== null)) {
    notes.push("امکان پرداخت اقساطی برای برخی از این پیشنهادها اعلام نشده است.");
  }
  const durations = offers.map((offer) => offer.duration_months);
  if (durations.some((value) => value != null) && new Set(durations).size > 1) {
    notes.push("مدت پوشش در این پیشنهادها یکسان نیست.");
  }
  if (offers.length && missing(offers, (offer) => offer.financial_coverage_toman != null)) {
    notes.push("میزان تعهد مالی برای برخی از این پیشنهادها ثبت نشده است.");
  }
  if (offers.length && missing(offers, (offer) => offer.insurer_metrics?.online_claims != null)) {
    notes.push("وضعیت خسارت آنلاین برای برخی از این پیشنهادها اعلام نشده است.");
  }
  notes.push("برای تصمیم نهایی، جزئیات هر پیشنهاد را نیز بررسی کنید.");
  return notes;
}
