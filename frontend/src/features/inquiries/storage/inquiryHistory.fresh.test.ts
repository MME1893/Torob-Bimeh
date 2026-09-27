import { describe, expect, it } from "vitest";
import { DB_NAME, DB_VERSION, getInquiry } from "./inquiryHistory";
import { getThreadsForInquiry } from "../../ai-chat/storage/chatHistory";

/** A first-time visitor must end up with every store, without any migration step. */
function openFresh() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const opening = indexedDB.open(DB_NAME, DB_VERSION);
    opening.onupgradeneeded = () => {
      const db = opening.result;
      for (const name of ["inquiries", "metadata", "chatThreads", "chatMessages"]) {
        if (db.objectStoreNames.contains(name)) continue;
        const store = db.createObjectStore(name, { keyPath: name === "metadata" ? "key" : "id" });
        if (name === "inquiries") {
          store.createIndex("createdAt", "createdAt");
          store.createIndex("lastOpenedAt", "lastOpenedAt");
        }
        if (name === "chatThreads") {
          store.createIndex("inquiryId", "inquiryId");
          store.createIndex("updatedAt", "updatedAt");
          store.createIndex("inquiryId_updatedAt", ["inquiryId", "updatedAt"]);
        }
        if (name === "chatMessages") {
          store.createIndex("threadId", "threadId");
          store.createIndex("createdAt", "createdAt");
          store.createIndex("threadId_createdAt", ["threadId", "createdAt"]);
        }
      }
    };
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => resolve(opening.result);
  });
}

describe("fresh install", () => {
  it("creates every object store for a first-time visitor", async () => {
    const db = await openFresh();
    const stores = Array.from(db.objectStoreNames);
    db.close();
    expect(stores).toEqual(expect.arrayContaining(["inquiries", "metadata", "chatThreads", "chatMessages"]));
  });

  it("starts with an empty, usable inquiry and chat history", async () => {
    expect(await getInquiry("inq_missing")).toBeNull();
    expect(await getThreadsForInquiry("inq_missing")).toEqual([]);
  });
});
