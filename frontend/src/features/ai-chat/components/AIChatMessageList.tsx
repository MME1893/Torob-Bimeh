import { useEffect, useRef } from "react";
import type { Offer } from "../../search/searchTypes";
import type { ChatMessage as ChatMessageModel } from "../types";
import { AIChatMessage } from "./AIChatMessage";

type Props = {
  messages: ChatMessageModel[];
  offersById: Map<string, Offer>;
  onRetry: (id: string) => void;
  busy: boolean;
  onViewOffer?: (offerId: string) => void;
};

export function AIChatMessageList({ messages, offersById, onRetry, busy, onViewOffer }: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, busy]);

  if (!messages.length) {
    return (
      <div className="aic-messages is-empty">
        <p>
          درباره همین استعلام بپرسید؛ پاسخ‌ها فقط از داده‌های ثبت‌شدهٔ این نتیجه ساخته می‌شوند.
        </p>
      </div>
    );
  }
  return (
    <div className="aic-messages" role="log" aria-live="polite" aria-label="پیام‌های گفتگو">
      {messages.map((message) => (
        <AIChatMessage
          key={message.id}
          role={message.role}
          content={message.content}
          status={message.status}
          createdAt={message.createdAt}
          attachments={message.attachments}
          referencedOfferIds={message.referencedOfferIds}
          offersById={offersById}
          retryDisabled={busy}
          onRetry={() => onRetry(message.id)}
          onViewOffer={onViewOffer}
        />
      ))}
      <div ref={endRef} />
    </div>
  );
}
