import type { Offer, ProviderResult } from "../../search/searchTypes";
import { insurerKey, isPopularInsurer, popularityScore } from "./popularInsurers";

export const SORT_MODES = ["cheapest", "priciest", "biggest_discount", "popular"] as const;
export type SortMode = (typeof SORT_MODES)[number];

export const SORT_LABELS: Record<SortMode, string> = {
  cheapest: "ارزان‌ترین",
  priciest: "گران‌ترین",
  biggest_discount: "بیشترین تخفیف",
  popular: "محبوب‌ترین",
};

export type PaymentType = "cash" | "installments";

export const PAYMENT_LABELS: Record<PaymentType, string> = {
  cash: "نقدی",
  installments: "اقساطی",
};

/**
 * Every filter the results page can apply, in one object.
 *
 * The quick chips, the segments, the sort control, the search box and the
 * filter panel all read and write these same fields, which is what keeps the
 * controls from overwriting each other: applying one merges a single field and
 * leaves the rest untouched. Two controls that mean the same thing (the
 * «تخفیف» chip and the panel's «داشتن تخفیف», the «اقساط» segment and the
 * panel's payment type) deliberately share one field instead of pretending to
 * be independent.
 */
export type OfferFilters = {
  query: string;
  sort: SortMode;
  popularOnly: boolean;
  discountOnly: boolean;
  payment: PaymentType | null;
  readyToBuyOnly: boolean;
  insurerKeys: string[];
  minPrice: number | null;
  maxPrice: number | null;
};

export const emptyFilters = (sort: SortMode = "cheapest"): OfferFilters => ({
  query: "",
  sort,
  popularOnly: false,
  discountOnly: false,
  payment: null,
  readyToBuyOnly: false,
  insurerKeys: [],
  minPrice: null,
  maxPrice: null,
});

/** Number of filter groups in effect, excluding sorting which has its own control. */
export function activeFilterCount(filters: OfferFilters): number {
  let count = 0;
  if (filters.query.trim()) count += 1;
  if (filters.popularOnly) count += 1;
  if (filters.discountOnly) count += 1;
  if (filters.payment) count += 1;
  if (filters.readyToBuyOnly) count += 1;
  if (filters.insurerKeys.length > 0) count += 1;
  if (filters.minPrice != null || filters.maxPrice != null) count += 1;
  return count;
}

export const hasAnyFilter = (filters: OfferFilters) => activeFilterCount(filters) > 0;

const PERSIAN_DIGITS = /[۰-۹]/g;
const ARABIC_DIGITS = /[٠-٩]/g;

/**
 * Case-, digit- and ی/ک-insensitive text fold, so «میهن» finds «میهن» and a
 * half-width ی still matches. Keeps the existing substring semantics.
 */
export function normalizeSearchText(value: string): string {
  return value
    .replace(/[\u200c\u200f\u202a-\u202e]/g, " ")
    .replace(PERSIAN_DIGITS, (digit) => String(digit.charCodeAt(0) - 1776))
    .replace(ARABIC_DIGITS, (digit) => String(digit.charCodeAt(0) - 1632))
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Parses a price typed with Persian or Latin digits; blank or junk means "no bound". */
export function parsePriceInput(value: string): number | null {
  const digits = normalizeSearchText(value).replace(/[^\d.-]/g, "");
  if (!digits) return null;
  const parsed = Number(digits);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}

/**
 * Derived once per result so the hot filter path stays allocation-free: the
 * provider display names search matches against, and the popularity score the
 * «محبوب‌ترین» sort orders by.
 */
export type OfferIndex = {
  providerNames: Map<string, string>;
  scores: Map<Offer, number>;
};

export function buildOfferIndex(
  providers: readonly ProviderResult[],
  providerLabels: Record<string, string> = {},
): OfferIndex {
  const providerNames = new Map<string, string>();
  const scores = new Map<Offer, number>();
  for (const provider of providers) {
    providerNames.set(provider.provider, providerLabels[provider.provider] ?? provider.provider);
    for (const offer of provider.offers) scores.set(offer, popularityScore(offer));
  }
  return { providerNames, scores };
}

function matchesQuery(offer: Offer, query: string, providerNames: Map<string, string>): boolean {
  if (insurerKey(offer).includes(query)) return true;
  if (normalizeSearchText(offer.insurer_name).includes(query)) return true;
  return normalizeSearchText(providerNames.get(offer.provider) ?? offer.provider).includes(query);
}

/**
 * Whether an offer is paid in cash or in installments.
 *
 * `has_installments` is the provider's own answer, so it wins. When it is null
 * the real payment plan and method labels are used as the fallback; the
 * provider labels are Persian strings such as «اقساط» or «اقساط اعتباری».
 */
export function paymentTypeOf(offer: Offer): PaymentType {
  if (offer.has_installments === true) return "installments";
  if (offer.has_installments === false) return "cash";
  if (offer.installment_plans.length > 0) return "installments";
  return offer.payment_methods.some((method) => method.includes("اقساط")) ? "installments" : "cash";
}

/**
 * "Ready to buy" means the provider returned a real priced quote for the row.
 * The API has no explicit purchase-readiness flag, so the presence of a final
 * premium is the honest signal: a row whose amount the provider could not read
 * stays null and is excluded rather than being shown as purchasable.
 */
export const isReadyToBuy = (offer: Offer) => offer.premium.amount_toman != null;

const hasDiscount = (offer: Offer) => (offer.discount_amount_toman ?? 0) > 0;

/** Unpriced rows always sort last, whichever direction the price runs. */
const priceOf = (offer: Offer) => offer.premium.amount_toman;

const cheapestFirst = (a: Offer, b: Offer) =>
  (priceOf(a) ?? Number.POSITIVE_INFINITY) - (priceOf(b) ?? Number.POSITIVE_INFINITY);
const priciestFirst = (a: Offer, b: Offer) =>
  (priceOf(b) ?? Number.NEGATIVE_INFINITY) - (priceOf(a) ?? Number.NEGATIVE_INFINITY);

const COMPARATORS: Record<SortMode, (a: Offer, b: Offer, index: OfferIndex) => number> = {
  cheapest: (a, b) => cheapestFirst(a, b),
  priciest: (a, b) => priciestFirst(a, b),
  // Discount amount first, then the percentage the provider reported, then price.
  biggest_discount: (a, b) =>
    (b.discount_amount_toman ?? 0) - (a.discount_amount_toman ?? 0) ||
    (b.discount_percent ?? 0) - (a.discount_percent ?? 0) ||
    cheapestFirst(a, b),
  // Popularity score decides; price only separates offers that score the same.
  popular: (a, b, index) =>
    (index.scores.get(b) ?? 0) - (index.scores.get(a) ?? 0) || cheapestFirst(a, b),
};

export function sortOffers(
  offers: readonly Offer[],
  sort: SortMode,
  index: OfferIndex,
): Offer[] {
  const compare = COMPARATORS[sort];
  // A copy: the provider arrays in `result` must never be reordered. The
  // comparator is wrapped because `sort` forwards only two arguments.
  return [...offers].sort((a, b) => compare(a, b, index));
}

/** Real min/max premium across the unfiltered offers, for the price range inputs. */
export function priceBounds(offers: readonly Offer[]): { min: number; max: number } | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const offer of offers) {
    const price = priceOf(offer);
    if (price == null) continue;
    if (price < min) min = price;
    if (price > max) max = price;
  }
  return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null;
}

/**
 * Applies every filter with AND semantics and then sorts. Search, the quick
 * chips and the panel all narrow the same list, so combining them can only ever
 * remove offers, never restore a filtered-out one.
 */
export function selectOffers(
  offers: readonly Offer[],
  filters: OfferFilters,
  index: OfferIndex,
): Offer[] {
  const query = normalizeSearchText(filters.query);
  const insurers = new Set(filters.insurerKeys);
  const { minPrice, maxPrice } = filters;

  const matched = offers.filter((offer) => {
    if (query && !matchesQuery(offer, query, index.providerNames)) return false;
    if (filters.popularOnly && !isPopularInsurer(offer)) return false;
    if (filters.discountOnly && !hasDiscount(offer)) return false;
    if (filters.payment && paymentTypeOf(offer) !== filters.payment) return false;
    if (filters.readyToBuyOnly && !isReadyToBuy(offer)) return false;
    if (insurers.size > 0 && !insurers.has(insurerKey(offer))) return false;
    const price = priceOf(offer);
    if (minPrice != null && (price == null || price < minPrice)) return false;
    if (maxPrice != null && (price == null || price > maxPrice)) return false;
    return true;
  });

  return sortOffers(matched, filters.sort, index);
}

export type InsurerOption = {
  key: string;
  label: string;
  offers: number;
  popular: boolean;
};

/**
 * The insurer list for the filter panel, built from the offers actually in this
 * result so it can never offer a company that has no quote here. Labelled with
 * the first name the providers used and counted per insurer.
 */
export function insurerOptions(offers: readonly Offer[]): InsurerOption[] {
  const options = new Map<string, InsurerOption>();
  for (const offer of offers) {
    const key = insurerKey(offer);
    const existing = options.get(key);
    if (existing) {
      existing.offers += 1;
      continue;
    }
    options.set(key, {
      key,
      label: offer.insurer_name.trim(),
      offers: 1,
      popular: isPopularInsurer(offer),
    });
  }
  return [...options.values()].sort((a, b) => a.label.localeCompare(b.label, "fa"));
}
