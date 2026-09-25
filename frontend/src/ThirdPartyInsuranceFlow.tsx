import {useEffect, useMemo, useState, type ReactNode} from 'react';
import {AnimatePresence, motion} from 'framer-motion';
import type {SearchResult} from './searchTypes';
import './third-party-insurance.css';

const art1=new URL('./assest/insurance/bimeh_shakhs_1.png',import.meta.url).href;
const art2=new URL('./assest/insurance/bimeh_shakhs_2.png',import.meta.url).href;
const art3=new URL('./assest/insurance/bimeh_shakhs_3.png',import.meta.url).href;
const art4=new URL('./assest/insurance/bimeh_shakhs_4.png',import.meta.url).href;

type Step=1|2|3|4;
type IconName='car'|'calendar'|'user'|'tool'|'document'|'check'|'building'|'coins'|'chevron'|'arrow';
type Catalog={models:Array<{key:string;category:string;brand:string;model:string;category_key:string;brand_key:string;usages:Array<{key:string;label:string}>}>;insurers:Array<{key:string;label:string}>;production_years_jalali:number[];durations:number[];coverages_toman:number[]};
const fa=(value:number)=>value.toLocaleString('fa-IR');
const icons:Record<IconName,ReactNode>={
  car:<><path d="M5 11l1.5-4h11l1.5 4M4 11h16v6H4z"/><circle cx="7" cy="17" r="1.5"/><circle cx="17" cy="17" r="1.5"/></>,
  calendar:<><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4m8-4v4M4 10h16M8 14h.01m4 0h.01m4 0h.01m-8 3h.01m4 0h.01"/></>,
  user:<><circle cx="12" cy="8" r="4"/><path d="M5 21c.5-5 2.8-7 7-7s6.5 2 7 7"/></>,
  tool:<><path d="M14 6a4 4 0 01-5 5L4 16l4 4 5-5a4 4 0 005-5l-3 2-3-3z"/></>,
  document:<><path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h6m-6 4h6"/></>,
  check:<path d="M5 12l4 4L19 6"/>, building:<><path d="M5 21V5h14v16M9 9h2m2 0h2m-6 4h2m2 0h2m-6 4h2m2 0h2M3 21h18"/></>,
  coins:<><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v5c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 11v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/></>,
  chevron:<path d="M7 10l5 5 5-5"/>,arrow:<path d="M19 12H5m6-6l-6 6 6 6"/>
};
function Icon({name}:{name:IconName}){return <svg viewBox="0 0 24 24" aria-hidden="true">{icons[name]}</svg>}

export function InsuranceStepper({step}:{step:Step}){return <div className="insurance-progress" aria-label={`گام ${fa(step)} از ۴`}><span style={{width:`${step*25}%`}}/></div>}
export function InsuranceCard({step,children}:{step:Step;children:ReactNode}){return <section className="insurance-card" aria-label="فرم بیمه شخص ثالث خودرو"><header><strong>استعلام شخص ثالث خودرو</strong><span>گام {fa(step)} از ۴</span></header><InsuranceStepper step={step}/>{children}</section>}
export function FormInput({label,value,icon='document',options,onChange}:{label:string;value:string;icon?:IconName;options?:Array<[string,string]>;onChange?:(value:string)=>void}){return <label className="insurance-field"><span>{label}</span><div><i><Icon name={icon}/></i>{options?<select value={value} onChange={e=>onChange?.(e.target.value)}>{options.map(([key,text])=><option key={key} value={key}>{text}</option>)}</select>:<input value={value} onChange={e=>onChange?.(e.target.value)} />}<b><Icon name="chevron"/></b></div></label>}
export const IconInput=FormInput;
export function IllustrationPanel({step}:{step:Step}){const images=[art1,art2,art3,art4];return <motion.aside className="insurance-art" animate={{y:[0,-6,0]}} transition={{duration:5,repeat:Infinity,ease:'easeInOut'}}><img src={images[step-1]} alt="تصویرسازی بیمه شخص ثالث خودرو"/></motion.aside>}
export function NavigationButtons({step,onBack,onNext,busy}:{step:Step;onBack:()=>void;onNext:()=>void;busy?:boolean}){return <div className="insurance-actions">{step>1&&<motion.button whileHover={{y:-2}} type="button" className="insurance-back" onClick={onBack}>مرحله قبل</motion.button>}<motion.button whileHover={{y:-2}} type="button" className="insurance-next" onClick={onNext} disabled={busy}>{step===4?(busy?'در حال استعلام…':'دریافت پیشنهادها'):<><span>ادامه</span><Icon name="arrow"/></>}</motion.button></div>}
export function SummaryItem({children,onEdit,label}:{children:ReactNode;onEdit:()=>void;label:string}){return <div className="summary-item"><span>{children}</span><button type="button" onClick={onEdit}>{label}</button></div>}

export function ThirdPartyInsuranceFlow({onResult,onStart}:{onResult:(result:SearchResult)=>void;onStart:()=>void}){
  const [step,setStep]=useState<Step>(1),[catalog,setCatalog]=useState<Catalog|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [category,setCategory]=useState('passenger'),[brand,setBrand]=useState('peugeot'),[model,setModel]=useState('peugeot_pars'),[usage,setUsage]=useState('personal'),[year,setYear]=useState('1405');
  const [policy,setPolicy]=useState('no_previous_policy'),[duration,setDuration]=useState('12'),[coverage,setCoverage]=useState('70000000'),[company,setCompany]=useState(''),[start,setStart]=useState('۱۴۰۴/۰۱/۰۱'),[end,setEnd]=useState('۱۴۰۴/۰۱/۰۱');
  useEffect(()=>{const controller=new AbortController();fetch('/api/search/catalog',{signal:controller.signal}).then(r=>r.ok?r.json():Promise.reject()).then((data:Catalog)=>{setCatalog(data);const pars=data.models.find(x=>x.key==='peugeot_pars')||data.models[0];if(pars){setCategory(pars.category_key);setBrand(pars.brand_key);setModel(pars.key);setUsage(pars.usages[0]?.key||'personal')}if(data.production_years_jalali[0])setYear(String(data.production_years_jalali[0]))}).catch(()=>{});return()=>controller.abort()},[]);
  const chosen=catalog?.models.find(x=>x.key===model), categories=useMemo(()=>[...new Map((catalog?.models||[]).map(x=>[x.category_key,x.category])).entries()],[catalog]);
  const brands=useMemo(()=>[...new Map((catalog?.models||[]).filter(x=>x.category_key===category).map(x=>[x.brand_key,x.brand])).entries()],[catalog,category]);
  const models=(catalog?.models||[]).filter(x=>x.category_key===category&&x.brand_key===brand);
  const payload={product:'third_car',vehicle:{category_key:category,brand_key:brand,model_key:model,usage_key:usage,production_year_jalali:Number(year)},previous_policy:{status:policy},duration_months:Number(duration),financial_coverage_toman:Number(coverage),sabim_history:company?{insurer_key:company,start_date_jalali:'1404/01/01',expiry_date_jalali:'1404/01/01'}:null};
  async function finish(){setBusy(true);setError('');onStart();try{const response=await fetch('/api/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});if(!response.ok)throw Error('اتصال به سرور برقرار نشد.');onResult(await response.json())}catch(reason){setError(reason instanceof Error?reason.message:'استعلام ناموفق بود.')}finally{setBusy(false)}}
  const go=(next:Step)=>{setError('');setStep(next)};
  return <InsuranceCard step={step}><AnimatePresence mode="wait"><motion.div key={step} className="insurance-stage" initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-12}} transition={{duration:.4}}><IllustrationPanel step={step}/><main className="insurance-content"><div className={`step-badge ${step===4?'done':''}`}>{step===4?<Icon name="check"/>:fa(step)}</div>
    {step===1&&<><h2>مشخصات خودرو</h2><p>اطلاعات خودروی خود را وارد کنید تا بیمه مناسب شما پیشنهاد شود.</p><div className="insurance-grid"><FormInput label="نوع خودرو" value={category} icon="car" options={categories.length?categories:[['passenger','سواری']]} onChange={setCategory}/><FormInput label="برند خودرو" value={brand} icon="tool" options={brands.length?brands:[['peugeot','پژو']]} onChange={setBrand}/><FormInput label="مدل خودرو" value={model} icon="calendar" options={models.length?models.map(x=>[x.key,x.model]):[['peugeot_pars','پارس']]} onChange={setModel}/><FormInput label="کاربری" value={usage} icon="user" options={chosen?.usages.map(x=>[x.key,x.label])||[['personal','شخصی']]} onChange={setUsage}/><FormInput label="سال ساخت" value={year} icon="calendar" options={(catalog?.production_years_jalali||[1405,1404,1403]).map(x=>[String(x),fa(x)])} onChange={setYear}/></div><details className="insurance-optional"><summary><span><Icon name="document"/>جزئیات تکمیلی خودرو (اختیاری)</span><Icon name="chevron"/></summary><div>نوع سوخت و محل تولید خودرو به صورت خودکار از روی مدل انتخاب می‌شود.</div></details></>}
    {step===2&&<><h2>سابقه بیمه‌نامه و مالکیت</h2><p>وضعیت بیمه‌نامه قبلی</p><div className="single-field"><FormInput label="" value={policy} icon="document" options={[["no_previous_policy","بیمه‌نامه قبلی ندارم"],["had_previous_policy","بیمه‌نامه قبلی دارم"],["new_vehicle","خودروی نو / صفرکیلومتر"]]} onChange={setPolicy}/></div></>}
    {step===3&&<><h2>تخفیف، خسارت و پوشش</h2><div className="insurance-grid"><FormInput label="مدت بیمه‌نامه جدید" value={duration} icon="calendar" options={(catalog?.durations||[12,6,3]).map(x=>[String(x),`${fa(x)} ماه`])} onChange={setDuration}/><FormInput label="تعهد مالی" value={coverage} icon="coins" options={(catalog?.coverages_toman||[70000000,50000000,30000000]).map(x=>[String(x),`${fa(x)} تومان`])} onChange={setCoverage}/><FormInput label="شرکت بیمه ثبت‌شده" value={company} icon="building" options={[['','انتخاب کن...'],...(catalog?.insurers||[]).map(x=>[x.key,x.label] as [string,string])]} onChange={setCompany}/><FormInput label="شروع بازه ثبت‌شده" value={start} icon="calendar" onChange={setStart}/><FormInput label="پایان بازه ثبت‌شده" value={end} icon="calendar" onChange={setEnd}/></div></>}
    {step===4&&<><h2>مرور و دریافت پیشنهادها</h2><div className="summary-grid"><SummaryItem label="ویرایش خودرو" onEdit={()=>go(1)}>{chosen?.category||'سواری'} · {chosen?.brand||'پژو'} · {chosen?.model||'پارس'} · {chosen?.usages.find(x=>x.key===usage)?.label||'شخصی'} · {fa(Number(year))}</SummaryItem><SummaryItem label="ویرایش سابقه" onEdit={()=>go(2)}>{policy==='no_previous_policy'?'بیمه‌نامه قبلی ندارم':'بیمه‌نامه قبلی دارم'}</SummaryItem><SummaryItem label="ویرایش پوشش" onEdit={()=>go(3)}>{fa(Number(duration))} ماه · {fa(Number(coverage))} تومان</SummaryItem></div><div className="insurance-success"><i><Icon name="check"/></i>استعلام هر چهار منبع آماده است.</div></>}
    {error&&<p className="insurance-error" role="alert">{error}</p>}<NavigationButtons step={step} busy={busy} onBack={()=>go((step-1) as Step)} onNext={()=>step<4?go((step+1) as Step):finish()}/></main></motion.div></AnimatePresence></InsuranceCard>
}
