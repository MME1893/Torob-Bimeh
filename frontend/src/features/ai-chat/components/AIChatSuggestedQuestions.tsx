import { useState } from "react";
import { ChevronDown, Coins, CreditCard, FileText, type LucideIcon } from "lucide-react";

type Props = {
  questions: string[];
  disabled: boolean;
  onPick: (question: string) => void;
};

/**
 * Presentation-layer icon mapping. The backend carries no question type, so a
 * simple keyword heuristic picks a sensible icon; the text stays fully dynamic.
 */
function iconFor(question: string): LucideIcon {
  if (/قسط|پرداخت|چک|اعتباری|سود|هزینه/.test(question)) return CreditCard;
  if (/قیمت|تومان|ارزش|تخفیف/.test(question)) return Coins;
  return FileText;
}

export function AIChatSuggestedQuestions({ questions, disabled, onPick }: Props) {
  const [open, setOpen] = useState(true);
  if (!questions.length) return null;

  return (
    <section className="aic-suggestions" aria-label="سوالات پیشنهادی">
      <button
        className="aic-suggestions__head"
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <ChevronDown className={open ? "" : "is-collapsed"} aria-hidden="true" />
        <span>سوالات پیشنهادی</span>
      </button>
      {open && (
        <div className="aic-suggestions__list">
          {questions.map((question) => {
            const Icon = iconFor(question);
            return (
              <button key={question} type="button" disabled={disabled} onClick={() => onPick(question)}>
                <Icon aria-hidden="true" />
                <span>{question}</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
