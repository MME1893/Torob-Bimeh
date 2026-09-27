import type { AnalysisSectionKey, QuoteAnalysis } from "../../ai-analysis/lib/types";
import { ANALYSIS_SECTION_TITLES } from "../../ai-analysis/lib/types";
import type { InsuranceKind, NormalizedQuoteOffer } from "../../ai-analysis/lib/normalizeQuote";
import type {
  AnalysisSectionSnapshot,
  ChatContextType,
  ChatRequestPayload,
} from "../types";
import { GENERAL_CONTEXT_LABEL, MAX_HISTORY_MESSAGES } from "../types";
import type { ChatMessage } from "../types";
import { number } from "../../insurance/results/offerPresentation";

export const DEFAULT_GENERAL_THREAD_TITLE = "گفتگوی عمومی";
const TITLE_MAX_CHARS = 42;
const COMPARISON_TITLE_PREFIX = "مقایسه";
const COMPARISON_NAMES_MAX = 4;

/**
 * Joins insurer names the way the rest of the Persian UI does: a comma list
 * with "و" before the last item, truncated so the thread title stays short.
 */
export function comparisonNameLabel(insurerNames: string[]): string {
  const names = insurerNames.slice(0, COMPARISON_NAMES_MAX).map((name) => name.trim()).filter(Boolean);
  if (!names.length) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} و ${names[1]}`;
  return `${names.slice(0, -1).join("، ")} و ${names[names.length - 1]}`;
}

/**
 * Deterministic thread titles. The AI is never asked to name a thread.
 *
 * `comparisonLabel` is the already-joined insurer list for a comparison thread.
 */
export function threadTitle(
  contextType: ChatContextType,
  sectionKey: AnalysisSectionKey | null,
  firstUserMessage?: string,
  comparisonLabel?: string,
) {
  if (contextType === "analysis_section" && sectionKey) {
    return `گفتگو درباره ${ANALYSIS_SECTION_TITLES[sectionKey]}`;
  }
  // A comparison thread is named after the compared insurers, never after a
  // question: the compared set is what makes the conversation identifiable.
  if (contextType === "comparison") {
    return comparisonLabel ? `${COMPARISON_TITLE_PREFIX} ${comparisonLabel}` : DEFAULT_GENERAL_THREAD_TITLE;
  }
  const trimmed = firstUserMessage?.replace(/\s+/g, " ").trim();
  if (trimmed) {
    return trimmed.length > TITLE_MAX_CHARS
      ? `${trimmed.slice(0, TITLE_MAX_CHARS).trimEnd()}…`
      : trimmed;
  }
  return DEFAULT_GENERAL_THREAD_TITLE;
}

/**
 * Short pill label for the chat header.
 *
 * A comparison thread names the compared insurers when they are known, and falls
 * back to the offer count so the badge is never blank.
 */
export function contextLabel(
  contextType: ChatContextType,
  sectionKey: AnalysisSectionKey | null,
  comparisonOfferCount = 0,
  comparisonNames?: string[],
) {
  if (contextType === "analysis_section" && sectionKey) {
    return ANALYSIS_SECTION_TITLES[sectionKey];
  }
  if (contextType === "comparison") {
    const names = comparisonNameLabel(comparisonNames ?? []);
    if (names) return `${COMPARISON_TITLE_PREFIX} ${names}`;
    return `${COMPARISON_TITLE_PREFIX} ${number.format(comparisonOfferCount)} پیشنهاد`;
  }
  return GENERAL_CONTEXT_LABEL;
}

type ContextInput = {
  inquiryId: string;
  threadId: string;
  insuranceKind: InsuranceKind;
  contextType: ChatContextType;
  sectionKey: AnalysisSectionKey | null;
  referencedOfferIds: string[];
  analysisSectionSnapshot: AnalysisSectionSnapshot | null;
  offers: NormalizedQuoteOffer[];
  cachedAnalysis: QuoteAnalysis | null;
  history: ChatMessage[];
  message: string;
  attachments: ChatMessage["attachments"];
};

/**
 * Assembles the stateless request body.
 *
 * Only canonical normalized offer data is sent: no raw provider response, no
 * raw offer payload, no logos and no credentials.
 *
 * A comparison context is additionally narrowed to the compared offers here, in
 * the pure builder, so no caller can accidentally ship the whole inquiry to a
 * four-offer conversation and let the model drift into unrelated offers.
 */
export function buildChatRequest(input: ContextInput): ChatRequestPayload {
  const history = input.history
    .filter((item) => item.status === "ready")
    .slice(-MAX_HISTORY_MESSAGES)
    .map((item) => ({ role: item.role, content: item.content, attachments: item.attachments }));

  const compared = new Set(input.referencedOfferIds);
  const scopedOffers = input.contextType === "comparison"
    ? input.offers.filter((offer) => compared.has(offer.offer_id))
    : input.offers;

  const context: ChatRequestPayload["context"] = {
    type: input.contextType,
    referenced_offer_ids: input.referencedOfferIds,
    offers: scopedOffers,
  };
  if (input.contextType === "analysis_section" && input.sectionKey) {
    context.section_key = input.sectionKey;
    // The frozen snapshot travels with the request so an old thread keeps
    // answering about the section it was created from.
    if (input.analysisSectionSnapshot) context.analysis_section = input.analysisSectionSnapshot;
  }
  if (input.cachedAnalysis) context.cached_analysis = input.cachedAnalysis;

  return {
    inquiry_id: input.inquiryId,
    thread_id: input.threadId,
    insurance_type: input.insuranceKind,
    context,
    history,
    message: input.message,
    attachments: input.attachments,
  };
}

/**
 * Resolves a thread's stored offer ids against the inquiry it is being shown for.
 *
 * A comparison thread is restored from a stored inquiry snapshot, so a renamed or
 * removed offer can leave an id that no longer resolves. The caller reports those
 * ids as unavailable instead of silently answering about a different set.
 */
export function resolveThreadContext(
  offerIds: readonly string[],
  offers: NormalizedQuoteOffer[],
) {
  const byId = new Map(offers.map((offer) => [offer.offer_id, offer]));
  const resolvedIds = offerIds.filter((id) => byId.has(id));
  return {
    offers: resolvedIds.map((id) => byId.get(id)!),
    names: resolvedIds.map((id) => byId.get(id)!.insurer_name),
    missingIds: offerIds.filter((id) => !byId.has(id)),
  };
}

export function snapshotFromSection(
  section: QuoteAnalysis["sections"][AnalysisSectionKey],
): AnalysisSectionSnapshot {
  return {
    headline: section.headline,
    summary: section.summary,
    key_points: section.key_points,
    recommended_offer_ids: section.recommended_offer_ids,
    caveats: section.caveats,
    cheapest_offer_id: section.cheapest_offer_id ?? null,
    best_value_offer_id: section.best_value_offer_id ?? null,
  };
}

/** Every offer id a section points at, resolved only from the stored analysis. */
export function sectionReferencedOfferIds(snapshot: AnalysisSectionSnapshot): string[] {
  return [
    ...new Set(
      [
        ...snapshot.recommended_offer_ids,
        ...snapshot.key_points.flatMap((point) => point.offer_ids),
        snapshot.cheapest_offer_id,
        snapshot.best_value_offer_id,
      ].filter((id): id is string => !!id),
    ),
  ];
}
