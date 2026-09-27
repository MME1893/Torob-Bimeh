import { useEffect, useRef } from "react";
import { AlertTriangle, ArrowLeft, ChevronLeft, Coins, LoaderCircle, ShieldCheck, Sparkles, Star, X } from "lucide-react";
import type { Offer } from "../search/searchTypes";
import { resolveInsurerLogo } from "../insurance/results/insurerLogos";
import type { AIState, AnalysisSection } from "./lib/types";

const number = new Intl.NumberFormat("fa-IR");
const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])';

function referencedIds(section: AnalysisSection) {
  return [
    ...new Set(
      [
        ...section.recommended_offer_ids,
        ...section.key_points.flatMap((point) => point.offer_ids),
        section.cheapest_offer_id,
        section.best_value_offer_id,
      ].filter((id): id is string => !!id),
    ),
  ];
}

type Props = {
  state: AIState;
  section: AnalysisSection | null;
  sectionTitle: string;
  lookup: Map<string, Offer>;
  onClose: () => void;
  onRetry: () => void;
  onSelectReferencedOffer: (offerId: string) => void;
  onAskAboutAnalysis: () => void;
  /** The control that opened the dialog, so focus can be restored to it. */
  openerRef: React.RefObject<HTMLElement | null>;
};

export function AIAnalysisModal({
  state,
  section,
  sectionTitle,
  lookup,
  onClose,
  onRetry,
  onSelectReferencedOffer,
  onAskAboutAnalysis,
  openerRef,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = "ai-modal-title";

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
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
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      (openerRef.current ?? previouslyFocused)?.focus?.();
    };
  }, [onClose, openerRef]);

  const referenced = section ? referencedIds(section) : [];
  const pending = state.status === "idle" || state.status === "processing";

  return (
    <div
      className="ir-ai-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        className="ir-ai-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="ir-ai-modal-head">
          <div>
            <span>تحلیل هوشمند</span>
            <h3 id={titleId}>{sectionTitle}</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="بستن تحلیل">
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="ir-ai-modal-body">
          {pending && (
            <div className="ir-ai-modal-state">
              <LoaderCircle className="ir-spin" aria-hidden="true" />
              <b>در حال تحلیل پیشنهادهای بیمه...</b>
              <p>می‌توانید این پنجره را باز بگذارید؛ نتیجه به‌صورت خودکار نمایش داده می‌شود.</p>
            </div>
          )}
          {state.status === "error" && (
            <div className="ir-ai-modal-state">
              <AlertTriangle aria-hidden="true" />
              <b>تحلیل هوشمند آماده نشد</b>
              <p>نتایج عادی بیمه همچنان در دسترس است.</p>
              <button type="button" onClick={onRetry}>
                تلاش دوباره
              </button>
            </div>
          )}
          {section && (
            <>
              <h4 className="ir-ai-modal-headline">{section.headline}</h4>
              <p className="ir-ai-modal-summary">{section.summary}</p>

              {!!section.key_points.length && (
                <div className="ir-ai-points" data-count={section.key_points.length}>
                  {section.key_points.map((point, index) => (
                    <article className={`tone-${point.tone}`} key={`${point.title}-${index}`}>
                      <span className="ir-ai-point-icon" aria-hidden="true">
                        {index % 3 === 0 ? <Star /> : index % 3 === 1 ? <Coins /> : <ShieldCheck />}
                      </span>
                      <b>{point.title}</b>
                      <p>{point.description}</p>
                    </article>
                  ))}
                </div>
              )}

              {!!referenced.length && (
                <section className="ir-ai-references">
                  <h4>پیشنهادهای اشاره‌شده</h4>
                  {referenced.map((id) => {
                    const offer = lookup.get(id);
                    if (!offer) return null;
                    const logo = resolveInsurerLogo(offer.insurer_name);
                    return (
                      <div key={id}>
                        <ChevronLeft className="ir-ai-reference-chevron" aria-hidden="true" />
                        {logo ? <img src={logo} alt="" onError={(event) => { event.currentTarget.hidden = true; }} /> : <span className="ir-ai-reference-mark"><ShieldCheck aria-hidden="true" /></span>}
                        <span>
                          <b>{offer.insurer_name}</b>
                          <small>{offer.provider}</small>
                        </span>
                        <strong>
                          {offer.premium.amount_toman == null
                            ? "—"
                            : `${number.format(offer.premium.amount_toman)} تومان`}
                        </strong>
                        <button
                          type="button"
                          onClick={() => onSelectReferencedOffer(id)}
                          aria-label={`مشاهده پیشنهاد ${offer.insurer_name}`}
                        >
                          مشاهده پیشنهاد
                          <ArrowLeft aria-hidden="true" />
                        </button>
                      </div>
                    );
                  })}
                </section>
              )}

              {!!section.caveats.length && (
                <section className="ir-ai-caveats">
                  <h4>نکات قابل توجه</h4>
                  <ul>
                    {section.caveats.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>

        {section && !pending && (
          <footer className="ir-ai-modal-foot">
            <button className="ir-ai-ask" type="button" onClick={onAskAboutAnalysis}>
              <Sparkles aria-hidden="true" />
              درباره این تحلیل سؤال بپرس
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
