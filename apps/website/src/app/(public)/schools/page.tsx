import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";

import { JsonLd } from "@/components/public/json-ld";
import { PageHero, Section } from "@/components/public/sections";
import { REGIONS } from "@/lib/marketing-content";
import { SchoolCard } from "@/components/public/school-card";
import { fetchSchoolCards } from "@/lib/public-schools";
import { absoluteUrl, organizationSchema, pageMetadata, schemaGraph, webPageSchema } from "@/lib/seo";

/**
 * Public, server-rendered directory of every live school on EduIgnite, as cards
 * (published sites first). Filters are plain links (crawlable); free-text search
 * results are not indexed. A "Visit website" button exists only for schools whose
 * site is published, and only those appear in the ItemList JSON-LD and sitemap.
 */

const PAGE_SIZE = 24;
type Query = { [key: string]: string | string[] | undefined };

const LEVEL_LABEL: Record<string, string> = {
  primary: "Nursery & primary",
  secondary: "Secondary",
  higher: "Higher education",
};

function one(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function read(query: Query) {
  const level = one(query.level);
  const region = one(query.region);
  const page = Math.max(1, Math.floor(Number(one(query.page))) || 1);
  return {
    level: level === "primary" || level === "secondary" || level === "higher" ? level : "",
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
  const kind = f.level === "primary" ? "Nursery and primary schools" : f.level === "secondary" ? "Secondary schools" : f.level === "higher" ? "Higher education institutions" : "Schools";
  return f.region ? `${kind} in ${f.region}, Cameroon` : `${kind} in Cameroon`;
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<Query> }): Promise<Metadata> {
  const f = read(await searchParams);
  const { total } = await fetchSchoolCards({ ...f, pageSize: PAGE_SIZE });
  const title = `${headline(f)}${f.page > 1 ? ` (page ${f.page})` : ""} | EduIgnite School Directory`;
  const description = `Browse ${headline(f).toLowerCase()} on EduIgnite and visit the websites of those that published one: news, events, gallery and online enrollment.`;
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
  const { schools, total } = await fetchSchoolCards({ ...f, pageSize: PAGE_SIZE });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Only schools with a live website belong in structured data; the others are cards for people.
  const published = schools.filter((school) => school.site_published && school.slug);
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
            description: "Schools on EduIgnite, with links to the websites they published.",
            path,
            type: "CollectionPage",
            crumbs: [{ name: "Home", path: "/" }, { name: "Schools", path: "/schools" }],
          }),
          {
            "@type": "ItemList",
            name: headline(f),
            numberOfItems: published.length,
            itemListElement: published.map((school, index) => ({
              "@type": "ListItem",
              position: index + 1,
              url: absoluteUrl(`/schools/${school.slug}`),
              name: school.name,
            })),
          },
        )}
      />
      <PageHero
        eyebrow="School directory"
        title={headline(f)}
        blurb="Every school on EduIgnite. Where a school has published its website, open it to read its news, see its events and gallery, or apply online where enrollment is open."
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

        <p className="mt-8 text-center text-sm font-semibold text-slate-600" aria-live="polite">
          {total} {total === 1 ? "school" : "schools"}
          {published.length ? ` on this page, ${published.length} with a website` : ""}
        </p>

        {schools.length === 0 ? (
          <p className="mx-auto mt-10 max-w-xl text-center text-slate-600">
            No schools match this search yet. Try another region or level, or{" "}
            <Link href="/school-account-request" className="font-semibold text-[#264D73] underline">bring your school onto EduIgnite</Link>.
          </p>
        ) : (
          <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {schools.map((school) => (
              <li key={school.handle}>
                <SchoolCard school={school} />
              </li>
            ))}
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
