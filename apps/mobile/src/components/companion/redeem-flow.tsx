"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { useMutation } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { getApiErrorMessage } from "@/lib/api/errors";
import { offlineLicensingService } from "@/lib/api/services/offline-licensing.service";
import {
  checkChallengeSchoolMatch,
  isChallengeExpired,
  parseChallengeQrPayload,
} from "@/lib/offline-licensing/qr-payload";
import type {
  OfflineLicenseCertificate,
  OfflineLicensingChallenge,
  OfflineLicensingPurpose,
} from "@/lib/offline-licensing/types";
import { QrScanner } from "./qr-scanner";
import { CertificateQr } from "./certificate-qr";

type Step = "scan" | "confirm" | "success" | "error";

const REPLACEMENT_REASONS = [
  { value: "hardware_failure", label: "Hardware failure" },
  { value: "upgrade", label: "Device upgrade" },
  { value: "other", label: "Other" },
];

interface RedeemFlowProps {
  /** Which purposes this screen accepts a scanned challenge for. */
  allowedPurposes: OfflineLicensingPurpose[];
  title: string;
  description: string;
}

/**
 * Shared Scan Challenge + Response Display flow used by both the
 * activation/renewal screen and the device-replacement screen. The only
 * difference between those two screens is `allowedPurposes` (which rejects a
 * challenge scanned on the wrong screen) and the device-replacement reason
 * field shown before confirming.
 */
export function RedeemFlow({ allowedPurposes, title, description }: RedeemFlowProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("scan");
  const [challenge, setChallenge] = useState<OfflineLicensingChallenge | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [certificate, setCertificate] = useState<OfflineLicenseCertificate | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [replacementReason, setReplacementReason] = useState("");
  const [replacementNotes, setReplacementNotes] = useState("");

  const isDeviceReplacement = allowedPurposes.includes("device_replacement") && allowedPurposes.length === 1;

  const schoolMatch = useMemo(
    () => (challenge ? checkChallengeSchoolMatch(challenge, user?.schoolId ?? null) : null),
    [challenge, user?.schoolId]
  );

  const redeemMutation = useMutation({
    mutationFn: (c: OfflineLicensingChallenge) => offlineLicensingService.redeem(c),
    onSuccess: (response) => {
      setCertificate(response.certificate);
      setStep("success");
    },
    onError: (error) => {
      setSubmitError(
        getApiErrorMessage(
          error,
          "The backend rejected this challenge. It may have expired, already been used (replay), or you may not be authorized for this school."
        )
      );
      setStep("error");
    },
  });

  const handleDecode = (raw: string) => {
    setScanError(null);
    const result = parseChallengeQrPayload(raw);
    if (result.ok === false) {
      setScanError(result.error);
      return;
    }
    if (!allowedPurposes.includes(result.challenge.purpose)) {
      setScanError(
        `This QR code is a "${result.challenge.purpose}" challenge, which does not belong on this screen. ${
          isDeviceReplacement
            ? "Use Activate / Renew for this code instead."
            : "Use Device Replacement for this code instead."
        }`
      );
      return;
    }
    if (isChallengeExpired(result.challenge)) {
      setScanError("This QR code has expired. Ask the technician to regenerate it on the offline desktop app.");
      return;
    }
    setChallenge(result.challenge);
    setStep("confirm");
  };

  const resetToScan = () => {
    setStep("scan");
    setChallenge(null);
    setCertificate(null);
    setSubmitError(null);
    setScanError(null);
    setReplacementReason("");
    setReplacementNotes("");
  };

  const canConfirm = challenge && (!isDeviceReplacement || Boolean(replacementReason));

  const handleConfirm = () => {
    if (!challenge) return;
    setSubmitError(null);
    redeemMutation.mutate(challenge);
  };

  return (
    <Card className="border-none shadow-xl">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {step === "scan" && (
          <div className="space-y-4">
            <QrScanner onDecode={handleDecode} onError={setScanError} />
            {scanError ? (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{scanError}</span>
              </div>
            ) : null}
          </div>
        )}

        {step === "confirm" && challenge && schoolMatch ? (
          <div className="space-y-5">
            <div
              className={`rounded-2xl border p-5 ${
                schoolMatch.matches ? "border-primary/20 bg-primary/5" : "border-destructive/30 bg-destructive/5"
              }`}
            >
              <div className="flex items-center gap-2">
                {schoolMatch.matches ? (
                  <ShieldCheck className="h-5 w-5 text-primary" />
                ) : (
                  <ShieldAlert className="h-5 w-5 text-destructive" />
                )}
                <span className="font-black">
                  {schoolMatch.matches
                    ? `Activate license for ${user?.school?.name || "your school"}?`
                    : "School mismatch detected"}
                </span>
              </div>
              {schoolMatch.matches ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  This challenge was generated by device <span className="font-mono">{challenge.deviceId}</span> for{" "}
                  <span className="font-semibold">{user?.school?.name}</span>. Confirm to proceed with{" "}
                  {challenge.purpose.replace("_", " ")}.
                </p>
              ) : (
                <p className="mt-2 text-sm text-destructive">
                  The scanned QR code reports school ID <span className="font-mono">{schoolMatch.challengeSchoolId}</span>,
                  which does not match your authenticated school
                  {schoolMatch.technicianSchoolId ? (
                    <>
                      {" "}(<span className="font-mono">{schoolMatch.technicianSchoolId}</span>)
                    </>
                  ) : (
                    " (no school on your account)"
                  )}
                  . Do not proceed — this may be the wrong desktop, or a QR code from another institution.
                </p>
              )}
            </div>

            {isDeviceReplacement ? (
              <div className="space-y-3 rounded-2xl border bg-accent/20 p-4">
                <div className="space-y-2">
                  <Label htmlFor="replacement-reason">Reason for replacement</Label>
                  <Select value={replacementReason} onValueChange={setReplacementReason}>
                    <SelectTrigger id="replacement-reason" className="h-11">
                      <SelectValue placeholder="Select a reason" />
                    </SelectTrigger>
                    <SelectContent>
                      {REPLACEMENT_REASONS.map((reason) => (
                        <SelectItem key={reason.value} value={reason.value}>
                          {reason.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="replacement-notes">Notes (optional)</Label>
                  <Textarea
                    id="replacement-notes"
                    value={replacementNotes}
                    onChange={(e) => setReplacementNotes(e.target.value)}
                    placeholder="e.g. old laptop motherboard failed, replaced with school's spare desktop"
                    className="min-h-20"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Kept on this device as your own record of the replacement — the certificate request itself follows
                  the standard licensing contract.
                </p>
              </div>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                onClick={handleConfirm}
                disabled={!canConfirm || !schoolMatch.matches || redeemMutation.isPending}
                className="h-12 flex-1 rounded-xl font-black"
              >
                {redeemMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="mr-2 h-4 w-4" />
                )}
                Confirm &amp; Activate
              </Button>
              <Button variant="outline" onClick={resetToScan} className="h-12 rounded-xl font-black">
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {step === "success" && certificate ? (
          <div className="space-y-5 text-center">
            <div className="flex items-center justify-center gap-2 text-primary">
              <CheckCircle2 className="h-6 w-6" />
              <span className="font-black">Certificate issued</span>
            </div>
            <div className="flex justify-center">
              <CertificateQr certificate={certificate} />
            </div>
            <div className="mx-auto max-w-xs space-y-1 text-sm text-muted-foreground">
              <p>
                Plan: <Badge variant="secondary">{certificate.payload.plan.replace(/_/g, " ")}</Badge>
              </p>
              <p>Expires: {format(new Date(certificate.payload.expiresAt), "PPP")}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Hold this screen up to the offline desktop's webcam to complete installation, then tap below when done.
            </p>
            <Button onClick={resetToScan} variant="outline" className="h-12 rounded-xl font-black">
              <RefreshCw className="mr-2 h-4 w-4" />
              Done — Scan Another
            </Button>
          </div>
        ) : null}

        {step === "error" ? (
          <div className="space-y-4 text-center">
            <div className="flex items-center justify-center gap-2 text-destructive">
              <ShieldAlert className="h-6 w-6" />
              <span className="font-black">Could not issue certificate</span>
            </div>
            <p className="mx-auto max-w-sm text-sm text-muted-foreground">{submitError}</p>
            <Button onClick={resetToScan} className="h-12 rounded-xl font-black">
              <RefreshCw className="mr-2 h-4 w-4" />
              Try Again
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
