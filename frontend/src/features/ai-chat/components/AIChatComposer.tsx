import { useEffect, useRef, useState, type RefObject } from "react";
import { LoaderCircle, Paperclip, SendHorizontal, X } from "lucide-react";
import {
  attachmentAccept,
  formatBytes,
  MAX_ATTACHMENTS_PER_MESSAGE,
  readAttachment,
} from "../lib/attachmentUtils";
import { MAX_USER_MESSAGE_CHARS, type ChatAttachment } from "../types";

const MAX_ROWS = 5;
const LINE_HEIGHT = 24;

type Props = {
  busy: boolean;
  onSend: (text: string, attachments: ChatAttachment[]) => void;
  /** Owned by the drawer so the rail's attachment button can open the picker. */
  fileInputRef: RefObject<HTMLInputElement | null>;
};

export function AIChatComposer({ busy, onSend, fileInputRef }: Props) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // One row minimum, five rows maximum, internal scrolling beyond that.
  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, LINE_HEIGHT * MAX_ROWS)}px`;
  }, [text]);

  const trimmed = text.trim();
  const canSend = !busy && (!!trimmed || attachments.length > 0);

  const reset = () => {
    setText("");
    setAttachments([]);
    setNotice(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const submit = () => {
    if (!canSend) return;
    onSend(text, attachments);
    reset();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submit();
  };

  const onPickFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setNotice(null);
    for (const file of Array.from(files)) {
      if (attachments.length >= MAX_ATTACHMENTS_PER_MESSAGE) {
        setNotice(`در هر پیام حداکثر ${MAX_ATTACHMENTS_PER_MESSAGE} فایل می‌توانید اضافه کنید.`);
        break;
      }
      const result = await readAttachment(file);
      if (!result.ok) {
        setNotice(result.message);
        continue;
      }
      setAttachments((current) =>
        current.some((item) => item.name === result.attachment.name) ? current : [...current, result.attachment],
      );
    }
  };

  return (
    <form
      className="aic-composer"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {!!attachments.length && (
        <ul className="aic-composer__attachments">
          {attachments.map((attachment) => (
            <li key={attachment.id}>
              <Paperclip aria-hidden="true" />
              <span className="aic-composer__file-name">{attachment.name}</span>
              <small>{formatBytes(attachment.sizeBytes)}</small>
              <button
                type="button"
                onClick={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))}
                aria-label={`حذف فایل ${attachment.name}`}
              >
                <X aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {notice && (
        <p className="aic-composer__notice" role="alert">
          {notice}
        </p>
      )}
      <div className="aic-composer__row">
        <textarea
          ref={textareaRef}
          className="aic-composer__input"
          value={text}
          rows={1}
          maxLength={MAX_USER_MESSAGE_CHARS}
          disabled={busy}
          placeholder="سؤال خود را بنویسید..."
          aria-label="متن پیام"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <button
          className="aic-composer__send"
          type="submit"
          disabled={!canSend}
          aria-label="ارسال پیام"
          title="ارسال پیام"
        >
          {busy ? (
            <LoaderCircle className="aic-spin" aria-hidden="true" />
          ) : (
            <SendHorizontal className="aic-composer__send-icon" aria-hidden="true" />
          )}
        </button>
      </div>
      <input
        ref={fileInputRef}
        className="aic-composer__file-input"
        type="file"
        multiple
        accept={attachmentAccept}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => void onPickFiles(event.target.files)}
      />
    </form>
  );
}
