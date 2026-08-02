"use client";

import { useEffect } from "react";
import { LifeBuoy, RefreshCw } from "lucide-react";

import { EduIgniteErrorPage } from "@/app/error-pages";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <EduIgniteErrorPage
      code="500"
      title="Something went wrong on our end."
      description="Please retry the action. If it keeps happening, report it to the EduIgnite support team."
      actions={[
        { label: "Retry", onClick: reset, icon: "retry" },
        { label: "Report Issue", href: "/dashboard/support", variant: "outline", icon: "support" },
      ]}
    >
      {process.env.NODE_ENV === "development" && error.message ? (
        <details className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-left">
          <summary className="cursor-pointer text-sm font-bold text-destructive">
            Developer error details
          </summary>
          <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-destructive">
            {error.message}
            {error.digest ? `\nDigest: ${error.digest}` : ""}
          </pre>
        </details>
      ) : null}
      <div className="sr-only">
        <RefreshCw />
        <LifeBuoy />
      </div>
    </EduIgniteErrorPage>
  );
}
