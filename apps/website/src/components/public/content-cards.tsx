import Link from "next/link";
import { Play, Quote, Star } from "lucide-react";
import type { BlogSummary, GalleryItem, Testimonial } from "@/lib/public-site";
import { toEmbedUrl } from "@/lib/public-site";

/* Each content type gets its own card language, so a reader can tell at a
 * glance which kind of thing they are looking at:
 *   testimonial — quoted, soft, portrait-led
 *   blog        — editorial, image on top, reads like an article card
 *   gallery     — edge-to-edge media tile, caption revealed on hover
 * They share the palette, radius scale and shadow ramp, so they still belong
 * to the same site.
 */

const TESTIMONIAL_PREVIEW = 150;

/**
 * Who wrote a post: their profile picture, their name and the role they hold on
 * the platform. Used on blog cards and at the top of a post, so every post is
 * clearly attributed to a real person.
 */
export function AuthorByline({
  name,
  avatar,
  role,
  size = "sm",
}: {
  name: string;
  avatar?: string;
  role?: string;
  size?: "sm" | "lg";
}) {
  const big = size === "lg";
  const dim = big ? "h-11 w-11" : "h-9 w-9";

  return (
    <span className="flex items-center gap-3">
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatar}
          alt=""
          className={`${dim} shrink-0 rounded-full object-cover ring-2 ring-[#67D0E4]/25 ring-offset-2`}
        />
      ) : (
        <span
          className={`${dim} flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#264D73] to-[#3d7ba8] font-serif font-bold text-white ring-2 ring-[#67D0E4]/25 ring-offset-2 ${
            big ? "text-base" : "text-sm"
          }`}
        >
          {(name || "E").slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="min-w-0">
        <span className={`block truncate font-black text-[#12314d] ${big ? "text-sm" : "text-xs"}`}>
          {name}
        </span>
        {role && (
          <span className={`block truncate font-semibold text-slate-500 ${big ? "text-xs" : "text-[11px]"}`}>
            {role}
          </span>
        )}
      </span>
    </span>
  );
}

/**
 * Compact, professional testimonial card. Long quotes are trimmed to keep every
 * card the same tidy size, with a "See more" link to the full story anchored on
 * the testimonials page.
 */
export function TestimonialCard({ item }: { item: Testimonial }) {
  const isLong = item.message.length > TESTIMONIAL_PREVIEW;
  const preview = isLong
    ? item.message.slice(0, TESTIMONIAL_PREVIEW).replace(/\s+\S*$/, "") + "…"
    : item.message;

  return (
    <figure className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(18,49,77,0.04),0_16px_36px_-24px_rgba(18,49,77,0.22)] transition-all duration-300 hover:-translate-y-1 hover:border-[#67D0E4]/40 hover:shadow-[0_1px_2px_rgba(18,49,77,0.05),0_24px_48px_-28px_rgba(18,49,77,0.32)]">
      <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#67D0E4]/60 to-transparent" aria-hidden />
      <div className="flex items-center justify-between">
        <Quote className="h-6 w-6 shrink-0 fill-[#67D0E4]/15 text-[#67D0E4]" aria-hidden />
        <div className="flex items-center gap-0.5" aria-label={`${item.rating} out of 5`}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className={`h-3.5 w-3.5 ${i < item.rating ? "fill-[#F5A623] text-[#F5A623]" : "text-slate-200"}`}
              aria-hidden
            />
          ))}
        </div>
      </div>
      <blockquote className="mt-3 flex-1 font-serif text-[14px] italic leading-relaxed text-slate-700">
        “{preview}”
      </blockquote>
      {isLong && (
        <Link
          href={`/testimonials#t-${item.id}`}
          className="mt-2 inline-flex w-fit items-center gap-1 text-xs font-bold text-[#264D73] transition-colors hover:text-[#67D0E4]"
        >
          See more <span aria-hidden>→</span>
        </Link>
      )}
      <figcaption className="mt-4 flex items-center gap-3 border-t border-slate-100 pt-4">
        {item.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.avatar} alt="" className="h-10 w-10 rounded-full object-cover ring-2 ring-[#67D0E4]/25 ring-offset-1" />
        ) : (
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#264D73] to-[#3d7ba8] font-serif text-base font-bold text-white ring-2 ring-[#67D0E4]/25 ring-offset-1">
            {item.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-black text-[#12314d]">{item.name}</span>
          <span className="block truncate text-[11px] font-semibold text-slate-500">
            {[item.role, item.school].filter(Boolean).join(" · ")}
          </span>
        </span>
      </figcaption>
    </figure>
  );
}

export function BlogCard({ post }: { post: BlogSummary }) {
  const date = new Date(post.published_at);
  const label = Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(18,49,77,0.04),0_18px_40px_-24px_rgba(18,49,77,0.22)] transition-all duration-300 hover:-translate-y-1 hover:border-[#67D0E4]/50 hover:shadow-[0_1px_2px_rgba(18,49,77,0.05),0_28px_56px_-28px_rgba(18,49,77,0.32)]"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-[#264D73] to-[#67D0E4]">
        {post.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.image}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center px-6 text-center text-lg font-black text-white/90">
            {post.title}
          </span>
        )}
        {post.video_url && (
          <span className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-[#12314d] shadow">
            <Play className="h-4 w-4 fill-current" />
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-6">
        <p className="text-[11px] font-black uppercase tracking-widest text-[#67D0E4]">
          {label}
        </p>
        <h3 className="mt-2 font-serif text-xl font-bold leading-snug text-[#12314d] transition-colors group-hover:text-[#264D73]">
          {post.title}
        </h3>
        {post.excerpt && (
          <p className="mt-2.5 flex-1 text-sm leading-relaxed text-slate-600">{post.excerpt}</p>
        )}
        <span className="mt-5 block border-t border-slate-100 pt-4">
          <AuthorByline name={post.author} avatar={post.author_avatar} role={post.author_role} />
        </span>
      </div>
    </Link>
  );
}

export function GalleryTile({ item }: { item: GalleryItem }) {
  const embed = item.type === "video" ? toEmbedUrl(item.url) : null;

  if (item.type === "video") {
    return (
      <figure className="group overflow-hidden rounded-[1.5rem] border border-slate-200 bg-black shadow-sm transition-all duration-300 hover:shadow-xl">
        <div className="relative aspect-video">
          {embed ? (
            <iframe
              src={embed}
              title={item.title}
              loading="lazy"
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="h-full w-full"
            />
          ) : (
            <video src={item.url} controls preload="metadata" className="h-full w-full object-cover" />
          )}
        </div>
        <figcaption className="bg-white p-5">
          <p className="text-sm font-black text-[#12314d]">{item.title}</p>
          {item.description && (
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{item.description}</p>
          )}
        </figcaption>
      </figure>
    );
  }

  return (
    <figure className="group relative aspect-[4/3] overflow-hidden rounded-[1.5rem] border border-slate-200 shadow-sm transition-all duration-300 hover:shadow-xl">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.url}
        alt={item.title}
        loading="lazy"
        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
      />
      <figcaption className="absolute inset-x-0 bottom-0 translate-y-2 bg-gradient-to-t from-black/80 via-black/45 to-transparent p-5 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
        <p className="text-sm font-black text-white">{item.title}</p>
        {item.description && (
          <p className="mt-0.5 line-clamp-2 text-xs text-white/75">{item.description}</p>
        )}
      </figcaption>
    </figure>
  );
}

/** Large embedded explainer video, used on the home page. */
export function VideoFeature({ item }: { item: GalleryItem }) {
  const embed = toEmbedUrl(item.url);
  return (
    <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-black shadow-2xl">
      <div className="relative aspect-video">
        {embed ? (
          <iframe
            src={embed}
            title={item.title}
            loading="lazy"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        ) : (
          <video src={item.url} controls preload="metadata" className="h-full w-full object-cover" />
        )}
      </div>
    </div>
  );
}
