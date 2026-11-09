import Link from "next/link";
import { MapPin } from "lucide-react";

import type { PublicSchool, SchoolLang } from "@/lib/public-schools";
import { badgeDay, badgeMonth, dateRange, type ContentText, type SiteEventCard } from "@/lib/school-site-content";
import { schoolHref } from "@/lib/school-site";
import { isHigherSchool } from "@/lib/school-site-higher";

/** Event path: /schools/{slug}/events/{event-slug} (the shared helper only knows top-level sections). */
export function eventHref(
  school: Pick<PublicSchool, "slug" | "default_language">,
  eventSlug: string,
  lang: SchoolLang,
  preview?: string,
) {
  const base = schoolHref(school, "events", lang, preview);
  const [path, query] = base.split("?");
  return `${path}/${encodeURIComponent(eventSlug)}${query ? `?${query}` : ""}`;
}

export function DateBadge({ iso, lang }: { iso: string; lang: SchoolLang }) {
  return (
    <div className="flex h-16 w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-blue-800 text-white" aria-hidden>
      <span className="text-2xl font-bold leading-none">{badgeDay(iso, lang)}</span>
      <span className="mt-1 text-xs font-semibold uppercase tracking-wide">{badgeMonth(iso, lang)}</span>
    </div>
  );
}

export function EventCard({
  event, school, lang, preview, text,
}: { event: SiteEventCard; school: PublicSchool; lang: SchoolLang; preview?: string; text: ContentText }) {
  const href = eventHref(school, event.slug, lang, preview);
  if (isHigherSchool(school)) {
    return (
      <li className="flex gap-6 border-t border-[var(--he-line)] py-7">
        <div className="w-16 shrink-0 text-center" aria-hidden>
          <span className="he-display block text-5xl leading-none text-[var(--he-text)]">{badgeDay(event.start_at, lang)}</span>
          <span className="mt-1 block text-sm font-medium text-[var(--he-accent)]">{badgeMonth(event.start_at, lang)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-[var(--he-accent)]">{text.cat[event.category] ?? event.category}</p>
          <h3 className="he-serif mt-1 text-2xl font-medium leading-snug text-[var(--he-text)]">
            <Link href={href} className="underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--he-accent)]">{event.title}</Link>
          </h3>
          <p className="mt-2 text-sm text-[var(--he-muted)]">{dateRange(event.start_at, event.end_at, lang)}</p>
          {event.location ? (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-[var(--he-muted)]"><MapPin className="h-4 w-4 shrink-0" aria-hidden /> {event.location}</p>
          ) : null}
        </div>
        {event.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.cover} alt="" loading="lazy" decoding="async" className="hidden aspect-[4/3] w-40 shrink-0 object-cover sm:block" style={{ borderRadius: 2 }} />
        ) : null}
      </li>
    );
  }
  return (
    <li className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {event.cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={event.cover} alt="" loading="lazy" decoding="async" className="aspect-[16/9] w-full object-cover" />
      ) : null}
      <div className="flex flex-1 gap-4 p-5">
        <DateBadge iso={event.start_at} lang={lang} />
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="text-xs font-semibold uppercase tracking-wide text-green-800">{text.cat[event.category] ?? event.category}</p>
          <h3 className="mt-1 text-lg font-bold leading-snug text-blue-950">
            <Link href={href} className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700">
              {event.title}
            </Link>
          </h3>
          <p className="mt-1 text-sm text-slate-600">{dateRange(event.start_at, event.end_at, lang)}</p>
          {event.location ? (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
              <MapPin className="h-4 w-4 shrink-0" aria-hidden /> {event.location}
            </p>
          ) : null}
          <Link href={href} className="mt-auto pt-4 text-sm font-semibold text-green-800 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700">
            {text.viewEvent}
            <span className="sr-only"> : {event.title}</span>
          </Link>
        </div>
      </div>
    </li>
  );
}
