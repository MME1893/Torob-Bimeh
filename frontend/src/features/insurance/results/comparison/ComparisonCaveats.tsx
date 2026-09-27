import { Info } from "lucide-react";

type Props = {
  notes: string[];
};

/** Pale-beige advisory box under the comparison matrix. */
export function ComparisonCaveats({ notes }: Props) {
  if (!notes.length) return null;
  return (
    <section className="irc-caveats">
      <h4>
        <Info aria-hidden="true" />
        نکات قابل توجه
      </h4>
      <ul>
        {notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </section>
  );
}
