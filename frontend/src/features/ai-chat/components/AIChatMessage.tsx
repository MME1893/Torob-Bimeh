import { Paperclip, ShieldCheck } from "lucide-react";
import { formatBytes } from "../lib/attachmentUtils";
import { resolveInsurerLogo } from "../../insurance/results/insurerLogos";
import type { Offer } from "../../search/searchTypes";
import type { ChatAttachment } from "../types";

const number = new Intl.NumberFormat("fa-IR");
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
}: Props) {
  const stamp = time.format(new Date(createdAt));
  const referenced = referencedOfferIds
    .map((id) => offersById.get(id))
    .filter((offer): offer is Offer => !!offer);
  return (
    <article className={`aic-message aic-message--${role} is-${status}`}>
      {role === "assistant" && (
        <span className="aic-message__avatar" aria-hidden="true">
          <img src="/ai_logo.png" alt="" />
        </span>
      )}
      <div className="aic-message__body">
        {status === "pending" ? (
          <div className="aic-typing" role="status">
            <span />
            <span />
            <span />
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
                <button type="button" onClick={onRetry} disabled={retryDisabled}>
                  تلاش دوباره
                </button>
              </div>
            )}
          </>
        )}
        {!!referenced.length && status === "ready" && (
          <ul className="aic-message__offers">
            {referenced.map((offer) => {
              const logo = resolveInsurerLogo(offer.insurer_name);
              return (
                <li key={`${offer.provider}:${offer.insurer_name}`}>
                  {logo ? <img src={logo} alt="" /> : <ShieldCheck aria-hidden="true" />}
                  <span>
                    <b>{offer.insurer_name}</b>
                    <small>{offer.provider}</small>
                  </span>
                  <strong>
                    {offer.premium.amount_toman == null
                      ? "—"
                      : `${number.format(offer.premium.amount_toman)} تومان`}
                  </strong>
                </li>
              );
            })}
          </ul>
        )}
        {status === "ready" && <time className="aic-message__time" dateTime={createdAt}>{stamp}</time>}
      </div>
    </article>
  );
}
