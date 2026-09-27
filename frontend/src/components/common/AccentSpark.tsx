type AccentSparkProps = {
  placement: "heading" | "card";
};

export function AccentSpark({ placement }: AccentSparkProps) {
  return (
    <span
      className={`accent-spark accent-spark--${placement}`}
      aria-hidden="true"
    >
      <span />
      <span />
      <span />
    </span>
  );
}

