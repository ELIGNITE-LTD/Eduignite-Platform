import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, ShieldAlert, Award, CalendarDays } from "lucide-react";
import { verifyCertificate, CERTIFICATE_TIER_LABEL } from "@/app/academy/_lib/public-api";
import { AcademySiteFrame } from "@/app/academy/_components/site-frame";
import { AcademyLogo } from "@/app/academy/_components/academy-brand";
import { Section } from "@/components/public/sections";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Verify Certificate ${decodeURIComponent(id)} | EduIgnite Academy`,
    description: "Verify the authenticity of an EduIgnite Academy certificate by its verification ID.",
  };
}

// A verification lookup must always reflect the live database — never cache
// a stale "not found" or a stale certificate record.
export const dynamic = "force-dynamic";

export default async function VerifyCertificatePage({ params }: Params) {
  const { id } = await params;
  const verificationId = decodeURIComponent(id);
  const certificate = await verifyCertificate(verificationId);

  const issuedDate = certificate
    ? new Date(certificate.issued_at).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <AcademySiteFrame>
      <section
        className="relative isolate overflow-hidden"
        style={{ background: "linear-gradient(to bottom, #EAF3FA 0%, #F2F7FB 55%, #FBFCFE 100%)" }}
      >
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
          <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-[#67D0E4]/20 blur-3xl" />
          <div className="absolute -right-24 top-0 h-80 w-80 rounded-full bg-[#264D73]/8 blur-3xl" />
        </div>
        <div className="relative mx-auto w-full max-w-2xl px-4 py-16 text-center sm:px-6 lg:py-20">
          <p className="flex items-center justify-center gap-3 text-[11px] font-black uppercase tracking-[0.28em] text-[#67D0E4]">
            <span className="h-px w-6 bg-[#67D0E4]/50" aria-hidden />
            Certificate verification
            <span className="h-px w-6 bg-[#67D0E4]/50" aria-hidden />
          </p>
          <h1 className="mx-auto mt-4 max-w-xl font-serif text-3xl font-bold leading-[1.15] tracking-tight text-[#12314d] sm:text-4xl">
            {certificate ? "This certificate is verified" : "Certificate not found"}
          </h1>
        </div>
      </section>

      <Section surface="light">
        <div className="mx-auto max-w-xl">
          {certificate ? (
            <div className="rounded-3xl border-2 border-[#67D0E4]/40 bg-white p-8 text-center shadow-sm">
              <AcademyLogo size="lg" className="mx-auto" />
              <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-emerald-700">
                <ShieldCheck className="h-3.5 w-3.5" /> Verified by EduIgnite
              </p>
              <p className="mt-4 text-sm font-black uppercase tracking-widest text-[#67D0E4]">
                {CERTIFICATE_TIER_LABEL[certificate.tier]}
              </p>
              <p className="mt-3 font-serif text-2xl font-bold text-[#12314d]">{certificate.learner_name}</p>
              <p className="mt-1 text-base text-slate-600">has successfully completed</p>
              <p className="mt-1 font-serif text-lg font-bold text-[#264D73]">{certificate.course_title}</p>

              <div className="mt-6 flex flex-wrap items-center justify-center gap-5 border-t border-slate-100 pt-6 text-sm font-semibold text-slate-500">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-4 w-4 text-[#67D0E4]" /> Issued {issuedDate}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Award className="h-4 w-4 text-[#67D0E4]" /> ID: {certificate.verification_id}
                </span>
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border-2 border-dashed border-slate-300 bg-white/60 p-8 text-center">
              <ShieldAlert className="mx-auto h-12 w-12 text-slate-400" strokeWidth={1.5} />
              <p className="mt-5 font-serif text-lg font-bold text-[#12314d]">
                No certificate matches &ldquo;{verificationId}&rdquo;
              </p>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
                Double-check the verification ID (format: EDU-2026-000123) and try again — it appears on every
                issued EduIgnite Academy certificate.
              </p>
            </div>
          )}

          <div className="mt-8 text-center">
            <Link
              href="/academy"
              className="inline-flex items-center gap-1.5 text-sm font-bold text-[#264D73] hover:underline"
            >
              <ArrowLeft className="h-4 w-4" /> Back to EduIgnite Academy
            </Link>
          </div>
        </div>
      </Section>
    </AcademySiteFrame>
  );
}
