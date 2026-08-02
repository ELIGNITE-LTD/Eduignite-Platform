"use client";

/**
 * The brand moment shown before the site itself.
 *
 * Three rules keep an intro animation from becoming an obstacle:
 *
 * 1. It shows once per browser session (sessionStorage), not on every
 *    navigation — a splash you cannot get past is an irritation, not branding.
 * 2. It can be skipped by clicking, tapping or pressing any key.
 * 3. It is skipped outright for prefers-reduced-motion, and it never blocks the
 *    page underneath from loading — this overlays content that is already there,
 *    so nothing is delayed by it.
 *
 * Timing: 95ms per letter is the readable-but-brisk band for typewriter text.
 * Nine letters lands at ~0.9s, plus a short hold — under the ~2s that starts to
 * feel like a wait.
 */

import { useCallback, useEffect, useState } from "react";

const WORD = "EDUIGNITE";
const LETTER_MS = 95;
const HOLD_MS = 620;
const FADE_MS = 620;
const STORAGE_KEY = "eduignite:intro-seen";

export function IntroSplash() {
  const [phase, setPhase] = useState<"checking" | "typing" | "leaving" | "done">("checking");
  const [typed, setTyped] = useState(0);

  const dismiss = useCallback(() => {
    setPhase((current) => (current === "typing" ? "leaving" : current));
  }, []);

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let seen = false;
    try {
      seen = sessionStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      seen = false; // private mode — treat as unseen, it still only shows once
    }
    if (seen || reduced) {
      setPhase("done");
      return;
    }
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* not fatal */
    }
    setPhase("typing");
    // The page beneath must not scroll while the overlay is up.
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    if (phase !== "typing") return;
    if (typed < WORD.length) {
      const id = setTimeout(() => setTyped((n) => n + 1), LETTER_MS);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => setPhase("leaving"), HOLD_MS);
    return () => clearTimeout(id);
  }, [phase, typed]);

  useEffect(() => {
    if (phase !== "leaving") return;
    document.body.style.overflow = "";
    const id = setTimeout(() => setPhase("done"), FADE_MS);
    return () => clearTimeout(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== "typing") return;
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, [phase, dismiss]);

  if (phase === "done" || phase === "checking") return null;

  return (
    <div
      onClick={dismiss}
      role="presentation"
      aria-hidden
      className={`fixed inset-0 z-[100] flex cursor-pointer flex-col items-center justify-center bg-[#0d2740] transition-opacity [transition-duration:620ms] ease-out ${
        phase === "leaving" ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/2 h-[38rem] w-[38rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#67D0E4]/12 blur-3xl" />
      </div>

      <div className="relative flex flex-col items-center px-6">
        <img
          src="/icon.png"
          alt=""
          width={96}
          height={96}
          className="h-20 w-20 animate-[splash-in_700ms_ease-out_both] sm:h-24 sm:w-24"
        />

        <h1 className="mt-7 flex items-center font-black tracking-[0.22em] text-white [font-variant-ligatures:none]">
          <span className="text-2xl sm:text-4xl lg:text-5xl">
            {WORD.slice(0, typed)}
          </span>
          <span
            className={`ml-1 inline-block h-7 w-[3px] bg-[#67D0E4] sm:h-10 lg:h-12 ${
              typed < WORD.length ? "animate-pulse" : "animate-[caret_1s_steps(1)_infinite]"
            }`}
          />
        </h1>

        <p
          className={`mt-5 text-[11px] font-bold uppercase tracking-[0.3em] text-white/45 transition-opacity duration-500 ${
            typed >= WORD.length ? "opacity-100" : "opacity-0"
          }`}
        >
          One platform for the whole school
        </p>
      </div>

      <span className="absolute bottom-8 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/30">
        Tap to continue
      </span>
    </div>
  );
}
