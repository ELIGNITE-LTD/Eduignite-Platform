import Link from "next/link";

import { EventCard } from "@/components/school-site/event-card";
import { GalleryGrid } from "@/components/school-site/gallery-lightbox";
import type { PublicSchool, SchoolLang } from "@/lib/public-schools";
import { schoolHref } from "@/lib/school-site";
import { isHigherSchool, tFor } from "@/lib/school-site-higher";
import { CONTENT_TEXT, fetchSiteEvents, fetchSiteGallery, type GalleryImage } from "@/lib/school-site-content";

type Props = { school: PublicSchool; lang: SchoolLang; preview?: string };

const SEE_ALL =
  "text-sm font-semibold text-green-800 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700";

/** Home-page strip of ongoing and upcoming events. Renders nothing when there are none. */
export async function HomeEventsStrip({ school, lang, preview }: Props) {
  const o = { slug: school.slug, lang, preview, pageSize: 3 };
  const [ongoing, upcoming] = await Promise.all([
    fetchSiteEvents({ ...o, when: "ongoing" }),
    fetchSiteEvents({ ...o, when: "upcoming" }),
  ]);
  const events = [...(ongoing?.results ?? []), ...(upcoming?.results ?? [])].slice(0, 3);
  if (events.length === 0) return null;
  const text = CONTENT_TEXT[lang];
  if (isHigherSchool(school)) {
    const t = tFor(school, lang);
    return (
      <section className="bg-[var(--he-paper)] py-20 sm:py-28" aria-labelledby="home-events">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-12 lg:px-10">
          <div className="lg:col-span-4">
            <h2 id="home-events" className="text-4xl font-medium leading-tight text-[var(--he-text)] sm:text-5xl">{t.upcomingEvents}</h2>
            <Link href={schoolHref(school, "events", lang, preview)} className="mt-6 inline-block text-sm font-semibold text-[var(--he-accent)] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--he-accent)]">
              {t.allEvents}
            </Link>
          </div>
          <ul className="border-b border-[var(--he-line)] lg:col-span-8">
            {events.map((event) => (
              <EventCard key={event.slug} event={event} school={school} lang={lang} preview={preview} text={text} />
            ))}
          </ul>
        </div>
      </section>
    );
  }
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:px-8" aria-labelledby="home-events">
      <div className="flex items-end justify-between gap-4">
        <h2 id="home-events" className="text-2xl font-bold text-blue-950">{text.upcomingEvents}</h2>
        <Link href={schoolHref(school, "events", lang, preview)} className={SEE_ALL}>{text.viewAllEvents}</Link>
      </div>
      <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {events.map((event) => (
          <EventCard key={event.slug} event={event} school={school} lang={lang} preview={preview} text={text} />
        ))}
      </ul>
    </section>
  );
}

/** Home-page gallery preview built from the first photos of published albums. Renders nothing when empty. */
export async function HomeGalleryPreview({ school, lang, preview }: Props) {
  const gallery = await fetchSiteGallery({ slug: school.slug, lang, preview, pageSize: 4 });
  const images: GalleryImage[] = (gallery?.results ?? []).flatMap((a) => a.media ?? []).slice(0, 8);
  if (images.length === 0) return null;
  const text = CONTENT_TEXT[lang];
  const labels = {
    close: text.close, previous: text.previous, next: text.next, image: text.image, of: text.of, enlarge: text.enlarge,
  };
  if (isHigherSchool(school)) {
    const t = tFor(school, lang);
    return (
      <section className="bg-[var(--he-surface)] py-20 sm:py-28" aria-labelledby="home-gallery">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-10">
          <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
            <h2 id="home-gallery" className="text-4xl font-medium leading-tight text-[var(--he-text)] sm:text-5xl">{t.galleryPreview}</h2>
            <Link href={schoolHref(school, "gallery", lang, preview)} className="text-sm font-semibold text-[var(--he-accent)] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--he-accent)]">
              {t.campusGallery}
            </Link>
          </div>
          <GalleryGrid images={images} labels={labels} label={t.galleryPreview} masonry />
        </div>
      </section>
    );
  }
  return (
    <section className="bg-slate-50 py-14" aria-labelledby="home-gallery">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-4">
          <h2 id="home-gallery" className="text-2xl font-bold text-blue-950">{text.galleryPreview}</h2>
          <Link href={schoolHref(school, "gallery", lang, preview)} className={SEE_ALL}>{text.seeGallery}</Link>
        </div>
        <div className="mt-6">
          <GalleryGrid images={images} labels={labels} label={text.galleryPreview} />
        </div>
      </div>
    </section>
  );
}
