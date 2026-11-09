import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { GalleryGrid } from "@/components/school-site/gallery-lightbox";
import { Pager } from "@/components/school-site/pager";
import { EmptyState, PageBanner, SchoolSite } from "@/components/school-site/school-shell";
import { DICT, schoolHref, schoolMetadata } from "@/lib/school-site";
import {
  CONTENT_TEXT, fetchSiteAlbum, fetchSiteGallery, pickPositive, type ContentText,
} from "@/lib/school-site-content";
import { loadSchool, type SchoolPageProps } from "@/lib/school-site-server";

const CATEGORIES = ["campus", "classrooms", "labs", "sports", "cultural", "events", "other"];
const ALBUMS_PER_PAGE = 6;
const PHOTOS_PER_PAGE = 24;

export async function generateMetadata(props: SchoolPageProps): Promise<Metadata> {
  const loaded = await loadSchool(props);
  if (!loaded) return { title: "School not found", robots: { index: false, follow: false } };
  const { school, lang } = loaded;
  return schoolMetadata({
    school, lang, section: "gallery", label: DICT[lang].gallery,
    description: `${CONTENT_TEXT[lang].galleryTitle} – ${school.name}. ${CONTENT_TEXT[lang].galleryLead}`,
  });
}

const plural = (n: number, text: ContentText) => `${n} ${n === 1 ? text.photo : text.photos}`;

export default async function GalleryPage(props: SchoolPageProps) {
  const loaded = await loadSchool(props);
  if (!loaded) notFound();
  const { school, lang, preview } = loaded;
  const query = await props.searchParams;
  const t = DICT[lang];
  const text = CONTENT_TEXT[lang];
  const o = { slug: school.slug, lang, preview };
  const page = pickPositive(query.page);
  const albumId = typeof query.album === "string" ? query.album : "";
  const category = typeof query.category === "string" && CATEGORIES.includes(query.category) ? query.category : "";

  const withParams = (params: Record<string, string | number | undefined>) => {
    const base = schoolHref(school, "gallery", lang, preview);
    const extra = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "" && v !== 1) extra.set(k, String(v));
    const qs = extra.toString();
    return qs ? `${base}${base.includes("?") ? "&" : "?"}${qs}` : base;
  };
  const labels = {
    close: text.close, previous: text.previous, next: text.next, image: text.image, of: text.of, enlarge: text.enlarge,
  };
  const frame = (children: React.ReactNode) => (
    <SchoolSite school={school} lang={lang} active="gallery" preview={preview} crumbs={[{ name: t.gallery, section: "gallery" }]}>
      <PageBanner school={school} lang={lang} title={text.galleryTitle} preview={preview} />
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 lg:px-8">{children}</div>
    </SchoolSite>
  );

  // One album, every photo, paginated.
  if (albumId) {
    const detail = await fetchSiteAlbum({ ...o, albumId, page, pageSize: PHOTOS_PER_PAGE });
    if (!detail) notFound();
    return frame(
      <>
        <Link href={withParams({ category })} className="text-sm font-semibold text-green-800 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700">
          ← {text.backToGallery}
        </Link>
        <h2 className="mt-4 text-2xl font-bold text-blue-950">{detail.album.title}</h2>
        <p className="mt-1 text-sm text-slate-600">
          {text.cat[detail.album.category] ?? detail.album.category} · {plural(detail.count, text)}
        </p>
        <div className="mt-6">
          <GalleryGrid images={detail.results} labels={labels} label={detail.album.title} />
        </div>
        <Pager page={detail.page} numPages={detail.num_pages} href={(p) => withParams({ album: albumId, page: p })} text={text} />
      </>,
    );
  }

  const gallery = await fetchSiteGallery({ ...o, category, page, pageSize: ALBUMS_PER_PAGE });
  const totalAlbums = gallery ? Object.values(gallery.category_counts).reduce((a, b) => a + b, 0) : 0;
  if (!gallery || totalAlbums === 0) {
    return frame(<EmptyState title={t.gallery} text={text.noGallery} />);
  }
  const chips = CATEGORIES.filter((c) => (gallery.category_counts[c] ?? 0) > 0);
  const chipClass = (on: boolean) =>
    `rounded-full px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 ${
      on ? "bg-blue-800 text-white" : "bg-slate-100 text-blue-900 hover:bg-blue-50"
    }`;

  return frame(
    <>
      <nav aria-label={text.categories} className="flex flex-wrap gap-2">
        <Link href={withParams({})} aria-current={category === "" ? "page" : undefined} className={chipClass(category === "")}>
          {text.all} ({totalAlbums})
        </Link>
        {chips.map((c) => (
          <Link key={c} href={withParams({ category: c })} aria-current={category === c ? "page" : undefined} className={chipClass(category === c)}>
            {text.cat[c] ?? c} ({gallery.category_counts[c]})
          </Link>
        ))}
      </nav>

      {gallery.results.length === 0 ? (
        <p className="mt-8 text-slate-600">{text.noGalleryCategory}</p>
      ) : (
        <div className="mt-10 space-y-14">
          {gallery.results.map((album) => (
            <section key={album.id} aria-labelledby={`album-${album.id}`}>
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 id={`album-${album.id}`} className="text-xl font-bold text-blue-950">{album.title}</h2>
                  <p className="text-sm text-slate-600">{text.cat[album.category] ?? album.category} · {plural(album.media_count, text)}</p>
                </div>
                {album.media_count > (album.media?.length ?? 0) ? (
                  <Link
                    href={withParams({ album: album.id, category })}
                    className="text-sm font-semibold text-green-800 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700"
                  >
                    {text.viewAlbum} ({album.media_count})<span className="sr-only"> : {album.title}</span>
                  </Link>
                ) : null}
              </div>
              <div className="mt-4">
                <GalleryGrid images={album.media ?? []} labels={labels} label={album.title} />
              </div>
            </section>
          ))}
        </div>
      )}
      <Pager page={gallery.page} numPages={gallery.num_pages} href={(p) => withParams({ category, page: p })} text={text} />
    </>,
  );
}
