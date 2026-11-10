import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState, PageBanner, SchoolSite } from "@/components/school-site/school-shell";
import { resolveMediaUrl } from "@/lib/media";
import { fetchBlogList } from "@/lib/school-blog";
import { BLOG_TEXT, blogHref, formatPostDate } from "@/lib/school-blog-text";
import { DICT, schoolMetadata } from "@/lib/school-site";
import { tFor } from "@/lib/school-site-higher";
import { loadSchool, type SchoolPageProps } from "@/lib/school-site-server";

type Query = { page?: string; category?: string };

async function readQuery(props: SchoolPageProps): Promise<Query> {
  const q = await props.searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return { page: one(q.page), category: one(q.category) };
}

export async function generateMetadata(props: SchoolPageProps): Promise<Metadata> {
  const loaded = await loadSchool(props);
  if (!loaded) return { title: "School not found", robots: { index: false, follow: false } };
  const { school, lang } = loaded;
  const query = await readQuery(props);
  const list = await fetchBlogList(school.slug, { lang, page: Number(query.page) || 1, category: query.category });
  const text = BLOG_TEXT[lang];
  return schoolMetadata({
    school,
    lang,
    section: "blog",
    label: DICT[lang].blog,
    description: text.lead,
    // Nothing to index until the school publishes an article; filtered/paged views repeat the main list.
    noIndex: list.count === 0 || Boolean(query.category) || Number(query.page) > 1,
  });
}

export default async function SchoolBlogPage(props: SchoolPageProps) {
  const loaded = await loadSchool(props);
  if (!loaded) notFound();
  const { school, lang, preview } = loaded;
  const t = tFor(school, lang);
  const text = BLOG_TEXT[lang];
  const query = await readQuery(props);
  const requestedPage = Math.max(1, Number(query.page) || 1);
  const list = await fetchBlogList(school.slug, { lang, page: requestedPage, category: query.category });
  const href = (options: { page?: number; category?: string } = {}) => blogHref(school, lang, { preview, ...options });

  return (
    <SchoolSite school={school} lang={lang} active="blog" preview={preview} crumbs={[{ name: t.blog, section: "blog" }]}>
      <PageBanner school={school} lang={lang} title={text.title} preview={preview} />

      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <p className="max-w-3xl text-slate-600">{text.lead}</p>

        {list.categories.length > 0 ? (
          <nav aria-label={text.categories} className="mt-6">
            <ul className="flex flex-wrap gap-2">
              {[{ slug: "", name: text.allCategories, count: 0 }, ...list.categories].map((c) => {
                const active = (query.category ?? "") === c.slug;
                return (
                  <li key={c.slug || "all"}>
                    <Link
                      href={href({ category: c.slug || undefined })}
                      aria-current={active ? "true" : undefined}
                      className={`inline-flex rounded-full border px-4 py-1.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 ${
                        active ? "border-blue-800 bg-blue-800 text-white" : "border-slate-300 bg-white text-blue-950 hover:bg-blue-50"
                      }`}
                    >
                      {c.name}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        ) : null}

        {list.results.length === 0 ? (
          <div className="mt-10">
            <EmptyState title={t.blog} text={query.category ? text.noPostsInCategory : text.empty} />
          </div>
        ) : (
          <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {list.results.map((post) => {
              const cover = resolveMediaUrl(post.cover);
              const url = blogHref(school, lang, { preview, postSlug: post.slug });
              return (
                <li key={post.slug} className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <Link href={url} className="relative block aspect-[16/9] bg-blue-50" tabIndex={-1} aria-hidden>
                    {cover ? <Image src={cover} alt="" fill unoptimized sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-cover" /> : null}
                  </Link>
                  <article className="flex flex-1 flex-col p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-green-800">
                      {post.category ? `${post.category.name} · ` : ""}
                      <time dateTime={post.published_at ?? undefined}>{formatPostDate(post.published_at, lang)}</time>
                    </p>
                    <h2 className="mt-2 text-lg font-bold leading-snug text-blue-950">
                      <Link href={url} className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700">{post.title}</Link>
                    </h2>
                    {post.excerpt ? <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{post.excerpt}</p> : null}
                    <p className="mt-auto pt-4 text-xs text-slate-500">{text.minRead(post.reading_time)}</p>
                  </article>
                </li>
              );
            })}
          </ul>
        )}

        {list.total_pages > 1 ? (
          <nav aria-label={text.pagination} className="mt-10 flex flex-wrap items-center justify-between gap-3">
            {list.page > 1 ? (
              <Link rel="prev" href={href({ page: list.page - 1, category: query.category })} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-blue-950 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700">
                &larr; {text.prevPage}
              </Link>
            ) : <span />}
            <p className="text-sm text-slate-600" aria-live="polite">{text.page(list.page, list.total_pages)}</p>
            {list.page < list.total_pages ? (
              <Link rel="next" href={href({ page: list.page + 1, category: query.category })} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-blue-950 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700">
                {text.nextPage} &rarr;
              </Link>
            ) : <span />}
          </nav>
        ) : null}
      </div>
    </SchoolSite>
  );
}
