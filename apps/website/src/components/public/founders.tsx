import { Facebook, Github, Globe, Instagram, Linkedin, Twitter, Youtube } from "lucide-react";
import type { Founder } from "@/lib/public-site";

const LINK_META: Record<string, { label: string; Icon: React.ComponentType<{ className?: string }> }> = {
  linkedin: { label: "LinkedIn", Icon: Linkedin },
  x: { label: "X", Icon: Twitter },
  github: { label: "GitHub", Icon: Github },
  facebook: { label: "Facebook", Icon: Facebook },
  instagram: { label: "Instagram", Icon: Instagram },
  youtube: { label: "YouTube", Icon: Youtube },
  website: { label: "Website", Icon: Globe },
};

/** Only https addresses are ever turned into links, whatever the API sends. */
function safeLinks(f: Founder) {
  return (f.links ?? []).filter((l) => LINK_META[l.type] && /^https:\/\//i.test(l.url));
}

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
function isCofounder(f: Founder) {
  const role = (f.role || "").toUpperCase();
  return role === "CEO" || role === "CTO" || f.is_cofounder === true;
}

function roleLabel(f: Founder) {
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

function Portrait({ f, size }: { f: Founder; size: "lg" | "md" }) {
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

function PersonCard({ f, lead }: { f: Founder; lead: boolean }) {
  return (
    <figure
      className={`group flex flex-col items-center rounded-2xl border bg-white text-center transition-all duration-300 hover:-translate-y-1.5 hover:border-[#67D0E4]/40 ${
        lead
          ? "border-slate-200/80 p-8 shadow-[0_1px_2px_rgba(18,49,77,0.04),0_18px_40px_-24px_rgba(18,49,77,0.22)] hover:shadow-[0_1px_2px_rgba(18,49,77,0.05),0_28px_56px_-28px_rgba(18,49,77,0.3)]"
          : "border-slate-200/70 p-6 shadow-[0_1px_2px_rgba(18,49,77,0.03),0_12px_28px_-20px_rgba(18,49,77,0.18)] hover:shadow-[0_1px_2px_rgba(18,49,77,0.05),0_22px_44px_-24px_rgba(18,49,77,0.26)]"
      }`}
    >
      <Portrait f={f} size={lead ? "lg" : "md"} />
      <figcaption className="mt-5">
        <h3 className={`font-serif font-bold text-[#12314d] ${lead ? "text-xl" : "text-lg"}`}>
          {f.name}
        </h3>
        <p className={`mt-1 font-bold text-[#264D73] ${lead ? "text-sm" : "text-[13px]"}`}>
          {roleLabel(f)}
        </p>
        <span
          className={`mt-3 inline-flex items-center rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${
            lead ? "bg-[#67D0E4]/15 text-[#264D73]" : "bg-slate-100 text-slate-500"
          }`}
        >
          {lead ? "Co-Founder" : "Executive Staff"}
        </span>
        {f.bio ? (
          <p className="mt-4 text-[13.5px] leading-relaxed text-slate-600">{f.bio}</p>
        ) : null}
        {safeLinks(f).length > 0 && (
          <ul className="mt-5 flex flex-wrap items-center justify-center gap-2" aria-label={`${f.name} on the web`}>
            {safeLinks(f).map((l) => {
              const { label, Icon } = LINK_META[l.type];
              return (
                <li key={l.type}>
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    aria-label={`${f.name} on ${label}`}
                    title={label}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:border-[#67D0E4]/60 hover:bg-[#67D0E4]/10 hover:text-[#264D73] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#264D73]"
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                </li>
              );
            })}
          </ul>
        )}
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
          <div
            className={`mx-auto mt-12 grid gap-6 ${
              cofounders.length === 1 ? "max-w-sm" : "max-w-3xl sm:grid-cols-2"
            }`}
          >
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
          <div
            className={`mx-auto mt-8 grid max-w-5xl gap-5 sm:grid-cols-2 ${
              executives.length >= 3 ? "lg:grid-cols-3" : ""
            }`}
          >
            {executives.map((f) => (
              <PersonCard key={`${f.name}-${f.role}`} f={f} lead={false} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
