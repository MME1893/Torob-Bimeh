import { useMemo, useRef, useState } from "react";
import { AlertTriangle, LoaderCircle, RotateCw, Sparkles } from "lucide-react";
import type { SearchResult } from "../search/searchTypes";
import { offersById } from "./lib/normalizeQuote";
import type { AIState, AnalysisSectionKey } from "./lib/types";
import { ANALYSIS_SECTION_PROCESSING, ANALYSIS_SECTION_TITLES } from "./lib/types";
import { AIAnalysisModal } from "./AIAnalysisModal";

const meta: Array<{ key: AnalysisSectionKey; tone: string }> = [
  { key: "price_value", tone: "ir-ai-shell-1" },
  { key: "payment_terms", tone: "ir-ai-shell-2" },
  { key: "coverage_services", tone: "ir-ai-shell-3" },
  { key: "smart_summary", tone: "ir-ai-shell-4" },
];
type Props = {
  state: AIState;
  result: SearchResult;
  onRetry: () => void;
  /** Hands the current section over to a new section-specific chat thread. */
  onAskAboutSection: (sectionKey: AnalysisSectionKey) => void;
  /** Resolves a canonical offer id inside InsuranceResults. */
  onSelectReferencedOffer: (offerId: string) => void;
};

export function AIAnalysisPanel({
  state,
  result,
  onRetry,
  onAskAboutSection,
  onSelectReferencedOffer,
}: Props) {
  const [active, setActive] = useState<AnalysisSectionKey | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const lookup = useMemo(() => offersById(result), [result]);
  const section = active && state.status === "ready" ? state.analysis.sections[active] : null;

  const close = () => setActive(null);
  const open = (key: AnalysisSectionKey, trigger: HTMLButtonElement) => {
    openerRef.current = trigger;
    setActive(key);
  };

  return (
    <>
      <section className={`ir-ai-panel is-${state.status}`} aria-labelledby="ai-title">
        <div className="ir-ai-identity">
          <img src="/ai_logo.png" alt="" />
          <div>
            <span className="ir-dev-badge">تحلیل هوشمند</span>
            <h3 id="ai-title">
              {state.status === "ready"
                ? "تحلیل هوشمند آماده است"
                : state.status === "error"
                  ? "تحلیل هوشمند تکمیل نشد"
                  : "در حال تحلیل پیشنهادها"}
            </h3>
            <p>
              {state.status === "ready"
                ? "برای مشاهده جزئیات، یکی از چهار بخش را انتخاب کنید."
                : "نتایج استعلام آماده است و تحلیل هوشمند در پس‌زمینه انجام می‌شود."}
            </p>
          </div>
          {state.status === "error" && (
            <button className="ir-ai-retry" type="button" onClick={onRetry}>
              <RotateCw />
              تلاش دوباره
            </button>
          )}
        </div>
        <div className="ir-ai-shells" aria-label="بخش‌های تحلیل هوشمند">
          {meta.map((item) => {
            const readySection = state.status === "ready" ? state.analysis.sections[item.key] : null;
            return (
              <button
                className={`ir-ai-shell ${item.tone}`}
                key={item.key}
                type="button"
                onClick={(event) => open(item.key, event.currentTarget)}
              >
                {state.status === "processing" || state.status === "idle" ? (
                  <LoaderCircle className="ir-spin" />
                ) : state.status === "error" ? (
                  <AlertTriangle />
                ) : (
                  <Sparkles />
                )}
                <b>{ANALYSIS_SECTION_TITLES[item.key]}</b>
                <span>
                  {readySection
                    ? readySection.headline
                    : state.status === "error"
                      ? "تحلیل آماده نشد"
                      : ANALYSIS_SECTION_PROCESSING[item.key]}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {active && (
        <AIAnalysisModal
          state={state}
          section={section}
          sectionTitle={ANALYSIS_SECTION_TITLES[active]}
          lookup={lookup}
          openerRef={openerRef}
          onClose={close}
          onRetry={onRetry}
          onSelectReferencedOffer={(offerId) => {
            close();
            onSelectReferencedOffer(offerId);
          }}
          onAskAboutAnalysis={() => {
            const key = active;
            close();
            onAskAboutSection(key);
          }}
        />
      )}
    </>
  );
}
