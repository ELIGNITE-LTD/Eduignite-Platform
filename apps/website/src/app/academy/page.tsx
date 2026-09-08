import type { Metadata } from "next";
import Link from "next/link";
import {
  GraduationCap, Users, Award, BookOpen, ArrowRight, ShieldCheck,
  School, ClipboardCheck, Wallet, Library, HelpCircle, PlayCircle,
} from "lucide-react";
import { fetchAcademyProfile, fetchCourses, fetchFaqs, ROLE_PATHWAYS } from "@/app/academy/_lib/public-api";
import { AcademySiteFrame } from "@/app/academy/_components/site-frame";
import { ActionCta } from "@/app/academy/_components/action-cta";
import { CourseCard } from "@/app/academy/_components/course-card";
import { AcademySearchBar } from "@/app/academy/_components/search-bar";
import { VerifyLookupForm } from "@/app/academy/_components/verify-lookup";
import { Section, SectionHeading, EmptyNotice } from "@/components/public/sections";
import { Reveal, CountUp } from "@/components/public/motion";

export const metadata: Metadata = {
  title: "EduIgnite Academy | Learn & Get Certified on EduIgnite",
  description:
    "The official education and certification division of EduIgnite. Browse role-based courses, watch task-oriented lessons, pass quizzes and earn verifiable certificates — free to browse, no login required.",
};

// Live stats/courses must never look stale — refresh every 5 minutes.
export const revalidate = 300;

const PATHWAY_ICON: Record<string, typeof School> = {
  PRINCIPAL: School,
  TEACHER: GraduationCap,
  ACCOUNTANT: Wallet,
  LIBRARIAN: Library,
  GENERAL: ClipboardCheck,
};

export default async function AcademyLandingPage() {
  const [profile, featuredCourses, faqs] = await Promise.all([
    fetchAcademyProfile(),
    fetchCourses({ featured: true }),
    fetchFaqs(),
  ]);

  const faqPreview = faqs.slice(0, 4);

  return (
    <AcademySiteFrame>
      {/* ===== HERO — brand identity ===== */}
      <section
        className="relative isolate overflow-hidden"
        style={{ background: "linear-gradient(to bottom, #EAF3FA 0%, #F2F7FB 55%, #FBFCFE 100%)" }}
      >
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
          <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-[#67D0E4]/20 blur-3xl" />
          <div className="absolute -right-24 top-0 h-80 w-80 rounded-full bg-[#264D73]/8 blur-3xl" />
        </div>
        <div className="relative mx-auto w-full max-w-7xl px-4 py-16 text-center sm:px-6 lg:px-8 lg:py-24">
          <p className="flex items-center justify-center gap-3 text-[11px] font-black uppercase tracking-[0.28em] text-[#67D0E4]">
            <span className="h-px w-6 bg-[#67D0E4]/50" aria-hidden />
            EduIgnite Academy
            <span className="h-px w-6 bg-[#67D0E4]/50" aria-hidden />
          </p>
          <h1 className="mx-auto mt-4 max-w-3xl font-serif text-4xl font-bold leading-[1.12] tracking-tight text-[#12314d] sm:text-5xl">
            {profile.tagline}
          </h1>
          {profile.mission && (
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-slate-600">{profile.mission}</p>
          )}

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <ActionCta href="/academy" label="Start Learning" icon={<GraduationCap className="h-4 w-4" />} />
            <Link
              href="/academy/courses"
              className="inline-flex items-center gap-2 rounded-xl border border-[#264D73]/20 bg-white px-5 py-3.5 text-sm font-bold text-[#264D73] transition-colors hover:bg-[#264D73]/5"
            >
              Browse Courses <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Dynamic stats — never hardcoded, always the profile endpoint's live counts. */}
          <div className="mx-auto mt-14 grid max-w-3xl gap-5 sm:grid-cols-3">
            {[
              { label: "Courses available", value: profile.stats.courses_count, icon: BookOpen },
              { label: "Active learners", value: profile.stats.learners_count, icon: Users },
              { label: "Certificates issued", value: profile.stats.certificates_count, icon: Award },
            ].map((stat) => (
              <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white/80 p-6 backdrop-blur">
                <stat.icon className="mx-auto h-6 w-6 text-[#67D0E4]" strokeWidth={1.75} />
                <CountUp value={stat.value} className="mt-2 block font-serif text-3xl font-bold text-[#12314d]" />
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== WHAT IS TAUGHT & WHO IT'S FOR ===== */}
      <Section surface="light" id="pathways">
        <SectionHeading
          eyebrow="Role-based learning paths"
          title="What is taught, and who it's for"
          blurb="Every course maps to a real EduIgnite role — task-oriented lessons of 3 to 10 minutes each, built around the operations that role actually performs."
        />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {ROLE_PATHWAYS.map((pathway, i) => {
            const Icon = PATHWAY_ICON[pathway.value] ?? School;
            return (
              <Reveal key={pathway.value} delay={(i % 5) * 70}>
                <div className="h-full rounded-2xl border border-slate-200/80 bg-[#F7F9FC] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[#67D0E4]/40 hover:bg-white hover:shadow-md">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#67D0E4]/15 text-[#264D73]">
                    <Icon className="h-5 w-5" strokeWidth={1.75} />
                  </span>
                  <h3 className="mt-4 font-serif text-base font-bold text-[#12314d]">{pathway.course}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{pathway.focus}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </Section>

      {/* ===== FEATURED COURSES ===== */}
      <Section surface="tint" id="courses">
        <SectionHeading
          eyebrow="Featured"
          title="Popular training programs"
          blurb="Automatically highlighted from the catalog — never a hand-picked, hardcoded list."
        />
        <div className="mt-12">
          {featuredCourses.length === 0 ? (
            <EmptyNotice
              title="No courses featured yet"
              hint="Featured courses appear here as soon as one is spotlighted in the Academy CMS."
            />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {featuredCourses.slice(0, 6).map((course, i) => (
                <Reveal key={course.slug} delay={(i % 3) * 80}>
                  <CourseCard course={course} />
                </Reveal>
              ))}
            </div>
          )}
        </div>
        <div className="mt-10 text-center">
          <Link
            href="/academy/courses"
            className="inline-flex items-center gap-2 rounded-2xl border border-[#264D73]/20 bg-white px-6 py-3.5 text-base font-bold text-[#264D73] transition-all hover:-translate-y-0.5 hover:bg-[#264D73]/5"
          >
            See the full catalog <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </Section>

      {/* ===== SEARCH ===== */}
      <Section surface="grid" id="search">
        <SectionHeading
          eyebrow="Find an answer fast"
          title="Search the Academy"
          blurb="Ask a direct operational question — search returns the exact lesson, not a whole course."
        />
        <div className="mt-10">
          <AcademySearchBar />
        </div>
      </Section>

      {/* ===== PUBLIC ACTIONS + VERIFY ===== */}
      <Section surface="dark" id="get-started" flushBottom>
        <SectionHeading
          eyebrow="Get started"
          title="Five ways into the Academy"
          tone="light"
        />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/academy/courses"
            className="flex flex-col items-start gap-3 rounded-2xl border border-white/15 bg-white/5 p-6 transition-colors hover:bg-white/10"
          >
            <BookOpen className="h-6 w-6 text-[#67D0E4]" />
            <span className="font-serif text-base font-bold text-white">Browse Courses</span>
            <span className="text-sm text-white/60">The full unauthenticated catalog.</span>
          </Link>
          <div className="flex flex-col items-start gap-3 rounded-2xl border border-white/15 bg-white/5 p-6">
            <GraduationCap className="h-6 w-6 text-[#67D0E4]" />
            <span className="font-serif text-base font-bold text-white">Start Learning</span>
            <span className="text-sm text-white/60">Continue with EduIgnite, or create an Academy account.</span>
            <ActionCta href="/academy" label="Start Learning" variant="ghost-light" className="mt-1" />
          </div>
          <div className="flex flex-col items-start gap-3 rounded-2xl border border-white/15 bg-white/5 p-6">
            <Award className="h-6 w-6 text-[#67D0E4]" />
            <span className="font-serif text-base font-bold text-white">View Certificates</span>
            <span className="text-sm text-white/60">Your own progressive credentials portfolio.</span>
            <ActionCta href="/academy/certificates" label="View Certificates" variant="ghost-light" className="mt-1" />
          </div>
          <Link
            href="/academy/trainers"
            className="flex flex-col items-start gap-3 rounded-2xl border border-white/15 bg-white/5 p-6 transition-colors hover:bg-white/10"
          >
            <Users className="h-6 w-6 text-[#67D0E4]" />
            <span className="font-serif text-base font-bold text-white">Meet Our Trainers</span>
            <span className="text-sm text-white/60">The directory of verified EduIgnite Trainers.</span>
          </Link>
        </div>

        <div className="mx-auto mt-8 max-w-md rounded-2xl border border-white/15 bg-white/5 p-6">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-6 w-6 text-[#67D0E4]" />
            <span className="font-serif text-base font-bold text-white">Verify a Certificate</span>
          </div>
          <p className="mt-2 text-sm text-white/60">
            Check any EduIgnite certificate's cryptographic verification ID.
          </p>
          <VerifyLookupForm className="mt-4" />
        </div>
      </Section>

      {/* ===== FAQ PREVIEW ===== */}
      {faqPreview.length > 0 && (
        <Section surface="light" id="faq">
          <div className="flex items-center justify-center gap-2">
            <HelpCircle className="h-5 w-5 text-[#67D0E4]" />
            <h2 className="font-serif text-2xl font-bold tracking-tight text-[#12314d]">Common questions</h2>
          </div>
          <div className="mx-auto mt-8 max-w-3xl space-y-4">
            {faqPreview.map((faq) => (
              <div key={faq.id} className="rounded-2xl border border-slate-200 bg-white p-6">
                <p className="text-base font-black text-[#264D73]">{faq.question}</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{faq.answer}</p>
              </div>
            ))}
          </div>
        </Section>
      )}
    </AcademySiteFrame>
  );
}
