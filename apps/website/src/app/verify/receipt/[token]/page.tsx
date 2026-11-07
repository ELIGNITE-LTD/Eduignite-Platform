"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { BASE_URL } from "@/lib/api/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ReceiptVerification {
  valid: boolean;
  detail?: string;
  receipt_number?: string;
  amount?: number;
  currency?: string;
  payment_date?: string;
  school_name?: string;
  fee_description?: string;
}

export default function ReceiptVerificationPage() {
  const params = useParams<{ token: string }>();
  const token = decodeURIComponent(params.token || "");
  const [data, setData] = useState<ReceiptVerification | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    // Opened from a phone camera, so build-time API URLs cannot be trusted:
    // try same-origin first, then the api. subdomain, then the configured base.
    function candidateBases(): string[] {
      const bases: string[] = [];
      if (typeof window !== "undefined") {
        const { origin, hostname } = window.location;
        if (hostname !== "localhost" && hostname !== "127.0.0.1") {
          bases.push(`${origin}/api/v1`);
          const root = hostname.replace(/^www\./, "").replace(/^(admin|dashboard|app)\./, "");
          bases.push(`https://api.${root}/api/v1`);
        }
      }
      if (BASE_URL) bases.push(BASE_URL);
      return Array.from(new Set(bases));
    }

    async function verify() {
      let lastError = "You appear to be offline. Please check your connection and scan again.";
      for (const base of candidateBases()) {
        try {
          const res = await fetch(`${base}/fees/verify-receipt/${encodeURIComponent(token)}/`, { cache: "no-store" });
          if (!(res.headers.get("content-type") || "").includes("application/json")) continue;
          const payload = (await res.json()) as ReceiptVerification;
          if (!alive) return;
          if (res.ok) {
            setData(payload);
          } else {
            setError(payload.detail || "This receipt could not be verified.");
          }
          setLoading(false);
          return;
        } catch {
          /* try the next base */
        }
      }
      if (alive) {
        setError(lastError);
        setLoading(false);
      }
    }

    if (token) void verify();
    return () => {
      alive = false;
    };
  }, [token]);

  const genuine = Boolean(data?.valid);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto flex max-w-xl flex-col gap-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-white shadow-lg">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-black text-primary">EduIgnite Fee Receipt Verification</h1>
          <p className="mt-2 text-sm text-muted-foreground">Official check that a printed fee receipt is genuine.</p>
        </div>

        <Card className="border-none shadow-xl">
          <CardHeader className="border-b bg-white">
            <CardTitle className="flex items-center justify-between text-base">
              Receipt Status
              {loading ? (
                <Badge variant="outline">Checking</Badge>
              ) : genuine ? (
                <Badge className="bg-green-100 text-green-700">Genuine</Badge>
              ) : (
                <Badge variant="destructive">Not verified</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 p-6">
            {loading ? (
              <div className="flex h-44 flex-col items-center justify-center gap-3 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm font-semibold">Checking receipt...</p>
              </div>
            ) : error || !data ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <XCircle className="h-12 w-12 text-destructive" />
                <p className="font-bold text-primary">{error || "This receipt could not be verified."}</p>
                <p className="text-sm text-muted-foreground">Please contact the school if this receipt should be valid.</p>
              </div>
            ) : !genuine ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <XCircle className="h-12 w-12 text-destructive" />
                <p className="font-bold text-primary">{data.detail || "This receipt is no longer valid."}</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 rounded-2xl bg-green-50 p-4 text-green-700">
                  <CheckCircle2 className="h-6 w-6 shrink-0" />
                  <p className="text-sm font-bold">This receipt was issued by the school and is on record in EduIgnite.</p>
                </div>
                <dl className="grid gap-3 text-sm">
                  <Row label="Receipt number" value={data.receipt_number} />
                  <Row label="School" value={data.school_name} />
                  <Row label="Fee" value={data.fee_description} />
                  <Row
                    label="Amount paid"
                    value={
                      data.amount !== undefined
                        ? `${Number(data.amount).toLocaleString("en-US", { maximumFractionDigits: 0 })} ${data.currency || "XAF"}`
                        : ""
                    }
                  />
                  <Row label="Date" value={data.payment_date} />
                </dl>
                <p className="text-xs text-muted-foreground">
                  For the payer&apos;s privacy, names and contact details are never shown here. Compare the figures above
                  with the printed receipt.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-dashed pb-2">
      <dt className="font-semibold text-muted-foreground">{label}</dt>
      <dd className="text-right font-bold text-primary">{value || "-"}</dd>
    </div>
  );
}
