"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getApiErrorMessage } from "@/lib/api/errors";
import { getMyCertificates, type MyCertificate } from "../start/_lib/api";
import { AlertTriangle, Award, ExternalLink, GraduationCap, Loader2 } from "lucide-react";

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

  const [certificates, setCertificates] = useState<MyCertificate[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F0F2F5]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F0F2F5] p-4 sm:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-black uppercase tracking-tighter text-primary">My Certificates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every certificate you&apos;ve earned in EduIgnite Academy.
          </p>
        </div>

        {error && (
          <div className="mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 shadow-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <p className="text-sm font-bold text-red-900">{error}</p>
          </div>
        )}

        {certificates && certificates.length === 0 && (
          <Card className="rounded-[2rem] border-none shadow-xl">
            <CardContent className="flex flex-col items-center gap-4 p-12 text-center">
              <GraduationCap className="h-12 w-12 text-primary/30" />
              <p className="text-sm font-bold text-muted-foreground">
                You haven&apos;t earned a certificate yet. Complete a course to earn your first one.
              </p>
              <Button asChild className="rounded-xl bg-primary font-black uppercase tracking-widest text-white hover:bg-primary/90">
                <a href="/academy/courses">Browse Courses</a>
              </Button>
            </CardContent>
          </Card>
        )}

        {certificates && certificates.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {certificates.map((cert) => (
              <Card key={cert.id} className="rounded-[2rem] border-none shadow-xl">
                <CardContent className="space-y-4 p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                      <Award className="h-6 w-6 text-primary" />
                    </div>
                    <Badge className="bg-secondary text-primary hover:bg-secondary">{TIER_LABEL[cert.tier]}</Badge>
                  </div>
                  <div>
                    <h2 className="font-black text-slate-900">{cert.course_title}</h2>
                    <p className="text-sm text-muted-foreground">{cert.learner_name}</p>
                  </div>
                  <div className="flex items-center justify-between border-t border-dashed border-slate-200 pt-3 text-xs">
                    <span className="font-mono font-bold text-muted-foreground">{cert.verification_id}</span>
                    <span className="text-muted-foreground">
                      {new Date(cert.issued_at).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                  <Button asChild variant="outline" className="w-full rounded-xl border-primary/20 font-bold text-primary hover:bg-primary/5">
                    <a href={`/academy/verify/${cert.verification_id}`} target="_blank" rel="noreferrer">
                      Public Verification Page <ExternalLink className="ml-2 h-3.5 w-3.5" />
                    </a>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
