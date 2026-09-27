import type { QuoteAnalysis } from "../ai/types";
import type { InsuranceKind } from "../ai/normalizeQuote";
import type { SearchResult } from "../searchTypes";

export const DB_NAME = "torobimeh-inquiries";
export const DB_VERSION = 1;
export const INQUIRY_SCHEMA_VERSION = 1;

export type AIStatus = "idle" | "processing" | "ready" | "error";
export type InquiryRecord = {
  id: string;
  schemaVersion: typeof INQUIRY_SCHEMA_VERSION;
  insuranceKind: InsuranceKind;
  displayTitle: string;
  createdAt: string;
  lastOpenedAt: string;
  offerCount: number;
  sourceCount: number;
  lowestPrice: number | null;
  aiStatus: AIStatus;
  result: SearchResult;
  analysis: QuoteAnalysis | null;
};

export type RecentInquiry = Omit<InquiryRecord, "result" | "analysis" | "schemaVersion">;

const title: Record<InsuranceKind, string> = {
  third_car: "بیمه شخص ثالث خودرو",
  body_car: "بیمه بدنه خودرو",
  third_motor: "بیمه شخص ثالث موتورسیکلت",
};

const request = <T>(value: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  value.onsuccess = () => resolve(value.result);
  value.onerror = () => reject(value.error);
});

let database: Promise<IDBDatabase> | null = null;
function openDatabase() {
  if (!database) database = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error("IndexedDB unavailable"));
    const opening = indexedDB.open(DB_NAME, DB_VERSION);
    opening.onupgradeneeded = () => {
      const db = opening.result;
      const inquiries = db.createObjectStore("inquiries", { keyPath: "id" });
      inquiries.createIndex("createdAt", "createdAt");
      inquiries.createIndex("lastOpenedAt", "lastOpenedAt");
      db.createObjectStore("metadata", { keyPath: "key" });
    };
    opening.onsuccess = () => resolve(opening.result);
    opening.onerror = () => reject(opening.error);
  });
  return database;
}

const transactionDone = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error);
});

export function stableInquiryId(result: SearchResult) {
  const safe = result.request_id.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 120);
  return `inq_${safe || encodeURIComponent(result.fetched_at)}`;
}

function sanitizedResult(result: SearchResult): SearchResult {
  return {
    ...result,
    providers: result.providers.map((provider) => ({
      ...provider,
      raw_response: null,
      offers: provider.offers.map((offer) => ({ ...offer, raw_offer: {} })),
    })),
  };
}

export function makeInquiryRecord(result: SearchResult, insuranceKind: InsuranceKind, id = stableInquiryId(result)): InquiryRecord {
  const clean = sanitizedResult(result);
  const offers = clean.providers.flatMap((provider) => provider.offers);
  const prices = offers.map((offer) => offer.premium.amount_toman).filter((price): price is number => price != null);
  const now = new Date().toISOString();
  return {
    id,
    schemaVersion: INQUIRY_SCHEMA_VERSION,
    insuranceKind,
    displayTitle: title[insuranceKind],
    createdAt: result.fetched_at || now,
    lastOpenedAt: now,
    offerCount: offers.length,
    sourceCount: clean.providers.length,
    lowestPrice: prices.length ? Math.min(...prices) : null,
    aiStatus: "processing",
    result: clean,
    analysis: null,
  };
}

export async function saveInquirySnapshot(record: InquiryRecord) {
  const db = await openDatabase();
  const tx = db.transaction(["inquiries", "metadata"], "readwrite");
  const store = tx.objectStore("inquiries");
  const existing = await request(store.get(record.id)) as InquiryRecord | undefined;
  store.put(existing ? {
    ...record,
    createdAt: existing.createdAt,
    analysis: existing.analysis,
    aiStatus: existing.analysis ? "ready" : record.aiStatus,
  } : record);
  tx.objectStore("metadata").put({ key: "lastInquiryId", value: record.id });
  tx.objectStore("metadata").put({ key: "lastOpenedInquiryId", value: record.id });
  await transactionDone(tx);
  window.dispatchEvent(new Event("inquiry-history-changed"));
}

export async function getInquiry(id: string): Promise<InquiryRecord | null> {
  const db = await openDatabase();
  const value = await request(db.transaction("inquiries").objectStore("inquiries").get(id)) as InquiryRecord | undefined;
  if (!value || value.schemaVersion !== INQUIRY_SCHEMA_VERSION) return null;
  return value;
}

export async function updateInquiryAnalysis(id: string, analysis: QuoteAnalysis | null, status: AIStatus) {
  const db = await openDatabase();
  const tx = db.transaction("inquiries", "readwrite");
  const store = tx.objectStore("inquiries");
  const value = await request(store.get(id)) as InquiryRecord | undefined;
  if (value) store.put({ ...value, analysis, aiStatus: status });
  await transactionDone(tx);
  window.dispatchEvent(new Event("inquiry-history-changed"));
}

export async function markInquiryOpened(id: string) {
  const db = await openDatabase();
  const tx = db.transaction(["inquiries", "metadata"], "readwrite");
  const store = tx.objectStore("inquiries");
  const value = await request(store.get(id)) as InquiryRecord | undefined;
  if (value) store.put({ ...value, lastOpenedAt: new Date().toISOString() });
  tx.objectStore("metadata").put({ key: "lastOpenedInquiryId", value: id });
  await transactionDone(tx);
}

export async function getRecentInquiries(limit = 5): Promise<RecentInquiry[]> {
  const db = await openDatabase();
  const all = await request(db.transaction("inquiries").objectStore("inquiries").getAll()) as InquiryRecord[];
  return all
    .filter((item) => item.schemaVersion === INQUIRY_SCHEMA_VERSION)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
    .map(({ result: _result, analysis: _analysis, schemaVersion: _version, ...summary }) => summary);
}

