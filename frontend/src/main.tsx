import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { motion, useReducedMotion } from "framer-motion";
import "./style.css";
import "./search.css";
import { ThirdPartyInsuranceFlow } from "./ThirdPartyInsuranceFlow";
import { ThirdMotorWizard } from "./ThirdMotorWizard";
import { BodyCarWizard } from "./BodyCarWizard";
import { InsuranceSelection } from "./InsuranceSelection";
import { InsuranceResults } from "./InsuranceResults";
import { RecentInquiries } from "./RecentInquiries";
import { getInquiry, markInquiryOpened, stableInquiryId } from "./storage/inquiryHistory";
import type { InsuranceKind } from "./ai/normalizeQuote";
import type {
  InstallmentPlan,
  Metrics,
  MoneyDetail,
  Offer,
  SearchResult,
  Status,
} from "./searchTypes";

const names: Record<string, string> = {
  azki: "ازکی",
  sabim: "سابیم",
  bimebazar: "بیمه‌بازار",
  bimeh: "بیمه‌دات‌کام",
};
const statusNames: Record<Status, string> = {
  ok: "پیشنهاد دریافت شد",
  empty: "پیشنهادی پیدا نشد",
  needs_input: "به اطلاعات بیشتری نیاز دارد",
  unmapped: "برای این خودرو در دسترس نیست",
  unavailable: "در دسترس نیست",
  invalid_response: "پاسخ قابل پردازش نیست",
  unsupported: "در حال حاضر فعال نیست",
};
const formatter = new Intl.NumberFormat("fa-IR");
const formatDate = (value: string | null) => {
  if (!value) return "بدون تاریخ";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("fa-IR");
};

function MoneyRows({ items }: { items: MoneyDetail[] }) {
  return (
    <div className="detail-list">
      {items.map((item) => (
        <span key={item.label}>
          <b>{item.label}</b>
          <em>{formatter.format(item.amount_toman)} تومان</em>
        </span>
      ))}
    </div>
  );
}

function InstallmentDetails({ plans }: { plans: InstallmentPlan[] }) {
  if (!plans.length) return null;
  return (
    <section className="installment-section">
      <h5>برنامه‌های اقساط</h5>
      {plans.map((plan, index) => (
        <div className="installment-plan" key={`${plan.title}-${index}`}>
          <div className="plan-head">
            <b>{plan.title}</b>
            {plan.is_credit !== null && (
              <span>{plan.is_credit ? "اعتباری" : "غیراعتباری"}</span>
            )}
          </div>
          <div className="plan-facts">
            <span>
              تعداد اقساط<b>{formatter.format(plan.installment_count)}</b>
            </span>
            {plan.down_payment_toman !== null && (
              <span>
                پیش‌پرداخت
                <b>{formatter.format(plan.down_payment_toman)} تومان</b>
              </span>
            )}
            {plan.total_payable_toman !== null && (
              <span>
                جمع پرداختی
                <b>{formatter.format(plan.total_payable_toman)} تومان</b>
              </span>
            )}
            {plan.operation_cost_toman !== null && (
              <span>
                هزینهٔ عملیات
                <b>{formatter.format(plan.operation_cost_toman)} تومان</b>
              </span>
            )}
          </div>
          {plan.operation_cost_in_installments !== null && (
            <small className="plan-note">
              هزینهٔ عملیات{" "}
              {plan.operation_cost_in_installments
                ? "داخل اقساط تقسیم شده است."
                : "جداگانه دریافت می‌شود."}
            </small>
          )}
          <div className="payments">
            <div className="payment-row payment-head">
              <span>پرداخت</span>
              <span>سررسید</span>
              <span>مبلغ</span>
            </div>
            {plan.payments.map((payment) => (
              <div
                className="payment-row"
                key={`${payment.sequence}-${payment.due_date}`}
              >
                <span>
                  {payment.is_down_payment
                    ? "پیش‌پرداخت"
                    : `قسط ${formatter.format(payment.months_after_purchase ?? payment.sequence)}`}
                </span>
                <span>{formatDate(payment.due_date)}</span>
                <b>{formatter.format(payment.amount_toman)} تومان</b>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function OfferDetails({ offer }: { offer: Offer }) {
  const metrics = offer.insurer_metrics;
  const metricItems: [string, number | string][] = [];
  if (metrics?.satisfaction !== null && metrics?.satisfaction !== undefined)
    metricItems.push(["رضایت مشتریان", formatter.format(metrics.satisfaction)]);
  if (
    metrics?.financial_strength !== null &&
    metrics?.financial_strength !== undefined
  )
    metricItems.push([
      "توانگری مالی",
      formatter.format(metrics.financial_strength),
    ]);
  if (metrics?.solvency_level !== null && metrics?.solvency_level !== undefined)
    metricItems.push(["سطح توانگری", formatter.format(metrics.solvency_level)]);
  if (
    metrics?.market_share_percent !== null &&
    metrics?.market_share_percent !== undefined
  )
    metricItems.push([
      "سهم بازار",
      `${formatter.format(metrics.market_share_percent)}٪`,
    ]);
  if (metrics?.branches_count !== null && metrics?.branches_count !== undefined)
    metricItems.push(["تعداد شعب", formatter.format(metrics.branches_count)]);
  if (
    metrics?.claim_centers_count !== null &&
    metrics?.claim_centers_count !== undefined
  )
    metricItems.push([
      "مراکز خسارت",
      formatter.format(metrics.claim_centers_count),
    ]);
  if (
    metrics?.complaint_response_time !== null &&
    metrics?.complaint_response_time !== undefined
  )
    metricItems.push([
      "شاخص زمان پاسخ",
      formatter.format(metrics.complaint_response_time),
    ]);
  if (
    metrics?.mobile_compensation !== null &&
    metrics?.mobile_compensation !== undefined
  )
    metricItems.push([
      "خسارت سیار",
      metrics.mobile_compensation ? "دارد" : "ندارد",
    ]);
  if (metrics?.online_claims !== null && metrics?.online_claims !== undefined)
    metricItems.push([
      "خسارت آنلاین",
      metrics.online_claims ? "دارد" : "ندارد",
    ]);
  if (metrics?.online_issue !== null && metrics?.online_issue !== undefined)
    metricItems.push(["صدور آنلاین", metrics.online_issue ? "دارد" : "ندارد"]);
  const hasDetails =
    offer.installment_plans.length > 0 ||
    offer.payment_methods.length > 0 ||
    !!offer.penalty ||
    offer.price_breakdown.length > 0 ||
    offer.discount_breakdown.length > 0 ||
    metricItems.length > 0 ||
    offer.benefits.length > 0 ||
    offer.badges.length > 0 ||
    offer.is_recommended === true ||
    offer.sale_rank !== null;
  if (!hasDetails) return null;
  return (
    <details className="offer-details">
      <summary>جزئیات پیشنهاد و پرداخت</summary>
      <div className="details-body">
        {offer.payment_methods.length > 0 && (
          <section>
            <h5>روش‌های پرداخت</h5>
            <div className="text-chips">
              {offer.payment_methods.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </section>
        )}
        <InstallmentDetails plans={offer.installment_plans} />
        {offer.penalty && (
          <section>
            <h5>دیرکرد و جریمه</h5>
            <div className="detail-list">
              {offer.penalty.days !== null && (
                <span>
                  <b>روزهای دیرکرد</b>
                  <em>{formatter.format(offer.penalty.days)}</em>
                </span>
              )}
              {offer.penalty.daily_toman !== null && (
                <span>
                  <b>جریمهٔ روزانه</b>
                  <em>{formatter.format(offer.penalty.daily_toman)} تومان</em>
                </span>
              )}
              {offer.penalty.total_toman !== null && (
                <span>
                  <b>مجموع جریمه</b>
                  <em>{formatter.format(offer.penalty.total_toman)} تومان</em>
                </span>
              )}
              {offer.penalty.forgiven === true && (
                <span>
                  <b>بخشودگی</b>
                  <em>فعال</em>
                </span>
              )}
            </div>
            {offer.penalty.description && (
              <p className="detail-note">{offer.penalty.description}</p>
            )}
          </section>
        )}
        {offer.price_breakdown.length > 0 && (
          <section>
            <h5>اجزای قیمت</h5>
            <MoneyRows items={offer.price_breakdown} />
          </section>
        )}
        {offer.discount_breakdown.length > 0 && (
          <section>
            <h5>جزئیات تخفیف</h5>
            <MoneyRows items={offer.discount_breakdown} />
          </section>
        )}
        {metricItems.length > 0 && (
          <section>
            <h5>وضعیت شرکت بیمه</h5>
            <div className="detail-list">
              {metricItems.map(([label, value]) => (
                <span key={label}>
                  <b>{label}</b>
                  <em>{value}</em>
                </span>
              ))}
            </div>
          </section>
        )}
        {(offer.badges.length > 0 ||
          offer.benefits.length > 0 ||
          offer.is_recommended === true ||
          offer.sale_rank !== null) && (
          <section>
            <h5>مزایا و نشان‌ها</h5>
            <div className="text-chips">
              {offer.is_recommended === true && <span>پیشنهاد منتخب</span>}
              {offer.sale_rank !== null && (
                <span>رتبهٔ فروش {formatter.format(offer.sale_rank)}</span>
              )}
              {[...new Set([...offer.badges, ...offer.benefits])].map(
                (item) => (
                  <span key={item}>{item}</span>
                ),
              )}
            </div>
          </section>
        )}
      </div>
    </details>
  );
}

function OfferCard({ offer, index }: { offer: Offer; index: number }) {
  return (
    <article className="offer" key={`${offer.provider}-${index}`}>
      <span className="source">{names[offer.provider]}</span>
      <h4>{offer.insurer_name}</h4>
      {offer.price_before_discount_toman && (
        <del className="old-price">
          {formatter.format(offer.price_before_discount_toman)} تومان
        </del>
      )}
      <div className="price">
        {formatter.format(offer.premium.amount_toman ?? 0)} <small>تومان</small>
      </div>
      <div className="offer-badges">
        {offer.discount_amount_toman && (
          <span>
            تخفیف {formatter.format(offer.discount_amount_toman)} تومان
            {offer.discount_percent
              ? ` (${formatter.format(offer.discount_percent)}٪)`
              : ""}
          </span>
        )}
        {offer.has_installments && <span>خرید اقساطی</span>}
        {offer.installment_plans.length > 0 && (
          <span>
            {formatter.format(offer.installment_plans.length)} برنامهٔ پرداخت
          </span>
        )}
      </div>
      <p>
        {offer.duration_months
          ? `${formatter.format(offer.duration_months)} ماه`
          : "مدت اعلام نشده"}{" "}
        ·{" "}
        {offer.financial_coverage_toman
          ? `${formatter.format(offer.financial_coverage_toman)} تومان تعهد مالی`
          : "تعهد اعلام نشده"}
      </p>
      <OfferDetails offer={offer} />
    </article>
  );
}

type TrustIconKind = "compare" | "approve" | "verify" | "reminder";

function TrustIcon({ kind }: { kind: TrustIconKind }) {
  if (kind === "compare")
    return (
      <svg viewBox="0 0 180 150" aria-hidden="true">
        <rect
          className="icon-paper"
          x="47"
          y="10"
          width="86"
          height="130"
          rx="20"
        />
        <path className="icon-line" d="M73 28h34M64 48h52" />
        <rect
          className="icon-soft"
          x="62"
          y="63"
          width="56"
          height="20"
          rx="8"
        />
        <path className="icon-check" d="m72 73 6 6 12-13" />
        <rect
          className="icon-red"
          x="62"
          y="93"
          width="56"
          height="20"
          rx="8"
        />
        <path className="icon-white" d="M73 103h24" />
      </svg>
    );
  if (kind === "approve")
    return (
      <svg viewBox="0 0 180 150" aria-hidden="true">
        <path className="icon-paper" d="M47 14h67l23 23v99H47Z" />
        <path className="icon-soft" d="M114 14v24h23" />
        <path className="icon-line" d="M67 57h50M67 76h50M67 95h27" />
        <circle className="icon-red" cx="118" cy="105" r="27" />
        <path className="icon-white icon-tick" d="m105 105 9 9 17-20" />
      </svg>
    );
  if (kind === "verify")
    return (
      <svg viewBox="0 0 180 150" aria-hidden="true">
        <path
          className="icon-paper"
          d="m90 10 54 20v39c0 35-22 57-54 70-32-13-54-35-54-70V30Z"
        />
        <path
          className="icon-soft"
          d="m90 31 33 12v26c0 21-13 36-33 47-20-11-33-26-33-47V43Z"
        />
        <path className="icon-check icon-tick" d="m72 71 12 12 25-29" />
        <circle className="icon-red" cx="136" cy="111" r="17" />
        <path className="icon-white" d="M136 102v11m0 7v1" />
      </svg>
    );
  return (
    <svg viewBox="0 0 180 150" aria-hidden="true">
      <rect
        className="icon-paper"
        x="32"
        y="31"
        width="116"
        height="102"
        rx="17"
      />
      <path
        className="icon-red"
        d="M32 52c0-12 7-21 18-21h80c11 0 18 9 18 21v13H32Z"
      />
      <path className="icon-white" d="M59 19v24m62-24v24" />
      <circle className="icon-soft" cx="90" cy="96" r="26" />
      <path className="icon-line icon-tick" d="M90 80v17l12 8" />
    </svg>
  );
}

const trustCards: {
  title: string;
  description: string;
  icon: TrustIconKind;
}[] = [
  {
    title: "چرا بیمه آنلاین بخرم؟",
    description:
      "در ترب بیمه می‌تونی انواع بیمه‌ها را سریع مقایسه کنی، بهترین گزینه را انتخاب کنی و بدون دردسر بیمه‌نامه معتبر خودت را دریافت کنی.",
    icon: "compare",
  },
  {
    title: "خرید بیمه، ساده و سریع",
    description:
      "فقط چند مرحله کوتاه، انتخاب بیمه مناسب و پرداخت آنلاین. ما مسیر خرید بیمه را برایت ساده کرده‌ایم.",
    icon: "approve",
  },
  {
    title: "اگر اطلاعاتم را اشتباه وارد کنم چی میشه؟",
    description:
      "نگران نباش. اطلاعات قبل از صدور بررسی می‌شوند و در صورت نیاز میتونی از هوش مصنوعی ترب بیمه کمک بگیری!",
    icon: "verify",
  },
  {
    title: "ممکنه تاریخ سررسید بیمه‌ام یادم بره؟",
    description:
      "با یادآوری‌های هوشمند ترب بیمه، زمان تمدید بیمه را از دست نمی‌دهی و همیشه به موقع اقدام می‌کنی.",
    icon: "reminder",
  },
];

function TrustJourney() {
  const reduceMotion = useReducedMotion();
  return (
    <section className="trust-journey" aria-labelledby="trust-title">
      <div className="trust-heading">
        <span className="overline">از انتخاب تا تمدید</span>
        <h2 id="trust-title">بیمه، ساده‌تر از چیزی که فکر می‌کنی</h2>
        <p>چهار پاسخ کوتاه برای یک مسیر مطمئن‌تر</p>
      </div>
      <motion.svg
        className="journey-path"
        viewBox="0 0 1100 940"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <motion.path
          d="M870 95C690 155 705 260 255 285S720 485 860 520 660 715 245 730 465 860 830 875"
          initial={{ pathLength: reduceMotion ? 1 : 0, opacity: 0 }}
          whileInView={{ pathLength: 1, opacity: 1 }}
          viewport={{ once: true, amount: 0.12 }}
          transition={{ duration: reduceMotion ? 0 : 1.8, ease: "easeInOut" }}
        />
      </motion.svg>
      <div className="trust-list">
        {trustCards.map((card, index) => (
          <motion.article
            className={`trust-card${index % 2 ? " reverse" : ""}`}
            key={card.title}
            initial={reduceMotion ? false : { opacity: 0, y: 42, scale: 0.975 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, amount: 0.28 }}
            transition={{
              duration: 0.55,
              delay: index * 0.06,
              ease: "easeOut",
            }}
            whileHover={reduceMotion ? undefined : { y: -6 }}
          >
            <motion.div
              className={`trust-illustration trust-illustration--${index + 1}`}
              animate={reduceMotion ? undefined : { y: [0, -7, 0] }}
              transition={{
                duration: 4 + index * 0.35,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <TrustIcon kind={card.icon} />
            </motion.div>
            <div className="trust-copy">
              <span className="trust-number">۰{index + 1}</span>
              <h3>{card.title}</h3>
              <p>{card.description}</p>
            </div>
          </motion.article>
        ))}
      </div>
    </section>
  );
}

function App() {
  const [selected, setSelected] = useState<InsuranceKind | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [inquiryId, setInquiryId] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState(false);
  useEffect(() => {
    const match = window.location.pathname.match(/^\/results\/([^/]+)$/);
    if (!match) return;
    const id = decodeURIComponent(match[1]);
    getInquiry(id).then((stored) => {
      if (!stored) {
        setRestoreError(true);
        return;
      }
      setSelected(stored.insuranceKind);
      setResult(stored.result);
      setInquiryId(stored.id);
      void markInquiryOpened(stored.id);
    }).catch(() => setRestoreError(true));
  }, []);
  const showFreshResult = (next: SearchResult) => {
    const id = stableInquiryId(next);
    setResult(next);
    setInquiryId(id);
    setRestoreError(false);
    window.history.replaceState({ inquiryId: id }, "", `/results/${encodeURIComponent(id)}`);
  };
  useEffect(() => {
    if (result)
      document
        .querySelector(".results")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [result]);
  const offers = (result?.providers.flatMap((p) => p.offers) || []).sort(
    (a, b) =>
      (a.premium.amount_toman ?? Infinity) -
      (b.premium.amount_toman ?? Infinity),
  );
  return (
    <div className="site">
      <header className="header wrap">
        <a href="/" className="identity" aria-label="ترب بیمه، صفحهٔ آغاز">
          <img src="/logo.png" alt="ترب بیمه" />
          <span>مقایسهٔ بیمه، با خیال روشن‌تر</span>
        </a>
        <span className="edition">استعلام و مقایسهٔ آنلاین</span>
      </header>
      <main className="wrap">
        <section
          className="landing-hero relative isolate mt-3 overflow-hidden rounded-[32px] border border-emerald-900/[0.05] bg-[linear-gradient(135deg,#f8fcf6_0%,#edf8ed_46%,#e3f2e5_100%)] px-6 py-10 shadow-[0_24px_80px_rgba(17,79,48,0.08)] sm:px-10 lg:min-h-[540px] lg:px-14 lg:py-14"
          aria-labelledby="hero-title"
        >
          <div className="hero-glow" aria-hidden="true" />
          <div className="relative z-10 grid items-center gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:gap-5">
            <div className="hero-copy max-w-[475px] lg:pr-2">
              <div className="mb-5 flex items-center gap-3 text-xs font-extrabold text-[#168852] sm:text-sm">
                <span className="h-px w-9 bg-[#168852]" />
                <span>ساده شروع می‌شود، شفاف ادامه پیدا می‌کند</span>
              </div>
              <h1
                id="hero-title"
                className="m-0 text-[2.15rem] leading-[1.45] font-extrabold tracking-[-0.04em] text-[#103d2b] sm:text-[2.8rem] lg:text-[3rem]"
              >
                بیمه‌ات را پیدا کن؛
                <br />
                <span className="text-[#e83c40] lg:whitespace-nowrap">
                  یک سؤال در هر قدم.
                </span>
              </h1>
              <p className="mt-5 mb-0 max-w-[440px] text-sm leading-8 text-[#506f60] sm:text-base">
                مشخصات وسیله‌ات را یک‌بار می‌گویی؛ پیشنهادهای تازهٔ منابع مختلف
                را شفاف، سریع و با جزئیات واقعی می‌بینی.
              </p>
              <a
                className="hero-cta mt-7 inline-flex min-h-12 items-center gap-3 rounded-2xl bg-[#158851] px-6 py-3 text-sm font-extrabold text-white no-underline shadow-[0_12px_28px_rgba(21,136,81,0.24)] transition hover:-translate-y-0.5 hover:bg-[#107647] hover:shadow-[0_16px_32px_rgba(21,136,81,0.3)] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#158851]"
                href="#start"
              >
                از انتخاب تا مقایسه <span aria-hidden="true">←</span>
              </a>
              <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-[11px] font-bold text-[#476b58] sm:text-xs">
                <span className="flex items-center gap-2">
                  <i className="trust-dot" />
                  قیمت‌های به‌روز
                </span>
                <span className="flex items-center gap-2">
                  <i className="trust-dot" />
                  مقایسهٔ سریع
                </span>
                <span className="flex items-center gap-2">
                  <i className="trust-dot" />
                  شرکت‌های معتبر
                </span>
              </div>
            </div>

            <div
              className="hero-visual relative min-h-[330px] sm:min-h-[390px] lg:min-h-[430px]"
              aria-label="تصویر ترب در مسیر مقایسهٔ بیمه"
            >
              <div className="torob-scene" aria-hidden="true">
                <div className="torob-hills">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="torob-road">
                  <span />
                </div>
                <div className="hero-radish-crop">
                  <img src="/logo.png" alt="" />
                </div>
                <i className="torob-accent torob-accent--one" />
                <i className="torob-accent torob-accent--two" />
              </div>
            </div>
          </div>
        </section>
        <TrustJourney />
        <RecentInquiries />
        {restoreError && <div className="stored-inquiry-error" role="status">این استعلام در حافظهٔ مرورگر پیدا نشد یا پاک شده است. می‌توانید استعلام تازه‌ای شروع کنید.</div>}
        <InsuranceSelection
          selected={selected}
          onSelect={(kind) => {
            setSelected(kind);
            setResult(null);
          }}
        />
        {selected === "third_car" && (
          <ThirdPartyInsuranceFlow
            onStart={() => setResult(null)}
            onResult={(r) => {
              showFreshResult(r);
            }}
          />
        )}
        {selected === "body_car" && (
          <BodyCarWizard
            onStart={() => setResult(null)}
            onResult={(r) => {
              showFreshResult(r);
            }}
          />
        )}
        {selected === "third_motor" && (
          <ThirdMotorWizard
            onStart={() => setResult(null)}
            onResult={(r) => {
              showFreshResult(r);
            }}
          />
        )}
      </main>
      {result && selected && inquiryId && <InsuranceResults result={result} insuranceKind={selected} inquiryId={inquiryId} />}
      <footer className="footer wrap">
        <span>ترب بیمه</span>
        <span>استعلام چند منبع، در یک فرم ساده</span>
      </footer>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
