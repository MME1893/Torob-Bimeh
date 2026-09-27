import { useState } from "react";
import { Check, Copy, Paperclip, ThumbsDown, ThumbsUp, UserRound } from "lucide-react";
import type { Offer } from "../../search/searchTypes";
import { formatBytes } from "../lib/attachmentUtils";
import type { ChatAttachment } from "../types";
import { RelatedOffers } from "./RelatedOffers";

const time = new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit" });

type Props = {
  role: "user" | "assistant";
  content: string;
  status: "ready" | "pending" | "error";
  createdAt: string;
  attachments: ChatAttachment[];
  referencedOfferIds: string[];
  offersById: Map<string, Offer>;
  onRetry: () => void;
  retryDisabled: boolean;
  onViewOffer?: (offerId: string) => void;
  onFeedback?: (value: "up" | "down") => void;
};

export function AIChatMessage({
  role,
  content,
  status,
  createdAt,
  attachments,
  referencedOfferIds,
  offersById,
  onRetry,
  retryDisabled,
  onViewOffer,
  onFeedback,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const referenced = referencedOfferIds
    .map((id) => ({ id, offer: offersById.get(id) }))
    .filter((item): item is { id: string; offer: Offer } => !!item.offer);
  const parsedDate = new Date(createdAt);
  const stamp = Number.isNaN(parsedDate.getTime()) ? "" : time.format(parsedDate);

  const copy = async () => {
    if (!content) return;
    await navigator.clipboard.writeText(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const vote = (value: "up" | "down") => {
    setFeedback(value);
    onFeedback?.(value);
  };

  return (
    <article className={`aic-message aic-message--${role} is-${status}`}>
      <span className="aic-message__avatar" aria-hidden="true">
        {role === "assistant" ? <img src="/ai_logo.png" alt="" /> : <UserRound />}
      </span>
      <div className="aic-message__content">
        <div className="aic-message__body">
          {status === "pending" ? (
            <div className="aic-typing" role="status" aria-label="در حال آماده‌سازی پاسخ">
              <span /><span /><span />
              <b>در حال بررسی همین استعلام...</b>
            </div>
          ) : (
            <>
              {!!attachments.length && (
                <ul className="aic-message__attachments">
                  {attachments.map((attachment) => (
                    <li key={attachment.id}>
                      <Paperclip aria-hidden="true" />
                      <span>{attachment.name}</span>
                      <small>{formatBytes(attachment.sizeBytes)}</small>
                    </li>
                  ))}
                </ul>
              )}
              {!!content && <p className="aic-message__text">{content}</p>}
              {status === "error" && (
                <div className="aic-message__error">
                  <span>پاسخی دریافت نشد.</span>
                  <button type="button" onClick={onRetry} disabled={retryDisabled}>تلاش دوباره</button>
                </div>
              )}
            </>
          )}
          {status === "ready" && (
            <footer className="aic-message__footer">
              {role === "assistant" && (
                <div className="aic-message__actions">
                  <button className={feedback === "up" ? "is-active" : ""} type="button" onClick={() => vote("up")} aria-label="پسندیدن پاسخ" title="پسندیدن پاسخ"><ThumbsUp /></button>
                  <button className={feedback === "down" ? "is-active" : ""} type="button" onClick={() => vote("down")} aria-label="نپسندیدن پاسخ" title="نپسندیدن پاسخ"><ThumbsDown /></button>
                  <button type="button" onClick={() => void copy()} aria-label="کپی پاسخ" title={copied ? "کپی شد" : "کپی پاسخ"}>{copied ? <Check /> : <Copy />}</button>
                </div>
              )}
              {stamp && <time dateTime={createdAt}>{stamp}</time>}
            </footer>
          )}
        </div>
        {role === "assistant" && status === "ready" && (
          <RelatedOffers items={referenced} onViewOffer={onViewOffer} />
        )}
      </div>
    </article>
  );
}
