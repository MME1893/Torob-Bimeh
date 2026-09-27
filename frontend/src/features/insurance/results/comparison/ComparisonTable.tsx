import type { ReactNode } from "react";
import {
  Building2,
  Calendar,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  Minus,
  Percent,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from "lucide-react";
import type { Offer } from "../../../search/searchTypes";
import type { InsuranceKind } from "../../../ai-analysis/lib/normalizeQuote";
import { number } from "../offerPresentation";
import { ComparisonOfferHeader } from "./ComparisonOfferHeader";
import {
  COMPARISON_ROWS,
  UNKNOWN,
  getBranchCount,
  getComparisonBenefits,
  getComparisonDiscount,
  getComparisonPrice,
  getCoverageDuration,
  getFinancialCoverage,
  getOnlineClaimsStatus,
  getPaymentLabel,
  getPaymentProgramLabel,
  type ComparisonRowKey,
} from "./comparisonUtils";

type Column = { offerId: string; offer: Offer };

type Props = {
  columns: Column[];
  bestOfferId: string | null;
  kind: InsuranceKind | null;
  onViewOffer: (offerId: string) => void;
};

const ROW_ICONS: Record<ComparisonRowKey, ReactNode> = {
  price: <CircleDollarSign aria-hidden="true" />,
  discount: <Percent aria-hidden="true" />,
  paymentType: <CreditCard aria-hidden="true" />,
  paymentProgram: <WalletCards aria-hidden="true" />,
  duration: <Calendar aria-hidden="true" />,
  financialCoverage: <ShieldCheck aria-hidden="true" />,
  onlineClaims: <CheckCircle2 aria-hidden="true" />,
  branches: <Building2 aria-hidden="true" />,
  benefits: <Sparkles aria-hidden="true" />,
};

/** `false` and `null` are different facts, so the row renders three distinct states. */
function OnlineClaimsCell({ offer }: { offer: Offer }) {
  const status = getOnlineClaimsStatus(offer);
  if (status === "yes") {
    return (
      <span className="irc-value irc-value--yes">
        <CheckCircle2 aria-hidden="true" />
        دارد
      </span>
    );
  }
  if (status === "no") {
    return (
      <span className="irc-value irc-value--no">
        <Minus aria-hidden="true" />
        ندارد
      </span>
    );
  }
  return <span className="irc-value irc-value--unknown">اطلاعات موجود نیست</span>;
}

function BenefitsCell({ offer }: { offer: Offer }) {
  const { shown, hidden } = getComparisonBenefits(offer);
  if (!shown.length) return <span className="irc-value irc-value--unknown">{UNKNOWN}</span>;
  return (
    <ul className="irc-benefits">
      {shown.map((benefit) => (
        <li key={benefit}>{benefit}</li>
      ))}
      {hidden > 0 && <li className="irc-benefits__more">+{number.format(hidden)} مورد</li>}
    </ul>
  );
}

function RowValue({ rowKey, offer }: { rowKey: ComparisonRowKey; offer: Offer }) {
  if (rowKey === "onlineClaims") return <OnlineClaimsCell offer={offer} />;
  if (rowKey === "benefits") return <BenefitsCell offer={offer} />;

  const text =
    rowKey === "price" ? getComparisonPrice(offer)
    : rowKey === "discount" ? getComparisonDiscount(offer)
    : rowKey === "paymentType" ? getPaymentLabel(offer)
    : rowKey === "paymentProgram" ? getPaymentProgramLabel(offer)
    : rowKey === "duration" ? getCoverageDuration(offer)
    : rowKey === "financialCoverage" ? getFinancialCoverage(offer)
    : getBranchCount(offer);

  const isPrice = rowKey === "price";
  const isUnknown = text === UNKNOWN;
  return (
    <span
      className={
        isPrice ? "irc-value irc-value--price"
        : isUnknown ? "irc-value irc-value--unknown"
        : rowKey === "discount" ? "irc-value irc-value--discount"
        : "irc-value"
      }
    >
      {text}
    </span>
  );
}

/**
 * The side-by-side comparison matrix.
 *
 * A real `<table>` with `scope`d headers, because the feature is fundamentally a
 * tabular comparison. In RTL the criteria column is the first cell in DOM order
 * and therefore renders on the far right. On narrow screens the wrapper scrolls
 * horizontally while the criteria column stays pinned, instead of shrinking the
 * text until it is unreadable.
 */
export function ComparisonTable({ columns, bestOfferId, kind, onViewOffer }: Props) {
  const bestIndex = bestOfferId ? columns.findIndex((column) => column.offerId === bestOfferId) : -1;
  const bestCell = (index: number) => (index === bestIndex ? " is-best" : "");

  return (
    <div className="irc-table-scroll" tabIndex={0} role="region" aria-label="جدول مقایسه پیشنهادها">
      <table className="irc-table">
        <thead>
          <tr>
            <th scope="col" className="irc-table__criteria-head">
              معیار
            </th>
            {columns.map((column, index) => (
              <th
                scope="col"
                key={column.offerId}
                className={`irc-table__offer-head${bestCell(index)}`}
              >
                <ComparisonOfferHeader
                  offer={column.offer}
                  kind={kind}
                  isBest={column.offerId === bestOfferId}
                  onViewOffer={() => onViewOffer(column.offerId)}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {COMPARISON_ROWS.map((row, rowIndex) => {
            const lastRow = rowIndex === COMPARISON_ROWS.length - 1;
            return (
              <tr key={row.key} className="irc-table__row">
                <th scope="row" className="irc-table__label">
                  <span className="irc-table__label-icon" aria-hidden="true">
                    {ROW_ICONS[row.key]}
                  </span>
                  {row.label}
                </th>
                {columns.map((column, index) => (
                  <td
                    key={column.offerId}
                    className={`irc-table__cell${bestCell(index)}${lastRow ? " irc-table__cell--last" : ""}`}
                  >
                    <RowValue rowKey={row.key} offer={column.offer} />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
