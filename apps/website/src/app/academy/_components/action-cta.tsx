"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { buildAuthGatewayUrl, createDeepLink } from "@/app/academy/_lib/public-api";

type Variant = "primary" | "outline" | "ghost-light";

const VARIANT_CLASS: Record<Variant, string> = {
  primary:
    "bg-[#264D73] text-white hover:bg-[#1c3c5c]",
  outline:
    "border border-[#264D73]/20 bg-white text-[#264D73] hover:bg-[#264D73]/5",
  "ghost-light":
    "border border-white/25 text-white hover:bg-white/10",
};

/**
 * Any action-based CTA ([Enroll], [Start Course], [Continue Learning], [View
 * Certificates]...) that could route an UNAUTHENTICATED visitor toward the
 * learner area. Implements the spec's Deep Link Redirection Rule:
 *
 * - Already signed in: the destination is just navigated to directly — the
 *   auth gateway has nothing to do here, the visitor already has access.
 * - Not signed in: `POST /academy/deep-link/` first to cache `returnPath`,
 *   then route to the auth gateway (`/academy/start`) with the returned
 *   `?state=`, so the gateway can send them straight back after Path A/B
 *   authentication instead of dropping them on a generic dashboard.
 *
 * Never dead-ends: if the deep-link call itself fails, it still routes to the
 * gateway with a plain `?returnPath=` so the CTA always does *something*.
 */
export function ActionCta({
  href,
  label,
  icon,
  variant = "primary",
  className,
}: {
  /** Where this action should ultimately land the visitor, e.g.
   * `/academy/courses/eduignite-for-teachers` or `/academy/certificates`. */
  href: string;
  label: string;
  /**
   * An already-rendered icon element, e.g. `<GraduationCap className="h-4 w-4" />`
   * -- NOT a component reference. This component is "use client", and its
   * callers are Server Components (`academy/page.tsx`,
   * `academy/courses/[slug]/page.tsx`); passing a raw component/function
   * reference across that boundary is not serializable ("Functions cannot
   * be passed directly to Client Components") and breaks static export.
   * A rendered element is a plain React-element description, which is.
   */
  icon?: ReactNode;
  variant?: Variant;
  className?: string;
}) {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    if (isAuthenticated) {
      router.push(href);
      return;
    }
    setPending(true);
    try {
      const cache = await createDeepLink(href);
      router.push(buildAuthGatewayUrl({ state: cache?.state ?? null, returnPath: href }));
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-bold transition-colors disabled:cursor-wait disabled:opacity-70",
        VARIANT_CLASS[variant],
        className
      )}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : icon ?? null}
      {label}
    </button>
  );
}
