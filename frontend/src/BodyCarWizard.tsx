import { useEffect, useMemo, useState } from "react";
import { ComboBox } from "./ComboBox";
import type { SearchResult } from "./searchTypes";

type Provider = "azki" | "sabim" | "bimebazar" | "bimeh";
type Usage = { key: string; label: string };
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
  providers: Provider[];
  source_count: number;
};
type ProviderModel = {
  key: string;
  label: string;
  category: string;
  brand: string;
  model: string;
  provider: Provider;
  usages: Usage[];
};
type Place = { id: number; name: string; regions?: Place[]; cities?: Place[] };
type AccessoryCategory = {
  id: number;
  name: string;
  items: { id: number; name: string }[];
};
type SourceOption = { id: string; name: string };
type BodyCatalog = {
  models: Model[];
  provider_models: ProviderModel[];
  insurers: { key: string; label: string }[];
  months: number[];
  claim_free_years: number[];
  third_party_discounts: number[];
  coverages: { key: string; label: string }[];
  provinces: Place[];
  accessory_categories: AccessoryCategory[];
  sabim: {
    bodyLifeDiscounts: SourceOption[];
    bodyOtherDiscounts: SourceOption[];
    bodyBankDiscounts: SourceOption[];
  };
};
type Catalog = {
  production_years_jalali: number[];
  fuels: { key: string; label: string }[];
  body_car: BodyCatalog;
};
type Preview = { provider: Provider; status: string };
type Accessory = {
  category_key: string;
  item_keys: string[];
  value_toman: number;
};

function AccessoryIcon({ name }: { name: string }) {
  if (name.includes("صوت"))
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path d="M29 8v24.5a7 7 0 1 1-4-6.3V13l15-3v18.5a7 7 0 1 1-4-6.3V8.6Z" />
        <path d="M10 15h8M7 21h11" />
      </svg>
    );
  if (name.includes("رینگ") || name.includes("لاستیک"))
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="17" />
        <circle cx="24" cy="24" r="8" />
        <path d="m24 16 3 5 5 3-5 3-3 5-3-5-5-3 5-3Z" />
      </svg>
    );
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M9 17h30v22H9zM17 17v-5h14v5" />
      <path d="M9 25h30M21 22v6h6v-6" />
    </svg>
  );
}

const providers: Provider[] = ["azki", "sabim", "bimebazar", "bimeh"];
const names: Record<Provider, string> = {
  azki: "ازکی",
  sabim: "سابیم",
  bimebazar: "بیمه‌بازار",
  bimeh: "بیمه‌دات‌کام",
};
const faDigits = (value: string) =>
  value
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 1632));
const dateText = (value: string) => faDigits(value).trim().replace(/-/g, "/");
const validDate = (value: string) => {
  const x = dateText(value);
  if (!/^(13|14)\d\d\/(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])$/.test(x))
    return false;
  const [, m, d] = x.split("/").map(Number);
  return d <= (m <= 6 ? 31 : 30);
};
const number = (value: number) => value.toLocaleString("fa-IR");
const unique = <T extends { key: string }>(items: T[]) => [
  ...new Map(items.map((item) => [item.key, item])).values(),
];
const money = (value: string) =>
  Number(faDigits(value).replace(/[,٬\s]/g, "")) || 0;

export function BodyCarWizard({
  onResult,
  onStart,
}: {
  onResult: (result: SearchResult) => void;
  onStart: () => void;
}) {
  const [catalog, setCatalog] = useState<Catalog | null>(null),
    body = catalog?.body_car;
  const [step, setStep] = useState(0),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false);
  const [category, setCategory] = useState(""),
    [brand, setBrand] = useState(""),
    [modelKey, setModelKey] = useState(""),
    [usage, setUsage] = useState("");
  const [year, setYear] = useState(1404),
    [month, setMonth] = useState(1),
    [fuel, setFuel] = useState("1"),
    [imported, setImported] = useState<"catalog" | "true" | "false">("catalog");
  const [activeProvider, setActiveProvider] = useState<Provider>("azki");
  const [overrides, setOverrides] = useState<
    Partial<Record<Provider, { model_key: string; usage_key: string }>>
  >({});
  const [zero, setZero] = useState(false),
    [clearance, setClearance] = useState("");
  const [hadPolicy, setHadPolicy] = useState(false),
    [previousInsurer, setPreviousInsurer] = useState(""),
    [expiry, setExpiry] = useState(""),
    [claimYears, setClaimYears] = useState(0),
    [hadClaim, setHadClaim] = useState(false),
    [previousWar, setPreviousWar] = useState(false);
  const [thirdInsurer, setThirdInsurer] = useState(""),
    [thirdDiscount, setThirdDiscount] = useState(0);
  const [vehicleValue, setVehicleValue] = useState("1000000000"),
    [province, setProvince] = useState(""),
    [city, setCity] = useState(""),
    [region, setRegion] = useState("");
  const [accessories, setAccessories] = useState<Accessory[]>([]);
  const [expandedAccessories, setExpandedAccessories] = useState<
    Record<string, boolean>
  >({});
  const [coverages, setCoverages] = useState<string[]>([]),
    [theft, setTheft] = useState(""),
    [fluctuation, setFluctuation] = useState(""),
    [cash, setCash] = useState(true),
    [coupon, setCoupon] = useState("");
  const [lifeDiscount, setLifeDiscount] = useState(""),
    [otherDiscount, setOtherDiscount] = useState(""),
    [bankDiscount, setBankDiscount] = useState("");
  const [azkiBodyDiscountId, setAzkiBodyDiscountId] = useState("");
  const [previews, setPreviews] = useState<Preview[]>([]),
    [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/search/catalog", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw Error("اطلاعات فرم دریافت نشد.");
        return response.json();
      })
      .then((data: Catalog) => {
        setCatalog(data);
        const b = data.body_car,
          initial =
            b.models.find(
              (item) =>
                item.source_count === 4 && item.label.includes("206 تیپ 2"),
            ) ||
            b.models.find((item) => item.source_count === 4) ||
            b.models[0];
        if (initial) {
          setCategory(initial.category_key);
          setBrand(initial.brand_key);
          setModelKey(initial.key);
          setUsage(initial.usages[0]?.key || "");
        }
        if (data.production_years_jalali.length)
          setYear(data.production_years_jalali[0]);
        if (data.fuels.length) setFuel(data.fuels[0].key);
        if (b.insurers.length) {
          setThirdInsurer(b.insurers[0].key);
          setPreviousInsurer(b.insurers[0].key);
        }
        const p = b.provinces[0];
        if (p) {
          setProvince(String(p.id));
          if (p.cities?.[0]) setCity(String(p.cities[0].id));
        }
        setLifeDiscount(
          b.sabim.bodyLifeDiscounts.find((x) => x.id === "22")?.id ||
            b.sabim.bodyLifeDiscounts[0]?.id ||
            "",
        );
        setOtherDiscount(
          b.sabim.bodyOtherDiscounts.find((x) => x.id === "3")?.id ||
            b.sabim.bodyOtherDiscounts[0]?.id ||
            "",
        );
        setBankDiscount(
          b.sabim.bodyBankDiscounts.find((x) => x.id === "10")?.id ||
            b.sabim.bodyBankDiscounts[0]?.id ||
            "",
        );
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason.message);
      });
    return () => controller.abort();
  }, []);

  const model = body?.models.find((item) => item.key === modelKey);
  const categoryChoices = useMemo(
    () =>
      unique(
        (body?.models || []).map((item) => ({
          key: item.category_key,
          label: item.category,
        })),
      ),
    [body],
  );
  const categoryModels = (body?.models || []).filter(
    (item) => item.category_key === category,
  );
  const brandChoices = unique(
    categoryModels.map((item) => ({ key: item.brand_key, label: item.brand })),
  );
  const brandModels = categoryModels
    .filter((item) => item.brand_key === brand)
    .sort((a, b) => a.model.localeCompare(b.model, "fa"));
  const selectedProvince = body?.provinces.find(
      (item) => String(item.id) === province,
    ),
    cities = selectedProvince?.cities || [];
  const selectedCity = cities.find((item) => String(item.id) === city),
    regions = selectedCity?.regions || [];
  const effectiveImported =
    imported === "catalog" ? !!model?.imported : imported === "true";
  function chooseModel(next: Model | undefined) {
    if (!next) return;
    setCategory(next.category_key);
    setBrand(next.brand_key);
    setModelKey(next.key);
    setUsage(next.usages[0]?.key || "");
    setOverrides({});
    setPreviews([]);
  }
  function changeCategory(key: string) {
    chooseModel((body?.models || []).find((item) => item.category_key === key));
  }
  function changeBrand(key: string) {
    chooseModel(categoryModels.find((item) => item.brand_key === key));
  }
  function setProviderModel(provider: Provider, key: string) {
    if (!key) {
      const next = { ...overrides };
      delete next[provider];
      setOverrides(next);
      return;
    }
    const source = body?.provider_models.find((item) => item.key === key);
    if (source)
      setOverrides({
        ...overrides,
        [provider]: { model_key: key, usage_key: source.usages[0]?.key || "" },
      });
  }
  const providerSource =
    overrides[activeProvider] &&
    body?.provider_models.find(
      (item) => item.key === overrides[activeProvider]?.model_key,
    );

  function payload() {
    const totalAccessories = accessories.reduce(
      (sum, item) => sum + item.value_toman,
      0,
    );
    return {
      product: "body_car",
      vehicle: {
        category_key: model?.category_key,
        brand_key: model?.brand_key,
        model_key: modelKey,
        usage_key: usage,
        production_year_jalali: year,
        production_month_jalali: month,
        imported: imported === "catalog" ? null : effectiveImported,
        fuel_type_key: fuel,
        construction_year_title: String(year),
      },
      provider_selections: overrides,
      zero_kilometer: zero,
      clearance_date_jalali: zero ? dateText(clearance) : null,
      previous_policy: {
        had_policy: hadPolicy,
        previous_insurer_key: hadPolicy ? previousInsurer : null,
        previous_expiry_date_jalali: hadPolicy ? dateText(expiry) : null,
        claim_free_years: hadPolicy ? claimYears : null,
        had_claim: hadPolicy && hadClaim,
        previous_war_coverage: hadPolicy && previousWar,
      },
      third_party_insurer_key: thirdInsurer,
      third_party_discount_percent: thirdDiscount,
      vehicle_value_toman: money(vehicleValue),
      accessories_value_toman: totalAccessories,
      accessories,
      province_key: province,
      city_key: city,
      region_key: region || null,
      selected_coverages: coverages,
      theft_parts_percent: theft ? Number(theft) : null,
      price_fluctuation_percent: fluctuation ? Number(fluctuation) : null,
      duration_months: 12,
      cash_discount: cash,
      sabim_life_discount_key: lifeDiscount || null,
      sabim_other_discount_key: otherDiscount || null,
      sabim_bank_discount_key: bankDiscount || null,
      azki_body_discount_id: azkiBodyDiscountId
        ? Number(azkiBodyDiscountId)
        : null,
      discount_code: coupon.trim() || null,
    };
  }
  const serialized = model ? JSON.stringify(payload()) : "";
  useEffect(() => {
    if (step !== 4 || !serialized) return;
    const controller = new AbortController();
    setPreviewLoading(true);
    setPreviews([]);
    const timer = setTimeout(
      () =>
        fetch("/api/search/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: serialized,
          signal: controller.signal,
        })
          .then(async (response) => {
            if (!response.ok)
              throw Error(
                "اطلاعات فرم بدنه معتبر نیست؛ مراحل قبل را بازبینی کن.",
              );
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
          }),
      180,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [serialized, step]);

  function validate(current = step) {
    if (current === 0) {
      if (!model || !usage)
        return "نوع، برند، مدل و کاربری خودرو را کامل انتخاب کن.";
      if (zero && !validDate(clearance))
        return "تاریخ ترخیص خودروی صفرکیلومتر را کامل کن.";
    }
    if (current === 1) {
      if (!thirdInsurer) return "شرکت بیمهٔ شخص ثالث را انتخاب کن.";
      if (hadPolicy && (!previousInsurer || !validDate(expiry)))
        return "شرکت و تاریخ انقضای بیمه بدنهٔ قبلی را کامل کن.";
      if (
        hadPolicy &&
        !["آسیا", "دانا"].includes(previousInsurer) &&
        !azkiBodyDiscountId
      )
        return "شناسهٔ تأییدشدهٔ تخفیف بدنهٔ ازکی را وارد کن.";
    }
    if (current === 2) {
      if (
        money(vehicleValue) < 50_000_000 ||
        money(vehicleValue) > 1_000_000_000_000
      )
        return "ارزش خودرو باید بین ۵۰ میلیون تا یک تریلیون تومان باشد.";
      if (!province || !city) return "استان و شهر را انتخاب کن.";
      if (
        accessories.some(
          (item) =>
            !item.category_key ||
            !item.item_keys.length ||
            item.value_toman <= 0,
        )
      )
        return "دسته، اقلام و ارزش همهٔ لوازم غیرفابریک را کامل کن.";
    }
    return "";
  }
  function next() {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setStep((value) => value + 1);
  }
  async function search() {
    if (previewLoading || !allReady) {
      setError(
        "نگاشت هر چهار منبع هنوز آماده نیست؛ زبانه‌های منبع را بازبینی کن.",
      );
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
        throw Error(
          response.status === 422
            ? "اطلاعات فرم بدنه معتبر نیست."
            : "اتصال به سرور برقرار نشد.",
        );
      onResult(await response.json());
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "استعلام ناموفق بود.",
      );
    } finally {
      setPending(false);
    }
  }
  const readyCount = previews.filter((item) => item.status === "ready").length,
    allReady = previews.length === 4 && readyCount === 4;
  const dateField = (
    label: string,
    value: string,
    setter: (value: string) => void,
  ) => (
    <label>
      {label}
      <input
        value={value}
        onChange={(event) => setter(event.target.value)}
        placeholder="۱۴۰۵/۰۷/۰۱"
        inputMode="numeric"
        dir="ltr"
        aria-invalid={!!value && !validDate(value)}
      />
      {value && !validDate(value) && (
        <small className="field-error">
          تاریخ را به‌شکل ۱۴۰۵/۰۷/۰۱ وارد کن.
        </small>
      )}
    </label>
  );
  function toggleAccessory(category: AccessoryCategory, enabled: boolean) {
    const key = String(category.id);
    if (enabled) {
      setAccessories((current) => [
        ...current.filter((item) => item.category_key !== key),
        { category_key: key, item_keys: [], value_toman: 0 },
      ]);
      setExpandedAccessories((current) => ({ ...current, [key]: true }));
    } else {
      setAccessories((current) =>
        current.filter((item) => item.category_key !== key),
      );
    }
  }
  function updateAccessory(categoryKey: string, change: Partial<Accessory>) {
    setAccessories((current) =>
      current.map((item) =>
        item.category_key === categoryKey ? { ...item, ...change } : item,
      ),
    );
  }

  return (
    <section className="wizard body-wizard" aria-label="فرم بیمه بدنه خودرو">
      <div className="wizard-top">
        <span>استعلام بیمه بدنهٔ خودرو</span>
        <span>گام {number(step + 1)} از ۵</span>
      </div>
      <div className="progress">
        <span style={{ width: `${(step + 1) * 20}%` }} />
      </div>
      <fieldset disabled={pending} className="wizard-fields">
        {step === 0 && (
          <div className="question">
            <span className="avatar">۱</span>
            <h2>مشخصات خودرو و نگاشت منابع</h2>
            <div className="answer">
              <ComboBox
                label="نوع خودرو"
                choices={categoryChoices}
                value={category}
                onChange={changeCategory}
                disabled={!body}
              />
              <ComboBox
                label="برند خودرو"
                choices={brandChoices}
                value={brand}
                onChange={changeBrand}
                disabled={!body}
              />
              <ComboBox
                label="مدل خودرو"
                choices={brandModels.map((item) => ({
                  key: item.key,
                  label: item.model,
                  detail: `پوشش ${number(item.source_count)} منبع`,
                }))}
                value={modelKey}
                onChange={(key) =>
                  chooseModel(brandModels.find((item) => item.key === key))
                }
                disabled={!body}
              />
              <label>
                کاربری
                <select
                  value={usage}
                  onChange={(event) => setUsage(event.target.value)}
                >
                  {model?.usages.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                سال ساخت
                <select
                  value={year}
                  onChange={(event) => setYear(Number(event.target.value))}
                >
                  {catalog?.production_years_jalali.map((item) => (
                    <option key={item} value={item}>
                      {number(item)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                ماه ساخت
                <select
                  value={month}
                  onChange={(event) => setMonth(Number(event.target.value))}
                >
                  {body?.months.map((item) => (
                    <option key={item} value={item}>
                      {number(item)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                نوع سوخت
                <select
                  value={fuel}
                  onChange={(event) => setFuel(event.target.value)}
                >
                  {catalog?.fuels.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                محل تولید
                <select
                  value={imported}
                  onChange={(event) =>
                    setImported(event.target.value as typeof imported)
                  }
                >
                  <option value="catalog">انتخاب خودکار</option>
                  <option value="false">داخلی</option>
                  <option value="true">وارداتی</option>
                </select>
              </label>
              <label>
                وضعیت خودرو
                <select
                  value={zero ? "new" : "used"}
                  onChange={(event) => setZero(event.target.value === "new")}
                >
                  <option value="used">کارکرده</option>
                  <option value="new">صفرکیلومتر</option>
                </select>
              </label>
              {zero && dateField("تاریخ ترخیص", clearance, setClearance)}
              <details className="provider-mapping optional-section full">
                <summary>
                  <span>
                    <b>تطبیق مدل در چهار منبع</b>
                    <small>
                      اختیاری؛ فقط اگر نگاشت خودکار نیاز به اصلاح دارد
                    </small>
                  </span>
                </summary>
                <div className="source-tabs" role="tablist">
                  {providers.map((provider) => (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeProvider === provider}
                      className={activeProvider === provider ? "active" : ""}
                      onClick={() => setActiveProvider(provider)}
                      key={provider}
                    >
                      {names[provider]}{" "}
                      <small>
                        {overrides[provider]
                          ? "اصلاح دستی"
                          : model?.providers.includes(provider)
                            ? "خودکار"
                            : "نیازمند انتخاب"}
                      </small>
                    </button>
                  ))}
                </div>
                <div className="source-panel">
                  <ComboBox
                    label={`مدل معادل در ${names[activeProvider]}`}
                    choices={[
                      { key: "", label: "نگاشت خودکار" },
                      ...(body?.provider_models
                        .filter((item) => item.provider === activeProvider)
                        .map((item) => ({
                          key: item.key,
                          label: item.label,
                          detail: `${item.category} · ${item.usages.map((x) => x.label).join("، ")}`,
                        })) || []),
                    ]}
                    value={overrides[activeProvider]?.model_key || ""}
                    onChange={(key) => setProviderModel(activeProvider, key)}
                  />
                  {providerSource && (
                    <label>
                      کاربری معادل
                      <select
                        value={overrides[activeProvider]?.usage_key || ""}
                        onChange={(event) =>
                          setOverrides({
                            ...overrides,
                            [activeProvider]: {
                              model_key: providerSource.key,
                              usage_key: event.target.value,
                            },
                          })
                        }
                      >
                        {providerSource.usages.map((item) => (
                          <option value={item.key} key={item.key}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              </details>
            </div>
          </div>
        )}
        {step === 1 && (
          <div className="question">
            <span className="avatar">۲</span>
            <h2>سوابق بیمه بدنه و شخص ثالث</h2>
            <div className="answer">
              <label>
                بیمه بدنهٔ قبلی دارد؟
                <select
                  value={hadPolicy ? "yes" : "no"}
                  onChange={(event) => {
                    const enabled = event.target.value === "yes";
                    setHadPolicy(enabled);
                    if (
                      enabled &&
                      !["آسیا", "دانا"].includes(previousInsurer)
                    ) {
                      setPreviousInsurer(
                        body?.insurers.find((item) => item.label === "آسیا")
                          ?.key || previousInsurer,
                      );
                    }
                  }}
                >
                  <option value="no">خیر</option>
                  <option value="yes">بله</option>
                </select>
              </label>
              {hadPolicy && (
                <>
                  <ComboBox
                    label="شرکت بیمه بدنهٔ قبلی"
                    choices={body?.insurers || []}
                    value={previousInsurer}
                    onChange={setPreviousInsurer}
                  />
                  {dateField("تاریخ انقضای بیمه بدنهٔ قبلی", expiry, setExpiry)}
                  <label>
                    سال‌های بدون خسارت
                    <select
                      value={claimYears}
                      onChange={(event) =>
                        setClaimYears(Number(event.target.value))
                      }
                    >
                      {body?.claim_free_years.map((item) => (
                        <option value={item} key={item}>
                          {item === 8 ? "بیش از ۷ سال" : `${number(item)} سال`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    از بیمه بدنه خسارت گرفته‌اید؟
                    <select
                      value={hadClaim ? "yes" : "no"}
                      onChange={(event) =>
                        setHadClaim(event.target.value === "yes")
                      }
                    >
                      <option value="no">خیر</option>
                      <option value="yes">بله</option>
                    </select>
                  </label>
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={previousWar}
                      onChange={(event) => setPreviousWar(event.target.checked)}
                    />
                    بیمه‌نامهٔ قبلی پوشش جنگ داشته است
                  </label>
                  <small className="field-note full">
                    کاتالوگ تخفیف بدنهٔ ازکی برای شرکت‌های آسیا و دانا در HTML
                    مرجع کامل است؛ انتخاب شرکت دیگر ممکن است فقط همان منبع را
                    نیازمند تطبیق کند.
                  </small>
                </>
              )}
              <ComboBox
                label="شرکت بیمه شخص ثالث فعلی"
                choices={body?.insurers || []}
                value={thirdInsurer}
                onChange={setThirdInsurer}
              />
              <label>
                درصد تخفیف شخص ثالث
                <select
                  value={thirdDiscount}
                  onChange={(event) =>
                    setThirdDiscount(Number(event.target.value))
                  }
                >
                  {body?.third_party_discounts.map((item) => (
                    <option value={item} key={item}>
                      {number(item)}٪
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="question">
            <span className="avatar">۳</span>
            <h2>ارزش، محل و لوازم غیرفابریک</h2>
            <div className="answer">
              <label>
                ارزش روز خودرو (تومان)
                <input
                  value={vehicleValue}
                  onChange={(event) =>
                    setVehicleValue(faDigits(event.target.value))
                  }
                  inputMode="numeric"
                  dir="ltr"
                />
                <small>{number(money(vehicleValue))} تومان</small>
              </label>
              <label>
                استان
                <select
                  value={province}
                  onChange={(event) => {
                    const key = event.target.value,
                      set = body?.provinces.find((x) => String(x.id) === key);
                    setProvince(key);
                    setCity(set?.cities?.[0] ? String(set.cities[0].id) : "");
                    setRegion("");
                  }}
                >
                  {body?.provinces.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                شهر
                <select
                  value={city}
                  onChange={(event) => {
                    setCity(event.target.value);
                    setRegion("");
                  }}
                >
                  {cities.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              {regions.length > 0 && (
                <label>
                  منطقه
                  <select
                    value={region}
                    onChange={(event) => setRegion(event.target.value)}
                  >
                    <option value="">بدون انتخاب</option>
                    {regions.map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="subform full">
                <div className="subform-title">
                  <div>
                    <h3>لوازم غیرفابریک</h3>
                    <p>هر دسته را جداگانه فعال کن و جزئیاتش را وارد کن.</p>
                  </div>
                  <span className="accessory-count">
                    {number(accessories.length)} دسته فعال
                  </span>
                </div>
                <div className="accessory-cards">
                  {body?.accessory_categories.map((category) => {
                    const key = String(category.id);
                    const accessory = accessories.find(
                      (item) => item.category_key === key,
                    );
                    const enabled = !!accessory;
                    const expanded = !!expandedAccessories[key];
                    return (
                      <article
                        className={`accessory-card${enabled ? " enabled" : ""}`}
                        key={category.id}
                      >
                        <div className="accessory-card-head">
                          <button
                            type="button"
                            className="accessory-collapse"
                            aria-expanded={expanded}
                            aria-controls={`accessory-${key}`}
                            onClick={() =>
                              setExpandedAccessories((current) => ({
                                ...current,
                                [key]: !expanded,
                              }))
                            }
                          >
                            <span className="accessory-icon">
                              <AccessoryIcon name={category.name} />
                            </span>
                            <span>
                              <b>{category.name}</b>
                              <small>{enabled ? "فعال" : "غیرفعال"}</small>
                            </span>
                            <i aria-hidden="true">⌄</i>
                          </button>
                          <label className="toggle-switch">
                            <input
                              type="checkbox"
                              checked={enabled}
                              onChange={(event) =>
                                toggleAccessory(category, event.target.checked)
                              }
                            />
                            <span aria-hidden="true" />
                            <em>{enabled ? "فعال" : "غیرفعال"}</em>
                          </label>
                        </div>
                        {expanded && (
                          <div
                            className="accessory-card-body"
                            id={`accessory-${key}`}
                          >
                            {!enabled ? (
                              <p className="empty-note">
                                برای ثبت اقلام و ارزش، این دسته را فعال کن.
                              </p>
                            ) : (
                              <>
                                <div className="accessory-items">
                                  <span className="field-label">اقلام</span>
                                  {category?.items.map((item) => (
                                    <label
                                      className="check-field"
                                      key={item.id}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={accessory.item_keys.includes(
                                          String(item.id),
                                        )}
                                        onChange={(event) =>
                                          updateAccessory(key, {
                                            item_keys: event.target.checked
                                              ? [
                                                  ...accessory.item_keys,
                                                  String(item.id),
                                                ]
                                              : accessory.item_keys.filter(
                                                  (itemKey) =>
                                                    itemKey !== String(item.id),
                                                ),
                                          })
                                        }
                                      />
                                      {item.name}
                                    </label>
                                  ))}
                                </div>
                                <label className="accessory-value">
                                  ارزش این دسته (تومان)
                                  <input
                                    type="number"
                                    min="1"
                                    value={accessory.value_toman || ""}
                                    onChange={(event) =>
                                      updateAccessory(key, {
                                        value_toman: Number(event.target.value),
                                      })
                                    }
                                  />
                                </label>
                              </>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
        {step === 3 && (
          <div className="question">
            <span className="avatar">۴</span>
            <h2>پوشش‌ها و گزینه‌های تکمیلی</h2>
            <div className="answer">
              <div className="coverage-grid full">
                {body?.coverages.map((item) => (
                  <label className="coverage-choice" key={item.key}>
                    <input
                      type="checkbox"
                      checked={coverages.includes(item.key)}
                      onChange={(event) =>
                        setCoverages(
                          event.target.checked
                            ? [...coverages, item.key]
                            : coverages.filter((key) => key !== item.key),
                        )
                      }
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
              <label>
                سرقت درجای قطعات
                <select
                  value={theft}
                  onChange={(event) => setTheft(event.target.value)}
                >
                  <option value="">بدون پوشش</option>
                  <option value="5">تا ۵٪ ارزش خودرو</option>
                  <option value="10">تا ۱۰٪</option>
                  <option value="20">تا ۲۰٪</option>
                </select>
              </label>
              <label>
                نوسان قیمت خودرو
                <select
                  value={fluctuation}
                  onChange={(event) => setFluctuation(event.target.value)}
                >
                  <option value="">بدون پوشش</option>
                  <option value="25">تا ۲۵٪</option>
                  <option value="50">تا ۵۰٪</option>
                  <option value="100">تا ۱۰۰٪</option>
                </select>
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={cash}
                  onChange={(event) => setCash(event.target.checked)}
                />
                اعمال تخفیف نقدی سابیم
              </label>
              <details className="optional-section full">
                <summary>گزینه‌های اختصاصی منابع (اختیاری)</summary>
                <div className="answer">
                  <label>
                    بیمه عمر سابیم
                    <select
                      value={lifeDiscount}
                      onChange={(event) => setLifeDiscount(event.target.value)}
                    >
                      {body?.sabim.bodyLifeDiscounts.map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    تخفیف متفرقه سابیم
                    <select
                      value={otherDiscount}
                      onChange={(event) => setOtherDiscount(event.target.value)}
                    >
                      {body?.sabim.bodyOtherDiscounts.map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    حساب بلندمدت سابیم
                    <select
                      value={bankDiscount}
                      onChange={(event) => setBankDiscount(event.target.value)}
                    >
                      {body?.sabim.bodyBankDiscounts.map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    کد تخفیف بیمه‌بازار
                    <input
                      value={coupon}
                      onChange={(event) => setCoupon(event.target.value)}
                      autoComplete="off"
                    />
                  </label>
                </div>
              </details>
            </div>
          </div>
        )}
        {step === 4 && (
          <div className="question">
            <span className="avatar">✓</span>
            <h2>مرور و دریافت پیشنهادها</h2>
            <div className="review">
              <span>
                <b>
                  {model?.category} · {model?.brand} · {model?.model} ·{" "}
                  {number(year)}/{number(month)}
                </b>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setStep(0)}
                >
                  ویرایش خودرو
                </button>
              </span>
              <span>
                <b>
                  {hadPolicy
                    ? `دارای بیمه بدنه قبلی · ${number(claimYears)} سال بدون خسارت`
                    : "فاقد بیمه بدنه قبلی"}{" "}
                  · تخفیف ثالث {number(thirdDiscount)}٪
                </b>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setStep(1)}
                >
                  ویرایش سوابق
                </button>
              </span>
              <span>
                <b>
                  {number(money(vehicleValue))} تومان · {selectedProvince?.name}
                  ، {selectedCity?.name} ·{" "}
                  {number(
                    coverages.length + (theft ? 1 : 0) + (fluctuation ? 1 : 0),
                  )}{" "}
                  پوشش
                </b>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setStep(2)}
                >
                  ویرایش جزئیات
                </button>
              </span>
            </div>
            <div className="preview-tabs">
              {providers.map((provider) => {
                const row = previews.find((item) => item.provider === provider);
                return (
                  <div
                    key={provider}
                    className={`preview-source ${row?.status || "loading"}`}
                  >
                    <b>{names[provider]}</b>
                    <span>
                      {previewLoading
                        ? "در حال ساخت درخواست…"
                        : row?.status === "ready"
                          ? "آمادهٔ ارسال"
                          : row?.status === "needs_input"
                            ? "اطلاعات ناقص"
                            : "نیازمند تطبیق مدل/گزینه‌ها"}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="preview-summary">
              {previewLoading
                ? "در حال آماده‌سازی چهار درخواست…"
                : allReady
                  ? "درخواست هر چهار منبع با قرارداد HTML آماده است."
                  : `${number(readyCount)} منبع از ۴ منبع آماده است.`}
            </p>
          </div>
        )}
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
        <div className="wizard-actions">
          {step > 0 && (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setError("");
                setStep((value) => value - 1);
              }}
            >
              مرحلهٔ قبل
            </button>
          )}
          {step < 4 ? (
            <button type="button" className="primary" onClick={next}>
              ادامه
            </button>
          ) : (
            <button
              type="button"
              className="primary"
              onClick={search}
              disabled={pending || previewLoading || !allReady}
            >
              {pending ? "در حال استعلام…" : "دریافت پیشنهادهای بدنه"}
            </button>
          )}
        </div>
        {step === 1 &&
          hadPolicy &&
          !["آسیا", "دانا"].includes(previousInsurer) && (
            <div className="manual-source-field">
              <label>
                شناسهٔ تأییدشدهٔ تخفیف بدنه در ازکی
                <input
                  type="number"
                  min="1"
                  value={azkiBodyDiscountId}
                  onChange={(event) =>
                    setAzkiBodyDiscountId(event.target.value)
                  }
                />
                <small>
                  HTML مرجع برای این شرکت کاتالوگ تخفیف نداشت؛ شناسهٔ تأییدشدهٔ
                  همان شرکت را وارد کن.
                </small>
              </label>
            </div>
          )}
      </fieldset>
    </section>
  );
}
