import { describe, expect, it } from "vitest";
import {
  createThread,
  createThreadWithFirstMessage,
  deleteThread,
  getLatestThreadForInquiry,
  getMessagesForThread,
  getThread,
  getThreadsForInquiry,
  recoverInterruptedMessages,
  saveMessage,
  updateMessage,
} from "./chatHistory";
import type { NewThreadInput } from "./chatHistory";
import type { AnalysisSectionSnapshot, ChatAttachment } from "../types";

const attachment = (id: string): ChatAttachment => ({
  id,
  name: "notes.txt",
  mimeType: "text/plain",
  sizeBytes: 12,
  textContent: "محتوای فایل آزمایشی",
});

const snapshot = (headline: string): AnalysisSectionSnapshot => ({
  headline,
  summary: "خلاصهٔ ذخیره‌شدهٔ این بخش.",
  key_points: [],
  recommended_offer_ids: ["azki:ایران:0"],
  caveats: [],
  cheapest_offer_id: null,
  best_value_offer_id: null,
});

const threadInput = (overrides: Partial<NewThreadInput> = {}): NewThreadInput => ({
  inquiryId: "inq_a",
  title: "گفتگوی عمومی",
  contextType: "inquiry",
  sectionKey: null,
  ...overrides,
});

describe("chat thread storage", () => {
  it("creates a thread and reads it back", async () => {
    const thread = await createThread(threadInput());
    expect(thread.schemaVersion).toBe(1);
    expect(await getThread(thread.id)).toMatchObject({ id: thread.id, inquiryId: "inq_a" });
  });

  it("creates the first user message atomically with the thread", async () => {
    const { thread, message } = await createThreadWithFirstMessage(
      threadInput({ inquiryId: "inq_atomic" }),
      { threadId: "", role: "user", content: "اولین پرسش", status: "ready", seq: 0 },
    );
    expect(message.threadId).toBe(thread.id);
    const messages = await getMessagesForThread(thread.id);
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe("اولین پرسش");
  });

  it("persists a section snapshot so an old thread keeps its own context", async () => {
    const thread = await createThread(
      threadInput({
        inquiryId: "inq_section",
        title: "گفتگو درباره شرایط پرداخت",
        contextType: "analysis_section",
        sectionKey: "payment_terms",
        referencedOfferIds: ["azki:ایران:0"],
        analysisSectionSnapshot: snapshot("شرایط پرداخت ثبت‌شده"),
      }),
    );
    const stored = await getThread(thread.id);
    expect(stored?.sectionKey).toBe("payment_terms");
    expect(stored?.analysisSectionSnapshot?.headline).toBe("شرایط پرداخت ثبت‌شده");
    expect(stored?.referencedOfferIds).toEqual(["azki:ایران:0"]);
  });

  it("isolates threads by inquiryId", async () => {
    await createThread(threadInput({ inquiryId: "inq_one", title: "یک" }));
    await createThread(threadInput({ inquiryId: "inq_two", title: "دو" }));
    const forOne = await getThreadsForInquiry("inq_one");
    expect(forOne).toHaveLength(1);
    expect(forOne[0].title).toBe("یک");
  });

  it("isolates messages by threadId", async () => {
    const first = await createThread(threadInput({ inquiryId: "inq_iso" }));
    const second = await createThread(threadInput({ inquiryId: "inq_iso" }));
    await saveMessage({ threadId: first.id, role: "user", content: "فقط برای اولی", status: "ready", seq: 0 });
    expect(await getMessagesForThread(second.id)).toEqual([]);
    expect(await getMessagesForThread(first.id)).toHaveLength(1);
  });

  it("orders threads by updatedAt descending and finds the latest", async () => {
    const inquiryId = "inq_sorted";
    const older = await createThread(threadInput({ inquiryId, title: "قدیمی" }));
    await new Promise((resolve) => setTimeout(resolve, 5));
    const newer = await createThread(threadInput({ inquiryId, title: "جدید" }));
    const list = await getThreadsForInquiry(inquiryId);
    expect(list.map((item) => item.title)).toEqual(["جدید", "قدیمی"]);
    expect((await getLatestThreadForInquiry(inquiryId))?.id).toBe(newer.id);
    expect(older.id).not.toBe(newer.id);
  });

  it("keeps message order stable within the same millisecond", async () => {
    const { thread } = await createThreadWithFirstMessage(
      threadInput({ inquiryId: "inq_seq" }),
      { threadId: "", role: "user", content: "کاربر", status: "ready", seq: 0 },
    );
    await saveMessage({ threadId: thread.id, role: "assistant", content: "پاسخ", status: "ready", seq: 1 });
    const messages = await getMessagesForThread(thread.id);
    expect(messages.map((item) => [item.role, item.seq])).toEqual([
      ["user", 0],
      ["assistant", 1],
    ]);
  });

  it("persists attachment content with the user message", async () => {
    const { thread, message } = await createThreadWithFirstMessage(
      threadInput({ inquiryId: "inq_files" }),
      {
        threadId: "",
        role: "user",
        content: "این فایل را بررسی کن",
        attachments: [attachment("att_1")],
        status: "ready",
        seq: 0,
      },
    );
    const [stored] = await getMessagesForThread(thread.id);
    expect(stored.id).toBe(message.id);
    expect(stored.attachments).toHaveLength(1);
    expect(stored.attachments[0].textContent).toBe("محتوای فایل آزمایشی");
    expect(stored.attachments[0].name).toBe("notes.txt");
  });

  it("updates an assistant placeholder into a ready answer with follow-ups", async () => {
    const { thread } = await createThreadWithFirstMessage(
      threadInput({ inquiryId: "inq_ready" }),
      { threadId: "", role: "user", content: "پرسش", status: "ready", seq: 0 },
    );
    const placeholder = await saveMessage({
      threadId: thread.id,
      role: "assistant",
      content: "",
      status: "pending",
      seq: 1,
    });
    expect((await getMessagesForThread(thread.id))[1].status).toBe("pending");
    await updateMessage(placeholder.id, {
      status: "ready",
      content: "پاسخ نهایی",
      referencedOfferIds: ["azki:ایران:0"],
      suggestedQuestions: ["پرسش بعدی"],
    });
    const [user, assistant] = await getMessagesForThread(thread.id);
    expect(user.status).toBe("ready");
    expect(assistant.status).toBe("ready");
    expect(assistant.content).toBe("پاسخ نهایی");
    expect(assistant.suggestedQuestions).toEqual(["پرسش بعدی"]);
    expect(assistant.referencedOfferIds).toEqual(["azki:ایران:0"]);
  });

  it("marks a failed assistant message and keeps the user history", async () => {
    const { thread } = await createThreadWithFirstMessage(
      threadInput({ inquiryId: "inq_error" }),
      { threadId: "", role: "user", content: "پرسش", status: "ready", seq: 0 },
    );
    const placeholder = await saveMessage({
      threadId: thread.id,
      role: "assistant",
      content: "",
      status: "pending",
      seq: 1,
    });
    await updateMessage(placeholder.id, { status: "error" });
    const messages = await getMessagesForThread(thread.id);
    expect(messages).toHaveLength(2);
    expect(messages[0].content).toBe("پرسش");
    expect(messages[1].status).toBe("error");
  });

  it("recovers an interrupted pending message as retryable after a reload", async () => {
    const { thread } = await createThreadWithFirstMessage(
      threadInput({ inquiryId: "inq_reload" }),
      { threadId: "", role: "user", content: "پرسش", status: "ready", seq: 0 },
    );
    await saveMessage({ threadId: thread.id, role: "assistant", content: "", status: "pending", seq: 1 });
    const recovered = await recoverInterruptedMessages(thread.id);
    expect(recovered[1].status).toBe("error");
    // A second pass must be a no-op rather than flipping a genuine error again.
    expect((await recoverInterruptedMessages(thread.id))[1].status).toBe("error");
  });

  it("returns null when updating an unknown message", async () => {
    expect(await updateMessage("msg_missing", { status: "error" })).toBeNull();
  });

  it("deletes only the chosen thread and leaves the inquiry history alone", async () => {
    const inquiryId = "inq_delete";
    const keep = await createThread(threadInput({ inquiryId, title: "نگه‌دار" }));
    const drop = await createThread(threadInput({ inquiryId, title: "حذف" }));
    await saveMessage({ threadId: drop.id, role: "user", content: "پیام", status: "ready", seq: 0 });
    await deleteThread(drop.id);
    expect(await getThread(drop.id)).toBeUndefined();
    expect(await getMessagesForThread(drop.id)).toEqual([]);
    const remaining = await getThreadsForInquiry(inquiryId);
    expect(remaining.map((item) => item.id)).toEqual([keep.id]);
  });

  it("bumps updatedAt when a message is appended", async () => {
    const inquiryId = "inq_touch";
    const first = await createThread(threadInput({ inquiryId, title: "الف" }));
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await createThread(threadInput({ inquiryId, title: "ب" }));
    const before = (await getThread(first.id))?.updatedAt ?? "";
    await saveMessage({ threadId: first.id, role: "user", content: "تازه", status: "ready", seq: 0 });
    const after = (await getThread(first.id))?.updatedAt ?? "";
    expect(after > before).toBe(true);
    expect(after >= second.updatedAt).toBe(true);
  });

  it("orders threads deterministically when timestamps tie", async () => {
    const inquiryId = "inq_tie";
    const a = await createThread(threadInput({ inquiryId, title: "الف" }));
    const b = await createThread(threadInput({ inquiryId, title: "ب" }));
    // Same timestamp on every comparable field, so only the id tie-breaker decides.
    await forceTimestamp(a.id, "2026-01-01T00:00:00.000Z");
    await forceTimestamp(b.id, "2026-01-01T00:00:00.000Z");
    const first = await getThreadsForInquiry(inquiryId);
    const second = await getThreadsForInquiry(inquiryId);
    expect(new Set(first.map((thread) => thread.id))).toEqual(new Set([a.id, b.id]));
    expect(second.map((thread) => thread.id)).toEqual(first.map((thread) => thread.id));
    expect(first[0].updatedAt).toBe(first[1].updatedAt);
  });

  it("moves an older thread back to the top once it is written to", async () => {
    const inquiryId = "inq_promote";
    const older = await createThread(threadInput({ inquiryId, title: "قدیمی" }));
    const newer = await createThread(threadInput({ inquiryId, title: "جدید" }));
    await forceTimestamp(older.id, "2026-01-01T00:00:00.000Z");
    await forceTimestamp(newer.id, "2026-01-02T00:00:00.000Z");
    expect((await getThreadsForInquiry(inquiryId))[0].id).toBe(newer.id);
    await saveMessage({ threadId: older.id, role: "user", content: "تازه", status: "ready", seq: 0 });
    expect((await getThreadsForInquiry(inquiryId))[0].id).toBe(older.id);
  });
});

/** Overwrites a thread's timestamps directly, reading before opening the write transaction. */
function forceTimestamp(threadId: string, value: string) {
  return new Promise<void>((resolve, reject) => {
    const read = indexedDB.open("torobimeh-inquiries");
    read.onerror = () => reject(read.error);
    read.onsuccess = () => {
      const db = read.result;
      const get = db.transaction("chatThreads").objectStore("chatThreads").get(threadId);
      get.onsuccess = () => {
        const current = get.result as { id: string; createdAt: string; updatedAt: string };
        const tx = db.transaction("chatThreads", "readwrite");
        tx.objectStore("chatThreads").put({ ...current, createdAt: value, updatedAt: value });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      get.onerror = () => reject(get.error);
    };
  });
}
