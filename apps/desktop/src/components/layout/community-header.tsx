"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, LogIn, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { resolvePlatformLogoUrl } from "@/lib/platform-brand";
import { cn } from "@/lib/utils";
import { LanguageSwitcher } from "./language-switcher";

interface CommunityNavLink {
  href: string;
  homeHref?: string;
  labelKey: string;
  exact?: boolean;
}

const communityNavLinks: CommunityNavLink[] = [
  { href: "/community", labelKey: "communityHome", exact: true },
  { href: "/community/logs", homeHref: "#logs", labelKey: "strategicLogs" },
  { href: "/community/highlights", homeHref: "#events", labelKey: "highlights" },
  { href: "/community/testimonials", labelKey: "testimonials" },
  { href: "/community/app-store", labelKey: "appStore" },
  { href: "mailto:eduignitecmr@gmail.com", labelKey: "contact" },
];

const isExternalHref = (href: string) => href.startsWith("http") || href.startsWith("mailto:");

export function CommunityHeader() {
  const pathname = usePathname();
  const { platformSettings } = useAuth();
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const platformLogo = resolvePlatformLogoUrl(platformSettings.logo);

  const getHref = (link: CommunityNavLink) => (pathname === "/community" && link.homeHref ? link.homeHref : link.href);
  const isActive = (link: CommunityNavLink) => {
    if (isExternalHref(link.href)) return false;
    if (link.exact) return pathname === link.href;
    return pathname?.startsWith(link.href);
  };

  const renderLink = (link: CommunityNavLink, mobile = false) => {
    const href = getHref(link);
    const active = isActive(link);
    const className = mobile
      ? cn(
          "flex items-center justify-between rounded-xl px-4 py-3 text-sm font-black uppercase tracking-widest transition-colors",
          active ? "bg-primary text-white" : "text-primary hover:bg-primary/5"
        )
      : cn(
          "rounded-full px-3 py-2 text-xs font-black uppercase tracking-widest transition-colors",
          active ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:bg-primary/5 hover:text-primary"
        );

    const content = (
      <>
        <span>{t(link.labelKey)}</span>
        {mobile && <ArrowRight className="h-4 w-4 opacity-50" />}
      </>
    );

    if (href.startsWith("#") || isExternalHref(href)) {
      return (
        <a key={`${link.href}-${mobile ? "mobile" : "desktop"}`} href={href} className={className} onClick={() => setIsOpen(false)}>
          {content}
        </a>
      );
    }

    return (
      <Link key={`${link.href}-${mobile ? "mobile" : "desktop"}`} href={href} className={className} onClick={() => setIsOpen(false)}>
        {content}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-primary/5 bg-white/90 shadow-sm shadow-primary/5 backdrop-blur-xl">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 xl:flex-nowrap">
        <Link href="/community" className="group flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary p-2 shadow-lg transition-transform group-hover:rotate-3">
            <img src={platformLogo} alt={`${platformSettings.name} logo`} className="h-full w-full object-contain" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-headline text-lg font-black tracking-tighter text-primary sm:text-xl">
              {platformSettings.name}
            </p>
            <p className="hidden text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground sm:block">
              {t("communityPortal")}
            </p>
          </div>
        </Link>

        <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 xl:flex" aria-label="Community navigation">
          {communityNavLinks.map((link) => renderLink(link))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <LanguageSwitcher />
          <Button asChild className="hidden h-10 rounded-xl px-5 text-xs font-black uppercase tracking-widest text-white sm:inline-flex">
            <Link href="/login">
              <LogIn className="mr-2 h-4 w-4" />
              {t("portalLogin")}
            </Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-xl text-primary hover:bg-primary/5 xl:hidden"
            aria-label="Toggle community navigation"
            aria-expanded={isOpen}
            onClick={() => setIsOpen((open) => !open)}
          >
            {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {isOpen && (
        <div className="border-t border-primary/5 bg-white px-4 py-4 shadow-xl xl:hidden">
          <nav className="mx-auto grid max-w-7xl gap-2" aria-label="Mobile community navigation">
            {communityNavLinks.map((link) => renderLink(link, true))}
            <Button asChild className="mt-2 h-12 rounded-xl text-xs font-black uppercase tracking-widest text-white">
              <Link href="/login" onClick={() => setIsOpen(false)}>
                <LogIn className="mr-2 h-4 w-4" />
                {t("portalLogin")}
              </Link>
            </Button>
          </nav>
        </div>
      )}
    </header>
  );
}
