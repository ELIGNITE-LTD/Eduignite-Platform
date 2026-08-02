"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, Download, ExternalLink, Loader2, QrCode, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { getApiErrorMessage } from "@/lib/api/errors";
import { ordersService } from "@/lib/api/services/orders.service";
import { resolvePlatformLogoUrl } from "@/lib/platform-brand";

const FOUNDER_ROLES = ["SUPER_ADMIN", "CEO", "CTO"];

function campaignUrlFromOrigin(origin: string) {
  return `${origin}/school-account-request?source=founder-flyer`;
}

export default function FounderFlyerQrPage() {
  const { user, platformSettings } = useAuth();
  const { toast } = useToast();
  const [targetUrl, setTargetUrl] = useState("");
  const role = (user?.role || "").toUpperCase();
  const canGenerate = FOUNDER_ROLES.includes(role);
  const platformLogo = resolvePlatformLogoUrl(platformSettings.logo);

  useEffect(() => {
    if (!targetUrl && typeof window !== "undefined") {
      setTargetUrl(campaignUrlFromOrigin(window.location.origin));
    }
  }, [targetUrl]);

  const qrQuery = useQuery({
    queryKey: ["founder-flyer-qr", targetUrl],
    queryFn: () => ordersService.getFlyerQr(targetUrl),
    enabled: canGenerate && /^https?:\/\//.test(targetUrl),
    retry: 1,
  });

  const scanUrl = qrQuery.data?.url || targetUrl;
  const qrImage = qrQuery.data?.qr_data_url;
  const shortUrl = useMemo(() => scanUrl.replace(/^https?:\/\//, ""), [scanUrl]);

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(scanUrl);
      toast({ title: "Link copied", description: "The flyer scan link is ready to paste." });
    } catch {
      toast({ variant: "destructive", title: "Copy failed", description: "Your browser could not copy the link." });
    }
  };

  const downloadQr = () => {
    if (!qrImage) return;
    const link = document.createElement("a");
    link.href = qrImage;
    link.download = "eduignite-school-account-request-qr.png";
    link.click();
  };

  if (!canGenerate) {
    return (
      <div className="rounded-2xl border bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-black text-primary">Flyer QR</h1>
        <p className="mt-2 text-sm text-muted-foreground">Only founders can generate public school-account request QR codes.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <Badge className="mb-3 border-none bg-secondary/20 text-primary">Founder outreach</Badge>
          <h1 className="flex items-center gap-3 text-3xl font-black text-primary">
            <span className="rounded-xl bg-primary p-2 text-white shadow-lg">
              <QrCode className="h-6 w-6 text-secondary" />
            </span>
            Flyer QR Generator
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Generate a scannable QR code for printed flyers. The QR opens a public EduIgnite page where school leaders can understand the platform and request their school account.
          </p>
        </div>
        <Button asChild variant="outline" className="h-11 rounded-xl font-bold">
          <a href={scanUrl || "/school-account-request"} target="_blank" rel="noreferrer">
            <ExternalLink className="mr-2 h-4 w-4" />
            Open Scan Page
          </a>
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)]">
        <Card className="border-none shadow-xl">
          <CardHeader>
            <CardTitle>QR Settings</CardTitle>
            <CardDescription>Use the default campaign link or paste a tracked URL before downloading the QR.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="qr-url">Scan destination</Label>
              <Input
                id="qr-url"
                value={targetUrl}
                onChange={(event) => setTargetUrl(event.target.value)}
                placeholder="https://eduignite.online/school-account-request?source=founder-flyer"
                className="h-12"
              />
            </div>

            <div className="rounded-2xl border bg-accent/30 p-4">
              <div className="flex items-center gap-2 text-sm font-black text-primary">
                <ShieldCheck className="h-4 w-4" />
                What happens after scan
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                The school owner or principal reads the EduIgnite overview, fills the school-account request form, and the request enters the existing Support & Orders queue for founders to contact and process.
              </p>
            </div>

            {qrQuery.isError ? (
              <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
                {getApiErrorMessage(qrQuery.error, "Unable to generate the QR code right now.")}
              </div>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button onClick={() => qrQuery.refetch()} disabled={qrQuery.isFetching || !targetUrl} className="h-12 rounded-xl font-black">
                {qrQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <QrCode className="mr-2 h-4 w-4" />}
                Generate QR
              </Button>
              <Button type="button" variant="outline" onClick={copyUrl} disabled={!scanUrl} className="h-12 rounded-xl font-black">
                <Copy className="mr-2 h-4 w-4" />
                Copy Link
              </Button>
              <Button type="button" variant="outline" onClick={downloadQr} disabled={!qrImage} className="h-12 rounded-xl font-black">
                <Download className="mr-2 h-4 w-4" />
                Download PNG
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-none shadow-xl">
          <CardHeader className="bg-primary text-white">
            <CardTitle className="flex items-center gap-3">
              <img src={platformLogo} alt={`${platformSettings.name} logo`} className="h-10 w-10 rounded-lg bg-white object-contain p-1" />
              Flyer Preview
            </CardTitle>
            <CardDescription className="text-white/75">Place this QR beside your printed flyer call-to-action.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 p-6 md:grid-cols-[220px_1fr]">
            <div className="flex aspect-square items-center justify-center rounded-2xl border bg-white p-4 shadow-inner">
              {qrQuery.isFetching ? (
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
              ) : qrImage ? (
                <img src={qrImage} alt="EduIgnite school account request QR" className="h-full w-full object-contain" />
              ) : (
                <QrCode className="h-20 w-20 text-primary/20" />
              )}
            </div>
            <div className="flex flex-col justify-center">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-secondary">Scan to onboard your school</p>
              <h2 className="mt-2 text-3xl font-black leading-tight text-primary">Request your EduIgnite school account</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                A secure digital school platform for Cameroon secondary schools: administration, fees, attendance, examinations, report cards, parents, students, staff, and executive support in one system.
              </p>
              <div className="mt-5 rounded-xl border bg-accent/40 p-3 text-xs font-bold text-primary break-all">{shortUrl}</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
