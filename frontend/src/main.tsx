import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';
import './search.css';

type Status = 'ok' | 'empty' | 'needs_input' | 'unmapped' | 'unavailable' | 'invalid_response' | 'unsupported';
type Offer = {insurer_name: string; provider: string; premium: {raw_amount: number; raw_unit: string; amount_toman: number | null}; financial_coverage_toman: number | null; duration_months: number | null; raw_offer: Record<string, unknown>};
type ProviderResult = {provider: string; status: Status; message: string | null; offers: Offer[]; raw_response: unknown};
type SearchResult = {request_id: string; fetched_at: string; providers: ProviderResult[]};
type Model = {key: string; label: string; category_key: string; brand_key: string; category: string; provider: string; usages: {key: string; label: string}[]};
type Catalog = {models: Model[]; insurers: {key: string; label: string}[]; durations: number[]; coverages_toman: number[]; production_years_jalali: number[]};
type History = 'no_previous_policy' | 'had_previous_policy' | 'new_vehicle';
const policyNames: Record<History,string> = {no_previous_policy:'بیمهٔ قبلی ندارد', had_previous_policy:'بیمهٔ قبلی دارد', new_vehicle:'خودروی نو'};
const persianDate = (raw: string) => raw.replace(/[۰-۹]/g, c => String(c.charCodeAt(0)-1776)).replace(/[٠-٩]/g,c => String(c.charCodeAt(0)-1632)).replace(/-/g,'/').trim();
const validPersianDate = (raw: string) => {
  const value = persianDate(raw);
  if (!/^14\d\d\/(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])$/.test(value)) return false;
  const [, month, day] = value.split('/').map(Number);
  return day <= (month <= 6 ? 31 : month <= 11 ? 30 : 30);
};
const names: Record<string, string> = {azki: 'ازکی', sabim: 'سابیم', bimebazar: 'بیمه‌بازار', bimeh: 'بیمه‌دات‌کام'};
const statusNames: Record<Status, string> = {ok: 'پیشنهاد دریافت شد', empty: 'پیشنهادی پیدا نشد', needs_input: 'به اطلاعات بیشتر نیاز دارد', unmapped: 'نگاشت تأیید نشده', unavailable: 'در دسترس نیست', invalid_response: 'پاسخ قابل پردازش نیست', unsupported: 'در این نسخه فعال نیست'};
const formatter = new Intl.NumberFormat('fa-IR');

function VehicleArt({kind}: {kind: 'car' | 'shield' | 'motor'}) {
  if (kind === 'shield') return <svg viewBox="0 0 190 120" aria-hidden="true"><path d="M95 10 152 30v33c0 27-19 43-57 53-38-10-57-26-57-53V30Z" fill="#e0f1e2" stroke="#138854" strokeWidth="4"/><path d="m69 61 18 18 35-38" fill="none" stroke="#138854" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/><path d="M31 89h-19m167 0h-19" stroke="#f64242" strokeWidth="4" strokeLinecap="round"/></svg>;
  if (kind === 'motor') return <svg viewBox="0 0 190 120" aria-hidden="true"><circle cx="42" cy="87" r="22" fill="#fff" stroke="#174632" strokeWidth="5"/><circle cx="145" cy="87" r="22" fill="#fff" stroke="#174632" strokeWidth="5"/><path d="m42 87 26-36 27 36H42m53 0 32-41 18 41-22-34H81m46-47h22l9 12" fill="none" stroke="#f64242" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"/><path d="M60 39h26" stroke="#174632" strokeWidth="7" strokeLinecap="round"/></svg>;
  return <svg viewBox="0 0 190 120" aria-hidden="true"><path d="M22 75 34 55h22l15-20h59l17 20h11l14 20v22H18V80Z" fill="#d9efe0" stroke="#174632" strokeWidth="4" strokeLinejoin="round"/><path d="M76 40h49l13 16H63Z" fill="#acd9c1"/><path d="M25 75h141" stroke="#174632" strokeWidth="3"/><circle cx="52" cy="95" r="13" fill="#174632" stroke="white" strokeWidth="4"/><circle cx="141" cy="95" r="13" fill="#174632" stroke="white" strokeWidth="4"/><path d="M22 73h14m121 0h15" stroke="#f64242" strokeWidth="7" strokeLinecap="round"/></svg>;
}

function RawPanel({provider, result}: {provider: ProviderResult; result: SearchResult}) {
  const [open, setOpen] = useState(false);
  if (provider.raw_response === null) return null;
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(provider.raw_response, null, 2)], {type:'application/json'}));
    const a = document.createElement('a'); a.href = url;
    a.download = `${provider.provider}-${result.request_id}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <details onToggle={e => setOpen(e.currentTarget.open)}><summary>{names[provider.provider]} · JSON کامل</summary>{open && <><button className="download" onClick={download}>دانلود JSON</button><pre dir="ltr">{JSON.stringify(provider.raw_response, null, 2)}</pre></>}</details>;
}

function App() {
  const [selected, setSelected] = useState(false);
  const [step, setStep] = useState(0);
  const [year, setYear] = useState(1404);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [modelKey, setModelKey] = useState('peugeot_pars');
  const [modelQuery, setModelQuery] = useState('');
  const [usageKey, setUsageKey] = useState('personal');
  const [status, setStatus] = useState<History>('no_previous_policy');
  const [insurer, setInsurer] = useState('');
  const [start, setStart] = useState('');
  const [expiry, setExpiry] = useState('');
  const [release, setRelease] = useState('');
  const [oldDuration, setOldDuration] = useState(12);
  const [thirdDiscount, setThirdDiscount] = useState(0);
  const [driverDiscount, setDriverDiscount] = useState(0);
  const [hadClaim, setHadClaim] = useState(false);
  const [claims, setClaims] = useState({property:0, bodily:0, driver:0});
  const [duration, setDuration] = useState(12);
  const [coverage, setCoverage] = useState(70000000);
  const [questionError, setQuestionError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/search/catalog', {signal: controller.signal})
      .then(r => {if (!r.ok) throw new Error('کاتالوگ خودرو در دسترس نیست'); return r.json() as Promise<Catalog>})
      .then(data => {
        if (!data.models.length || !data.production_years_jalali.length) throw new Error('کاتالوگ خودرو خالی است');
        setCatalog(data);
        if (!data.models.some(m => m.key === 'peugeot_pars')) {
          setModelKey(data.models[0].key); setUsageKey(data.models[0].usages[0]?.key || '');
        }
        setYear(data.production_years_jalali[0]);
      })
      .catch(e => {if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'خطا در دریافت کاتالوگ')});
    return () => controller.abort();
  }, []);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [all, setAll] = useState(false);
  useEffect(() => {if (result) document.querySelector('.results')?.scrollIntoView({behavior: 'smooth', block: 'start'});}, [result]);

  async function search() {
    if (!catalog) {setError('ابتدا کاتالوگ خودرو باید دریافت شود'); return;}
    const model = catalog.models.find(m => m.key === modelKey);
    if (!model) {setError('مدل انتخاب‌شده در کاتالوگ پیدا نشد'); return;}
    const issue = validate();
    if (issue) {setQuestionError(issue); setStep(status==='no_previous_policy'?0:1); return;}
    setPending(true); setResult(null); setError(''); setAll(false);
    const previous_policy = status === 'no_previous_policy' ? {status} : status === 'new_vehicle'
      ? {status, first_use_date_jalali: persianDate(release)}
      : {status, previous_insurer_key: insurer, previous_start_date_jalali: persianDate(start),
          previous_expiry_date_jalali: persianDate(expiry), previous_duration_months: oldDuration,
          no_claim_discount_percent: thirdDiscount, driver_discount_percent: driverDiscount,
          had_claim: hadClaim, property_claim_count: hadClaim ? claims.property : 0,
          bodily_claim_count: hadClaim ? claims.bodily : 0, driver_claim_count: hadClaim ? claims.driver : 0};
    try {
      const response = await fetch('/api/search', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({
        product: 'third_car', vehicle: {category_key: model.category_key, brand_key: model.brand_key,
          model_key: model.key, usage_key: usageKey, production_year_jalali: year},
        previous_policy, duration_months: duration, financial_coverage_toman: coverage,
      })});
      if (!response.ok) {
        if (response.status === 422) {setQuestionError('تاریخ شمسی یا اطلاعات بیمه معتبر نیست؛ تاریخ و گزینه‌های مرحلهٔ قبل را بررسی کن.');setStep(1);return;}
        throw new Error(`پاسخ سرور: HTTP ${response.status}`);
      }
      setResult(await response.json() as SearchResult);
    } catch (e) {setError(e instanceof Error ? e.message : 'اتصال به سرور برقرار نشد');}
    finally {setPending(false);}
  }

  const offers = result?.providers.flatMap(p => p.offers) || [];
  const selectedModel = catalog?.models.find(m => m.key === modelKey);
  const filteredModels = catalog?.models.filter(m => !modelQuery || `${m.label} ${m.category} ${m.provider}`.includes(modelQuery.trim())) || [];
  const availableModels = filteredModels.slice(0, 120);
  if (selectedModel && !availableModels.some(m => m.key === selectedModel.key)) availableModels.unshift(selectedModel);
  function validate() {
    if (!selectedModel || !selectedModel.usages.some(u => u.key === usageKey)) return 'مدل و کاربری معتبر انتخاب کن.';
    if (step === 0) return '';
    if (status === 'new_vehicle' && !validPersianDate(release)) return 'تاریخ ترخیص را به شکل معتبر ۱۴۰۴/۰۱/۰۱ وارد کن.';
    if (status === 'had_previous_policy') {
      if (!insurer) return 'شرکت بیمهٔ قبلی را انتخاب کن.';
      if (![start,expiry].every(validPersianDate)) return 'تاریخ آغاز و پایان را به شکل معتبر ۱۴۰۴/۰۱/۰۱ وارد کن.';
      if (persianDate(start) >= persianDate(expiry)) return 'تاریخ پایان باید پس از تاریخ آغاز باشد.';
      if (hadClaim && !Object.values(claims).some(n => n > 0)) return 'برای سابقهٔ خسارت، دست‌کم یک تعداد خسارت را انتخاب کن.';
    }
    return '';
  }
  function advance() { const issue = validate(); if (issue) {setQuestionError(issue); return;} setQuestionError(''); setStep(step+1); }
  return <div className="site">
    <header className="header wrap"><a href="/" className="identity" aria-label="ترب بیمه، صفحهٔ آغاز"><img src="/logo.png" alt="ترب بیمه" /><span>مقایسهٔ بیمه، با خیال روشن‌تر</span></a><span className="edition">نسخهٔ آزمایشی • استعلام زنده</span></header>
    <main className="wrap">
      <section className="hero"><div className="hero-copy"><span className="eyebrow">ساده شروع می‌شود، شفاف ادامه پیدا می‌کند</span><h1>بیمه‌ات را پیدا کن؛<br/><em>یک سؤال در هر قدم.</em></h1><p>مشخصات وسیله‌ات را یک بار می‌گویی. پیشنهادهای تازهٔ منابع مختلف را با جزئیات خودشان می‌بینی.</p><div className="hero-foot"><span className="dot"/> سه مسیر بیمه، یک تجربهٔ ساده</div></div><div className="hero-illustration" aria-hidden="true"><div className="sun"/><div className="road"/><div className="driving"><VehicleArt kind="car"/></div><div className="bubble">از انتخاب تا مقایسه ✦</div></div></section>
      <section className="journey" id="start"><div className="section-title"><div><span className="overline">قدم اول</span><h2>برای چی بیمه می‌خواهی؟</h2></div><p>نوع بیمه را انتخاب کن تا سؤال‌ها فقط دربارهٔ همان مسیر باشند.</p></div><div className="products">
        <button className={'product '+(selected?'selected':'')} onClick={() => {setSelected(true);setStep(0);setResult(null)}} aria-pressed={selected}><div className="art mint"><VehicleArt kind="car"/></div><div className="product-copy"><strong>شخص ثالث خودرو</strong><span>استعلام و مقایسهٔ پیشنهادها</span></div><b className="arrow">↖</b></button>
        <div className="product upcoming"><div className="art blush"><VehicleArt kind="shield"/></div><div className="product-copy"><strong>بدنهٔ خودرو</strong><span>در حال تکمیل نگاشت‌ها</span></div><span className="soon">گام بعد</span></div>
        <div className="product upcoming"><div className="art peach"><VehicleArt kind="motor"/></div><div className="product-copy"><strong>شخص ثالث موتور</strong><span>در حال تکمیل نگاشت‌ها</span></div><span className="soon">گام بعد</span></div>
      </div></section>
      {selected && <section className="wizard" aria-label="پرسش‌های استعلام"><div className="wizard-top"><span>گفت‌وگوی راهنما <small>• اطلاعات ساختاریافته</small></span><span>گام {formatter.format(step+1)} از ۳</span></div><div className="progress"><span style={{width: `${(step+1)/3*100}%`}}/></div>
        {step === 0 && <div className="question"><span className="avatar">؟</span><h2>ماشینت چه مدلی است؟</h2>
          <p>گزینه‌های چهار آزمایشگاه در یک فهرست آمده‌اند؛ کنار هر مدل منبع شناسه مشخص است.</p>
          <div className="answer"><label>جست‌وجوی مدل یا برند<input value={modelQuery} onChange={e => setModelQuery(e.target.value)} placeholder="مثلاً پژو پارس" /></label>
            <label>مدل خودرو<select value={modelKey} disabled={!catalog} onChange={e => {const found=catalog?.models.find(m=>m.key===e.target.value);setModelKey(e.target.value);setUsageKey(found?.usages[0]?.key || '');setResult(null)}}>
              {availableModels.map(m => <option key={m.key} value={m.key}>{m.label} · {m.category} · {names[m.provider] || m.provider}</option>)}
            </select></label><small>{formatter.format(filteredModels.length)} شناسه در فهرست · ۱۲۰ گزینهٔ اول نشان داده می‌شود؛ نام دقیق را جست‌وجو کن.</small>
            <label>کاربری<select value={usageKey} onChange={e=>setUsageKey(e.target.value)}>{selectedModel?.usages.map(u=><option key={u.key} value={u.key}>{u.label}</option>)}</select></label>
            <label>سال ساخت شمسی<select value={year} disabled={!catalog} onChange={e => setYear(Number(e.target.value))}>{catalog?.production_years_jalali.map(y => <option key={y} value={y}>{formatter.format(y)}</option>)}</select></label>
          </div><small className="explain">شناسهٔ مدل هر سایت فقط به همان سایت فرستاده می‌شود؛ مدل‌های تأییدنشده در سایت دیگر وضعیت «نگاشت تأیید نشده» می‌گیرند.</small></div>}
        {step === 1 && <div className="question"><span className="avatar">؟</span><h2>قبلاً بیمهٔ شخص ثالث داشته؟</h2>
          <div className="answer"><label>وضعیت بیمهٔ قبلی<select value={status} onChange={e=>{setStatus(e.target.value as History);setQuestionError('')}}>
            {Object.entries(policyNames).map(([key,value])=><option key={key} value={key}>{value}</option>)}
          </select></label>
          {status==='new_vehicle' && <label>تاریخ ترخیص شمسی<input value={release} onChange={e=>setRelease(e.target.value)} placeholder="۱۴۰۴/۰۱/۰۱" inputMode="numeric" /></label>}
          {status==='had_previous_policy' && <>
            <label>شرکت بیمهٔ قبلی<select value={insurer} onChange={e=>setInsurer(e.target.value)}><option value="">انتخاب کن</option>{catalog?.insurers.map(r=><option key={r.key} value={r.key}>{r.label}</option>)}</select></label>
            <label>شروع بیمهٔ قبلی (شمسی)<input value={start} onChange={e=>setStart(e.target.value)} placeholder="۱۴۰۳/۰۱/۰۱" inputMode="numeric" /></label>
            <label>پایان بیمهٔ قبلی (شمسی)<input value={expiry} onChange={e=>setExpiry(e.target.value)} placeholder="۱۴۰۴/۰۱/۰۱" inputMode="numeric" /></label>
            <label>مدت بیمهٔ قبلی<select value={oldDuration} onChange={e=>setOldDuration(Number(e.target.value))}>{catalog?.durations.map(n=><option key={n} value={n}>{formatter.format(n)} ماه</option>)}</select></label>
            <label>تخفیف عدم خسارت ثالث<select value={thirdDiscount} onChange={e=>setThirdDiscount(Number(e.target.value))}>{Array.from({length:16},(_,i)=>i*5).map(n=><option key={n} value={n}>{formatter.format(n)}٪</option>)}</select></label>
            <label>تخفیف راننده<select value={driverDiscount} onChange={e=>setDriverDiscount(Number(e.target.value))}>{Array.from({length:16},(_,i)=>i*5).map(n=><option key={n} value={n}>{formatter.format(n)}٪</option>)}</select></label>
            <label>سابقهٔ خسارت<select value={hadClaim?'yes':'no'} onChange={e=>setHadClaim(e.target.value==='yes')}><option value="no">خیر</option><option value="yes">بله</option></select></label>
            {hadClaim && (['property','bodily','driver'] as const).map((kind)=><label key={kind}>تعداد خسارت {({property:'مالی',bodily:'جانی',driver:'راننده'} as const)[kind]}
              <select value={claims[kind]} onChange={e=>setClaims({...claims,[kind]:Number(e.target.value)})}>{[0,1,2,3].map(n=><option key={n} value={n}>{n===3?'۳ بار یا بیشتر':formatter.format(n)}</option>)}</select>
            </label>)}
          </>}
          <label>مدت بیمهٔ درخواستی<select value={duration} onChange={e=>setDuration(Number(e.target.value))}>{catalog?.durations.map(n=><option key={n} value={n}>{formatter.format(n)} ماه</option>)}</select></label>
          <label>تعهد مالی (تومان)<select value={coverage} onChange={e=>setCoverage(Number(e.target.value))}>{catalog?.coverages_toman.map(n=><option key={n} value={n}>{formatter.format(n)} تومان</option>)}</select></label></div>
          <small className="explain">سابیم برای خودروی فاقد بیمه یا صفرکیلومتر تاریخ‌هایی می‌خواهد که مقدار معتبرشان در آزمایشگاه ثبت نشده است.</small></div>}
        {step === 2 && <div className="question"><span className="avatar">✓</span><h2>همه چیز درست است؟</h2><p>هر بخش را می‌توانی ویرایش کنی:</p>
          <div className="review"><span>وسیله <b>{selectedModel?.label || '—'} · {selectedModel?.usages.find(u=>u.key===usageKey)?.label} · {formatter.format(year)}</b><button className="secondary" onClick={()=>setStep(0)}>ویرایش</button></span>
            <span>بیمهٔ قبلی <b>{policyNames[status]}{status==='had_previous_policy'?` · ${insurer} · ${start} تا ${expiry}`:status==='new_vehicle'?` · ترخیص ${release}`:''}</b><button className="secondary" onClick={()=>setStep(1)}>ویرایش</button></span>
            {status==='had_previous_policy' && <span>سابقه <b>مدت {formatter.format(oldDuration)} ماه · تخفیف ثالث {formatter.format(thirdDiscount)}٪ · راننده {formatter.format(driverDiscount)}٪ · {hadClaim?`خسارت مالی ${claims.property}، جانی ${claims.bodily}، راننده ${claims.driver}`:'بدون خسارت'}</b><button className="secondary" onClick={()=>setStep(1)}>ویرایش</button></span>}
            <span>بیمهٔ درخواستی <b>{formatter.format(duration)} ماه · تعهد {formatter.format(coverage)} تومان</b><button className="secondary" onClick={()=>setStep(1)}>ویرایش</button></span></div>
          <p className="disclosure">داده‌ها برای استعلام به منابع بیمه ارسال می‌شوند. دریافت نتیجه ممکن است کمی طول بکشد.</p></div>}
        {questionError && <div className="alert" role="alert">{questionError}</div>}
        <div className="controls">{step>0 && <button className="secondary" onClick={() => {setStep(step-1);setQuestionError('')}}>بازگشت</button>}{step<2 ? <button className="primary" onClick={advance} disabled={!catalog}>ادامه ←</button> : <button className="primary" onClick={search} disabled={pending}>{pending?'در حال استعلام…':'دریافت پیشنهادهای تازه ←'}</button>}</div>
      </section>}
      {error && <div className="alert" role="alert">{error}</div>}
      {result && <section className="results" aria-live="polite"><div className="section-title"><div><span className="overline">نتیجهٔ استعلام</span><h2>پیشنهادها و وضعیت منابع</h2></div><span className="timestamp">دریافت: {new Date(result.fetched_at).toLocaleString('fa-IR')}</span></div><div className="providers">{result.providers.map(p => <div key={p.provider} className={'provider '+p.status}><b>{names[p.provider]}</b><span>{statusNames[p.status]}</span><small>{p.message || `${formatter.format(p.offers.length)} پیشنهاد`}</small></div>)}</div><div className="result-head"><h3>{formatter.format(offers.length)} پیشنهاد دریافت شد</h3><span>مبلغ خام API؛ واحد پول هنوز تأیید نشده و مرتب‌سازی قیمت غیرفعال است.</span></div>{offers.length ? <div className="offer-grid">{(all?offers:offers.slice(0,8)).map((o,i) => <article className="offer" key={`${o.provider}-${i}`}><span className="source">{names[o.provider]}</span><h4>{o.insurer_name}</h4><div className="price">{formatter.format(o.premium.raw_amount)} <small>واحد نامشخص</small></div><p>{o.duration_months ? `${formatter.format(o.duration_months)} ماه` : 'مدت در پیشنهاد تأیید نشده'} · {o.financial_coverage_toman ? `${formatter.format(o.financial_coverage_toman)} تومان تعهد مالی` : 'تعهد پیشنهاد تأیید نشده'}</p><details><summary>جزئیات خام این پیشنهاد</summary><pre dir="ltr">{JSON.stringify(o.raw_offer,null,2)}</pre></details></article>)}</div> : <p className="alert">هیچ پیشنهاد قابل‌نمایشی از منابع پاسخ‌دهنده دریافت نشد.</p>}{offers.length>8 && <button className="secondary more" onClick={() => setAll(!all)}>{all?'نمایش کمتر':`نمایش همهٔ ${formatter.format(offers.length)} پیشنهاد`}</button>}<div className="raw"><h3>پاسخ کامل منابع</h3><p>تمام فیلدهای پاسخ هر منبع در JSON آن حفظ شده‌اند.</p>{result.providers.map(p => <RawPanel key={p.provider} provider={p} result={result}/>)}</div></section>}
    </main><footer className="footer wrap"><span>ترب بیمه · نسخهٔ نمایشی</span><span>هر منبع، نتیجه و محدودیت خودش را دارد.</span></footer>
  </div>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
