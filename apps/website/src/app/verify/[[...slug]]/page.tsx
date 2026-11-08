import { VerificationResult } from "@/components/public/verification-result";

/**
 * Friendly landing for any /verify/... address no specific page serves (a
 * damaged or hand-typed code, an unknown document kind) instead of a bare 404.
 */
export default function UnknownVerificationLink() {
  return (
    <VerificationResult
      documentType="Document verification"
      loading={false}
      state="not_valid"
      detail="This verification link is not recognised. It may be damaged or incomplete."
    />
  );
}
