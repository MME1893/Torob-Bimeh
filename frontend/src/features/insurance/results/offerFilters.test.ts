import { describe, expect, it } from "vitest";
import type { Metrics, Offer, ProviderResult } from "../../search/searchTypes";
import {
  activeFilterCount,
  buildOfferIndex,
  emptyFilters,
  hasAnyFilter,
  insurerOptions,
  parsePriceInput,
  paymentTypeOf,
  priceBounds,
  selectOffers,
  type OfferFilters,
} from "./offerFilters";
import { insurerKey, isPopularInsurer, popularityScore, popularTierOf } from "./popularInsurers";

type Overrides = Partial<Offer> & { metrics?: Metrics | null };

/** Real ids from the committed insurer registry: میهن 1030, سامان 1021, آرمان 1031. */
const makeOffer = (overrides: Overrides & { insurer_name: string; provider?: string }): Offer => {
  const { metrics, ...rest } = overrides;
  return {
    insurer_key: null,
    provider: "bimeh",
    premium: { raw_amount: 1_000_000, raw_unit: "toman", amount_toman: 1_000_000 },
    price_before_discount_toman: null,
    discount_amount_toman: null,
    discount_percent: null,
    has_installments: null,
    installment_plans: [],
    payment_methods: [],
    penalty: null,
    price_breakdown: [],
    discount_breakdown: [],
    insurer_metrics: metrics ?? null,
    benefits: [],
    badges: [],
    is_recommended: null,
    sale_rank: null,
    financial_coverage_toman: null,
    duration_months: 12,
    raw_offer: {},
    ...rest,
  };
};

const price = (amount: number) => ({ raw_amount: amount, raw_unit: "toman", amount_toman: amount });

const providers = (offers: Offer[], provider = "bimeh"): ProviderResult[] => [
  { provider, status: "ok", message: null, offers, raw_response: null },
];

/** The four offers every sorting test orders. */
const sortable = (): Offer[] => [
  makeOffer({ insurer_name: "میهن", insurer_key: "1030", premium: price(4_000_000), discount_amount_toman: 500_000, discount_percent: 11 }),
  makeOffer({ insurer_name: "سامان", insurer_key: "1021", premium: price(2_000_000), discount_amount_toman: 100_000, discount_percent: 5 }),
  makeOffer({ insurer_name: "آرمان", insurer_key: "1031", premium: price(3_000_000), discount_amount_toman: 900_000, discount_percent: 23 }),
  makeOffer({ insurer_name: "حافظ", insurer_key: "1047", premium: price(1_000_000), discount_amount_toman: 0 }),
];

const order = (offers: readonly Offer[]) => offers.map((offer) => offer.insurer_name);
const withFilters = (patch: Partial<OfferFilters>): OfferFilters => ({ ...emptyFilters(), ...patch });

const PROVIDER_LABELS = { azki: "ازکی", sabim: "سابیم", bimebazar: "بیمه‌بازار", bimeh: "بیمه‌دات‌کام" };

describe("insurer identity", () => {
  it("resolves the canonical insurer from the provider id the API sends", () => {
    // بیمه‌دات‌کام sends CompanyId; 1030 is میهن in the committed registry.
    expect(insurerKey(makeOffer({ insurer_name: "بیمه میهن", insurer_key: "1030" }))).toBe("میهن");
    expect(insurerKey(makeOffer({ insurer_name: "آرمان", insurer_key: "1031", provider: "azki" }))).toBe("آرمان");
  });

  it("falls back to the name for providers whose ids are private to them", () => {
    // بیمه‌بازار `cid` and سابیم `company_id` are not in the committed catalogues.
    expect(insurerKey(makeOffer({ insurer_name: "بیمه سامان", provider: "bimebazar" }))).toBe("سامان");
    expect(insurerKey(makeOffer({ insurer_name: "سامان", provider: "sabim" }))).toBe("سامان");
  });

  it("normalizes the reviewed spelling variants the backend crosswalk also joins", () => {
    expect(insurerKey(makeOffer({ insurer_name: "حکمت صبا" }))).toBe("حکمت");
    expect(insurerKey(makeOffer({ insurer_name: "خاور میانه" }))).toBe("خاورمیانه");
  });

  it("joins the same insurer across different providers", () => {
    const fromBimeh = makeOffer({ insurer_name: "میهن", insurer_key: "1030" });
    const fromBimebazar = makeOffer({ insurer_name: "بیمه میهن", provider: "bimebazar" });
    expect(insurerKey(fromBimeh)).toBe(insurerKey(fromBimebazar));
  });
});

describe("popular companies", () => {
  it("ranks the real market leaders and excludes the rest of the registry", () => {
    const saman = makeOffer({ insurer_name: "سامان", insurer_key: "1021" });
    const hafez = makeOffer({ insurer_name: "حافظ", insurer_key: "1047" });
    expect(isPopularInsurer(saman)).toBe(true);
    expect(isPopularInsurer(hafez)).toBe(false);
    expect(popularTierOf(saman)).toBeGreaterThan(popularTierOf(makeOffer({ insurer_name: "ایران", insurer_key: "1026" })));
    expect(popularTierOf(hafez)).toBe(0);
  });

  it("scores a higher-ranked company above a lower-ranked one regardless of metrics", () => {
    const saman = makeOffer({ insurer_name: "سامان", insurer_key: "1021" });
    const alborz = makeOffer({
      insurer_name: "البرز",
      insurer_key: "1034",
      metrics: { satisfaction: 100, market_share_percent: 100 } as Metrics,
    });
    expect(popularityScore(saman)).toBeGreaterThan(popularityScore(alborz));
  });

  it("adds the provider's real trust signals inside one tier", () => {
    const plain = makeOffer({ insurer_name: "پارسیان", insurer_key: "1023" });
    const trusted = makeOffer({
      insurer_name: "پارسیان",
      insurer_key: "1023",
      is_recommended: true,
      sale_rank: 1,
      metrics: { satisfaction: 95, market_share_percent: 40 } as Metrics,
    });
    expect(popularityScore(trusted)).toBeGreaterThan(popularityScore(plain));
  });

  it("ignores insurers that are not in the registry instead of inventing a score", () => {
    const unknown = makeOffer({ insurer_name: "شرکت ناموجود", insurer_key: "999999" });
    expect(popularityScore(unknown)).toBe(0);
    expect(isPopularInsurer(unknown)).toBe(false);
  });
});

describe("search", () => {
  const index = buildOfferIndex(providers(sortable()), PROVIDER_LABELS);

  it("filters by insurance company name", () => {
    const found = selectOffers(sortable(), withFilters({ query: "میهن" }), index);
    expect(order(found)).toEqual(["میهن"]);
  });

  it("matches when the insurer name carries the «بیمه» prefix or extra spacing", () => {
    const offers = [makeOffer({ insurer_name: "بیمه  میهن" })];
    const found = selectOffers(offers, withFilters({ query: "میهن" }), index);
    expect(order(found)).toEqual(["بیمه  میهن"]);
  });

  it("filters by provider/source name", () => {
    const offers = [
      makeOffer({ insurer_name: "میهن", provider: "azki" }),
      makeOffer({ insurer_name: "سامان", provider: "sabim" }),
    ];
    const offerIndex = buildOfferIndex(providers(offers, "azki"), PROVIDER_LABELS);
    offerIndex.providerNames.set("sabim", "سابیم");
    const found = selectOffers(offers, withFilters({ query: "سابیم" }), offerIndex);
    expect(order(found)).toEqual(["سامان"]);
  });

  it("keeps every offer when the query is empty or only whitespace", () => {
    expect(selectOffers(sortable(), withFilters({ query: "   " }), index)).toHaveLength(4);
  });
});

describe("quick filters", () => {
  const index = buildOfferIndex(providers(sortable()), PROVIDER_LABELS);

  it("«تخفیف» keeps only offers that carry discount information", () => {
    const found = selectOffers(sortable(), withFilters({ discountOnly: true }), index);
    // حافظ carries no discount; the rest survive, still cheapest first.
    expect(order(found)).toEqual(["سامان", "آرمان", "میهن"]);
  });

  it("«شرکت‌های محبوب» keeps only offers from popular insurers", () => {
    const found = selectOffers(sortable(), withFilters({ popularOnly: true }), index);
    expect(order(found)).toEqual(["سامان", "آرمان", "میهن"]);
    expect(order(found)).not.toContain("حافظ");
  });

  it("«شركت‌های محبوب» actually removes offers from the list", () => {
    const all = sortable();
    const popular = selectOffers(all, withFilters({ popularOnly: true }), index);
    expect(popular.length).toBeLessThan(all.length);
    expect(popular).not.toContain(all[3]);
  });
});

describe("sorting", () => {
  const offers = sortable();
  const index = buildOfferIndex(providers(offers), PROVIDER_LABELS);

  it("ارزان‌ترین orders by final price ascending", () => {
    expect(order(selectOffers(offers, withFilters({ sort: "cheapest" }), index))).toEqual([
      "حافظ",
      "سامان",
      "آرمان",
      "میهن",
    ]);
  });

  it("گران‌ترین orders by final price descending", () => {
    expect(order(selectOffers(offers, withFilters({ sort: "priciest" }), index))).toEqual([
      "میهن",
      "آرمان",
      "سامان",
      "حافظ",
    ]);
  });

  it("بیشترین تخفیف orders by discount amount descending", () => {
    expect(order(selectOffers(offers, withFilters({ sort: "biggest_discount" }), index))).toEqual([
      "آرمان",
      "میهن",
      "سامان",
      "حافظ",
    ]);
  });

  it("بیشترین تخفیف falls back to the percentage, then to price", () => {
    const smallAmounts = [
      makeOffer({ insurer_name: "الف", premium: price(9_000_000), discount_amount_toman: 100_000, discount_percent: 2 }),
      makeOffer({ insurer_name: "ب", premium: price(1_000_000), discount_amount_toman: 100_000, discount_percent: 30 }),
    ];
    const smallIndex = buildOfferIndex(providers(smallAmounts), PROVIDER_LABELS);
    expect(order(selectOffers(smallAmounts, withFilters({ sort: "biggest_discount" }), smallIndex))).toEqual([
      "ب",
      "الف",
    ]);
  });

  it("محبوب‌ترین orders by popularity, not by price", () => {
    const found = selectOffers(offers, withFilters({ sort: "popular" }), index);
    // سامان outranks the pricier میهن and آرمان, and the cheapest offer
    // (حافظ, not a popular insurer) sinks to the bottom.
    expect(order(found)).toEqual(["سامان", "میهن", "آرمان", "حافظ"]);
  });

  it("breaks a popularity tie on price", () => {
    const tied = [
      makeOffer({ insurer_name: "سامان", insurer_key: "1021", premium: price(5_000_000) }),
      makeOffer({ insurer_name: "سامان", insurer_key: "1021", premium: price(2_000_000) }),
    ];
    const tiedIndex = buildOfferIndex(providers(tied), PROVIDER_LABELS);
    const found = selectOffers(tied, withFilters({ sort: "popular" }), tiedIndex);
    expect(found[0].premium.amount_toman).toBe(2_000_000);
  });

  it("keeps unpriced offers last in both price directions", () => {
    const mixed = [
      makeOffer({ insurer_name: "بی‌قیمت", premium: { raw_amount: 0, raw_unit: "toman", amount_toman: null } }),
      makeOffer({ insurer_name: "گران", premium: price(9_000_000) }),
      makeOffer({ insurer_name: "ارزان", premium: price(1_000_000) }),
    ];
    const mixedIndex = buildOfferIndex(providers(mixed), PROVIDER_LABELS);
    expect(order(selectOffers(mixed, withFilters({ sort: "cheapest" }), mixedIndex)).at(-1)).toBe("بی‌قیمت");
    expect(order(selectOffers(mixed, withFilters({ sort: "priciest" }), mixedIndex)).at(-1)).toBe("بی‌قیمت");
  });

  it("never reorders the provider arrays it was given", () => {
    const source = sortable();
    const before = order(source);
    const sourceIndex = buildOfferIndex(providers(source), PROVIDER_LABELS);
    selectOffers(source, withFilters({ sort: "priciest" }), sourceIndex);
    selectOffers(source, withFilters({ sort: "popular" }), sourceIndex);
    expect(order(source)).toEqual(before);
  });
});

describe("combining filters", () => {
  const offers = (): Offer[] => [
    makeOffer({ insurer_name: "میهن", insurer_key: "1030", premium: price(4_000_000), discount_amount_toman: 200_000, has_installments: true }),
    makeOffer({ insurer_name: "میهن", insurer_key: "1030", premium: price(2_000_000), discount_amount_toman: 300_000, has_installments: false }),
    makeOffer({ insurer_name: "سامان", insurer_key: "1021", premium: price(1_000_000), discount_amount_toman: 100_000, has_installments: true }),
    makeOffer({ insurer_name: "حافظ", insurer_key: "1047", premium: price(500_000), discount_amount_toman: null, has_installments: true }),
  ];

  it("applies search, discount, payment and sorting together", () => {
    const source = offers();
    const index = buildOfferIndex(providers(source), PROVIDER_LABELS);
    const found = selectOffers(
      source,
      withFilters({ query: "میهن", discountOnly: true, payment: "installments", sort: "cheapest" }),
      index,
    );
    // میهن + has discount + خرید اقساطی, cheapest first.
    expect(found).toHaveLength(1);
    expect(found[0].premium.amount_toman).toBe(4_000_000);
  });

  it("does not let one filter overwrite another", () => {
    const source = offers();
    const index = buildOfferIndex(providers(source), PROVIDER_LABELS);
    // The component merges every control change into one filter object, so a
    // later change must leave the earlier filters intact.
    const apply = (state: OfferFilters, patch: Partial<OfferFilters>): OfferFilters => ({
      ...state,
      ...patch,
    });
    let state = withFilters({ query: "میهن" });
    state = apply(state, { discountOnly: true });
    state = apply(state, { sort: "priciest" });
    state = apply(state, { popularOnly: true });
    expect(state.query).toBe("میهن");
    expect(state.discountOnly).toBe(true);
    expect(state.popularOnly).toBe(true);
    expect(state.sort).toBe("priciest");
    // ...and all of them apply together: میهن, discounted, popular, priciest.
    const found = selectOffers(source, state, index);
    expect(order(found)).toEqual(["میهن", "میهن"]);
    expect(found.map((offer) => offer.premium.amount_toman)).toEqual([4_000_000, 2_000_000]);
  });

  it("filters the insurer list down to the selected companies", () => {
    const source = offers();
    const index = buildOfferIndex(providers(source), PROVIDER_LABELS);
    const found = selectOffers(source, withFilters({ insurerKeys: ["سامان"] }), index);
    expect(order(found)).toEqual(["سامان"]);
  });

  it("narrows by price range", () => {
    const source = offers();
    const index = buildOfferIndex(providers(source), PROVIDER_LABELS);
    expect(order(selectOffers(source, withFilters({ minPrice: 900_000, maxPrice: 2_000_000 }), index))).toEqual([
      "سامان",
      "میهن",
    ]);
  });

  it("reports no results when nothing matches", () => {
    const source = offers();
    const index = buildOfferIndex(providers(source), PROVIDER_LABELS);
    const found = selectOffers(source, withFilters({ query: "پارسیان" }), index);
    expect(found).toEqual([]);
  });
});

describe("panel helpers", () => {
  it("classifies cash and installment payment from the provider's own flags", () => {
    expect(paymentTypeOf(makeOffer({ insurer_name: "الف", has_installments: true }))).toBe("installments");
    expect(paymentTypeOf(makeOffer({ insurer_name: "ب", has_installments: false }))).toBe("cash");
    expect(
      paymentTypeOf(makeOffer({ insurer_name: "ج", has_installments: null, payment_methods: ["اقساط اعتباری"] })),
    ).toBe("installments");
    expect(paymentTypeOf(makeOffer({ insurer_name: "د", has_installments: null }))).toBe("cash");
  });

  it("builds the insurer list from the offers that are actually present", () => {
    const options = insurerOptions(sortable());
    // Sorted with Persian collation, so only the membership is asserted.
    expect(new Set(options.map((option) => option.key))).toEqual(
      new Set(["میهن", "سامان", "آرمان", "حافظ"]),
    );
    expect(options.find((option) => option.key === "میهن")?.popular).toBe(true);
    expect(options.find((option) => option.key === "حافظ")?.popular).toBe(false);
    const labels = options.map((option) => option.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, "fa")));
  });

  it("counts the offers behind each insurer", () => {
    const source = [
      makeOffer({ insurer_name: "میهن", insurer_key: "1030" }),
      makeOffer({ insurer_name: "بیمه میهن", insurer_key: "1030" }),
    ];
    const options = insurerOptions(source);
    expect(options).toHaveLength(1);
    expect(options[0].offers).toBe(2);
  });

  it("derives the price range from the real offers", () => {
    expect(priceBounds(sortable())).toEqual({ min: 1_000_000, max: 4_000_000 });
    const unpriced = [makeOffer({ insurer_name: "الف", premium: { raw_amount: 0, raw_unit: "toman", amount_toman: null } })];
    expect(priceBounds(unpriced)).toBeNull();
  });

  it("counts the active filter groups without counting the sort mode", () => {
    expect(activeFilterCount(emptyFilters())).toBe(0);
    expect(hasAnyFilter(emptyFilters())).toBe(false);
    expect(activeFilterCount(withFilters({ sort: "priciest" }))).toBe(0);
    expect(
      activeFilterCount(
        withFilters({ query: "میهن", discountOnly: true, popularOnly: true, payment: "cash", readyToBuyOnly: true, insurerKeys: ["میهن"], minPrice: 1 }),
      ),
    ).toBe(7);
    expect(hasAnyFilter(withFilters({ query: "میهن" }))).toBe(true);
  });

  it("parses prices typed with Persian digits and rejects junk", () => {
    expect(parsePriceInput("۱۲۰۰۰۰۰")).toBe(1_200_000);
    expect(parsePriceInput(" 120,000 ")).toBe(120_000);
    expect(parsePriceInput("")).toBeNull();
    expect(parsePriceInput("abc")).toBeNull();
    expect(parsePriceInput("-5")).toBeNull();
  });
});
