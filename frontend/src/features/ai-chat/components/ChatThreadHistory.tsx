import { contextLabel } from "../lib/buildChatContext";
import type { ChatThread } from "../types";

type Props = {
  threads: ChatThread[];
  activeThreadId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
};

const stamp = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleString("fa-IR");
};

export function ChatThreadHistory({ threads, activeThreadId, onSelect, onNewChat }: Props) {
  return (
    <section className="aic-history" aria-label="گفتگوهای این استعلام">
      <header>
        <h3>گفتگوهای این استعلام</h3>
        <button type="button" onClick={onNewChat}>
          گفتگوی جدید
        </button>
      </header>
      {threads.length ? (
        <ul>
          {threads.map((thread) => (
            <li key={thread.id}>
              <button
                type="button"
                className={thread.id === activeThreadId ? "is-active" : ""}
                aria-current={thread.id === activeThreadId}
                onClick={() => onSelect(thread.id)}
              >
                <b>{thread.title}</b>
                <small>زمینه: {contextLabel(thread.contextType, thread.sectionKey)}</small>
                <time dateTime={thread.updatedAt}>{stamp(thread.updatedAt)}</time>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="aic-history__empty">هنوز گفتگویی برای این استعلام ثبت نشده است.</p>
      )}
    </section>
  );
}
