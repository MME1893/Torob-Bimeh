import { describe, expect, it } from "vitest";
import type { NormalizedQuoteOffer } from "../../../ai-analysis/lib/normalizeQuote";
import {
  COMPARISON_CARD_LABELS,
  COMPARISON_CARD_TYPES,
  buildComparisonAnalysisMessage,
  comparisonAnalysisCacheKey,
  selectComparedOffers,
  validateComparisonAnalysis,
  type ComparisonAnalysis,
} from "./comparisonAnalysis";

const A = "azki:رازی:0";
const B = "sabim:سینا:1";
const C = "bimebazar:پردیس:2";
const D = "bimeh:آیین:3";
const OUTSIDE = "azki:خارجی:9";

const offer = (id: string, name: string): NormalizedQuoteOffer => ({
  offer_id: id,
  insurer_name: name,
  source_name: "azki",
  old_price: null,
  final_price: 1_000_000,
  discount_amount: null,
  discount_percent: null,
  installment_available: null,
  payment_program_count: 0,
  payment_terms: [],
  coverage: { financial_coverage_toman: null, duration_months: null },
  services: { branches_count: null, claim_centers_count: null, mobile_compensation: null, online_claims: null, online_issue: null },
  benefits: [],
  badges: [],
  financial_strength: null,
  customer_satisfaction: null,
});

const card = (type: string, offerIds: string[] = [A], description = "توضیح کوتاه.") => ({
  type,
  title: "عنوان",
  description,
  offer_ids: offerIds,
});

const allCards = () => [
  card("recommended", [A]),
  card("cheapest", [B]),
  card("payment", [A, B]),
  card("coverage_services", [A]),
];

const payload = (overrides: Record<string, unknown> = {}) => ({
  schema_version: "1.0",
  best_offer_id: A,
  best_offer_reason: "قیمت پایین‌تر و خدمات بیشتر.",
  summary: { headline: "رازی متعادل‌تر است.", body: "دو جمله کوتاه درباره تفاوت‌ها." },
  cards: allCards(),
  caveats: [],
  ...overrides,
});

const ALL_IDS = [A, B, C, D];

describe("validateComparisonAnalysis", () => {
  it("accepts a well-formed analysis", () => {
    expect(validateComparisonAnalysis(payload(), ALL_IDS)).not.toBeNull();
  });

  it("rejects a best_offer_id outside the compared set", () => {
    expect(validateComparisonAnalysis(payload({ best_offer_id: OUTSIDE }), ALL_IDS)).toBeNull();
  });

  it("rejects a card referencing an offer that was not compared", () => {
    const cards = allCards();
    cards[0].offer_ids = [OUTSIDE];
    expect(validateComparisonAnalysis(payload({ cards }), ALL_IDS)).toBeNull();
  });

  it("requires exactly the four card types", () => {
    expect(validateComparisonAnalysis(payload({ cards: allCards().slice(0, 3) }), ALL_IDS)).toBeNull();
    expect(validateComparisonAnalysis(payload({ cards: [...allCards(), card("recommended")] }), ALL_IDS)).toBeNull();
    expect(validateComparisonAnalysis(payload({ cards: allCards().map((c) => ({ ...c, type: "nope" })) }), ALL_IDS)).toBeNull();
  });

  it("rejects an unknown card type even when four cards are supplied", () => {
    const cards = [...allCards()];
    cards[3].type = "weather";
    expect(validateComparisonAnalysis(payload({ cards }), ALL_IDS)).toBeNull();
  });

  it("normalises the card order to the fixed display order", () => {
    const shuffled = [allCards()[2], allCards()[0], allCards()[3], allCards()[1]];
    const result = validateComparisonAnalysis(payload({ cards: shuffled }), ALL_IDS);
    expect(result?.cards.map((item) => item.type)).toEqual([...COMPARISON_CARD_TYPES]);
  });

  it.each([
    ["a wrong schema version", { schema_version: "2.0" }],
    ["a blank best_offer_reason", { best_offer_reason: "" }],
    ["an oversized best_offer_reason", { best_offer_reason: "ا".repeat(301) }],
    ["a missing summary", { summary: null }],
    ["an oversized headline", { summary: { headline: "ا".repeat(81), body: "b" } }],
    ["an empty caveat list entry", { caveats: ["ok", ""] }],
    ["too many caveats", { caveats: ["a", "b", "c", "d"] }],
  ])("rejects %s", (_label, overrides) => {
    expect(validateComparisonAnalysis(payload(overrides), ALL_IDS)).toBeNull();
  });

  it("rejects non-objects and null", () => {
    expect(validateComparisonAnalysis(null, ALL_IDS)).toBeNull();
    expect(validateComparisonAnalysis("پاسخ", ALL_IDS)).toBeNull();
  });

  it("exposes exactly the four canonical Persian labels", () => {
    expect(Object.values(COMPARISON_CARD_LABELS)).toEqual([
      "انتخاب پیشنهادی",
      "بصرفه‌ترین قیمت",
      "بهترین شرایط پرداخت",
      "پوشش و خدمات",
    ]);
  });
});

describe("comparisonAnalysisCacheKey", () => {
  it("is stable regardless of the order the offers were picked in", () => {
    expect(comparisonAnalysisCacheKey("inq_1", [A, B, C])).toBe(comparisonAnalysisCacheKey("inq_1", [C, A, B]));
  });

  it("differs for a different set and a different inquiry", () => {
    expect(comparisonAnalysisCacheKey("inq_1", [A, B])).not.toBe(comparisonAnalysisCacheKey("inq_1", [A, C]));
    expect(comparisonAnalysisCacheKey("inq_1", [A, B])).not.toBe(comparisonAnalysisCacheKey("inq_2", [A, B]));
  });

  it("uses the documented comparison-analysis prefix shape", () => {
    expect(comparisonAnalysisCacheKey("inq_9", [B, A]).startsWith("comparison-analysis::inq_9::")).toBe(true);
  });
});

describe("selectComparedOffers", () => {
  const normalized = [offer(A, "رازی"), offer(B, "سینا"), offer(C, "پردیس"), offer(D, "آیین")];

  it("keeps the user's selection order and nothing else", () => {
    const selected = selectComparedOffers(normalized, [C, A]);
    expect(selected.map((item) => item.offer_id)).toEqual([C, A]);
  });

  it("skips ids that do not resolve", () => {
    expect(selectComparedOffers(normalized, [A, OUTSIDE]).map((i) => i.offer_id)).toEqual([A]);
  });
});

describe("buildComparisonAnalysisMessage", () => {
  const analysis = validateComparisonAnalysis(payload(), ALL_IDS) as ComparisonAnalysis;
  const offers = [offer(A, "رازی"), offer(B, "سینا")];

  it("opens with the summary so the drawer is never empty", () => {
    const message = buildComparisonAnalysisMessage(analysis, offers, []);
    expect(message.content.startsWith("رازی متعادل‌تر است.")).toBe(true);
    expect(message.content).toContain("دو جمله کوتاه درباره تفاوت‌ها.");
  });

  it("includes the best offer name and its reason", () => {
    const message = buildComparisonAnalysisMessage(analysis, offers, []);
    expect(message.content).toContain("رازی");
    expect(message.content).toContain("قیمت پایین‌تر و خدمات بیشتر.");
  });

  it("includes all four insight cards with their canonical labels", () => {
    const message = buildComparisonAnalysisMessage(analysis, offers, []);
    for (const label of Object.values(COMPARISON_CARD_LABELS)) {
      expect(message.content).toContain(label);
    }
  });

  it("names the related insurers on each card", () => {
    const message = buildComparisonAnalysisMessage(analysis, offers, []);
    expect(message.content).toContain("(رازی، سینا)");
  });

  it("never prints a raw offer id in the prose", () => {
    const message = buildComparisonAnalysisMessage(analysis, offers, []);
    for (const id of [A, B, C, D]) expect(message.content).not.toContain(id);
  });

  it("carries the referenced offers for the chat UI, deduplicated and capped", () => {
    const message = buildComparisonAnalysisMessage(analysis, offers, []);
    expect(message.referencedOfferIds[0]).toBe(A);
    expect(new Set(message.referencedOfferIds).size).toBe(message.referencedOfferIds.length);
    expect(message.referencedOfferIds.length).toBeLessThanOrEqual(3);
  });

  it("caps the suggested questions at the chat limit", () => {
    const message = buildComparisonAnalysisMessage(analysis, offers, ["q1", "q2", "q3", "q4"]);
    expect(message.suggestedQuestions).toHaveLength(3);
  });

  it("appends the AI caveats when present", () => {
    const withCaveats = validateComparisonAnalysis(payload({ caveats: ["قیمت برخی منابع ثبت نشده است."] }), ALL_IDS)!;
    expect(buildComparisonAnalysisMessage(withCaveats, offers, []).content).toContain("نکات قابل توجه:");
  });
});
