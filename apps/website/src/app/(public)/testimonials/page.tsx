import type { Metadata } from "next";
import { pageMetadata, schemaGraph, webPageSchema } from "@/lib/seo";
import { JsonLd } from "@/components/public/json-ld";
import Link from "next/link";
import { ArrowRight, Quote, Star } from "lucide-react";
import { fetchTestimonials } from "@/lib/public-site";
import { EmptyNotice, PageHero, Section, SectionHeading } from "@/components/public/sections";
import { TestimonialMarquee } from "@/components/public/testimonial-marquee";
import { Reveal } from "@/components/public/motion";

const PAGE = {
  title: "EduIgnite Stories | Experiences from Schools Using EduIgnite",
  description:
    "Stories from administrators, teachers, parents and students running their school on EduIgnite — each one reviewed before it is published.",
  path: "/testimonials",
};

export const metadata: Metadata = pageMetadata(PAGE);

export const revalidate = 600;

export default async function TestimonialsPage() {
  const testimonials = await fetchTestimonials();

  return (
    <>
      <JsonLd data={schemaGraph(webPageSchema({ name: PAGE.title, description: PAGE.description, path: PAGE.path, type: "CollectionPage", crumbs: [{ name: "Home", path: "/" }, { name: "Stories", path: "/testimonials" }] }))} />
      <PageHero
        eyebrow="Stories"
        title="What schools say about EduIgnite"
        blurb="Every story here was written by someone using EduIgnite in their own school, and published only after a founder reviewed it."
      />

      {testimonials.length === 0 ? (
        <Section surface="dots">
          <EmptyNotice
            title="No stories published yet"
            hint="Testimonies shared from inside the platform appear here once a founder approves them."
          />
        </Section>
      ) : (
        <>
          {/* Continuous, professional marquee of every story. */}
          <Section surface="tint">
            <TestimonialMarquee items={testimonials} fade="#EBF3FA" />
          </Section>

          {/* Full stories — each is the target of a card's "See more" link. */}
          <Section surface="dots">
            <SectionHeading eyebrow="Every story" title="In their own words" />
            <div className="mx-auto mt-12 grid max-w-5xl gap-6 md:grid-cols-2">
              {testimonials.map((item, i) => (
                <Reveal key={item.id} delay={(i % 2) * 90}>
                  <article
                    id={`t-${item.id}`}
                    className="relative scroll-mt-28 overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-7 shadow-[0_1px_2px_rgba(18,49,77,0.04),0_18px_40px_-24px_rgba(18,49,77,0.22)] target:ring-2 target:ring-[#67D0E4]"
                  >
                    <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#67D0E4]/60 to-transparent" aria-hidden />
                    <div className="flex items-center justify-between">
                      <Quote className="h-7 w-7 fill-[#67D0E4]/15 text-[#67D0E4]" aria-hidden />
                      <div className="flex items-center gap-0.5" aria-label={`${item.rating} out of 5`}>
                        {Array.from({ length: 5 }).map((_, s) => (
                          <Star
                            key={s}
                            className={`h-4 w-4 ${s < item.rating ? "fill-[#F5A623] text-[#F5A623]" : "text-slate-200"}`}
                            aria-hidden
                          />
                        ))}
                      </div>
                    </div>
                    <blockquote className="mt-4 font-serif text-[16px] italic leading-relaxed text-slate-700">
                      “{item.message}”
                    </blockquote>
                    <footer className="mt-5 flex items-center gap-3 border-t border-slate-100 pt-5">
                      {item.avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.avatar} alt="" className="h-11 w-11 rounded-full object-cover ring-2 ring-[#67D0E4]/25 ring-offset-2" />
                      ) : (
                        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[#264D73] to-[#3d7ba8] font-serif text-lg font-bold text-white ring-2 ring-[#67D0E4]/25 ring-offset-2">
                          {item.name.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-black text-[#12314d]">{item.name}</span>
                        <span className="block truncate text-xs font-semibold text-slate-500">
                          {[item.role, item.school].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </footer>
                  </article>
                </Reveal>
              ))}
            </div>
          </Section>
        </>
      )}

      <Section surface="dark" className="text-center">
        <h2 className="font-serif text-[2rem] font-bold tracking-tight sm:text-[2.6rem]">
          Using EduIgnite at your school?
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-white/70">
          Share your experience from the Testimonials screen in your account. Approved stories are
          published here.
        </p>
        <Link
          href="/login"
          className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-3.5 text-base font-bold text-[#12314d] shadow-lg transition-all hover:-translate-y-0.5 hover:bg-[#67D0E4]"
        >
          Sign in to share yours <ArrowRight className="h-5 w-5" />
        </Link>
      </Section>
    </>
  );
}
