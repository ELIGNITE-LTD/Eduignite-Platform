import type { Metadata } from "next";
import type { ReactNode } from "react";

// Verification pages are private to whoever holds the document: never indexed.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function VerifyLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
