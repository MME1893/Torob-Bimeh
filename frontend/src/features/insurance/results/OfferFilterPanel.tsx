import { useEffect, useRef, useState } from "react";
import { Check, Star, X } from "lucide-react";
import {
  PAYMENT_LABELS,
  emptyFilters,
  parsePriceInput,
  type InsurerOption,
  type OfferFilters,
  type PaymentType,
} from "./offerFilters";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

type Props = {
  /** The filters currently in effect; the panel edits a copy until applied. */
  filters: OfferFilters;
  insurers: InsurerOption[];
  bounds: { min: number; max: number } | null;
  onApply: (filters: OfferFilters) => void;
  onClose: () => void;
};

const PAYMENT_TYPES: PaymentType[] = ["cash", "installments"];

/**
 * Filter panel for the «فیلترها» toolbar button.
 *
 * Reuses the established dialog behaviour of `AIAnalysisModal` (Escape to
 * close, focus moved in and restored, focus kept inside the dialog) and the same
 * visual language: white card, 18px radius, `#e4ece7` hairlines, the results
 * green gradient for the primary action. No new design tokens are introduced.
 *
 * Only real offer data is offered: the insurer list is built from the offers in
 * this result and the price range comes from their actual premiums, so the panel
 * can never filter on something that does not exist here.
 */
export function OfferFilterPanel({ filters, insurers, bounds, onApply, onClose }: Props) {
  const [draft, setDraft] = useState<OfferFilters>(filters);
  const [minText, setMinText] = useState(() => (filters.minPrice == null ? "" : String(filters.minPrice)));
  const [maxText, setMaxText] = useState(() => (filters.maxPrice == null ? "" : String(filters.maxPrice)));
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = "ir-filter-title";

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
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  const patch = (changes: Partial<OfferFilters>) => setDraft((current) => ({ ...current, ...changes }));

  const toggleInsurer = (key: string) =>
    setDraft((current) => ({
      ...current,
      insurerKeys: current.insurerKeys.includes(key)
        ? current.insurerKeys.filter((item) => item !== key)
        : [...current.insurerKeys, key],
    }));

  const clearAll = () => {
    const cleared = emptyFilters(filters.sort);
    setDraft(cleared);
    setMinText("");
    setMaxText("");
  };

  const apply = () => {
    const minPrice = parsePriceInput(minText);
    const maxPrice = parsePriceInput(maxText);
    onApply({
      ...draft,
      // A reversed range would silently hide everything, so normalise it.
      minPrice: minPrice != null && maxPrice != null && minPrice > maxPrice ? maxPrice : minPrice,
      maxPrice: minPrice != null && maxPrice != null && minPrice > maxPrice ? minPrice : maxPrice,
    });
  };

  return (
    <div
      className="ir-filter-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        className="ir-filter-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="ir-filter-head">
          <div>
            <span>فیلتر پیشنهادها</span>
            <h3 id={titleId}>{insurers.length ? `${insurers.length} شرکت بیمه` : "بدون پیشنهادی"}</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="بستن فیلترها">
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="ir-filter-body">
          <section className="ir-filter-group">
            <h4>شرکت بیمه</h4>
            <div className="ir-filter-chips">
              {insurers.map((insurer) => {
                const active = draft.insurerKeys.includes(insurer.key);
                return (
                  <button
                    key={insurer.key}
                    type="button"
                    className={`ir-filter-chip ${active ? "active" : ""}`}
                    aria-pressed={active}
                    onClick={() => toggleInsurer(insurer.key)}
                  >
                    {insurer.popular && <Star aria-hidden="true" />}
                    {insurer.label}
                    <small>{insurer.offers.toLocaleString("fa-IR")}</small>
                  </button>
                );
              })}
              {!insurers.length && <p className="ir-filter-note">شرکتی برای فیلتر وجود ندارد.</p>}
            </div>
          </section>

          <section className="ir-filter-group">
            <h4>نوع پرداخت</h4>
            <div className="ir-filter-chips">
              {PAYMENT_TYPES.map((type) => {
                const active = draft.payment === type;
                return (
                  <button
                    key={type}
                    type="button"
                    className={`ir-filter-chip ${active ? "active" : ""}`}
                    aria-pressed={active}
                    onClick={() => patch({ payment: active ? null : type })}
                  >
                    {PAYMENT_LABELS[type]}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="ir-filter-group">
            <h4>وضعیت خرید</h4>
            <div className="ir-filter-chips">
              <button
                type="button"
                className={`ir-filter-chip ${draft.readyToBuyOnly ? "active" : ""}`}
                aria-pressed={draft.readyToBuyOnly}
                onClick={() => patch({ readyToBuyOnly: !draft.readyToBuyOnly })}
              >
                آماده خرید
              </button>
            </div>
            <p className="ir-filter-note">فقط پیشنهادهایی که منبع برایشان قیمت نهایی ثبت کرده است.</p>
          </section>

          {bounds && (
            <section className="ir-filter-group">
              <h4>بازه قیمت</h4>
              <div className="ir-filter-range">
                <input
                  type="text"
                  inputMode="numeric"
                  value={minText}
                  placeholder={bounds.min.toLocaleString("fa-IR")}
                  aria-label="کمترین قیمت به تومان"
                  onChange={(event) => {
                    setMinText(event.target.value);
                    setDraft((current) => ({ ...current, minPrice: parsePriceInput(event.target.value) }));
                  }}
                />
                <span>تا</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={maxText}
                  placeholder={bounds.max.toLocaleString("fa-IR")}
                  aria-label="بیشترین قیمت به تومان"
                  onChange={(event) => {
                    setMaxText(event.target.value);
                    setDraft((current) => ({ ...current, maxPrice: parsePriceInput(event.target.value) }));
                  }}
                />
              </div>
              <p className="ir-filter-note">
                قیمت‌های این نتیجه از {bounds.min.toLocaleString("fa-IR")} تا {bounds.max.toLocaleString("fa-IR")} تومان است.
              </p>
            </section>
          )}

          <section className="ir-filter-group">
            <h4>تخفیف</h4>
            <div className="ir-filter-chips">
              <button
                type="button"
                className={`ir-filter-chip ${draft.discountOnly ? "active" : ""}`}
                aria-pressed={draft.discountOnly}
                onClick={() => patch({ discountOnly: !draft.discountOnly })}
              >
                داشتن تخفیف
              </button>
              <button
                type="button"
                className={`ir-filter-chip ${draft.popularOnly ? "active" : ""}`}
                aria-pressed={draft.popularOnly}
                onClick={() => patch({ popularOnly: !draft.popularOnly })}
              >
                شرکت‌های محبوب
              </button>
            </div>
          </section>
        </div>

        <footer className="ir-filter-foot">
          <button type="button" className="ir-filter-clear" onClick={clearAll}>
            حذف همه فیلترها
          </button>
          <button type="button" className="ir-filter-apply" onClick={apply}>
            <Check aria-hidden="true" />
            اعمال فیلترها
          </button>
        </footer>
      </div>
    </div>
  );
}
