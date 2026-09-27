import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import type { Offer, ProviderResult, SearchResult, Status } from "../../search/searchTypes";
import { resolveInsurerLogo } from "./insurerLogos";
import { OfferFilterPanel } from "./OfferFilterPanel";
import { SortMenu } from "./SortMenu";
import {
  SORT_LABELS,
  activeFilterCount,
  buildOfferIndex,
  emptyFilters,
  hasAnyFilter,
  insurerOptions,
  priceBounds,
  selectOffers,
  type OfferFilters,
} from "./offerFilters";
import { number, productName, providerLabel, providerMeta, providerNames, providerOrder } from "./offerPresentation";
import { ComparisonModal } from "./comparison/ComparisonModal";
import { useComparisonAnalysis } from "./comparison/useComparisonAnalysis";
import { ComparisonSelectionBar } from "./comparison/ComparisonSelectionBar";
import { ComparisonSelector } from "./comparison/ComparisonSelector";
import {
  MAX_COMPARISON_OFFERS,
  closeComparisonModal,
  enterComparison,
  exitComparison,
  idleComparison,
  isComparisonDisabled,
  openComparisonModal,
  reconcileComparison,
  removeComparisonOffer,
  toggleComparisonOffer,
  type ComparisonState,
} from "./comparison/comparisonSelection";
import "./comparison/comparison.css";
import { AIAnalysisPanel } from "../../ai-analysis/AIAnalysisPanel";
import { useQuoteAIAnalysis } from "../../ai-analysis/lib/useQuoteAIAnalysis";
import { offerIdsByOffer, offersById, type InsuranceKind } from "../../ai-analysis/lib/normalizeQuote";
import { ANALYSIS_SECTION_TITLES, type AnalysisSectionKey } from "../../ai-analysis/lib/types";
import { useAIChat } from "../../ai-chat/hooks/useAIChat";
import { AIChatDrawer } from "../../ai-chat/components/AIChatDrawer";
import { AIChatLauncher } from "../../ai-chat/components/AIChatLauncher";
import "../../ai-chat/ai-chat.css";
import motorResult from "../../../assets/insurance/motor_result.png";
import "./insurance-results.css";
import "../../ai-analysis/ai-analysis.css";

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

type RowProps = {
  offer: Offer;
  index: number;
  selected: boolean;
  onSelect: () => void;
  kind: InsuranceKind | null;
  rowRef: (node: HTMLElement | null) => void;
  /** The offer row gains a comparison control only while comparison mode is on. */
  comparison: {
    active: boolean;
    checked: boolean;
    disabled: boolean;
    atMax: boolean;
  };
  onToggleComparison: () => void;
};

function OfferRow({ offer, index, selected, onSelect, kind, rowRef, comparison, onToggleComparison }: RowProps) {
  return (
    <article
      ref={rowRef}
      className={`ir-offer-row ${selected ? "is-selected" : ""}${comparison.checked ? " is-comparing" : ""}`}
      onClick={onSelect}
      tabIndex={-1}
    >
      <span className="ir-rank">{number.format(index + 1)}</span>
      <div className="ir-insurer-cell">
        <InsurerLogo offer={offer} />
        <div>
          {selected && <span className="ir-selected-tag">پیشنهاد منتخب</span>}
          <strong>{offer.insurer_name}</strong>
          <small>{productName(kind)}</small>
          {comparison.active && (
            <ComparisonSelector
              selected={comparison.checked}
              disabled={comparison.disabled}
              atMax={comparison.atMax}
              insurerName={offer.insurer_name}
              onToggle={onToggleComparison}
            />
          )}
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
          {providerLabel(offer.provider)}
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

type SelectedPanelProps = {
  offer: Offer;
  kind: InsuranceKind | null;
  comparisonMode: boolean;
  onStartComparison: () => void;
};

function SelectedOfferPanel({ offer, kind, comparisonMode, onStartComparison }: SelectedPanelProps) {
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
          <span className="ir-source-badge"><img src={providerMeta[offer.provider]?.logo} alt="" />{providerLabel(offer.provider)}</span>
          <span className="ir-featured"><Star /> پیشنهاد منتخب</span>
        </div>
        <div className="ir-summary-identity"><InsurerLogo offer={offer} /><div><h3>{offer.insurer_name}</h3><p>{productName(kind)}</p></div></div>
        {offer.price_before_discount_toman ? <del>{number.format(offer.price_before_discount_toman)} تومان</del> : null}
        <div className="ir-summary-price"><span>حق بیمه</span><b>{number.format(offer.premium.amount_toman ?? 0)}</b><small>تومان</small></div>
        {offer.discount_amount_toman ? <div className="ir-summary-discount"><b>تخفیف</b><span>{number.format(offer.discount_amount_toman)} تومان</span></div> : null}
        <button className="ir-buy" type="button" disabled title="مسیر خرید در نسخه فعلی تعریف نشده است"><ShoppingCart />خرید این پیشنهاد</button>
        <button
          className={`ir-compare${comparisonMode ? " is-active" : ""}`}
          type="button"
          aria-pressed={comparisonMode}
          disabled={comparisonMode}
          onClick={onStartComparison}
        >
          {comparisonMode ? "＋ حالت مقایسه فعال است" : "＋ مقایسه با سایر پیشنهادها"}
        </button>
      </div>
      <h3 className="ir-details-title">جزئیات پیشنهاد</h3>
      <div className="ir-detail-table">
        <DetailLine icon={<Link2 />} label="منبع ارائه‌دهنده" value={providerLabel(offer.provider)} />
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
  // One filter object backs the search box, the quick chips, the segments, the
  // sort control and the filter panel, so no control can overwrite another.
  const [filters, setFilters] = useState<OfferFilters>(() => emptyFilters());
  const [panelOpen, setPanelOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const sortButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => setSelectedOffer(cheapestOffer), [cheapestOffer]);
  // Comparison is a temporary mode over the current result. It is intentionally
  // not persisted and never touches `selectedOffer`.
  const [comparison, setComparison] = useState<ComparisonState>(idleComparison);
  // Provider labels and popularity scores are derived once per result, so the
  // filter and sort pass only walks the offers.
  const offerIndex = useMemo(() => buildOfferIndex(result.providers, providerNames), [result.providers]);
  const offers = useMemo(() => selectOffers(sourceOffers, filters, offerIndex), [sourceOffers, filters, offerIndex]);
  // The panel may only offer insurers and a price range that exist in this result.
  const insurerChoices = useMemo(() => insurerOptions(sourceOffers), [sourceOffers]);
  const bounds = useMemo(() => priceBounds(sourceOffers), [sourceOffers]);
  const filterCount = activeFilterCount(filters);
  const patchFilters = useCallback((patch: Partial<OfferFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
  }, []);
  const resetFilters = useCallback(() => setFilters(emptyFilters()), []);
  const providersByName = new Map(result.providers.map((provider) => [provider.provider, provider]));

  // Canonical ids always come from the original unfiltered provider order, so
  // filtering and sorting can never change which offer an AI id resolves to.
  const lookup = useMemo(() => offersById(result), [result]);
  const idByOffer = useMemo(() => offerIdsByOffer(result), [result]);
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const rememberRow = useCallback((id: string, node: HTMLElement | null) => {
    if (node) rowRefs.current.set(id, node);
    else rowRefs.current.delete(id);
  }, []);

  // An offer can leave the result set when a new inquiry loads; drop those ids
  // instead of keeping a selection the list can no longer show.
  useEffect(() => {
    setComparison((current) => reconcileComparison(current, idByOffer.values()));
  }, [idByOffer]);

  const compareButtonRef = useRef<HTMLButtonElement>(null);

  const comparedColumns = useMemo(
    () => comparison.offerIds.flatMap((offerId) => {
      const offer = lookup.get(offerId);
      return offer ? [{ offerId, offer }] : [];
    }),
    [comparison.offerIds, lookup],
  );

  // The AI layer only runs while the dialog is open, and never blocks the table.
  const comparisonAnalysis = useComparisonAnalysis({
    inquiryId,
    insuranceKind,
    result,
    offerIds: comparison.offerIds,
    enabled: comparison.modalOpen,
  });

  const insurerNameById = useCallback(
    (offerId: string) => lookup.get(offerId)?.insurer_name,
    [lookup],
  );

  const startComparison = useCallback(() => {
    const currentId = selectedOffer ? idByOffer.get(selectedOffer) ?? null : null;
    setComparison((current) => (current.mode ? current : enterComparison(currentId)));
  }, [idByOffer, selectedOffer]);

  const cancelComparison = useCallback(() => setComparison(exitComparison()), []);
  const removeCompared = useCallback(
    (offerId: string) => setComparison((current) => removeComparisonOffer(current, offerId)),
    [],
  );
  const toggleCompared = useCallback(
    (offerId: string) => setComparison((current) => toggleComparisonOffer(current, offerId)),
    [],
  );
  const openComparison = useCallback(
    () => setComparison((current) => openComparisonModal(current)),
    [],
  );
  const closeComparison = useCallback(
    () => setComparison((current) => closeComparisonModal(current)),
    [],
  );

  const chat = useAIChat({
    inquiryId,
    insuranceKind,
    result,
    analysis: aiState.status === "ready" ? aiState.analysis : null,
  });
  const [historyOpen, setHistoryOpen] = useState(false);

  const selectReferencedOffer = useCallback((offerId: string) => {
    const offer = lookup.get(offerId);
    if (!offer) return;
    setSelectedOffer(offer);
    const row = rowRefs.current.get(offerId);
    row?.scrollIntoView({ block: "center" });
    row?.focus({ preventScroll: true });
  }, [lookup]);

  /**
   * Hands the comparison over to the existing chat as a brand-new thread.
   *
   * The thread stores only the compared offer ids; the modal closes and the
   * existing drawer opens. No AI request happens here.
   */
  const askAboutComparison = useCallback(async () => {
    const offerIds = comparison.offerIds;
    if (!offerIds.length) return;
    setComparison((current) => closeComparisonModal(current));
    await chat.openComparisonThread(
      offerIds,
      comparisonAnalysis.state.status === "ready" ? comparisonAnalysis.state.analysis : undefined,
    );
  }, [chat, comparison.offerIds, comparisonAnalysis.state]);

  /** Closes the dialog, keeps the selection, and focuses the compared offer. */
  const viewComparedOffer = useCallback((offerId: string) => {
    setComparison((current) => closeComparisonModal(current));
    selectReferencedOffer(offerId);
  }, [selectReferencedOffer]);

  const askAboutSection = useCallback((sectionKey: AnalysisSectionKey) => {
    if (aiState.status !== "ready") return;
    void chat.openSectionThread(sectionKey, aiState.analysis.sections[sectionKey]);
  }, [aiState, chat]);

  const chatTitle = chat.sectionKey
    ? `گفتگو درباره ${ANALYSIS_SECTION_TITLES[chat.sectionKey]}`
    : chat.contextType === "comparison"
      ? "گفتگو درباره مقایسه پیشنهادها"
      : "گفتگو با هوش مصنوعی";

  return (
    <section className="insurance-results results" aria-live="polite">
      <header className="ir-header">
        <div><span>نتیجه استعلام</span><h2>پیشنهادها و وضعیت منابع</h2><p>دریافت: {new Date(result.fetched_at).toLocaleString("fa-IR")} · {number.format(sourceOffers.length)} پیشنهاد از {number.format(result.providers.length)} منبع</p></div>
        <img src={motorResult} alt="" />
      </header>
      <div className="ir-providers">{providerOrder.map((key) => <ProviderCard key={key} provider={providersByName.get(key)} />)}</div>
      <AIAnalysisPanel
        state={aiState}
        result={result}
        onRetry={retryAI}
        onAskAboutSection={askAboutSection}
        onSelectReferencedOffer={selectReferencedOffer}
      />
      <div className="ir-workspace">
        {selectedOffer ? (
          <SelectedOfferPanel
            offer={selectedOffer}
            kind={insuranceKind}
            comparisonMode={comparison.mode}
            onStartComparison={startComparison}
          />
        ) : <aside className="ir-selected-panel ir-empty">پیشنهادی برای نمایش جزئیات وجود ندارد.</aside>}
        <section className="ir-offers-panel">
          <div className="ir-toolbar-first">
            <label className="ir-search"><Search /><input value={filters.query} onChange={(e) => patchFilters({ query: e.target.value })} placeholder="جستجو در شرکت‌های بیمه..." /></label>
            <div className="ir-segments"><button className={filters.payment === "installments" ? "active" : ""} onClick={() => patchFilters({ payment: filters.payment === "installments" ? null : "installments" })}>اقساط</button><button className={filters.sort === "cheapest" ? "active" : ""} onClick={() => patchFilters({ sort: "cheapest" })}>ارزان‌ترین</button></div>
            <button ref={sortButtonRef} className="ir-sort" type="button" aria-haspopup="listbox" aria-expanded={sortOpen} onClick={() => setSortOpen((value) => !value)}><ListFilter />مرتب‌سازی: {SORT_LABELS[filters.sort]}</button>
            <SortMenu value={filters.sort} open={sortOpen} anchorRef={sortButtonRef} onChange={(sort) => patchFilters({ sort })} onClose={() => setSortOpen(false)} />
            <label className="ir-ready" title="دادهٔ آماده‌بودن برای خرید در پاسخ فعلی وجود ندارد"><span>فقط آماده خرید</span><input type="checkbox" disabled /><i /></label>
            <button className="ir-filter" type="button" onClick={() => setPanelOpen(true)}><Filter />فیلترها{filterCount > 0 && <span className="ir-filter-count">{number.format(filterCount)}</span>}</button>
          </div>
          <div className="ir-toolbar-second">
            <div><h3>{number.format(offers.length)} پیشنهاد</h3><p>با کلیک یا تپ روی هر پیشنهاد، جزئیات کامل در سمت چپ نمایش داده می‌شود.</p></div>
            <div className="ir-quick-filters"><button className={filters.sort === "cheapest" ? "active" : ""} onClick={() => patchFilters({ sort: "cheapest" })}>ارزان‌ترین</button><button className={filters.discountOnly ? "active" : ""} onClick={() => patchFilters({ discountOnly: !filters.discountOnly })}>تخفیف</button><button className={filters.popularOnly ? "active" : ""} onClick={() => patchFilters({ popularOnly: !filters.popularOnly })}>شرکت‌های محبوب</button></div>
          </div>
          {comparison.mode && (
            <ComparisonSelectionBar
              selected={comparedColumns}
              onRemove={removeCompared}
              onOpen={openComparison}
              onCancel={cancelComparison}
              openButtonRef={compareButtonRef}
            />
          )}
          <div className="ir-offer-list">
            {offers.map((offer, index) => {
              const id = idByOffer.get(offer) ?? "";
              return (
                <OfferRow
                  key={id || `${offer.provider}-${offer.insurer_name}-${index}`}
                  offer={offer}
                  index={index}
                  kind={insuranceKind}
                  selected={selectedOffer === offer}
                  onSelect={() => setSelectedOffer(offer)}
                  rowRef={(node) => rememberRow(id, node)}
                  comparison={{
                    active: comparison.mode && !!id,
                    checked: comparison.offerIds.includes(id),
                    disabled: isComparisonDisabled(comparison, id),
                    atMax: comparison.offerIds.length >= MAX_COMPARISON_OFFERS,
                  }}
                  onToggleComparison={() => toggleCompared(id)}
                />
              );
            })}
            {!offers.length && (
              <p className="ir-no-results">
                <b>پیشنهادی با این فیلترها پیدا نشد</b>
                {hasAnyFilter(filters) && <button type="button" onClick={resetFilters}>حذف فیلترها</button>}
              </p>
            )}
          </div>
        </section>
      </div>

      {comparison.modalOpen && (
        <ComparisonModal
          columns={comparedColumns}
          kind={insuranceKind}
          insurerName={insurerNameById}
          comparisonAnalysis={comparisonAnalysis.state}
          onClose={closeComparison}
          onAskAI={() => void askAboutComparison()}
          onViewOffer={viewComparedOffer}
          openerRef={compareButtonRef}
        />
      )}

      {panelOpen && (
        <OfferFilterPanel
          filters={filters}
          insurers={insurerChoices}
          bounds={bounds}
          onApply={(next) => { setFilters(next); setPanelOpen(false); }}
          onClose={() => setPanelOpen(false)}
        />
      )}

      {!chat.open && <AIChatLauncher onClick={(trigger) => void chat.openChat(trigger)} />}
      <AIChatDrawer
        open={chat.open}
        title={chatTitle}
        contextType={chat.contextType}
        sectionKey={chat.sectionKey}
        contextOfferCount={chat.contextOfferCount}
        contextOfferNames={chat.contextOfferNames}
        contextMissingOfferIds={chat.contextMissingOfferIds}
        isHistorical={chat.isHistorical}
        fetchedAt={chat.savedFetchedAt}
        messages={chat.messages}
        threads={chat.threads}
        activeThreadId={chat.activeThread?.id ?? null}
        offersById={lookup}
        busy={chat.busy}
        error={chat.error}
        historyOpen={historyOpen}
        openerRef={chat.openerRef}
        suggestions={chat.suggestions}
        onClose={chat.closeChat}
        onNewChat={() => {
          chat.startNewThread();
          setHistoryOpen(false);
        }}
        onOpenThread={(id) => {
          void chat.openThread(id);
          setHistoryOpen(false);
        }}
        onToggleHistory={() => setHistoryOpen((value) => !value)}
        onShowMessages={() => setHistoryOpen(false)}
        onSend={(text, attachments) => void chat.sendMessage(text, attachments)}
        onRetry={(id) => void chat.retryMessage(id)}
        onViewOffer={selectReferencedOffer}
      />
    </section>
  );
}
