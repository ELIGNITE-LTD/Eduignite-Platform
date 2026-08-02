"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { API } from "@/lib/api/endpoints";
import { BASE_URL } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface StudentVerification {
  valid: boolean;
  admission_number: string;
  matricule?: string;
  student_name: string;
  school_name: string;
  school_matricule?: string;
  class_name: string;
  section?: string;
  academic_year?: string;
  status: string;
}

export default function StudentCardVerificationPage() {
  const params = useParams<{ admissionNumber: string }>();
  const admissionNumber = params.admissionNumber;
  const [data, setData] = useState<StudentVerification | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    // This public QR page is opened on the phone's browser, where a build-time
    // API URL is often missing (defaulting to localhost) — which made every
    // card read "Not verified". Try a list of candidate API bases so it works
    // regardless of how the API is exposed: same-origin /api/v1 first (no CORS),
    // then the api. subdomain, then the configured base.
    function candidateBases(): string[] {
      const bases: string[] = [];
      if (typeof window !== "undefined") {
        const { origin, hostname } = window.location;
        const isLocal = hostname === "localhost" || hostname === "127.0.0.1";
        if (!isLocal) {
          bases.push(`${origin}/api/v1`);
          const root = hostname.replace(/^www\./, "").replace(/^(admin|dashboard|app)\./, "");
          bases.push(`https://api.${root}/api/v1`);
        }
      }
      if (BASE_URL) bases.push(BASE_URL);
      return Array.from(new Set(bases));
    }

    async function verifyCard() {
      const bases = candidateBases();
      let lastError = "You appear to be offline. Please check your connection and scan again.";
      let sawApiNotFound = false;
      for (const base of bases) {
        try {
          const response = await fetch(`${base}${API.STUDENTS.VERIFY_CARD(admissionNumber)}`, {
            cache: "no-store",
          });
          const isJson = (response.headers.get("content-type") || "").includes("application/json");
          if (response.ok && isJson) {
            const payload = (await response.json()) as StudentVerification;
            if (isMounted) {
              setData(payload);
              setLoading(false);
            }
            return;
          }
          // A JSON 404 is the real API saying the card is unknown. A non-JSON
          // 404 just means this origin isn't the API (e.g. the web app) — keep
          // trying the other candidate bases.
          if (response.status === 404 && isJson) {
            sawApiNotFound = true;
            lastError = "No valid student card was found for this admission number.";
          }
        } catch {
          // Network/CORS error for this base — try the next candidate.
        }
      }
      if (isMounted) {
        setError(sawApiNotFound ? "No valid student card was found for this admission number." : lastError);
        setLoading(false);
      }
    }

    if (admissionNumber) void verifyCard();
    return () => {
      isMounted = false;
    };
  }, [admissionNumber]);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto flex max-w-xl flex-col gap-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-white shadow-lg">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-black text-primary">EduIgnite Student Card Verification</h1>
          <p className="mt-2 text-sm text-muted-foreground">Official QR verification for Cameroon secondary school ID cards.</p>
        </div>

        <Card className="border-none shadow-xl">
          <CardHeader className="border-b bg-white">
            <CardTitle className="flex items-center justify-between text-base">
              Card Status
              {loading ? (
                <Badge variant="outline">Checking</Badge>
              ) : data?.valid ? (
                <Badge className="bg-green-100 text-green-700">Verified</Badge>
              ) : (
                <Badge variant="destructive">Not verified</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 p-6">
            {loading ? (
              <div className="flex h-44 flex-col items-center justify-center gap-3 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm font-semibold">Checking student card...</p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <XCircle className="h-12 w-12 text-destructive" />
                <p className="font-bold text-primary">{error}</p>
                <p className="text-sm text-muted-foreground">Please contact the school administration if this card should be valid.</p>
              </div>
            ) : data ? (
              <>
                <div className="flex items-center gap-3 rounded-2xl bg-green-50 p-4 text-green-700">
                  <CheckCircle2 className="h-6 w-6 shrink-0" />
                  <p className="text-sm font-bold">This student card is registered in EduIgnite.</p>
                </div>
                <div className="grid gap-3 text-sm">
                  <InfoRow label="Student" value={data.student_name} />
                  <InfoRow label="Admission No." value={data.admission_number} />
                  <InfoRow label="Matricule" value={data.matricule || "-"} />
                  <InfoRow label="Class" value={data.class_name} />
                  <InfoRow label="Section" value={data.section || "-"} />
                  <InfoRow label="School" value={data.school_name} />
                  <InfoRow label="School Matricule" value={data.school_matricule || "-"} />
                  <InfoRow label="Academic Year" value={data.academic_year || "Current"} />
                  <InfoRow label="Account Status" value={data.status} />
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>

        <Button asChild variant="outline" className="h-11 rounded-xl">
          <Link href="/">Go to EduIgnite</Link>
        </Button>
      </div>
    </main>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-2">
      <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">{label}</span>
      <span className="text-right font-bold text-primary">{value}</span>
    </div>
  );
}
