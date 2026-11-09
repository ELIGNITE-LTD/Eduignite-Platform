import Link from "next/link";
import {
  ArrowRight, Award, Building2, CalendarDays, ClipboardCheck, Globe, GraduationCap, Handshake,
  Headset, HeartPulse, Inbox, Languages, Layers, Library, Megaphone, MessageCircle, NotebookPen,
  QrCode, ShieldCheck, Sparkles, Users, Video, Wallet, WifiOff, CreditCard, School, Baby,
} from "lucide-react";
import type { ComponentType } from "react";

import { PageHero, Section, SectionHeading } from "@/components/public/sections";

import { LEVELS, type Faq, type Feature, type FeatureGroup, type IconName } from "@/lib/marketing-content";

const ICONS: Record<IconName, ComponentType<{ className?: string; strokeWidth?: number }>> = {
  users: Users, clipboard: ClipboardCheck, notebook: NotebookPen, wallet: Wallet, message: MessageCircle,
  library: Library, qr: QrCode, wifi: WifiOff, languages: Languages, globe: Globe, calendar: CalendarDays,
  shield: ShieldCheck, sparkles: Sparkles, video: Video, heart: HeartPulse, award: Award, layers: Layers,
  card: CreditCard, megaphone: Megaphone, headset: Headset, handshake: Handshake, graduation: GraduationCap,
  inbox: Inbox,
};

export function FeatureCard({ feature }: { feature: Feature }) {
  const Icon = ICONS[feature.icon] ?? Sparkles;
  return (
    <div className="h-full rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(18,49,77,0.04),0_16px_36px_-22px_rgba(18,49,77,0.2)]">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#67D0E4]/15 text-[#264D73]">
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </span>
      <h3 className="mt-4 font-serif text-lg font-bold text-[#12314d]">{feature.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{feature.body}</p>
    </div>
  );
}

export function FeatureGrid({ items }: { items: Feature[] }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((feature) => (
        <FeatureCard key={feature.title} feature={feature} />
      ))}
    </div>
  );
}

export function FeatureGroupBlock({ group, headingLevel = 2 }: { group: FeatureGroup; headingLevel?: 2 | 3 }) {
  const H = headingLevel === 2 ? "h2" : "h3";
  return (
    <div id={group.id} className="scroll-mt-24">
      <H className="font-serif text-2xl font-bold text-[#12314d] sm:text-3xl">{group.title}</H>
      <p className="mt-2 max-w-2xl text-slate-600">{group.blurb}</p>
      <div className="mt-6">
        <FeatureGrid items={group.items} />
      </div>
    </div>
  );
}

/** Two cards that make both education levels obvious at a glance. */
export function LevelCards({ headingLevel = 3 }: { headingLevel?: 2 | 3 }) {
  const H = headingLevel === 2 ? "h2" : "h3";
  return (
    <ul className="grid gap-5 md:grid-cols-2">
      {LEVELS.map((level) => {
        const Icon = level.key === "primary" ? Baby : School;
        return (
          <li key={level.key}>
            <Link
              href={level.slug}
              className="group flex h-full flex-col rounded-3xl border border-slate-200/80 bg-white p-7 shadow-[0_1px_2px_rgba(18,49,77,0.04),0_18px_36px_-24px_rgba(18,49,77,0.2)] transition-all hover:-translate-y-1 hover:border-[#67D0E4]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#67D0E4]"
            >
              <span className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#12314d] text-white">
                  <Icon className="h-6 w-6" aria-hidden />
                </span>
                <span>
                  <H className="font-serif text-xl font-bold text-[#12314d]">{level.title}</H>
                  <span className="block text-xs font-semibold uppercase tracking-wider text-[#0E7490]">{level.french}</span>
                </span>
              </span>
              <p className="mt-4 text-[15px] leading-relaxed text-slate-600">{level.summary}</p>
              <ul className="mt-4 space-y-1.5 text-sm text-slate-700">
                {level.points.map((point) => (
                  <li key={point} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#67D0E4]" aria-hidden />
                    {point}
                  </li>
                ))}
              </ul>
              <span className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#264D73]">
                {level.key === "primary" ? "See the nursery & primary system" : "See the secondary system"}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function FaqList({ items }: { items: Faq[] }) {
  return (
    <div className="mx-auto max-w-3xl divide-y divide-slate-200/70">
      {items.map((item) => (
        <div key={item.question} className="py-6">
          <h3 className="text-lg font-bold text-[#0B1F33]">{item.question}</h3>
          <p className="mt-2.5 text-[15px] leading-[1.8] text-slate-600">{item.answer}</p>
        </div>
      ))}
    </div>
  );
}

export function CtaBand({
  title = "Bring your school onto EduIgnite",
  text = "Tell us about your school and we will set it up, with your administrator account ready to register classes, staff and students.",
}: { title?: string; text?: string }) {
  return (
    <div className="mx-auto max-w-3xl rounded-[2rem] bg-[#12314d] px-8 py-12 text-center text-white sm:px-14">
      <h2 className="font-display text-3xl leading-tight sm:text-4xl">{title}</h2>
      <p className="mx-auto mt-4 max-w-xl text-[1.0625rem] leading-relaxed text-white/75">{text}</p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/school-account-request"
          className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-4 text-[15px] font-bold text-[#12314d] transition-transform hover:-translate-y-0.5"
        >
          Request a school account <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
        <Link
          href="/schools"
          className="inline-flex items-center gap-2 rounded-full border border-white/25 px-7 py-4 text-[15px] font-bold text-white transition-colors hover:bg-white/10"
        >
          <Building2 className="h-4 w-4" aria-hidden /> Browse schools
        </Link>
      </div>
    </div>
  );
}

export type ContentSection = { id: string; title: string; blurb?: string; items: Feature[] };

/** Standard layout for a feature landing page: hero, feature sections, FAQ, call to action. */
export function ContentPage({
  eyebrow, title, blurb, intro, sections, faq, faqTitle = "Questions", related,
}: {
  eyebrow: string;
  title: string;
  blurb: string;
  intro?: string;
  sections: ContentSection[];
  faq?: Faq[];
  faqTitle?: string;
  related: { href: string; label: string }[];
}) {
  return (
    <>
      <PageHero eyebrow={eyebrow} title={title} blurb={blurb} />
      {intro ? (
        <Section>
          <p className="mx-auto max-w-3xl text-[1.0625rem] leading-[1.8] text-slate-600">{intro}</p>
        </Section>
      ) : null}
      {sections.map((section, index) => (
        <Section key={section.id} id={section.id} surface={index % 2 === 0 ? "tint" : "light"}>
          <h2 className="font-serif text-2xl font-bold text-[#12314d] sm:text-3xl">{section.title}</h2>
          {section.blurb ? <p className="mt-2 max-w-2xl text-slate-600">{section.blurb}</p> : null}
          <div className="mt-6">
            <FeatureGrid items={section.items} />
          </div>
        </Section>
      ))}
      {faq?.length ? (
        <Section id="faq">
          <SectionHeading eyebrow="FAQ" title={faqTitle} />
          <div className="mt-10">
            <FaqList items={faq} />
          </div>
        </Section>
      ) : null}
      <Section surface="tint">
        <CtaBand />
        <RelatedLinks links={related} />
      </Section>
    </>
  );
}

/** Small related-pages strip for internal linking. */
export function RelatedLinks({ links }: { links: { href: string; label: string }[] }) {
  return (
    <nav aria-label="Related pages" className="mx-auto mt-10 flex max-w-3xl flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
      {links.map((link) => (
        <Link key={link.href} href={link.href} className="font-semibold text-[#264D73] underline-offset-4 hover:underline">
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
