import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';
import './search.css';
import {ThirdCarWizard} from './ThirdCarWizard';

type Status = 'ok' | 'empty' | 'needs_input' | 'unmapped' | 'unavailable' | 'invalid_response' | 'unsupported';
type Offer = {insurer_name: string; provider: string; premium: {raw_amount: number; raw_unit: string; amount_toman: number | null}; financial_coverage_toman: number | null; duration_months: number | null; raw_offer: Record<string, unknown>};
type ProviderResult = {provider: string; status: Status; message: string | null; offers: Offer[]; raw_response: unknown};
type SearchResult = {request_id: string; fetched_at: string; providers: ProviderResult[]};
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
  const [result, setResult] = useState<SearchResult | null>(null);
  const [all, setAll] = useState(false);
  useEffect(() => {if (result) document.querySelector('.results')?.scrollIntoView({behavior:'smooth',block:'start'});}, [result]);
  const offers = result?.providers.flatMap(p => p.offers) || [];
  return <div className="site">
    <header className="header wrap"><a href="/" className="identity" aria-label="ترب بیمه، صفحهٔ آغاز"><img src="/logo.png" alt="ترب بیمه" /><span>مقایسهٔ بیمه، با خیال روشن‌تر</span></a><span className="edition">نسخهٔ آزمایشی • استعلام زنده</span></header>
    <main className="wrap">
      <section className="hero"><div className="hero-copy"><span className="eyebrow">ساده شروع می‌شود، شفاف ادامه پیدا می‌کند</span><h1>بیمه‌ات را پیدا کن؛<br/><em>یک سؤال در هر قدم.</em></h1><p>مشخصات وسیله‌ات را یک بار می‌گویی. پیشنهادهای تازهٔ منابع مختلف را با جزئیات خودشان می‌بینی.</p><div className="hero-foot"><span className="dot"/> سه مسیر بیمه، یک تجربهٔ ساده</div></div><div className="hero-illustration" aria-hidden="true"><div className="sun"/><div className="road"/><div className="driving"><VehicleArt kind="car"/></div><div className="bubble">از انتخاب تا مقایسه ✦</div></div></section>
      <section className="journey" id="start"><div className="section-title"><div><span className="overline">قدم اول</span><h2>برای چی بیمه می‌خواهی؟</h2></div><p>نوع بیمه را انتخاب کن تا سؤال‌ها فقط دربارهٔ همان مسیر باشند.</p></div><div className="products">
        <button className={'product '+(selected?'selected':'')} onClick={() => {setSelected(true);setResult(null)}} aria-pressed={selected}><div className="art mint"><VehicleArt kind="car"/></div><div className="product-copy"><strong>شخص ثالث خودرو</strong><span>استعلام و مقایسهٔ پیشنهادها</span></div><b className="arrow">↖</b></button>
        <div className="product upcoming"><div className="art blush"><VehicleArt kind="shield"/></div><div className="product-copy"><strong>بدنهٔ خودرو</strong><span>در حال تکمیل نگاشت‌ها</span></div><span className="soon">گام بعد</span></div>
        <div className="product upcoming"><div className="art peach"><VehicleArt kind="motor"/></div><div className="product-copy"><strong>شخص ثالث موتور</strong><span>در حال تکمیل نگاشت‌ها</span></div><span className="soon">گام بعد</span></div>
      </div></section>
      {selected && <ThirdCarWizard onStart={()=>setResult(null)} onResult={r=>{setResult(r);setAll(false)}}/>}
      {result && <section className="results" aria-live="polite"><div className="section-title"><div><span className="overline">نتیجهٔ استعلام</span><h2>پیشنهادها و وضعیت منابع</h2></div><span className="timestamp">دریافت: {new Date(result.fetched_at).toLocaleString('fa-IR')}</span></div><div className="providers">{result.providers.map(p => <div key={p.provider} className={'provider '+p.status}><b>{names[p.provider]}</b><span>{statusNames[p.status]}</span><small>{p.message || `${formatter.format(p.offers.length)} پیشنهاد`}</small></div>)}</div><div className="result-head"><h3>{formatter.format(offers.length)} پیشنهاد دریافت شد</h3><span>مبلغ خام API؛ واحد پول هنوز تأیید نشده و مرتب‌سازی قیمت غیرفعال است.</span></div>{offers.length ? <div className="offer-grid">{(all?offers:offers.slice(0,8)).map((o,i) => <article className="offer" key={`${o.provider}-${i}`}><span className="source">{names[o.provider]}</span><h4>{o.insurer_name}</h4><div className="price">{formatter.format(o.premium.raw_amount)} <small>واحد نامشخص</small></div><p>{o.duration_months ? `${formatter.format(o.duration_months)} ماه` : 'مدت در پیشنهاد تأیید نشده'} · {o.financial_coverage_toman ? `${formatter.format(o.financial_coverage_toman)} تومان تعهد مالی` : 'تعهد پیشنهاد تأیید نشده'}</p><details><summary>جزئیات خام این پیشنهاد</summary><pre dir="ltr">{JSON.stringify(o.raw_offer,null,2)}</pre></details></article>)}</div> : <p className="alert">هیچ پیشنهاد قابل‌نمایشی از منابع پاسخ‌دهنده دریافت نشد.</p>}{offers.length>8 && <button className="secondary more" onClick={() => setAll(!all)}>{all?'نمایش کمتر':`نمایش همهٔ ${formatter.format(offers.length)} پیشنهاد`}</button>}<div className="raw"><h3>پاسخ کامل منابع</h3><p>تمام فیلدهای پاسخ هر منبع در JSON آن حفظ شده‌اند.</p>{result.providers.map(p => <RawPanel key={p.provider} provider={p} result={result}/>)}</div></section>}
    </main><footer className="footer wrap"><span>ترب بیمه · نسخهٔ نمایشی</span><span>هر منبع، نتیجه و محدودیت خودش را دارد.</span></footer>
  </div>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
