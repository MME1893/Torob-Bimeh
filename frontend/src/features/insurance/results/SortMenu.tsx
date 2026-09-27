import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { Check } from "lucide-react";
import { SORT_LABELS, SORT_MODES, type SortMode } from "./offerFilters";

type Props = {
  value: SortMode;
  open: boolean;
  /** The existing `.ir-sort` toolbar button, so the menu can sit under it. */
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onChange: (mode: SortMode) => void;
  onClose: () => void;
};

/**
 * Dropdown for the existing «مرتب‌سازی» toolbar button.
 *
 * It is rendered `position: fixed` against the measured button rect on purpose:
 * wrapping the button in an extra element would add a sixth child to the
 * five-column `.ir-toolbar-first` grid and reflow the toolbar, so the button
 * stays exactly where it is and only the menu floats above it.
 */
export function SortMenu({ value, open, anchorRef, onChange, onClose }: Props) {
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);

  const place = useCallback(() => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 168;
    // Right-aligned with the button in this RTL layout, then kept on screen.
    const right = Math.min(Math.max(8, window.innerWidth - rect.right), window.innerWidth - width - 8);
    const below = rect.bottom + 6;
    const height = SORT_MODES.length * 34 + 10;
    const top = below + height > window.innerHeight - 8 ? Math.max(8, rect.top - height - 6) : below;
    setPosition({ top, right });
  }, [anchorRef]);

  useLayoutEffect(place, [place, open]);

  useEffect(() => {
    if (!open) return;
    place();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
      anchorRef.current?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if ((target as HTMLElement).closest?.(".ir-sort-menu")) return;
      onClose();
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, onClose, anchorRef, place]);

  if (!open) return null;

  return (
    <div
      className="ir-sort-menu"
      role="listbox"
      aria-label="مرتب‌سازی پیشنهادها"
      style={position ? { top: position.top, right: position.right } : { visibility: "hidden" }}
    >
      {SORT_MODES.map((mode) => (
        <button
          key={mode}
          type="button"
          role="option"
          aria-selected={value === mode}
          className={value === mode ? "active" : ""}
          onClick={() => {
            onChange(mode);
            onClose();
            anchorRef.current?.focus();
          }}
        >
          {SORT_LABELS[mode]}
          {value === mode && <Check aria-hidden="true" />}
        </button>
      ))}
    </div>
  );
}
