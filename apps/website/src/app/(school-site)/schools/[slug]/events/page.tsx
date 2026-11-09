import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EventCard } from "@/components/school-site/event-card";
import { Pager } from "@/components/school-site/pager";
import { EmptyState, PageBanner, SchoolSite } from "@/components/school-site/school-shell";
import { DICT, schoolHref, schoolMetadata } from "@/lib/school-site";
import { tFor } from "@/lib/school-site-higher";
import {
  CONTENT_TEXT, EVENT_BUCKETS, fetchSiteEvents, pickPositive, type EventBucket,
} from "@/lib/school-site-content";
import { loadSchool, type SchoolPageProps } from "@/lib/school-site-server";

export async function generateMetadata(props: SchoolPageProps): Promise<Metadata> {
  const loaded = await loadSchool(props);
  if (!loaded) return { title: "School not found", robots: { index: false, follow: false } };
  const { school, lang } = loaded;
  return schoolMetadata({
    school, lang, section: "events", label: DICT[lang].events,
    description: `${CONTENT_TEXT[lang].eventsTitle} – ${school.name}. ${CONTENT_TEXT[lang].eventsLead}`,
  });
}

export default async function EventsPage(props: SchoolPageProps) {
  const loaded = await loadSchool(props);
  if (!loaded) notFound();
  const { school, lang, preview } = loaded;
  const query = await props.searchParams;
  const t = tFor(school, lang);
  const text = CONTENT_TEXT[lang];
  const o = { slug: school.slug, lang, preview };

  const requested = typeof query.when === "string" && (EVENT_BUCKETS as string[]).includes(query.when)
    ? (query.when as EventBucket) : null;
  const page = pickPositive(query.page);
  let active: EventBucket = requested ?? "upcoming";
  let list = await fetchSiteEvents({ ...o, when: active, page });
  // With no explicit tab, open the first period that has something to show.
  if (list && !requested) {
    const first = EVENT_BUCKETS.find((b) => list!.counts[b] > 0);
    if (first && first !== active) {
      active = first;
      list = await fetchSiteEvents({ ...o, when: active, page });
    }
  }
  const total = list ? list.counts.upcoming + list.counts.ongoing + list.counts.past : 0;
  const hrefFor = (when: EventBucket, p = 1) => {
    const base = schoolHref(school, "events", lang, preview);
    const extra = new URLSearchParams({ when });
    if (p > 1) extra.set("page", String(p));
    return `${base}${base.includes("?") ? "&" : "?"}${extra.toString()}`;
  };
  const emptyText = { upcoming: text.noUpcoming, ongoing: text.noOngoing, past: text.noPast }[active];

  return (
    <SchoolSite school={school} lang={lang} active="events" preview={preview} crumbs={[{ name: t.events, section: "events" }]}>
      <PageBanner school={school} lang={lang} title={text.eventsTitle} preview={preview} />
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        {!list || total === 0 ? (
          <EmptyState title={t.events} text={text.noEvents} />
        ) : (
          <>
            <nav aria-label={text.eventTabs} className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
              {EVENT_BUCKETS.map((b) => (
                <Link
                  key={b}
                  href={hrefFor(b)}
                  aria-current={b === active ? "page" : undefined}
                  className={`rounded-full px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 ${
                    b === active ? "bg-blue-800 text-white" : "bg-slate-100 text-blue-900 hover:bg-blue-50"
                  }`}
                >
                  {text[b]} <span className="ml-1 opacity-80">({list!.counts[b]})</span>
                </Link>
              ))}
            </nav>
            {list.results.length === 0 ? (
              <p className="mt-8 text-slate-600">{emptyText}</p>
            ) : (
              <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {list.results.map((event) => (
                  <EventCard key={event.slug} event={event} school={school} lang={lang} preview={preview} text={text} />
                ))}
              </ul>
            )}
            <Pager page={list.page} numPages={list.num_pages} href={(p) => hrefFor(active, p)} text={text} />
          </>
        )}
      </div>
    </SchoolSite>
  );
}
