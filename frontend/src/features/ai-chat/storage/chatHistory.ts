import { openDatabase, request, transactionDone } from "../../inquiries/storage/inquiryHistory";
import type { AnalysisSectionKey } from "../../ai-analysis/lib/types";
import { newId } from "../lib/attachmentUtils";
import type {
  AnalysisSectionSnapshot,
  ChatAttachment,
  ChatContextType,
  ChatMessage,
  ChatThread,
} from "../types";
import { CHAT_SCHEMA_VERSION } from "../types";

export const CHAT_THREADS_STORE = "chatThreads";
export const CHAT_MESSAGES_STORE = "chatMessages";

export type NewThreadInput = {
  inquiryId: string;
  title: string;
  contextType: ChatContextType;
  sectionKey: AnalysisSectionKey | null;
  referencedOfferIds?: string[];
  analysisSectionSnapshot?: AnalysisSectionSnapshot | null;
};

export type NewMessageInput = {
  threadId: string;
  role: ChatMessage["role"];
  content: string;
  attachments?: ChatAttachment[];
  status: ChatMessage["status"];
  seq: number;
  /** Set when a thread is seeded with already-known assistant content. */
  referencedOfferIds?: string[];
  suggestedQuestions?: string[];
};

export type MessagePatch = Partial<
  Pick<ChatMessage, "content" | "status" | "referencedOfferIds" | "suggestedQuestions">
>;

function makeThread(input: NewThreadInput): ChatThread {
  const now = new Date().toISOString();
  return {
    id: newId("thr"),
    schemaVersion: CHAT_SCHEMA_VERSION,
    inquiryId: input.inquiryId,
    title: input.title,
    contextType: input.contextType,
    sectionKey: input.sectionKey,
    referencedOfferIds: input.referencedOfferIds ?? [],
    analysisSectionSnapshot: input.analysisSectionSnapshot ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

function makeMessage(input: NewMessageInput, timestamp: string): ChatMessage {
  return {
    id: newId("msg"),
    schemaVersion: CHAT_SCHEMA_VERSION,
    threadId: input.threadId,
    role: input.role,
    content: input.content,
    attachments: input.attachments ?? [],
    referencedOfferIds: input.referencedOfferIds ?? [],
    suggestedQuestions: input.suggestedQuestions ?? [],
    status: input.status,
    createdAt: timestamp,
    seq: input.seq,
  };
}

const bySequence = (a: ChatMessage, b: ChatMessage) =>
  a.createdAt === b.createdAt ? a.seq - b.seq : a.createdAt.localeCompare(b.createdAt);

/**
 * Newest first, with deterministic tie-breakers.
 *
 * `updatedAt` has millisecond resolution, so two threads written inside the same
 * tick would otherwise sort arbitrarily and "open the most recent thread" could
 * pick either one.
 */
const byRecency = (a: ChatThread, b: ChatThread) =>
  b.updatedAt.localeCompare(a.updatedAt) ||
  b.createdAt.localeCompare(a.createdAt) ||
  b.id.localeCompare(a.id);

export async function createThread(input: NewThreadInput) {
  const db = await openDatabase();
  const tx = db.transaction([CHAT_THREADS_STORE, CHAT_MESSAGES_STORE], "readwrite");
  const thread = makeThread(input);
  tx.objectStore(CHAT_THREADS_STORE).put(thread);
  await transactionDone(tx);
  return thread;
}

/**
 * Creates a thread and its first user message in a single transaction, so a
 * failure can never leave a half-created empty thread behind.
 */
export async function createThreadWithFirstMessage(input: NewThreadInput, message: NewMessageInput) {
  const db = await openDatabase();
  const tx = db.transaction([CHAT_THREADS_STORE, CHAT_MESSAGES_STORE], "readwrite");
  const thread = makeThread(input);
  const first = makeMessage({ ...message, threadId: thread.id }, thread.createdAt);
  tx.objectStore(CHAT_THREADS_STORE).put(thread);
  tx.objectStore(CHAT_MESSAGES_STORE).put(first);
  await transactionDone(tx);
  return { thread, message: first };
}

export async function getThread(id: string) {
  const db = await openDatabase();
  const value = (await request(
    db.transaction(CHAT_THREADS_STORE).objectStore(CHAT_THREADS_STORE).get(id),
  )) as ChatThread | undefined;
  return value && value.schemaVersion === CHAT_SCHEMA_VERSION ? value : undefined;
}

async function getMessage(id: string) {
  const db = await openDatabase();
  const value = (await request(
    db.transaction(CHAT_MESSAGES_STORE).objectStore(CHAT_MESSAGES_STORE).get(id),
  )) as ChatMessage | undefined;
  return value && value.schemaVersion === CHAT_SCHEMA_VERSION ? value : undefined;
}

export async function getThreadsForInquiry(inquiryId: string) {
  const db = await openDatabase();
  const index = db.transaction(CHAT_THREADS_STORE).objectStore(CHAT_THREADS_STORE).index("inquiryId");
  const all = (await request(index.getAll(inquiryId))) as ChatThread[];
  return all
    .filter((thread) => thread.schemaVersion === CHAT_SCHEMA_VERSION)
    .sort(byRecency);
}

export async function getLatestThreadForInquiry(inquiryId: string) {
  const [latest] = await getThreadsForInquiry(inquiryId);
  return latest ?? null;
}

/**
 * Appends a message and bumps the owning thread.
 *
 * Both reads happen before the write transaction opens, so the two writes are
 * issued synchronously. Chaining a second request after an `await` inside a
 * transaction risks landing after it has already auto-committed.
 */
export async function saveMessage(input: NewMessageInput) {
  const thread = await getThread(input.threadId);
  const now = new Date().toISOString();
  const message = makeMessage(input, now);
  const db = await openDatabase();
  const tx = db.transaction([CHAT_MESSAGES_STORE, CHAT_THREADS_STORE], "readwrite");
  tx.objectStore(CHAT_MESSAGES_STORE).put(message);
  if (thread) tx.objectStore(CHAT_THREADS_STORE).put({ ...thread, updatedAt: now });
  await transactionDone(tx);
  return message;
}

export async function updateMessage(id: string, patch: MessagePatch) {
  const existing = await getMessage(id);
  if (!existing) return null;
  const now = new Date().toISOString();
  const updated: ChatMessage = {
    ...existing,
    ...patch,
    attachments: existing.attachments,
    referencedOfferIds: patch.referencedOfferIds ?? existing.referencedOfferIds,
    suggestedQuestions: patch.suggestedQuestions ?? existing.suggestedQuestions,
  };
  const thread = await getThread(existing.threadId);
  const db = await openDatabase();
  const tx = db.transaction([CHAT_MESSAGES_STORE, CHAT_THREADS_STORE], "readwrite");
  tx.objectStore(CHAT_MESSAGES_STORE).put(updated);
  if (thread) tx.objectStore(CHAT_THREADS_STORE).put({ ...thread, updatedAt: now });
  await transactionDone(tx);
  return updated;
}

export async function getMessagesForThread(threadId: string) {
  const db = await openDatabase();
  const index = db
    .transaction(CHAT_MESSAGES_STORE)
    .objectStore(CHAT_MESSAGES_STORE)
    .index("threadId");
  const all = (await request(index.getAll(threadId))) as ChatMessage[];
  return all
    .filter((message) => message.schemaVersion === CHAT_SCHEMA_VERSION)
    .sort(bySequence);
}

/**
 * Marks orphaned pending assistant messages as failed.
 *
 * A reload can interrupt a generation, so a stored `pending` message with no
 * in-memory request behind it must become retryable instead of hanging forever.
 * The user's history is never removed.
 */
export async function recoverInterruptedMessages(threadId: string) {
  const messages = await getMessagesForThread(threadId);
  const stale = messages.filter(
    (message) => message.role === "assistant" && message.status === "pending",
  );
  if (!stale.length) return messages;
  for (const message of stale) await updateMessage(message.id, { status: "error" });
  return getMessagesForThread(threadId);
}

export async function deleteThread(id: string) {
  const db = await openDatabase();
  // Read the keys in their own transaction so the deletes below are all issued
  // synchronously in the write transaction.
  const index = db.transaction(CHAT_MESSAGES_STORE).objectStore(CHAT_MESSAGES_STORE).index("threadId");
  const keys = (await request(index.getAllKeys(id))) as IDBValidKey[];
  const tx = db.transaction([CHAT_THREADS_STORE, CHAT_MESSAGES_STORE], "readwrite");
  tx.objectStore(CHAT_THREADS_STORE).delete(id);
  for (const key of keys) tx.objectStore(CHAT_MESSAGES_STORE).delete(key);
  await transactionDone(tx);
}
