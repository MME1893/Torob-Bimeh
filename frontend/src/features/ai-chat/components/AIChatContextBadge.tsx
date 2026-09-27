import { contextLabel } from "../lib/buildChatContext";
import type { AnalysisSectionKey, ChatContextType } from "../types";

type Props = {
  contextType: ChatContextType;
  sectionKey: AnalysisSectionKey | null;
  isHistorical: boolean;
  fetchedAt: string;
};

const faDate = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleString("fa-IR");
};

export function AIChatContextBadge({ contextType, sectionKey, isHistorical, fetchedAt }: Props) {
  const stamp = faDate(fetchedAt);
  return (
    <div className="aic-context" aria-live="polite">
      <span className="aic-context__label">زمینه: {contextLabel(contextType, sectionKey)}</span>
      <span className="aic-context__hint">
        {isHistorical
          ? "پاسخ‌ها بر اساس نتیجه ذخیره‌شده همین استعلام هستند."
          : "بر اساس نتایج همین استعلام پاسخ می‌دهم."}
      </span>
      {stamp && (
        <span className="aic-context__stamp">
          {isHistorical ? "زمان ثبت استعلام" : "ثبت‌شده در"}: {stamp}
        </span>
      )}
      <span className="aic-context__privacy">
        قیمت‌های ثبت‌شده در این استعلام ملاک پاسخ هستند، نه قیمت لحظه‌ای بازار.
      </span>
    </div>
  );
}
