"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { ReportCardDetails } from "@/components/public/report-card-details";
import { VerificationResult } from "@/components/public/verification-result";
import {
  fetchVerification,
  parseReportCardSegments,
  verifyQuery,
  type VerifyOutcome,
} from "@/lib/public-verify";

/**
 * Public page behind the QR on a report card:
 *   /verify/report-card/<admission>/<2025-2026>/<seq-ID | term-N>?school=<matricule>&t=<token>
 * With the signed token (printed in the QR) the full card is shown; without it
 * (older printed cards, hand-typed addresses) only the header facts are.
 * A catch-all on purpose: report cards printed in the past carried the year as
 * "2025/2026" (one more path segment) and must keep resolving.
 */
export default function ReportCardVerificationPage() {
  const params = useParams<{ parts: string[] }>();
  const parsed = parseReportCardSegments(params.parts);
  const cacheKey = parsed ? `${parsed.admission}|${parsed.year}|${parsed.key}` : "";
  const [outcome, setOutcome] = useState<VerifyOutcome | null>(null);

  useEffect(() => {
    if (!parsed) return;
    let alive = true;
    const path = `/grades/grades/verify-report-card/${encodeURIComponent(parsed.admission)}/${encodeURIComponent(
      parsed.year,
    )}/${encodeURIComponent(parsed.key)}/${verifyQuery()}`;
    void fetchVerification(path).then((result) => alive && setOutcome(result));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  const result: VerifyOutcome | null = parsed
    ? outcome
    : { state: "not_valid", detail: "This report card link is not recognised.", data: {} };
  const d = result?.data || {};

  if (result?.state === "valid" && d.detail_level === "full" && d.details) {
    return <ReportCardDetails details={d.details} integrity={d.integrity || {}} />;
  }

  return (
    <VerificationResult
      documentType="Report card"
      loading={!result}
      state={result?.state}
      detail={result?.state === "valid" ? "This report card is genuine." : result?.detail}
      note={
        result?.state === "valid" && d.detail_level === "header"
          ? "To see the marks and ranking, scan the QR code printed on the report card itself. / Pour voir les notes et le rang, scannez le QR code imprimé sur le bulletin."
          : undefined
      }
      rows={[
        { label: "Student", value: d.student_name },
        { label: "School", value: d.school_name },
        { label: "Class", value: d.class_name },
        { label: "Period", value: d.period },
        { label: "Academic year", value: d.academic_year },
        { label: "Matricule", value: d.matricule },
      ]}
    />
  );
}
