"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

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

type Step = "scan" | "confirm" | "submitting" | "success" | "error";

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

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

/**
 * Shared Scan Challenge -> Confirm -> Response Display flow, used by both
 * the activate/renew screen and the device-replacement screen. Ported from
 * apps/mobile/src/components/companion/redeem-flow.tsx, rewritten against
 * plain Tailwind markup (no shadcn/react-query/date-fns in this app's
 * dependency tree) but identical in behavior.
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

  const canConfirm = Boolean(challenge) && (!isDeviceReplacement || Boolean(replacementReason));

  const handleConfirm = async () => {
    if (!challenge) return;
    setSubmitError(null);
    setStep("submitting");
    try {
      const response = await offlineLicensingService.redeem(challenge);
      setCertificate(response.certificate);
      setStep("success");
    } catch (error) {
      setSubmitError(
        getApiErrorMessage(
          error,
          "The backend rejected this challenge. It may have expired, already been used (replay), or you may not be authorized for this school."
        )
      );
      setStep("error");
    }
  };

  return (
    <div className="rounded-2xl bg-white p-6 shadow-xl">
      <h2 className="text-lg font-black text-primary">{title}</h2>
      <p className="mt-1 text-sm text-gray-500">{description}</p>

      <div className="mt-6 space-y-6">
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

        {(step === "confirm" || step === "submitting") && challenge && schoolMatch ? (
          <div className="space-y-5">
            <div
              className={cnBox(schoolMatch.matches)}
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
                <p className="mt-2 text-sm text-gray-600">
                  This challenge was generated by device{" "}
                  <span className="font-mono">{challenge.deviceId}</span> for{" "}
                  <span className="font-semibold">{user?.school?.name}</span>. Confirm to proceed with{" "}
                  {challenge.purpose.replace("_", " ")}.
                </p>
              ) : (
                <p className="mt-2 text-sm text-destructive">
                  The scanned QR code reports school ID{" "}
                  <span className="font-mono">{schoolMatch.challengeSchoolId}</span>, which does not match your
                  authenticated school
                  {schoolMatch.technicianSchoolId ? (
                    <>
                      {" "}
                      (<span className="font-mono">{schoolMatch.technicianSchoolId}</span>)
                    </>
                  ) : (
                    " (no school on your account)"
                  )}
                  . Do not proceed — this may be the wrong desktop, or a QR code from another institution.
                </p>
              )}
            </div>

            {isDeviceReplacement ? (
              <div className="space-y-3 rounded-2xl border bg-accent/10 p-4">
                <div className="space-y-2">
                  <label htmlFor="replacement-reason" className="text-xs font-bold text-gray-600">
                    Reason for replacement
                  </label>
                  <select
                    id="replacement-reason"
                    value={replacementReason}
                    onChange={(e) => setReplacementReason(e.target.value)}
                    className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm"
                  >
                    <option value="">Select a reason</option>
                    {REPLACEMENT_REASONS.map((reason) => (
                      <option key={reason.value} value={reason.value}>
                        {reason.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label htmlFor="replacement-notes" className="text-xs font-bold text-gray-600">
                    Notes (optional)
                  </label>
                  <textarea
                    id="replacement-notes"
                    value={replacementNotes}
                    onChange={(e) => setReplacementNotes(e.target.value)}
                    placeholder="e.g. old laptop motherboard failed, replaced with school's spare desktop"
                    className="min-h-20 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                  />
                </div>
                <p className="text-xs text-gray-500">
                  Kept on this device as your own record of the replacement — the certificate request itself follows
                  the standard licensing contract.
                </p>
              </div>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!canConfirm || !schoolMatch.matches || step === "submitting"}
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary font-black text-white shadow-md transition hover:bg-primary-dark disabled:opacity-50"
              >
                {step === "submitting" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                Confirm &amp; Activate
              </button>
              <button
                type="button"
                onClick={resetToScan}
                disabled={step === "submitting"}
                className="flex h-12 items-center justify-center rounded-xl border border-gray-300 px-6 font-black text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
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
            <div className="mx-auto max-w-xs space-y-1 text-sm text-gray-600">
              <p>
                Plan:{" "}
                <span className="rounded-full bg-accent/30 px-2 py-0.5 font-semibold text-primary-dark">
                  {certificate.payload.plan.replace(/_/g, " ")}
                </span>
              </p>
              <p>Expires: {formatDate(certificate.payload.expiresAt)}</p>
            </div>
            <p className="text-xs text-gray-500">
              Hold this screen up to the offline desktop's webcam to complete installation, then tap below when done.
            </p>
            <button
              type="button"
              onClick={resetToScan}
              className="mx-auto flex h-12 items-center justify-center gap-2 rounded-xl border border-gray-300 px-6 font-black text-gray-700 transition hover:bg-gray-50"
            >
              <RefreshCw className="h-4 w-4" />
              Done — Scan Another
            </button>
          </div>
        ) : null}

        {step === "error" ? (
          <div className="space-y-4 text-center">
            <div className="flex items-center justify-center gap-2 text-destructive">
              <ShieldAlert className="h-6 w-6" />
              <span className="font-black">Could not issue certificate</span>
            </div>
            <p className="mx-auto max-w-sm text-sm text-gray-600">{submitError}</p>
            <button
              type="button"
              onClick={resetToScan}
              className="mx-auto flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 font-black text-white shadow-md transition hover:bg-primary-dark"
            >
              <RefreshCw className="h-4 w-4" />
              Try Again
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function cnBox(matches: boolean): string {
  return matches
    ? "rounded-2xl border border-primary/20 bg-primary/5 p-5"
    : "rounded-2xl border border-destructive/30 bg-destructive/5 p-5";
}
