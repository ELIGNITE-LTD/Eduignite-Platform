import type { ReactNode } from "react";

/**
 * Route group for each school's own public website. It deliberately sits
 * OUTSIDE app/(public): none of the EduIgnite marketing chrome (navbar, footer,
 * intro splash, referral capture, maintenance banner) renders here. The
 * school-branded frame is <SchoolSite>, rendered by each page because the
 * language and preview token come from the page's query string.
 */
export default function SchoolSiteLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
