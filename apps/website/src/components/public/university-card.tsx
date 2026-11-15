import Link from "next/link";
import { ArrowRight, GraduationCap, MapPin } from "lucide-react";

import type { SchoolCard } from "@/lib/public-schools";

export type DirectoryLang = "en" | "fr";

export const AWARD_LABEL: Record<DirectoryLang, Record<string, string>> = {
  en: {
    licence: "Bachelor / Licence", master: "Master", doctorat: "PhD / Doctorate", hnd: "HND",
    bts: "BTS", diploma: "Diploma", certificate: "Certificate", other: "Other",
  },
  fr: {
    licence: "Licence", master: "Master", doctorat: "Doctorat", hnd: "HND",
    bts: "BTS", diploma: "Diplôme", certificate: "Certificat", other: "Autre",
  },
};

const COPY = {
  en: {
    visit: "Visit website", visitLabel: (n: string) => `Visit the website of ${n}`, none: "Website not published yet",
    programmes: (n: number) => `${n} ${n === 1 ? "programme" : "programmes"}`, levels: "Programme levels",
    logo: (n: string) => `Logo of ${n}`, noLogo: (n: string) => `${n} (no logo)`,
  },
  fr: {
    visit: "Visiter le site", visitLabel: (n: string) => `Visiter le site de ${n}`, none: "Site pas encore publié",
    programmes: (n: number) => `${n} ${n === 1 ? "filière" : "filières"}`, levels: "Niveaux de formation",
    logo: (n: string) => `Logo de ${n}`, noLogo: (n: string) => `${n} (sans logo)`,
  },
} as const;

function initials(name: string): string {
  const words = name.split(/\s+/).filter((w) => /^[\p{L}\p{N}]/u.test(w) && w.length > 2);
  const letters = (words.length ? words : name.split(/\s+/)).slice(0, 2).map((w) => w.charAt(0));
  return letters.join("").toUpperCase() || "U";
}

/**
 * One institution in the university directory. Same visual language as the
 * school card; the website button exists only when the site is published.
 */
export function UniversityCard({ school, lang }: { school: SchoolCard; lang: DirectoryLang }) {
  const t = COPY[lang];
  const place = [school.place, school.region].filter(Boolean).join(", ");
  return (
    <article className="group relative flex h-full flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(18,49,77,0.04)] transition-all duration-200 hover:-translate-y-1 hover:border-[#67D0E4]/60 hover:shadow-[0_12px_28px_-12px_rgba(18,49,77,0.25)] focus-within:ring-2 focus-within:ring-[#67D0E4]">
      <div className="flex h-24 items-center justify-center rounded-xl bg-gradient-to-br from-slate-50 to-[#67D0E4]/10">
        {school.logo_url ? (
          <img
            src={school.logo_url}
            alt={t.logo(school.name)}
            width={80}
            height={80}
            loading="lazy"
            decoding="async"
            className="h-20 w-20 rounded-xl bg-white object-contain p-1 shadow-sm ring-1 ring-slate-100"
          />
        ) : (
          <span
            role="img"
            aria-label={t.noLogo(school.name)}
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
      ) : null}

      {school.programme_count > 0 ? (
        <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-[#12314d]">
          <GraduationCap className="h-4 w-4 shrink-0 text-[#264D73]" aria-hidden />
          {t.programmes(school.programme_count)}
        </p>
      ) : null}

      {school.award_levels.length ? (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label={t.levels}>
          {school.award_levels.map((award) => (
            <li key={award} className="rounded-full bg-[#67D0E4]/15 px-2.5 py-0.5 text-xs font-semibold text-[#12314d]">
              {AWARD_LABEL[lang][award] ?? award}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-auto pt-5">
        {school.site_published && school.slug ? (
          <Link
            href={`/schools/${school.slug}`}
            aria-label={t.visitLabel(school.name)}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[#12314d] px-5 text-sm font-bold text-white transition-colors hover:bg-[#264D73] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#67D0E4] focus-visible:ring-offset-2"
          >
            {t.visit} <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        ) : (
          <p className="text-center text-xs text-slate-500">{t.none}</p>
        )}
      </div>
    </article>
  );
}
