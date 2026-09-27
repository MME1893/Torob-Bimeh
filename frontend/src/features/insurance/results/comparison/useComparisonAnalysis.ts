import { useCallback, useEffect, useMemo, useState } from "react";
import type { SearchResult } from "../../../search/searchTypes";
import { normalizeQuoteForAI, type InsuranceKind } from "../../../ai-analysis/lib/normalizeQuote";
import {
  COMPARISON_ANALYSIS_TIMEOUT_MS,
  comparisonAnalysisCacheKey,
  selectComparedOffers,
  validateComparisonAnalysis,
  type ComparisonAnalysis,
  type ComparisonAnalysisState,
} from "./comparisonAnalysis";

/**
 * One in-flight request and one cached result per comparison key.
 *
 * These live at module scope on purpose: reopening the same comparison, or
 * opening it from a second component, must reuse the same call instead of
 * paying for another one.
 */
const inFlight = new Map<string, Promise<ComparisonAnalysis>>();
const memoryCache = new Map<string, ComparisonAnalysis>();

type Options = {
  inquiryId: string;
  insuranceKind: InsuranceKind;
  result: SearchResult;
  offerIds: readonly string[];
  /** The dialog only asks for analysis while it is actually open. */
  enabled: boolean;
};

const IDLE: ComparisonAnalysisState = { status: "idle", analysis: null, error: null };

/**
 * Fetches the optional AI comparison summary.
 *
 * Never blocks the table: the caller renders the deterministic table from the
 * first paint and this state only drives the section underneath it. A failure
 * leaves the badge off and the table fully usable.
 */
export function useComparisonAnalysis({ inquiryId, insuranceKind, result, offerIds, enabled }: Options) {
  const [state, setState] = useState<ComparisonAnalysisState>(IDLE);

  // Reuses the existing canonical ids, so the compared set has exactly the same
  // identity the chat and the quote analysis already use.
  const normalized = useMemo(
    () => normalizeQuoteForAI(inquiryId, insuranceKind, result),
    [inquiryId, insuranceKind, result],
  );
  const compared = useMemo(
    () => selectComparedOffers(normalized.offers, offerIds),
    [normalized.offers, offerIds],
  );

  // A stable key is what makes the effect fire once per distinct comparison.
  const cacheKey = useMemo(
    () => (compared.length >= 2 ? comparisonAnalysisCacheKey(inquiryId, compared.map((o) => o.offer_id)) : null),
    [compared, inquiryId],
  );

  const run = useCallback(async () => {
    if (!cacheKey) return;
    // The user's pick order, which is also the column order in the table.
    const selectedIds = compared.map((offer) => offer.offer_id);
    const cached = validateComparisonAnalysis(memoryCache.get(cacheKey), selectedIds);
    if (cached) {
      setState({ status: "ready", analysis: cached, error: null });
      return;
    }
    setState({ status: "processing", analysis: null, error: null });

    let pending = inFlight.get(cacheKey);
    if (!pending) {
      pending = (async () => {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), COMPARISON_ANALYSIS_TIMEOUT_MS);
        try {
          const response = await fetch("/api/ai/comparison-analysis", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            // Only the compared offers travel, never the whole inquiry.
            body: JSON.stringify({
              inquiry_id: inquiryId,
              insurance_type: insuranceKind,
              selected_offer_ids: selectedIds,
              offers: compared,
            }),
            signal: controller.signal,
          });
          if (!response.ok) throw new Error(`comparison analysis failed: ${response.status}`);
          const analysis = validateComparisonAnalysis(await response.json(), selectedIds);
          if (!analysis) throw new Error("invalid comparison analysis response");
          memoryCache.set(cacheKey, analysis);
          return analysis;
        } finally {
          window.clearTimeout(timeout);
          inFlight.delete(cacheKey);
        }
      })();
      inFlight.set(cacheKey, pending);
    }

    try {
      setState({ status: "ready", analysis: await pending, error: null });
    } catch (error) {
      console.error("Comparison AI analysis failed", error);
      setState({ status: "error", analysis: null, error: "تحلیل هوشمند این مقایسه آماده نشد." });
    }
  }, [cacheKey, compared, inquiryId, insuranceKind]);

  useEffect(() => {
    if (!enabled || !cacheKey) {
      setState(IDLE);
      return;
    }
    void run();
  }, [cacheKey, enabled, run]);

  return { state, comparedOffers: compared };
}
