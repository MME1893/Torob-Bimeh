import { ANALYSIS_SECTION_KEYS, ANALYSIS_VERSION, type AnalysisSection, type AnalysisSectionKey, type QuoteAnalysis } from "./types";

const isStringArray = (value: unknown, max: number) => Array.isArray(value) && value.length <= max && value.every((item) => typeof item === "string");

function validSection(value: unknown, allowedIds: Set<string>): value is AnalysisSection {
  if (!value || typeof value !== "object") return false;
  const section = value as AnalysisSection;
  if (typeof section.headline !== "string" || section.headline.length > 80) return false;
  if (typeof section.summary !== "string" || section.summary.length > 500) return false;
  if (!isStringArray(section.recommended_offer_ids, 3) || !isStringArray(section.caveats, 3)) return false;
  if (!Array.isArray(section.key_points) || section.key_points.length > 4) return false;
  const ids = [
    ...section.recommended_offer_ids,
    ...section.key_points.flatMap((point) => point.offer_ids ?? []),
    section.cheapest_offer_id,
    section.best_value_offer_id,
  ].filter((id): id is string => typeof id === "string");
  if (ids.some((id) => !allowedIds.has(id))) return false;
  return section.key_points.every((point) =>
    point && typeof point.title === "string" && point.title.length <= 60 &&
    typeof point.description === "string" && point.description.length <= 250 &&
    isStringArray(point.offer_ids, 3) && ["positive", "neutral", "warning"].includes(point.tone));
}

export function validateAnalysis(value: unknown, allowedIds: Set<string>): QuoteAnalysis | null {
  if (!value || typeof value !== "object") return null;
  const analysis = value as QuoteAnalysis;
  if (analysis.schema_version !== "1.0" || analysis.analysis_version !== ANALYSIS_VERSION || !analysis.sections) return null;
  return ANALYSIS_SECTION_KEYS.every((key: AnalysisSectionKey) => validSection(analysis.sections[key], allowedIds)) ? analysis : null;
}

