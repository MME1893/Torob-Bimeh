import { useEffect, useMemo, useState } from "react";
import { ComboBox } from "../../../components/common/ComboBox";
import {
  isValidPersianDate,
  normalizePersianDate,
  PersianDatePicker,
} from "../../../components/forms/PersianDatePicker";
import type { SearchResult } from "../../search/searchTypes";

type PolicyStatus = "no_previous_policy" | "had_previous_policy" | "new_vehicle";
type OwnershipMode = "unchanged" | "no_discount" | "same_plate" | "other_plate";
type MotorType = { key: string; label: string; providers: string[] };
type MotorCatalog = {
  motor_types: MotorType[];
  production_years_jalali: number[];
  insurers: { key: string; label: string }[];
  durations: number[];
  discounts: number[];
  coverages_toman: number[];
  duration_months: number;
  financial_coverage_toman: number;
};
type Catalog = { third_motor: MotorCatalog };
type Preview = { provider: string; status: string };

const providerNames: Record<string, string> = {
  azki: "ازکی",
  sabim: "سابیم",
  bimebazar: "بیمه‌بازار",
  bimeh: "بیمه‌دات‌کام",
};
const previewLabels: Record<string, string> = {
  ready: "آمادهٔ استعلام",
  needs_input: "نیازمند تکمیل اطلاعات",
  unmapped: "فاقد نگاشت تأییدشده",
};
const policyLabels: Record<PolicyStatus, string> = {
  no_previous_policy: "بیمه‌نامهٔ قبلی ندارد",
  had_previous_policy: "بیمه‌نامهٔ قبلی دارد",
  new_vehicle: "موتورسیکلت نو / صفرکیلومتر",
};
const ownershipLabels: Record<OwnershipMode, string> = {
  unchanged: "تعویض پلاک یا انتقال تخفیف نداشته",
  no_discount: "تعویض پلاک؛ تخفیف قابل انتقال ندارم",
  same_plate: "تعویض پلاک؛ تخفیف همین پلاک حفظ می‌شود",
  other_plate: "انتقال تخفیف از پلاک دیگر",
};
const faDigits = (value: string) =>
  value
    .replace(/[۰-۹]/g, (char) => String(char.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (char) => String(char.charCodeAt(0) - 1632));
const dateText = normalizePersianDate;
const validDate = isValidPersianDate;
const number = (value: number) => value.toLocaleString("fa-IR");

export function ThirdMotorWizard({
  onResult,
  onStart,
}: {
  onResult: (result: SearchResult) => void;
  onStart: () => void;
}) {
  const [catalog, setCatalog] = useState<MotorCatalog | null>(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [motorType, setMotorType] = useState("");
  const [year, setYear] = useState(1404);
  const [status, setStatus] = useState<PolicyStatus>("no_previous_policy");
  const [insurer, setInsurer] = useState("");
  const [start, setStart] = useState("");
  const [expiry, setExpiry] = useState("");
  const [release, setRelease] = useState("");
  const [newExpiry, setNewExpiry] = useState("");
  const [previousDuration, setPreviousDuration] = useState(12);
  const [ownershipMode, setOwnershipMode] = useState<OwnershipMode>("unchanged");
  const [policyOwner, setPolicyOwner] = useState<"current" | "transfer">("current");
  const [supplement, setSupplement] = useState(false);
  const [transferPlate, setTransferPlate] = useState("");
  const [thirdDiscount, setThirdDiscount] = useState(0);
  const [driverDiscount, setDriverDiscount] = useState(0);
  const [hadClaim, setHadClaim] = useState(false);
  const [counts, setCounts] = useState({ property: 0, bodily: 0, driver: 0 });
  const [duration, setDuration] = useState(12);
  const [coverage, setCoverage] = useState(70_000_000);
  const [baseCompany, setBaseCompany] = useState("");
  const [baseStart, setBaseStart] = useState("");
  const [baseExpiry, setBaseExpiry] = useState("");
  const [yadak, setYadak] = useState(false);
  const [transition, setTransition] = useState(false);
  const [zeroThirdDiscount, setZeroThirdDiscount] = useState(true);
  const [zeroDriverDiscount, setZeroDriverDiscount] = useState(true);
  const [discountCode, setDiscountCode] = useState("");
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/search/catalog", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw Error("اطلاعات فرم موتور دریافت نشد.");
        return response.json();
      })
      .then((data: Catalog) => {
        const next = data.third_motor;
        setCatalog(next);
        const initial = next.motor_types.find((item) => item.key === "one_cylinder") || next.motor_types[0];
        if (initial) setMotorType(initial.key);
        if (next.production_years_jalali.length) setYear(next.production_years_jalali[0]);
        if (next.insurers.length) {
          setInsurer(next.insurers[0].key);
          setBaseCompany(next.insurers[0].key);
        }
        setDuration(next.duration_months);
        setCoverage(next.financial_coverage_toman);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason.message);
      });
    return () => controller.abort();
  }, []);

  const selectedType = catalog?.motor_types.find((item) => item.key === motorType);
  const payload = useMemo(() => {
    const previousPolicy =
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
              policy_owner: policyOwner === "transfer" ? "transfer" : "current",
              supplement_discounts: policyOwner === "transfer" && supplement,
              transfer_plate: ownershipMode === "other_plate" ? transferPlate || null : null,
            };
    return {
      product: "third_motor",
      vehicle: { motor_type_key: motorType, production_year_jalali: year },
      previous_policy: previousPolicy,
      duration_months: duration,
      financial_coverage_toman: coverage,
      sabim_history:
        status !== "had_previous_policy" && baseCompany && validDate(baseStart) && validDate(baseExpiry)
          ? {
              insurer_key: baseCompany,
              start_date_jalali: dateText(baseStart),
              expiry_date_jalali: dateText(baseExpiry),
            }
          : null,
      sabim_zero_km_third_discount: status === "new_vehicle" && zeroThirdDiscount,
      sabim_zero_km_driver_discount: status === "new_vehicle" && zeroDriverDiscount,
      sabim_yadak: yadak,
      sabim_transition: transition,
      discount_code: discountCode.trim() || null,
    };
  }, [
    baseCompany, baseExpiry, baseStart, counts, coverage, discountCode, driverDiscount,
    duration, expiry, hadClaim, insurer, motorType, newExpiry, ownershipMode, policyOwner,
    previousDuration, release, start, status, supplement, thirdDiscount, transferPlate,
    transition, yadak, year, zeroDriverDiscount, zeroThirdDiscount,
  ]);
  const serialized = motorType ? JSON.stringify(payload) : "";

  useEffect(() => {
    if (step !== 3 || !serialized) return;
    const controller = new AbortController();
    setPreviewLoading(true);
    setPreviews([]);
    const timer = window.setTimeout(() => {
      fetch("/api/search/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: serialized,
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw Error("اطلاعات فرم معتبر نیست؛ مراحل قبل را بازبینی کن.");
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
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [serialized, step]);

  function validate(currentStep = step) {
    if (currentStep === 0 && (!selectedType || !catalog?.production_years_jalali.includes(year)))
      return "نوع و سال ساخت موتورسیکلت را کامل انتخاب کن.";
    if (currentStep === 1 && status === "had_previous_policy") {
      if (!insurer) return "شرکت بیمهٔ قبلی را انتخاب کن.";
      if (!validDate(start) || !validDate(expiry)) return "تاریخ شروع و پایان بیمهٔ قبلی را کامل کن.";
      if (dateText(start) >= dateText(expiry)) return "پایان بیمهٔ قبلی باید پس از شروع آن باشد.";
      if (ownershipMode === "other_plate" && !transferPlate.trim()) return "پلاک مبدأ انتقال تخفیف را وارد کن.";
    }
    if (currentStep === 1 && status === "new_vehicle" && (!validDate(release) || !validDate(newExpiry)))
      return "تاریخ ترخیص و پایان بیمه‌نامهٔ اولیه را کامل کن.";
    if (currentStep === 2 && status === "had_previous_policy" && hadClaim && !Object.values(counts).some(Boolean))
      return "دست‌کم یک تعداد خسارت باید بیشتر از صفر باشد.";
    if (currentStep === 2 && status !== "had_previous_policy") {
      if (!baseCompany || !validDate(baseStart) || !validDate(baseExpiry))
        return "شرکت و بازهٔ مبنای لازم برای سابیم را کامل کن.";
      if (dateText(baseStart) >= dateText(baseExpiry)) return "پایان بازهٔ مبنا باید پس از شروع آن باشد.";
    }
    return "";
  }

  function next() {
    const problem = validate();
    if (problem) return setError(problem);
    setError("");
    setStep((value) => value + 1);
  }

  async function search() {
    const problem = validate(2);
    if (problem) return setError(problem);
    if (previewLoading || previews.length !== 4 || !previews.some((item) => item.status === "ready"))
      return setError("آماده‌سازی درخواست منابع هنوز کامل نشده است.");
    setPending(true);
    setError("");
    onStart();
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: serialized,
      });
      if (!response.ok) throw Error(response.status === 422 ? "اطلاعات فرم یا تاریخ‌ها معتبر نیست." : "اتصال به سرور برقرار نشد.");
      onResult(await response.json());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "استعلام ناموفق بود.");
    } finally {
      setPending(false);
    }
  }

  const dateField = (label: string, name: string, value: string, setter: (value: string) => void) => (
    <label>
      {label}
      <PersianDatePicker
        name={name}
        value={value}
        onChange={setter}
        error={Boolean(value && !validDate(value))}
      />
      {value && !validDate(value) && <small className="field-error">تاریخ را به‌شکل ۱۴۰۴/۰۱/۰۱ وارد کن.</small>}
    </label>
  );
  const months = (value: number, setter: (value: number) => void, label: string) => (
    <label>
      {label}
      <select value={value} onChange={(event) => setter(Number(event.target.value))}>
        {catalog?.durations.map((item) => <option key={item} value={item}>{number(item)} ماه</option>)}
      </select>
    </label>
  );
  const readyCount = previews.filter((item) => item.status === "ready").length;
  const canSearch = previews.length === 4 && readyCount > 0;

  return (
    <section className="wizard" aria-label="فرم بیمه شخص ثالث موتور">
      <div className="wizard-top"><span>استعلام شخص ثالث موتور</span><span>گام {number(step + 1)} از ۴</span></div>
      <div className="progress"><span style={{ width: `${(step + 1) * 25}%` }} /></div>
      <fieldset disabled={pending} className="wizard-fields">
        {step === 0 && (
          <div className="question">
            <span className="avatar">۱</span><h2>مشخصات موتورسیکلت</h2>
            <div className="answer">
              <ComboBox label="نوع موتورسیکلت" choices={(catalog?.motor_types || []).map((item) => ({ key: item.key, label: item.label }))} value={motorType} onChange={(value) => { setMotorType(value); setPreviews([]); }} disabled={!catalog} />
              <label>سال ساخت<select value={year} onChange={(event) => setYear(Number(event.target.value))}>{catalog?.production_years_jalali.map((item) => <option key={item} value={item}>{number(item)}</option>)}</select></label>
              {selectedType && <p className="field-note full">این نوع در {number(selectedType.providers.length)} منبع نگاشت تأییدشده دارد.</p>}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="question">
            <span className="avatar">۲</span><h2>سابقهٔ بیمه‌نامه و مالکیت</h2>
            <div className="answer">
              <label>وضعیت بیمه‌نامهٔ قبلی<select value={status} onChange={(event) => setStatus(event.target.value as PolicyStatus)}>{Object.entries(policyLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
              {status === "new_vehicle" && <>{dateField("تاریخ ترخیص / اولین استفاده", "first_use_date_jalali", release, setRelease)}{dateField("تاریخ پایان بیمه‌نامهٔ اولیه", "new_vehicle_expiry_jalali", newExpiry, setNewExpiry)}</>}
              {status === "had_previous_policy" && <>
                <ComboBox label="شرکت بیمهٔ قبلی" choices={catalog?.insurers || []} value={insurer} onChange={setInsurer} />
                {dateField("شروع بیمه‌نامهٔ قبلی", "previous_start_date_jalali", start, setStart)}
                {dateField("پایان بیمه‌نامهٔ قبلی", "previous_expiry_date_jalali", expiry, setExpiry)}
                {months(previousDuration, setPreviousDuration, "مدت بیمه‌نامهٔ قبلی")}
                <label>وضعیت پلاک و انتقال تخفیف<select value={ownershipMode} onChange={(event) => setOwnershipMode(event.target.value as OwnershipMode)}>{Object.entries(ownershipLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
                <label>مالکیت تخفیف<select value={policyOwner} onChange={(event) => setPolicyOwner(event.target.value as "current" | "transfer")}><option value="current">مالک فعلی</option><option value="transfer">انتقال تخفیف</option></select></label>
                {policyOwner === "transfer" && <label className="check-field"><input type="checkbox" checked={supplement} onChange={(event) => setSupplement(event.target.checked)} />تخفیف انتقالی به تخفیف فعلی اضافه شود</label>}
                {ownershipMode === "other_plate" && <label>پلاک مبدأ انتقال تخفیف<input value={transferPlate} onChange={(event) => setTransferPlate(event.target.value)} /></label>}
              </>}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="question">
            <span className="avatar">۳</span><h2>تخفیف، خسارت و پوشش</h2>
            <div className="answer">
              {status === "had_previous_policy" && <>
                <label>درصد تخفیف شخص ثالث<select value={thirdDiscount} onChange={(event) => setThirdDiscount(Number(event.target.value))}>{catalog?.discounts.map((item) => <option key={item} value={item}>{number(item)}٪</option>)}</select></label>
                <label>درصد تخفیف حوادث راننده<select value={driverDiscount} onChange={(event) => setDriverDiscount(Number(event.target.value))}>{catalog?.discounts.map((item) => <option key={item} value={item}>{number(item)}٪</option>)}</select></label>
                <label>از بیمه‌نامهٔ قبلی خسارت گرفته‌ای؟<select value={hadClaim ? "yes" : "no"} onChange={(event) => setHadClaim(event.target.value === "yes")}><option value="no">خیر</option><option value="yes">بله</option></select></label>
                {hadClaim && (["property", "bodily", "driver"] as const).map((kind) => <label key={kind}>تعداد خسارت {({ property: "مالی", bodily: "جانی", driver: "راننده" })[kind]}<select value={counts[kind]} onChange={(event) => setCounts({ ...counts, [kind]: Number(event.target.value) })}>{[0, 1, 2, 3].map((item) => <option key={item} value={item}>{item === 3 ? "۳ یا بیشتر" : number(item)}</option>)}</select></label>)}
              </>}
              {months(duration, setDuration, "مدت بیمه‌نامهٔ جدید")}
              <label>تعهد مالی<select value={coverage} onChange={(event) => setCoverage(Number(event.target.value))}>{catalog?.coverages_toman.map((item) => <option key={item} value={item}>{number(item)} تومان</option>)}</select></label>
              {status !== "had_previous_policy" && <>
                <ComboBox label="شرکت بیمهٔ مبنا برای سابیم" choices={catalog?.insurers || []} value={baseCompany} onChange={setBaseCompany} />
                {dateField("شروع بازهٔ مبنا", "sabim_start_date_jalali", baseStart, setBaseStart)}
                {dateField("پایان بازهٔ مبنا", "sabim_expiry_date_jalali", baseExpiry, setBaseExpiry)}
              </>}
              <details className="optional-section full"><summary>گزینه‌های اختصاصی منابع</summary><div className="answer">
                {status === "new_vehicle" && <><label className="check-field"><input type="checkbox" checked={zeroThirdDiscount} onChange={(event) => setZeroThirdDiscount(event.target.checked)} />تخفیف صفرکیلومتر ثالث سابیم</label><label className="check-field"><input type="checkbox" checked={zeroDriverDiscount} onChange={(event) => setZeroDriverDiscount(event.target.checked)} />تخفیف صفرکیلومتر رانندهٔ سابیم</label></>}
                <label className="check-field"><input type="checkbox" checked={yadak} onChange={(event) => setYadak(event.target.checked)} />پوشش یدک سابیم</label>
                <label className="check-field"><input type="checkbox" checked={transition} onChange={(event) => setTransition(event.target.checked)} />انتقال در سابیم</label>
                <label>کد تخفیف بیمه‌بازار<input value={discountCode} onChange={(event) => setDiscountCode(event.target.value)} maxLength={100} /></label>
              </div></details>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="question">
            <span className="avatar">✓</span><h2>مرور و درخواست‌های چهار منبع</h2>
            <div className="review">
              <span><b>{selectedType?.label} · سال {number(year)}</b><button type="button" className="secondary" onClick={() => setStep(0)}>ویرایش موتور</button></span>
              <span><b>{policyLabels[status]}{status === "had_previous_policy" ? ` · ${insurer} · ${dateText(start)} تا ${dateText(expiry)}` : ""}</b><button type="button" className="secondary" onClick={() => setStep(1)}>ویرایش سابقه</button></span>
              <span><b>{number(duration)} ماه · {number(coverage)} تومان</b><button type="button" className="secondary" onClick={() => setStep(2)}>ویرایش پوشش</button></span>
            </div>
            <div className="preview-tabs" role="list" aria-label="وضعیت نگاشت چهار منبع">
              {previews.map((item) => <div role="listitem" key={item.provider} className={`preview-source ${item.status}`}><b>{providerNames[item.provider]}</b><span>{previewLabels[item.status] || item.status}</span></div>)}
            </div>
            <p className="preview-summary">{previewLoading ? "در حال ساخت درخواست هر چهار منبع…" : canSearch ? `${number(readyCount)} درخواست آماده است؛ وضعیت هر چهار منبع بالا مشخص شده است.` : "اطلاعات استعلام هنوز کامل نیست."}</p>
          </div>
        )}

        {error && <p className="alert" role="alert">{error}</p>}
        <div className="wizard-actions">
          {step > 0 && <button type="button" className="secondary" onClick={() => { setError(""); setStep((value) => value - 1); }}>مرحلهٔ قبل</button>}
          {step < 3 ? <button type="button" className="primary" onClick={next}>ادامه</button> : <button type="button" className="primary" onClick={search} disabled={pending || previewLoading || !canSearch}>{pending ? "در حال استعلام…" : "دریافت پیشنهادها"}</button>}
        </div>
      </fieldset>
    </section>
  );
}
