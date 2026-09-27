import { describe, expect, it } from "vitest";
import type { AnalysisSection, QuoteAnalysis } from "../../ai-analysis/lib/types";
import type { NormalizedQuoteOffer } from "../../ai-analysis/lib/normalizeQuote";
import {
  buildChatRequest,
  comparisonNameLabel,
  contextLabel,
  resolveThreadContext,
  sectionReferencedOfferIds,
  snapshotFromSection,
  threadTitle,
  DEFAULT_GENERAL_THREAD_TITLE,
} from "./buildChatContext";
import { validateChatResponse } from "./validateChatResponse";
import type { ChatMessage } from "../types";

const OFFER_A = "azki:ایران:0";
const OFFER_B = "sabim:سینا:1";

const offers: NormalizedQuoteOffer[] = [
  {
    offer_id: OFFER_A,
    insurer_name: "ایران",
    source_name: "azki",
    old_price: null,
    final_price: 1_000_000,
    discount_amount: null,
    discount_percent: null,
    installment_available: true,
    payment_program_count: 1,
    payment_terms: [],
    coverage: { financial_coverage_toman: null, duration_months: null },
    services: {
      branches_count: null,
      claim_centers_count: null,
      mobile_compensation: null,
      online_claims: null,
      online_issue: null,
    },
    benefits: [],
    badges: [],
    financial_strength: null,
    customer_satisfaction: null,
  },
];

const section: AnalysisSection = {
  headline: "خلاصه پرداخت",
  summary: "بر اساس داده‌های ثبت‌شده.",
  key_points: [{ title: "قسط", description: "توضیح", offer_ids: [OFFER_B], tone: "positive" }],
  recommended_offer_ids: [OFFER_A],
  caveats: ["قیمت‌ها ثبت‌شده است."],
};

const message = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: "msg_1",
  schemaVersion: 1,
  threadId: "thr_1",
  role: "user",
  content: "پرسش",
  attachments: [],
  referencedOfferIds: [],
  suggestedQuestions: [],
  status: "ready",
  createdAt: "2026-01-01T00:00:00.000Z",
  seq: 0,
  ...overrides,
});

const base = {
  inquiryId: "inq_1",
  threadId: "thr_1",
  insuranceKind: "third_car" as const,
  offers,
  cachedAnalysis: null,
  message: "پرسش جاری",
  attachments: [],
};

describe("threadTitle", () => {
  it("names a section thread after the real section title", () => {
    expect(threadTitle("analysis_section", "payment_terms")).toBe("گفتگو درباره شرایط پرداخت");
    expect(threadTitle("analysis_section", "coverage_services")).toBe("گفتگو درباره پوشش و خدمات");
    expect(threadTitle("analysis_section", "price_value")).toBe("گفتگو درباره قیمت و ارزش خرید");
    expect(threadTitle("analysis_section", "smart_summary")).toBe("گفتگو درباره جمع‌بندی هوشمند");
  });

  it("uses a truncated first question for a general thread", () => {
    const long = "این یک پرسش بسیار طولانی است که باید به‌شکل خلاصه و قابل خواندن در عنوان گفتگو قرار بگیرد";
    const title = threadTitle("inquiry", null, long);
    expect(title.length).toBeLessThanOrEqual(43);
    expect(title.endsWith("…")).toBe(true);
    expect(title.startsWith(long.slice(0, 10))).toBe(true);
  });

  it("normalises whitespace in a general thread title", () => {
    expect(threadTitle("inquiry", null, "  بین   رازی و سینا؟  ")).toBe("بین رازی و سینا؟");
  });

  it("falls back to the general label when there is no first question", () => {
    expect(threadTitle("inquiry", null)).toBe(DEFAULT_GENERAL_THREAD_TITLE);
    expect(threadTitle("inquiry", null, "   ")).toBe(DEFAULT_GENERAL_THREAD_TITLE);
  });
});

describe("contextLabel", () => {
  it("labels a general thread and each section", () => {
    expect(contextLabel("inquiry", null)).toBe("کل این استعلام");
    expect(contextLabel("analysis_section", "payment_terms")).toBe("شرایط پرداخت");
    expect(contextLabel("analysis_section", null)).toBe("کل این استعلام");
  });
});

describe("section snapshot", () => {
  it("copies only the small section fields", () => {
    const snapshot = snapshotFromSection(section);
    expect(snapshot.headline).toBe("خلاصه پرداخت");
    expect(snapshot.recommended_offer_ids).toEqual([OFFER_A]);
    expect(snapshot.cheapest_offer_id).toBeNull();
    expect(Object.keys(snapshot).sort()).toEqual(
      ["caveats", "cheapest_offer_id", "best_value_offer_id", "headline", "key_points", "recommended_offer_ids", "summary"].sort(),
    );
  });

  it("keeps price/value ids when the source section carries them", () => {
    const priced = { ...section, cheapest_offer_id: OFFER_A, best_value_offer_id: OFFER_B };
    const snapshot = snapshotFromSection(priced);
    expect(snapshot.cheapest_offer_id).toBe(OFFER_A);
    expect(snapshot.best_value_offer_id).toBe(OFFER_B);
    expect(sectionReferencedOfferIds(snapshot).sort()).toEqual([OFFER_A, OFFER_B].sort());
  });

  it("deduplicates every referenced id in a section", () => {
    expect(sectionReferencedOfferIds(section).sort()).toEqual([OFFER_A, OFFER_B].sort());
  });
});

describe("buildChatRequest", () => {
  it("sends only normalized offers, never raw provider payloads", () => {
    const request = buildChatRequest({ ...base, contextType: "inquiry", sectionKey: null, referencedOfferIds: [], analysisSectionSnapshot: null, history: [] });
    expect(request.context.offers).toBe(offers);
    expect(JSON.stringify(request)).not.toContain("raw_offer");
    expect(JSON.stringify(request)).not.toContain("raw_response");
    expect(request.context.analysis_section).toBeUndefined();
    expect(request.context.cached_analysis).toBeUndefined();
    expect(request.context.section_key).toBeUndefined();
  });

  it("excludes the current message from history", () => {
    const request = buildChatRequest({
      ...base,
      contextType: "inquiry",
      sectionKey: null,
      referencedOfferIds: [],
      analysisSectionSnapshot: null,
      history: [message({ id: "a", role: "user", content: "پرسش قبلی", seq: 0 })],
      message: "پرسش جاری",
    });
    expect(request.history.map((item) => item.content)).toEqual(["پرسش قبلی"]);
    expect(request.message).toBe("پرسش جاری");
  });

  it("drops non-ready messages, placeholders and UI-only fields from history", () => {
    const history = [
      message({ id: "a", role: "user", content: "آماده", status: "ready", seq: 0 }),
      message({ id: "b", role: "assistant", content: "", status: "pending", seq: 1 }),
      message({ id: "c", role: "assistant", content: "خطا", status: "error", seq: 2 }),
      message({ id: "d", role: "assistant", content: "پاسخ", status: "ready", suggestedQuestions: ["x"], referencedOfferIds: ["y"], seq: 3 }),
    ];
    const request = buildChatRequest({ ...base, contextType: "inquiry", sectionKey: null, referencedOfferIds: [], analysisSectionSnapshot: null, history });
    expect(request.history.map((item) => item.content)).toEqual(["آماده", "پاسخ"]);
    expect(Object.keys(request.history[1]).sort()).toEqual(["attachments", "content", "role"]);
  });

  it("keeps at most the configured number of history messages, newest last", () => {
    const history = Array.from({ length: 30 }, (_, index) =>
      message({ id: `m${index}`, content: `پیام ${index}`, seq: index }),
    );
    const request = buildChatRequest({ ...base, contextType: "inquiry", sectionKey: null, referencedOfferIds: [], analysisSectionSnapshot: null, history });
    expect(request.history).toHaveLength(16);
    expect(request.history[0].content).toBe("پیام 14");
    expect(request.history[15].content).toBe("پیام 29");
  });

  it("freezes the section snapshot into a section thread", () => {
    const snapshot = snapshotFromSection(section);
    const request = buildChatRequest({
      ...base,
      contextType: "analysis_section",
      sectionKey: "payment_terms",
      referencedOfferIds: [OFFER_A],
      analysisSectionSnapshot: snapshot,
      history: [],
    });
    expect(request.context.section_key).toBe("payment_terms");
    expect(request.context.analysis_section?.headline).toBe("خلاصه پرداخت");
    expect(request.context.referenced_offer_ids).toEqual([OFFER_A]);
  });

  it("attaches the cached analysis only when one exists", () => {
    const cached: QuoteAnalysis = {
      schema_version: "1.0",
      analysis_version: "1",
      sections: {
        smart_summary: section,
        coverage_services: section,
        payment_terms: section,
        price_value: { ...section, cheapest_offer_id: OFFER_A, best_value_offer_id: OFFER_A },
      },
    };
    const withoutAnalysis = buildChatRequest({ ...base, contextType: "inquiry", sectionKey: null, referencedOfferIds: [], analysisSectionSnapshot: null, history: [] });
    expect(withoutAnalysis.context.cached_analysis).toBeUndefined();
    const withAnalysis = buildChatRequest({ ...base, contextType: "inquiry", sectionKey: null, referencedOfferIds: [], analysisSectionSnapshot: null, cachedAnalysis: cached, history: [] });
    expect(withAnalysis.context.cached_analysis?.sections.price_value.cheapest_offer_id).toBe(OFFER_A);
  });
});

describe("validateChatResponse", () => {
  const allowed = new Set([OFFER_A, OFFER_B]);
  const valid = {
    schema_version: "1.0",
    answer: "بر اساس قیمت ثبت‌شده، گزینهٔ ایران ارزان‌تر است.",
    referenced_offer_ids: [OFFER_A],
    suggested_questions: ["قسط کمتر کدام است؟"],
  };

  it("accepts a well-formed response", () => {
    expect(validateChatResponse(valid, allowed)).toEqual(valid);
  });

  it.each([
    ["null", null],
    ["a non-object", "پاسخ"],
    ["the wrong schema version", { ...valid, schema_version: "2.0" }],
    ["a missing answer", { schema_version: "1.0", referenced_offer_ids: [], suggested_questions: [] }],
    ["a blank answer", { ...valid, answer: "   " }],
    ["a non-string answer", { ...valid, answer: 12 }],
    ["an oversized answer", { ...valid, answer: "ا".repeat(2501) }],
    ["too many referenced ids", { ...valid, referenced_offer_ids: Array(6).fill(OFFER_A) }],
    ["a non-string referenced id", { ...valid, referenced_offer_ids: [12] }],
    ["an unknown referenced id", { ...valid, referenced_offer_ids: ["invented"] }],
    ["too many suggestions", { ...valid, suggested_questions: ["a", "b", "c", "d"] }],
    ["a blank suggestion", { ...valid, suggested_questions: ["  "] }],
  ])("rejects %s", (_label, value) => {
    expect(validateChatResponse(value, allowed)).toBeNull();
  });
});

describe("comparisonNameLabel", () => {
  it("joins two, three and four insurer names the Persian way", () => {
    expect(comparisonNameLabel(["رازی", "میهن"])).toBe("رازی و میهن");
    expect(comparisonNameLabel(["رازی", "میهن", "پردیس"])).toBe("رازی، میهن و پردیس");
    expect(comparisonNameLabel(["رازی", "میهن", "پردیس", "سینا"])).toBe("رازی، میهن، پردیس و سینا");
  });

  it("handles a single name and an empty list", () => {
    expect(comparisonNameLabel(["رازی"])).toBe("رازی");
    expect(comparisonNameLabel([])).toBe("");
  });

  it("never lists more than four insurers", () => {
    expect(comparisonNameLabel(["a", "b", "c", "d", "e"])).toBe("a، b، c و d");
  });
});

describe("comparison thread title", () => {
  it("names the thread after the compared insurers", () => {
    expect(threadTitle("comparison", null, undefined, comparisonNameLabel(["رازی", "میهن", "پردیس", "سینا"])))
      .toBe("مقایسه رازی، میهن، پردیس و سینا");
  });

  it("never uses a user message to name a comparison thread", () => {
    expect(threadTitle("comparison", null, "یک پرسش کاملاً متفاوت")).toBe(DEFAULT_GENERAL_THREAD_TITLE);
  });
});

describe("comparison context label", () => {
  it("names the compared insurers when they are known", () => {
    expect(contextLabel("comparison", null, 2, ["رازی", "میهن"])).toBe("مقایسه رازی و میهن");
  });

  it("falls back to the offer count so the badge is never blank", () => {
    expect(contextLabel("comparison", null, 4, [])).toBe("مقایسه ۴ پیشنهاد");
    expect(contextLabel("comparison", null, 2, ["   "])).toBe("مقایسه ۲ پیشنهاد");
  });

  it("leaves the other context types untouched", () => {
    expect(contextLabel("inquiry", null, 4, ["رازی"])).toBe("کل این استعلام");
    expect(contextLabel("analysis_section", "price_value", 4, [])).toBe("قیمت و ارزش خرید");
  });
});

describe("buildChatRequest for a comparison thread", () => {
  const manyOffers: NormalizedQuoteOffer[] = [
    offers[0],
    { ...offers[0], offer_id: OFFER_B, insurer_name: "سینا" },
    { ...offers[0], offer_id: "bimebazar:پردیس:2", insurer_name: "پردیس" },
    { ...offers[0], offer_id: "bimeh:آیین:3", insurer_name: "آیین" },
    { ...offers[0], offer_id: "azki:میهن:4", insurer_name: "میهن" },
  ];
  const comparisonBase = {
    ...base,
    contextType: "comparison" as const,
    sectionKey: null,
    referencedOfferIds: [OFFER_A, OFFER_B],
    analysisSectionSnapshot: null,
    history: [],
  };

  it("sends only the compared offers, never the whole inquiry", () => {
    const request = buildChatRequest({ ...comparisonBase, offers: manyOffers });
    expect(request.context.type).toBe("comparison");
    expect(request.context.offers.map((offer) => (offer as { offer_id: string }).offer_id)).toEqual([OFFER_A, OFFER_B]);
  });

  it("carries the compared set as the referenced ids, with no new field", () => {
    const request = buildChatRequest({ ...comparisonBase, offers: manyOffers });
    expect(request.context.referenced_offer_ids).toEqual([OFFER_A, OFFER_B]);
    expect(Object.keys(request.context).sort()).toEqual(["offers", "referenced_offer_ids", "type"]);
  });

  it("never sends section keys or section snapshots", () => {
    const request = buildChatRequest({ ...comparisonBase, offers: manyOffers });
    expect(request.context.section_key).toBeUndefined();
    expect(request.context.analysis_section).toBeUndefined();
  });

  it("keeps an inquiry context unscoped so it still carries every offer", () => {
    const request = buildChatRequest({
      ...base,
      contextType: "inquiry",
      sectionKey: null,
      referencedOfferIds: [],
      analysisSectionSnapshot: null,
      offers: manyOffers,
      history: [],
    });
    expect(request.context.offers).toHaveLength(manyOffers.length);
  });
});

describe("resolveThreadContext", () => {
  it("resolves a restored comparison thread from the stored inquiry", () => {
    const resolved = resolveThreadContext([OFFER_A, OFFER_B], [
      offers[0],
      { ...offers[0], offer_id: OFFER_B, insurer_name: "سینا" },
    ]);
    expect(resolved.offers.map((offer) => offer.offer_id)).toEqual([OFFER_A, OFFER_B]);
    expect(resolved.names).toEqual(["ایران", "سینا"]);
    expect(resolved.missingIds).toEqual([]);
  });

  it("reports ids that no longer resolve instead of widening the context", () => {
    const resolved = resolveThreadContext([OFFER_A, "removed:قدیمی:9"], offers);
    expect(resolved.offers.map((offer) => offer.offer_id)).toEqual([OFFER_A]);
    expect(resolved.missingIds).toEqual(["removed:قدیمی:9"]);
  });

  it("reports every id as missing for a fully stale thread", () => {
    expect(resolveThreadContext(["a", "b"], offers).missingIds).toEqual(["a", "b"]);
    expect(resolveThreadContext(["a", "b"], offers).offers).toEqual([]);
  });
});
