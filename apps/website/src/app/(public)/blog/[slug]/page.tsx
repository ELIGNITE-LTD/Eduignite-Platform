import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { fetchBlogPost, toEmbedUrl } from "@/lib/public-site";
import { absoluteImage } from "@/lib/public-schools";
import { AuthorByline } from "@/components/public/content-cards";
import { JsonLd } from "@/components/public/json-ld";
import { articleSchema, breadcrumbSchema, pageMetadata, schemaGraph, toDescription } from "@/lib/seo";

export const revalidate = 600;

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const post = await fetchBlogPost(slug);
  if (!post) return { title: { absolute: "Post not found | EduIgnite Blog" }, robots: { index: false, follow: true } };
  return pageMetadata({
    title: `${post.title} | EduIgnite Blog`,
    description: toDescription(post.paragraphs?.join(" "), `${post.title} — from the EduIgnite Blog.`),
    path: `/blog/${post.slug || slug}`,
    image: absoluteImage(post.image),
    imageAlt: post.title,
    type: "article",
    publishedTime: post.published_at || undefined,
    authors: post.author ? [post.author] : undefined,
  });
}

// Where a reader can go next — descriptive links into the rest of the site.
const NEXT_LINKS = [
  { href: "/blog", label: "Read more from the EduIgnite Blog" },
  { href: "/testimonials", label: "Read EduIgnite Stories from schools" },
  { href: "/academy", label: "Explore EduIgnite Academy" },
  { href: "/download", label: "Download the EduIgnite apps" },
];

export default async function BlogPostPage({ params }: Params) {
  const { slug } = await params;
  const post = await fetchBlogPost(slug);
  if (!post) notFound();

  const date = new Date(post.published_at);
  const label = Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const embed = toEmbedUrl(post.video_url);
  const path = `/blog/${post.slug || slug}`;

  return (
    <article className="bg-white">
      <JsonLd
        data={schemaGraph(
          articleSchema({
            title: post.title,
            description: toDescription(post.paragraphs?.join(" "), post.title),
            path,
            image: absoluteImage(post.image),
            author: post.author || null,
            publishedAt: Number.isNaN(date.getTime()) ? null : post.published_at,
          }),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Blog", path: "/blog" },
            { name: post.title, path },
          ]),
        )}
      />
      <header className="border-b border-slate-200 bg-gradient-to-b from-[#EAF3FA] to-white">
        <div className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6 lg:py-20">
          <Link
            href="/blog"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-[#264D73] hover:underline"
          >
            <ArrowLeft className="h-4 w-4" /> All posts
          </Link>
          <h1 className="mt-6 text-3xl font-black leading-tight tracking-tight text-[#12314d] sm:text-4xl lg:text-5xl">
            {post.title}
          </h1>
          <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-3">
            <AuthorByline
              name={post.author}
              avatar={post.author_avatar}
              role={post.author_role}
              size="lg"
            />
            {label && (
              <span className="text-sm font-semibold text-slate-500">
                <span className="mr-3 text-slate-300">|</span>
                {label}
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
        {post.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.image}
            alt={post.title}
            className="mb-10 w-full rounded-[1.5rem] border border-slate-200 object-cover shadow-sm"
          />
        )}

        {embed && (
          <div className="mb-10 overflow-hidden rounded-[1.5rem] border border-slate-200 bg-black shadow-sm">
            <div className="relative aspect-video">
              <iframe
                src={embed}
                title={post.title}
                loading="lazy"
                allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="h-full w-full"
              />
            </div>
          </div>
        )}

        <div className="space-y-5">
          {post.paragraphs.map((paragraph, i) => (
            <p key={i} className="text-[17px] leading-[1.75] text-slate-700">
              {paragraph}
            </p>
          ))}
        </div>

        <nav aria-label="Keep exploring EduIgnite" className="mt-14 border-t border-slate-200 pt-8">
          <h2 className="text-sm font-black uppercase tracking-[0.18em] text-[#264D73]">Keep exploring</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {NEXT_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="font-bold text-[#264D73] hover:underline">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </article>
  );
}
