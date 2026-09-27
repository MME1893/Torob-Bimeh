type Props = {
  questions: string[];
  disabled: boolean;
  onPick: (question: string) => void;
};

export function AIChatSuggestedQuestions({ questions, disabled, onPick }: Props) {
  if (!questions.length) return null;
  return (
    <div className="aic-suggestions">
      <span className="aic-suggestions__label">پرسش‌های پیشنهادی</span>
      <div className="aic-suggestions__chips">
        {questions.map((question) => (
          <button key={question} type="button" disabled={disabled} onClick={() => onPick(question)}>
            {question}
          </button>
        ))}
      </div>
    </div>
  );
}
