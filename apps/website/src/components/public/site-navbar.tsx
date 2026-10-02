"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, LogIn, LayoutDashboard, Download, ChevronDown } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { NAV_LINKS, SITE } from "@/lib/public-site";
import { BrandMark } from "@/components/public/brand";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Scrolls a section into view, retrying across a few animation frames in
 * case the target page's content hasn't painted yet right after a route
 * change (Next.js's App Router does not scroll to an in-page hash on its
 * own — by default it resets scroll to the top of the new page instead).
 */
function scrollToId(id: string, attemptsLeft = 8) {
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (attemptsLeft > 0) {
    requestAnimationFrame(() => scrollToId(id, attemptsLeft - 1));
  }
}

/**
 * Section-link click handler shared by the desktop dropdown and the mobile
 * accordion. `fullHref` is `${page}#${sectionId}`.
 *
 * - Same page (only the hash differs): Next.js's router treats this as a
 *   no-op navigation and never scrolls, so we take over entirely — prevent
 *   the default Link navigation, update the hash in history ourselves, and
 *   return the section id so the caller can scroll to it.
 * - Different page: let Link perform its normal client-side navigation
 *   (with `scroll={false}` so it doesn't reset to the top first); the
 *   `useEffect` below scrolls to the hash once the new page has mounted.
 *
 * Returns the section id to scroll to, or null if this is a normal
 * cross-page navigation the caller shouldn't scroll for itself.
 *
 * Callers must NOT call `scrollToId` synchronously inside the same handler
 * that also closes a Radix `DropdownMenu` (desktop, via `onSelect`) or
 * collapses the mobile accordion: both close paths trigger their own
 * DOM/focus cleanup on the next tick (Radix's own internal close handling
 * for desktop; a layout-shifting re-render for mobile), which races and
 * silently swallows an in-progress `scrollIntoView` — confirmed by
 * instrumenting `scrollIntoView` directly: it does get called, but the
 * page never actually moves. Both callers defer the scroll a short beat
 * past that cleanup with `setTimeout`.
 */
function resolveSamePageSectionId(
  e: React.MouseEvent<HTMLAnchorElement>,
  fullHref: string,
  pathname: string
): string | null {
  const hashIndex = fullHref.indexOf("#");
  if (hashIndex === -1) return null;
  const path = fullHref.slice(0, hashIndex) || "/";
  const id = fullHref.slice(hashIndex + 1);
  if (path !== pathname) return null;
  e.preventDefault();
  window.history.replaceState(null, "", fullHref);
  return id;
}

export function SiteNavbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  // Which nav item's mobile accordion is expanded, by href — at most one at a time.
  const [expandedMobile, setExpandedMobile] = useState<string | null>(null);
  // Which desktop dropdown is open, by href. Controlled (rather than left to
  // Radix's own internal state) so a same-page section click — which causes
  // no route change for Radix to react to — can force it closed itself.
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Escape closes the mobile menu, as it would any other menu.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setOpen(false);
    setExpandedMobile(null);
    setOpenDropdown(null);
  }, [pathname]);

  // After navigating to a different page carrying a section hash (from a
  // dropdown/accordion section link), scroll to that section once the new
  // page has mounted — see the comment on `handleSectionLinkClick` above.
  useEffect(() => {
    const hash = window.location.hash;
    if (hash) scrollToId(hash.slice(1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full transition-all",
        scrolled ? "border-b border-slate-200 bg-white/90 shadow-sm backdrop-blur" : "bg-transparent"
      )}
    >
      <nav aria-label="Main" className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5" aria-label={`${SITE.name} home`}>
          <BrandMark size={38} className="h-9 w-9" />
          <span className="text-lg font-black tracking-tight text-[#264D73]">{SITE.name}</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-1 xl:flex">
          {NAV_LINKS.map((link) => {
            const active = pathname === link.href;
            const sections = "sections" in link ? link.sections : undefined;

            if (sections && sections.length > 0) {
              return (
                <DropdownMenu
                  key={link.href}
                  open={openDropdown === link.href}
                  onOpenChange={(isOpen) => setOpenDropdown(isOpen ? link.href : null)}
                  // Non-modal: a nav menu shouldn't trap focus or lock page
                  // scroll like a dialog. Modal mode's scroll-lock
                  // (react-remove-scroll) actively cancels in-progress
                  // *smooth* scrollIntoView animations — confirmed directly:
                  // an instant jump slips through the lock, a smooth one
                  // gets fought and reverted — which broke the same-page
                  // section links below.
                  modal={false}
                >
                  <DropdownMenuTrigger
                    className={cn(
                      "inline-flex items-center gap-1 rounded-lg px-3.5 py-2 text-sm font-semibold outline-none transition-colors",
                      active ? "text-[#264D73]" : "text-slate-600 hover:text-[#264D73]",
                      "data-[state=open]:text-[#264D73]"
                    )}
                  >
                    {link.label}
                    <ChevronDown className="h-3.5 w-3.5 opacity-60 transition-transform data-[state=open]:rotate-180" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    sideOffset={10}
                    className="w-72 rounded-2xl border-slate-200 p-1.5 shadow-[0_1px_2px_rgba(18,49,77,0.04),0_24px_48px_-20px_rgba(18,49,77,0.35)]"
                  >
                    <DropdownMenuItem
                      asChild
                      className="cursor-pointer rounded-xl px-3 py-2.5 text-sm font-bold text-[#264D73] focus:bg-[#264D73]/8 focus:text-[#264D73]"
                    >
                      <Link href={link.href}>Go to {link.label} overview</Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="my-1.5 bg-slate-100" />
                    {sections.map((section) => {
                      const sectionHref = `${link.href}#${section.id}`;
                      const samePage = pathname === link.href;
                      return (
                        <DropdownMenuItem
                          key={section.id}
                          asChild
                          className="cursor-pointer rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 focus:bg-[#67D0E4]/12 focus:text-[#264D73]"
                          onSelect={() => {
                            if (!samePage) return;
                            window.history.replaceState(null, "", sectionHref);
                            // Deferred past Radix's own close handling — see
                            // `scrollToId`'s doc comment above.
                            setTimeout(() => scrollToId(section.id), 120);
                          }}
                        >
                          <Link
                            href={sectionHref}
                            scroll={false}
                            onClick={(e) => {
                              // Same page: `onSelect` above already updated
                              // the hash and scheduled the scroll — stop
                              // Link from also doing its own (scroll-less)
                              // same-page navigation on top of it.
                              // Cross-page: let Link navigate normally.
                              if (samePage) e.preventDefault();
                            }}
                          >
                            {section.label}
                          </Link>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            }

            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
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

        <div className="hidden items-center gap-2 xl:flex">
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
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-[#264D73] transition-colors hover:bg-slate-100 xl:hidden"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      {/* Mobile menu */}
      {open ? (
        <div className="border-t border-slate-200 bg-white xl:hidden">
          <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-4 sm:px-6">
            {NAV_LINKS.map((link) => {
              const active = pathname === link.href;
              const sections = "sections" in link ? link.sections : undefined;

              if (sections && sections.length > 0) {
                const expanded = expandedMobile === link.href;
                return (
                  <div key={link.href}>
                    <div className="flex items-center gap-1">
                      <Link
                        href={link.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex-1 rounded-xl px-3 py-3 text-base font-semibold",
                          active ? "bg-[#264D73]/5 text-[#264D73]" : "text-slate-700"
                        )}
                      >
                        {link.label}
                      </Link>
                      <button
                        type="button"
                        onClick={() => setExpandedMobile(expanded ? null : link.href)}
                        aria-expanded={expanded}
                        aria-label={`${expanded ? "Collapse" : "Expand"} ${link.label} sections`}
                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-[#264D73]"
                      >
                        <ChevronDown className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
                      </button>
                    </div>
                    {expanded && (
                      <div className="ml-3 mt-0.5 flex flex-col gap-0.5 border-l-2 border-[#67D0E4]/30 py-1 pl-3">
                        {sections.map((section) => {
                          const sectionHref = `${link.href}#${section.id}`;
                          return (
                            <Link
                              key={section.id}
                              href={sectionHref}
                              scroll={false}
                              onClick={(e) => {
                                const id = resolveSamePageSectionId(e, sectionHref, pathname);
                                setOpen(false);
                                setExpandedMobile(null);
                                if (id) {
                                  // Deferred past the mobile panel's own
                                  // collapse re-render — see `scrollToId`'s
                                  // doc comment above.
                                  setTimeout(() => scrollToId(id), 120);
                                }
                              }}
                              className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-[#67D0E4]/10 hover:text-[#264D73]"
                            >
                              {section.label}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-xl px-3 py-3 text-base font-semibold",
                    active ? "bg-[#264D73]/5 text-[#264D73]" : "text-slate-700"
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
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
