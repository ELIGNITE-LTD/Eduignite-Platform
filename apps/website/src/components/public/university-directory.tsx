import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";

import { JsonLd } from "@/components/public/json-ld";
import { PageHero, Section } from "@/components/public/sections";
import { AWARD_LABEL, UniversityCard, type DirectoryLang } from "@/components/public/university-card";
import { REGIONS } from "@/lib/marketing-content";
import { fetchSchoolCards, type SchoolCard } from "@/lib/public-schools";
import { absoluteUrl, organizationSchema, pageMetadata, schemaGraph, webPageSchema } from "@/lib/seo";

/**
 * Public, server-rendered directory of higher-education institutions. One
 * implementation serves /universities (EN) and /universites (FR). Filters are
 * plain links and a GET form, so it works without JavaScript and stays light
 * on low bandwidth. Free-text and town searches are not indexed.
 */

export const PAGE_SIZE = 24;
export type Query = { [key: string]: string | string[] | undefined };

const PATH: Record<DirectoryLang, string> = { en: "/universities", fr: "/universites" };
const AWARDS = ["licence", "master", "doctorat", "hnd", "bts", "diploma", "certificate"] as const;
const LANGUAGES = ["anglophone", "francophone"] as const;

const T = {
  en: {
    eyebrow: "University directory",
    crumb: "Universities",
    home: "Home",
    kind: "Universities and higher institutions",
    inRegion: (kind: string, r: string) => `${kind} in ${r}, Cameroon`,
    inCameroon: (kind: string) => `${kind} in Cameroon`,
    blurb: "Find a university, institute or higher school in Cameroon: where it is, which programmes it offers (Bachelor, Master, HND, BTS and more) and which language it teaches in.",
    introTitle: "For parents and students",
    intro: "Choosing where to study is easier when you can compare options in one place. Filter by region, town, programme level and teaching language, then open an institution's website to read about its programmes and how to apply. Institutions that have not yet published a website are listed so you know they exist on EduIgnite.",
    searchLabel: "Search institutions by name or town",
    searchPlaceholder: "Search by institution name",
    cityLabel: "Town",
    cityPlaceholder: "Town, e.g. Buea",
    searchBtn: "Search",
    navRegion: "Filter by region", navAward: "Filter by programme level", navLang: "Filter by language",
    allRegions: "All regions", allAwards: "All levels", allLangs: "Any language",
    lang: { anglophone: "English-speaking", francophone: "French-speaking" } as Record<string, string>,
    count: (n: number) => `${n} ${n === 1 ? "institution" : "institutions"}`,
    withSite: (n: number) => `, ${n} with a website on this page`,
    empty: "No institutions match these filters yet. Try another region, level or language, or",
    join: "bring your institution onto EduIgnite",
    prev: "Previous", next: "Next", pages: "Pages", pageOf: (p: number, n: number) => `Page ${p} of ${n}`,
    page: (p: number) => ` (page ${p})`,
    titleSuffix: "EduIgnite University Directory",
    desc: (headline: string) => `Browse ${headline.toLowerCase()} on EduIgnite: programmes offered, teaching language and town, with links to the websites of institutions that published one.`,
    jsonDesc: "Universities and higher institutions in Cameroon on EduIgnite, with the programmes they offer.",
    allSchools: "Looking for a nursery, primary or secondary school?",
    allSchoolsLink: "Browse the school directory",
    htmlLang: "en",
  },
  fr: {
    eyebrow: "Annuaire des universités",
    crumb: "Universités",
    home: "Accueil",
    kind: "Universités et établissements d'enseignement supérieur",
    inRegion: (kind: string, r: string) => `${kind} : ${r}, Cameroun`,
    inCameroon: (kind: string) => `${kind} au Cameroun`,
    blurb: "Trouvez une université, un institut ou une grande école au Cameroun : où elle se trouve, quelles filières elle propose (Licence, Master, HND, BTS et plus) et dans quelle langue elle enseigne.",
    introTitle: "Pour les parents et les étudiants",
    intro: "Choisir où étudier est plus simple quand on compare les options au même endroit. Filtrez par région, ville, niveau de formation et langue d'enseignement, puis ouvrez le site d'un établissement pour découvrir ses filières et comment s'inscrire. Les établissements qui n'ont pas encore publié de site sont listés pour que vous sachiez qu'ils sont sur EduIgnite.",
    searchLabel: "Rechercher un établissement par nom ou ville",
    searchPlaceholder: "Rechercher par nom d'établissement",
    cityLabel: "Ville",
    cityPlaceholder: "Ville, ex. Douala",
    searchBtn: "Rechercher",
    navRegion: "Filtrer par région", navAward: "Filtrer par niveau de formation", navLang: "Filtrer par langue",
    allRegions: "Toutes les régions", allAwards: "Tous les niveaux", allLangs: "Toute langue",
    lang: { anglophone: "Anglophone", francophone: "Francophone" } as Record<string, string>,
    count: (n: number) => `${n} ${n === 1 ? "établissement" : "établissements"}`,
    withSite: (n: number) => `, dont ${n} avec un site sur cette page`,
    empty: "Aucun établissement ne correspond à ces filtres pour l'instant. Essayez une autre région, un autre niveau ou une autre langue, ou",
    join: "intégrez votre établissement à EduIgnite",
    prev: "Précédent", next: "Suivant", pages: "Pages", pageOf: (p: number, n: number) => `Page ${p} sur ${n}`,
    page: (p: number) => ` (page ${p})`,
    titleSuffix: "Annuaire des universités EduIgnite",
    desc: (headline: string) => `Parcourez ${headline.charAt(0).toLowerCase()}${headline.slice(1)} sur EduIgnite : filières proposées, langue d'enseignement et ville, avec les liens vers les sites publiés par les établissements.`,
    jsonDesc: "Universités et établissements d'enseignement supérieur du Cameroun sur EduIgnite, avec leurs filières.",
    allSchools: "Vous cherchez une école maternelle, primaire ou secondaire ?",
    allSchoolsLink: "Parcourir l'annuaire des écoles",
    htmlLang: "fr",
  },
} as const;

function one(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export type Filters = { region: string; award: string; language: string; city: string; q: string; page: number };

export function readFilters(query: Query): Filters {
  const region = one(query.region);
  const award = one(query.award).toLowerCase();
  const language = one(query.language).toLowerCase();
  return {
    region: (REGIONS as readonly string[]).includes(region) ? region : "",
    award: (AWARDS as readonly string[]).includes(award) ? award : "",
    language: (LANGUAGES as readonly string[]).includes(language) ? language : "",
    city: one(query.city).slice(0, 80),
    q: one(query.q).slice(0, 80),
    page: Math.max(1, Math.floor(Number(one(query.page))) || 1),
  };
}

export function directoryHref(lang: DirectoryLang, f: Partial<Filters>) {
  const params = new URLSearchParams();
  if (f.region) params.set("region", f.region);
  if (f.award) params.set("award", f.award);
  if (f.language) params.set("language", f.language);
  if (f.city) params.set("city", f.city);
  if (f.q) params.set("q", f.q);
  if (f.page && f.page > 1) params.set("page", String(f.page));
  const qs = params.toString();
  return qs ? `${PATH[lang]}?${qs}` : PATH[lang];
}

function headline(lang: DirectoryLang, f: Filters) {
  const t = T[lang];
  return f.region ? t.inRegion(t.kind, f.region) : t.inCameroon(t.kind);
}

function fetchFor(f: Filters) {
  return fetchSchoolCards({
    level: "higher", region: f.region, award: f.award, language: f.language, city: f.city, q: f.q,
    page: f.page, pageSize: PAGE_SIZE,
  });
}

export async function universityDirectoryMetadata(lang: DirectoryLang, query: Query): Promise<Metadata> {
  const t = T[lang];
  const f = readFilters(query);
  const { total } = await fetchFor(f);
  const other: DirectoryLang = lang === "en" ? "fr" : "en";
  const key = (l: DirectoryLang) => (l === "en" ? "en-CM" : "fr-CM");
  const canonicalFilters = { region: f.region, award: f.award, language: f.language, page: f.page };
  const meta = pageMetadata({
    title: `${headline(lang, f)}${f.page > 1 ? t.page(f.page) : ""} | ${t.titleSuffix}`,
    description: t.desc(headline(lang, f)),
    path: directoryHref(lang, canonicalFilters),
    // Free-text, town searches and empty listings are for people, not for the index.
    noIndex: Boolean(f.q || f.city) || total === 0,
    languages: {
      [key(lang)]: directoryHref(lang, canonicalFilters),
      [key(other)]: directoryHref(other, canonicalFilters),
      "x-default": directoryHref("en", canonicalFilters),
    },
  });
  return {
    ...meta,
    openGraph: { ...meta.openGraph, locale: lang === "fr" ? "fr_CM" : "en_US" },
  };
}

function universityListItem(school: SchoolCard, position: number) {
  return {
    "@type": "ListItem",
    position,
    url: absoluteUrl(`/schools/${school.slug}`),
    item: {
      "@type": "CollegeOrUniversity",
      name: school.name,
      url: absoluteUrl(`/schools/${school.slug}`),
      ...(school.logo_url ? { logo: school.logo_url } : {}),
      address: {
        "@type": "PostalAddress",
        ...(school.place ? { addressLocality: school.place } : {}),
        ...(school.region ? { addressRegion: school.region } : {}),
        addressCountry: "CM",
      },
    },
  };
}

export async function UniversityDirectory({ lang, query }: { lang: DirectoryLang; query: Query }) {
  const t = T[lang];
  const f = readFilters(query);
  const { schools, total } = await fetchFor(f);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Only institutions with a live website belong in structured data.
  const published = schools.filter((s) => s.site_published && s.slug);
  const path = directoryHref(lang, { region: f.region, award: f.award, language: f.language, page: f.page });

  const chip = (active: boolean) =>
    `inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold transition-colors ${
      active ? "border-[#12314d] bg-[#12314d] text-white" : "border-slate-200 bg-white text-[#264D73] hover:border-[#67D0E4]"
    }`;

  return (
    <>
      <JsonLd
        data={schemaGraph(
          organizationSchema(),
          webPageSchema({
            name: headline(lang, f),
            description: t.jsonDesc,
            path,
            type: "CollectionPage",
            inLanguage: lang,
            crumbs: [{ name: t.home, path: "/" }, { name: t.crumb, path: PATH[lang] }],
          }),
          {
            "@type": "ItemList",
            name: headline(lang, f),
            numberOfItems: published.length,
            itemListElement: published.map((s, i) => universityListItem(s, i + 1)),
          },
        )}
      />
      <PageHero eyebrow={t.eyebrow} title={headline(lang, f)} blurb={t.blurb} />
      <Section>
        <div lang={t.htmlLang} className="mx-auto max-w-3xl rounded-2xl bg-slate-50 p-5 text-sm leading-relaxed text-slate-700">
          <h2 className="font-serif text-base font-bold text-[#12314d]">{t.introTitle}</h2>
          <p className="mt-1">{t.intro}</p>
        </div>

        <form action={PATH[lang]} method="get" role="search" className="mx-auto mt-8 grid max-w-3xl gap-2 sm:grid-cols-[1fr_12rem_auto]">
          {f.region ? <input type="hidden" name="region" value={f.region} /> : null}
          {f.award ? <input type="hidden" name="award" value={f.award} /> : null}
          {f.language ? <input type="hidden" name="language" value={f.language} /> : null}
          <label htmlFor="uni-q" className="sr-only">{t.searchLabel}</label>
          <input
            id="uni-q"
            name="q"
            defaultValue={f.q}
            placeholder={t.searchPlaceholder}
            className="min-h-11 rounded-full border border-slate-300 px-5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#67D0E4]"
          />
          <label htmlFor="uni-city" className="sr-only">{t.cityLabel}</label>
          <input
            id="uni-city"
            name="city"
            defaultValue={f.city}
            placeholder={t.cityPlaceholder}
            className="min-h-11 rounded-full border border-slate-300 px-5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#67D0E4]"
          />
          <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#12314d] px-5 text-sm font-bold text-white">
            <Search className="h-4 w-4" aria-hidden /> {t.searchBtn}
          </button>
        </form>

        <nav aria-label={t.navAward} className="mt-8 flex flex-wrap justify-center gap-2">
          <Link href={directoryHref(lang, { ...f, award: "", page: 1 })} className={chip(!f.award)}>{t.allAwards}</Link>
          {AWARDS.map((award) => (
            <Link key={award} href={directoryHref(lang, { ...f, award, page: 1 })} className={chip(f.award === award)}>
              {AWARD_LABEL[lang][award]}
            </Link>
          ))}
        </nav>
        <nav aria-label={t.navLang} className="mt-3 flex flex-wrap justify-center gap-2">
          <Link href={directoryHref(lang, { ...f, language: "", page: 1 })} className={chip(!f.language)}>{t.allLangs}</Link>
          {LANGUAGES.map((language) => (
            <Link key={language} href={directoryHref(lang, { ...f, language, page: 1 })} className={chip(f.language === language)}>
              {t.lang[language]}
            </Link>
          ))}
        </nav>
        <nav aria-label={t.navRegion} className="mt-3 flex flex-wrap justify-center gap-2">
          <Link href={directoryHref(lang, { ...f, region: "", page: 1 })} className={chip(!f.region)}>{t.allRegions}</Link>
          {REGIONS.map((region) => (
            <Link key={region} href={directoryHref(lang, { ...f, region, page: 1 })} className={chip(f.region === region)}>{region}</Link>
          ))}
        </nav>

        <p className="mt-8 text-center text-sm font-semibold text-slate-600" aria-live="polite">
          {t.count(total)}
          {published.length ? t.withSite(published.length) : ""}
        </p>

        {schools.length === 0 ? (
          <p className="mx-auto mt-10 max-w-xl text-center text-slate-600">
            {t.empty}{" "}
            <Link href="/school-account-request" className="font-semibold text-[#264D73] underline">{t.join}</Link>.
          </p>
        ) : (
          <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {schools.map((school) => (
              <li key={school.handle}>
                <UniversityCard school={school} lang={lang} />
              </li>
            ))}
          </ul>
        )}

        {pages > 1 ? (
          <nav aria-label={t.pages} className="mt-12 flex items-center justify-center gap-4 text-sm font-semibold">
            {f.page > 1 ? (
              <Link rel="prev" href={directoryHref(lang, { ...f, page: f.page - 1 })} className="inline-flex min-h-11 items-center text-[#264D73] underline-offset-4 hover:underline">{t.prev}</Link>
            ) : null}
            <span className="text-slate-600">{t.pageOf(f.page, pages)}</span>
            {f.page < pages ? (
              <Link rel="next" href={directoryHref(lang, { ...f, page: f.page + 1 })} className="inline-flex min-h-11 items-center text-[#264D73] underline-offset-4 hover:underline">{t.next}</Link>
            ) : null}
          </nav>
        ) : null}

        <p className="mt-14 text-center text-sm text-slate-600">
          {t.allSchools}{" "}
          <Link href="/schools" className="font-semibold text-[#264D73] underline-offset-4 hover:underline">{t.allSchoolsLink}</Link>.
        </p>
      </Section>
    </>
  );
}
