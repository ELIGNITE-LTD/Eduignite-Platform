"use client";

import { TestimonialCard } from "./content-cards";
import type { Testimonial } from "@/lib/public-site";

/**
 * A single row of testimonial cards that drifts continuously from left to right.
 * The list is duplicated so the loop is seamless, and it pauses on hover so a
 * reader can stop on a card. Movement is CSS-only, so it costs nothing at runtime.
 */
export function TestimonialMarquee({
  items,
  fade = "#FBFCFE",
}: {
  items: Testimonial[];
  fade?: string;
}) {
  if (!items.length) return null;
  const loop = [...items, ...items];

  return (
    <div className="group relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 sm:w-24"
        style={{ background: `linear-gradient(to right, ${fade}, transparent)` }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 sm:w-24"
        style={{ background: `linear-gradient(to left, ${fade}, transparent)` }}
        aria-hidden
      />
      <div className="flex w-max gap-6 py-3 animate-[tmarquee_46s_linear_infinite] group-hover:[animation-play-state:paused] motion-reduce:animate-none">
        {loop.map((item, i) => (
          <div key={`${item.id}-${i}`} className="w-[290px] shrink-0 sm:w-[330px]">
            <TestimonialCard item={item} />
          </div>
        ))}
      </div>
      <style>{`@keyframes tmarquee { from { transform: translateX(-50%); } to { transform: translateX(0); } }`}</style>
    </div>
  );
}
