import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Camera, Video as VideoIcon } from "lucide-react";

import { JsonLd } from "@/components/public/json-ld";
import { Section } from "@/components/public/sections";
import { GalleryTile } from "@/components/public/content-cards";
import { fetchGallery, toEmbedUrl, type GalleryItem } from "@/lib/public-site";
import { VideoEmbed } from "@/components/public/video-embed";
import {
  absoluteUrl,
  breadcrumbSchema,
  organizationSchema,
  pageMetadata,
  schemaGraph,
  toDescription,
} from "@/lib/seo";

/**
 * One gallery item, with the whole story under it.
 *
 * The tiles clamp their caption to two lines, which is right for a grid and
 * wrong for anyone who wants to know what they are looking at - the rest of
 * the text was in the data and reachable nowhere. This is where "Read more"
 * goes.
 *
 * The item is found in the gallery listing rather than fetched on its own.
 * That listing is a single cached call of at most 48 curated items, so a
 * dedicated endpoint would add a round trip and a backend deploy to save
 * nothing. If the gallery ever outgrows that, this is the place that needs an
 * endpoint of its own.
 */

export const revalidate = 600;

async function findItem(id: string): Promise<{ item: GalleryItem | null; all: GalleryItem[] }> {
  const all = await fetchGallery();
  return { item: all.find((entry) => entry.id === id) ?? null, all };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { item } = await findItem(id);

  if (!item) {
    return pageMetadata({
      title: "Gallery item not found | EduIgnite",
      description: "This gallery item is no longer published.",
      path: `/gallery/${id}`,
      noIndex: true,
    });
  }

  return pageMetadata({
    title: `${item.title} | EduIgnite Gallery`,
    description: toDescription(
      item.description,
      `${item.title}. A photo from EduIgnite.`,
    ),
    path: `/gallery/${item.id}`,
    image: item.type === "image" ? item.url : null,
    imageAlt: item.title,
    type: "article",
  });
}

/** The story, as paragraphs rather than one unbroken block of text. */
function Story({ text }: { text: string }) {
  const paragraphs = text
    .split(/\n{2,}|\r\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return null;

  return (
    <div className="space-y-5 text-[1.0625rem] leading-[1.85] text-slate-600">
      {paragraphs.map((paragraph, index) => (
        <p key={index} className="whitespace-pre-line">
          {paragraph}
        </p>
      ))}
    </div>
  );
}

export default async function GalleryStoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { item, all } = await findItem(id);

  if (!item) notFound();

  const embed = item.type === "video" ? toEmbedUrl(item.url) : null;
  const more = all.filter((entry) => entry.id !== item.id).slice(0, 3);
  const isVideo = item.type === "video";

  return (
    <>
      <JsonLd
        data={schemaGraph(
          organizationSchema(),
          {
            "@type": isVideo ? "VideoObject" : "ImageObject",
            "@id": `${absoluteUrl(`/gallery/${item.id}`)}#media`,
            name: item.title,
            description: item.description || item.title,
            contentUrl: item.url,
            ...(isVideo ? { embedUrl: embed || item.url } : {}),
            url: absoluteUrl(`/gallery/${item.id}`),
          },
          {
            "@type": "WebPage",
            "@id": `${absoluteUrl(`/gallery/${item.id}`)}#webpage`,
            url: absoluteUrl(`/gallery/${item.id}`),
            name: item.title,
            description: toDescription(item.description, item.title),
            inLanguage: "en",
            breadcrumb: breadcrumbSchema([
              { name: "Home", path: "/" },
              { name: "Gallery", path: "/gallery" },
              { name: item.title, path: `/gallery/${item.id}` },
            ]),
          },
        )}
      />

      <article>
        {/* ---- The media itself, given the room a photo deserves ---- */}
        <div className="bg-[#0B1F33]">
          <div className="mx-auto max-w-5xl px-5 pb-10 pt-28 sm:px-8 sm:pt-32">
            <Link
              href="/gallery"
              className="inline-flex items-center gap-2 text-[13px] font-bold text-white/60 transition-colors hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to the gallery
            </Link>

            <div className="mt-6 overflow-hidden rounded-[1.75rem] bg-black shadow-[0_32px_64px_-24px_rgba(0,0,0,0.6)]">
              {isVideo ? (
                <div className="relative aspect-video">
                  {embed ? (
                    <VideoEmbed url={item.url} title={item.title} />
                  ) : (
                    <video src={item.url} controls preload="metadata" className="h-full w-full object-contain" />
                  )}
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.url}
                  alt={item.title}
                  className="max-h-[70vh] w-full object-contain"
                />
              )}
            </div>
          </div>
        </div>

        {/* ---- The story ---- */}
        <Section>
          <div className="mx-auto max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3.5 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
              {isVideo ? <VideoIcon className="h-3.5 w-3.5" /> : <Camera className="h-3.5 w-3.5" />}
              {isVideo ? "Video" : "Photo"}
            </span>

            <h1 className="mt-6 font-display text-[2.5rem] leading-[1.08] tracking-[-0.02em] text-[#0B1F33] sm:text-[3.25rem]">
              {item.title}
            </h1>

            <div className="mt-4 h-px w-24 bg-gradient-to-r from-[#67D0E4] to-transparent" />

            <div className="mt-9">
              {item.description ? (
                <Story text={item.description} />
              ) : (
                <p className="text-[1.0625rem] leading-[1.85] text-slate-500">
                  There is no written story for this one yet.
                </p>
              )}
            </div>

            <div className="mt-12 flex flex-wrap items-center gap-3 border-t border-slate-200/70 pt-9">
              <Link
                href="/gallery"
                className="inline-flex items-center gap-2 rounded-full bg-[#12314d] px-6 py-3.5 text-[14px] font-bold text-white transition-transform hover:-translate-y-0.5"
              >
                <ArrowLeft className="h-4 w-4" />
                All photos and videos
              </Link>
              <Link
                href="/school-account-request"
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-6 py-3.5 text-[14px] font-bold text-[#12314d] transition-colors hover:bg-slate-50"
              >
                Bring your school onto EduIgnite
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </Section>

        {/* ---- Somewhere to go next ---- */}
        {more.length > 0 && (
          <Section surface="tint">
            <div className="mx-auto max-w-5xl">
              <div className="flex items-end justify-between gap-6">
                <h2 className="font-display text-3xl text-[#0B1F33]">More from the gallery</h2>
                <Link
                  href="/gallery"
                  className="hidden shrink-0 items-center gap-1.5 text-[13px] font-bold text-[#12314d] hover:text-[#0E7490] sm:inline-flex"
                >
                  See all
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {more.map((entry) => (
                  <GalleryTile key={entry.id} item={entry} />
                ))}
              </div>
            </div>
          </Section>
        )}
      </article>
    </>
  );
}
