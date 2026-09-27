import type { ReactNode } from "react";
import {
  BadgeCheck,
  BrainCircuit,
  CircleDollarSign,
  ShieldCheck,
  Target,
  WalletCards,
} from "lucide-react";
import {
  COMPARISON_CARD_LABELS,
  COMPARISON_CARD_TYPES,
  type ComparisonAnalysisState,
  type ComparisonCardType,
} from "./comparisonAnalysis";

type Props = {
  state: ComparisonAnalysisState;
  /** Resolves an offer id to its insurer name for the card footers. */
  insurerName: (offerId: string) => string | undefined;
};

const CARD_ICONS: Record<ComparisonCardType, ReactNode> = {
  recommended: <BadgeCheck aria-hidden="true" />,
  cheapest: <CircleDollarSign aria-hidden="true" />,
  payment: <WalletCards aria-hidden="true" />,
  coverage_services: <ShieldCheck aria-hidden="true" />,
};

/**
 * The optional AI layer inside the comparison dialog.
 *
 * The deterministic table above it is always rendered first and never waits for
 * this. When the analysis is unavailable the section says so and the rest of the
 * dialog keeps working; it never offers a shortcut into the chat, because the
 * footer's "درباره این مقایسه سؤال بپرس" stays the single entry point.
 */
export function ComparisonAiSummary({ state, insurerName }: Props) {
  if (state.status === "idle") return null;

  if (state.status === "processing" || state.status === "error") {
    return (
      <section className={`irc-ai${state.status === "error" ? " is-error" : ""}`} aria-live="polite">
        <h4 className="irc-ai__title">
          <BrainCircuit aria-hidden="true" />
          جمع‌بندی و تحلیل هوشمند این مقایسه
        </h4>
        {state.status === "error" ? (
          <p className="irc-ai__status">{state.error}</p>
        ) : (
          <div className="irc-ai__skeleton">
            <div className="irc-ai__skeleton-line irc-ai__skeleton-line--wide" />
            <div className="irc-ai__skeleton-line" />
            <div className="irc-ai__cards">
              {COMPARISON_CARD_TYPES.map((type) => (
                <div className="irc-ai__card irc-ai__card--skeleton" key={type}>
                  <span className="irc-ai__card-icon" aria-hidden="true" />
                  <span className="irc-ai__skeleton-line irc-ai__skeleton-line--label" />
                  <span className="irc-ai__skeleton-line" />
                </div>
              ))}
            </div>
            <span className="irc-ai__status">در حال تحلیل این مقایسه…</span>
          </div>
        )}
      </section>
    );
  }

  const { analysis } = state;
  return (
    <section className="irc-ai" aria-live="polite">
      <h4 className="irc-ai__title">
        <BrainCircuit aria-hidden="true" />
        جمع‌بندی و تحلیل هوشمند این مقایسه
      </h4>
      <p className="irc-ai__headline">{analysis.summary.headline}</p>
      <p className="irc-ai__body">{analysis.summary.body}</p>

      <div className="irc-ai__cards">
        {analysis.cards.map((card) => {
          const names = card.offer_ids
            .map(insurerName)
            .filter((name): name is string => !!name);
          return (
            <article className={`irc-ai__card irc-ai__card--${card.type}`} key={card.type}>
              <span className="irc-ai__card-icon">{CARD_ICONS[card.type]}</span>
              <b>{COMPARISON_CARD_LABELS[card.type]}</b>
              <p>{card.description}</p>
              {!!names.length && <small>{names.join("، ")}</small>}
            </article>
          );
        })}
      </div>

      {analysis.best_offer_reason && (
        <p className="irc-ai__reason">
          <Target aria-hidden="true" />
          {analysis.best_offer_reason}
        </p>
      )}
    </section>
  );
}
