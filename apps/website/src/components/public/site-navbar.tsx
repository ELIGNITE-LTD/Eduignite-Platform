"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, LogIn, LayoutDashboard, Download } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { NAV_LINKS, SITE } from "@/lib/public-site";
import { BrandMark } from "@/components/public/brand";
import { cn } from "@/lib/utils";

export function SiteNavbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the mobile menu whenever the route changes.
  useEffect(() => setOpen(false), [pathname]);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full transition-all",
        scrolled ? "border-b border-slate-200 bg-white/90 shadow-sm backdrop-blur" : "bg-transparent"
      )}
    >
      <nav className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5" aria-label={`${SITE.name} home`}>
          <BrandMark size={38} className="h-9 w-9" />
          <span className="text-lg font-black tracking-tight text-[#264D73]">{SITE.name}</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors",
                  active ? "text-[#264D73]" : "text-slate-600 hover:text-[#264D73]"
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <Link
            href="/download"
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#264D73]/20 px-4 py-2 text-sm font-bold text-[#264D73] transition-colors hover:bg-[#264D73]/5"
          >
            <Download className="h-4 w-4" /> Get the apps
          </Link>
          <Link
            href={isAuthenticated ? "/dashboard" : "/login"}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#264D73] px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#1c3c5c]"
          >
            {isAuthenticated ? <LayoutDashboard className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
            {isAuthenticated ? "Dashboard" : "Login"}
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-[#264D73] transition-colors hover:bg-slate-100 md:hidden"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      {/* Mobile menu */}
      {open ? (
        <div className="border-t border-slate-200 bg-white md:hidden">
          <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-4 sm:px-6">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-xl px-3 py-3 text-base font-semibold",
                  pathname === link.href ? "bg-[#264D73]/5 text-[#264D73]" : "text-slate-700"
                )}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href={isAuthenticated ? "/dashboard" : "/login"}
              className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-[#264D73] px-4 py-3 text-base font-bold text-white"
            >
              {isAuthenticated ? <LayoutDashboard className="h-5 w-5" /> : <LogIn className="h-5 w-5" />}
              {isAuthenticated ? "Go to Dashboard" : "Login"}
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}
