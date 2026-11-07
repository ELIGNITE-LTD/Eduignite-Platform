"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, LogIn, LayoutDashboard, Download, ChevronDown, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { NAV_GROUPS, SITE } from "@/lib/public-site";
import { BrandMark } from "@/components/public/brand";
import { cn } from "@/lib/utils";

type NavGroup = (typeof NAV_GROUPS)[number];

const isActivePath = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

const groupIsActive = (pathname: string, group: NavGroup) =>
  group.items.some((item) => isActivePath(pathname, item.href));

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#67D0E4] focus-visible:ring-offset-2";

/**
 * One desktop menu group. A disclosure button (not an ARIA "menu"): it opens on
 * hover with a short grace delay, on click/tap and on Enter/Space; it closes on
 * Escape (returning focus to the button), on an outside click and when focus
 * leaves it. Its links are ordinary links, reachable with Tab.
 */
function DesktopGroup({ group, pathname }: { group: NavGroup; pathname: string }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True while the panel is open only because the mouse hovered it, so the
  // click that usually follows a hover keeps it open instead of toggling it shut.
  const openedByHover = useRef(false);
  const active = groupIsActive(pathname, group);
  const panelId = `nav-panel-${group.label.toLowerCase()}`;

  const clearTimer = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => clearTimer, []);

  return (
    <div
      ref={wrapRef}
      className="relative"
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse") return;
        clearTimer();
        if (!open) openedByHover.current = true;
        setOpen(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "mouse") return;
        clearTimer();
        closeTimer.current = setTimeout(() => setOpen(false), 140);
      }}
      onBlur={(e) => {
        if (!wrapRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          if (open && openedByHover.current) {
            openedByHover.current = false;
            return;
          }
          openedByHover.current = false;
          setOpen((v) => !v);
        }}
        className={cn(
          "inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
          focusRing,
          active || open ? "text-[#264D73]" : "text-slate-600 hover:text-[#264D73]"
        )}
      >
        {group.label}
        <ChevronDown className={cn("h-3.5 w-3.5 opacity-60 transition-transform", open && "rotate-180")} aria-hidden />
        {active ? (
          <span aria-hidden className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-[#67D0E4]" />
        ) : null}
      </button>

      <div
        id={panelId}
        hidden={!open}
        className="absolute left-1/2 top-full z-50 w-[22rem] -translate-x-1/2 pt-3"
      >
        <ul className="rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_1px_2px_rgba(18,49,77,0.04),0_24px_48px_-20px_rgba(18,49,77,0.35)]">
          {group.items.map((item) => {
            const current = isActivePath(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={current ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "block rounded-xl px-3.5 py-2.5 transition-colors hover:bg-[#67D0E4]/12 focus-visible:bg-[#67D0E4]/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#67D0E4]",
                    current && "bg-[#264D73]/5"
                  )}
                >
                  <span className="block text-sm font-bold text-[#264D73]">{item.label}</span>
                  <span className="mt-0.5 block text-xs text-slate-600">{item.desc}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export function SiteNavbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const { isAuthenticated } = useAuth();

  const authHref = isAuthenticated ? "/dashboard" : "/login";
  const closeMenu = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the sheet on navigation.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // While the sheet is open: Escape closes it (focus returns to the toggle),
  // the page behind does not scroll, Tab stays inside it, and widening the
  // window past the mobile breakpoint closes it.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = [
        toggleRef.current,
        ...Array.from(sheetRef.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? []),
      ].filter(Boolean) as HTMLElement[];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    const mq = window.matchMedia("(min-width: 1024px)");
    const onMq = () => mq.matches && setOpen(false);
    document.addEventListener("keydown", onKey);
    mq.addEventListener("change", onMq);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      mq.removeEventListener("change", onMq);
    };
  }, [open]);

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-50 w-full transition-[background-color,box-shadow,border-color] duration-200",
          scrolled || open
            ? "border-b border-slate-200/80 bg-white/95 shadow-[0_6px_20px_-12px_rgba(18,49,77,0.35)] backdrop-blur"
            : "border-b border-transparent bg-transparent"
        )}
      >
        <nav
          aria-label="Main"
          className={cn(
            "mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 transition-[height] duration-200 sm:px-6 lg:px-8",
            scrolled ? "h-14" : "h-16"
          )}
        >
          <Link
            href="/"
            aria-label={`${SITE.name} home`}
            className={cn("flex shrink-0 items-center gap-2.5 rounded-lg", focusRing)}
          >
            {/* The mark is decorative here: the wordmark beside it names the link. */}
            <BrandMark size={38} className="h-9 w-9" alt="" />
            <span className="text-lg font-black tracking-tight text-[#264D73]">{SITE.name}</span>
          </Link>

          {/* Desktop */}
          <div className="hidden items-center gap-1 lg:flex">
            {NAV_GROUPS.map((group) => (
              <DesktopGroup key={group.label} group={group} pathname={pathname} />
            ))}
          </div>

          <div className="hidden items-center gap-2 lg:flex">
            <Link
              href="/partners"
              className={cn(
                "hidden rounded-lg px-2.5 py-2 text-sm font-semibold text-slate-600 transition-colors hover:text-[#264D73] xl:inline-flex",
                focusRing
              )}
            >
              Become a Partner
            </Link>
            <Link
              href={authHref}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-xl border border-[#264D73]/25 px-3.5 py-2 text-sm font-bold text-[#264D73] transition-colors hover:bg-[#264D73]/5",
                focusRing
              )}
            >
              {isAuthenticated ? (
                <LayoutDashboard className="h-4 w-4" aria-hidden />
              ) : (
                <LogIn className="h-4 w-4" aria-hidden />
              )}
              {isAuthenticated ? "Dashboard" : "Login"}
            </Link>
            <Link
              href="/download"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-xl bg-[#264D73] px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#173a5b]",
                focusRing
              )}
            >
              <Download className="h-4 w-4" aria-hidden /> Get the apps
            </Link>
          </div>

          {/* Mobile toggle */}
          <button
            ref={toggleRef}
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-menu"
            className={cn(
              "inline-flex h-11 w-11 items-center justify-center rounded-xl text-[#264D73] transition-colors hover:bg-slate-100 lg:hidden",
              focusRing
            )}
          >
            {open ? <X className="h-6 w-6" aria-hidden /> : <Menu className="h-6 w-6" aria-hidden />}
          </button>
        </nav>
      </header>

      {/* Mobile sheet. A sibling of the header (not a child) because the header's
          backdrop blur would otherwise become the containing block of this fixed layer. */}
      <div
        id="mobile-menu"
        ref={sheetRef}
        hidden={!open}
        className="fixed inset-0 z-40 flex flex-col bg-white pt-16 lg:hidden"
      >
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-2 sm:px-6">
          <Link
            href="/"
            onClick={closeMenu}
            aria-current={pathname === "/" ? "page" : undefined}
            className={cn(
              "flex min-h-12 items-center rounded-xl px-3 text-base font-bold",
              pathname === "/" ? "bg-[#264D73]/5 text-[#264D73]" : "text-slate-800"
            )}
          >
            Home
          </Link>
          {NAV_GROUPS.map((group) => (
            <section key={group.label} aria-labelledby={`m-${group.label}`} className="mt-4">
              <h2
                id={`m-${group.label}`}
                className="px-3 text-[11px] font-black uppercase tracking-[0.18em] text-[#0E7490]"
              >
                {group.label}
              </h2>
              <ul className="mt-1">
                {group.items.map((item) => {
                  const current = isActivePath(pathname, item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={closeMenu}
                        aria-current={current ? "page" : undefined}
                        className={cn(
                          "flex min-h-12 flex-col justify-center rounded-xl px-3 py-2 transition-colors",
                          current ? "bg-[#264D73]/5" : "active:bg-slate-100"
                        )}
                      >
                        <span className={cn("text-base font-semibold", current ? "text-[#264D73]" : "text-slate-800")}>
                          {item.label}
                        </span>
                        <span className="text-xs text-slate-600">{item.desc}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        {/* CTAs pinned to the bottom of the sheet. */}
        <div className="grid gap-2 border-t border-slate-200 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
          <Link
            href="/download"
            onClick={closeMenu}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#264D73] px-4 text-base font-bold text-white"
          >
            <Download className="h-5 w-5" aria-hidden /> Get the apps <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <Link
            href={authHref}
            onClick={closeMenu}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#264D73]/25 px-4 text-base font-bold text-[#264D73]"
          >
            {isAuthenticated ? <LayoutDashboard className="h-5 w-5" aria-hidden /> : <LogIn className="h-5 w-5" aria-hidden />}
            {isAuthenticated ? "Go to Dashboard" : "Login"}
          </Link>
        </div>
      </div>
    </>
  );
}
