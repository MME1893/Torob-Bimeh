import { motion, useReducedMotion } from "framer-motion";
import { AccentSpark } from "./AccentSpark";

export type InsuranceCardVariant = "default" | "active" | "warm" | "green";

type InsuranceCardProps = {
  title: string;
  description: string;
  image: string;
  imageAlt: string;
  ctaText: string;
  variant?: InsuranceCardVariant;
  highlighted?: boolean;
  onSelect: () => void;
};

const variantClasses: Record<InsuranceCardVariant, string> = {
  default: "insurance-card--default",
  active: "insurance-card--active",
  warm: "insurance-card--warm",
  green: "insurance-card--green",
};

export function InsuranceCard({
  title,
  description,
  image,
  imageAlt,
  ctaText,
  variant = "default",
  highlighted = false,
  onSelect,
}: InsuranceCardProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.article
      className={`insurance-card group relative flex h-full flex-col bg-white ${variantClasses[variant]} ${
        highlighted ? "is-highlighted" : ""
      }`}
      animate={
        highlighted && !reduceMotion ? { y: [0, -3, 0] } : { y: 0 }
      }
      transition={
        highlighted && !reduceMotion
          ? { duration: 4.8, repeat: Infinity, ease: "easeInOut" }
          : { duration: 0.2 }
      }
      whileHover={reduceMotion ? undefined : { y: -7 }}
    >
      {highlighted && <AccentSpark placement="card" />}

      <div className="insurance-card__visual relative grid place-items-center overflow-hidden">
        <span className="insurance-card__halo" aria-hidden="true" />
        <img src={image} alt={imageAlt} loading="eager" />
      </div>

      <div className="insurance-card__copy text-right">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>

      <button
        type="button"
        className="insurance-card__cta mt-auto flex w-full items-center justify-between"
        onClick={onSelect}
        aria-pressed={highlighted}
      >
        <span>{ctaText}</span>
        {!highlighted && (
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M12.5 4.5 7 10l5.5 5.5M7.5 10H17" />
          </svg>
        )}
        {highlighted && <span className="insurance-card__cta-mark">←</span>}
      </button>
    </motion.article>
  );
}
