import type { Offer } from "../../search/searchTypes";
import type { InsuranceKind } from "../../ai-analysis/lib/normalizeQuote";
import azkiLogo from "../../../assets/insurance/azki.png";
import sabimLogo from "../../../assets/insurance/sabim.png";
import bimehBazarLogo from "../../../assets/insurance/bimehbazar.png";
import bimehLogo from "../../../assets/insurance/bimeh.com.png";

/** Single Persian number formatter shared by the list, the detail panel and the comparison. */
export const number = new Intl.NumberFormat("fa-IR");

export const providerMeta: Record<string, { name: string; logo: string }> = {
  azki: { name: "ازکی", logo: azkiLogo },
  sabim: { name: "سابیم", logo: sabimLogo },
  bimebazar: { name: "بیمه‌بازار", logo: bimehBazarLogo },
  bimeh: { name: "بیمه‌دات‌کام", logo: bimehLogo },
};

export const providerOrder = ["azki", "sabim", "bimebazar", "bimeh"];

/** Display names the search box also matches against, beside the insurer name. */
export const providerNames: Record<string, string> = Object.fromEntries(
  Object.entries(providerMeta).map(([key, meta]) => [key, meta.name]),
);

export const productName = (kind: InsuranceKind | null) =>
  kind === "body_car" ? "بیمه بدنه" : kind === "third_motor" ? "بیمه شخص ثالث موتور" : "بیمه شخص ثالث";

/** Never throws on an unknown provider code; falls back to the raw key. */
export const providerLabel = (provider: string) => providerMeta[provider]?.name ?? provider;

export const providerLogo = (provider: string) => providerMeta[provider]?.logo;

export const formatToman = (value: number) => `${number.format(value)} تومان`;

/** The single price of an offer. Never recalculated, never derived. */
export const offerPrice = (offer: Offer) => offer.premium.amount_toman;
