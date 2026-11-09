import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Mail, MapPin, Menu, Phone } from "lucide-react";

import { resolveMediaUrl } from "@/lib/media";
import { schoolPlace, type PublicSchool, type SchoolLang } from "@/lib/public-schools";
import { fetchSectionPresence } from "@/lib/school-site-content";
import { DICT, schoolHref, schoolJsonLd, type SchoolSection } from "@/lib/school-site";

/**
 * The frame of a school's public website: school-branded top navigation, a
 * dark footer with the school's own contact details, and nothing from the
 * EduIgnite marketing site. The only mention of EduIgnite is the small
 * "Powered by eduignite.online" link in the footer.
 *
 * Server-rendered with no client JavaScript: the mobile menu is a native
 * <details> element, and it is hidden/shown with responsive classes only.
 */

type Props = {
  school: PublicSchool;
  lang: SchoolLang;
  active: SchoolSection;
  preview?: string;
  /** Breadcrumb names (after the school itself) for JSON-LD. */
  crumbs?: { name: string; section: SchoolSection }[];
  children: ReactNode;
};

const RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-blue-800";

export function SchoolLogo({ school, size = 40 }: { school: PublicSchool; size?: number }) {
  const logo = resolveMediaUrl(school.logo);
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white"
      style={{ width: size, height: size }}
    >
      {logo ? (
        <Image src={logo} alt="" width={size} height={size} unoptimized className="h-full w-full object-contain p-1" />
      ) : (
        <span className="text-xs font-black text-blue-800" aria-hidden>
          {(school.short_name || school.name).slice(0, 3).toUpperCase()}
        </span>
      )}
    </span>
  );
}

export async function SchoolSite({ school, lang, active, preview, crumbs = [], children }: Props) {
  const t = DICT[lang];
  // Events, Gallery and Blog appear in the menu only once the school has published something.
  const present = await fetchSectionPresence(school.slug);
  const href = (section: SchoolSection, l: SchoolLang = lang) => schoolHref(school, section, l, preview);

  const links: { section: SchoolSection; label: string }[] = [
    { section: "", label: t.home },
    { section: "about", label: t.about },
    ...(present.events || active === "events" ? [{ section: "events" as const, label: t.events }] : []),
    ...(present.gallery || active === "gallery" ? [{ section: "gallery" as const, label: t.gallery }] : []),
    ...(present.blog || active === "blog" ? [{ section: "blog" as const, label: t.blog }] : []),
    { section: "login", label: t.login },
    ...(school.enrollment_enabled ? [{ section: "enrollment" as const, label: t.enrollment }] : []),
  ];
  const otherLang: SchoolLang = lang === "en" ? "fr" : "en";
  const place = schoolPlace(school);
  const addressLine = [school.address, school.city_village || school.location, school.postal_code].filter(Boolean).join(", ");
  const jsonLd = schoolJsonLd(school, lang, [{ name: school.name, section: "" }, ...crumbs]);

  const linkClass = (section: SchoolSection) =>
    `rounded-md px-3 py-2 text-sm font-semibold transition-colors ${RING} ${
      active === section ? "bg-white/15 text-white" : "text-blue-50 hover:bg-white/10 hover:text-white"
    }`;

  return (
    <div className="flex min-h-dvh flex-col bg-white text-slate-800" lang={lang}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-green-700 focus:px-5 focus:py-3 focus:text-sm focus:font-bold focus:text-white"
      >
        {t.skip}
      </a>
      {jsonLd.map((block, i) => (
        <script
          key={i}
          type="application/ld+json"
          // Escaping "<" keeps school-supplied text from ever closing the tag.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(block).replace(/</g, "\\u003c") }}
        />
      ))}

      {!school.is_live ? (
        <p role="status" className="bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-900">
          {t.previewBanner}
        </p>
      ) : null}

      <header className="sticky top-0 z-50 bg-blue-800 shadow-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <Link href={href("")} className={`flex min-w-0 items-center gap-3 rounded-md ${RING}`}>
            <SchoolLogo school={school} />
            <span className="truncate text-base font-bold leading-tight text-white sm:text-lg">{school.name}</span>
          </Link>

          <nav aria-label={t.mainNav} className="hidden items-center gap-1 md:flex">
            {links.map((l) => (
              <Link key={l.section} href={href(l.section)} aria-current={active === l.section ? "page" : undefined} className={linkClass(l.section)}>
                {l.label}
              </Link>
            ))}
            <Link
              href={href(active, otherLang)}
              hrefLang={otherLang}
              lang={otherLang}
              aria-label={`${t.language}: ${otherLang === "en" ? "English" : "Français"}`}
              className={`ml-2 rounded-md border border-white/40 px-2.5 py-1.5 text-xs font-bold uppercase text-white hover:bg-white/10 ${RING}`}
            >
              {otherLang}
            </Link>
          </nav>

          {/* Mobile: a native disclosure, no JavaScript. Hidden at md+ by class. */}
          <details className="group relative md:hidden">
            <summary
              className={`flex h-10 cursor-pointer list-none items-center gap-2 rounded-md border border-white/40 px-3 text-sm font-semibold text-white [&::-webkit-details-marker]:hidden ${RING}`}
            >
              <Menu className="h-5 w-5" aria-hidden />
              {t.menu}
            </summary>
            <nav
              aria-label={t.mainNav}
              className="absolute right-0 top-12 z-50 flex w-64 max-w-[calc(100vw-2rem)] flex-col gap-1 rounded-xl bg-blue-900 p-3 shadow-xl ring-1 ring-white/20"
            >
              {links.map((l) => (
                <Link key={l.section} href={href(l.section)} aria-current={active === l.section ? "page" : undefined} className={`${linkClass(l.section)} py-3`}>
                  {l.label}
                </Link>
              ))}
              <Link
                href={href(active, otherLang)}
                hrefLang={otherLang}
                lang={otherLang}
                className={`mt-1 rounded-md border border-white/40 px-3 py-3 text-sm font-bold text-white hover:bg-white/10 ${RING}`}
              >
                {t.language}: {otherLang === "en" ? "English" : "Français"}
              </Link>
            </nav>
          </details>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        {children}
      </main>

      <footer className="bg-[#0b2447] text-slate-200">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-3 lg:px-8">
          <div>
            <div className="flex items-center gap-3">
              <SchoolLogo school={school} size={44} />
              <p className="text-lg font-bold text-white">{school.name}</p>
            </div>
            {place ? <p className="mt-3 text-sm text-slate-300">{place}, Cameroon</p> : null}
          </div>

          <nav aria-label={t.quickLinks}>
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">{t.quickLinks}</h2>
            <ul className="mt-4 space-y-2 text-sm">
              {links.map((l) => (
                <li key={l.section}>
                  <Link href={href(l.section)} className="rounded text-slate-200 hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">{t.contact}</h2>
            <ul className="mt-4 space-y-3 text-sm">
              {addressLine ? (
                <li className="flex items-start gap-2.5">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-green-400" aria-hidden />
                  <span>{addressLine}</span>
                </li>
              ) : null}
              {school.phone ? (
                <li className="flex items-center gap-2.5">
                  <Phone className="h-4 w-4 shrink-0 text-green-400" aria-hidden />
                  <a href={`tel:${school.phone.replace(/\s+/g, "")}`} className="hover:underline">{school.phone}</a>
                </li>
              ) : null}
              {school.email ? (
                <li className="flex items-center gap-2.5">
                  <Mail className="h-4 w-4 shrink-0 text-green-400" aria-hidden />
                  <a href={`mailto:${school.email}`} className="break-all hover:underline">{school.email}</a>
                </li>
              ) : null}
              {!addressLine && !school.phone && !school.email ? (
                <li className="text-slate-400">{t.notShared}</li>
              ) : null}
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-4 py-4 text-xs text-slate-300 sm:flex-row sm:px-6 lg:px-8">
            <p>
              &copy; {new Date().getFullYear()} {school.name}. {t.footerRights}
            </p>
            <p>
              {t.poweredBy}{" "}
              <a href="https://eduignite.online" rel="noopener" className="font-semibold text-slate-200 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                eduignite.online
              </a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

/** Reusable page banner: the mockup's photo header with title and breadcrumb. */
export function PageBanner({
  school, lang, title, preview,
}: { school: PublicSchool; lang: SchoolLang; title: string; preview?: string }) {
  const t = DICT[lang];
  const banner = resolveMediaUrl(school.banner);
  return (
    <section className="relative isolate overflow-hidden bg-blue-900">
      {banner ? <Image src={banner} alt="" fill unoptimized sizes="100vw" className="-z-10 object-cover opacity-30" /> : null}
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{title}</h1>
        <nav aria-label={t.breadcrumb} className="mt-3 text-sm text-blue-100">
          <Link href={schoolHref(school, "", lang, preview)} className="underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
            {t.home}
          </Link>
          <span aria-hidden> &rsaquo; </span>
          <span aria-current="page">{title}</span>
        </nav>
      </div>
    </section>
  );
}

export const GREEN_BUTTON =
  "inline-flex items-center justify-center rounded-lg bg-green-700 px-5 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-green-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-2";

export function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-14 text-center">
      <h2 className="text-xl font-bold text-blue-900">{title}</h2>
      <p className="mt-3 text-slate-600">{text}</p>
    </div>
  );
}
