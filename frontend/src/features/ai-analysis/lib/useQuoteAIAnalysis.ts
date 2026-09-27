import { useCallback, useEffect, useState } from "react";
import type { SearchResult } from "../../search/searchTypes";
import { getInquiry, saveInquirySnapshot, makeInquiryRecord, updateInquiryAnalysis } from "../../inquiries/storage/inquiryHistory";
import { normalizeQuoteForAI, type InsuranceKind } from "./normalizeQuote";
import { ANALYSIS_VERSION, type AIState } from "./types";
import { validateAnalysis } from "./validateAnalysis";

const inFlight = new Map<string, Promise<unknown>>();
const memoryCache = new Map<string, unknown>();

export function useQuoteAIAnalysis(inquiryId: string, insuranceKind: InsuranceKind, result: SearchResult) {
  const [state, setState] = useState<AIState>({ status: "idle", analysis: null, error: null });

  const run = useCallback(async (force = false) => {
    const key = `${inquiryId}:${ANALYSIS_VERSION}`;
    const payload = normalizeQuoteForAI(inquiryId, insuranceKind, result);
    const allowedIds = new Set(payload.offers.map((offer) => offer.offer_id));
    try {
      await saveInquirySnapshot(makeInquiryRecord(result, insuranceKind, inquiryId));
      const stored = await getInquiry(inquiryId);
      const cached = !force && validateAnalysis(memoryCache.get(key) ?? stored?.analysis, allowedIds);
      if (cached) {
        memoryCache.set(key, cached);
        setState({ status: "ready", analysis: cached, error: null });
        return;
      }
      await updateInquiryAnalysis(inquiryId, null, "processing");
      setState({ status: "processing", analysis: null, error: null });
      let pending = inFlight.get(key);
      if (!pending) {
        pending = (async () => {
          const controller = new AbortController();
          const timeout = window.setTimeout(() => controller.abort(), 50_000);
          try {
            const response = await fetch("/api/ai/quote-analysis", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
              signal: controller.signal,
            });
            if (!response.ok) throw new Error("analysis request failed");
            const analysis = validateAnalysis(await response.json(), allowedIds);
            if (!analysis) throw new Error("invalid analysis response");
            memoryCache.set(key, analysis);
            await updateInquiryAnalysis(inquiryId, analysis, "ready");
            return analysis;
          } finally {
            window.clearTimeout(timeout);
            inFlight.delete(key);
          }
        })();
        inFlight.set(key, pending);
      }
      const analysis = await pending;
      if (!analysis) throw new Error("empty analysis response");
      setState({ status: "ready", analysis: analysis as never, error: null });
    } catch (error) {
      console.error("Quote AI analysis failed", error);
      setState({ status: "error", analysis: null, error: "تحلیل هوشمند آماده نشد." });
      updateInquiryAnalysis(inquiryId, null, "error").catch(() => undefined);
    }
  }, [inquiryId, insuranceKind, result]);

  useEffect(() => { void run(); }, [run]);
  return { state, retry: () => void run(true) };
}
