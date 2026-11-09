import Link from "next/link";
import { ArrowRight, Globe2, MapPin } from "lucide-react";

import type { DirectoryLevel, SchoolCard as SchoolCardData } from "@/lib/public-schools";

/**
 * One school in the public directory. The "Visit website" button exists only
 * when the school's website is published; unpublished schools get a muted,
 * non-interactive note instead (never a link).
 */

const BADGE: Record<DirectoryLevel, string> = {
  nursery: "Nursery", primary: "Primary", secondary: "Secondary", higher: "Higher education",
};

/** Nursery + primary read as one pill, like the level filter. */
function levelPills(levels: DirectoryLevel[]): string[] {
  const out: string[] = [];
  const basic = levels.filter((l) => l === "nursery" || l === "primary");
  if (basic.length === 2) out.push("Nursery & Primary");
  else basic.forEach((l) => out.push(BADGE[l]));
  levels.filter((l) => l === "secondary" || l === "higher").forEach((l) => out.push(BADGE[l]));
  return out;
}

function initials(name: string): string {
  const words = name.split(/\s+/).filter((w) => /^[\p{L}\p{N}]/u.test(w) && w.length > 2);
  const letters = (words.length ? words : name.split(/\s+/)).slice(0, 2).map((w) => w.charAt(0));
  return letters.join("").toUpperCase() || "S";
}

export function SchoolCard({ school }: { school: SchoolCardData }) {
  const place = [school.place, school.region].filter(Boolean).join(", ");
  const pills = levelPills(school.levels);
  return (
    <article className="group relative flex h-full flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(18,49,77,0.04)] transition-all duration-200 hover:-translate-y-1 hover:border-[#67D0E4]/60 hover:shadow-[0_12px_28px_-12px_rgba(18,49,77,0.25)] focus-within:ring-2 focus-within:ring-[#67D0E4]">
      {school.site_published ? (
        <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
          <Globe2 className="h-3 w-3" aria-hidden /> Website available
        </span>
      ) : null}

      <div className="flex h-24 items-center justify-center rounded-xl bg-gradient-to-br from-slate-50 to-[#67D0E4]/10">
        {school.logo_url ? (
          <img
            src={school.logo_url}
            alt={`Logo of ${school.name}`}
            width={80}
            height={80}
            loading="lazy"
            decoding="async"
            className="h-20 w-20 rounded-xl bg-white object-contain p-1 shadow-sm ring-1 ring-slate-100"
          />
        ) : (
          <span
            role="img"
            aria-label={`${school.name} (no logo)`}
            className="flex h-20 w-20 items-center justify-center rounded-xl bg-[#12314d] font-serif text-2xl font-black tracking-wide text-white shadow-sm"
          >
            {initials(school.name)}
          </span>
        )}
      </div>

      <h2 className="mt-4 line-clamp-2 min-h-[3.25rem] font-serif text-lg font-bold leading-snug text-[#12314d]">
        {school.name}
      </h2>

      {place ? (
        <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-[#264D73]" aria-hidden />
          <span className="truncate">{place}</span>
        </p>
      ) : (
        <p className="mt-1 h-5" aria-hidden />
      )}

      {pills.length ? (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Levels">
          {pills.map((pill) => (
            <li key={pill} className="rounded-full bg-[#67D0E4]/15 px-2.5 py-0.5 text-xs font-semibold text-[#12314d]">
              {pill}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-auto pt-5">
        {school.site_published && school.slug ? (
          <Link
            href={`/schools/${school.slug}`}
            aria-label={`Visit the website of ${school.name}`}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[#12314d] px-5 text-sm font-bold text-white transition-colors hover:bg-[#264D73] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#67D0E4] focus-visible:ring-offset-2"
          >
            Visit website <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        ) : (
          <p className="text-center text-xs text-slate-500">Website not published yet</p>
        )}
      </div>
    </article>
  );
}
