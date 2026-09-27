import type { Offer, SearchResult } from "../../search/searchTypes";

export type InsuranceKind = "third_car" | "body_car" | "third_motor";

export const offerId = (offer: Offer, index: number) =>
  `${offer.provider}:${encodeURIComponent(offer.insurer_name)}:${index}`;

export function normalizeQuoteForAI(inquiryId: string, insuranceKind: InsuranceKind, result: SearchResult) {
  let index = 0;
  return {
    inquiry_id: inquiryId,
    insurance_type: insuranceKind,
    offers: result.providers.flatMap((provider) => provider.offers.map((offer) => {
      const id = offerId(offer, index++);
      const metrics = offer.insurer_metrics;
      return {
        offer_id: id,
        insurer_name: offer.insurer_name,
        source_name: offer.provider,
        old_price: offer.price_before_discount_toman,
        final_price: offer.premium.amount_toman,
        discount_amount: offer.discount_amount_toman,
        discount_percent: offer.discount_percent,
        installment_available: offer.has_installments,
        payment_program_count: offer.installment_plans.length,
        payment_terms: offer.installment_plans.map((plan) => ({
          title: plan.title,
          plan_type: plan.plan_type,
          is_credit: plan.is_credit,
          installment_count: plan.installment_count,
          down_payment_toman: plan.down_payment_toman,
          total_payable_toman: plan.total_payable_toman,
          operation_cost_toman: plan.operation_cost_toman,
          payments: plan.payments,
        })),
        coverage: {
          financial_coverage_toman: offer.financial_coverage_toman,
          duration_months: offer.duration_months,
        },
        services: metrics ? {
          branches_count: metrics.branches_count,
          claim_centers_count: metrics.claim_centers_count,
          mobile_compensation: metrics.mobile_compensation,
          online_claims: metrics.online_claims,
          online_issue: metrics.online_issue,
        } : {},
        benefits: offer.benefits,
        badges: offer.badges,
        financial_strength: metrics?.financial_strength ?? null,
        customer_satisfaction: metrics?.satisfaction ?? null,
      };
    })),
  };
}

export function offersById(result: SearchResult) {
  let index = 0;
  const entries = result.providers.flatMap((provider) => provider.offers.map((offer) => [offerId(offer, index++), offer] as const));
  return new Map(entries);
}

