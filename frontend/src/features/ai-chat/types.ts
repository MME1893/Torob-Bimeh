import type { AnalysisSection, AnalysisSectionKey, QuoteAnalysis } from "../ai-analysis/lib/types";

export type { AnalysisSectionKey } from "../ai-analysis/lib/types";

export const CHAT_SCHEMA_VERSION = 1;

export const CHAT_REQUEST_TIMEOUT_MS = 60_000;
export const MAX_USER_MESSAGE_CHARS = 2000;
export const MAX_HISTORY_MESSAGES = 16;
export const MAX_ANSWER_CHARS = 2500;
export const MAX_REFERENCED_OFFER_IDS = 5;
export const MAX_SUGGESTED_QUESTIONS = 3;
export const MAX_INITIAL_QUESTIONS = 4;

/** Sent instead of an empty composer when the user only attaches a text file. */
export const ATTACHMENT_FALLBACK_MESSAGE = "این فایل را در زمینه همین استعلام بررسی کن.";

/**
 * `comparison` is a conversation scoped to a user-picked set of 2-4 offers.
 *
 * The compared set is stored in the existing `referencedOfferIds` field: for a
 * comparison thread "the offers this thread is about" and "the offers being
 * compared" are the same list, so no parallel id field is introduced.
 */
export type ChatContextType = "inquiry" | "analysis_section" | "comparison";
export type ChatRole = "user" | "assistant";
export type ChatMessageStatus = "ready" | "pending" | "error";

/** Small immutable copy of one analysis section, captured when a thread is created. */
export type AnalysisSectionSnapshot = AnalysisSection;

/** A bounded textual attachment stored locally with its own message. */
export type ChatAttachment = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  textContent: string;
};

export type ChatThread = {
  id: string;
  schemaVersion: typeof CHAT_SCHEMA_VERSION;
  inquiryId: string;
  title: string;
  contextType: ChatContextType;
  sectionKey: AnalysisSectionKey | null;
  referencedOfferIds: string[];
  analysisSectionSnapshot: AnalysisSectionSnapshot | null;
  createdAt: string;
  updatedAt: string;
};

export type ChatMessage = {
  id: string;
  schemaVersion: typeof CHAT_SCHEMA_VERSION;
  threadId: string;
  role: ChatRole;
  content: string;
  attachments: ChatAttachment[];
  referencedOfferIds: string[];
  suggestedQuestions: string[];
  status: ChatMessageStatus;
  createdAt: string;
  /** Monotonic position inside the thread, so same-millisecond writes keep their order. */
  seq: number;
};

export type ChatRequestPayload = {
  inquiry_id: string;
  thread_id: string;
  insurance_type: string;
  context: {
    type: ChatContextType;
    section_key?: AnalysisSectionKey;
    referenced_offer_ids?: string[];
    offers: unknown[];
    analysis_section?: AnalysisSectionSnapshot;
    cached_analysis?: QuoteAnalysis;
  };
  history: Array<{ role: ChatRole; content: string; attachments: ChatAttachment[] }>;
  message: string;
  attachments: ChatAttachment[];
};

export type ChatResponsePayload = {
  schema_version: "1.0";
  answer: string;
  referenced_offer_ids: string[];
  suggested_questions: string[];
};

/** Draft thread used before the user sends the first message of a general conversation. */
export type ChatDraftThread = {
  contextType: ChatContextType;
  sectionKey: AnalysisSectionKey | null;
  referencedOfferIds: string[];
  analysisSectionSnapshot: AnalysisSectionSnapshot | null;
};

export const GENERAL_CONTEXT_LABEL = "کل این استعلام";
