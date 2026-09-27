import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SearchResult } from "../../search/searchTypes";
import type { InsuranceKind } from "../../ai-analysis/lib/normalizeQuote";
import { normalizeQuoteForAI } from "../../ai-analysis/lib/normalizeQuote";
import type { AnalysisSection, AnalysisSectionKey, QuoteAnalysis } from "../../ai-analysis/lib/types";
import { buildChatRequest, sectionReferencedOfferIds, snapshotFromSection, threadTitle } from "../lib/buildChatContext";
import { buildSuggestedQuestions } from "../lib/buildSuggestedQuestions";
import { validateChatResponse } from "../lib/validateChatResponse";
import {
  createThread,
  createThreadWithFirstMessage,
  getMessagesForThread,
  getThreadsForInquiry,
  recoverInterruptedMessages,
  saveMessage,
  updateMessage,
} from "../storage/chatHistory";
import type { ChatAttachment, ChatDraftThread, ChatMessage, ChatThread } from "../types";
import { ATTACHMENT_FALLBACK_MESSAGE, CHAT_REQUEST_TIMEOUT_MS, MAX_SUGGESTED_QUESTIONS } from "../types";

const CHAT_ERROR_MESSAGE = "پاسخ‌گویی هوش مصنوعی ممکن نشد. دوباره تلاش کنید.";
/** A snapshot older than this is presented as a stored result, never as a live quote. */
const HISTORICAL_SNAPSHOT_MS = 2 * 60 * 60 * 1000;
const DRAFT_KEY = "draft";

type Options = {
  inquiryId: string;
  insuranceKind: InsuranceKind;
  result: SearchResult;
  analysis: QuoteAnalysis | null;
};

type Turn = {
  thread: ChatThread;
  userMessage: ChatMessage;
  placeholderId: string;
  history: ChatMessage[];
};

const generalDraft = (): ChatDraftThread => ({
  contextType: "inquiry",
  sectionKey: null,
  referencedOfferIds: [],
  analysisSectionSnapshot: null,
});

export function useAIChat({ inquiryId, insuranceKind, result, analysis }: Options) {
  const [open, setOpen] = useState(false);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThread, setActiveThread] = useState<ChatThread | null>(null);
  const [draft, setDraft] = useState<ChatDraftThread | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(new Set<string>());
  const openerRef = useRef<HTMLElement | null>(null);

  const normalized = useMemo(
    () => normalizeQuoteForAI(inquiryId, insuranceKind, result),
    [inquiryId, insuranceKind, result],
  );
  const allowedIds = useMemo(
    () => new Set(normalized.offers.map((offer) => offer.offer_id)),
    [normalized.offers],
  );
  const isHistorical = useMemo(() => {
    const fetchedAt = Date.parse(result.fetched_at);
    return Number.isFinite(fetchedAt) && Date.now() - fetchedAt > HISTORICAL_SNAPSHOT_MS;
  }, [result.fetched_at]);

  // A new inquiry must never inherit the previous inquiry's threads.
  useEffect(() => {
    setOpen(false);
    setThreads([]);
    setActiveThread(null);
    setDraft(null);
    setMessages([]);
    setBusy(false);
    setError(null);
    inFlight.current.clear();
  }, [inquiryId]);

  const contextType = draft ? draft.contextType : activeThread?.contextType ?? "inquiry";
  const sectionKey = draft ? draft.sectionKey : activeThread?.sectionKey ?? null;

  const suggestions = useMemo(() => {
    if (messages.length) {
      const lastAssistant = [...messages].reverse().find((item) => item.role === "assistant");
      return (lastAssistant?.suggestedQuestions ?? []).slice(0, MAX_SUGGESTED_QUESTIONS);
    }
    return buildSuggestedQuestions(normalized.offers, sectionKey);
  }, [messages, normalized.offers, sectionKey]);

  const runTurn = useCallback(
    async ({ thread, userMessage, placeholderId, history }: Turn) => {
      try {
        const payload = buildChatRequest({
          inquiryId,
          threadId: thread.id,
          insuranceKind,
          contextType: thread.contextType,
          sectionKey: thread.sectionKey,
          referencedOfferIds: thread.referencedOfferIds,
          analysisSectionSnapshot: thread.analysisSectionSnapshot,
          offers: normalized.offers,
          cachedAnalysis: analysis,
          history,
          message: userMessage.content,
          attachments: userMessage.attachments,
        });
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), CHAT_REQUEST_TIMEOUT_MS);
        let body: unknown;
        try {
          const response = await fetch("/api/ai/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });
          if (!response.ok) throw new Error(`AI chat request failed with status ${response.status}`);
          body = await response.json();
        } finally {
          window.clearTimeout(timer);
        }
        const validated = validateChatResponse(body, allowedIds);
        if (!validated) throw new Error("AI chat response did not match the expected shape");
        await updateMessage(placeholderId, {
          status: "ready",
          content: validated.answer,
          referencedOfferIds: validated.referenced_offer_ids,
          suggestedQuestions: validated.suggested_questions,
        });
      } catch (turnError) {
        console.error("AI chat turn failed", turnError);
        await updateMessage(placeholderId, { status: "error" });
        setError(CHAT_ERROR_MESSAGE);
      }
      setMessages(await getMessagesForThread(thread.id));
      setThreads(await getThreadsForInquiry(inquiryId));
    },
    [allowedIds, analysis, inquiryId, insuranceKind, normalized.offers],
  );

  const selectThread = useCallback(async (thread: ChatThread) => {
    setActiveThread(thread);
    setDraft(null);
    setMessages(await recoverInterruptedMessages(thread.id));
    setError(null);
  }, []);

  /** Restores the most recent thread, or an unsaved general conversation. Never calls the AI. */
  const openChat = useCallback(
    async (trigger?: HTMLElement) => {
      openerRef.current = trigger ?? null;
      setOpen(true);
      setError(null);
      const list = await getThreadsForInquiry(inquiryId);
      setThreads(list);
      if (list.length) await selectThread(list[0]);
      else {
        setActiveThread(null);
        setDraft(generalDraft());
        setMessages([]);
      }
    },
    [inquiryId, selectThread],
  );

  const closeChat = useCallback(() => setOpen(false), []);

  const startNewThread = useCallback(() => {
    setActiveThread(null);
    setDraft(generalDraft());
    setMessages([]);
    setError(null);
  }, []);

  const openThread = useCallback(
    async (threadId: string) => {
      const thread = threads.find((item) => item.id === threadId);
      if (thread) await selectThread(thread);
    },
    [selectThread, threads],
  );

  /**
   * Creates the explicit section thread a user asked for from the analysis modal.
   * It is persisted immediately because the user deliberately created it, and it
   * still performs no AI call: the first request waits for the first question.
   */
  const openSectionThread = useCallback(
    async (section: AnalysisSectionKey, analysisSection: AnalysisSection) => {
      const snapshot = snapshotFromSection(analysisSection);
      const thread = await createThread({
        inquiryId,
        title: threadTitle("analysis_section", section),
        contextType: "analysis_section",
        sectionKey: section,
        referencedOfferIds: sectionReferencedOfferIds(snapshot),
        analysisSectionSnapshot: snapshot,
      });
      setActiveThread(thread);
      setDraft(null);
      setMessages([]);
      setError(null);
      setThreads(await getThreadsForInquiry(inquiryId));
      setOpen(true);
      return thread.id;
    },
    [inquiryId],
  );

  const sendMessage = useCallback(
    async (rawText: string, attachments: ChatAttachment[] = []) => {
      const threadKey = activeThread?.id ?? DRAFT_KEY;
      if (inFlight.current.has(threadKey)) return false;
      const text = rawText.trim();
      if (!text && !attachments.length) return false;
      const content = text || ATTACHMENT_FALLBACK_MESSAGE;
      inFlight.current.add(threadKey);
      setBusy(true);
      setError(null);
      try {
        let thread = activeThread;
        let userMessage: ChatMessage;
        let history: ChatMessage[];
        let lastSeq: number;
        if (!thread) {
          const created = await createThreadWithFirstMessage(
            {
              inquiryId,
              title: threadTitle("inquiry", null, content),
              contextType: "inquiry",
              sectionKey: null,
            },
            { threadId: "", role: "user", content, attachments, status: "ready", seq: 0 },
          );
          thread = created.thread;
          userMessage = created.message;
          history = [];
          lastSeq = 0;
          setActiveThread(thread);
          setDraft(null);
        } else {
          const existing = await getMessagesForThread(thread.id);
          // Base the sequence on every stored message, not only the ready ones,
          // so a retried or failed row can never be overwritten.
          lastSeq = existing.length ? Math.max(...existing.map((item) => item.seq)) : -1;
          history = existing.filter((item) => item.status === "ready");
          userMessage = await saveMessage({
            threadId: thread.id,
            role: "user",
            content,
            attachments,
            status: "ready",
            seq: lastSeq + 1,
          });
        }
        const placeholder = await saveMessage({
          threadId: thread.id,
          role: "assistant",
          content: "",
          status: "pending",
          seq: lastSeq + 2,
        });
        setMessages(await getMessagesForThread(thread.id));
        await runTurn({ thread, userMessage, placeholderId: placeholder.id, history });
        return true;
      } catch (storageError) {
        console.error("AI chat could not store the message", storageError);
        setError(CHAT_ERROR_MESSAGE);
        return false;
      } finally {
        inFlight.current.delete(threadKey);
        setBusy(false);
      }
    },
    [activeThread, inquiryId, runTurn],
  );

  /** Re-uses the preceding user message; never duplicates it and never stacks requests. */
  const retryMessage = useCallback(
    async (messageId: string) => {
      const thread = activeThread;
      if (!thread || inFlight.current.has(thread.id)) return false;
      const all = await getMessagesForThread(thread.id);
      const index = all.findIndex((item) => item.id === messageId);
      if (index < 1) return false;
      const userMessage = all[index - 1];
      if (userMessage.role !== "user") return false;
      inFlight.current.add(thread.id);
      setBusy(true);
      setError(null);
      try {
        const history = all.slice(0, index - 1).filter((item) => item.status === "ready");
        await updateMessage(messageId, { status: "pending", content: "" });
        setMessages(await getMessagesForThread(thread.id));
        await runTurn({ thread, userMessage, placeholderId: messageId, history });
        return true;
      } catch (retryError) {
        console.error("AI chat retry could not be stored", retryError);
        setError(CHAT_ERROR_MESSAGE);
        return false;
      } finally {
        inFlight.current.delete(thread.id);
        setBusy(false);
      }
    },
    [activeThread, runTurn],
  );

  return {
    open,
    threads,
    activeThread,
    messages,
    busy,
    error,
    sectionKey,
    contextType,
    isHistorical,
    savedFetchedAt: result.fetched_at,
    suggestions,
    openerRef,
    openChat,
    closeChat,
    startNewThread,
    openThread,
    openSectionThread,
    sendMessage,
    retryMessage,
  };
}

export type AIChatController = ReturnType<typeof useAIChat>;
