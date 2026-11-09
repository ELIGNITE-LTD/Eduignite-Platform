import type { Metadata } from "next";
import {
  organizationSchema,
  faqSchema,
  pageMetadata,
  schemaGraph,
  softwareApplicationSchema,
  webPageSchema,
  websiteSchema,
} from "@/lib/seo";
import { JsonLd } from "@/components/public/json-ld";
import Link from "next/link";
import { HOME_DESCRIPTION, HOME_TITLE, SITE_FAQ } from "@/lib/marketing-content";
import { CtaBand, FaqList, LevelCards } from "@/components/public/marketing";
import {
  Users, ClipboardCheck, NotebookPen, GraduationCap, Wallet, MessageCircle,
  BellRing, Library, Sparkles, WifiOff, Languages, ShieldCheck, CalendarDays,
  Video, Trophy, Archive, Download, ArrowRight, QrCode, School, Laptop,
} from "lucide-react";
import {
  FEATURES, ROLES, STEPS,
  fetchBlogPosts, fetchFounders, fetchGallery, fetchPlatformStats, fetchTestimonials,
  getAppsWithLatestReleases,
} from "@/lib/public-site";
import { Reveal } from "@/components/public/motion";
import { Hero } from "@/components/public/hero";
import { Section, SectionHeading } from "@/components/public/sections";
import { AppCarousel } from "@/components/public/app-carousel";
import { BlogCard, GalleryTile, VideoFeature } from "@/components/public/content-cards";
import { TestimonialMarquee } from "@/components/public/testimonial-marquee";
import { FoundersGrid } from "@/components/public/founders";

const PAGE = {
  title: HOME_TITLE,
  description: HOME_DESCRIPTION,
  path: "/",
};

export const metadata: Metadata = pageMetadata(PAGE);

// The site's main sections, each linked with text that says where it goes.
const EXPLORE = [
  { href: "/features", title: "All features", desc: "Everything EduIgnite does, grouped by who it helps.", cta: "See all EduIgnite features" },
  { href: "/primary-schools", title: "Nursery & Primary", desc: "Class-teacher registers, one-screen marks, conduct and certificates.", cta: "See EduIgnite for primary schools" },
  { href: "/secondary-schools", title: "Secondary", desc: "Sequences, coefficients, class masters, exams and online classes.", cta: "See EduIgnite for secondary schools" },
  { href: "/university-management-software-cameroon", title: "Universities & higher education", desc: "Programmes, course units with credits, semester results and transcripts with QR verification.", cta: "See EduIgnite for universities" },
  { href: "/logiciel-de-gestion-universite-cameroun", title: "Universités, en français", desc: "Le logiciel de gestion universitaire d'EduIgnite, présenté en français.", cta: "Lire la page universités en français" },
  { href: "/school-websites", title: "School websites", desc: "A public website for every school, with news, events and enrollment.", cta: "See school websites" },
  { href: "/schools", title: "School directory", desc: "Browse schools that publish their website on EduIgnite.", cta: "Browse the school directory" },
  { href: "/school-management-system-cameroon", title: "School Management System", desc: "What the system covers, and why it fits a Cameroonian school.", cta: "See how EduIgnite runs a school" },
  { href: "/logiciel-de-gestion-scolaire-cameroun", title: "En français", desc: "Le logiciel de gestion scolaire d'EduIgnite, présenté en français.", cta: "Lire la page en français" },
  { href: "/academy", title: "EduIgnite Academy", desc: "Role-based courses and verifiable certificates.", cta: "Explore EduIgnite Academy" },
  { href: "/download", title: "EduIgnite Apps", desc: "Android, Windows, web, and an offline edition.", cta: "Download EduIgnite apps" },
  { href: "/testimonials", title: "EduIgnite Stories", desc: "What schools say about running on EduIgnite.", cta: "Read EduIgnite Stories" },
  { href: "/blog", title: "EduIgnite Blog", desc: "Product updates, guides and school news.", cta: "Read the EduIgnite Blog" },
  { href: "/gallery", title: "EduIgnite Gallery", desc: "Photos and videos from schools in Cameroon.", cta: "View the EduIgnite Gallery" },
  { href: "/about", title: "About EduIgnite", desc: "Our mission, vision and the team behind it.", cta: "Learn about EduIgnite" },
  { href: "/contact", title: "Contact EduIgnite", desc: "Onboarding, support and partnerships.", cta: "Contact the EduIgnite team" },
];

// Dynamic route: founders/executives are fetched live (no-store) so profile
// edits and activations show immediately. Blog/gallery/testimonials keep their
// own per-fetch cache, so heavy content is still served from cache.
export const revalidate = 0;

const ICONS: Record<string, any> = {
  Users, ClipboardCheck, NotebookPen, GraduationCap, Wallet, MessageCircle,
  BellRing, Library, Sparkles, WifiOff, Languages, ShieldCheck, CalendarDays,
  Video, Trophy, Archive, Laptop,
};

export default async function HomePage() {
  // Everything below is real platform content; each call degrades to empty on
  // failure, and every section that depends on one hides itself when empty.
  const [stats, apps, testimonials, posts, gallery, founders] = await Promise.all([
    fetchPlatformStats(),
    getAppsWithLatestReleases(),
    fetchTestimonials(),
    fetchBlogPosts(),
    fetchGallery(),
    fetchFounders(),
  ]);

  const featuredVideo = gallery.find((item) => item.type === "video") ?? null;
  const galleryImages = gallery.filter((item) => item.type === "image").slice(0, 6);
  const marqueeTestimonials = testimonials.slice(0, 12);
  const latestPosts = posts.slice(0, 3);

  return (
    <>
      {/* Organisation, site, page - and what the software itself is, which is
          the part a search engine could only guess at before. */}
      <JsonLd
        data={schemaGraph(
          organizationSchema(),
          websiteSchema(),
          softwareApplicationSchema(),
          webPageSchema({ name: PAGE.title, description: PAGE.description, path: PAGE.path }),
          faqSchema(SITE_FAQ),
        )}
      />
      {/* ===== HERO ===== */}
      <Hero stats={stats} />

      {/* ===== LEVELS — both education levels, side by side ===== */}
      <Section surface="light" id="levels">
        <SectionHeading
          eyebrow="Every level of school"
          title="One system for nursery, primary, secondary and higher education"
          blurb="Pick your level and see how EduIgnite works for it. An institution with several sections runs them all from one account."
        />
        <div className="mt-12">
          <LevelCards />
        </div>
      </Section>

      {/* ===== APPS — dark rail, horizontally scrollable ===== */}
      <Section surface="tint" id="devices">
        <SectionHeading
          eyebrow="Three ways to use it"
          title="Available on every device your school uses"
          blurb="The same school and the same data on the office computer, on staff and parent phones, and in any browser."
        />
        <div className="mt-12">
          <AppCarousel apps={apps} />
        </div>
      </Section>

      {/* ===== FEATURES — patterned grid surface ===== */}
      <Section surface="grid" id="features">
        <SectionHeading
          eyebrow="Everything in one place"
          title="The complete school office"
          blurb="Replace scattered registers, spreadsheets and chat groups with one connected system."
        />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => {
            const Icon = ICONS[f.icon] || Sparkles;
            return (
              <Reveal key={f.title} delay={(i % 3) * 80}>
                <div className="group h-full rounded-2xl border border-slate-200/80 bg-white p-7 shadow-[0_1px_2px_rgba(18,49,77,0.04),0_16px_36px_-22px_rgba(18,49,77,0.2)] transition-all duration-300 hover:-translate-y-1.5 hover:border-[#67D0E4]/50 hover:shadow-[0_1px_2px_rgba(18,49,77,0.05),0_26px_52px_-26px_rgba(18,49,77,0.3)]">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#67D0E4]/15 text-[#264D73] transition-transform duration-300 group-hover:scale-110">
                    <Icon className="h-5 w-5" strokeWidth={1.75} />
                  </span>
                  <h3 className="mt-5 font-serif text-lg font-bold text-[#12314d]">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.desc}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </Section>

      {/* ===== Classroom band — who EduIgnite is built for ===== */}
      <section className="relative isolate overflow-hidden">
        <img
          src="/images/about-education.jpg"
          alt="A class in session in a bright, modern classroom"
          className="h-[320px] w-full object-cover object-center sm:h-[440px]"
          loading="lazy"
        />
        <div
          className="absolute inset-0 bg-gradient-to-r from-[#0e2438]/90 via-[#12314d]/60 to-[#12314d]/10"
          aria-hidden
        />
        <div className="absolute inset-0 flex items-center">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-xl text-white">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#8FD9E8]">Built for real schools</p>
              <h2 className="mt-3 font-serif text-3xl font-bold leading-tight sm:text-4xl">
                From the classroom to the front office — one connected system
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-white/80">
                Marks, attendance, report cards, fees and messages — all in one place your whole school can rely on,
                online or offline.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== VIDEO — only when a founder has published one ===== */}
      {featuredVideo && (
        <Section surface="dark" id="video">
          <div className="grid items-center gap-10 lg:grid-cols-[0.85fr_1.15fr]">
            <Reveal>
              <SectionHeading
                eyebrow="Watch"
                title={featuredVideo.title || "See EduIgnite in action"}
                blurb={featuredVideo.description || "A short look at what EduIgnite does for a school."}
                tone="light"
                align="left"
              />
              <Link
                href="/gallery"
                className="mt-8 inline-flex items-center gap-2 rounded-2xl border border-white/25 px-6 py-3.5 text-base font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-white/10"
              >
                More videos &amp; photos <ArrowRight className="h-5 w-5" />
              </Link>
            </Reveal>
            <Reveal delay={140}>
              <VideoFeature item={featuredVideo} />
            </Reveal>
          </div>
        </Section>
      )}

      {/* ===== VERIFICATION — inset panel on white ===== */}
      <Section surface="light">
        <Reveal>
          <div className="grid items-center gap-10 rounded-[2rem] border border-slate-200 bg-gradient-to-br from-[#F7F9FC] to-white p-8 sm:p-12 lg:grid-cols-2">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#0E7490]">
                Documents you can trust
              </p>
              <h2 className="mt-3 font-serif text-[2rem] font-bold leading-[1.15] tracking-tight text-[#12314d] sm:text-[2.6rem]">
                Every report card and ID card can be verified
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-slate-600">
                Report cards and student ID cards issued on EduIgnite carry a QR code. Scanning it opens a
                public verification page that confirms the document came from the school and matches the
                record on file. No account is needed.
              </p>
              <p className="mt-4 text-sm leading-relaxed text-slate-500">
                Documents belonging to records the school has removed are never confirmed as authentic.
              </p>
            </div>
            <div className="flex justify-center">
              <div className="relative">
                <div className="absolute -inset-6 -z-10 rounded-full bg-[#67D0E4]/15 blur-2xl" aria-hidden />
                <div className="flex h-40 w-40 items-center justify-center rounded-3xl border border-slate-200 bg-white shadow-xl transition-transform duration-500 hover:scale-105 sm:h-48 sm:w-48">
                  <QrCode className="h-20 w-20 text-[#264D73] sm:h-24 sm:w-24" strokeWidth={1.25} />
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </Section>

      {/* ===== TESTIMONIALS — tinted surface, continuous marquee ===== */}
      {marqueeTestimonials.length > 0 && (
        <Section surface="tint" id="stories">
          <SectionHeading
            eyebrow="Stories"
            title="What schools say"
            blurb="Written by people running their own school on EduIgnite, and published after review."
          />
          <div className="mt-12">
            <TestimonialMarquee items={marqueeTestimonials} fade="#EBF3FA" />
          </div>
          <div className="mt-10 text-center">
            <Link
              href="/testimonials"
              className="inline-flex items-center gap-2 rounded-2xl border border-[#264D73]/20 bg-white px-6 py-3.5 text-base font-bold text-[#264D73] transition-all hover:-translate-y-0.5 hover:bg-[#264D73]/5"
            >
              Read every story <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </Section>
      )}

      {/* ===== FOUNDERS — the team behind EduIgnite ===== */}
      {founders.length > 0 && (
        <Section surface="light" id="leadership">
          <SectionHeading
            eyebrow="Leadership"
            title="The people behind EduIgnite"
            blurb="Two co-founders and the executive team building for Cameroon's schools."
          />
          <FoundersGrid founders={founders} />
        </Section>
      )}

      {/* ===== GALLERY — dotted surface, media tiles ===== */}
      {galleryImages.length > 0 && (
        <Section surface="dots" id="gallery">
          <SectionHeading
            eyebrow="Gallery"
            title="EduIgnite in the field"
            blurb="Photos from schools using the platform across Cameroon."
          />
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {galleryImages.map((item, i) => (
              <Reveal key={item.id} delay={(i % 3) * 80}>
                <GalleryTile item={item} />
              </Reveal>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link
              href="/gallery"
              className="inline-flex items-center gap-2 rounded-2xl border border-[#264D73]/20 bg-white px-6 py-3.5 text-base font-bold text-[#264D73] transition-all hover:-translate-y-0.5 hover:bg-[#264D73]/5"
            >
              Open the gallery <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </Section>
      )}

      {/* ===== ROLES — white, plain cards ===== */}
      <Section surface="light" id="roles">
        <SectionHeading eyebrow="Built for everyone" title="A workspace for every role" />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {ROLES.map((r, i) => (
            <Reveal key={r.title} delay={(i % 3) * 80}>
              <div className="group h-full rounded-2xl border border-slate-200/80 bg-[#F7F9FC] p-7 transition-all duration-300 hover:-translate-y-1.5 hover:border-[#67D0E4]/40 hover:bg-white hover:shadow-[0_1px_2px_rgba(18,49,77,0.05),0_26px_52px_-26px_rgba(18,49,77,0.28)]">
                <span className="mb-4 block h-8 w-0.5 rounded-full bg-gradient-to-b from-[#67D0E4] to-[#264D73] transition-all duration-300 group-hover:h-10" aria-hidden />
                <h3 className="font-serif text-lg font-bold text-[#264D73]">{r.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{r.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* ===== BLOG — tinted, editorial cards ===== */}
      {latestPosts.length > 0 && (
        <Section surface="grid" id="blog">
          <SectionHeading
            eyebrow="From the blog"
            title="News and updates"
            blurb="Product news, school stories and guides from the EduIgnite community."
          />
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {latestPosts.map((post, i) => (
              <Reveal key={post.slug} delay={(i % 3) * 90}>
                <BlogCard post={post} />
              </Reveal>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 rounded-2xl border border-[#264D73]/20 bg-white px-6 py-3.5 text-base font-bold text-[#264D73] transition-all hover:-translate-y-0.5 hover:bg-[#264D73]/5"
            >
              Read the blog <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </Section>
      )}

      {/* ===== STEPS — patterned grid ===== */}
      <Section surface="tint" id="steps">
        <SectionHeading eyebrow="Getting started" title="Up and running in four steps" />
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <Reveal key={s.title} delay={i * 110}>
              <div className="relative h-full rounded-2xl border border-slate-200/80 bg-white p-7 shadow-[0_1px_2px_rgba(18,49,77,0.04),0_16px_36px_-22px_rgba(18,49,77,0.2)] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_1px_2px_rgba(18,49,77,0.05),0_26px_52px_-26px_rgba(18,49,77,0.3)]">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#264D73] to-[#3d7ba8] font-serif text-base font-bold text-white shadow-sm">
                  {i + 1}
                </span>
                <h3 className="mt-5 font-serif text-lg font-bold text-[#12314d]">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* ===== SCHOOL WEBSITES ===== */}
      <Section surface="tint" id="school-websites">
        <div className="mx-auto max-w-3xl text-center">
          <SectionHeading
            eyebrow="Public school websites"
            title="Every school can have its own website on EduIgnite"
            blurb="News, events, a photo gallery and online enrollment, published by the school and listed in the EduIgnite school directory so families can find it."
          />
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/school-websites" className="inline-flex items-center gap-2 rounded-full bg-[#12314d] px-6 py-3 text-sm font-bold text-white">
              How school websites work <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link href="/schools" className="inline-flex items-center gap-2 rounded-full border border-[#264D73]/20 bg-white px-6 py-3 text-sm font-bold text-[#264D73]">
              Browse the school directory
            </Link>
          </div>
        </div>
      </Section>

      {/* ===== FAQ ===== */}
      <Section surface="light" id="faq">
        <SectionHeading eyebrow="Questions" title="What schools ask before they start" />
        <div className="mt-10">
          <FaqList items={SITE_FAQ} />
        </div>
      </Section>

      {/* ===== EXPLORE ===== */}
      <Section surface="light" id="explore">
        <SectionHeading eyebrow="Explore" title="Everything EduIgnite, in one place" />
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {EXPLORE.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="group flex h-full flex-col rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(18,49,77,0.04),0_16px_36px_-22px_rgba(18,49,77,0.2)] transition-all duration-300 hover:-translate-y-1 hover:border-[#67D0E4]"
              >
                <h3 className="font-serif text-lg font-bold text-[#12314d]">{item.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{item.desc}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-[#264D73]">
                  {item.cta}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      {/* ===== CTA ===== */}
      <Section surface="dark" className="text-center" flushBottom>
        <Reveal>
          <h2 className="font-serif text-[2rem] font-bold leading-[1.15] tracking-tight sm:text-[2.6rem]">
            Ready to bring your whole school together?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-white/70">
            Run admissions, attendance, marks, report cards, fees and family messaging on one platform
            built for Cameroon schools.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/download"
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-3.5 text-base font-bold text-[#264D73] shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#67D0E4] active:translate-y-0"
            >
              <Download className="h-5 w-5" /> Download the apps
            </Link>
            <Link
              href="/school-account-request"
              className="group inline-flex items-center gap-2 rounded-2xl border border-white/25 px-6 py-3.5 text-base font-bold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/10"
            >
              Request a school account
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </Reveal>
      </Section>
    </>
  );
}
