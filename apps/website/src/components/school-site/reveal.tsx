"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Fades and lifts its content into view as the visitor scrolls. Content is fully visible without JavaScript
 * (the hidden state is only applied once this component has mounted) and for visitors who prefer reduced motion.
 */
export function Reveal({ children, delay = 0, className = "", as: Tag = "div" }: { children: ReactNode; delay?: 0 | 1 | 2 | 3; className?: string; as?: "div" | "section" | "li" }) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof IntersectionObserver === "undefined") {
      el.classList.add("he-in");
      return;
    }
    el.classList.add("he-reveal");
    if (delay) el.classList.add(`he-reveal-d${delay}`);
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.classList.add("he-in");
            io.unobserve(el);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    // Already on screen at load: show immediately instead of hiding then revealing.
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.92) el.classList.add("he-in");
    io.observe(el);
    return () => io.disconnect();
  }, [delay]);
  return <Tag ref={ref as never} className={className}>{children}</Tag>;
}
