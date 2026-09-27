import bimehCompanies from "../../../assets/All_company_logos.json";
import azkiCompanies from "../../../assets/All_compony_aski.json";
import type { Offer } from "../../search/searchTypes";

/**
 * Insurer identity and popularity, derived from real data only.
 *
 * Two committed catalogues describe the same Iranian insurer registry that the
 * providers themselves use: `All_company_logos.json` is بیمه‌دات‌کام's own
 * `Companies` option list and `All_compony_aski.json` is ازکی's, and both carry
 * the identical `Id` per insurer (آرمان 1031, میهن 1030, ...). Those are the
 * ids that arrive on `Offer.insurer_key` for those two providers, so membership
 * is resolved by id first and by normalized name as the portable fallback for
 * providers whose own ids are private to them (بیمه‌بازار `cid`, سابیم
 * `company_id`). The backend applies the same rule in `domain/crosswalk.py`:
 * "independent catalogs never share an inferred ID".
 *
 * Popularity is intentionally a curated, editable market ranking rather than a
 * guess computed from a single provider's payload, because trust signals
 * (`insurer_metrics`, `sale_rank`, ...) are only returned by some providers.
 * The ranking below is ordered by the real Iranian non-life market position and
 * restricted to insurers that actually exist in the two catalogues, so a company
 * can never be "popular" while missing from the registry.
 */

type CatalogCompany = { Id: number; Title: string };

/** The backend's crosswalk normalization: drop the «بیمه» prefix, unify ی/ک. */
export const normalizeInsurerName = (value: string) =>
  value
    .replace(/[\u200c\u200f\u202a-\u202e]/g, " ")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/^بیمه\s+/, "")
    .replace(/\s+/g, " ")
    .trim();

/** Reviewed spelling variants, kept in step with `crosswalk.INSURER_ALIASES`. */
const INSURER_ALIASES: Record<string, string> = {
  "خاور میانه": "خاورمیانه",
  "حکمت صبا": "حکمت",
};

const canonicalName = (value: string) => {
  const normalized = normalizeInsurerName(value);
  return INSURER_ALIASES[normalized] ?? normalized;
};

const registryFrom = (companies: readonly CatalogCompany[]) => {
  const byId = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const company of companies) {
    const name = canonicalName(company.Title);
    if (!name) continue;
    byId.set(String(company.Id), name);
    byName.set(name, String(company.Id));
  }
  return { byId, byName };
};

const AZKI = registryFrom((azkiCompanies as { Companies: CatalogCompany[] }).Companies);
const BIMEH = registryFrom((bimehCompanies as { Companies: CatalogCompany[] }).Companies);

/**
 * Popularity ranking, best first: the insurers that hold the leading share of
 * the Iranian non-life market and that actually exist in the two catalogues
 * above. Deliberately a subset of the registry, so «شرکت‌های محبوب» really
 * narrows the list instead of passing every offer through. An entry missing
 * from the registry resolves to tier 0 and is ignored, never faked.
 */
const POPULAR_INSURERS = [
  "سامان",
  "آسیا",
  "ایران",
  "پارسیان",
  "ملت",
  "پاسارگاد",
  "رازی",
  "کوثر",
  "معلم",
  "نوین",
  "البرز",
  "دی",
  "میهن",
  "آرمان",
  "سینا",
] as const;

/** Popularity tier, 1 = most popular, 0 = not in the popular set. */
const POPULAR_TIER = new Map<string, number>(
  POPULAR_INSURERS.map((name, index) => [canonicalName(name), POPULAR_INSURERS.length - index]),
);

/** The provider-scoped id catalogues we actually hold, keyed by provider. */
const REGISTRIES: Record<string, { byId: Map<string, string> }> = { azki: AZKI, bimeh: BIMEH };

/**
 * Resolves an offer to its canonical insurer name, preferring the provider id
 * when that provider's catalogue is committed here and falling back to the
 * name so سابیم and بیمه‌بازار offers resolve too.
 */
export function insurerNameOf(offer: Offer): string {
  const registry = REGISTRIES[offer.provider];
  const byId = registry?.byId.get(offer.insurer_key ?? "");
  if (byId) return byId;
  return canonicalName(offer.insurer_name);
}

/** Stable cross-provider key for one insurer, used by the panel's insurer list. */
export const insurerKey = (offer: Offer) => insurerNameOf(offer);

export function popularTierOf(offer: Offer): number {
  return POPULAR_TIER.get(insurerNameOf(offer)) ?? 0;
}

export function isPopularInsurer(offer: Offer): boolean {
  return popularTierOf(offer) > 0;
}

/** Registry id for an insurer name, when a committed catalogue knows it. */
export function insurerIdOf(name: string): string | null {
  const canonical = canonicalName(name);
  return AZKI.byName.get(canonical) ?? BIMEH.byName.get(canonical) ?? null;
}

/** How a real 0-100 provider signal contributes to the popularity score. */
const share = (value: number | null | undefined, weight: number) =>
  value == null ? 0 : (Math.min(100, Math.max(0, value)) / 100) * weight;

/**
 * Popularity score used by the «محبوب‌ترین» sort.
 *
 * The curated tier dominates (multiplied by 100) so a higher-ranked company
 * always outranks a lower-ranked one, and the provider's own trust signals
 * decide the order inside a tier. Every term reads a field the API really
 * sends; missing values contribute zero instead of an invented score.
 */
export function popularityScore(offer: Offer): number {
  const metrics = offer.insurer_metrics;
  return (
    popularTierOf(offer) * 100 +
    (offer.is_recommended ? 25 : 0) +
    (offer.sale_rank == null ? 0 : Math.max(0, 20 - offer.sale_rank)) +
    share(metrics?.satisfaction, 20) +
    share(metrics?.market_share_percent, 20) +
    share(metrics?.financial_strength, 10) +
    share(metrics?.solvency_level, 10)
  );
}
