import { Scale, X } from "lucide-react";
import type { Offer } from "../../../search/searchTypes";
import { resolveInsurerLogo } from "../insurerLogos";
import { number } from "../offerPresentation";
import {
  MAX_COMPARISON_OFFERS,
  MIN_COMPARISON_OFFERS,
  canCompare,
} from "./comparisonSelection";

type Props = {
  /** Already ordered exactly as the user picked them. */
  selected: { offer: Offer; offerId: string }[];
  onRemove: (offerId: string) => void;
  onOpen: () => void;
  onCancel: () => void;
  /** The compare CTA, so the dialog can hand focus back to it on close. */
  openButtonRef?: React.RefObject<HTMLButtonElement | null>;
};

const MAX_CHIPS = MAX_COMPARISON_OFFERS;

/**
 * The compact comparison summary that sits in the offer-list toolbar while
 * comparison mode is active.
 *
 * It deliberately shows the picked insurers and the two rules that block the
 * CTA (too few, too many) instead of a full-width banner, so the result list
 * stays readable underneath.
 */
export function ComparisonSelectionBar({ selected, onRemove, onOpen, onCancel, openButtonRef }: Props) {
  const count = selected.length;
  const atMax = count >= MAX_COMPARISON_OFFERS;
  const ready = canCompare({ mode: true, offerIds: selected.map((item) => item.offerId), modalOpen: false });

  return (
    <div className="ir-compare-bar" role="region" aria-label="انتخاب پیشنهادها برای مقایسه">
      <div className="ir-compare-bar__chips">
        {selected.slice(0, MAX_CHIPS).map(({ offer, offerId }) => {
          const logo = resolveInsurerLogo(offer.insurer_name);
          return (
            <span className="ir-compare-chip" key={offerId}>
              <span className="ir-compare-chip__logo" aria-hidden="true">
                {logo ? <img src={logo} alt="" /> : <Scale />}
              </span>
              <span className="ir-compare-chip__name">{offer.insurer_name}</span>
              <button
                type="button"
                onClick={() => onRemove(offerId)}
                aria-label={`حذف ${offer.insurer_name} از مقایسه`}
              >
                <X aria-hidden="true" />
              </button>
            </span>
          );
        })}
      </div>

      <p className="ir-compare-bar__summary">
        <b>{number.format(count)} پیشنهاد برای مقایسه</b>
        {atMax && <span>حداکثر {number.format(MAX_COMPARISON_OFFERS)} پیشنهاد قابل مقایسه است.</span>}
        {!ready && !atMax && (
          <span>حداقل {number.format(MIN_COMPARISON_OFFERS)} پیشنهاد انتخاب کنید.</span>
        )}
      </p>

      <div className="ir-compare-bar__actions">
        <button type="button" className="ir-compare-cancel" onClick={onCancel}>
          لغو مقایسه
        </button>
        <button
          ref={openButtonRef}
          type="button"
          className="ir-compare-open"
          disabled={!ready}
          onClick={onOpen}
        >
          مقایسه ({number.format(count)})
        </button>
      </div>
    </div>
  );
}
