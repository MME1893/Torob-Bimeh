import {useEffect, useState} from 'react';
import {ComboBox} from './ComboBox';

const providers=['azki','sabim','bimebazar','bimeh'] as const;
type Provider=typeof providers[number];
const names:Record<string,string>={azki:'ازکی',sabim:'سابیم',bimebazar:'بیمه‌بازار',bimeh:'بیمه‌دات‌کام','چند منبع':'چند منبع'};
type Model={key:string;label:string;category:string;category_key:string;brand_key:string;provider:string;usages:{key:string;label:string}[]};
type Catalog={models:Model[];insurers:{key:string;label:string}[];production_years_jalali:number[];durations:number[];discounts:number[];fuels:{key:string;label:string}[];coverages_toman:number[]};
type Selection={model_key:string;usage_key:string};
type Preview={provider:Provider;status:string;message:string|null;url:string;method:string;query:Record<string,unknown>;body:Record<string,unknown>;comparison_url:string|null;comparison_warning:string|null;vehicle:{key:string;label:string;usages:{key:string;label:string}[];usage_key:string}|null};
type SearchResult={request_id:string;fetched_at:string;providers:{provider:string;status:'ok'|'empty'|'needs_input'|'unmapped'|'unavailable'|'invalid_response'|'unsupported';message:string|null;offers:{insurer_name:string;provider:string;premium:{raw_amount:number;raw_unit:string;amount_toman:number|null};financial_coverage_toman:number|null;duration_months:number|null;raw_offer:Record<string,unknown>}[];raw_response:unknown}[]};
type PolicyStatus='no_previous_policy'|'had_previous_policy'|'new_vehicle';
const policyLabels:Record<PolicyStatus,string>={no_previous_policy:'بیمهٔ قبلی ندارد',had_previous_policy:'بیمهٔ قبلی دارد',new_vehicle:'خودروی نو'};
const modeLabels={unchanged:'تعویض پلاک نداشته',no_discount:'تعویض پلاک؛ تخفیف دیگری ندارم',same_plate:'تعویض پلاک؛ با همین پلاک تخفیف دارم',other_plate:'تعویض پلاک؛ تخفیف از پلاک دیگر'};
const digits=(s:string)=>s.replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632));
const dateText=(s:string)=>digits(s).trim().replace(/-/g,'/');
const validDate=(s:string)=>/^(13|14)\d\d\/(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])$/.test(dateText(s)) && Number(dateText(s).split('/')[2])<=(Number(dateText(s).split('/')[1])<=6?31:30);
const number=(n:number)=>n.toLocaleString('fa-IR');

export function ThirdCarWizard({onResult,onStart}:{onResult:(result:SearchResult)=>void;onStart:()=>void}) {
  const [catalog,setCatalog]=useState<Catalog|null>(null),[step,setStep]=useState(0),[error,setError]=useState(''),[pending,setPending]=useState(false);
  const [modelKey,setModelKey]=useState('peugeot_pars'),[usage,setUsage]=useState('personal'),[year,setYear]=useState(1404);
  const [fuel,setFuel]=useState('1'),[imported,setImported]=useState('catalog'),[yearTitle,setYearTitle]=useState('');
  const [status,setStatus]=useState<PolicyStatus>('no_previous_policy'),[insurer,setInsurer]=useState(''),[start,setStart]=useState(''),[expiry,setExpiry]=useState('');
  const [release,setRelease]=useState(''),[newExpiry,setNewExpiry]=useState(''),[previousDuration,setPreviousDuration]=useState(12);
  const [ownerMode,setOwnerMode]=useState<keyof typeof modeLabels>('unchanged'),[policyOwner,setPolicyOwner]=useState('current'),[supplement,setSupplement]=useState(false);
  const [thirdDiscount,setThirdDiscount]=useState(0),[driverDiscount,setDriverDiscount]=useState(0),[hadClaim,setHadClaim]=useState(false);
  const [counts,setCounts]=useState({property:0,bodily:0,driver:0}),[duration,setDuration]=useState(12),[coverage,setCoverage]=useState(70000000);
  const [plate,setPlate]=useState(''),[transfer,setTransfer]=useState({part1:'',part2:'',part3:'',serial:'',national:'',relationship:'',inquiry:''});
  const [selections,setSelections]=useState<Partial<Record<Provider,Selection>>>({}),[tab,setTab]=useState<Provider>('azki');
  const [zeroThird,setZeroThird]=useState(false),[zeroDriver,setZeroDriver]=useState(false);
  const [sabimYadak,setSabimYadak]=useState(false),[transition,setTransition]=useState(false),[customSabim,setCustomSabim]=useState(false);
  const [sabimCompany,setSabimCompany]=useState(''),[sabimStart,setSabimStart]=useState(''),[sabimExpiry,setSabimExpiry]=useState('');
  const [previews,setPreviews]=useState<Preview[]>([]),[previewLoading,setPreviewLoading]=useState(false);
  useEffect(()=>{const c=new AbortController();fetch('/api/search/catalog',{signal:c.signal}).then(async r=>{if(!r.ok)throw Error('کاتالوگ دریافت نشد');return r.json()}).then(setCatalog).catch(e=>{if(!c.signal.aborted)setError(e.message)});return ()=>c.abort()},[]);
  const model=catalog?.models.find(m=>m.key===modelKey);
  function payload(){
    const base={status};
    const history=status==='no_previous_policy'?base:status==='new_vehicle'?{...base,first_use_date_jalali:dateText(release)||null,new_vehicle_expiry_jalali:dateText(newExpiry)||null}:{...base,
      previous_insurer_key:insurer||null,previous_start_date_jalali:dateText(start)||null,previous_expiry_date_jalali:dateText(expiry)||null,
      previous_duration_months:previousDuration,no_claim_discount_percent:thirdDiscount,driver_discount_percent:driverDiscount,had_claim:hadClaim,
      property_claim_count:hadClaim?counts.property:0,bodily_claim_count:hadClaim?counts.bodily:0,driver_claim_count:hadClaim?counts.driver:0,
      ownership_mode:ownerMode,policy_owner:policyOwner,supplement_discounts:supplement,
      ...(ownerMode==='other_plate'?{transfer_plate:plate||null,transfer_plate_part1:transfer.part1||null,transfer_plate_part2:transfer.part2||null,
        transfer_plate_part3:transfer.part3||null,transfer_plate_serial:transfer.serial||null,transfer_national_id:transfer.national||null,
        transfer_relationship:transfer.relationship,transfer_inquiry_id:transfer.inquiry||null}:{})};
    return {product:'third_car',vehicle:{category_key:model?.category_key,brand_key:model?.brand_key,model_key:modelKey,usage_key:usage,
      production_year_jalali:year,fuel_type_key:fuel,imported:imported==='catalog'?null:imported==='true',construction_year_title:yearTitle||null},
      previous_policy:history,duration_months:duration,financial_coverage_toman:coverage,provider_selections:selections,
      sabim_yadak:sabimYadak,sabim_transition:transition,sabim_zero_km_third_discount:zeroThird,sabim_zero_km_driver_discount:zeroDriver,
      sabim_history:customSabim&&sabimCompany&&validDate(sabimStart)&&validDate(sabimExpiry)?{
        insurer_key:sabimCompany,start_date_jalali:dateText(sabimStart),expiry_date_jalali:dateText(sabimExpiry)}:null};
  }
  const serialized=model?JSON.stringify(payload()):'';
  useEffect(()=>{
    if(step!==3||!serialized)return;
    const controller=new AbortController();setPreviewLoading(true);setPreviews([]);
    const timeout=setTimeout(()=>fetch('/api/search/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:serialized,signal:controller.signal})
      .then(async r=>{if(!r.ok)throw Error('تاریخ یا اطلاعات واردشده معتبر نیست؛ بخش‌های قبلی را ویرایش کن.');return r.json()})
      .then(d=>{setPreviews(d.providers);setError('')}).catch(e=>{if(!controller.signal.aborted)setError(e.message)})
      .finally(()=>{if(!controller.signal.aborted)setPreviewLoading(false)}),180);
    return ()=>{clearTimeout(timeout);controller.abort()};
  },[serialized,step]);
  function validate(){
    if(!model||!model.usages.some(u=>u.key===usage))return 'مدل و کاربری خودرو را انتخاب کن.';
    if(step===1){
      if(status==='had_previous_policy'){
        if(!insurer&&policyOwner!=='transfer')return 'شرکت قبلی را انتخاب کن.';
        if(!validDate(start)||!validDate(expiry))return 'شروع و پایان بیمه را به شکل تاریخ شمسی معتبر وارد کن.';
        if(dateText(start)>=dateText(expiry))return 'پایان بیمه باید پس از شروع باشد.';
      }
      if(status==='new_vehicle'&&(!validDate(release)||(newExpiry&&!validDate(newExpiry))))return 'تاریخ‌های خودروی نو را به شکل شمسی معتبر وارد کن.';
    }
    if(step===2&&status==='had_previous_policy'&&hadClaim&&!Object.values(counts).some(Boolean))return 'دست‌کم یک خسارت را ثبت کن.';
    return '';
  }
  function next(){const problem=validate();if(problem){setError(problem);return}setError('');setStep(step+1)}
  async function search(){
    if(previewLoading||!previews.some(p=>p.status==='ready'))return;
    if(customSabim&&(!sabimCompany||!validDate(sabimStart)||!validDate(sabimExpiry))){setError('اطلاعات تکمیلی سابیم را کامل کن یا گزینهٔ استفاده از آن را بردار.');return}
    setPending(true);setError('');onStart();
    try{const r=await fetch('/api/search',{method:'POST',headers:{'Content-Type':'application/json'},body:serialized});
      if(!r.ok)throw Error(r.status===422?'اطلاعات یا تاریخ معتبر نیست.':'اتصال به سرور برقرار نشد.');onResult(await r.json());
    }catch(e){setError(e instanceof Error?e.message:'استعلام ناموفق بود')}finally{setPending(false)}
  }
  const dateField=(label:string,value:string,set:(v:string)=>void)=><label>{label}<input value={value} onChange={e=>set(e.target.value)} placeholder="۱۴۰۴/۰۱/۰۱" inputMode="numeric" dir="ltr" aria-invalid={!!value&&!validDate(value)}/>{value&&!validDate(value)&&<small className="field-error">تاریخ شمسی را به شکل ۱۴۰۴/۰۱/۰۱ وارد کن.</small>}</label>;
  const months=(value:number,set:(n:number)=>void,label:string)=><label>{label}<select value={value} onChange={e=>set(Number(e.target.value))}>{catalog?.durations.map(n=><option key={n} value={n}>{number(n)} ماه</option>)}</select></label>;
  const current=previews.find(p=>p.provider===tab),override=selections[tab];
  const sourceModels=catalog?.models.filter(m=>m.provider===tab)||[];
  const currentModel=sourceModels.find(m=>m.key===(override?.model_key||current?.vehicle?.key));
  return <section className="wizard" aria-label="پرسش‌های استعلام شخص ثالث خودرو">
    <div className="wizard-top"><span>گفت‌وگوی راهنما</span><span>گام {number(step+1)} از ۴</span></div><div className="progress"><span style={{width:`${(step+1)*25}%`}}/></div>
    <fieldset disabled={pending} className="wizard-fields">
    {step===0&&<div className="question"><span className="avatar">؟</span><h2>مشخصات ماشینت چیست؟</h2><div className="answer">
      <ComboBox label="مدل خودرو" choices={(catalog?.models||[]).map(m=>({key:m.key,label:m.label,detail:m.category+' · '+names[m.provider]}))} value={modelKey}
        onChange={key=>{setModelKey(key);setUsage(catalog?.models.find(m=>m.key===key)?.usages[0]?.key||'');setSelections({});setPreviews([])}} disabled={!catalog}/>
      <label>کاربری<select value={usage} onChange={e=>{setUsage(e.target.value);setSelections({})}}>{model?.usages.map(u=><option key={u.key} value={u.key}>{u.label}</option>)}</select></label>
      <label>سال ساخت شمسی<select value={year} onChange={e=>setYear(Number(e.target.value))}>{catalog?.production_years_jalali.map(n=><option key={n} value={n}>{number(n)}</option>)}</select></label>
      <label>سوخت<select value={fuel} onChange={e=>setFuel(e.target.value)}>{catalog?.fuels.map(f=><option key={f.key} value={f.key}>{f.label}</option>)}</select></label>
      <label>نوع تولید<select value={imported} onChange={e=>setImported(e.target.value)}><option value="catalog">طبق مشخصات مدل</option><option value="false">داخلی</option><option value="true">وارداتی</option></select></label>
      <label>عنوان سال وارداتی، در صورت نیاز<input value={yearTitle} onChange={e=>setYearTitle(e.target.value)} placeholder="عنوان گزینهٔ سال در ازکی"/></label>
    </div></div>}
    {step===1&&<div className="question"><span className="avatar">؟</span><h2>وضعیت بیمهٔ قبلی چگونه است؟</h2><div className="answer">
      <label>وضعیت بیمه<select value={status} onChange={e=>setStatus(e.target.value as PolicyStatus)}>{Object.entries(policyLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      {status==='new_vehicle'&&<>{dateField('تاریخ ترخیص (شمسی)',release,setRelease)}{dateField('پایان بیمهٔ خودروی نو (بیمه‌بازار، شمسی)',newExpiry,setNewExpiry)}</>}
      {status==='had_previous_policy'&&<>
        <ComboBox label="شرکت بیمهٔ قبلی" choices={catalog?.insurers||[]} value={insurer} onChange={setInsurer}/>
        {dateField('شروع بیمهٔ قبلی (شمسی)',start,setStart)}{dateField('پایان بیمهٔ قبلی (شمسی)',expiry,setExpiry)}
        {months(previousDuration,setPreviousDuration,'مدت بیمهٔ قبلی')}
        <label>تعویض پلاک و تخفیف<select value={ownerMode} onChange={e=>setOwnerMode(e.target.value as keyof typeof modeLabels)}>{Object.entries(modeLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
        <label>بیمه‌نامهٔ قبلی مربوط به کدام مالک است؟<select value={policyOwner} onChange={e=>{setPolicyOwner(e.target.value);setTransition(e.target.value==='previous')}}><option value="current">مالک فعلی</option><option value="previous">مالک قبلی</option><option value="transfer">انتقال تخفیف / تعویض پلاک در بیمه‌دات‌کام</option></select></label>
        {policyOwner==='transfer'&&<label className="check-field"><input type="checkbox" checked={supplement} onChange={e=>setSupplement(e.target.checked)}/>تکمیل تخفیف‌ها در بیمه‌دات‌کام</label>}
      </>}
      {status==='had_previous_policy'&&ownerMode==='other_plate'&&<>
        <label>پلاک مبدأ انتقال تخفیف در ازکی<input value={plate} onChange={e=>setPlate(digits(e.target.value))}/></label>
        {([['part1','بخش اول پلاک قبلی'],['part2','بخش دوم پلاک قبلی'],['part3','بخش سوم پلاک قبلی'],['serial','سریال پلاک قبلی'],['national','کد ملی صاحب پلاک قبلی'],['relationship','نسبت انتقال‌دهنده'],['inquiry','شناسهٔ استعلام قبلی بیمه‌بازار']] as const).map(([key,label])=><label key={key}>{label}<input value={transfer[key]} onChange={e=>setTransfer({...transfer,[key]:digits(e.target.value)})}/></label>)}
      </>}
    </div></div>}
    {step===2&&<div className="question"><span className="avatar">؟</span><h2>تخفیف، خسارت و پوشش موردنیازت چیست؟</h2><div className="answer">
      {status==='had_previous_policy'&&<>
        <label>تخفیف ثالث<select value={thirdDiscount} onChange={e=>setThirdDiscount(Number(e.target.value))}>{catalog?.discounts.map(n=><option key={n} value={n}>{number(n)}٪</option>)}</select></label>
        <label>تخفیف راننده<select value={driverDiscount} onChange={e=>setDriverDiscount(Number(e.target.value))}>{catalog?.discounts.map(n=><option key={n} value={n}>{number(n)}٪</option>)}</select></label>
        <label>از بیمهٔ قبلی خسارت گرفته‌ای؟<select value={hadClaim?'yes':'no'} onChange={e=>setHadClaim(e.target.value==='yes')}><option value="no">خیر</option><option value="yes">بله</option></select></label>
        {hadClaim&&(['property','bodily','driver'] as const).map(kind=><label key={kind}>خسارت {({property:'مالی',bodily:'جانی',driver:'راننده'})[kind]}<select value={counts[kind]} onChange={e=>setCounts({...counts,[kind]:Number(e.target.value)})}>{[0,1,2,3].map(n=><option key={n} value={n}>{n===3?'۳ یا بیشتر':number(n)}</option>)}</select></label>)}
      </>}
      {months(duration,setDuration,'مدت بیمهٔ جدید')}
      <label>تعهد مالی<select value={coverage} onChange={e=>setCoverage(Number(e.target.value))}>{catalog?.coverages_toman.map(n=><option key={n} value={n}>{number(n)} تومان</option>)}</select></label>
      <label className="check-field"><input type="checkbox" checked={transition} onChange={e=>setTransition(e.target.checked)}/>اخیراً منتقل شده و بیمه به نام مالک قبلی است (سابیم)</label>
      <label className="check-field"><input type="checkbox" checked={sabimYadak} onChange={e=>setSabimYadak(e.target.checked)}/>گزینهٔ یدک سابیم — عنوان دقیق در منبع مشخص نیست</label>
    </div></div>}
    {step===3&&<div className="question"><span className="avatar">✓</span><h2>مرور اطلاعات و درخواست چهار منبع</h2>
      <div className="review"><span><b>{model?.label} · {number(year)} · {model?.usages.find(u=>u.key===usage)?.label}</b><button type="button" className="secondary" onClick={()=>setStep(0)}>ویرایش خودرو</button></span>
        <span><b>{policyLabels[status]}{status==='had_previous_policy'?` · ${insurer} · ${start} تا ${expiry} · ${modeLabels[ownerMode]}`:status==='new_vehicle'?` · ترخیص ${release} · پایان بیمه ${newExpiry||'ثبت نشده'}`:''}</b><button type="button" className="secondary" onClick={()=>setStep(1)}>ویرایش سابقه</button></span>
        <span><b>{number(duration)} ماه · {number(coverage)} تومان{status==='had_previous_policy'?` · ثالث ${number(thirdDiscount)}٪ · راننده ${number(driverDiscount)}٪ · خسارت مالی ${hadClaim?counts.property:0} / جانی ${hadClaim?counts.bodily:0} / راننده ${hadClaim?counts.driver:0}`:''}</b><button type="button" className="secondary" onClick={()=>setStep(2)}>ویرایش پوشش</button></span></div>
      <details className="review-extra"><summary>سایر پاسخ‌ها برای مرور</summary>
        <p>سوخت: {catalog?.fuels.find(f=>f.key===fuel)?.label} · تولید: {imported==='catalog'?'طبق مدل':imported==='true'?'وارداتی':'داخلی'} · عنوان سال: {yearTitle||'سال انتخاب‌شده'}</p>
        {status==='had_previous_policy'&&<><p>مدت بیمهٔ قبلی: {number(previousDuration)} ماه · مالک بیمه: {policyOwner==='current'?'فعلی':policyOwner==='previous'?'قبلی':'انتقال تخفیف'} · تکمیل تخفیف: {supplement?'بله':'خیر'}</p>
        {ownerMode==='other_plate'&&<p>پلاک مبدأ ازکی: {plate||'ثبت نشده'} · پلاک مبدأ بیمه‌بازار: {transfer.part1} {transfer.part2} {transfer.part3} / {transfer.serial} · کد ملی: {transfer.national||'ثبت نشده'} · نسبت: {transfer.relationship||'ثبت نشده'} · شناسهٔ استعلام: {transfer.inquiry||'ثبت نشده'}</p>}</>}
        <p>انتقال اخیر سابیم: {transition?'بله':'خیر'} · گزینهٔ یدک: {sabimYadak?'بله':'خیر'}</p>
      </details>
      <div className="provider-tabs" role="tablist" aria-label="نگاشت منابع">{providers.map(p=><button type="button" key={p} role="tab" id={'tab-'+p} aria-controls={'panel-'+p} aria-selected={tab===p} onClick={()=>setTab(p)}>{names[p]}<small>{previews.find(x=>x.provider===p)?.status==='ready'?'آمادهٔ ارسال':previewLoading?'در حال بررسی':'نیازمند بررسی'}</small></button>)}</div>
      <div role="tabpanel" id={'panel-'+tab} aria-labelledby={'tab-'+tab} className="provider-preview">
        <div className="answer"><ComboBox label={'مدل معادل در '+names[tab]} choices={sourceModels.map(m=>({key:m.key,label:m.label,detail:m.category}))}
          value={override?.model_key||current?.vehicle?.key||''} onChange={key=>{const m=sourceModels.find(m=>m.key===key);setSelections({...selections,[tab]:{model_key:key,usage_key:m?.usages[0]?.key||''}})}}/>
          <label>کاربری این منبع<select value={override?.usage_key||current?.vehicle?.usage_key||''} onChange={e=>{if(currentModel)setSelections({...selections,[tab]:{model_key:currentModel.key,usage_key:e.target.value}})}}>
            <option value="">انتخاب کن</option>{currentModel?.usages.map(u=><option key={u.key} value={u.key}>{u.label}</option>)}
          </select></label></div>
        {override&&<button type="button" className="secondary" onClick={()=>{const updated={...selections};delete updated[tab];setSelections(updated)}}>استفاده از نگاشت خودکار فرم</button>}
        {tab==='sabim'&&<div className="answer"><label className="check-field"><input type="checkbox" checked={zeroThird} onChange={e=>setZeroThird(e.target.checked)}/>گزینهٔ «صفر کیلومتر» برای تخفیف ثالث سابیم</label><label className="check-field"><input type="checkbox" checked={zeroDriver} onChange={e=>setZeroDriver(e.target.checked)}/>گزینهٔ «صفر کیلومتر» برای تخفیف رانندهٔ سابیم</label></div>}
        {tab==='sabim'&&<details open={status!=='had_previous_policy'}><summary>اطلاعات تکمیلی سابیم</summary><p>سابیم برای محاسبه دو تاریخ و یک شرکت مبنا می‌خواهد. برای سابقهٔ بیمه از همان فرم استفاده می‌شود؛ در صورت نیاز، اطلاعات این بخش را خودت مشخص کن.</p>
          <label className="check-field"><input type="checkbox" checked={customSabim} onChange={e=>setCustomSabim(e.target.checked)}/>اطلاعات مبنای سابیم را جدا وارد می‌کنم</label>
          {customSabim&&<div className="answer"><ComboBox label="شرکت مبنای سابیم" choices={catalog?.insurers||[]} value={sabimCompany} onChange={setSabimCompany}/>{dateField('شروع مبنای سابیم (شمسی)',sabimStart,setSabimStart)}{dateField('پایان مبنای سابیم (شمسی)',sabimExpiry,setSabimExpiry)}</div>}
        </details>}
        {previewLoading?<p role="status">در حال ساخت درخواست…</p>:current&&<>
          <p className={current.status==='ready'?'mapping-ready':'alert'}>{current.status==='ready'?'درخواست این منبع آماده است.':current.message}</p>
          {current.comparison_warning&&<p>{current.comparison_warning}</p>}
          <details><summary>URL نهایی و آرگومان‌های {names[tab]}</summary><pre dir="ltr">{JSON.stringify({method:current.method,url:current.url,query:current.query,body:current.body,comparison_url:current.comparison_url},null,2)}</pre></details>
        </>}
      </div><p className="disclosure">با ارسال، منابع آماده به‌طور مستقل استعلام می‌شوند و نتیجهٔ هر چهار منبع نمایش داده می‌شود.</p>
    </div>}
    {error&&<div className="alert" role="alert">{error}</div>}
    <div className="controls">{step>0&&<button type="button" className="secondary" onClick={()=>{setStep(step-1);setError('')}}>بازگشت</button>}
      {step<3?<button type="button" className="primary" onClick={next} disabled={!catalog}>ادامه ←</button>:<button type="button" className="primary" onClick={search} disabled={pending||previewLoading||!previews.some(p=>p.status==='ready')}>{pending?'در حال استعلام…':'دریافت پیشنهادهای تازه ←'}</button>}
    </div></fieldset>
  </section>;
}
