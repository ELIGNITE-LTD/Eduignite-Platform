import type { Metadata } from "next";
import Link from "next/link";
import { MapPin, Search } from "lucide-react";

import { JsonLd } from "@/components/public/json-ld";
import { PageHero, Section } from "@/components/public/sections";
import { REGIONS } from "@/lib/marketing-content";
import { fetchSchoolDirectory, type DirectoryLevel } from "@/lib/public-schools";
import { resolveMediaUrl } from "@/lib/media";
import { absoluteUrl, organizationSchema, pageMetadata, schemaGraph, webPageSchema } from "@/lib/seo";

/**
 * Public, server-rendered directory of schools that published their website on
 * EduIgnite. Filters are plain links (crawlable); free-text search results are
 * not indexed. Only published schools ever reach this page: the API filters.
 */

const PAGE_SIZE = 24;
type Query = { [key: string]: string | string[] | undefined };

const LEVEL_LABEL: Record<string, string> = {
  primary: "Nursery & primary",
  secondary: "Secondary",
};
const BADGE: Record<DirectoryLevel, string> = {
  nursery: "Nursery", primary: "Primary", secondary: "Secondary", higher: "Higher education",
};

function one(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function read(query: Query) {
  const level = one(query.level);
  const region = one(query.region);
  const page = Math.max(1, Math.floor(Number(one(query.page))) || 1);
  return {
    level: level === "primary" || level === "secondary" ? level : "",
    region: (REGIONS as readonly string[]).includes(region) ? region : "",
    q: one(query.q).slice(0, 80),
    page,
  };
}

function href(f: { level?: string; region?: string; q?: string; page?: number }) {
  const params = new URLSearchParams();
  if (f.level) params.set("level", f.level);
  if (f.region) params.set("region", f.region);
  if (f.q) params.set("q", f.q);
  if (f.page && f.page > 1) params.set("page", String(f.page));
  const qs = params.toString();
  return qs ? `/schools?${qs}` : "/schools";
}

function headline(f: { level: string; region: string }) {
  const kind = f.level === "primary" ? "Nursery and primary schools" : f.level === "secondary" ? "Secondary schools" : "Schools";
  return f.region ? `${kind} in ${f.region}, Cameroon` : `${kind} in Cameroon`;
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<Query> }): Promise<Metadata> {
  const f = read(await searchParams);
  const { total } = await fetchSchoolDirectory({ ...f, pageSize: PAGE_SIZE });
  const title = `${headline(f)}${f.page > 1 ? ` (page ${f.page})` : ""} | EduIgnite School Directory`;
  const description = `Browse ${headline(f).toLowerCase()} with a public website on EduIgnite: find a school's news, events, gallery and online enrollment.`;
  return pageMetadata({
    title,
    description,
    path: href({ level: f.level, region: f.region, page: f.page }),
    // Search results and empty listings are for people, not for the index.
    noIndex: Boolean(f.q) || total === 0,
  });
}

export default async function SchoolDirectoryPage({ searchParams }: { searchParams: Promise<Query> }) {
  const f = read(await searchParams);
  const { schools, total } = await fetchSchoolDirectory({ ...f, pageSize: PAGE_SIZE });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const path = href({ level: f.level, region: f.region, page: f.page });

  const chip = (active: boolean) =>
    `rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
      active ? "border-[#12314d] bg-[#12314d] text-white" : "border-slate-200 bg-white text-[#264D73] hover:border-[#67D0E4]"
    }`;

  return (
    <>
      <JsonLd
        data={schemaGraph(
          organizationSchema(),
          webPageSchema({
            name: headline(f),
            description: "Schools with a public website on EduIgnite.",
            path,
            type: "CollectionPage",
            crumbs: [{ name: "Home", path: "/" }, { name: "Schools", path: "/schools" }],
          }),
          {
            "@type": "ItemList",
            name: headline(f),
            numberOfItems: total,
            itemListElement: schools.map((school, index) => ({
              "@type": "ListItem",
              position: (f.page - 1) * PAGE_SIZE + index + 1,
              url: absoluteUrl(`/schools/${school.slug}`),
              name: school.name,
            })),
          },
        )}
      />
      <PageHero
        eyebrow="School directory"
        title={headline(f)}
        blurb="Schools that publish their website on EduIgnite. Open a school to read its news, see its events and gallery, or apply online where enrollment is open."
      />
      <Section>
        <form action="/schools" method="get" role="search" className="mx-auto flex max-w-xl gap-2">
          {f.level ? <input type="hidden" name="level" value={f.level} /> : null}
          {f.region ? <input type="hidden" name="region" value={f.region} /> : null}
          <label htmlFor="school-q" className="sr-only">Search schools by name or town</label>
          <input
            id="school-q"
            name="q"
            defaultValue={f.q}
            placeholder="Search by school name or town"
            className="min-h-11 flex-1 rounded-full border border-slate-300 px-5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#67D0E4]"
          />
          <button type="submit" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#12314d] px-5 text-sm font-bold text-white">
            <Search className="h-4 w-4" aria-hidden /> Search
          </button>
        </form>

        <nav aria-label="Filter by level" className="mt-8 flex flex-wrap justify-center gap-2">
          <Link href={href({ region: f.region })} className={chip(!f.level)}>All levels</Link>
          {Object.entries(LEVEL_LABEL).map(([key, label]) => (
            <Link key={key} href={href({ level: key, region: f.region })} className={chip(f.level === key)}>{label}</Link>
          ))}
        </nav>
        <nav aria-label="Filter by region" className="mt-3 flex flex-wrap justify-center gap-2">
          <Link href={href({ level: f.level })} className={chip(!f.region)}>All regions</Link>
          {REGIONS.map((region) => (
            <Link key={region} href={href({ level: f.level, region })} className={chip(f.region === region)}>{region}</Link>
          ))}
        </nav>

        {schools.length === 0 ? (
          <p className="mx-auto mt-14 max-w-xl text-center text-slate-600">
            No published schools match this search yet. Try another region or level, or{" "}
            <Link href="/school-account-request" className="font-semibold text-[#264D73] underline">bring your school onto EduIgnite</Link>.
          </p>
        ) : (
          <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {schools.map((school) => {
              const logo = resolveMediaUrl(school.logo);
              return (
                <li key={school.slug}>
                  <Link
                    href={`/schools/${school.slug}`}
                    className="flex h-full gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(18,49,77,0.04)] transition-all hover:-translate-y-1 hover:border-[#67D0E4]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#67D0E4]"
                  >
                    {logo ? (
                      <img
                        src={logo}
                        alt={`${school.name} logo`}
                        width={56}
                        height={56}
                        loading="lazy"
                        decoding="async"
                        className="h-14 w-14 shrink-0 rounded-xl border border-slate-100 object-contain"
                      />
                    ) : (
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#12314d] text-lg font-black text-white" aria-hidden>
                        {school.name.slice(0, 1)}
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block font-serif text-lg font-bold leading-snug text-[#12314d]">{school.name}</span>
                      {school.place || school.region ? (
                        <span className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
                          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          {[school.place, school.region].filter(Boolean).join(", ")}
                        </span>
                      ) : null}
                      <span className="mt-2 flex flex-wrap gap-1.5">
                        {school.levels.map((level) => (
                          <span key={level} className="rounded-full bg-[#67D0E4]/15 px-2.5 py-0.5 text-xs font-semibold text-[#12314d]">
                            {BADGE[level]}
                          </span>
                        ))}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {pages > 1 ? (
          <nav aria-label="Pages" className="mt-12 flex items-center justify-center gap-4 text-sm font-semibold">
            {f.page > 1 ? (
              <Link rel="prev" href={href({ ...f, page: f.page - 1 })} className="text-[#264D73] underline-offset-4 hover:underline">Previous</Link>
            ) : null}
            <span className="text-slate-600">Page {f.page} of {pages}</span>
            {f.page < pages ? (
              <Link rel="next" href={href({ ...f, page: f.page + 1 })} className="text-[#264D73] underline-offset-4 hover:underline">Next</Link>
            ) : null}
          </nav>
        ) : null}

        <p className="mt-14 text-center text-sm text-slate-600">
          Is your school on EduIgnite?{" "}
          <Link href="/school-websites" className="font-semibold text-[#264D73] underline-offset-4 hover:underline">Learn how to publish your school website</Link>.
        </p>
      </Section>
    </>
  );
}
