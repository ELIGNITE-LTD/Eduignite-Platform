"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Loader2 } from "lucide-react";
import type { OfflineLicenseCertificate } from "@/lib/offline-licensing/types";

interface CertificateQrProps {
  certificate: OfflineLicenseCertificate;
}

/**
 * Renders the signed License Certificate returned by the backend as a QR
 * code, for the offline desktop app to scan back (wire contract step 4).
 * Ported from apps/mobile/src/components/companion/certificate-qr.tsx — the
 * certificate JSON is well under 300 bytes (per wave2-contract.md), so a
 * single-frame QR at error-correction level M is enough, no chunking.
 */
export function CertificateQr({ certificate }: CertificateQrProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const payload = JSON.stringify(certificate);

    QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 2, width: 320 })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setError("Could not render the certificate QR code.");
      });

    return () => {
      cancelled = true;
    };
  }, [certificate]);

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  return (
    <div className="flex aspect-square w-full max-w-[320px] items-center justify-center rounded-2xl border bg-white p-4 shadow-inner">
      {dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={dataUrl} alt="License certificate QR code" className="h-full w-full object-contain" />
      ) : (
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      )}
    </div>
  );
}
