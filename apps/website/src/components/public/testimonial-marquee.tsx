"use client";

import { useState } from "react";
import { Pause, Play } from "lucide-react";
import { TestimonialCard } from "./content-cards";
import type { Testimonial } from "@/lib/public-site";

/**
 * A single row of testimonial cards that drifts continuously from left to right.
 *
 * Moving content has to be stoppable (WCAG 2.2.2): it pauses on hover, while
 * anything inside it has keyboard focus, and with the Pause button. The list
 * is drawn twice so the loop is seamless; the second copy is inert, so screen
 * readers and the Tab key meet each story once. With reduced motion asked for,
 * it does not move at all and scrolls sideways instead.
 */
export function TestimonialMarquee({
  items,
  fade = "#FBFCFE",
}: {
  items: Testimonial[];
  fade?: string;
}) {
  const [paused, setPaused] = useState(false);
  if (!items.length) return null;

  const row = (copy: "first" | "second") => (
    <div
      className="flex shrink-0 gap-6 pr-6"
      aria-hidden={copy === "second" ? true : undefined}
      inert={copy === "second" ? true : undefined}
    >
      {items.map((item) => (
        <div key={`${copy}-${item.id}`} className="w-[290px] shrink-0 sm:w-[330px]">
          <TestimonialCard item={item} />
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <div className="group relative overflow-hidden motion-reduce:overflow-x-auto">
        <div
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 motion-reduce:hidden sm:w-24"
          style={{ background: `linear-gradient(to right, ${fade}, transparent)` }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 motion-reduce:hidden sm:w-24"
          style={{ background: `linear-gradient(to left, ${fade}, transparent)` }}
          aria-hidden
        />
        <div
          className={`flex w-max py-3 animate-[tmarquee_46s_linear_infinite] group-hover:[animation-play-state:paused] focus-within:[animation-play-state:paused] motion-reduce:animate-none ${
            paused ? "[animation-play-state:paused]" : ""
          }`}
        >
          {row("first")}
          <div className="contents motion-reduce:hidden">{row("second")}</div>
        </div>
        <style>{`@keyframes tmarquee { from { transform: translateX(-50%); } to { transform: translateX(0); } }`}</style>
      </div>
      <div className="mt-4 flex justify-center motion-reduce:hidden">
        <button
          type="button"
          onClick={() => setPaused((value) => !value)}
          aria-pressed={paused}
          className="inline-flex items-center gap-2 rounded-full border border-[#264D73]/20 bg-white px-4 py-2 text-sm font-bold text-[#264D73] transition-colors hover:bg-[#264D73]/5"
        >
          {paused ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
          {paused ? "Play the stories" : "Pause the stories"}
        </button>
      </div>
    </div>
  );
}
