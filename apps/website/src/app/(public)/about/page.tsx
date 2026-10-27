import type { Metadata } from "next";
import { pageMetadata, schemaGraph, webPageSchema } from "@/lib/seo";
import { JsonLd } from "@/components/public/json-ld";
import Link from "next/link";
import { Target, Eye, CheckCircle2, ArrowRight, Sparkles, ShieldCheck, Users } from "lucide-react";
import { ROLES, SITE, fetchFounders } from "@/lib/public-site";
import { PageHero, Section, SectionHeading } from "@/components/public/sections";
import { FoundersGrid } from "@/components/public/founders";

const PAGE = {
  title: "About EduIgnite | Building Better School Management for Cameroon",
  description:
    "Why EduIgnite exists, the problems it solves for Cameroonian schools, its mission and vision, and the people building it.",
  path: "/about",
};

export const metadata: Metadata = pageMetadata(PAGE);

// Dynamic route: founders/executives are fetched live (no-store) so profile
// edits and activations show immediately. Other sections keep their per-fetch
// cache.
export const revalidate = 0;

const PROBLEMS = [
  "Records scattered across books, files and spreadsheets that are hard to search or keep current.",
  "Messages to parents and students getting lost or arriving late.",
  "Hours spent calculating marks, writing report cards and chasing fee payments.",
  "Parents only learning how their child is doing at the end of term.",
  "Cash handling, lost receipts and unclear records of who has paid.",
];

const OBJECTIVES = [
  "Centralise student, staff, academic and financial records in one organised place.",
  "Automate attendance, mark calculation, report cards, ID cards, receipts and reminders.",
  "Give parents and students real-time visibility of results, attendance and fees.",
  "Make fee collection simple with mobile-money payments and instant receipts.",
  "Support teaching with assignments, online exams, a digital library and AI tools.",
  "Keep working on web, desktop and mobile, even without internet.",
];

/** A classic, self-contained visual panel — reads as a professional image without external assets. */
function VisualPanel({
  icon: Icon,
  kicker,
  caption,
  tone,
}: {
  icon: typeof Target;
  kicker: string;
  caption: string;
  tone: "navy" | "cyan";
}) {
  const dark = tone === "navy";
  return (
    <div
      className={`relative overflow-hidden rounded-3xl p-8 shadow-[0_20px_60px_-30px_rgba(18,49,77,0.5)] ${
        dark ? "bg-gradient-to-br from-[#12314d] via-[#1c3c5c] to-[#264D73] text-white" : "bg-gradient-to-br from-[#67D0E4] via-[#4bb8cf] to-[#264D73] text-white"
      }`}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{ backgroundImage: "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)", backgroundSize: "38px 38px" }}
        aria-hidden
      />
      <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" aria-hidden />
      <div className="absolute -bottom-12 -left-8 h-44 w-44 rounded-full bg-white/10 blur-2xl" aria-hidden />
      <div className="relative flex min-h-[220px] flex-col justify-between">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
          <Icon className="h-8 w-8" />
        </span>
        <div className="mt-8">
          <p className="text-[11px] font-black uppercase tracking-[0.25em] text-white/70">{kicker}</p>
          <p className="mt-2 font-serif text-xl font-bold italic leading-snug">{caption}</p>
        </div>
      </div>
    </div>
  );
}

export default async function AboutPage() {
  const founders = await fetchFounders();

  return (
    <>
      <JsonLd data={schemaGraph(webPageSchema({ name: PAGE.title, description: PAGE.description, path: PAGE.path, type: "AboutPage", crumbs: [{ name: "Home", path: "/" }, { name: "About", path: "/about" }] }))} />
      <PageHero
        eyebrow="About us"
        title="Built for the way Cameroon schools actually work"
        blurb={`${SITE.name} is a complete school management and learning platform that brings students, teachers, parents and staff into one connected system.`}
      />

      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-[1.75rem] border border-white shadow-[0_32px_64px_-24px_rgba(18,49,77,0.3)]">
          <img
            src="/images/about-hero.jpg"
            alt="Students and teachers collaborating in a bright, modern learning space"
            className="aspect-[16/9] w-full object-cover"
            loading="lazy"
          />
        </div>
      </div>

      {/* Mission — why we built it. */}
      <Section surface="light" id="mission">
        <SectionHeading eyebrow="Our mission" title="Why we built EduIgnite" />
        <div className="mx-auto mt-12 grid max-w-6xl items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#264D73] text-white">
              <Target className="h-6 w-6" />
            </span>
            <p className="mt-5 text-base leading-relaxed text-slate-600">
              Most schools run on a mix of paper registers, spreadsheets, printed report cards and chat groups.
              None of it connects, information gets lost, and staff lose hours to work that could be automatic.
              We built EduIgnite to replace that patchwork with one clear, connected system.
            </p>
            <ul className="mt-6 space-y-3">
              {PROBLEMS.map((p) => (
                <li key={p} className="flex gap-3 text-sm leading-relaxed text-slate-600">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#67D0E4]" />
                  {p}
                </li>
              ))}
            </ul>
          </div>
          <VisualPanel
            icon={Sparkles}
            tone="navy"
            kicker="One connected platform"
            caption="Less paperwork, and every record in one place."
          />
        </div>
      </Section>

      {/* Vision — where we are going. */}
      <Section surface="tint" id="vision">
        <SectionHeading eyebrow="Our vision" title="Where EduIgnite is going" />
        <div className="mx-auto mt-12 grid max-w-6xl items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <VisualPanel
            icon={Eye}
            tone="cyan"
            kicker="The digital backbone"
            caption="Quality school-management tools within reach of every institution, of every size."
          />
          <div>
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#67D0E4] text-[#12314d]">
              <Eye className="h-6 w-6" />
            </span>
            <p className="mt-5 text-base leading-relaxed text-slate-600">
              To become the trusted digital backbone of every school: turning administration into automation,
              connecting the whole school community, and bringing transparency to education so that quality
              school-management tools are within reach of institutions of every size.
            </p>
            <h3 className="mt-7 text-sm font-black uppercase tracking-widest text-[#264D73]">What we set out to do</h3>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {OBJECTIVES.map((o) => (
                <li key={o} className="flex gap-3 text-sm leading-relaxed text-slate-600">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#67D0E4]" />
                  {o}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      {/* Founders. */}
      {founders.length > 0 && (
        <Section surface="light" id="leadership">
          <SectionHeading
            eyebrow="Leadership"
            title="The people behind EduIgnite"
            blurb="EduIgnite was co-founded by its Chief Executive Officer and Chief Technology Officer, who lead it alongside the executive team."
          />
          <FoundersGrid founders={founders} />
        </Section>
      )}

      {/* Who it serves. */}
      <Section surface="dots" id="roles">
        <SectionHeading eyebrow="Who it serves" title="One system, every role" />
        <div className="mt-11 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {ROLES.map((r) => (
            <div
              key={r.title}
              className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(18,49,77,0.04),0_14px_32px_-24px_rgba(18,49,77,0.2)]"
            >
              <h3 className="font-serif text-base font-bold text-[#264D73]">{r.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{r.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-center gap-6 text-sm text-slate-500">
          <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#67D0E4]" /> Secure, role-based access</span>
          <span className="inline-flex items-center gap-2"><Users className="h-4 w-4 text-[#67D0E4]" /> Built for the whole school community</span>
        </div>

        <div className="mt-10 text-center">
          <Link
            href="/download"
            className="inline-flex items-center gap-2 rounded-2xl bg-[#264D73] px-6 py-3.5 text-base font-bold text-white shadow-lg transition-all hover:-translate-y-0.5 hover:bg-[#1c3c5c]"
          >
            Download the apps <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </Section>
    </>
  );
}
