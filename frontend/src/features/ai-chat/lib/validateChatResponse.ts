import type { ChatResponsePayload } from "../types";
import { MAX_ANSWER_CHARS, MAX_REFERENCED_OFFER_IDS, MAX_SUGGESTED_QUESTIONS } from "../types";

const isStringArray = (value: unknown, max: number) =>
  Array.isArray(value) && value.length <= max && value.every((item) => typeof item === "string");

/**
 * Mirrors the backend contract so a malformed or over-reach response never
 * reaches the message list.
 */
export function validateChatResponse(
  value: unknown,
  allowedOfferIds: Set<string>,
): ChatResponsePayload | null {
  if (!value || typeof value !== "object") return null;
  const response = value as ChatResponsePayload;
  if (response.schema_version !== "1.0") return null;
  if (typeof response.answer !== "string") return null;
  if (!response.answer.trim() || response.answer.length > MAX_ANSWER_CHARS) return null;
  if (!isStringArray(response.referenced_offer_ids, MAX_REFERENCED_OFFER_IDS)) return null;
  if (!isStringArray(response.suggested_questions, MAX_SUGGESTED_QUESTIONS)) return null;
  if (response.referenced_offer_ids.some((id) => !allowedOfferIds.has(id))) return null;
  if (response.suggested_questions.some((question) => !question.trim())) return null;
  return response;
}
