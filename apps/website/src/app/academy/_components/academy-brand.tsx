import { cn } from "@/lib/utils";
import { EDUIGNITE_LOGO_PNG } from "@/lib/platform-brand";

/**
 * The official EduIgnite mark, as used across every Academy screen.
 *
 * Always the canonical raster from `platform-brand` (the SVG is only an
 * approximation of it), never a stand-in icon, so the Academy reads as part of
 * EduIgnite from sign-in through to the certificate.
 *
 * The mark is a dark shield on a transparent ground. On a dark surface it
 * would sink into the background, so `onDark` seats it on a white tile.
 */
const SIZES = {
  sm: { box: "h-9 w-9", img: 28, word: "text-sm" },
  md: { box: "h-12 w-12", img: 40, word: "text-base" },
  lg: { box: "h-20 w-20", img: 68, word: "text-xl" },
  xl: { box: "h-28 w-28", img: 96, word: "text-2xl" },
} as const;

export function AcademyLogo({
  size = "md",
  onDark = false,
  withWordmark = false,
  subtitle,
  className,
}: {
  size?: keyof typeof SIZES;
  onDark?: boolean;
  withWordmark?: boolean;
  subtitle?: string;
  className?: string;
}) {
  const s = SIZES[size];

  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-2xl",
          s.box,
          onDark && "bg-white shadow-sm",
        )}
      >
        {/* A plain img keeps the mark identical in screen, print and PDF, with
            no image optimiser rewriting it. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={EDUIGNITE_LOGO_PNG}
          alt="EduIgnite"
          width={s.img}
          height={s.img}
          className="object-contain"
          style={{ width: s.img, height: s.img }}
        />
      </span>
      {withWordmark ? (
        <span className="min-w-0 text-left">
          <span
            className={cn(
              "block truncate font-black uppercase leading-none tracking-widest",
              s.word,
              onDark ? "text-white" : "text-[#12314d]",
            )}
          >
            EduIgnite Academy
          </span>
          {subtitle ? (
            <span
              className={cn(
                "mt-1 block text-[10px] font-bold uppercase tracking-[0.2em]",
                onDark ? "text-white/60" : "text-slate-500",
              )}
            >
              {subtitle}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

/**
 * A full-screen loading state carrying the mark, for authentication checks and
 * any Academy screen that has to wait before it can show anything.
 */
export function AcademyLoadingScreen({ label = "Loading EduIgnite Academy" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6"
      style={{ background: "linear-gradient(to bottom, #EAF3FA 0%, #F2F7FB 55%, #FBFCFE 100%)" }}
    >
      <span className="animate-pulse">
        <AcademyLogo size="xl" />
      </span>
      <span className="flex items-center gap-3">
        <span
          aria-hidden
          className="h-4 w-4 animate-spin rounded-full border-2 border-[#264D73]/20 border-t-[#264D73]"
        />
        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#264D73]/70">
          {label}
        </span>
      </span>
    </div>
  );
}

/** A smaller, inline loading state for a panel inside a page that is already on screen. */
export function AcademyInlineLoading({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center justify-center gap-4 py-16">
      <span className="animate-pulse">
        <AcademyLogo size="lg" />
      </span>
      <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#264D73]/60">{label}</span>
    </div>
  );
}
