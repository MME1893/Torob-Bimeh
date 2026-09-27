import type { ChatAttachment } from "../types";

/** Only textual attachments are supported, so the OpenRouter transport stays plain text. */
export const SUPPORTED_ATTACHMENT_SUFFIXES = [".txt", ".md", ".json", ".csv"] as const;
export const MAX_ATTACHMENTS_PER_MESSAGE = 2;
export const MAX_ATTACHMENT_BYTES = 512 * 1024;
export const MAX_TOTAL_ATTACHMENT_CHARS = 20_000;

export const UNSUPPORTED_ATTACHMENT_MESSAGE = "در این نسخه فقط فایل‌های متنی پشتیبانی می‌شوند.";
export const ATTACHMENT_TOO_LARGE_MESSAGE = "حجم فایل بیش از حد مجاز است.";
export const ATTACHMENT_UNREADABLE_MESSAGE = "خواندن این فایل ممکن نشد.";

export const attachmentAccept = SUPPORTED_ATTACHMENT_SUFFIXES.join(",");

export function isSupportedAttachmentName(name: string) {
  const lowered = name.toLowerCase();
  return SUPPORTED_ATTACHMENT_SUFFIXES.some((suffix) => lowered.endsWith(suffix));
}

export function formatBytes(size: number) {
  if (size < 1024) return `${size} بایت`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} کیلوبایت`;
  return `${(size / (1024 * 1024)).toFixed(1)} مگابایت`;
}

/**
 * Reads one picked file into a bounded attachment.
 *
 * Returns either the attachment or a Persian message that is safe to show inline.
 * Never throws, so an unreadable file cannot break the composer.
 */
export async function readAttachment(file: File): Promise<
  { ok: true; attachment: ChatAttachment } | { ok: false; message: string }
> {
  if (!isSupportedAttachmentName(file.name)) {
    return { ok: false, message: UNSUPPORTED_ATTACHMENT_MESSAGE };
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, message: ATTACHMENT_TOO_LARGE_MESSAGE };
  }
  let textContent: string;
  try {
    textContent = await file.text();
  } catch {
    return { ok: false, message: ATTACHMENT_UNREADABLE_MESSAGE };
  }
  if (!textContent.trim()) {
    return { ok: false, message: ATTACHMENT_UNREADABLE_MESSAGE };
  }
  if (textContent.length > MAX_TOTAL_ATTACHMENT_CHARS) {
    return { ok: false, message: ATTACHMENT_TOO_LARGE_MESSAGE };
  }
  return {
    ok: true,
    attachment: {
      id: newId("att"),
      name: file.name,
      mimeType: file.type || "text/plain",
      sizeBytes: file.size,
      textContent,
    },
  };
}

export function newId(prefix: string) {
  const random =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${random}`;
}
