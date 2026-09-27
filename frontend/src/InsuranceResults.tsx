import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Banknote,
  ChevronDown,
  ChevronLeft,
  CircleDollarSign,
  CreditCard,
  Filter,
  Link2,
  ListFilter,
  Search,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Star,
  WalletCards,
} from "lucide-react";
import type { Offer, ProviderResult, SearchResult, Status } from "./searchTypes";
import { resolveInsurerLogo } from "./insurerLogos";
import { AIAnalysisPanel } from "./AIAnalysisPanel";
import { useQuoteAIAnalysis } from "./ai/useQuoteAIAnalysis";
import type { InsuranceKind } from "./ai/normalizeQuote";
import motorResult from "./assest/insurance/motor_result.png";
import azkiLogo from "./assest/insurance/azki.png";
import sabimLogo from "./assest/insurance/sabim.png";
import bimehBazarLogo from "./assest/insurance/bimehbazar.png";
import bimehLogo from "./assest/insurance/bimeh.com.png";
import "./insurance-results.css";

const number = new Intl.NumberFormat("fa-IR");
const providerMeta: Record<string, { name: string; logo: string }> = {
  azki: { name: "ازکی", logo: azkiLogo },
  sabim: { name: "سابیم", logo: sabimLogo },
  bimebazar: { name: "بیمه‌بازار", logo: bimehBazarLogo },
  bimeh: { name: "بیمه‌دات‌کام", logo: bimehLogo },
};
const providerOrder = ["azki", "sabim", "bimebazar", "bimeh"];
const statusText: Record<Status, string> = {
  ok: "پیشنهاد دریافت شد",
  empty: "پیشنهادی پیدا نشد",
  needs_input: "به اطلاعات بیشتری نیاز دارد",
  unmapped: "برای این وسیله در دسترس نیست",
  unavailable: "پاسخی دریافت نشد",
  invalid_response: "پاسخ قابل پردازش نیست",
  unsupported: "در حال حاضر فعال نیست",
};

type Props = { result: SearchResult; insuranceKind: InsuranceKind; inquiryId: string };

const productName = (kind: InsuranceKind | null) =>
  kind === "body_car" ? "بیمه بدنه" : kind === "third_motor" ? "بیمه شخص ثالث موتور" : "بیمه شخص ثالث";

function ProviderCard({ provider }: { provider?: ProviderResult }) {
  const key = provider?.provider ?? "";
  const meta = providerMeta[key];
  if (!meta) return null;
  return (
    <article className={`ir-provider-card ${provider?.status === "ok" ? "is-ok" : ""}`}>
      <span className="ir-provider-logo"><img src={meta.logo} alt="" /></span>
      <div>
        <strong>{meta.name}</strong>
        <span>{provider ? statusText[provider.status] : "وضعیت ثبت نشده"}</span>
        <small>{provider ? `${number.format(provider.offers.length)} پیشنهاد` : "—"}</small>
      </div>
    </article>
  );
}

function InsurerLogo({ offer }: { offer: Offer }) {
  const logo = resolveInsurerLogo(offer.insurer_name);
  return (
    <span className="ir-insurer-logo">
      {logo ? <img src={logo} alt={`نشان بیمه ${offer.insurer_name}`} /> : <ShieldCheck aria-label="نشان در دسترس نیست" />}
    </span>
  );
}

function OfferRow({ offer, index, selected, onSelect, kind }: { offer: Offer; index: number; selected: boolean; onSelect: () => void; kind: InsuranceKind | null }) {
  return (
    <article className={`ir-offer-row ${selected ? "is-selected" : ""}`} onClick={onSelect}>
      <span className="ir-rank">{number.format(index + 1)}</span>
      <div className="ir-insurer-cell">
        <InsurerLogo offer={offer} />
        <div>
          {selected && <span className="ir-selected-tag">پیشنهاد منتخب</span>}
          <strong>{offer.insurer_name}</strong>
          <small>{productName(kind)}</small>
        </div>
      </div>
      <div className="ir-price-cell">
        {offer.price_before_discount_toman ? <del>{number.format(offer.price_before_discount_toman)} تومان</del> : <span className="ir-price-spacer" />}
        <div><b>{number.format(offer.premium.amount_toman ?? 0)}</b><span>تومان</span></div>
        {offer.discount_amount_toman ? <small>{offer.discount_percent ? `${number.format(offer.discount_percent)}٪، ` : ""}{number.format(offer.discount_amount_toman)} تومان تخفیف</small> : null}
      </div>
      <div className="ir-payment-cell">
        <div className="ir-row-chips">
          {offer.has_installments && <span>خرید اقساطی</span>}
          {offer.installment_plans.length > 0 && <span>{number.format(offer.installment_plans.length)} برنامه پرداخت</span>}
        </div>
        <small>
          {providerMeta[offer.provider]?.name ?? offer.provider}
          {offer.duration_months ? ` · ${number.format(offer.duration_months)} ماه` : ""}
          {offer.financial_coverage_toman ? ` · ${number.format(offer.financial_coverage_toman)} تومان تعهد مالی` : ""}
        </small>
      </div>
      <button className="ir-open-offer" type="button" onClick={(event) => { event.stopPropagation(); onSelect(); }} aria-label={`نمایش جزئیات ${offer.insurer_name}`}><ChevronLeft /></button>
    </article>
  );
}

function DetailLine({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return <div className="ir-detail-line"><span className="ir-detail-icon">{icon}</span><span>{label}</span><b>{value}</b></div>;
}

function DetailAccordion({ icon, title, preview, children }: { icon: React.ReactNode; title: string; preview: string; children?: React.ReactNode }) {
  return (
    <details className="ir-accordion">
      <summary><span className="ir-detail-icon">{icon}</span><span><b>{title}</b><small>{preview}</small></span><ChevronDown /></summary>
      {children && <div className="ir-accordion-body">{children}</div>}
    </details>
  );
}

function InstallmentPlans({ plans }: { plans: Offer["installment_plans"] }) {
  if (!plans.length) return null;
  const displayDate = (value: string | null) => {
    if (!value) return "—";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("fa-IR");
  };
  return (
    <div className="ir-installment-plans">
      {plans.map((plan, planIndex) => (
        <section className="ir-installment-plan" key={`${plan.title}-${planIndex}`}>
          <header>
            <div><b>{plan.title || `برنامه اقساط ${number.format(planIndex + 1)}`}</b><small>{number.format(plan.installment_count)} قسط{plan.plan_type ? ` · ${plan.plan_type}` : ""}</small></div>
            {plan.is_credit != null && <span>{plan.is_credit ? "اعتباری" : "اقساطی"}</span>}
          </header>
          <div className="ir-plan-facts">
            {plan.down_payment_toman != null && <span><small>پیش‌پرداخت</small><b>{number.format(plan.down_payment_toman)} تومان</b></span>}
            {plan.total_payable_toman != null && <span><small>جمع پرداختی</small><b>{number.format(plan.total_payable_toman)} تومان</b></span>}
            {plan.operation_cost_toman != null && <span><small>هزینه عملیات</small><b>{number.format(plan.operation_cost_toman)} تومان</b></span>}
          </div>
          {plan.operation_cost_in_installments != null && <p className="ir-plan-note">هزینه عملیات {plan.operation_cost_in_installments ? "داخل اقساط محاسبه شده است." : "جداگانه دریافت می‌شود."}</p>}
          {plan.payments.length > 0 && (
            <div className="ir-payment-schedule">
              <div className="ir-payment-schedule-head"><span>پرداخت</span><span>سررسید</span><span>مبلغ</span></div>
              {plan.payments.map((payment) => (
                <div key={`${payment.sequence}-${payment.due_date}-${payment.amount_toman}`}>
                  <span>{payment.is_down_payment ? "پیش‌پرداخت" : `قسط ${number.format(payment.months_after_purchase ?? payment.sequence)}`}</span>
                  <span>{displayDate(payment.due_date)}</span>
                  <b>{number.format(payment.amount_toman)} تومان</b>
                </div>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function SelectedOfferPanel({ offer, kind }: { offer: Offer; kind: InsuranceKind | null }) {
  const metrics = offer.insurer_metrics;
  const metricPreview = [
    metrics?.satisfaction != null ? `رضایت ${number.format(metrics.satisfaction)}` : null,
    metrics?.financial_strength != null ? `توانگری ${number.format(metrics.financial_strength)}` : null,
    metrics?.mobile_compensation ? "خسارت سیار" : null,
  ].filter(Boolean).join(" · ") || "اطلاعات تکمیلی اعلام نشده";
  return (
    <aside className="ir-selected-panel">
      <div className="ir-selected-summary">
        <div className="ir-summary-top">
          <span className="ir-source-badge"><img src={providerMeta[offer.provider]?.logo} alt="" />{providerMeta[offer.provider]?.name ?? offer.provider}</span>
          <span className="ir-featured"><Star /> پیشنهاد منتخب</span>
        </div>
        <div className="ir-summary-identity"><InsurerLogo offer={offer} /><div><h3>{offer.insurer_name}</h3><p>{productName(kind)}</p></div></div>
        {offer.price_before_discount_toman ? <del>{number.format(offer.price_before_discount_toman)} تومان</del> : null}
        <div className="ir-summary-price"><span>حق بیمه</span><b>{number.format(offer.premium.amount_toman ?? 0)}</b><small>تومان</small></div>
        {offer.discount_amount_toman ? <div className="ir-summary-discount"><b>تخفیف</b><span>{number.format(offer.discount_amount_toman)} تومان</span></div> : null}
        <button className="ir-buy" type="button" disabled title="مسیر خرید در نسخه فعلی تعریف نشده است"><ShoppingCart />خرید این پیشنهاد</button>
        <button className="ir-compare" type="button" disabled title="در دست توسعه">＋ مقایسه با سایر پیشنهادها</button>
      </div>
      <h3 className="ir-details-title">جزئیات پیشنهاد</h3>
      <div className="ir-detail-table">
        <DetailLine icon={<Link2 />} label="منبع ارائه‌دهنده" value={providerMeta[offer.provider]?.name ?? offer.provider} />
        <DetailLine icon={<ShieldCheck />} label="مدت پوشش" value={offer.duration_months ? `${number.format(offer.duration_months)} ماه` : "—"} />
        <DetailLine icon={<CreditCard />} label="نوع پرداخت" value={offer.has_installments ? "خرید اقساطی" : offer.payment_methods[0] ?? "—"} />
        <DetailLine icon={<WalletCards />} label="برنامه پرداخت" value={offer.installment_plans.length ? `${number.format(offer.installment_plans.length)} برنامه` : "—"} />
      </div>
      <div className="ir-accordions">
        <DetailAccordion icon={<CreditCard />} title="روش‌های پرداخت" preview={offer.installment_plans.length ? `${number.format(offer.installment_plans.length)} برنامه اقساط · ${number.format(offer.installment_plans.reduce((sum, plan) => sum + plan.installment_count, 0))} قسط` : offer.payment_methods.join("، ") || (offer.has_installments ? "پرداخت اقساطی" : "—")}>
          {offer.payment_methods.length > 0 && <div className="ir-text-chips">{offer.payment_methods.map((item) => <span key={item}>{item}</span>)}</div>}
          <InstallmentPlans plans={offer.installment_plans} />
        </DetailAccordion>
        <DetailAccordion icon={<CircleDollarSign />} title="دیرکرد و جریمه" preview={offer.penalty?.description ?? (offer.penalty?.total_toman != null ? `${number.format(offer.penalty.total_toman)} تومان` : "—")} />
        <DetailAccordion icon={<Banknote />} title="اجزای قیمت" preview={offer.price_breakdown.length ? `${number.format(offer.price_breakdown.length)} مورد` : "—"}>
          {offer.price_breakdown.map((item) => <p key={item.label}><span>{item.label}</span><b>{number.format(item.amount_toman)} تومان</b></p>)}
        </DetailAccordion>
        <DetailAccordion icon={<BadgeCheck />} title="وضعیت شرکت بیمه" preview={metricPreview} />
        <DetailAccordion icon={<Sparkles />} title="مزایا و نشان‌ها" preview={[...new Set([...offer.badges, ...offer.benefits])].join(" · ") || "—"} />
      </div>
    </aside>
  );
}

export function InsuranceResults({ result, insuranceKind, inquiryId }: Props) {
  const { state: aiState, retry: retryAI } = useQuoteAIAnalysis(inquiryId, insuranceKind, result);
  const sourceOffers = useMemo(() => result.providers.flatMap((provider) => provider.offers), [result]);
  const cheapestOffer = useMemo(() => sourceOffers.reduce<Offer | null>((cheapest, offer) => {
    if (!cheapest) return offer;
    return (offer.premium.amount_toman ?? Infinity) < (cheapest.premium.amount_toman ?? Infinity) ? offer : cheapest;
  }, null), [sourceOffers]);
  const [selectedOffer, setSelectedOffer] = useState<Offer | null>(cheapestOffer);
  const [query, setQuery] = useState("");
  const [installmentsOnly, setInstallmentsOnly] = useState(false);
  const [discountOnly, setDiscountOnly] = useState(false);
  useEffect(() => setSelectedOffer(cheapestOffer), [cheapestOffer]);
  const offers = useMemo(() => sourceOffers
    .filter((offer) => offer.insurer_name.includes(query.trim()))
    .filter((offer) => !installmentsOnly || offer.has_installments === true)
    .filter((offer) => !discountOnly || !!offer.discount_amount_toman)
    .sort((a, b) => (a.premium.amount_toman ?? Infinity) - (b.premium.amount_toman ?? Infinity)), [sourceOffers, query, installmentsOnly, discountOnly]);
  const providersByName = new Map(result.providers.map((provider) => [provider.provider, provider]));
  return (
    <section className="insurance-results results" aria-live="polite">
      <header className="ir-header">
        <div><span>نتیجه استعلام</span><h2>پیشنهادها و وضعیت منابع</h2><p>دریافت: {new Date(result.fetched_at).toLocaleString("fa-IR")} · {number.format(sourceOffers.length)} پیشنهاد از {number.format(result.providers.length)} منبع</p></div>
        <img src={motorResult} alt="" />
      </header>
      <div className="ir-providers">{providerOrder.map((key) => <ProviderCard key={key} provider={providersByName.get(key)} />)}</div>
      <AIAnalysisPanel state={aiState} result={result} onRetry={retryAI} />
      <div className="ir-workspace">
        {selectedOffer ? <SelectedOfferPanel offer={selectedOffer} kind={insuranceKind} /> : <aside className="ir-selected-panel ir-empty">پیشنهادی برای نمایش جزئیات وجود ندارد.</aside>}
        <section className="ir-offers-panel">
          <div className="ir-toolbar-first">
            <label className="ir-search"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="جستجو در شرکت‌های بیمه..." /></label>
            <div className="ir-segments"><button className={installmentsOnly ? "active" : ""} onClick={() => setInstallmentsOnly(!installmentsOnly)}>اقساط</button><button className={!installmentsOnly ? "active" : ""} onClick={() => setInstallmentsOnly(false)}>ارزان‌ترین</button></div>
            <button className="ir-sort"><ListFilter />مرتب‌سازی: ارزان‌ترین</button>
            <label className="ir-ready" title="دادهٔ آماده‌بودن برای خرید در پاسخ فعلی وجود ندارد"><span>فقط آماده خرید</span><input type="checkbox" disabled /><i /></label>
            <button className="ir-filter" disabled title="در دست توسعه"><Filter />فیلترها</button>
          </div>
          <div className="ir-toolbar-second">
            <div><h3>{number.format(offers.length)} پیشنهاد</h3><p>با کلیک یا تپ روی هر پیشنهاد، جزئیات کامل در سمت چپ نمایش داده می‌شود.</p></div>
            <div className="ir-quick-filters"><button className={!discountOnly ? "active" : ""} onClick={() => setDiscountOnly(false)}>ارزان‌ترین</button><button className={discountOnly ? "active" : ""} onClick={() => setDiscountOnly(!discountOnly)}>تخفیف</button><button disabled title="در دست توسعه">شرکت‌های محبوب</button></div>
          </div>
          <div className="ir-offer-list">
            {offers.map((offer, index) => <OfferRow key={`${offer.provider}-${offer.insurer_name}-${index}`} offer={offer} index={index} kind={insuranceKind} selected={selectedOffer === offer} onSelect={() => setSelectedOffer(offer)} />)}
            {!offers.length && <p className="ir-no-results">هیچ پیشنهاد قابل‌نمایشی با این شرایط پیدا نشد.</p>}
          </div>
        </section>
      </div>
    </section>
  );
}
