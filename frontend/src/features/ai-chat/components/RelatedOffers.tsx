import { useState } from "react";
import { ChevronDown, ChevronLeft, ShieldCheck } from "lucide-react";
import { resolveInsurerLogo } from "../../insurance/results/insurerLogos";
import type { Offer } from "../../search/searchTypes";

const number = new Intl.NumberFormat("fa-IR");

export type RelatedOfferItem = { id: string; offer: Offer };

type Props = {
  items: RelatedOfferItem[];
  onViewOffer?: (offerId: string) => void;
};

/**
 * Independent "Related Offers" section rendered BELOW the assistant bubble,
 * never inside it. Collapsible, with an explicit physical grid:
 * chevron (right) / price (center) / provider logo (left).
 */
export function RelatedOffers({ items, onViewOffer }: Props) {
  const [open, setOpen] = useState(true);
  if (!items.length) return null;
  const interactive = typeof onViewOffer === "function";

  return (
    <section className="aic-offers" aria-label="پیشنهادهای مرتبط">
      <button
        className="aic-offers__head"
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <ChevronDown className={open ? "" : "is-collapsed"} aria-hidden="true" />
        <span>پیشنهادهای مرتبط</span>
      </button>
      {open && (
        <div className="aic-offers__box">
          {items.map(({ id, offer }) => {
            const logo = resolveInsurerLogo(offer.insurer_name);
            const price =
              offer.premium.amount_toman == null
                ? "—"
                : `${number.format(offer.premium.amount_toman)} تومان`;
            const row = (
              <>
                <ChevronLeft className="aic-offers__chevron" aria-hidden="true" />
                <span className="aic-offers__price">{price}</span>
                <span className="aic-offers__logo">
                  {logo ? <img src={logo} alt="" onError={(event) => { event.currentTarget.hidden = true; }} /> : <ShieldCheck aria-hidden="true" />}
                </span>
              </>
            );
            return interactive ? (
              <button
                key={id}
                className="aic-offers__row"
                type="button"
                onClick={() => onViewOffer(id)}
                aria-label={`مشاهده پیشنهاد ${offer.insurer_name}`}
              >
                {row}
              </button>
            ) : (
              <div key={id} className="aic-offers__row aic-offers__row--static">
                {row}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
