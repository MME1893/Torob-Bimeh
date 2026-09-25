type FeatureIcon = "lightning" | "shield" | "tag";

type Feature = {
  title: string;
  subtitle: string;
  icon: FeatureIcon;
};

const features: Feature[] = [
  {
    title: "مقایسه سریع",
    subtitle: "در چند ثانیه، بهترین پیشنهادها",
    icon: "lightning",
  },
  {
    title: "شرکت‌های معتبر",
    subtitle: "همکاری با بیمه‌های رسمی",
    icon: "shield",
  },
  {
    title: "قیمت شفاف",
    subtitle: "مشاهده و مقایسه آسان",
    icon: "tag",
  },
];

function FeatureIcon({ kind }: { kind: FeatureIcon }) {
  if (kind === "shield") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3 19 6v5.2c0 4.7-2.8 8-7 9.8-4.2-1.8-7-5.1-7-9.8V6l7-3Z" />
        <path d="m8.8 12 2.1 2.1 4.5-4.8" />
      </svg>
    );
  }

  if (kind === "tag") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m4 5 7.8-.8L20 12.4 12.4 20 4.2 11.8 4 5Z" />
        <circle cx="8" cy="8" r="1.4" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m13.3 2.8-7 10h5.1l-.7 8.4 7-10h-5.1l.7-8.4Z" />
    </svg>
  );
}

export function FeatureBar() {
  return (
    <div className="insurance-features grid" aria-label="مزایای ترب بیمه" role="list">
      {features.map((feature) => (
        <div className="insurance-feature flex items-center" key={feature.title} role="listitem">
          <span className={`insurance-feature__icon is-${feature.icon}`}>
            <FeatureIcon kind={feature.icon} />
          </span>
          <span className="insurance-feature__copy">
            <strong>{feature.title}</strong>
            <small>{feature.subtitle}</small>
          </span>
        </div>
      ))}
    </div>
  );
}
