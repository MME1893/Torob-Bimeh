import { Check } from "lucide-react";

type Props = {
  selected: boolean;
  disabled: boolean;
  atMax: boolean;
  insurerName: string;
  onToggle: () => void;
};

/**
 * The comparison control exposed inside an existing offer row while the result
 * list is in comparison mode.
 *
 * A `button` with `role="checkbox"` gives real checkbox semantics and keyboard
 * behaviour while staying nestable inside the clickable row. The click always
 * stops propagation, so toggling the comparison never changes the primary
 * selected offer of the result page.
 */
export function ComparisonSelector({ selected, disabled, atMax, insurerName, onToggle }: Props) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      aria-label={`افزودن ${insurerName} به مقایسه`}
      disabled={disabled}
      className={`ir-compare-toggle${selected ? " is-on" : ""}`}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      title={disabled ? "برای مقایسه ابتدا یکی از پیشنهادهای انتخاب‌شده را حذف کنید" : undefined}
    >
      <span className="ir-compare-box" aria-hidden="true">
        {selected && <Check />}
      </span>
      <span className="ir-compare-text">
        {selected ? "در مقایسه" : disabled && atMax ? "حداکثر انتخاب" : "برای مقایسه"}
      </span>
    </button>
  );
}
