import type { NormalizedQuoteOffer } from "../../../ai-analysis/lib/normalizeQuote";
import { MAX_SUGGESTED_QUESTIONS } from "../../../ai-chat/types";

/**
 * The optional AI layer that sits underneath the deterministic comparison table.
 *
 * The table never depends on this data. When the call fails, is unavailable or
 * returns something unusable, `best_offer_id` stays null and the "پیشنهاد برتر"
 * badge is simply not rendered.
 */

export const COMPARISON_ANALYSIS_VERSION = "1" as const;
export const COMPARISON_ANALYSIS_TIMEOUT_MS = 50_000;
export const MIN_CARDS = 4;

/** The four insight cards are a fixed product surface, in a fixed display order. */
export const COMPARISON_CARD_TYPES = [
  "recommended",
  "cheapest",
  "payment",
  "coverage_services",
] as const;

export type ComparisonCardType = (typeof COMPARISON_CARD_TYPES)[number];

/**
 * Canonical Persian labels.
 *
 * Rendered instead of the model's `title`, so the four cards always read exactly
 * as the product specifies and cannot drift with the prompt wording.
 */
export const COMPARISON_CARD_LABELS: Record<ComparisonCardType, string> = {
  recommended: "انتخاب پیشنهادی",
  cheapest: "بصرفه‌ترین قیمت",
  payment: "بهترین شرایط پرداخت",
  coverage_services: "پوشش و خدمات",
};

export type ComparisonCard = {
  type: ComparisonCardType;
  title: string;
  description: string;
  offer_ids: string[];
};

export type ComparisonAnalysis = {
  schema_version: "1.0";
  best_offer_id: string;
  best_offer_reason: string;
  summary: { headline: string; body: string };
  cards: ComparisonCard[];
  caveats: string[];
};

export type ComparisonAnalysisState =
  | { status: "idle"; analysis: null; error: null }
  | { status: "processing"; analysis: null; error: null }
  | { status: "ready"; analysis: ComparisonAnalysis; error: null }
  | { status: "error"; analysis: null; error: string };

const isShortString = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max;

const isOfferIdList = (value: unknown, allowed: Set<string>, max = 3) =>
  Array.isArray(value) &&
  value.length <= max &&
  value.every((item) => typeof item === "string" && allowed.has(item));

/**
 * Validates the AI payload against the offers the user actually compared.
 *
 * Every offer id in the response must exist inside the compared set, so an
 * invented id can never reach the UI and light up a wrong column.
 */
export function validateComparisonAnalysis(
  value: unknown,
  selectedIds: readonly string[],
): ComparisonAnalysis | null {
  if (!value || typeof value !== "object") return null;
  const allowed = new Set(selectedIds);
  const payload = value as Record<string, unknown>;
  if (payload.schema_version !== "1.0") return null;
  if (!isShortString(payload.best_offer_id, 160) || !allowed.has(payload.best_offer_id)) return null;
  if (!isShortString(payload.best_offer_reason, 300)) return null;

  const summary = payload.summary;
  if (!summary || typeof summary !== "object") return null;
  const { headline, body } = summary as Record<string, unknown>;
  if (!isShortString(headline, 80) || !isShortString(body, 400)) return null;

  if (!Array.isArray(payload.cards) || payload.cards.length !== MIN_CARDS) return null;
  const seen = new Set<ComparisonCardType>();
  const cards: ComparisonCard[] = [];
  for (const raw of payload.cards) {
    if (!raw || typeof raw !== "object") return null;
    const card = raw as Record<string, unknown>;
    if (!COMPARISON_CARD_TYPES.includes(card.type as ComparisonCardType)) return null;
    if (seen.has(card.type as ComparisonCardType)) return null;
    if (!isShortString(card.title, 60) || !isShortString(card.description, 220)) return null;
    if (!isOfferIdList(card.offer_ids, allowed)) return null;
    seen.add(card.type as ComparisonCardType);
    cards.push({
      type: card.type as ComparisonCardType,
      title: card.title,
      description: card.description,
      offer_ids: card.offer_ids as string[],
    });
  }
  if (seen.size !== MIN_CARDS) return null;

  const caveats = payload.caveats;
  if (
    !Array.isArray(caveats) ||
    caveats.length > 3 ||
    // A blank caveat would render as an empty bullet, so it is rejected outright.
    !caveats.every((item) => typeof item === "string" && item.trim().length > 0)
  ) {
    return null;
  }

  return {
    schema_version: "1.0",
    best_offer_id: payload.best_offer_id,
    best_offer_reason: payload.best_offer_reason,
    summary: { headline, body },
    // Fixed display order, independent of the order the model returned.
    cards: COMPARISON_CARD_TYPES.map((type) => cards.find((card) => card.type === type)!),
    caveats: caveats as string[],
  };
}

/**
 * Cache key for one comparison.
 *
 * Ids are sorted so the same set picked in a different order reuses the same
 * analysis instead of paying for a second call.
 */
export function comparisonAnalysisCacheKey(inquiryId: string, offerIds: readonly string[]): string {
  return `comparison-analysis::${inquiryId}::${[...offerIds].sort().join("-")}`;
}

/** The compared offers, in the user's selection order, and nothing else. */
export function selectComparedOffers(
  normalized: NormalizedQuoteOffer[],
  offerIds: readonly string[],
): NormalizedQuoteOffer[] {
  const byId = new Map(normalized.map((offer) => [offer.offer_id, offer]));
  return offerIds.flatMap((id) => {
    const offer = byId.get(id);
    return offer ? [offer] : [];
  });
}

export type SeededAnalysisMessage = {
  content: string;
  referencedOfferIds: string[];
  suggestedQuestions: string[];
};

/**
 * The opening assistant message of a comparison thread.
 *
 * Built deterministically from the analysis that was already fetched, so the
 * drawer is never empty and this costs no extra AI call. The text is plain
 * Persian, matching the chat prompt's "no Markdown, no identifiers in prose"
 * rules, because it becomes part of the next turn's conversation history.
 */
export function buildComparisonAnalysisMessage(
  analysis: ComparisonAnalysis,
  offers: NormalizedQuoteOffer[],
  suggestedQuestions: string[],
): SeededAnalysisMessage {
  const nameOf = (id: string) => offers.find((offer) => offer.offer_id === id)?.insurer_name;
  const best = nameOf(analysis.best_offer_id) ?? analysis.summary.headline;

  const lines = [analysis.summary.headline, analysis.summary.body];
  if (analysis.best_offer_reason) {
    lines.push(`پیشنهاد برتر: ${best}. ${analysis.best_offer_reason}`);
  }
  const cardLines = COMPARISON_CARD_TYPES.map((type) => {
    const card = analysis.cards.find((item) => item.type === type);
    if (!card) return "";
    const names = card.offer_ids.map(nameOf).filter((name): name is string => !!name);
    const related = names.length ? ` (${names.join("، ")})` : "";
    return `${COMPARISON_CARD_LABELS[type]}: ${card.description}${related}`;
  }).filter(Boolean);
  if (cardLines.length) lines.push("", ...cardLines);
  if (analysis.caveats.length) lines.push("", "نکات قابل توجه:", ...analysis.caveats.map((item) => `- ${item}`));

  const referenced = [
    analysis.best_offer_id,
    ...analysis.cards.flatMap((card) => card.offer_ids),
  ];
  return {
    content: lines.join("\n"),
    referencedOfferIds: [...new Set(referenced)].slice(0, 3),
    suggestedQuestions: suggestedQuestions.slice(0, MAX_SUGGESTED_QUESTIONS),
  };
}
