"use client";

/**
 * Horizontally scrollable rail of the apps.
 *
 * Built on native scroll with CSS snap rather than a carousel library, so it
 * keeps touch momentum, trackpad swipes, keyboard focus and screen-reader
 * order for free. The arrow buttons are an addition for mouse users, not the
 * only way through — they hide when there is nothing to scroll to.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, Globe, Monitor, Smartphone, Laptop, QrCode, Sparkles } from "lucide-react";
import type { PublicApp } from "@/lib/public-site";

const APP_ICONS: Record<string, any> = { mobile: Smartphone, desktop: Monitor, web: Globe, offline: Laptop, companion: QrCode };

export function AppCarousel({ apps }: { apps: PublicApp[] }) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const sync = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const max = rail.scrollWidth - rail.clientWidth;
    setAtStart(rail.scrollLeft <= 8);
    setAtEnd(rail.scrollLeft >= max - 8);
  }, []);

  useEffect(() => {
    sync();
    const rail = railRef.current;
    if (!rail) return;
    rail.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    return () => {
      rail.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }, [sync]);

  const nudge = (direction: 1 | -1) => {
    const rail = railRef.current;
    if (!rail) return;
    const card = rail.querySelector<HTMLElement>("[data-card]");
    const step = card ? card.offsetWidth + 24 : rail.clientWidth * 0.8;
    rail.scrollBy({
      left: step * direction,
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  };

  return (
    <div className="relative">
      <div
        ref={railRef}
        className="flex snap-x snap-mandatory gap-6 overflow-x-auto scroll-smooth pb-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {apps.map((app) => {
          const Icon = APP_ICONS[app.key] || Sparkles;
          return (
            <article
              key={app.key}
              data-card
              className="group relative flex w-[86vw] max-w-[26rem] shrink-0 snap-start flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-gradient-to-br from-[#12314d] to-[#1c3c5c] p-8 text-white shadow-xl transition-transform duration-300 hover:-translate-y-1 sm:w-[24rem]"
            >
              <div
                className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#67D0E4]/20 blur-3xl transition-transform duration-500 group-hover:scale-125"
                aria-hidden
              />
              <div className="relative flex items-start justify-between">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 backdrop-blur">
                  <Icon className="h-7 w-7 text-[#67D0E4]" />
                </span>
                <span className="rounded-full border border-white/15 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white/70">
                  {app.platform}
                </span>
              </div>

              <h3 className="relative mt-6 text-2xl font-black">{app.name}</h3>
              <p className="relative mt-3 flex-1 text-sm leading-relaxed text-white/70">{app.blurb}</p>

              <dl className="relative mt-6 flex gap-6 border-t border-white/10 pt-5 text-xs">
                <div>
                  <dt className="font-bold uppercase tracking-widest text-white/70">Version</dt>
                  <dd className="mt-1 font-black text-[#67D0E4]">{app.version}</dd>
                </div>
                <div>
                  <dt className="font-bold uppercase tracking-widest text-white/70">Size</dt>
                  <dd className="mt-1 font-black text-white/90">{app.size}</dd>
                </div>
              </dl>

              <Link
                href={app.key === "web" ? app.href : `/download/${app.key}`}
                className="relative mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3.5 text-sm font-black text-[#12314d] transition-colors hover:bg-[#67D0E4]"
              >
                {app.cta}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </article>
          );
        })}
      </div>

      {/* Mouse affordances. Touch and keyboard already work without them. */}
      <div className="mt-2 flex items-center justify-between gap-4">
        <p className="text-xs font-semibold text-slate-500">Scroll sideways to see every app</p>
        <div className="hidden gap-2 sm:flex">
          <button
            type="button"
            onClick={() => nudge(-1)}
            disabled={atStart}
            aria-label="Previous app"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-[#264D73] shadow-sm transition-all hover:border-[#67D0E4] hover:text-[#12314d] disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => nudge(1)}
            disabled={atEnd}
            aria-label="Next app"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-[#264D73] shadow-sm transition-all hover:border-[#67D0E4] hover:text-[#12314d] disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
