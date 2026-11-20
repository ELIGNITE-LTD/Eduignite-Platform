import type { Founder } from "@/lib/public-site";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LinkIcon } from "./social-icons";

const ROLE_LABEL: Record<string, string> = {
  CEO: "Chief Executive Officer",
  CTO: "Chief Technology Officer",
  COO: "Operational Department",
  SUPER_ADMIN: "Executive Staff",
  INV: "Investor",
  DESIGNER: "Marketing Department",
  SYSTEM_DEV: "Systems Department",
};

/** Co-founder wording belongs to the CEO and CTO alone. */
const COFOUNDER_WORDING = /co[\s\-–—]?founder/gi;

/**
 * EduIgnite's two co-founders are its CEO and CTO — everyone else on the board
 * is executive staff.
 *
 * This is decided from `role`, which every version of the API returns, rather
 * than trusting the `is_cofounder` flag alone: that field only exists on newer
 * backends, and when it is missing an `undefined` would quietly demote both
 * co-founders to executive staff.
 */
export function isCofounder(f: Founder) {
  const role = (f.role || "").toUpperCase();
  return role === "CEO" || role === "CTO" || f.is_cofounder === true;
}

export function roleLabel(f: Founder) {
  const raw = (f.title || "").trim();
  const title = isCofounder(f)
    ? raw
    : raw
        .replace(COFOUNDER_WORDING, " ")
        .replace(/\s*[,&/|]\s*/g, " & ")
        .replace(/\s+/g, " ")
        .replace(/^[\s&,\-–—/|]+|[\s&,\-–—/|]+$/g, "");
  return title || ROLE_LABEL[f.role] || "Executive Staff";
}

export function Portrait({ f, size }: { f: Founder; size: "lg" | "md" }) {
  const dim = size === "lg" ? "h-32 w-32" : "h-24 w-24";
  const text = size === "lg" ? "text-4xl" : "text-3xl";
  return (
    <div className="relative">
      <div
        className="absolute -inset-1.5 -z-10 rounded-full bg-gradient-to-tr from-[#67D0E4]/40 to-[#264D73]/20 blur-md"
        aria-hidden
      />
      {f.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={f.avatar}
          alt={f.name}
          loading="lazy"
          decoding="async"
          className={`${dim} rounded-full object-cover shadow-lg ring-4 ring-white`}
        />
      ) : (
        <span
          className={`${dim} ${text} flex items-center justify-center rounded-full bg-gradient-to-br from-[#264D73] to-[#3d7ba8] font-serif font-bold text-white shadow-lg ring-4 ring-white`}
        >
          {f.name.slice(0, 1).toUpperCase()}
        </span>
      )}
    </div>
  );
}

/**
 * One card, one size: every person on the team gets the same card, so the page reads as an even, orderly grid.
 * It carries only the essentials: portrait, name, title, a role badge, and a row of icon links. A person who wrote a
 * bio also gets a "Bio" button that opens their own page.
 */
export function PersonCard({ f, lead, preview = false }: { f: Founder; lead: boolean; preview?: boolean }) {
  const links = (f.links ?? []).filter((l) => l.url.startsWith("https://"));
  const hasBio = Boolean(f.has_bio ?? f.bio) && Boolean(f.slug || preview);
  return (
    <figure className="group flex h-[396px] w-full max-w-[320px] flex-col items-center rounded-2xl border border-slate-200/80 bg-white p-6 text-center shadow-[0_1px_2px_rgba(18,49,77,0.04),0_14px_32px_-22px_rgba(18,49,77,0.22)] transition-all duration-300 hover:-translate-y-1.5 hover:border-[#67D0E4]/40 hover:shadow-[0_1px_2px_rgba(18,49,77,0.05),0_24px_48px_-26px_rgba(18,49,77,0.3)] sm:w-[300px]">
      <Portrait f={f} size="md" />
      <figcaption className="mt-5 flex w-full flex-1 flex-col items-center">
        <h3 className="flex min-h-[3.2rem] items-center justify-center font-serif text-lg font-bold leading-snug text-[#12314d]">
          <span className="line-clamp-2">{f.name}</span>
        </h3>
        <p className="flex min-h-[2.4rem] items-start justify-center text-[13px] font-bold leading-snug text-[#264D73]">
          <span className="line-clamp-2">{roleLabel(f)}</span>
        </p>
        <span
          className={`mt-2 inline-flex items-center rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${
            lead ? "bg-[#67D0E4]/15 text-[#264D73]" : "bg-slate-100 text-slate-500"
          }`}
        >
          {lead ? "Co-Founder" : "Executive Staff"}
        </span>
        <div className="mt-auto flex w-full flex-col items-center gap-3.5 pt-5">
          {hasBio ? (
            preview ? (
              <span className="inline-flex h-10 w-full max-w-[210px] items-center justify-center gap-2 rounded-full bg-[#264D73] text-[13px] font-bold tracking-wide text-white shadow-sm">
                Read bio <ArrowRight className="h-4 w-4" aria-hidden />
              </span>
            ) : (
              <Link
                href={`/team/${f.slug}`}
                aria-label={`Read the bio of ${f.name}`}
                className="inline-flex h-10 w-full max-w-[210px] items-center justify-center gap-2 rounded-full bg-[#264D73] text-[13px] font-bold tracking-wide text-white shadow-sm transition-all hover:bg-[#12314d] hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#264D73] group-hover:bg-[#1c3c5c]"
              >
                Read bio <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            )
          ) : null}
          <div className="flex min-h-[2.25rem] flex-wrap items-center justify-center gap-2">
            {links.map((l) => (
              <a
                key={l.kind}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                aria-label={`${f.name} on ${l.label}`}
                title={l.label}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-[#264D73] transition-colors hover:border-[#67D0E4] hover:bg-[#67D0E4]/15 hover:text-[#0E7490] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#264D73]"
              >
                <LinkIcon kind={l.kind} className="h-4 w-4" />
              </a>
            ))}
          </div>
        </div>
      </figcaption>
    </figure>
  );
}

/**
 * The people behind EduIgnite.
 *
 * EduIgnite has exactly two co-founders — the CEO and the CTO. Everyone else on
 * the leadership team is executive staff, so they are shown in their own group
 * and never carry co-founder wording, even if a title says otherwise.
 */
export function FoundersGrid({ founders }: { founders: Founder[] }) {
  if (!founders.length) return null;

  const cofounders = founders.filter(isCofounder);
  const executives = founders.filter((f) => !isCofounder(f));

  return (
    <>
      {cofounders.length > 0 && (
        <>
          <div className="mx-auto mt-12 flex max-w-5xl flex-wrap justify-center gap-6">
            {cofounders.map((f) => (
              <PersonCard key={`${f.name}-${f.role}`} f={f} lead />
            ))}
          </div>
          <p className="mx-auto mt-8 max-w-2xl text-center text-sm leading-relaxed text-slate-500">
            EduIgnite was founded by its Chief Executive Officer and Chief Technology Officer, the
            company&rsquo;s two co-founders, who lead it side by side.
          </p>
        </>
      )}

      {executives.length > 0 && (
        <div className="mt-16">
          <p className="flex items-center justify-center gap-3 text-[11px] font-black uppercase tracking-[0.28em] text-[#0E7490]">
            <span className="h-px w-6 bg-[#67D0E4]/50" aria-hidden />
            Executive team
            <span className="h-px w-6 bg-[#67D0E4]/50" aria-hidden />
          </p>
          <div className="mx-auto mt-8 flex max-w-6xl flex-wrap justify-center gap-6">
            {executives.map((f) => (
              <PersonCard key={`${f.name}-${f.role}`} f={f} lead={false} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
