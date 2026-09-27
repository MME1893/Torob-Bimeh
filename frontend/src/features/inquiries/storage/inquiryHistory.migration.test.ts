import { beforeAll, describe, expect, it } from "vitest";
import {
  DB_NAME,
  getInquiry,
  getRecentInquiries,
  markInquiryOpened,
} from "./inquiryHistory";
import { getThreadsForInquiry } from "../../ai-chat/storage/chatHistory";
import type { InquiryRecord } from "./inquiryHistory";

/**
 * The migration test starts from a real version-1 database that already holds an
 * inquiry with a cached AI analysis. A test that only opens a fresh v2 database
 * would not prove that existing local data survives the upgrade.
 */

const V1_DB_VERSION = 1;
const INQUIRY_ID = "inq_legacy_001";

const offer = (name: string, provider: string, amount: number) => ({
  insurer_name: name,
  provider,
  premium: { raw_amount: amount, raw_unit: "toman", amount_toman: amount },
  price_before_discount_toman: amount + 100_000,
  discount_amount_toman: 100_000,
  discount_percent: 5,
  has_installments: true,
  installment_plans: [],
  payment_methods: ["اقساطی"],
  penalty: null,
  price_breakdown: [],
  discount_breakdown: [],
  insurer_metrics: null,
  benefits: [],
  badges: [],
  is_recommended: null,
  sale_rank: null,
  financial_coverage_toman: null,
  duration_months: 12,
  raw_offer: {},
});

const section = {
  headline: "خلاصه ثبت‌شده",
  summary: "این تحلیل پیش از به‌روزرسانی ذخیره شده بود.",
  key_points: [],
  recommended_offer_ids: ["azki:ایران:0"],
  caveats: [],
};

/** Mirrors exactly the stores and indexes that shipped with DB_VERSION = 1. */
function seedVersionOneDatabase() {
  return new Promise<void>((resolve, reject) => {
    const opening = indexedDB.open(DB_NAME, V1_DB_VERSION);
    opening.onupgradeneeded = () => {
      const db = opening.result;
      const inquiries = db.createObjectStore("inquiries", { keyPath: "id" });
      inquiries.createIndex("createdAt", "createdAt");
      inquiries.createIndex("lastOpenedAt", "lastOpenedAt");
      db.createObjectStore("metadata", { keyPath: "key" });
    };
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const record: InquiryRecord = {
        id: INQUIRY_ID,
        schemaVersion: 1,
        insuranceKind: "third_car",
        displayTitle: "بیمه شخص ثالث خودرو",
        createdAt: "2026-01-05T10:00:00.000Z",
        lastOpenedAt: "2026-01-05T10:00:00.000Z",
        offerCount: 2,
        sourceCount: 1,
        lowestPrice: 1_000_000,
        aiStatus: "ready",
        result: {
          request_id: "legacy_request",
          fetched_at: "2026-01-05T10:00:00.000Z",
          providers: [
            {
              provider: "azki",
              status: "ok",
              message: null,
              offers: [offer("ایران", "azki", 1_000_000), offer("سینا", "azki", 1_400_000)],
              raw_response: { legacy: true },
            },
          ],
        },
        analysis: {
          schema_version: "1.0",
          analysis_version: "1",
          sections: {
            smart_summary: section,
            coverage_services: section,
            payment_terms: section,
            price_value: { ...section, cheapest_offer_id: "azki:ایران:0", best_value_offer_id: "azki:ایران:0" },
          },
        },
      };
      const tx = db.transaction(["inquiries", "metadata"], "readwrite");
      tx.objectStore("inquiries").put(record);
      tx.objectStore("metadata").put({ key: "lastInquiryId", value: INQUIRY_ID });
      tx.objectStore("metadata").put({ key: "lastOpenedInquiryId", value: INQUIRY_ID });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
  });
}

function readStore(storeName: string) {
  return new Promise<{ stores: string[]; indexes: string[]; values: unknown[] }>((resolve, reject) => {
    const opening = indexedDB.open(DB_NAME);
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const store = db.transaction(storeName).objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => {
        const indexes = Array.from(store.indexNames);
        db.close();
        resolve({ stores: Array.from(db.objectStoreNames), indexes, values: request.result });
      };
      request.onerror = () => reject(request.error);
    };
  });
}

beforeAll(async () => {
  await seedVersionOneDatabase();
});

describe("IndexedDB v1 -> v2 migration", () => {
  it("keeps the version-1 inquiry and its cached AI analysis", async () => {
    const stored = await getInquiry(INQUIRY_ID);
    expect(stored).not.toBeNull();
    expect(stored?.schemaVersion).toBe(1);
    expect(stored?.result.providers[0].offers).toHaveLength(2);
    expect(stored?.result.providers[0].offers[0].insurer_name).toBe("ایران");
    expect(stored?.aiStatus).toBe("ready");
    expect(stored?.analysis?.schema_version).toBe("1.0");
    expect(stored?.analysis?.sections.price_value.cheapest_offer_id).toBe("azki:ایران:0");
    expect(stored?.analysis?.sections.smart_summary.headline).toBe("خلاصه ثبت‌شده");
  });

  it("still lists the migrated inquiry in the recent-inquiry summary", async () => {
    const recent = await getRecentInquiries(5);
    const summary = recent.find((item) => item.id === INQUIRY_ID);
    expect(summary).toBeDefined();
    expect(summary?.displayTitle).toBe("بیمه شخص ثالث خودرو");
    expect(summary?.offerCount).toBe(2);
    expect(summary?.aiStatus).toBe("ready");
  });

  it("creates the chat object stores without dropping the old ones", async () => {
    const store = await readStore("chatThreads");
    expect(store.stores).toEqual(
      expect.arrayContaining(["inquiries", "metadata", "chatThreads", "chatMessages"]),
    );
  });

  it("keeps the metadata store populated", async () => {
    const metadata = await readStore("metadata");
    expect(metadata.values).toEqual(
      expect.arrayContaining([
        { key: "lastInquiryId", value: INQUIRY_ID },
        { key: "lastOpenedInquiryId", value: INQUIRY_ID },
      ]),
    );
  });

  it("indexes chatThreads for inquiryId, updatedAt and the compound pair", async () => {
    const store = await readStore("chatThreads");
    expect(store.indexes).toEqual(
      expect.arrayContaining(["inquiryId", "updatedAt", "inquiryId_updatedAt"]),
    );
  });

  it("indexes chatMessages for threadId, createdAt and the compound pair", async () => {
    const store = await readStore("chatMessages");
    expect(store.indexes).toEqual(
      expect.arrayContaining(["threadId", "createdAt", "threadId_createdAt"]),
    );
  });

  it("still accepts writes to the upgraded database", async () => {
    await markInquiryOpened(INQUIRY_ID);
    const stored = await getInquiry(INQUIRY_ID);
    expect(stored?.createdAt).toBe("2026-01-05T10:00:00.000Z");
  });

  it("reports no chat threads for the migrated inquiry", async () => {
    expect(await getThreadsForInquiry(INQUIRY_ID)).toEqual([]);
  });
});
