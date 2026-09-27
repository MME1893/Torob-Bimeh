import { History, MessageSquarePlus, X } from "lucide-react";

type Props = {
  title: string;
  onClose: () => void;
  onOpenHistory: () => void;
  onNewChat: () => void;
  historyOpen: boolean;
};

export function AIChatHeader({ title, onClose, onOpenHistory, onNewChat, historyOpen }: Props) {
  return (
    <header className="aic-header">
      <div className="aic-header__identity">
        <img src="/ai_logo.png" alt="" aria-hidden="true" />
        <h2 className="aic-header__title">{title}</h2>
      </div>
      <div className="aic-header__actions">
        <button
          className={`aic-icon-button${historyOpen ? " is-active" : ""}`}
          type="button"
          onClick={onOpenHistory}
          aria-label="گفتگوهای این استعلام"
          aria-expanded={historyOpen}
          title="گفتگوهای این استعلام"
        >
          <History aria-hidden="true" />
        </button>
        <button
          className="aic-icon-button"
          type="button"
          onClick={onNewChat}
          aria-label="گفتگوی جدید"
          title="گفتگوی جدید"
        >
          <MessageSquarePlus aria-hidden="true" />
        </button>
        <button
          className="aic-icon-button"
          type="button"
          onClick={onClose}
          aria-label="بستن گفتگو"
          title="بستن گفتگو"
        >
          <X aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
