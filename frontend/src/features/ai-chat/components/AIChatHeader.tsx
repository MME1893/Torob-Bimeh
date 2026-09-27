import { Target } from "lucide-react";
import { contextLabel } from "../lib/buildChatContext";
import type { AnalysisSectionKey, ChatContextType } from "../types";

type Props = {
  title: string;
  contextType: ChatContextType;
  sectionKey: AnalysisSectionKey | null;
  isHistorical: boolean;
  fetchedAt: string;
};

const faDate = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleString("fa-IR");
};

/**
 * White chat header: identity (logo + title) on top, then the context pill
 * and the dynamic metadata. No green-tinted block, matching the reference.
 */
export function AIChatHeader({ title, contextType, sectionKey, isHistorical, fetchedAt }: Props) {
  const stamp = faDate(fetchedAt);
  return (
    <header className="aic-header">
      <div className="aic-header__identity">
        <img src="/ai_logo.png" alt="" aria-hidden="true" />
        <h2 className="aic-header__title">{title}</h2>
      </div>
      <div className="aic-header__context">
        <span className="aic-header__pill">
          <Target aria-hidden="true" />
          زمینه: {contextLabel(contextType, sectionKey)}
        </span>
        <span className="aic-header__hint">
          {isHistorical
            ? "پاسخ‌ها بر اساس نتیجه ذخیره‌شده همین استعلام هستند."
            : "بر اساس نتایج همین استعلام پاسخ می‌دهم."}
        </span>
        {stamp && (
          <span className="aic-header__stamp">
            {isHistorical ? "زمان ثبت استعلام" : "ثبت‌شده در"}: {stamp}
          </span>
        )}
        <span className="aic-header__privacy">
          قیمت‌های ثبت‌شده در این استعلام ملاک پاسخ هستند، نه قیمت لحظه‌ای بازار.
        </span>
      </div>
    </header>
  );
}
