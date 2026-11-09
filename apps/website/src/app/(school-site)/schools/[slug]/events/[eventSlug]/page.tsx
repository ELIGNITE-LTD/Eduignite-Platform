import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, MapPin, Tag } from "lucide-react";

import { PageBanner, SchoolSite } from "@/components/school-site/school-shell";
import { absoluteImage, schoolPlace } from "@/lib/public-schools";
import { DICT, canonicalUrl, excerpt, schoolHref, schoolMetadata } from "@/lib/school-site";
import { CONTENT_TEXT, dateRange, fetchSiteEvent } from "@/lib/school-site-content";
import { loadSchool, type SchoolPageProps } from "@/lib/school-site-server";

type Props = { params: Promise<{ slug: string; eventSlug: string }>; searchParams: SchoolPageProps["searchParams"] };

async function load(props: Props) {
  const loaded = await loadSchool(props);
  if (!loaded) return null;
  const { eventSlug } = await props.params;
  const event = await fetchSiteEvent({ slug: loaded.school.slug, lang: loaded.lang, preview: loaded.preview, eventSlug });
  return event ? { ...loaded, event } : null;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const data = await load(props);
  if (!data) return { title: "Event not found", robots: { index: false, follow: false } };
  const { school, lang, event } = data;
  const base = schoolMetadata({
    school, lang, section: "events", label: event.title,
    description: excerpt(event.description || `${event.title} – ${school.name}`),
  });
  const url = `${canonicalUrl(school, "events", lang).split("?")[0]}/${encodeURIComponent(event.slug)}`;
  const cover = absoluteImage(event.cover);
  return {
    ...base,
    alternates: { canonical: url },
    openGraph: {
      ...base.openGraph, type: "article", url, title: `${event.title} | ${school.name}`,
      images: cover ? [{ url: cover, alt: event.title }] : base.openGraph?.images,
    },
  };
}

export default async function EventDetailPage(props: Props) {
  const data = await load(props);
  if (!data) notFound();
  const { school, lang, preview, event } = data;
  const t = DICT[lang];
  const text = CONTENT_TEXT[lang];
  const url = `${canonicalUrl(school, "events", lang).split("?")[0]}/${encodeURIComponent(event.slug)}`;
  const place = schoolPlace(school);
  const cover = absoluteImage(event.cover);

  // Schema.org Event, describing only what this page visibly shows.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    description: event.description || undefined,
    startDate: event.start_at,
    endDate: event.end_at || undefined,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    inLanguage: lang,
    url,
    image: cover ? [cover] : undefined,
    location: {
      "@type": "Place",
      name: event.location || school.name,
      address: { "@type": "PostalAddress", addressLocality: place || undefined, addressCountry: "CM" },
    },
    organizer: { "@type": "School", name: school.name, url: canonicalUrl(school, "", lang) },
  };

  return (
    <SchoolSite
      school={school} lang={lang} active="events" preview={preview}
      crumbs={[{ name: t.events, section: "events" }]}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <PageBanner school={school} lang={lang} title={event.title} preview={preview} />
      <article className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        {event.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.cover} alt="" decoding="async" className="mb-8 max-h-[28rem] w-full rounded-2xl object-cover" />
        ) : null}
        <p className="inline-block rounded-full bg-green-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-green-900">
          <span className="sr-only">{text.eventStatus}: </span>{text[event.bucket]}
        </p>
        <dl className="mt-6 grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:grid-cols-2">
          <div className="flex gap-3">
            <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-blue-800" aria-hidden />
            <div><dt className="text-xs font-semibold uppercase text-slate-500">{text.when}</dt>
              <dd className="font-medium text-blue-950">{dateRange(event.start_at, event.end_at, lang)}</dd></div>
          </div>
          {event.location ? (
            <div className="flex gap-3">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-blue-800" aria-hidden />
              <div><dt className="text-xs font-semibold uppercase text-slate-500">{text.where}</dt>
                <dd className="font-medium text-blue-950">{event.location}</dd></div>
            </div>
          ) : null}
          <div className="flex gap-3">
            <Tag className="mt-0.5 h-5 w-5 shrink-0 text-blue-800" aria-hidden />
            <div><dt className="text-xs font-semibold uppercase text-slate-500">{text.category}</dt>
              <dd className="font-medium text-blue-950">{text.cat[event.category] ?? event.category}</dd></div>
          </div>
        </dl>
        {event.description ? (
          <div className="mt-8 whitespace-pre-line leading-7 text-slate-700">{event.description}</div>
        ) : null}
        <Link
          href={schoolHref(school, "events", lang, preview)}
          className="mt-10 inline-block text-sm font-semibold text-green-800 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700"
        >
          ← {text.backToEvents}
        </Link>
      </article>
    </SchoolSite>
  );
}
