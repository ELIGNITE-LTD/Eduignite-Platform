"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api/errors";
import { downloadBlob } from "@/lib/browser-download";
import { downloadCertificate, getMyCertificates, type MyCertificate } from "../start/_lib/api";
import { AlertTriangle, Download, ExternalLink, Loader2 } from "lucide-react";
import { AcademyLoadingScreen, AcademyLogo } from "../_components/academy-brand";

const TIER_LABEL: Record<MyCertificate["tier"], string> = {
  COMPLETION: "Certificate of Completion",
  CERTIFIED_USER: "Certified EduIgnite User",
  CERTIFIED_TRAINER: "Certified EduIgnite Trainer",
};

/**
 * The logged-in learner's OWN certificates ("View Certificates" from the
 * public Academy landing page). Distinct from the public /academy/verify/[id]
 * lookup-by-ID page another agent builds — that one is for anyone to verify a
 * single certificate; this one lists everything the current account holds.
 */
export default function MyCertificatesPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [certificates, setCertificates] = useState<MyCertificate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleDownload = async (cert: MyCertificate) => {
    setDownloadingId(cert.id);
    try {
      const blob = await downloadCertificate(cert.id);
      downloadBlob(blob, `EduIgnite-Certificate-${cert.verification_id}.pdf`);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Download Failed",
        description: getApiErrorMessage(err, "Could not download this certificate."),
      });
    } finally {
      setDownloadingId(null);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.replace(`/academy/start?returnPath=${encodeURIComponent("/academy/certificates")}`);
      return;
    }
    (async () => {
      try {
        const data = await getMyCertificates();
        setCertificates(data);
      } catch (err) {
        setError(getApiErrorMessage(err, "Could not load your certificates."));
      }
    })();
  }, [authLoading, isAuthenticated, router]);

  if (authLoading || (!certificates && !error)) {
    return <AcademyLoadingScreen label="Loading your certificates" />;
  }

  return (
    <div className="min-h-screen bg-[#FBFCFE]">
      <section
        className="relative isolate overflow-hidden"
        style={{ background: "linear-gradient(to bottom, #EAF3FA 0%, #F2F7FB 55%, #FBFCFE 100%)" }}
      >
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
          <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-[#67D0E4]/20 blur-3xl" />
          <div className="absolute -right-24 top-0 h-80 w-80 rounded-full bg-[#264D73]/8 blur-3xl" />
        </div>
        <div className="relative mx-auto w-full max-w-4xl px-4 py-12 text-center sm:px-6 sm:py-16">
          <a href="/academy" className="mb-6 inline-flex" aria-label="EduIgnite Academy home">
            <AcademyLogo size="lg" />
          </a>
          <p className="flex items-center justify-center gap-3 text-[11px] font-black uppercase tracking-[0.28em] text-[#67D0E4]">
            <span className="h-px w-6 bg-[#67D0E4]/50" aria-hidden />
            Your credentials
            <span className="h-px w-6 bg-[#67D0E4]/50" aria-hidden />
          </p>
          <h1 className="mx-auto mt-4 font-serif text-3xl font-bold leading-[1.15] tracking-tight text-[#12314d] sm:text-4xl">
            My certificates
          </h1>
          <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-slate-600">
            Every certificate you&apos;ve earned in EduIgnite Academy.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-4xl space-y-6 px-4 pb-16 sm:px-6">
        {error && (
          <div className="mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <p className="text-sm font-semibold text-red-900">{error}</p>
          </div>
        )}

        {certificates && certificates.length === 0 && (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white/60 px-8 py-16 text-center backdrop-blur">
            <AcademyLogo size="lg" className="mx-auto opacity-60" />
            <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-slate-600">
              You haven&apos;t earned a certificate yet. Complete a course to earn your first one.
            </p>
            <a
              href="/academy/courses"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#264D73] px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-[#1c3c5c]"
            >
              Browse courses
            </a>
          </div>
        )}

        {certificates && certificates.length > 0 && (
          <div className="grid gap-5 sm:grid-cols-2">
            {certificates.map((cert) => (
              <div key={cert.id} className="flex flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <AcademyLogo size="md" />
                  <span className="rounded-full bg-[#67D0E4]/15 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-[#264D73]">
                    {TIER_LABEL[cert.tier]}
                  </span>
                </div>
                <div className="mt-4">
                  <h2 className="font-serif text-base font-bold leading-snug text-[#12314d]">{cert.course_title}</h2>
                  <p className="mt-1 text-sm text-slate-500">{cert.learner_name}</p>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-dashed border-slate-200 pt-3 text-xs">
                  <span className="font-mono font-bold text-slate-500">{cert.verification_id}</span>
                  <span className="text-slate-400">
                    {new Date(cert.issued_at).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleDownload(cert)}
                    disabled={downloadingId === cert.id}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#264D73] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#1c3c5c] disabled:opacity-60"
                  >
                    {downloadingId === cert.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    Download
                  </button>
                  <a
                    href={`/academy/verify/${cert.verification_id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-[#264D73]/20 bg-white px-4 py-2.5 text-sm font-bold text-[#264D73] transition-colors hover:bg-[#264D73]/5"
                  >
                    Verify <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
