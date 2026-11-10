import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, Mail, MapPin, Menu, Phone } from "lucide-react";

import "./higher.css";
import { resolveMediaUrl } from "@/lib/media";
import { pickText, schoolPlace, type PublicSchool, type SchoolLang } from "@/lib/public-schools";
import { schoolHref, type SchoolSection } from "@/lib/school-site";
import type { SiteText } from "@/lib/school-site-higher";
import { brandCss, facultyGroups, groupByLevel, programmeHref, progText, type Department, type Programme } from "@/lib/school-site-programmes";

/**
 * Frame of a higher-education institution's public site: a quiet utility bar,
 * a sticky serif header with a mega-menu for the institution, and a dark
 * editorial footer. Server-rendered, no client JavaScript (mega-menu opens on
 * hover/focus-within; the mobile menu is a native <details>).
 */

type Props = {
  school: PublicSchool;
  lang: SchoolLang;
  active: SchoolSection;
  preview?: string;
  t: SiteText;
  present: { events: boolean; gallery: boolean; blog: boolean };
  /** Published programmes and departments; the Academics menu appears only when programmes exist. */
  academics?: { programmes: Programme[]; departments: Department[] };
  jsonLd: unknown[];
  children: ReactNode;
};

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--he-accent-bright)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent";

export function HigherLogo({ school, size = 44, tone = "light" }: { school: PublicSchool; size?: number; tone?: "light" | "dark" }) {
  const logo = resolveMediaUrl(school.logo);
  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden ${tone === "dark" ? "bg-white" : "bg-[var(--he-paper)]"} ring-1 ring-[var(--he-line)]`}
      style={{ width: size, height: size, borderRadius: 3 }}
    >
      {logo ? (
        <Image src={logo} alt="" width={size} height={size} unoptimized className="h-full w-full object-contain p-1" />
      ) : (
        <span className="he-serif text-sm font-semibold text-[#0f1c2e]" aria-hidden>
          {(school.short_name || school.name).slice(0, 3).toUpperCase()}
        </span>
      )}
    </span>
  );
}

export function HigherSchoolFrame({ school, lang, active, preview, t, present, academics, jsonLd, children }: Props) {
  const pt = progText(lang);
  const programmes = academics?.programmes ?? [];
  const hasProgrammes = programmes.length > 0;
  const levelGroups = hasProgrammes ? groupByLevel(programmes) : [];
  const facultyList = hasProgrammes ? facultyGroups(academics?.departments ?? []) : [];
  const brand = brandCss(school.brand_color);
  const href = (section: SchoolSection, l: SchoolLang = lang) => schoolHref(school, section, l, preview);
  const otherLang: SchoolLang = lang === "en" ? "fr" : "en";
  const place = schoolPlace(school);
  const addressLine = [school.address, school.city_village || school.location, school.postal_code].filter(Boolean).join(", ");
  const motto = pickText(school.motto, lang);
  const banner = resolveMediaUrl(school.banner);

  const showEvents = present.events || active === "events";
  const showGallery = present.gallery || active === "gallery";
  const showBlog = present.blog || active === "blog";

  const flat: { section: SchoolSection; label: string }[] = [
    ...(showBlog ? [{ section: "blog" as const, label: t.blog }] : []),
    ...(showEvents ? [{ section: "events" as const, label: t.events }] : []),
    ...(showGallery ? [{ section: "gallery" as const, label: t.gallery }] : []),
  ];
  const aboutItems = [
    { id: "identity", label: t.menuIdentity },
    ...(pickText(school.vision, lang) || pickText(school.mission, lang) ? [{ id: "vision", label: t.menuVision }] : []),
    ...(pickText(school.history, lang) ? [{ id: "history", label: t.menuHistory }] : []),
    { id: "leadership", label: t.menuLeadership },
  ];
  const aboutHref = href("about");
  const [aboutPath, aboutQuery] = aboutHref.split("?");
  const anchor = (id: string) => `${aboutPath}${aboutQuery ? `?${aboutQuery}` : ""}#${id}`;

  const navLink = (section: SchoolSection) =>
    `relative px-3 py-2 text-[15px] font-medium text-[var(--he-text)] transition-colors hover:text-[var(--he-accent)] ${FOCUS} ${
      active === section ? "after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:bg-[var(--he-accent)]" : ""
    }`;

  return (
    <div className={`he-site${brand ? " he-brand" : ""} flex min-h-dvh flex-col`} lang={lang}>
      {brand ? <style dangerouslySetInnerHTML={{ __html: brand }} /> : null}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:bg-[#0f1c2e] focus:px-5 focus:py-3 focus:text-sm focus:font-semibold focus:text-white"
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

      {/* Utility bar */}
      <div className="hidden bg-[var(--he-hero-from)] text-[13px] text-[#c3cbd8] md:block">
        <div className="mx-auto flex h-9 w-full max-w-7xl items-center justify-end gap-6 px-6 lg:px-10">
          <Link href={href("login")} className={`hover:text-white ${FOCUS}`}>{t.login}</Link>
          <Link
            href={href(active, otherLang)}
            hrefLang={otherLang}
            lang={otherLang}
            aria-label={`${t.language}: ${otherLang === "en" ? "English" : "Français"}`}
            className={`font-semibold text-white hover:text-[var(--he-brass)] ${FOCUS}`}
          >
            {otherLang === "en" ? "English" : "Français"}
          </Link>
        </div>
      </div>

      <header className="sticky top-0 z-50 border-b border-[var(--he-line)] bg-[var(--he-surface)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--he-surface)]/85">
        <div className="mx-auto flex h-[72px] w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
          <Link href={href("")} className={`flex min-w-0 items-center gap-3 ${FOCUS}`}>
            <HigherLogo school={school} size={44} />
            <span className="he-serif truncate text-lg font-semibold leading-tight text-[var(--he-text)] sm:text-xl">{school.name}</span>
          </Link>

          <nav aria-label={t.mainNav} className="hidden items-center lg:flex">
            <Link href={href("")} aria-current={active === "" ? "page" : undefined} className={navLink("")}>{t.home}</Link>

            <div className="he-mega-host static">
              <Link href={aboutHref} aria-current={active === "about" ? "page" : undefined} aria-haspopup="true" className={`${navLink("about")} inline-flex items-center gap-1`}>
                {t.aboutMenu}
                <ChevronDown className="h-4 w-4" aria-hidden />
              </Link>
              <div className="he-mega absolute inset-x-0 top-full border-b border-[var(--he-line)] bg-[var(--he-surface)] shadow-[0_24px_40px_-24px_rgba(15,28,46,0.35)]">
                <div className="mx-auto grid w-full max-w-7xl grid-cols-12 gap-10 px-10 py-10">
                  <div className="col-span-3">
                    <p className="he-serif text-xl font-semibold text-[var(--he-text)]">{t.aboutMenu}</p>
                    <ul className="mt-4 space-y-1">
                      {aboutItems.map((item) => (
                        <li key={item.id}>
                          <Link href={anchor(item.id)} className={`block py-1.5 text-[15px] text-[var(--he-muted)] hover:text-[var(--he-accent)] ${FOCUS}`}>
                            {item.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="col-span-3">
                    <p className="he-serif text-xl font-semibold text-[var(--he-text)]">{t.exploreInstitution}</p>
                    <ul className="mt-4 space-y-1">
                      {flat.map((l) => (
                        <li key={l.section}>
                          <Link href={href(l.section)} className={`block py-1.5 text-[15px] text-[var(--he-muted)] hover:text-[var(--he-accent)] ${FOCUS}`}>{l.label}</Link>
                        </li>
                      ))}
                      <li>
                        <Link href={href("login")} className={`block py-1.5 text-[15px] text-[var(--he-muted)] hover:text-[var(--he-accent)] ${FOCUS}`}>{t.login}</Link>
                      </li>
                    </ul>
                  </div>
                  <div className="relative col-span-6 min-h-[170px] overflow-hidden he-grad" style={{ borderRadius: 3 }}>
                    {banner ? <Image src={banner} alt="" fill unoptimized sizes="40vw" loading="lazy" className="object-cover opacity-60" /> : null}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0f1c2e]/90 to-transparent" />
                    <div className="relative flex h-full min-h-[170px] flex-col justify-end p-6 text-white">
                      <p className="he-serif text-2xl leading-snug">{motto || school.name}</p>
                      {school.enrollment_enabled ? (
                        <Link href={href("enrollment")} className={`mt-3 w-fit text-sm font-semibold text-[var(--he-brass)] underline-offset-4 hover:underline ${FOCUS}`}>
                          {t.applyNow}
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {hasProgrammes ? (
              <div className="he-mega-host static">
                <Link href={href("programmes")} aria-current={active === "programmes" ? "page" : undefined} aria-haspopup="true" className={`${navLink("programmes")} inline-flex items-center gap-1`}>
                  {pt.academics}
                  <ChevronDown className="h-4 w-4" aria-hidden />
                </Link>
                <div className="he-mega absolute inset-x-0 top-full border-b border-[var(--he-line)] bg-[var(--he-surface)] shadow-[0_24px_40px_-24px_rgba(15,28,46,0.35)]">
                  <div className="mx-auto grid w-full max-w-7xl grid-cols-12 gap-10 px-10 py-10">
                    {facultyList.length > 0 ? (
                      <div className="col-span-5">
                        <p className="he-serif text-xl font-semibold text-[var(--he-text)]">{pt.facultiesDepartments}</p>
                        <ul className="mt-4 grid grid-cols-2 gap-x-8 gap-y-5">
                          {facultyList.slice(0, 6).map((g) => (
                            <li key={g.faculty || "_"}>
                              {g.faculty ? <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-[var(--he-text)]">{g.faculty}</p> : null}
                              <ul className={g.faculty ? "mt-1" : ""}>
                                {g.departments.slice(0, 4).map((d) => (
                                  <li key={d}>
                                    <Link href={programmeHref(href("programmes"), { department: d })} className={`block py-1 text-[15px] text-[var(--he-muted)] hover:text-[var(--he-accent)] ${FOCUS}`}>{d}</Link>
                                  </li>
                                ))}
                              </ul>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    <div className={facultyList.length > 0 ? "col-span-4" : "col-span-6"}>
                      <p className="he-serif text-xl font-semibold text-[var(--he-text)]">{pt.byLevel}</p>
                      <ul className="mt-4 space-y-1">
                        {levelGroups.map((g) => (
                          <li key={g.key}>
                            <Link href={programmeHref(href("programmes"), { level: g.key })} className={`flex items-baseline justify-between gap-4 py-1.5 text-[15px] text-[var(--he-muted)] hover:text-[var(--he-accent)] ${FOCUS}`}>
                              <span>{g.label}</span>
                              <span className="text-sm tabular-nums" aria-label={`${g.programmes.length} ${pt.programmes}`}>{g.programmes.length}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className={`flex flex-col justify-end ${facultyList.length > 0 ? "col-span-3" : "col-span-6"}`}>
                      <div className="he-grad p-6 text-white" style={{ borderRadius: 3 }}>
                        <p className="he-serif text-2xl leading-snug">{pt.programmes}</p>
                        <p className="mt-2 text-sm text-[#e3e8f0]">{programmes.length} {pt.programmes.toLowerCase()}</p>
                        <Link href={href("programmes")} className={`mt-4 inline-block w-fit text-sm font-semibold text-[var(--he-brass)] underline underline-offset-4 ${FOCUS}`}>{pt.allProgrammes}</Link>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {flat.map((l) => (
              <Link key={l.section} href={href(l.section)} aria-current={active === l.section ? "page" : undefined} className={navLink(l.section)}>
                {l.label}
              </Link>
            ))}
            {school.enrollment_enabled ? (
              <Link
                href={href("enrollment")}
                className={`ml-4 bg-[var(--he-btn-bg)] px-5 py-2.5 text-sm font-semibold text-[var(--he-btn-fg)] transition-opacity hover:opacity-90 ${FOCUS}`}
                style={{ borderRadius: 2 }}
              >
                {t.applyNow}
              </Link>
            ) : null}
          </nav>

          <details className="group relative lg:hidden">
            <summary
              className={`flex h-11 cursor-pointer list-none items-center gap-2 border border-[var(--he-line)] px-3 text-sm font-medium text-[var(--he-text)] [&::-webkit-details-marker]:hidden ${FOCUS}`}
              style={{ borderRadius: 3 }}
            >
              <Menu className="h-5 w-5" aria-hidden />
              {t.menu}
            </summary>
            <nav
              aria-label={t.mainNav}
              className="absolute right-0 top-14 z-50 flex w-72 max-w-[calc(100vw-2rem)] flex-col border border-[var(--he-line)] bg-[var(--he-surface)] p-2 shadow-2xl"
            >
              {[
                { section: "" as SchoolSection, label: t.home },
                { section: "about" as SchoolSection, label: t.aboutMenu },
                ...(hasProgrammes ? [{ section: "programmes" as SchoolSection, label: pt.academics }] : []),
                ...flat,
                { section: "login" as SchoolSection, label: t.login },
              ].map((l) => (
                <Link key={l.section} href={href(l.section)} aria-current={active === l.section ? "page" : undefined} className={`px-3 py-3 text-[15px] text-[var(--he-text)] hover:bg-[var(--he-paper)] ${FOCUS}`}>
                  {l.label}
                </Link>
              ))}
              {school.enrollment_enabled ? (
                <Link href={href("enrollment")} className={`mt-1 bg-[var(--he-btn-bg)] px-3 py-3 text-center text-[15px] font-semibold text-[var(--he-btn-fg)] ${FOCUS}`}>
                  {t.applyNow}
                </Link>
              ) : null}
              <Link href={href(active, otherLang)} hrefLang={otherLang} lang={otherLang} className={`px-3 py-3 text-sm text-[var(--he-muted)] ${FOCUS}`}>
                {t.language}: {otherLang === "en" ? "English" : "Français"}
              </Link>
            </nav>
          </details>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        {children}
      </main>

      <footer className="bg-[#0a111c] text-[#c3cbd8]">
        <div className="mx-auto grid w-full max-w-7xl gap-12 px-4 py-16 sm:px-6 md:grid-cols-12 lg:px-10">
          <div className="md:col-span-5">
            <div className="flex items-center gap-3">
              <HigherLogo school={school} size={52} tone="dark" />
              <p className="he-serif text-2xl font-semibold text-white">{school.name}</p>
            </div>
            {motto ? <p className="he-serif mt-5 max-w-sm text-lg italic leading-relaxed text-[#e3e8f0]">&ldquo;{motto}&rdquo;</p> : null}
            {place ? <p className="mt-4 text-sm">{place}, Cameroon</p> : null}
          </div>

          <nav aria-label={t.quickLinks} className="md:col-span-3">
            <h2 className="he-serif text-lg font-semibold text-white">{t.quickLinks}</h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              {[
                { section: "" as SchoolSection, label: t.home },
                { section: "about" as SchoolSection, label: t.aboutMenu },
                ...(hasProgrammes ? [{ section: "programmes" as SchoolSection, label: pt.academics }] : []),
                ...flat,
                { section: "login" as SchoolSection, label: t.login },
                ...(school.enrollment_enabled ? [{ section: "enrollment" as SchoolSection, label: t.enrollment }] : []),
              ].map((l) => (
                <li key={l.section}>
                  <Link href={href(l.section)} className={`hover:text-white hover:underline underline-offset-4 ${FOCUS}`}>{l.label}</Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="md:col-span-4">
            <h2 className="he-serif text-lg font-semibold text-white">{t.contact}</h2>
            <ul className="mt-4 space-y-3 text-sm">
              {addressLine ? (
                <li className="flex items-start gap-2.5"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--he-brass)]" aria-hidden /><span>{addressLine}</span></li>
              ) : null}
              {school.phone ? (
                <li className="flex items-center gap-2.5"><Phone className="h-4 w-4 shrink-0 text-[var(--he-brass)]" aria-hidden /><a href={`tel:${school.phone.replace(/\s+/g, "")}`} className="hover:text-white hover:underline">{school.phone}</a></li>
              ) : null}
              {school.email ? (
                <li className="flex items-center gap-2.5"><Mail className="h-4 w-4 shrink-0 text-[var(--he-brass)]" aria-hidden /><a href={`mailto:${school.email}`} className="break-all hover:text-white hover:underline">{school.email}</a></li>
              ) : null}
              {!addressLine && !school.phone && !school.email ? <li className="text-[#9aa5b8]">{t.notShared}</li> : null}
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10">
          <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-[#aab4c4] sm:flex-row sm:px-6 lg:px-10">
            <p>&copy; {new Date().getFullYear()} {school.name}. {t.footerRights}</p>
            {school.enrollment_enabled ? (
              <p>
                {t.poweredBy}{" "}
                <a href="https://eduignite.online" rel="noopener" className="font-semibold text-[#e3e8f0] underline-offset-2 hover:underline">eduignite.online</a>
              </p>
            ) : null}
          </div>
        </div>
      </footer>
    </div>
  );
}

/** Inner-page header: a restrained ink band with serif title and breadcrumb. */
export function HigherPageBanner({ school, lang, title, preview, t }: { school: PublicSchool; lang: SchoolLang; title: string; preview?: string; t: SiteText }) {
  const banner = resolveMediaUrl(school.banner);
  return (
    <section className="relative isolate overflow-hidden he-grad">
      {banner ? <Image src={banner} alt="" fill unoptimized sizes="100vw" className="-z-10 object-cover opacity-25" /> : null}
      <div className="mx-auto w-full max-w-7xl px-4 pb-14 pt-16 sm:px-6 sm:pb-20 sm:pt-24 lg:px-10">
        <nav aria-label={t.breadcrumb} className="text-sm text-[#c3cbd8]">
          <Link href={schoolHref(school, "", lang, preview)} className="underline-offset-4 hover:text-white hover:underline">{t.home}</Link>
          <span aria-hidden> / </span>
          <span aria-current="page">{title}</span>
        </nav>
        <h1 className="he-serif mt-5 max-w-4xl text-4xl font-medium leading-[1.08] tracking-tight text-white sm:text-6xl">{title}</h1>
        <div className="mt-8 h-px w-24 bg-[var(--he-brass)]" aria-hidden />
      </div>
    </section>
  );
}
