import { useEffect, useRef } from "react";
import { ArrowLeft, Scale, Sparkles, X } from "lucide-react";
import type { Offer } from "../../../search/searchTypes";
import type { InsuranceKind } from "../../../ai-analysis/lib/normalizeQuote";
import { number } from "../offerPresentation";
import { ComparisonAiSummary } from "./ComparisonAiSummary";
import { ComparisonCaveats } from "./ComparisonCaveats";
import { ComparisonTable } from "./ComparisonTable";
import type { ComparisonAnalysisState } from "./comparisonAnalysis";
import { buildComparisonCaveats } from "./comparisonUtils";
import { MAX_COMPARISON_OFFERS } from "./comparisonSelection";

type Props = {
  columns: { offerId: string; offer: Offer }[];
  kind: InsuranceKind | null;
  /** Resolves a compared offer id to its insurer name. */
  insurerName: (offerId: string) => string | undefined;
  /** The optional AI layer. The table above never waits for it. */
  comparisonAnalysis: ComparisonAnalysisState;
  onClose: () => void;
  onAskAI: () => void;
  onViewOffer: (offerId: string) => void;
  /** The control that opened the dialog, so focus can be restored to it. */
  openerRef: React.RefObject<HTMLElement | null>;
};

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])';
const TITLE_ID = "comparison-modal-title";

/**
 * The comparison dialog.
 *
 * Rendered entirely from the real offer objects: it never calls the AI and stays
 * fully usable when the AI, the network or OpenRouter is unavailable. The AI
 * button is an optional hand-off to a conversation about these offers.
 *
 * The shell is a flex column with `overflow: hidden` and a single scrolling
 * body, so the header and footer can never overlap the content.
 */
export function ComparisonModal({
  columns,
  kind,
  insurerName,
  comparisonAnalysis,
  onClose,
  onAskAI,
  onViewOffer,
  openerRef,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const count = columns.length;
  // The badge follows the AI recommendation and nothing else: no frontend
  // scoring, and no fallback to the cheapest price. When the analysis is
  // unavailable this is null and the badge is not rendered at all.
  const bestOfferId =
    comparisonAnalysis.status === "ready" ? comparisonAnalysis.analysis.best_offer_id : null;
  const notes = buildComparisonCaveats(columns.map((column) => column.offer));

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
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

  return (
    <div
      className="irc-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        className="irc-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
      >
        <header className="irc-head">
          <span className="irc-head__badge">
            <Scale aria-hidden="true" />
            مقایسه پیشنهادها
          </span>
          <div className="irc-head__titles">
            <h3 id={TITLE_ID}>
              مقایسه {number.format(count)} پیشنهاد بیمه
            </h3>
            <p>جزئیات کلیدی این پیشنهادها را کنار هم ببینید و بهترین گزینه را انتخاب کنید.</p>
          </div>
          <button
            type="button"
            className="irc-head__close"
            onClick={onClose}
            aria-label="بستن مقایسه"
          >
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="irc-body">
          <ComparisonTable
            columns={columns}
            bestOfferId={bestOfferId}
            kind={kind}
            onViewOffer={onViewOffer}
          />
          <ComparisonAiSummary state={comparisonAnalysis} insurerName={insurerName} />
          <ComparisonCaveats notes={notes} />
        </div>

        <footer className="irc-foot">
          <div className="irc-foot__actions">
            <button type="button" className="irc-foot__back" onClick={onClose}>
              بازگشت به لیست
            </button>
            <button type="button" className="irc-foot__ask" onClick={onAskAI}>
              <Sparkles aria-hidden="true" />
              درباره این مقایسه سؤال بپرس
              <ArrowLeft className="irc-foot__ask-arrow" aria-hidden="true" />
            </button>
          </div>
          <p className="irc-foot__hint">
            گفتگو با هوش مصنوعی با زمینه همین {number.format(count)} پیشنهاد آغاز می‌شود
            {count === MAX_COMPARISON_OFFERS ? " (بیشترین تعداد مجاز)" : ""}.
          </p>
        </footer>
      </div>
    </div>
  );
}
