import type { ReactNode } from "react";
import { SiteNavbar } from "@/components/public/site-navbar";
import { SiteFooter } from "@/components/public/site-footer";
import { IntroSplash } from "@/components/public/intro-splash";
import { ReferralCapture } from "@/components/public/referral-capture";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-[#FBFCFE]">
      <ReferralCapture />
      {/* First stop for keyboard and screen-reader users: past the navigation. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-xl focus:bg-[#12314d] focus:px-5 focus:py-3 focus:text-sm focus:font-bold focus:text-white"
      >
        Skip to main content
      </a>
      <IntroSplash />
      <SiteNavbar />
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
