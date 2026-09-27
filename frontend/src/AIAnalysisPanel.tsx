import { useMemo, useState } from "react";
import { AlertTriangle, LoaderCircle, RotateCw, ShieldCheck, Sparkles, X } from "lucide-react";
import type { SearchResult } from "./searchTypes";
import { offersById } from "./ai/normalizeQuote";
import type { AIState, AnalysisSectionKey } from "./ai/types";
import { resolveInsurerLogo } from "./insurerLogos";

const number = new Intl.NumberFormat("fa-IR");
const meta: Array<{ key: AnalysisSectionKey; title: string; processing: string }> = [
  { key: "price_value", title: "قیمت و ارزش خرید", processing: "در حال مقایسه قیمت‌ها..." },
  { key: "payment_terms", title: "شرایط پرداخت", processing: "در حال بررسی شرایط پرداخت..." },
  { key: "coverage_services", title: "پوشش و خدمات", processing: "در حال بررسی پوشش‌ها..." },
  { key: "smart_summary", title: "جمع‌بندی هوشمند", processing: "در حال تحلیل پیشنهادها..." },
];

export function AIAnalysisPanel({ state, result, onRetry }: { state: AIState; result: SearchResult; onRetry: () => void }) {
  const [active, setActive] = useState<AnalysisSectionKey | null>(null);
  const lookup = useMemo(() => offersById(result), [result]);
  const selected = active ? meta.find((item) => item.key === active) : null;
  const section = active && state.status === "ready" ? state.analysis.sections[active] : null;
  const referenced = section ? [...new Set([
    ...section.recommended_offer_ids,
    ...section.key_points.flatMap((point) => point.offer_ids),
    section.cheapest_offer_id,
    section.best_value_offer_id,
  ].filter((id): id is string => !!id))] : [];
  return (
    <>
      <section className={`ir-ai-panel is-${state.status}`} aria-labelledby="ai-title">
        <div className="ir-ai-identity">
          <img src="/ai_logo.png" alt="" />
          <div>
            <span className="ir-dev-badge">تحلیل هوشمند</span>
            <h3 id="ai-title">{state.status === "ready" ? "تحلیل هوشمند آماده است" : state.status === "error" ? "تحلیل هوشمند تکمیل نشد" : "در حال تحلیل پیشنهادها"}</h3>
            <p>{state.status === "ready" ? "برای مشاهده جزئیات، یکی از چهار بخش را انتخاب کنید." : "نتایج استعلام آماده است و تحلیل هوشمند در پس‌زمینه انجام می‌شود."}</p>
          </div>
          {state.status === "error" && <button className="ir-ai-retry" type="button" onClick={onRetry}><RotateCw />تلاش دوباره</button>}
        </div>
        <div className="ir-ai-shells" aria-label="بخش‌های تحلیل هوشمند">
          {meta.map((item, index) => {
            const readySection = state.status === "ready" ? state.analysis.sections[item.key] : null;
            return (
              <button className={`ir-ai-shell ir-ai-shell-${index + 1}`} key={item.key} type="button" onClick={() => setActive(item.key)}>
                {state.status === "processing" || state.status === "idle" ? <LoaderCircle className="ir-spin" /> : state.status === "error" ? <AlertTriangle /> : <Sparkles />}
                <b>{item.title}</b>
                <span>{readySection ? readySection.headline : state.status === "error" ? "تحلیل آماده نشد" : item.processing}</span>
              </button>
            );
          })}
        </div>
      </section>
      {active && selected && (
        <div className="ir-ai-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setActive(null)}>
          <section className="ir-ai-modal" role="dialog" aria-modal="true" aria-labelledby="ai-modal-title">
            <header><div><span>تحلیل هوشمند</span><h3 id="ai-modal-title">{selected.title}</h3></div><button type="button" onClick={() => setActive(null)} aria-label="بستن"><X /></button></header>
            {(state.status === "idle" || state.status === "processing") && <div className="ir-ai-modal-state"><LoaderCircle className="ir-spin" /><b>در حال تحلیل پیشنهادهای بیمه...</b><p>می‌توانید این پنجره را باز بگذارید؛ نتیجه به‌صورت خودکار نمایش داده می‌شود.</p></div>}
            {state.status === "error" && <div className="ir-ai-modal-state"><AlertTriangle /><b>تحلیل هوشمند آماده نشد</b><p>نتایج عادی بیمه همچنان در دسترس است.</p><button type="button" onClick={onRetry}>تلاش دوباره</button></div>}
            {section && <div className="ir-ai-modal-content">
              <h4>{section.headline}</h4><p>{section.summary}</p>
              {!!section.key_points.length && <div className="ir-ai-points">{section.key_points.map((point, index) => <article className={`tone-${point.tone}`} key={`${point.title}-${index}`}><b>{point.title}</b><p>{point.description}</p></article>)}</div>}
              {!!referenced.length && <div className="ir-ai-references"><h4>پیشنهادهای اشاره‌شده</h4>{referenced.map((id) => { const offer = lookup.get(id); if (!offer) return null; const logo = resolveInsurerLogo(offer.insurer_name); return <div key={id}>{logo ? <img src={logo} alt="" /> : <ShieldCheck />}<span><b>{offer.insurer_name}</b><small>{offer.provider}</small></span><strong>{offer.premium.amount_toman == null ? "—" : `${number.format(offer.premium.amount_toman)} تومان`}</strong></div>; })}</div>}
              {!!section.caveats.length && <div className="ir-ai-caveats"><h4>نکات قابل توجه</h4><ul>{section.caveats.map((item) => <li key={item}>{item}</li>)}</ul></div>}
            </div>}
          </section>
        </div>
      )}
    </>
  );
}
