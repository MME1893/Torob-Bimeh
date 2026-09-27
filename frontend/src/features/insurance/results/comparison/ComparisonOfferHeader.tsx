import { ShieldCheck, Star } from "lucide-react";
import type { Offer } from "../../../search/searchTypes";
import type { InsuranceKind } from "../../../ai-analysis/lib/normalizeQuote";
import { resolveInsurerLogo } from "../insurerLogos";
import { productName, providerLabel } from "../offerPresentation";

type Props = {
  offer: Offer;
  kind: InsuranceKind | null;
  isBest: boolean;
  onViewOffer: () => void;
};

/**
 * One compared offer's column header.
 *
 * Purely presentational: it prints the insurer identity, the product and the
 * source straight from the offer, and never re-orders or re-ranks the columns.
 */
export function ComparisonOfferHeader({ offer, kind, isBest, onViewOffer }: Props) {
  const logo = resolveInsurerLogo(offer.insurer_name);
  return (
    <div className="irc-offer-head">
      {isBest && (
        <span className="irc-offer-head__best">
          <Star aria-hidden="true" />
          پیشنهاد برتر
        </span>
      )}
      <span className="irc-offer-head__logo" aria-hidden="true">
        {logo ? <img src={logo} alt="" /> : <ShieldCheck />}
      </span>
      <b className="irc-offer-head__name">{offer.insurer_name}</b>
      <small className="irc-offer-head__product">{productName(kind)}</small>
      <small className="irc-offer-head__source">منبع: {providerLabel(offer.provider)}</small>
      <button type="button" className="irc-offer-head__view" onClick={onViewOffer}>
        مشاهده پیشنهاد
      </button>
    </div>
  );
}
