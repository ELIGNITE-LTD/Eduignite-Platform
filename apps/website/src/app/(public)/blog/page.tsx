import type { Metadata } from "next";
import { fetchBlogPosts } from "@/lib/public-site";
import { EmptyNotice, PageHero, Section } from "@/components/public/sections";
import { AuthorByline, BlogCard } from "@/components/public/content-cards";
import { Reveal } from "@/components/public/motion";

export const metadata: Metadata = {
  title: "Blog | EduIgnite",
  description: "News, updates and stories from the EduIgnite community.",
};

export const revalidate = 600;

export default async function BlogPage() {
  const posts = await fetchBlogPosts();
  const [lead, ...rest] = posts;

  return (
    <>
      <PageHero
        eyebrow="Blog"
        title="News from the EduIgnite community"
        blurb="Product updates, school stories and guides — published from inside the platform."
      />

      <Section surface="tint">
        {posts.length === 0 ? (
          <EmptyNotice
            title="No posts published yet"
            hint="Community posts appear here as soon as they are published from the platform."
          />
        ) : (
          <>
            {/* The newest post gets a wide editorial treatment; the rest form a
                regular grid, so the page has a clear reading order. */}
            <Reveal>
              <article className="group grid overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-xl lg:grid-cols-2">
                <a href={`/blog/${lead.slug}`} className="relative block aspect-[16/10] overflow-hidden bg-gradient-to-br from-[#264D73] to-[#67D0E4] lg:aspect-auto">
                  {lead.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={lead.image}
                      alt=""
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center p-10 text-center text-2xl font-black text-white/90">
                      {lead.title}
                    </span>
                  )}
                </a>
                <div className="flex flex-col justify-center p-8 lg:p-12">
                  <p className="text-[11px] font-black uppercase tracking-widest text-[#67D0E4]">
                    Latest post
                  </p>
                  <h2 className="mt-3 text-2xl font-black leading-tight text-[#12314d] sm:text-3xl">
                    <a href={`/blog/${lead.slug}`} className="hover:text-[#264D73]">
                      {lead.title}
                    </a>
                  </h2>
                  {lead.excerpt && (
                    <p className="mt-4 text-base leading-relaxed text-slate-600">{lead.excerpt}</p>
                  )}
                  <div className="mt-6 border-t border-slate-100 pt-5">
                    <AuthorByline
                      name={lead.author}
                      avatar={lead.author_avatar}
                      role={lead.author_role}
                      size="lg"
                    />
                  </div>
                </div>
              </article>
            </Reveal>

            {rest.length > 0 && (
              <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map((post, i) => (
                  <Reveal key={post.slug} delay={(i % 3) * 90}>
                    <BlogCard post={post} />
                  </Reveal>
                ))}
              </div>
            )}
          </>
        )}
      </Section>
    </>
  );
}
