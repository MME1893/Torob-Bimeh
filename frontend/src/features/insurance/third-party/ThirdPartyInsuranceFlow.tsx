import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";
import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  CarFront,
  Check,
  ChevronDown,
  Coins,
  FileText,
  UserRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { SearchResult } from "../../search/searchTypes";
import stepOneIllustration from "../../../assets/insurance/bimeh_shakhs_1.png";
import stepTwoIllustration from "../../../assets/insurance/bimeh_shakhs_2.png";
import stepThreeIllustration from "../../../assets/insurance/bimeh_shakhs_3.png";
import stepFourIllustration from "../../../assets/insurance/bimeh_shakhs_4.png";
import "./third-party-insurance.css";

type Step = 1 | 2 | 3 | 4;
type PolicyStatus =
  | "no_previous_policy"
  | "had_previous_policy"
  | "new_vehicle";
type OwnershipMode = "unchanged" | "no_discount" | "same_plate" | "other_plate";
type Usage = { key: string; label: string };
type Choice = { key: string; label: string };
type Model = {
  key: string;
  label: string;
  category: string;
  category_key: string;
  brand: string;
  brand_key: string;
  model: string;
  imported: boolean | null;
  usages: Usage[];
};
type Catalog = {
  models: Model[];
  insurers: Choice[];
  production_years_jalali: number[];
  durations: number[];
  discounts: number[];
  fuels: Choice[];
  coverages_toman: number[];
};
type Preview = { provider: string; status: string };
type IconName =
  | "arrow"
  | "building"
  | "calendar"
  | "car"
  | "check"
  | "chevron"
  | "coins"
  | "document"
  | "tool"
  | "user";

const policyLabels: Record<PolicyStatus, string> = {
  no_previous_policy: "بیمه‌نامه قبلی ندارم",
  had_previous_policy: "بیمه‌نامه قبلی دارم",
  new_vehicle: "خودروی نو / صفرکیلومتر",
};

const ownershipLabels: Record<OwnershipMode, string> = {
  unchanged: "تعویض پلاک یا انتقال تخفیف نداشته‌ام",
  no_discount: "تعویض پلاک؛ تخفیف قابل انتقال ندارم",
  same_plate: "تعویض پلاک؛ تخفیف همین پلاک حفظ می‌شود",
  other_plate: "انتقال تخفیف از پلاک دیگر",
};

const illustrations: Record<Step, string> = {
  1: stepOneIllustration,
  2: stepTwoIllustration,
  3: stepThreeIllustration,
  4: stepFourIllustration,
};

const toEnglishDigits = (value: string) =>
  value
    .replace(/[۰-۹]/g, (character) => String(character.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (character) => String(character.charCodeAt(0) - 1632));
const dateText = (value: string) => toEnglishDigits(value).trim().replace(/-/g, "/");
const isValidDate = (value: string) => {
  const normalized = dateText(value);
  if (!/^(13|14)\d\d\/(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])$/.test(normalized))
    return false;
  const [, month, day] = normalized.split("/").map(Number);
  return day <= (month <= 6 ? 31 : 30);
};
const formatNumber = (value: number) => value.toLocaleString("fa-IR");
const yearLabel = (value: number) => String(value);
const unique = <T extends { key: string }>(items: T[]) =>
  [...new Map(items.map((item) => [item.key, item])).values()];

const iconMap: Record<IconName, LucideIcon> = {
  arrow: ArrowLeft,
  building: Building2,
  calendar: CalendarDays,
  car: CarFront,
  check: Check,
  chevron: ChevronDown,
  coins: Coins,
  document: FileText,
  tool: Wrench,
  user: UserRound,
};

function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  const Glyph = iconMap[name];
  return <Glyph aria-hidden="true" size={size} strokeWidth={1.8} />;
}

export function InsuranceStepper({ currentStep }: { currentStep: Step }) {
  return (
    <div
      className="tp-progress"
      role="progressbar"
      aria-label={`گام ${formatNumber(currentStep)} از ۴`}
      aria-valuemin={1}
      aria-valuemax={4}
      aria-valuenow={currentStep}
    >
      <motion.span
        initial={false}
        animate={{ width: `${currentStep * 25}%` }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      />
    </div>
  );
}

export function InsuranceCard({
  currentStep,
  children,
}: {
  currentStep: Step;
  children: ReactNode;
}) {
  return (
    <section className="third-party-flow" dir="rtl" aria-label="فرم بیمه شخص ثالث خودرو">
      <header className="tp-card-header">
        <strong>استعلام شخص ثالث خودرو</strong>
        <span>گام {formatNumber(currentStep)} از ۴</span>
      </header>
      <InsuranceStepper currentStep={currentStep} />
      {children}
    </section>
  );
}

export function FormInput({
  label,
  icon,
  children,
  isSelect = false,
  className = "",
}: {
  label: string;
  icon: IconName;
  children: ReactNode;
  isSelect?: boolean;
  className?: string;
}) {
  return (
    <label className={`tp-field ${className}`}>
      <span className="tp-field-label">{label}</span>
      <span className="tp-control">
        <span className="tp-control-icon"><Icon name={icon} size={21} /></span>
        {children}
        {isSelect && <span className="tp-control-chevron"><Icon name="chevron" size={21} /></span>}
      </span>
    </label>
  );
}

export function IconInput(props: Parameters<typeof FormInput>[0]) {
  return <FormInput {...props} />;
}

export function IllustrationPanel({
  step,
  reduceMotion,
}: {
  step: Step;
  reduceMotion: boolean | null;
}) {
  return (
    <motion.div
      className={`tp-illustration tp-illustration--${step}`}
      aria-hidden="true"
      animate={reduceMotion ? undefined : { y: [0, 3, 0] }}
      transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
    >
      <img src={illustrations[step]} alt="" />
    </motion.div>
  );
}

export function NavigationButtons({
  currentStep,
  onPrevious,
  onContinue,
  pending,
  finalDisabled,
}: {
  currentStep: Step;
  onPrevious: () => void;
  onContinue: () => void;
  pending: boolean;
  finalDisabled: boolean;
}) {
  const isFinal = currentStep === 4;
  return (
    <nav className="tp-actions" aria-label="پیمایش مراحل فرم">
      {currentStep > 1 && (
        <motion.button
          type="button"
          className="tp-button tp-button--secondary"
          onClick={onPrevious}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.98 }}
        >
          مرحله قبل
        </motion.button>
      )}
      <motion.button
        type="button"
        className="tp-button tp-button--primary"
        onClick={onContinue}
        disabled={pending || (isFinal && finalDisabled)}
        whileHover={pending || (isFinal && finalDisabled) ? undefined : { y: -2 }}
        whileTap={pending || (isFinal && finalDisabled) ? undefined : { scale: 0.98 }}
      >
        <span>{pending ? "در حال استعلام…" : isFinal ? "دریافت پیشنهادها" : "ادامه"}</span>
        {!isFinal && <Icon name="arrow" size={21} />}
      </motion.button>
    </nav>
  );
}

export function SummaryItem({
  children,
  editLabel,
  onEdit,
}: {
  children: ReactNode;
  editLabel: string;
  onEdit: () => void;
}) {
  return (
    <div className="tp-summary-item">
      <strong>{children}</strong>
      <span className="tp-summary-separator" />
      <button type="button" onClick={onEdit}>{editLabel}</button>
    </div>
  );
}

function StepHeading({
  step,
  title,
  subtitle,
}: {
  step: Step;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="tp-heading">
      <span className={`tp-step-badge ${step === 4 ? "is-complete" : ""}`}>
        {step === 4 ? <Icon name="check" size={30} /> : formatNumber(step)}
      </span>
      <h2>{title}</h2>
      {subtitle && <p>{subtitle}</p>}
    </div>
  );
}

function StepLayout({
  step,
  title,
  subtitle,
  reduceMotion,
  children,
  footer,
}: {
  step: Step;
  title: string;
  subtitle?: string;
  reduceMotion: boolean | null;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className={`tp-step-layout tp-step-layout--${step}`}>
      <IllustrationPanel step={step} reduceMotion={reduceMotion} />
      <div className="tp-step-form">
        <StepHeading step={step} title={title} subtitle={subtitle} />
        <div className="tp-step-fields">{children}</div>
        <div className="tp-step-footer">{footer}</div>
      </div>
    </div>
  );
}

function SelectField({
  label,
  icon,
  value,
  onChange,
  children,
  disabled,
  className,
}: {
  label: string;
  icon: IconName;
  value: string | number;
  onChange: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <IconInput label={label} icon={icon} isSelect className={className}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      >
        {children}
      </select>
    </IconInput>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <IconInput label={label} icon="calendar" className={value && !isValidDate(value) ? "is-invalid" : ""}>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="۱۴۰۴/۰۱/۰۱"
        inputMode="numeric"
        dir="ltr"
        aria-invalid={Boolean(value && !isValidDate(value))}
      />
    </IconInput>
  );
}

export function ThirdPartyInsuranceFlow({
  onResult,
  onStart,
}: {
  onResult: (result: SearchResult) => void;
  onStart: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [categoryKey, setCategoryKey] = useState("");
  const [brandKey, setBrandKey] = useState("");
  const [modelKey, setModelKey] = useState("");
  const [usage, setUsage] = useState("");
  const [year, setYear] = useState(1405);
  const [fuel, setFuel] = useState("1");
  const [imported, setImported] = useState<"catalog" | "true" | "false">("catalog");
  const [status, setStatus] = useState<PolicyStatus>("no_previous_policy");
  const [insurer, setInsurer] = useState("");
  const [start, setStart] = useState("");
  const [expiry, setExpiry] = useState("");
  const [release, setRelease] = useState("");
  const [newExpiry, setNewExpiry] = useState("");
  const [previousDuration, setPreviousDuration] = useState(12);
  const [ownershipMode, setOwnershipMode] = useState<OwnershipMode>("unchanged");
  const [policyOwner, setPolicyOwner] = useState<"current" | "previous" | "transfer">("current");
  const [supplement, setSupplement] = useState(false);
  const [transferPlate, setTransferPlate] = useState("");
  const [transfer, setTransfer] = useState({
    part1: "",
    part2: "",
    part3: "",
    serial: "",
    national: "",
    relationship: "",
    inquiry: "",
  });
  const [thirdDiscount, setThirdDiscount] = useState(0);
  const [driverDiscount, setDriverDiscount] = useState(0);
  const [hadClaim, setHadClaim] = useState(false);
  const [counts, setCounts] = useState({ property: 0, bodily: 0, driver: 0 });
  const [duration, setDuration] = useState(12);
  const [coverage, setCoverage] = useState(70_000_000);
  const [baseCompany, setBaseCompany] = useState("");
  const [baseStart, setBaseStart] = useState("");
  const [baseExpiry, setBaseExpiry] = useState("");
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/search/catalog", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw Error("اطلاعات فرم دریافت نشد.");
        return response.json();
      })
      .then((data: Catalog) => {
        setCatalog(data);
        const initial = data.models.find((item) => item.key === "peugeot_pars") || data.models[0];
        if (initial) {
          setCategoryKey(initial.category_key);
          setBrandKey(initial.brand_key);
          setModelKey(initial.key);
          setUsage(initial.usages[0]?.key || "");
        }
        if (data.production_years_jalali.length) setYear(data.production_years_jalali[0]);
        if (data.fuels.length) setFuel(data.fuels[0].key);
        if (data.coverages_toman.includes(70_000_000)) setCoverage(70_000_000);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason.message);
      });
    return () => controller.abort();
  }, []);

  const model = catalog?.models.find((item) => item.key === modelKey);
  const categoryChoices = useMemo(
    () => unique((catalog?.models || []).map((item) => ({ key: item.category_key, label: item.category }))),
    [catalog],
  );
  const categoryModels = (catalog?.models || []).filter((item) => item.category_key === categoryKey);
  const brandChoices = unique(categoryModels.map((item) => ({ key: item.brand_key, label: item.brand })));
  const brandModels = categoryModels
    .filter((item) => item.brand_key === brandKey)
    .sort((a, b) => a.model.localeCompare(b.model, "fa"));
  const effectiveImported = imported === "catalog" ? Boolean(model?.imported) : imported === "true";

  function selectModel(next: Model | undefined) {
    if (!next) return;
    setCategoryKey(next.category_key);
    setBrandKey(next.brand_key);
    setModelKey(next.key);
    setUsage(next.usages[0]?.key || "");
    setPreviews([]);
  }

  function changeCategory(key: string) {
    selectModel((catalog?.models || []).find((item) => item.category_key === key));
  }

  function changeBrand(key: string) {
    selectModel(categoryModels.find((item) => item.brand_key === key));
  }

  function payload() {
    const history =
      status === "no_previous_policy"
        ? { status }
        : status === "new_vehicle"
          ? {
              status,
              first_use_date_jalali: dateText(release) || null,
              new_vehicle_expiry_jalali: dateText(newExpiry) || null,
            }
          : {
              status,
              previous_insurer_key: insurer || null,
              previous_start_date_jalali: dateText(start) || null,
              previous_expiry_date_jalali: dateText(expiry) || null,
              previous_duration_months: previousDuration,
              no_claim_discount_percent: thirdDiscount,
              driver_discount_percent: driverDiscount,
              had_claim: hadClaim,
              property_claim_count: hadClaim ? counts.property : 0,
              bodily_claim_count: hadClaim ? counts.bodily : 0,
              driver_claim_count: hadClaim ? counts.driver : 0,
              ownership_mode: ownershipMode,
              policy_owner: policyOwner,
              supplement_discounts: policyOwner === "transfer" && supplement,
              ...(ownershipMode === "other_plate"
                ? {
                    transfer_plate: transferPlate || null,
                    transfer_plate_part1: transfer.part1 || null,
                    transfer_plate_part2: transfer.part2 || null,
                    transfer_plate_part3: transfer.part3 || null,
                    transfer_plate_serial: transfer.serial || null,
                    transfer_national_id: transfer.national || null,
                    transfer_relationship: transfer.relationship,
                    transfer_inquiry_id: transfer.inquiry || null,
                  }
                : {}),
            };

    return {
      product: "third_car",
      vehicle: {
        category_key: model?.category_key,
        brand_key: model?.brand_key,
        model_key: modelKey,
        usage_key: usage,
        production_year_jalali: year,
        fuel_type_key: fuel,
        imported: imported === "catalog" ? null : effectiveImported,
        construction_year_title: String(year),
      },
      previous_policy: history,
      duration_months: duration,
      financial_coverage_toman: coverage,
      sabim_zero_km_third_discount: status === "new_vehicle",
      sabim_zero_km_driver_discount: status === "new_vehicle",
      sabim_history:
        status !== "had_previous_policy" && baseCompany && isValidDate(baseStart) && isValidDate(baseExpiry)
          ? {
              insurer_key: baseCompany,
              start_date_jalali: dateText(baseStart),
              expiry_date_jalali: dateText(baseExpiry),
            }
          : null,
    };
  }

  const serialized = model ? JSON.stringify(payload()) : "";
  useEffect(() => {
    if (currentStep !== 4 || !serialized) return;
    const controller = new AbortController();
    setPreviewLoading(true);
    setPreviews([]);
    const timer = setTimeout(() => {
      fetch("/api/search/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: serialized,
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw Error("اطلاعات فرم معتبر نیست؛ بخش‌های قبلی را بازبینی کنید.");
          return response.json();
        })
        .then((data) => {
          setPreviews(data.providers);
          setError("");
        })
        .catch((reason) => {
          if (!controller.signal.aborted) setError(reason.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setPreviewLoading(false);
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [serialized, currentStep]);

  function validate(step = currentStep) {
    if (step === 1) {
      if (!model || model.category_key !== categoryKey || model.brand_key !== brandKey)
        return "نوع، برند و مدل خودرو را کامل انتخاب کنید.";
      if (!model.usages.some((item) => item.key === usage)) return "کاربری خودرو را انتخاب کنید.";
    }
    if (step === 2) {
      if (status === "had_previous_policy") {
        if (!insurer) return "شرکت بیمه قبلی را انتخاب کنید.";
        if (!isValidDate(start) || !isValidDate(expiry))
          return "شروع و پایان بیمه‌نامه قبلی را با تاریخ شمسی معتبر وارد کنید.";
        if (dateText(start) >= dateText(expiry)) return "پایان بیمه‌نامه قبلی باید پس از شروع آن باشد.";
        if (
          ownershipMode === "other_plate" &&
          (!transferPlate.trim() ||
            ![transfer.part1, transfer.part2, transfer.part3, transfer.serial, transfer.national, transfer.inquiry].every(Boolean))
        )
          return "مشخصات پلاک و مالک مبدأ انتقال تخفیف را کامل کنید.";
      }
      if (status === "new_vehicle" && (!isValidDate(release) || !isValidDate(newExpiry)))
        return "تاریخ ترخیص و پایان بیمه‌نامه خودروی نو را کامل کنید.";
    }
    if (step === 3) {
      if (status === "had_previous_policy" && hadClaim && !Object.values(counts).some(Boolean))
        return "دست‌کم یکی از تعداد خسارت‌ها باید بیشتر از صفر باشد.";
      if (status !== "had_previous_policy") {
        if (!baseCompany || !isValidDate(baseStart) || !isValidDate(baseExpiry))
          return "اطلاعات تکمیلی لازم برای استعلام را کامل کنید.";
        if (dateText(baseStart) >= dateText(baseExpiry)) return "پایان بازه باید پس از شروع آن باشد.";
      }
    }
    return "";
  }

  function goNext() {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setCurrentStep((value) => Math.min(4, value + 1) as Step);
  }

  function goPrevious() {
    setError("");
    setCurrentStep((value) => Math.max(1, value - 1) as Step);
  }

  async function search() {
    const problem = validate(3);
    if (problem) {
      setError(problem);
      return;
    }
    if (previewLoading || !allReady) {
      setError("استعلام هر چهار منبع هنوز آماده نیست؛ اطلاعات مراحل قبل را بازبینی کنید.");
      return;
    }
    setPending(true);
    setError("");
    onStart();
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: serialized,
      });
      if (!response.ok)
        throw Error(response.status === 422 ? "اطلاعات فرم یا تاریخ‌ها معتبر نیست." : "اتصال به سرور برقرار نشد.");
      onResult(await response.json());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "استعلام ناموفق بود.");
    } finally {
      setPending(false);
    }
  }

  const readyCount = previews.filter((item) => item.status === "ready").length;
  const allReady = previews.length === 4 && readyCount === 4;

  const motionProps = reduceMotion
    ? { initial: false as const }
    : {
        initial: { opacity: 0, y: 20 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -10 },
        transition: { duration: 0.4, ease: "easeOut" as const },
      };

  const stepFooter = (
    <>
      {error && <p className="tp-alert" role="alert">{error}</p>}
      <NavigationButtons
        currentStep={currentStep}
        onPrevious={goPrevious}
        onContinue={currentStep === 4 ? search : goNext}
        pending={pending}
        finalDisabled={previewLoading || !allReady}
      />
    </>
  );

  return (
    <InsuranceCard currentStep={currentStep}>
      <fieldset className="tp-fieldset" disabled={pending}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div className={`tp-step tp-step--${currentStep}`} key={currentStep} {...motionProps}>
            {currentStep === 1 && (
              <StepLayout
                step={1}
                title="مشخصات خودرو"
                subtitle="اطلاعات خودروی خود را وارد کنید تا بیمه مناسب شما پیشنهاد شود."
                reduceMotion={reduceMotion}
                footer={stepFooter}
              >
                <div className="tp-fields-grid">
                  <SelectField label="نوع خودرو" icon="car" value={categoryKey} onChange={changeCategory} disabled={!catalog}>
                    {categoryChoices.map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}
                  </SelectField>
                  <SelectField label="برند خودرو" icon="tool" value={brandKey} onChange={changeBrand} disabled={!catalog}>
                    {brandChoices.map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}
                  </SelectField>
                  <SelectField label="مدل خودرو" icon="calendar" value={modelKey} onChange={(key) => selectModel(brandModels.find((item) => item.key === key))} disabled={!catalog}>
                    {brandModels.map((item) => <option value={item.key} key={item.key}>{item.model || item.label}</option>)}
                  </SelectField>
                  <SelectField label="کاربری" icon="user" value={usage} onChange={setUsage} disabled={!model}>
                    {model?.usages.map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}
                  </SelectField>
                  <SelectField label="سال ساخت" icon="calendar" value={year} onChange={(value) => setYear(Number(value))} disabled={!catalog}>
                    {catalog?.production_years_jalali.map((item) => <option value={item} key={item}>{yearLabel(item)}</option>)}
                  </SelectField>
                </div>
                <details className="tp-optional">
                  <summary>
                    <span><Icon name="document" size={23} />جزئیات تکمیلی خودرو (اختیاری)</span>
                    <Icon name="chevron" size={22} />
                  </summary>
                  <div className="tp-fields-grid tp-optional-fields">
                    <SelectField label="نوع سوخت" icon="tool" value={fuel} onChange={setFuel} disabled={!catalog}>
                      {catalog?.fuels.map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}
                    </SelectField>
                    <SelectField label="محل تولید" icon="building" value={imported} onChange={(value) => setImported(value as typeof imported)}>
                      <option value="catalog">انتخاب خودکار</option>
                      <option value="false">داخلی</option>
                      <option value="true">وارداتی</option>
                    </SelectField>
                  </div>
                </details>
              </StepLayout>
            )}

            {currentStep === 2 && (
              <StepLayout
                step={2}
                title="سابقه بیمه‌نامه و مالکیت"
                reduceMotion={reduceMotion}
                footer={stepFooter}
              >
                <div className={`tp-fields-grid ${status === "no_previous_policy" ? "tp-fields-grid--single" : ""}`}>
                  <SelectField label="وضعیت بیمه‌نامه قبلی" icon="document" value={status} onChange={(value) => setStatus(value as PolicyStatus)}>
                    {Object.entries(policyLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
                  </SelectField>
                  {status === "new_vehicle" && (
                    <>
                      <DateField label="تاریخ ترخیص / اولین استفاده" value={release} onChange={setRelease} />
                      <DateField label="تاریخ پایان بیمه‌نامه اولیه" value={newExpiry} onChange={setNewExpiry} />
                    </>
                  )}
                  {status === "had_previous_policy" && (
                    <>
                      <SelectField label="شرکت بیمه قبلی" icon="building" value={insurer} onChange={setInsurer}>
                        <option value="">انتخاب کنید...</option>
                        {catalog?.insurers.map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}
                      </SelectField>
                      <DateField label="شروع بیمه‌نامه قبلی" value={start} onChange={setStart} />
                      <DateField label="پایان بیمه‌نامه قبلی" value={expiry} onChange={setExpiry} />
                      <SelectField label="مدت بیمه‌نامه قبلی" icon="calendar" value={previousDuration} onChange={(value) => setPreviousDuration(Number(value))}>
                        {catalog?.durations.map((item) => <option value={item} key={item}>{formatNumber(item)} ماه</option>)}
                      </SelectField>
                      <SelectField label="وضعیت پلاک و انتقال تخفیف" icon="car" value={ownershipMode} onChange={(value) => setOwnershipMode(value as OwnershipMode)}>
                        {Object.entries(ownershipLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
                      </SelectField>
                      <SelectField label="بیمه‌نامه قبلی به نام چه کسی است؟" icon="user" value={policyOwner} onChange={(value) => setPolicyOwner(value as typeof policyOwner)}>
                        <option value="current">مالک فعلی</option>
                        <option value="previous">مالک قبلی</option>
                        <option value="transfer">انتقال‌دهنده تخفیف</option>
                      </SelectField>
                      {policyOwner === "transfer" && (
                        <label className="tp-check-field">
                          <input type="checkbox" checked={supplement} onChange={(event) => setSupplement(event.target.checked)} />
                          تخفیف انتقالی به تخفیف فعلی اضافه شود
                        </label>
                      )}
                      {ownershipMode === "other_plate" && (
                        <div className="tp-transfer-fields">
                          <h3>مشخصات مبدأ انتقال تخفیف</h3>
                          <div className="tp-fields-grid">
                            <IconInput label="شماره پلاک کامل" icon="car">
                              <input value={transferPlate} onChange={(event) => setTransferPlate(toEnglishDigits(event.target.value))} />
                            </IconInput>
                            {([
                              ["part1", "بخش اول پلاک"],
                              ["part2", "حرف پلاک"],
                              ["part3", "بخش سوم پلاک"],
                              ["serial", "سریال پلاک"],
                              ["national", "کد ملی صاحب پلاک"],
                              ["relationship", "نسبت با بیمه‌گذار"],
                              ["inquiry", "شناسه استعلام پلاک"],
                            ] as const).map(([key, label]) => (
                              <IconInput label={label} icon={key === "national" ? "user" : "document"} key={key}>
                                <input value={transfer[key]} onChange={(event) => setTransfer({ ...transfer, [key]: toEnglishDigits(event.target.value) })} />
                              </IconInput>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </StepLayout>
            )}

            {currentStep === 3 && (
              <StepLayout
                step={3}
                title="تخفیف، خسارت و پوشش"
                reduceMotion={reduceMotion}
                footer={stepFooter}
              >
                <div className="tp-fields-grid">
                  <SelectField label="مدت بیمه‌نامه جدید" icon="calendar" value={duration} onChange={(value) => setDuration(Number(value))}>
                    {catalog?.durations.map((item) => <option value={item} key={item}>{formatNumber(item)} ماه</option>)}
                  </SelectField>
                  <SelectField label="تعهد مالی" icon="coins" value={coverage} onChange={(value) => setCoverage(Number(value))}>
                    {catalog?.coverages_toman.map((item) => <option value={item} key={item}>{formatNumber(item)} تومان</option>)}
                  </SelectField>
                  {status !== "had_previous_policy" && (
                    <>
                      <SelectField label="شرکت بیمه ثبت‌شده" icon="building" value={baseCompany} onChange={setBaseCompany}>
                        <option value="">انتخاب کن...</option>
                        {catalog?.insurers.map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}
                      </SelectField>
                      <DateField label="شروع بازه ثبت‌شده" value={baseStart} onChange={setBaseStart} />
                      <DateField label="پایان بازه ثبت‌شده" value={baseExpiry} onChange={setBaseExpiry} />
                    </>
                  )}
                  {status === "had_previous_policy" && (
                    <>
                      <SelectField label="درصد تخفیف شخص ثالث" icon="document" value={thirdDiscount} onChange={(value) => setThirdDiscount(Number(value))}>
                        {catalog?.discounts.map((item) => <option value={item} key={item}>{formatNumber(item)}٪</option>)}
                      </SelectField>
                      <SelectField label="درصد تخفیف حوادث راننده" icon="user" value={driverDiscount} onChange={(value) => setDriverDiscount(Number(value))}>
                        {catalog?.discounts.map((item) => <option value={item} key={item}>{formatNumber(item)}٪</option>)}
                      </SelectField>
                      <SelectField label="از بیمه‌نامه قبلی خسارت گرفته‌اید؟" icon="document" value={hadClaim ? "yes" : "no"} onChange={(value) => setHadClaim(value === "yes")}>
                        <option value="no">خیر</option>
                        <option value="yes">بله</option>
                      </SelectField>
                      {hadClaim && (["property", "bodily", "driver"] as const).map((kind) => (
                        <SelectField
                          label={`تعداد خسارت ${{ property: "مالی", bodily: "جانی", driver: "راننده" }[kind]}`}
                          icon="document"
                          value={counts[kind]}
                          onChange={(value) => setCounts({ ...counts, [kind]: Number(value) })}
                          key={kind}
                        >
                          {[0, 1, 2, 3].map((item) => <option value={item} key={item}>{item === 3 ? "۳ یا بیشتر" : formatNumber(item)}</option>)}
                        </SelectField>
                      ))}
                    </>
                  )}
                </div>
              </StepLayout>
            )}

            {currentStep === 4 && (
              <StepLayout
                step={4}
                title="مرور و دریافت پیشنهادها"
                reduceMotion={reduceMotion}
                footer={stepFooter}
              >
                <div className="tp-summary-grid">
                  <SummaryItem editLabel="ویرایش خودرو" onEdit={() => setCurrentStep(1)}>
                    {model?.category} • {model?.brand} • {model?.model} • {model?.usages.find((item) => item.key === usage)?.label} • {yearLabel(year)}
                  </SummaryItem>
                  <SummaryItem editLabel="ویرایش سابقه" onEdit={() => setCurrentStep(2)}>
                    {policyLabels[status]}
                    {status === "had_previous_policy" ? ` • ${insurer} • ${dateText(start)} تا ${dateText(expiry)}` : ""}
                    {status === "new_vehicle" ? ` • ترخیص ${dateText(release)}` : ""}
                  </SummaryItem>
                  <SummaryItem editLabel="ویرایش پوشش" onEdit={() => setCurrentStep(3)}>
                    {formatNumber(duration)} ماه • {formatNumber(coverage)} تومان
                    {status === "had_previous_policy" ? ` • تخفیف ثالث ${formatNumber(thirdDiscount)}٪ • راننده ${formatNumber(driverDiscount)}٪` : ""}
                  </SummaryItem>
                </div>
                <div className={`tp-success ${allReady ? "is-ready" : ""}`} role="status">
                  <span className="tp-success-icon"><Icon name="check" size={24} /></span>
                  <span>
                    {previewLoading
                      ? "در حال آماده‌سازی استعلام…"
                      : allReady
                        ? "استعلام هر چهار منبع آماده است."
                        : readyCount
                          ? `${formatNumber(readyCount)} منبع آماده است؛ اطلاعات مراحل قبل را بازبینی کنید.`
                          : "اطلاعات استعلام هنوز کامل نیست."}
                  </span>
                </div>
              </StepLayout>
            )}
          </motion.div>
        </AnimatePresence>
      </fieldset>
    </InsuranceCard>
  );
}
