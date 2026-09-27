import { Sparkles } from "lucide-react";

export function AIChatLauncher({ onClick }: { onClick: (trigger: HTMLElement) => void }) {
  return (
    <button
      className="aic-launcher"
      type="button"
      aria-label="گفتگو با هوش مصنوعی"
      onClick={(event) => onClick(event.currentTarget)}
    >
      <img src="/ai_logo.png" alt="" aria-hidden="true" />
      <Sparkles className="aic-launcher__sparkle" aria-hidden="true" />
      <span>گفتگو با هوش مصنوعی</span>
    </button>
  );
}
