import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, Layers, PlayCircle, Star, FileText, ShieldCheck, GraduationCap } from "lucide-react";
import { fetchCourseDetail, roleLabel } from "@/app/academy/_lib/public-api";
import { AcademySiteFrame } from "@/app/academy/_components/site-frame";
import { ActionCta } from "@/app/academy/_components/action-cta";
import { Section, SectionHeading, EmptyNotice } from "@/components/public/sections";

export const revalidate = 300;

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const course = await fetchCourseDetail(slug);
  if (!course) return { title: "Course not found | EduIgnite Academy" };
  return {
    title: `${course.title} | EduIgnite Academy`,
    description: course.description?.slice(0, 160),
  };
}

export default async function CourseDetailPage({ params }: Params) {
  const { slug } = await params;
  const course = await fetchCourseDetail(slug);
  if (!course) notFound();

  const totalLessons = course.modules.reduce((n, m) => n + m.lessons.length, 0);
  const approvedTestimonials = course.testimonials.filter((t) => t.status === "approved");
  const learnHref = `/academy/courses/${course.slug}/learn`;

  // Schema.org Course structured data — explicit, named contract requirement
  // (spec Section 8), not optional polish.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: course.title,
    description: course.description,
    provider: {
      "@type": "Organization",
      name: "EduIgnite Academy",
      sameAs: "https://eduignite.com/academy",
    },
    ...(course.trainer
      ? {
          instructor: {
            "@type": "Person",
            name: course.trainer.name,
            description: course.trainer.bio,
          },
        }
      : {}),
    ...(approvedTestimonials.length > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: (
              approvedTestimonials.reduce((sum, t) => sum + t.rating, 0) / approvedTestimonials.length
            ).toFixed(1),
            reviewCount: approvedTestimonials.length,
          },
        }
      : {}),
  };

  return (
    <AcademySiteFrame>
      <script
        type="application/ld+json"
        // JSON.stringify does not escape "<", so a trainer bio or course
        // description containing "</script><script>..." would close this
        // tag early and execute for every visitor. Escape it to <.
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      <section
        className="relative isolate overflow-hidden"
        style={{ background: "linear-gradient(to bottom, #EAF3FA 0%, #F2F7FB 55%, #FBFCFE 100%)" }}
      >
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
          <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-[#67D0E4]/20 blur-3xl" />
          <div className="absolute -right-24 top-0 h-80 w-80 rounded-full bg-[#264D73]/8 blur-3xl" />
        </div>
        <div className="relative mx-auto w-full max-w-5xl px-4 py-14 sm:px-6 lg:py-20">
          <Link
            href="/academy/courses"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-[#264D73] hover:underline"
          >
            <ArrowLeft className="h-4 w-4" /> Full catalog
          </Link>

          <span className="mt-6 inline-flex rounded-full bg-[#67D0E4]/15 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-[#264D73]">
            {roleLabel(course.role_pathway)}
          </span>
          <h1 className="mt-4 max-w-3xl font-serif text-3xl font-bold leading-[1.15] tracking-tight text-[#12314d] sm:text-4xl">
            {course.title}
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-slate-600">{course.description}</p>

          <div className="mt-6 flex flex-wrap items-center gap-5 text-sm font-semibold text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <Layers className="h-4 w-4 text-[#67D0E4]" /> {course.module_count} module{course.module_count === 1 ? "" : "s"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <PlayCircle className="h-4 w-4 text-[#67D0E4]" /> {totalLessons} lesson{totalLessons === 1 ? "" : "s"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-[#67D0E4]" /> {course.duration_minutes} min total
            </span>
          </div>

          <div className="mt-8">
            <ActionCta href={learnHref} label="Enroll & Start Course" icon={<GraduationCap className="h-4 w-4" />} />
          </div>
        </div>
      </section>

      {/* ===== SYLLABUS ===== */}
      <Section surface="light">
        <SectionHeading eyebrow="Syllabus" title="What you'll learn, lesson by lesson" align="left" />
        <div className="mt-10">
          {course.modules.length === 0 ? (
            <EmptyNotice title="Syllabus not published yet" hint="Modules and lessons appear here once added in the Academy CMS." />
          ) : (
            <div className="space-y-5">
              {course.modules
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((mod, i) => (
                  <div key={mod.id} className="rounded-2xl border border-slate-200 bg-white p-6">
                    <p className="font-serif text-base font-bold text-[#12314d]">
                      Module {i + 1}: {mod.title}
                    </p>
                    <ul className="mt-4 divide-y divide-slate-100">
                      {mod.lessons
                        .slice()
                        .sort((a, b) => a.order - b.order)
                        .map((lesson) => (
                          <li key={lesson.id} className="flex items-center justify-between gap-4 py-2.5">
                            <span className="inline-flex items-center gap-2.5 text-sm font-semibold text-slate-700">
                              <PlayCircle className="h-4 w-4 shrink-0 text-[#67D0E4]" /> {lesson.title}
                            </span>
                            <span className="shrink-0 text-xs font-bold text-slate-400">{lesson.duration_minutes} min</span>
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
            </div>
          )}
        </div>
      </Section>

      {/* ===== RESOURCES ===== */}
      {course.resources.length > 0 && (
        <Section surface="tint">
          <SectionHeading eyebrow="Resources" title="Downloadable guides & checklists" align="left" />
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {course.resources.map((res) => (
              <a
                key={res.id}
                href={res.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 transition-colors hover:border-[#67D0E4]/50"
              >
                <FileText className="h-5 w-5 shrink-0 text-[#67D0E4]" />
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-[#12314d]">{res.title}</span>
              </a>
            ))}
          </div>
        </Section>
      )}

      {/* ===== TRAINER ===== */}
      {course.trainer && (
        <Section surface="light">
          <SectionHeading eyebrow="Your instructor" title="Meet the trainer" align="left" />
          <div className="mt-10 flex flex-col items-start gap-5 rounded-3xl border border-slate-200 bg-white p-8 sm:flex-row sm:items-center">
            {course.trainer.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={course.trainer.photo_url}
                alt={course.trainer.name}
                className="h-20 w-20 shrink-0 rounded-full border border-slate-200 object-cover"
              />
            ) : (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-[#67D0E4]/15 font-serif text-2xl font-bold text-[#264D73]">
                {course.trainer.name.slice(0, 1)}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <p className="font-serif text-lg font-bold text-[#12314d]">{course.trainer.name}</p>
                {course.trainer.is_verified && <ShieldCheck className="h-4 w-4 text-[#67D0E4]" />}
              </div>
              {course.trainer.credentials && (
                <p className="mt-0.5 text-sm font-semibold text-[#67D0E4]">{course.trainer.credentials}</p>
              )}
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">{course.trainer.bio}</p>
            </div>
          </div>
        </Section>
      )}

      {/* ===== TESTIMONIALS ===== */}
      {approvedTestimonials.length > 0 && (
        <Section surface="tint">
          <SectionHeading eyebrow="From learners" title="What people are saying" align="left" />
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {approvedTestimonials.map((t) => (
              <div key={t.id} className="rounded-2xl border border-slate-200 bg-white p-6">
                <div className="flex items-center gap-1" aria-hidden>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`h-3.5 w-3.5 ${i < t.rating ? "fill-[#67D0E4] text-[#67D0E4]" : "text-slate-200"}`}
                    />
                  ))}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-slate-700">&ldquo;{t.message}&rdquo;</p>
                <p className="mt-3 text-xs font-black uppercase tracking-wide text-slate-400">{t.user.name}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section surface="dark" flushBottom>
        <div className="mx-auto max-w-xl text-center">
          <h2 className="font-serif text-2xl font-bold text-white">Ready to start {course.title}?</h2>
          <p className="mt-3 text-white/70">Free to enroll. Continue with EduIgnite, or create an Academy account.</p>
          <div className="mt-6 flex justify-center">
            <ActionCta href={learnHref} label="Enroll & Start Course" icon={<GraduationCap className="h-4 w-4" />} variant="ghost-light" />
          </div>
        </div>
      </Section>
    </AcademySiteFrame>
  );
}
