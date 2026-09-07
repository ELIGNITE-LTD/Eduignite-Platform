import type { ReactNode } from "react";
import { SiteNavbar } from "@/components/public/site-navbar";
import { SiteFooter } from "@/components/public/site-footer";

/**
 * Wraps every Academy PUBLIC page in the same navbar/footer chrome as the
 * rest of the marketing site, so the catalog reads as the same product
 * rather than a bolted-on page. Academy's own auth-gateway/learner area and
 * admin CMS (built separately, under `academy/(learner)` and `academy/admin`)
 * need a different shell, which is exactly why this lives in this route's own
 * `_components` folder instead of a shared `academy/layout.tsx` that would
 * apply to every route under `/academy`, including theirs.
 */
export function AcademySiteFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-[#FBFCFE]">
      <SiteNavbar />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
