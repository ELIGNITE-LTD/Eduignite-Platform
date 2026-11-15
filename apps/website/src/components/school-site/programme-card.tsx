import Link from "next/link";

import { excerpt } from "@/lib/school-site";
import { durationLabel, type ProgText, type Programme } from "@/lib/school-site-programmes";

/** One programme of a higher-education institution; renders only the facts the institution published. */
export function ProgrammeCard({ programme: p, pt, href, showLevel = false }: { programme: Programme; pt: ProgText; href?: string; showLevel?: boolean }) {
  const facts = [
    p.duration_years ? durationLabel(p.duration_years, pt) : "",
    p.required_credits ? `${p.required_credits} ${pt.credits}` : "",
  ].filter(Boolean);
  const title = <span className="he-serif text-xl font-medium leading-snug text-[var(--he-text)]">{p.name}</span>;
  return (
    <li id={`programme-${p.id}`} className="he-prog relative flex scroll-mt-28 flex-col border border-[var(--he-line)] bg-[var(--he-surface)] p-6" style={{ borderRadius: 3 }}>
      {showLevel && p.award_level_label ? (
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--he-accent)]">{p.award_level_label}</p>
      ) : null}
      <h3 className={showLevel && p.award_level_label ? "mt-2" : ""}>
        {href ? (
          <Link href={href} className="after:absolute after:inset-0 focus-visible:outline-none focus-visible:underline">{title}</Link>
        ) : title}
      </h3>
      {p.department_name ? <p className="mt-2 text-sm text-[var(--he-muted)]">{p.department_name}</p> : null}
      {p.description ? <p className="mt-3 text-[15px] leading-relaxed text-[var(--he-muted)]">{excerpt(p.description, 150)}</p> : null}
      {facts.length ? (
        <p className="mt-auto pt-5 text-sm font-medium text-[var(--he-text)]">{facts.join("  ·  ")}</p>
      ) : null}
    </li>
  );
}
