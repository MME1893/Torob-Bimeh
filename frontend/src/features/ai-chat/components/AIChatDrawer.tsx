import { useEffect, useRef, useState, type RefObject } from "react";
import type { Offer } from "../../search/searchTypes";
import { contextLabel } from "../lib/buildChatContext";
import type {
  AnalysisSectionKey,
  ChatAttachment,
  ChatContextType,
  ChatMessage,
  ChatThread,
} from "../types";
import { AIChatComposer } from "./AIChatComposer";
import { AIChatContextBadge } from "./AIChatContextBadge";
import { AIChatHeader } from "./AIChatHeader";
import { AIChatMessageList } from "./AIChatMessageList";
import { AIChatSuggestedQuestions } from "./AIChatSuggestedQuestions";
import { ChatThreadHistory } from "./ChatThreadHistory";

const MOBILE_QUERY = "(max-width: 780px)";
const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** The drawer is only modal when it covers the whole screen. */
function useFullScreen() {
  const [fullScreen, setFullScreen] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.(MOBILE_QUERY).matches,
  );
  useEffect(() => {
    if (!window.matchMedia) return;
    const query = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setFullScreen(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return fullScreen;
}

type Props = {
  open: boolean;
  title: string;
  contextType: ChatContextType;
  sectionKey: AnalysisSectionKey | null;
  isHistorical: boolean;
  fetchedAt: string;
  messages: ChatMessage[];
  threads: ChatThread[];
  activeThreadId: string | null;
  offersById: Map<string, Offer>;
  busy: boolean;
  error: string | null;
  historyOpen: boolean;
  openerRef: RefObject<HTMLElement | null>;
  suggestions: string[];
  onClose: () => void;
  onNewChat: () => void;
  onOpenThread: (id: string) => void;
  onToggleHistory: () => void;
  onSend: (text: string, attachments: ChatAttachment[]) => void;
  onRetry: (id: string) => void;
};

export function AIChatDrawer({
  open,
  title,
  contextType,
  sectionKey,
  isHistorical,
  fetchedAt,
  messages,
  threads,
  activeThreadId,
  offersById,
  busy,
  error,
  historyOpen,
  openerRef,
  suggestions,
  onClose,
  onNewChat,
  onOpenThread,
  onToggleHistory,
  onSend,
  onRetry,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const fullScreen = useFullScreen();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      // Desktop is a side panel, so page focus stays reachable; only the
      // full-screen mobile variant traps Tab.
      if (event.key !== "Tab" || !fullScreen) return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [fullScreen, onClose, open]);

  // Only the full-screen variant covers the page, so only it should take focus
  // on open. The desktop side panel leaves focus where the user left it.
  useEffect(() => {
    if (!open || !fullScreen) return;
    panelRef.current?.querySelector<HTMLElement>("textarea,button")?.focus();
  }, [fullScreen, open]);

  if (!open) return null;
  const heading = title || contextLabel(contextType, sectionKey);

  return (
    <>
      {fullScreen && <div className="aic-backdrop" role="presentation" onMouseDown={onClose} />}
      <div
        ref={panelRef}
        className={`aic-drawer${fullScreen ? " is-fullscreen" : ""}`}
        role="dialog"
        aria-modal={fullScreen}
        aria-label={heading}
      >
        <AIChatHeader
          title={heading}
          historyOpen={historyOpen}
          onClose={onClose}
          onNewChat={onNewChat}
          onOpenHistory={onToggleHistory}
        />
        <AIChatContextBadge
          contextType={contextType}
          sectionKey={sectionKey}
          isHistorical={isHistorical}
          fetchedAt={fetchedAt}
        />
        {historyOpen && (
          <ChatThreadHistory
            threads={threads}
            activeThreadId={activeThreadId}
            onSelect={onOpenThread}
            onNewChat={onNewChat}
          />
        )}
        <AIChatMessageList
          messages={messages}
          offersById={offersById}
          onRetry={onRetry}
          busy={busy}
        />
        {error && (
          <p className="aic-drawer__error" role="alert">
            {error}
          </p>
        )}
        <AIChatSuggestedQuestions
          questions={suggestions}
          disabled={busy}
          onPick={(question) => void onSend(question, [])}
        />
        <AIChatComposer busy={busy} onSend={onSend} />
      </div>
    </>
  );
}
