import type { ReactNode } from "react";

/**
 * Section shells for the public site.
 *
 * The brief was two things at once: moving between sections should feel like
 * moving somewhere new, and the page should still read as one continuous
 * design with no hard rectangular bands.
 *
 * How that is held together:
 *
 * - Every surface is a vertical gradient that *starts and ends on the same
 *   near-white* the neighbouring sections use. Two stacked sections therefore
 *   meet on an identical colour and the seam disappears — the tint lives in
 *   the middle of a section, never at its edge.
 * - Texture (grid, dots) sits in its own layer behind the content and is
 *   masked to fade out top and bottom, so a pattern never ends in a visible
 *   rectangle.
 * - The dark section is the one place a hard edge would be unavoidable, so it
 *   gets curved SVG caps that sweep the light colour over its top and bottom.
 * - Soft colour blooms are allowed to overflow section bounds, which ties
 *   neighbours together visually.
 *
 * Patterns are inline SVG data URIs: no network request, nothing to ship,
 * crisp at any zoom.
 */

const GRID = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Cpath d='M0 .5H40M.5 0V40' fill='none' stroke='%23264D73' stroke-opacity='0.07'/%3E%3C/svg%3E")`;

const DOTS = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Ccircle cx='2' cy='2' r='1.4' fill='%23264D73' fill-opacity='0.12'/%3E%3C/svg%3E")`;

const DIAGONAL = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'%3E%3Cpath d='M-4 4L4 -4M0 28L28 0M24 32L32 24' stroke='%23ffffff' stroke-opacity='0.05' stroke-width='1.5'/%3E%3C/svg%3E")`;

/** The colour every light section begins and ends on, so seams vanish. */
export const SEAM = "#FBFCFE";

/** Fades a texture layer out at the top and bottom edges. */
const TEXTURE_MASK =
  "linear-gradient(to bottom, transparent 0%, #000 22%, #000 78%, transparent 100%)";

export type Surface = "light" | "tint" | "grid" | "dots" | "dark";

const SURFACES: Record<
  Surface,
  { className: string; background: string; texture?: string; dark?: boolean }
> = {
  // Plain, but still eased off the seam colour so it never reads as a slab.
  light: {
    className: "",
    background: `linear-gradient(to bottom, ${SEAM} 0%, #FFFFFF 25%, #FFFFFF 75%, ${SEAM} 100%)`,
  },
  // A cool wash that swells in the middle and returns to the seam.
  tint: {
    className: "",
    background: `linear-gradient(to bottom, ${SEAM} 0%, #EFF5FA 45%, #EAF3FA 60%, ${SEAM} 100%)`,
  },
  grid: {
    className: "",
    background: `linear-gradient(to bottom, ${SEAM} 0%, #FFFFFF 40%, #F7FAFD 75%, ${SEAM} 100%)`,
    texture: GRID,
  },
  dots: {
    className: "",
    background: `linear-gradient(to bottom, ${SEAM} 0%, #F5F8FC 40%, #EFF5FA 70%, ${SEAM} 100%)`,
    texture: DOTS,
  },
  dark: {
    className: "text-white",
    background: "linear-gradient(to bottom, #173a5a 0%, #12314d 35%, #0f2a43 100%)",
    texture: DIAGONAL,
    dark: true,
  },
};


/** Curved cap that sweeps the light page colour across a dark section's edge. */
function DarkCap({ position }: { position: "top" | "bottom" }) {
  const isTop = position === "top";
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 ${isTop ? "top-0" : "bottom-0"} z-10 leading-[0]`}
      aria-hidden
    >
      <svg
        viewBox="0 0 1440 80"
        preserveAspectRatio="none"
        className={`h-10 w-full sm:h-14 lg:h-20 ${isTop ? "" : "rotate-180"}`}
      >
        <path d="M0 0h1440v18c-240 44-520 62-840 40C380 43 180 30 0 34V0z" fill={SEAM} />
      </svg>
    </div>
  );
}

export function Section({
  children,
  surface = "light",
  className = "",
  id,
  flushBottom = false,
}: {
  children: ReactNode;
  surface?: Surface;
  className?: string;
  id?: string;
  /**
   * Set when the next thing on the page is the same colour as this section —
   * the footer, for instance. Drops the closing curve and ends the gradient on
   * the footer's navy, so two dark blocks meet with no seam and no stray
   * light wave between them.
   */
  flushBottom?: boolean;
}) {
  const { className: surfaceClass, background, texture, dark } = SURFACES[surface];
  const resolvedBackground =
    dark && flushBottom
      ? "linear-gradient(to bottom, #173a5a 0%, #12314d 45%, #12314d 100%)"
      : background;

  return (
    <section
      id={id}
      // scroll-mt so an in-page anchor (from the nav's section dropdowns)
      // never lands under the sticky header — only needed when this
      // section is actually a jump target.
      className={`relative isolate ${surfaceClass} ${id ? "scroll-mt-24" : ""} ${className}`}
      style={{ background: resolvedBackground }}
    >
      {/* Texture, faded at both edges so it never ends in a rectangle. */}
      {texture && (
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          aria-hidden
          style={{
            backgroundImage: texture,
            WebkitMaskImage: TEXTURE_MASK,
            maskImage: TEXTURE_MASK,
          }}
        />
      )}

      {/* Blooms overflow the section on purpose — they tie neighbours together. */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-visible" aria-hidden>
        {dark ? (
          <>
            <div className="absolute -left-32 top-0 h-96 w-96 rounded-full bg-[#67D0E4]/12 blur-3xl" />
            <div className="absolute -right-24 bottom-0 h-96 w-96 rounded-full bg-[#67D0E4]/10 blur-3xl" />
          </>
        ) : (
          <>
            <div className="absolute -left-40 top-1/4 h-[26rem] w-[26rem] rounded-full bg-[#67D0E4]/10 blur-3xl" />
            <div className="absolute -right-40 bottom-0 h-[22rem] w-[22rem] rounded-full bg-[#264D73]/6 blur-3xl" />
          </>
        )}
      </div>

      {dark && <DarkCap position="top" />}

      <div className="relative mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
        {children}
      </div>

      {dark && !flushBottom && <DarkCap position="bottom" />}
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  blurb,
  tone = "dark",
  align = "center",
}: {
  eyebrow: string;
  title: string;
  blurb?: string;
  /** "light" when the section sits on the dark surface. */
  tone?: "dark" | "light";
  align?: "center" | "left";
}) {
  const centered = align === "center";
  return (
    <div className={`${centered ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}`}>
      <p
        className={`flex items-center gap-3 text-[11px] font-black uppercase tracking-[0.28em] text-[#67D0E4] ${
          centered ? "justify-center" : ""
        }`}
      >
        <span className={`h-px w-6 bg-[#67D0E4]/50 ${centered ? "" : "hidden"}`} aria-hidden />
        {eyebrow}
        <span className="h-px w-6 bg-[#67D0E4]/50" aria-hidden />
      </p>
      <h2
        className={`mt-4 font-serif text-[2rem] font-bold leading-[1.15] tracking-tight sm:text-[2.6rem] ${
          tone === "light" ? "text-white" : "text-[#12314d]"
        }`}
      >
        {title}
      </h2>
      {blurb && (
        <p
          className={`mt-4 text-lg leading-relaxed ${
            tone === "light" ? "text-white/70" : "text-slate-600"
          }`}
        >
          {blurb}
        </p>
      )}
      <span
        className={`mt-6 block h-px w-24 ${centered ? "mx-auto" : ""} bg-gradient-to-r from-transparent ${
          tone === "light" ? "via-white/40" : "via-[#67D0E4]"
        } to-transparent`}
        aria-hidden
      />
    </div>
  );
}

/** Page header used by every inner public page, so they open consistently. */
export function PageHero({
  eyebrow,
  title,
  blurb,
}: {
  eyebrow: string;
  title: string;
  blurb?: string;
}) {
  return (
    <section
      className="relative isolate"
      style={{ background: `linear-gradient(to bottom, #EAF3FA 0%, #F2F7FB 55%, ${SEAM} 100%)` }}
    >
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        aria-hidden
        style={{
          backgroundImage: GRID,
          WebkitMaskImage: TEXTURE_MASK,
          maskImage: TEXTURE_MASK,
        }}
      />
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-[#67D0E4]/20 blur-3xl" />
        <div className="absolute -right-24 top-0 h-80 w-80 rounded-full bg-[#264D73]/8 blur-3xl" />
      </div>
      <div className="relative mx-auto w-full max-w-7xl px-4 py-16 text-center sm:px-6 lg:px-8 lg:py-20">
        <p className="flex items-center justify-center gap-3 text-[11px] font-black uppercase tracking-[0.28em] text-[#67D0E4]">
          <span className="h-px w-6 bg-[#67D0E4]/50" aria-hidden />
          {eyebrow}
          <span className="h-px w-6 bg-[#67D0E4]/50" aria-hidden />
        </p>
        <h1 className="mx-auto mt-4 max-w-3xl font-serif text-4xl font-bold leading-[1.12] tracking-tight text-[#12314d] sm:text-5xl">
          {title}
        </h1>
        {blurb && (
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-slate-600">{blurb}</p>
        )}
      </div>
    </section>
  );
}

/** Shown where founder-managed content exists but none has been published yet. */
export function EmptyNotice({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-white/60 px-8 py-16 text-center backdrop-blur">
      <p className="text-base font-black text-[#12314d]">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">{hint}</p>
    </div>
  );
}
