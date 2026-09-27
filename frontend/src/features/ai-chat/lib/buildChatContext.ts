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

export const DEFAULT_GENERAL_THREAD_TITLE = "گفتگوی عمومی";
const TITLE_MAX_CHARS = 42;

/**
 * Deterministic thread titles. The AI is never asked to name a thread.
 */
export function threadTitle(
  contextType: ChatContextType,
  sectionKey: AnalysisSectionKey | null,
  firstUserMessage?: string,
) {
  if (contextType === "analysis_section" && sectionKey) {
    return `گفتگو درباره ${ANALYSIS_SECTION_TITLES[sectionKey]}`;
  }
  const trimmed = firstUserMessage?.replace(/\s+/g, " ").trim();
  if (trimmed) {
    return trimmed.length > TITLE_MAX_CHARS
      ? `${trimmed.slice(0, TITLE_MAX_CHARS).trimEnd()}…`
      : trimmed;
  }
  return DEFAULT_GENERAL_THREAD_TITLE;
}

export function contextLabel(contextType: ChatContextType, sectionKey: AnalysisSectionKey | null) {
  if (contextType === "analysis_section" && sectionKey) {
    return ANALYSIS_SECTION_TITLES[sectionKey];
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
 */
export function buildChatRequest(input: ContextInput): ChatRequestPayload {
  const history = input.history
    .filter((item) => item.status === "ready")
    .slice(-MAX_HISTORY_MESSAGES)
    .map((item) => ({ role: item.role, content: item.content, attachments: item.attachments }));

  const context: ChatRequestPayload["context"] = {
    type: input.contextType,
    referenced_offer_ids: input.referencedOfferIds,
    offers: input.offers,
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
