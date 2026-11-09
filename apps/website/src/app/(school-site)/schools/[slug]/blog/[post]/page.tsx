import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageBanner, SchoolSite } from "@/components/school-site/school-shell";
import { absoluteImage } from "@/lib/public-schools";
import { resolveMediaUrl } from "@/lib/media";
import { fetchBlogPost } from "@/lib/school-blog";
import { BLOG_TEXT, blogHref, formatPostDate } from "@/lib/school-blog-text";
import { DICT, canonicalUrl, schoolMetadata, type SchoolSection } from "@/lib/school-site";
import { tFor } from "@/lib/school-site-higher";
import { loadSchool, type SchoolPageProps } from "@/lib/school-site-server";

type PostProps = {
  params: Promise<{ slug: string; post: string }>;
  searchParams: SchoolPageProps["searchParams"];
};

async function load(props: PostProps) {
  const [{ post: postSlug, slug }, query] = await Promise.all([props.params, props.searchParams]);
  const loaded = await loadSchool({ params: Promise.resolve({ slug }), searchParams: props.searchParams });
  if (!loaded) return null;
  const postPreview = typeof query.post_preview === "string" && query.post_preview ? query.post_preview : undefined;
  const post = await fetchBlogPost(loaded.school.slug, postSlug, { lang: loaded.lang, postPreview });
  return post ? { ...loaded, post, postSlug, postPreview } : null;
}

/** Keep uploaded-image addresses working when the API returns them relative to its own origin. */
function absolutizeImages(html: string): string {
  return html.replace(/(<img\b[^>]*\ssrc=")([^"]+)(")/g, (_m, a: string, src: string, c: string) => `${a}${resolveMediaUrl(src)}${c}`);
}

/** JSON must not be able to close the script tag. */
function jsonLdString(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export async function generateMetadata(props: PostProps): Promise<Metadata> {
  const data = await load(props);
  if (!data) return { title: "Article not found", robots: { index: false, follow: false } };
  const { school, lang, post, postSlug, postPreview } = data;
  const section = `blog/${postSlug}` as SchoolSection;
  const base = schoolMetadata({
    school, lang, section, label: post.seo_title || post.title, description: post.seo_description || post.excerpt,
    noIndex: Boolean(postPreview) || post.is_preview,
  });
  const cover = absoluteImage(resolveMediaUrl(post.cover));
  return {
    ...base,
    title: { absolute: `${post.seo_title || post.title} | ${school.name}` },
    openGraph: {
      ...base.openGraph,
      type: "article",
      title: post.seo_title || post.title,
      description: post.seo_description || post.excerpt,
      publishedTime: post.published_at ?? undefined,
      modifiedTime: post.updated_at,
      authors: post.author_name ? [post.author_name] : undefined,
      images: cover ? [{ url: cover, alt: post.title }] : base.openGraph?.images,
    },
    twitter: { ...base.twitter, card: cover ? "summary_large_image" : "summary", images: cover ? [cover] : undefined },
  };
}

export default async function SchoolBlogPostPage(props: PostProps) {
  const data = await load(props);
  if (!data) notFound();
  const { school, lang, preview, post, postSlug, postPreview } = data;
  const t = tFor(school, lang);
  const text = BLOG_TEXT[lang];
  const section = `blog/${postSlug}` as SchoolSection;
  const cover = resolveMediaUrl(post.cover);
  const link = (slug: string) => blogHref(school, lang, { preview, postSlug: slug });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.seo_description || post.excerpt || undefined,
    inLanguage: lang,
    datePublished: post.published_at ?? undefined,
    dateModified: post.updated_at,
    image: absoluteImage(cover) ? [absoluteImage(cover)] : undefined,
    author: post.author_name ? { "@type": "Person", name: post.author_name } : { "@type": "Organization", name: school.name },
    publisher: { "@type": "Organization", name: school.name },
    mainEntityOfPage: canonicalUrl(school, section, lang),
    articleSection: post.category?.name,
  };

  return (
    <SchoolSite
      school={school}
      lang={lang}
      active="blog"
      preview={preview}
      crumbs={[{ name: t.blog, section: "blog" }, { name: post.title, section }]}
    >
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
      <PageBanner school={school} lang={lang} title={post.title} preview={preview} />

      {post.is_preview ? (
        <p role="status" className="bg-amber-100 px-4 py-2 text-center text-sm font-semibold text-amber-900">{text.preview}</p>
      ) : null}

      <article className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
        <header>
          <p className="text-sm text-slate-600">
            {post.category ? <Link href={blogHref(school, lang, { preview, category: post.category.slug })} className="font-semibold text-green-800 hover:underline">{post.category.name}</Link> : null}
            {post.category ? " · " : ""}
            {post.published_at ? <time dateTime={post.published_at}>{formatPostDate(post.published_at, lang)}</time> : null}
            {" · "}
            {text.minRead(post.reading_time)}
            {post.author_name ? ` · ${text.by} ${post.author_name}` : ""}
          </p>
          {cover ? (
            <div className="relative mt-6 aspect-[16/9] overflow-hidden rounded-2xl bg-blue-50">
              <Image src={cover} alt="" fill unoptimized priority sizes="(min-width: 768px) 768px, 100vw" className="object-cover" />
            </div>
          ) : null}
        </header>

        {/* Server-sanitised (allow-list) on write and again on read. */}
        <div
          className="mt-8 space-y-4 leading-8 text-slate-800 [&_a]:font-semibold [&_a]:text-blue-800 [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-green-600 [&_blockquote]:pl-4 [&_blockquote]:italic [&_h1]:text-3xl [&_h1]:font-bold [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-blue-950 [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-bold [&_h3]:text-blue-950 [&_img]:my-4 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-xl [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6"
          dangerouslySetInnerHTML={{ __html: absolutizeImages(post.body) }}
        />

        <nav aria-label={text.backToBlog} className="mt-12 grid gap-3 border-t border-slate-200 pt-6 sm:grid-cols-2">
          {post.previous ? (
            <Link rel="prev" href={link(post.previous.slug)} className="rounded-xl border border-slate-200 p-4 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700">
              <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">&larr; {text.previous}</span>
              <span className="mt-1 block font-bold text-blue-950">{post.previous.title}</span>
            </Link>
          ) : <span />}
          {post.next ? (
            <Link rel="next" href={link(post.next.slug)} className="rounded-xl border border-slate-200 p-4 text-right hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700">
              <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{text.next} &rarr;</span>
              <span className="mt-1 block font-bold text-blue-950">{post.next.title}</span>
            </Link>
          ) : null}
        </nav>
        <p className="mt-6">
          <Link href={blogHref(school, lang, { preview })} className="text-sm font-semibold text-green-800 underline-offset-2 hover:underline">&larr; {text.backToBlog}</Link>
        </p>
      </article>
    </SchoolSite>
  );
}
