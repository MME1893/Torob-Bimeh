export const ANALYSIS_VERSION = "1" as const;

export type AnalysisTone = "positive" | "neutral" | "warning";
export type AnalysisSectionKey = "smart_summary" | "coverage_services" | "payment_terms" | "price_value";

export const ANALYSIS_SECTION_KEYS: AnalysisSectionKey[] = [
  "smart_summary",
  "coverage_services",
  "payment_terms",
  "price_value",
];

export const ANALYSIS_SECTION_TITLES: Record<AnalysisSectionKey, string> = {
  smart_summary: "جمع‌بندی هوشمند",
  coverage_services: "پوشش و خدمات",
  payment_terms: "شرایط پرداخت",
  price_value: "قیمت و ارزش خرید",
};

export const ANALYSIS_SECTION_PROCESSING: Record<AnalysisSectionKey, string> = {
  smart_summary: "در حال تحلیل پیشنهادها...",
  coverage_services: "در حال بررسی پوشش‌ها...",
  payment_terms: "در حال بررسی شرایط پرداخت...",
  price_value: "در حال مقایسه قیمت‌ها...",
};

export type AnalysisPoint = {
  title: string;
  description: string;
  offer_ids: string[];
  tone: AnalysisTone;
};

export type AnalysisSection = {
  headline: string;
  summary: string;
  key_points: AnalysisPoint[];
  recommended_offer_ids: string[];
  caveats: string[];
  cheapest_offer_id?: string | null;
  best_value_offer_id?: string | null;
};

export type QuoteAnalysis = {
  schema_version: "1.0";
  analysis_version: typeof ANALYSIS_VERSION;
  sections: Record<AnalysisSectionKey, AnalysisSection>;
};

export type AIState =
  | { status: "idle" | "processing"; analysis: null; error: null }
  | { status: "ready"; analysis: QuoteAnalysis; error: null }
  | { status: "error"; analysis: null; error: string };

