"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { VerificationResult } from "@/components/public/verification-result";
import { fetchVerification, schoolQuery, type VerifyOutcome } from "@/lib/public-verify";

/** Public page behind the QR on a student ID card: /verify/student/<admission>?school=<matricule> */
export default function StudentCardVerificationPage() {
  const params = useParams<{ admissionNumber: string }>();
  const admission = decodeURIComponent(String(params.admissionNumber || ""));
  const [outcome, setOutcome] = useState<VerifyOutcome | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchVerification(
      `/students/students/verify/${encodeURIComponent(admission)}/${schoolQuery()}`,
    ).then((result) => alive && setOutcome(result));
    return () => {
      alive = false;
    };
  }, [admission]);

  const d = outcome?.data || {};
  return (
    <VerificationResult
      documentType="Student ID card"
      loading={!outcome}
      state={outcome?.state}
      detail={outcome?.state === "valid" ? "This student ID card is registered." : outcome?.detail}
      rows={[
        { label: "Student", value: d.student_name },
        { label: "School", value: d.school_name },
        { label: "Matricule", value: d.matricule },
        { label: "Admission No.", value: d.admission_number },
        { label: "Class", value: d.class_name },
        { label: "Academic year", value: d.academic_year },
      ]}
    />
  );
}
