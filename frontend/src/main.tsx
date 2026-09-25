import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';
import './search.css';
import {ThirdCarWizard} from './ThirdCarWizard';
import type {InstallmentPlan, Metrics, MoneyDetail, Offer, SearchResult, Status} from './searchTypes';

const names: Record<string, string> = {azki: 'ازکی', sabim: 'سابیم', bimebazar: 'بیمه‌بازار', bimeh: 'بیمه‌دات‌کام'};
const statusNames: Record<Status, string> = {ok: 'پیشنهاد دریافت شد', empty: 'پیشنهادی پیدا نشد', needs_input: 'به اطلاعات بیشتری نیاز دارد', unmapped: 'برای این خودرو در دسترس نیست', unavailable: 'در دسترس نیست', invalid_response: 'پاسخ قابل پردازش نیست', unsupported: 'در حال حاضر فعال نیست'};
const formatter = new Intl.NumberFormat('fa-IR');
const formatDate=(value:string|null)=>{if(!value)return'بدون تاریخ';const parsed=new Date(value);return Number.isNaN(parsed.getTime())?value:parsed.toLocaleDateString('fa-IR')};

function MoneyRows({items}:{items:MoneyDetail[]}){return <div className="detail-list">{items.map(item=><span key={item.label}><b>{item.label}</b><em>{formatter.format(item.amount_toman)} تومان</em></span>)}</div>}

function InstallmentDetails({plans}:{plans:InstallmentPlan[]}){
  if(!plans.length)return null;
  return <section className="installment-section"><h5>برنامه‌های اقساط</h5>{plans.map((plan,index)=><div className="installment-plan" key={`${plan.title}-${index}`}><div className="plan-head"><b>{plan.title}</b>{plan.is_credit!==null&&<span>{plan.is_credit?'اعتباری':'غیراعتباری'}</span>}</div><div className="plan-facts"><span>تعداد اقساط<b>{formatter.format(plan.installment_count)}</b></span>{plan.down_payment_toman!==null&&<span>پیش‌پرداخت<b>{formatter.format(plan.down_payment_toman)} تومان</b></span>}{plan.total_payable_toman!==null&&<span>جمع پرداختی<b>{formatter.format(plan.total_payable_toman)} تومان</b></span>}{plan.operation_cost_toman!==null&&<span>هزینهٔ عملیات<b>{formatter.format(plan.operation_cost_toman)} تومان</b></span>}</div>{plan.operation_cost_in_installments!==null&&<small className="plan-note">هزینهٔ عملیات {plan.operation_cost_in_installments?'داخل اقساط تقسیم شده است.':'جداگانه دریافت می‌شود.'}</small>}<div className="payments"><div className="payment-row payment-head"><span>پرداخت</span><span>سررسید</span><span>مبلغ</span></div>{plan.payments.map(payment=><div className="payment-row" key={`${payment.sequence}-${payment.due_date}`}><span>{payment.is_down_payment?'پیش‌پرداخت':`قسط ${formatter.format(payment.months_after_purchase??payment.sequence)}`}</span><span>{formatDate(payment.due_date)}</span><b>{formatter.format(payment.amount_toman)} تومان</b></div>)}</div></div>)}</section>;
}

function OfferDetails({offer}:{offer:Offer}){
  const metrics=offer.insurer_metrics;
  const metricItems:[string,number|string][]=[];
  if(metrics?.satisfaction!==null&&metrics?.satisfaction!==undefined)metricItems.push(['رضایت مشتریان',formatter.format(metrics.satisfaction)]);
  if(metrics?.financial_strength!==null&&metrics?.financial_strength!==undefined)metricItems.push(['توانگری مالی',formatter.format(metrics.financial_strength)]);
  if(metrics?.solvency_level!==null&&metrics?.solvency_level!==undefined)metricItems.push(['سطح توانگری',formatter.format(metrics.solvency_level)]);
  if(metrics?.market_share_percent!==null&&metrics?.market_share_percent!==undefined)metricItems.push(['سهم بازار',`${formatter.format(metrics.market_share_percent)}٪`]);
  if(metrics?.branches_count!==null&&metrics?.branches_count!==undefined)metricItems.push(['تعداد شعب',formatter.format(metrics.branches_count)]);
  if(metrics?.claim_centers_count!==null&&metrics?.claim_centers_count!==undefined)metricItems.push(['مراکز خسارت',formatter.format(metrics.claim_centers_count)]);
  if(metrics?.complaint_response_time!==null&&metrics?.complaint_response_time!==undefined)metricItems.push(['شاخص زمان پاسخ',formatter.format(metrics.complaint_response_time)]);
  if(metrics?.mobile_compensation!==null&&metrics?.mobile_compensation!==undefined)metricItems.push(['خسارت سیار',metrics.mobile_compensation?'دارد':'ندارد']);
  if(metrics?.online_claims!==null&&metrics?.online_claims!==undefined)metricItems.push(['خسارت آنلاین',metrics.online_claims?'دارد':'ندارد']);
  if(metrics?.online_issue!==null&&metrics?.online_issue!==undefined)metricItems.push(['صدور آنلاین',metrics.online_issue?'دارد':'ندارد']);
  const hasDetails=offer.installment_plans.length>0||offer.payment_methods.length>0||!!offer.penalty||offer.price_breakdown.length>0||offer.discount_breakdown.length>0||metricItems.length>0||offer.benefits.length>0||offer.badges.length>0||offer.is_recommended===true||offer.sale_rank!==null;
  if(!hasDetails)return null;
  return <details className="offer-details"><summary>جزئیات پیشنهاد و پرداخت</summary><div className="details-body">{offer.payment_methods.length>0&&<section><h5>روش‌های پرداخت</h5><div className="text-chips">{offer.payment_methods.map(item=><span key={item}>{item}</span>)}</div></section>}<InstallmentDetails plans={offer.installment_plans}/>{offer.penalty&&<section><h5>دیرکرد و جریمه</h5><div className="detail-list">{offer.penalty.days!==null&&<span><b>روزهای دیرکرد</b><em>{formatter.format(offer.penalty.days)}</em></span>}{offer.penalty.daily_toman!==null&&<span><b>جریمهٔ روزانه</b><em>{formatter.format(offer.penalty.daily_toman)} تومان</em></span>}{offer.penalty.total_toman!==null&&<span><b>مجموع جریمه</b><em>{formatter.format(offer.penalty.total_toman)} تومان</em></span>}{offer.penalty.forgiven===true&&<span><b>بخشودگی</b><em>فعال</em></span>}</div>{offer.penalty.description&&<p className="detail-note">{offer.penalty.description}</p>}</section>}{offer.price_breakdown.length>0&&<section><h5>اجزای قیمت</h5><MoneyRows items={offer.price_breakdown}/></section>}{offer.discount_breakdown.length>0&&<section><h5>جزئیات تخفیف</h5><MoneyRows items={offer.discount_breakdown}/></section>}{metricItems.length>0&&<section><h5>وضعیت شرکت بیمه</h5><div className="detail-list">{metricItems.map(([label,value])=><span key={label}><b>{label}</b><em>{value}</em></span>)}</div></section>}{(offer.badges.length>0||offer.benefits.length>0||offer.is_recommended===true||offer.sale_rank!==null)&&<section><h5>مزایا و نشان‌ها</h5><div className="text-chips">{offer.is_recommended===true&&<span>پیشنهاد منتخب</span>}{offer.sale_rank!==null&&<span>رتبهٔ فروش {formatter.format(offer.sale_rank)}</span>}{[...new Set([...offer.badges,...offer.benefits])].map(item=><span key={item}>{item}</span>)}</div></section>}</div></details>;
}

function OfferCard({offer,index}:{offer:Offer;index:number}){return <article className="offer" key={`${offer.provider}-${index}`}><span className="source">{names[offer.provider]}</span><h4>{offer.insurer_name}</h4>{offer.price_before_discount_toman&&<del className="old-price">{formatter.format(offer.price_before_discount_toman)} تومان</del>}<div className="price">{formatter.format(offer.premium.amount_toman??0)} <small>تومان</small></div><div className="offer-badges">{offer.discount_amount_toman&&<span>تخفیف {formatter.format(offer.discount_amount_toman)} تومان{offer.discount_percent?` (${formatter.format(offer.discount_percent)}٪)`:''}</span>}{offer.has_installments&&<span>خرید اقساطی</span>}{offer.installment_plans.length>0&&<span>{formatter.format(offer.installment_plans.length)} برنامهٔ پرداخت</span>}</div><p>{offer.duration_months ? `${formatter.format(offer.duration_months)} ماه` : 'مدت اعلام نشده'} · {offer.financial_coverage_toman ? `${formatter.format(offer.financial_coverage_toman)} تومان تعهد مالی` : 'تعهد اعلام نشده'}</p><OfferDetails offer={offer}/></article>}

function VehicleArt({kind}: {kind: 'car' | 'shield' | 'motor'}) {
  if (kind === 'shield') return <svg viewBox="0 0 190 120" aria-hidden="true"><path d="M95 10 152 30v33c0 27-19 43-57 53-38-10-57-26-57-53V30Z" fill="#e0f1e2" stroke="#138854" strokeWidth="4"/><path d="m69 61 18 18 35-38" fill="none" stroke="#138854" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/><path d="M31 89h-19m167 0h-19" stroke="#f64242" strokeWidth="4" strokeLinecap="round"/></svg>;
  if (kind === 'motor') return <svg viewBox="0 0 190 120" aria-hidden="true"><circle cx="42" cy="87" r="22" fill="#fff" stroke="#174632" strokeWidth="5"/><circle cx="145" cy="87" r="22" fill="#fff" stroke="#174632" strokeWidth="5"/><path d="m42 87 26-36 27 36H42m53 0 32-41 18 41-22-34H81m46-47h22l9 12" fill="none" stroke="#f64242" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"/><path d="M60 39h26" stroke="#174632" strokeWidth="7" strokeLinecap="round"/></svg>;
  return <svg viewBox="0 0 190 120" aria-hidden="true"><path d="M22 75 34 55h22l15-20h59l17 20h11l14 20v22H18V80Z" fill="#d9efe0" stroke="#174632" strokeWidth="4" strokeLinejoin="round"/><path d="M76 40h49l13 16H63Z" fill="#acd9c1"/><path d="M25 75h141" stroke="#174632" strokeWidth="3"/><circle cx="52" cy="95" r="13" fill="#174632" stroke="white" strokeWidth="4"/><circle cx="141" cy="95" r="13" fill="#174632" stroke="white" strokeWidth="4"/><path d="M22 73h14m121 0h15" stroke="#f64242" strokeWidth="7" strokeLinecap="round"/></svg>;
}

function App() {
  const [selected, setSelected] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [all, setAll] = useState(false);
  useEffect(() => {if (result) document.querySelector('.results')?.scrollIntoView({behavior:'smooth',block:'start'});}, [result]);
  const offers = (result?.providers.flatMap(p => p.offers) || []).sort((a,b)=>(a.premium.amount_toman??Infinity)-(b.premium.amount_toman??Infinity));
  return <div className="site">
    <header className="header wrap"><a href="/" className="identity" aria-label="ترب بیمه، صفحهٔ آغاز"><img src="/logo.png" alt="ترب بیمه" /><span>مقایسهٔ بیمه، با خیال روشن‌تر</span></a><span className="edition">استعلام و مقایسهٔ آنلاین</span></header>
    <main className="wrap">
      <section className="hero"><div className="hero-copy"><span className="eyebrow">ساده شروع می‌شود، شفاف ادامه پیدا می‌کند</span><h1>بیمه‌ات را پیدا کن؛<br/><em>یک سؤال در هر قدم.</em></h1><p>مشخصات وسیله‌ات را یک بار می‌گویی. پیشنهادهای تازهٔ منابع مختلف را با جزئیات خودشان می‌بینی.</p><div className="hero-foot"><span className="dot"/> سه مسیر بیمه، یک تجربهٔ ساده</div></div><div className="hero-illustration" aria-hidden="true"><div className="sun"/><div className="road"/><div className="driving"><VehicleArt kind="car"/></div><div className="bubble">از انتخاب تا مقایسه ✦</div></div></section>
      <section className="journey" id="start"><div className="section-title"><div><span className="overline">قدم اول</span><h2>برای چی بیمه می‌خواهی؟</h2></div><p>نوع بیمه را انتخاب کن تا سؤال‌ها فقط دربارهٔ همان مسیر باشند.</p></div><div className="products">
        <button className={'product '+(selected?'selected':'')} onClick={() => {setSelected(true);setResult(null)}} aria-pressed={selected}><div className="art mint"><VehicleArt kind="car"/></div><div className="product-copy"><strong>شخص ثالث خودرو</strong><span>استعلام و مقایسهٔ پیشنهادها</span></div><b className="arrow">↖</b></button>
        <div className="product upcoming"><div className="art blush"><VehicleArt kind="shield"/></div><div className="product-copy"><strong>بدنهٔ خودرو</strong><span>به‌زودی</span></div><span className="soon">گام بعد</span></div>
        <div className="product upcoming"><div className="art peach"><VehicleArt kind="motor"/></div><div className="product-copy"><strong>شخص ثالث موتور</strong><span>به‌زودی</span></div><span className="soon">گام بعد</span></div>
      </div></section>
      {selected && <ThirdCarWizard onStart={()=>setResult(null)} onResult={r=>{setResult(r);setAll(false)}}/>}
      {result && <section className="results" aria-live="polite"><div className="section-title"><div><span className="overline">نتیجهٔ استعلام</span><h2>پیشنهادها و وضعیت منابع</h2></div><span className="timestamp">دریافت: {new Date(result.fetched_at).toLocaleString('fa-IR')}</span></div><div className="providers">{result.providers.map(p => <div key={p.provider} className={'provider '+p.status}><b>{names[p.provider]}</b><span>{statusNames[p.status]}</span><small>{p.message || `${formatter.format(p.offers.length)} پیشنهاد`}</small></div>)}</div><div className="result-head"><h3>{formatter.format(offers.length)} پیشنهاد دریافت شد</h3><span>همهٔ قیمت‌ها به تومان و از کمترین مبلغ مرتب شده‌اند.</span></div>{offers.length ? <div className="offer-grid">{(all?offers:offers.slice(0,8)).map((offer,index) => <OfferCard offer={offer} index={index} key={`${offer.provider}-${index}`}/>)}</div> : <p className="alert">هیچ پیشنهاد قابل‌نمایشی از منابع پاسخ‌دهنده دریافت نشد.</p>}{offers.length>8 && <button className="secondary more" onClick={() => setAll(!all)}>{all?'نمایش کمتر':`نمایش همهٔ ${formatter.format(offers.length)} پیشنهاد`}</button>}</section>}
    </main><footer className="footer wrap"><span>ترب بیمه</span><span>استعلام چند منبع، در یک فرم ساده</span></footer>
  </div>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
