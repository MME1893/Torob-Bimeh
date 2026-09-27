import { History, MessageSquarePlus, MessageSquareText, MoreVertical, Paperclip, X } from "lucide-react";

type Props = {
  historyOpen: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onToggleHistory: () => void;
  onShowMessages: () => void;
  onAttach: () => void;
  attachDisabled: boolean;
};

/**
 * Fixed vertical navigation rail on the physical LEFT of the drawer.
 * It never scrolls with the conversation; only the message area scrolls.
 */
export function AIChatNavRail({
  historyOpen,
  onClose,
  onNewChat,
  onToggleHistory,
  onShowMessages,
  onAttach,
  attachDisabled,
}: Props) {
  return (
    <nav className="aic-rail" aria-label="ناوبری گفتگو">
      <div className="aic-rail__top">
        <button
          className="aic-rail__close"
          type="button"
          onClick={onClose}
          aria-label="بستن گفتگو"
          title="بستن گفتگو"
        >
          <X aria-hidden="true" />
        </button>
        <button
          className="aic-rail__more"
          type="button"
          onClick={onToggleHistory}
          aria-label="گزینه‌های بیشتر"
          title="گزینه‌های بیشتر"
        >
          <MoreVertical aria-hidden="true" />
        </button>
        <button
          className={`aic-rail__item${historyOpen ? "" : " is-active"}`}
          type="button"
          onClick={onShowMessages}
          aria-label="گفتگوها"
          title="گفتگوها"
        >
          <MessageSquareText aria-hidden="true" />
          <span>گفتگوها</span>
        </button>
        <button
          className="aic-rail__item"
          type="button"
          onClick={onNewChat}
          aria-label="گفتگوی جدید"
          title="گفتگوی جدید"
        >
          <MessageSquarePlus aria-hidden="true" />
          <span>جدید</span>
        </button>
        <button
          className={`aic-rail__item${historyOpen ? " is-active" : ""}`}
          type="button"
          onClick={onToggleHistory}
          aria-label="تاریخچه گفتگوها"
          title="تاریخچه گفتگوها"
          aria-expanded={historyOpen}
        >
          <History aria-hidden="true" />
          <span>تاریخچه</span>
        </button>
      </div>
      <div className="aic-rail__spacer" />
      <button
        className="aic-rail__attach"
        type="button"
        onClick={onAttach}
        disabled={attachDisabled}
        aria-label="پیوست فایل"
        title="پیوست فایل"
      >
        <Paperclip aria-hidden="true" />
      </button>
    </nav>
  );
}
