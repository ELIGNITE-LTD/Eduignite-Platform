import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { fetchBlogPost, toEmbedUrl } from "@/lib/public-site";
import { AuthorByline } from "@/components/public/content-cards";

export const revalidate = 600;

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const post = await fetchBlogPost(slug);
  if (!post) return { title: "Post not found | EduIgnite" };
  return {
    title: `${post.title} | EduIgnite`,
    description: post.paragraphs?.[0]?.slice(0, 160) ?? undefined,
  };
}

export default async function BlogPostPage({ params }: Params) {
  const { slug } = await params;
  const post = await fetchBlogPost(slug);
  if (!post) notFound();

  const date = new Date(post.published_at);
  const label = Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const embed = toEmbedUrl(post.video_url);

  return (
    <article className="bg-white">
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
            alt=""
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
      </div>
    </article>
  );
}
