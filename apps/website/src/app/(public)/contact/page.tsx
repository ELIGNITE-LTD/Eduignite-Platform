import type { Metadata } from "next";
import { pageMetadata, schemaGraph, webPageSchema } from "@/lib/seo";
import { JsonLd } from "@/components/public/json-ld";
import Link from "next/link";
import { Mail, MapPin, School, LifeBuoy, ArrowRight } from "lucide-react";
import { SITE } from "@/lib/public-site";
import { PageHero, Section } from "@/components/public/sections";
import { ContactForm } from "@/components/public/contact-form";

const PAGE = {
  title: "Contact EduIgnite | School Onboarding, Support & Partnerships",
  description:
    "Contact the EduIgnite team to bring your school onto EduIgnite, get help with your account, or discuss a partnership.",
  path: "/contact",
};

export const metadata: Metadata = pageMetadata(PAGE);

export default function ContactPage() {
  return (
    <>
      <JsonLd data={schemaGraph(webPageSchema({ name: PAGE.title, description: PAGE.description, path: PAGE.path, type: "ContactPage", crumbs: [{ name: "Home", path: "/" }, { name: "Contact", path: "/contact" }] }))} />
      <PageHero
        eyebrow="Contact"
        title={`Talk to the ${SITE.name} team`}
        blurb="Whether you want to bring your school onto EduIgnite, need help with your account, or would like to partner with us, we would love to hear from you."
      />

      <Section surface="light">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          {/* The form — messages land in the dashboard. */}
          <ContactForm />

          {/* Ways to reach us. */}
          <div className="flex flex-col gap-5">
            <div id="bring-school" className="scroll-mt-24 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(18,49,77,0.04),0_14px_32px_-24px_rgba(18,49,77,0.2)]">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#264D73] text-white">
                <School className="h-5 w-5" />
              </span>
              <h2 className="mt-4 font-serif text-lg font-bold text-[#12314d]">Bring your school on board</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Request an account and we will set your school up with its details, classes and administrator.
              </p>
              <Link
                href="/school-account-request"
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-[#264D73] hover:underline"
              >
                Request a school account <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div id="already-using" className="scroll-mt-24 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(18,49,77,0.04),0_14px_32px_-24px_rgba(18,49,77,0.2)]">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#67D0E4] text-[#12314d]">
                <LifeBuoy className="h-5 w-5" />
              </span>
              <h2 className="mt-4 font-serif text-lg font-bold text-[#12314d]">Already using EduIgnite?</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Sign in and use the Support section inside your account. It reaches us directly with your school
                details attached.
              </p>
              <Link href="/login" className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-[#264D73] hover:underline">
                Go to login <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div id="email-us" className="scroll-mt-24 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(18,49,77,0.04),0_14px_32px_-24px_rgba(18,49,77,0.2)]">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#264D73] text-white">
                <Mail className="h-5 w-5" />
              </span>
              <h2 className="mt-4 font-serif text-lg font-bold text-[#12314d]">Email us</h2>
              <a
                href={`mailto:${SITE.email}`}
                className="mt-2 inline-flex items-center gap-1.5 break-all text-sm font-bold text-[#264D73] hover:underline"
              >
                {SITE.email}
              </a>
              <p className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                <MapPin className="h-4 w-4 text-[#67D0E4]" /> {SITE.location}
              </p>
            </div>
          </div>
        </div>
      </Section>

      <Section surface="dark" className="text-center">
        <h2 className="font-serif text-[2rem] font-bold tracking-tight sm:text-[2.6rem]">Ready to get started?</h2>
        <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-white/70">
          Download the apps today, or request an account for your school.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/download" className="inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-3.5 text-base font-bold text-[#12314d] shadow-lg transition-all hover:-translate-y-0.5 hover:bg-[#67D0E4]">
            Download the apps
          </Link>
          <Link href="/school-account-request" className="inline-flex items-center gap-2 rounded-2xl border border-white/25 px-6 py-3.5 text-base font-bold text-white hover:bg-white/10">
            Request an account
          </Link>
        </div>
      </Section>
    </>
  );
}
