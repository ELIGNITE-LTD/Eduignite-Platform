"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { VerificationResult } from "@/components/public/verification-result";
import { fetchVerification, type VerifyOutcome } from "@/lib/public-verify";

/** Public page behind the QR on a fee receipt: /verify/receipt/<signed token>. Never shows the payer. */
export default function ReceiptVerificationPage() {
  const params = useParams<{ token: string }>();
  const token = decodeURIComponent(String(params.token || ""));
  const [outcome, setOutcome] = useState<VerifyOutcome | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchVerification(`/fees/verify-receipt/${encodeURIComponent(token)}/`).then(
      (result) => alive && setOutcome(result),
    );
    return () => {
      alive = false;
    };
  }, [token]);

  const d = outcome?.data || {};
  const amount =
    typeof d.amount === "number" ? `${d.amount.toLocaleString("en-US")} ${d.currency || "XAF"}` : undefined;
  return (
    <VerificationResult
      documentType="Fee receipt"
      loading={!outcome}
      state={outcome?.state}
      detail={outcome?.state === "valid" ? "This receipt was issued by the school." : outcome?.detail}
      rows={[
        { label: "School", value: d.school_name },
        { label: "Receipt number", value: d.receipt_number },
        { label: "Amount", value: amount },
        { label: "Date", value: d.payment_date },
        { label: "For", value: d.fee_description },
      ]}
    />
  );
}
