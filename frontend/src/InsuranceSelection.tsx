import { motion, useReducedMotion } from "framer-motion";
import { AccentSpark } from "./AccentSpark";
import { FeatureBar } from "./FeatureBar";
import { InsuranceCard, type InsuranceCardVariant } from "./InsuranceCard";
import "./insurance-selection.css";

const thirdPartyCar = new URL(
  "./assest/insurance/third-party-car.png",
  import.meta.url,
).href;
const bodyCar = new URL("./assest/insurance/body-car.png", import.meta.url).href;
const motorcycle = new URL(
  "./assest/insurance/motorcycle.png",
  import.meta.url,
).href;
const torobMini = new URL(
  "./assest/insurance/torob-mini.png",
  import.meta.url,
).href;

export type InsuranceKind = "third_car" | "body_car" | "third_motor";

type InsuranceSelectionProps = {
  selected: InsuranceKind | null;
  onSelect: (kind: InsuranceKind) => void;
};

type InsuranceOption = {
  id: InsuranceKind;
  title: string;
  description: string;
  ctaText: string;
  image: string;
  imageAlt: string;
  variant: InsuranceCardVariant;
};

const insuranceOptions: InsuranceOption[] = [
  {
    id: "third_car",
    title: "شخص ثالث خودرو",
    description: "استعلام و مقایسه قیمت بیمه شخص ثالث",
    ctaText: "شروع خرید",
    image: thirdPartyCar,
    imageAlt: "تصویر خودرو برای بیمه شخص ثالث",
    variant: "active",
  },
  {
    id: "body_car",
    title: "بدنه خودرو",
    description: "استعلام و مقایسه پیشنهادهای بیمه بدنه",
    ctaText: "انتخاب این بیمه",
    image: bodyCar,
    imageAlt: "تصویر خودرو و سپر ایمنی برای بیمه بدنه",
    variant: "green",
  },
  {
    id: "third_motor",
    title: "شخص ثالث موتور",
    description: "استعلام و مقایسه قیمت بیمه موتور",
    ctaText: "انتخاب این بیمه",
    image: motorcycle,
    imageAlt: "تصویر موتورسیکلت برای بیمه شخص ثالث",
    variant: "warm",
  },
];

const containerVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, staggerChildren: 0.1, delayChildren: 0.08 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 22, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.48 },
  },
};

export function InsuranceSelection({
  selected,
  onSelect,
}: InsuranceSelectionProps) {
  const reduceMotion = useReducedMotion();
  const visualSelection = selected ?? "third_car";

  return (
    <motion.section
      id="start"
      className="insurance-selection relative isolate overflow-hidden"
      dir="rtl"
      aria-labelledby="insurance-selection-title"
      variants={reduceMotion ? undefined : containerVariants}
      initial={reduceMotion ? false : "hidden"}
      whileInView={reduceMotion ? undefined : "visible"}
      viewport={{ once: true, amount: 0.12 }}
    >
      <div className="insurance-selection__blob insurance-selection__blob--one" />
      <div className="insurance-selection__blob insurance-selection__blob--two" />

      <svg
        className="insurance-selection__path"
        viewBox="0 0 250 620"
        fill="none"
        aria-hidden="true"
      >
        <path d="M34 18c80 62 122 114 79 190-33 59-25 114 54 157 73 40 67 123 20 224" />
      </svg>

      <motion.div
        className="insurance-selection__mascot"
        aria-hidden="true"
        animate={reduceMotion ? undefined : { y: [0, -4, 0], rotate: [0, 1, 0] }}
        transition={{ duration: 5.8, repeat: Infinity, ease: "easeInOut" }}
      >
        <img src={torobMini} alt="" />
      </motion.div>

      <div className="insurance-selection__inner relative z-10 mx-auto">
        <header className="insurance-selection__header mx-auto text-center">
          <div className="insurance-selection__badge">
            <span className="insurance-selection__sparkle" aria-hidden="true">✦</span>
            بیمه، ساده‌تر از همیشه
          </div>

          <div className="insurance-selection__heading-wrap">
            <h2 id="insurance-selection-title">
              <span>از کجا</span> <em>شروع کنیم؟</em>
            </h2>
            <AccentSpark placement="heading" />
          </div>

          <p>
            نوع بیمه را انتخاب کن تا بهترین پیشنهادها را فقط درباره همان مسیر ببینی
          </p>
        </header>

        <div className="insurance-selection__cards grid">
          {insuranceOptions.map((option) => (
            <motion.div variants={reduceMotion ? undefined : cardVariants} key={option.id}>
              <InsuranceCard
                title={option.title}
                description={option.description}
                image={option.image}
                imageAlt={option.imageAlt}
                ctaText={option.ctaText}
                variant={option.variant}
                highlighted={visualSelection === option.id}
                onSelect={() => onSelect(option.id)}
              />
            </motion.div>
          ))}
        </div>

        <FeatureBar />
      </div>
    </motion.section>
  );
}
