"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  ExternalLink,
  Globe,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { SITE_URL } from "@/lib/public-origin";
import { useI18n } from "@/lib/i18n-context";
import { Button } from "@/components/ui/button";
import { LoadingScreen } from "@/components/layout/loading-screen";
import { useSchool } from "@/lib/hooks/useSchools";
import { useMySiteStatus } from "@/lib/hooks/usePublicSite";
import { useEducationCategory } from "@/lib/hooks/useEducationCategory";
import { roleLabel, schoolAdminLabel } from "@/lib/role-labels";
import { getEducationTerms } from "@/lib/education-terms";

type Lang = "en" | "fr";

const BASE_COPY = {
  welcomeBack: { en: "Welcome back", fr: "Bon retour" },
  signedInAs: { en: "You are signed in as", fr: "Vous êtes connecté en tant que" },
  enter: { en: "Enter dashboard", fr: "Accéder au tableau de bord" },
  about: { en: "About the school", fr: "À propos de l'école" },
  aboutEmptyAdmin: {
    en: "Your school has not written its introduction yet. Add a short description so families know who you are.",
    fr: "Votre école n'a pas encore rédigé sa présentation. Ajoutez une courte description pour vous faire connaître des familles.",
  },
  aboutEmptyAction: { en: "Add a description", fr: "Ajouter une description" },
  contact: { en: "Find us", fr: "Nous trouver" },
  website: { en: "School website", fr: "Site de l'école" },
  visitWebsite: { en: "Visit the school website", fr: "Visiter le site de l'école" },
  headOf: { en: "Head of school", fr: "Direction de l'école" },
  figures: { en: "The school in numbers", fr: "L'école en chiffres" },
  teachers: { en: "Teachers", fr: "Enseignants" },
  quick: { en: "Go straight to", fr: "Accès rapide" },
  noSchoolTitle: { en: "We could not load your school", fr: "Impossible de charger votre école" },
  noSchoolBody: {
    en: "Your session may have expired. Sign in again to continue.",
    fr: "Votre session a peut-être expiré. Reconnectez-vous pour continuer.",
  },
  backToLogin: { en: "Back to sign in", fr: "Retour à la connexion" },
  powered: { en: "Powered by EduIgnite", fr: "Propulsé par EduIgnite" },
  skip: { en: "Skip to content", fr: "Aller au contenu" },
} satisfies Record<string, Record<Lang, string>>;

/** Wording for higher-education institutions: no school, class or head-of-school. */
const HIGHER_COPY: Partial<Record<keyof typeof BASE_COPY, Record<Lang, string>>> = {
  about: { en: "About the institution", fr: "À propos de l'établissement" },
  aboutEmptyAdmin: {
    en: "Your institution has not written its introduction yet. Add a short description so students know who you are.",
    fr: "Votre établissement n'a pas encore rédigé sa présentation. Ajoutez une courte description pour vous faire connaître des étudiants.",
  },
  website: { en: "Institution website", fr: "Site de l'établissement" },
  visitWebsite: { en: "Visit the institution website", fr: "Visiter le site de l'établissement" },
  headOf: { en: "Head of institution", fr: "Direction de l'établissement" },
  figures: { en: "The institution in numbers", fr: "L'établissement en chiffres" },
  teachers: { en: "Lecturers", fr: "Enseignants" },
  noSchoolTitle: { en: "We could not load your institution", fr: "Impossible de charger votre établissement" },
};

type Shortcut = { href: string; label: Record<Lang, string> };

/** Shortcuts are convenience only; the backend still decides what each role may open. */
function shortcutsFor(role: string, learnersLabel: Record<Lang, string>, higher = false): Shortcut[] {
  if (higher) {
    switch (role) {
      case "SCHOOL_ADMIN":
      case "SUB_ADMIN":
        return [
          { href: "/dashboard/higher/programmes", label: { en: "Programmes", fr: "Filières" } },
          { href: "/dashboard/higher/students", label: learnersLabel },
          { href: "/dashboard/higher/lecturers", label: { en: "Lecturers", fr: "Enseignants" } },
        ];
      case "TEACHER":
        return [{ href: "/dashboard/higher/course-units", label: { en: "Course units", fr: "Unités d'enseignement" } }];
      case "STUDENT":
        return [
          { href: "/dashboard/higher/my-courses", label: { en: "My courses", fr: "Mes cours" } },
          { href: "/dashboard/higher/my-results", label: { en: "My results", fr: "Mes résultats" } },
        ];
      case "BURSAR":
        return [{ href: "/dashboard/fees", label: { en: "Fees", fr: "Frais" } }];
      case "PARENT":
        return [{ href: "/dashboard/fees", label: { en: "Fees", fr: "Frais" } }];
      default:
        return [];
    }
  }
  switch (role) {
    case "SCHOOL_ADMIN":
    case "SUB_ADMIN":
      return [
        { href: "/dashboard/hierarchy", label: { en: "Classes and sections", fr: "Classes et sections" } },
        { href: "/dashboard/students", label: learnersLabel },
        { href: "/dashboard/staff", label: { en: "Staff", fr: "Personnel" } },
      ];
    case "TEACHER":
      return [
        { href: "/dashboard/my-class", label: { en: "My class", fr: "Ma classe" } },
        { href: "/dashboard/attendance", label: { en: "Attendance", fr: "Présences" } },
      ];
    case "PARENT":
      return [
        { href: "/dashboard/children", label: { en: "My children", fr: "Mes enfants" } },
        { href: "/dashboard/fees", label: { en: "Fees", fr: "Frais de scolarité" } },
      ];
    case "STUDENT":
      return [
        { href: "/dashboard/grades", label: { en: "My grades", fr: "Mes notes" } },
        { href: "/dashboard/schedule", label: { en: "Timetable", fr: "Emploi du temps" } },
      ];
    case "BURSAR":
      return [{ href: "/dashboard/fees", label: { en: "Fees", fr: "Frais de scolarité" } }];
    case "LIBRARIAN":
      return [{ href: "/dashboard/library", label: { en: "Library", fr: "Bibliothèque" } }];
    default:
      return [];
  }
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "S";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

function numberOrNull(...values: unknown[]): number | null {
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  }
  return null;
}

export default function SchoolWelcomePage() {
  const { user, isAuthenticated, isLoading: isAuthLoading, schools } = useAuth();
  const { t, language } = useI18n();
  const router = useRouter();
  const lang: Lang = language === "fr" ? "fr" : "en";
  const category = useEducationCategory();
  const terms = getEducationTerms(category);
  const COPY = category === "higher" ? ({ ...BASE_COPY, ...HIGHER_COPY } as typeof BASE_COPY) : BASE_COPY;

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isAuthLoading, router]);

  const resolvedSchool =
    user?.school ||
    (user?.schoolId ? schools.find((s) => s.id === user?.schoolId) : null) ||
    schools[0];

  const schoolId = (resolvedSchool?.id as string | undefined) || "";
  const { data: detail } = useSchool(schoolId);
  const { data: site } = useMySiteStatus(!!user && !!schoolId);

  if (isAuthLoading) {
    return <LoadingScreen />;
  }

  if (!user || !resolvedSchool) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-8 text-center">
        <div className="rounded-full border-2 border-dashed border-border p-6">
          <Building2 className="h-14 w-14 text-muted-foreground" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h1 className="font-[Georgia,Cambria,'Times_New_Roman',serif] text-2xl font-semibold">
            {COPY.noSchoolTitle[lang]}
          </h1>
          <p className="mx-auto max-w-md text-muted-foreground">{COPY.noSchoolBody[lang]}</p>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => router.push("/login")}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> {COPY.backToLogin[lang]}
        </Button>
      </main>
    );
  }

  const school = resolvedSchool as unknown as Record<string, any>;
  const d = (detail ?? {}) as unknown as Record<string, any>;
  const name: string = school.name || d.name || "";
  const logo: string | null = (school.logo || d.logo || "").trim() || null;
  const banner: string | null = (school.banner || d.banner || "").trim() || null;
  const motto: string = (school.motto || d.motto || "").trim();
  const description: string = (school.description || d.description || "").trim();
  const address: string = [school.address || d.address, school.location || d.location]
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean)
    .join(", ");
  const phone: string = (school.phone || d.phone || "").trim();
  const email: string = (school.email || d.email || "").trim();
  const headName: string = (school.principal || d.principal || "").trim();

  const headTitle = schoolAdminLabel(category, lang);
  const myRole = roleLabel(user.role, category, lang);
  const learnersLabel: Record<Lang, string> =
    category === "basic"
      ? { en: terms.learners, fr: "Élèves" }
      : { en: terms.learners, fr: "Étudiants" };

  const slug = site?.is_live && site.slug ? site.slug : null;
  const websiteHref = slug ? `${SITE_URL}/schools/${slug}` : null;

  const pupils = numberOrNull(d.studentCount, d.student_count, school.studentCount, school.student_count);
  const teachers = numberOrNull(d.teacherCount, d.teacher_count, school.teacherCount, school.teacher_count);
  const figures = [
    pupils ? { value: pupils, label: learnersLabel[lang] } : null,
    teachers ? { value: teachers, label: COPY.teachers[lang] } : null,
  ].filter(Boolean) as { value: number; label: string }[];

  const isAdmin = user.role === "SCHOOL_ADMIN" || user.role === "SUB_ADMIN";
  const shortcuts = shortcutsFor(user.role, learnersLabel, category === "higher");

  const contacts: { icon: ReactNode; label: string; value: string; href?: string; external?: boolean }[] = [];
  if (address) contacts.push({ icon: <MapPin className="h-4 w-4" />, label: t("address"), value: address });
  if (phone) contacts.push({ icon: <Phone className="h-4 w-4" />, label: t("phone"), value: phone, href: `tel:${phone.replace(/[^\d+]/g, "")}` });
  if (email) contacts.push({ icon: <Mail className="h-4 w-4" />, label: t("email"), value: email, href: `mailto:${email}` });
  if (websiteHref) contacts.push({ icon: <Globe className="h-4 w-4" />, label: COPY.website[lang], value: `eduignite.online/schools/${slug}`, href: websiteHref });

  const serif = "font-[Georgia,Cambria,'Times_New_Roman',serif]";
  const hasSideColumn = !!headName || contacts.length > 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <style>{`
        @keyframes ei-welcome-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        .ei-welcome-rise { animation: ei-welcome-rise 700ms cubic-bezier(.2,.7,.2,1) both; }
        .ei-welcome-rise-2 { animation-delay: 120ms; }
        @media (prefers-reduced-motion: reduce) { .ei-welcome-rise { animation: none; } }
      `}</style>
      <a
        href="#welcome-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:shadow-lg"
      >
        {COPY.skip[lang]}
      </a>

      {/* Hero */}
      <header className="relative isolate overflow-hidden bg-[#1B3A57] text-white">
        {banner ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={banner} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover" />
        ) : (
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-20"
            style={{
              backgroundImage:
                "radial-gradient(circle at 85% 10%, rgba(103,208,228,.28), transparent 45%), repeating-linear-gradient(135deg, rgba(255,255,255,.04) 0 2px, transparent 2px 22px), linear-gradient(160deg, #1B3A57 0%, #264D73 60%, #2F6393 100%)",
            }}
          />
        )}
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-gradient-to-t from-[#0F2338]/90 via-[#0F2338]/45 to-[#0F2338]/20"
        />

        <div className="mx-auto flex min-h-[26rem] max-w-5xl flex-col justify-end px-5 pb-24 pt-16 sm:min-h-[32rem] sm:px-8 md:pb-28">
          <div className="ei-welcome-rise flex flex-col items-start gap-6">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-white p-2 shadow-xl ring-1 ring-black/10 sm:h-24 sm:w-24">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt={`${name} logo`} className="h-full w-full object-contain" />
              ) : (
                <span
                  aria-label={name}
                  className={`${serif} flex h-full w-full items-center justify-center rounded-xl bg-[#264D73] text-2xl font-semibold text-white sm:text-3xl`}
                >
                  {initialsOf(name)}
                </span>
              )}
            </div>
            <div className="space-y-3">
              <h1
                className={`${serif} max-w-3xl text-balance text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl md:text-6xl`}
              >
                {name}
              </h1>
              {motto && (
                <p className={`${serif} max-w-2xl text-lg italic text-white/85 sm:text-xl`}>
                  {motto}
                </p>
              )}
            </div>
          </div>
        </div>
      </header>

      <main id="welcome-content" className="mx-auto max-w-5xl px-5 sm:px-8">
        {/* Welcome panel overlapping the hero */}
        <section
          aria-labelledby="welcome-heading"
          className="ei-welcome-rise ei-welcome-rise-2 relative -mt-16 rounded-2xl border bg-card p-6 text-card-foreground shadow-xl sm:p-8 md:-mt-20"
        >
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <h2 id="welcome-heading" className={`${serif} text-2xl font-semibold sm:text-3xl`}>
                {COPY.welcomeBack[lang]}, {firstNameOf(user.name)}
              </h2>
              <p className="mt-1 text-muted-foreground">
                {COPY.signedInAs[lang]} <span className="font-medium text-foreground">{myRole}</span>
              </p>
            </div>
            <Button asChild size="lg" className="h-14 w-full gap-3 px-8 text-base md:w-auto">
              <Link href="/dashboard">
                {COPY.enter[lang]}
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </Link>
            </Button>
          </div>

          {shortcuts.length > 0 && (
            <nav aria-label={COPY.quick[lang]} className="mt-6 flex flex-wrap items-center gap-2 border-t pt-5">
              <span className="mr-1 text-sm text-muted-foreground">{COPY.quick[lang]}</span>
              {shortcuts.map((s) => (
                <Link
                  key={s.href}
                  href={s.href}
                  className="rounded-full border px-4 py-1.5 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {s.label[lang]}
                </Link>
              ))}
            </nav>
          )}
        </section>

        {/* About + side column */}
        <div className={`mt-14 grid gap-12 ${hasSideColumn ? "lg:grid-cols-[minmax(0,1fr)_20rem]" : ""}`}>
          <section aria-labelledby="about-heading">
            <h2 id="about-heading" className={`${serif} text-2xl font-semibold sm:text-3xl`}>
              {COPY.about[lang]}
            </h2>
            <div className="mt-2 h-px w-16 bg-secondary" aria-hidden="true" />
            {description ? (
              <p className={`${serif} mt-6 max-w-[65ch] whitespace-pre-line text-lg leading-[1.8] text-foreground/85`}>
                {description}
              </p>
            ) : isAdmin ? (
              <div className="mt-6 max-w-[65ch] rounded-xl border border-dashed p-5">
                <p className="text-muted-foreground">{COPY.aboutEmptyAdmin[lang]}</p>
                <Link
                  href="/dashboard/school-website"
                  className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {COPY.aboutEmptyAction[lang]} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            ) : null}

            {websiteHref && (
              <Button asChild variant="outline" className="mt-8 gap-2">
                <Link href={websiteHref} target="_blank" rel="noopener">
                  {COPY.visitWebsite[lang]} <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            )}
          </section>

          {hasSideColumn && (
            <aside className="space-y-10">
              {headName && (
                <section aria-labelledby="head-heading" className="flex items-center gap-4">
                  <span
                    aria-hidden="true"
                    className={`${serif} flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#264D73] text-xl font-semibold text-white`}
                  >
                    {initialsOf(headName)}
                  </span>
                  <div className="min-w-0">
                    <h2 id="head-heading" className="text-sm text-muted-foreground">
                      {headTitle}
                    </h2>
                    <p className={`${serif} text-xl font-semibold leading-snug`}>{headName}</p>
                  </div>
                </section>
              )}

              {contacts.length > 0 && (
                <section aria-labelledby="contact-heading">
                  <h2 id="contact-heading" className={`${serif} text-xl font-semibold`}>
                    {COPY.contact[lang]}
                  </h2>
                  <ul className="mt-3 divide-y border-y">
                    {contacts.map((c) => {
                      const body = (
                        <>
                          <span className="mt-0.5 text-primary" aria-hidden="true">{c.icon}</span>
                          <span className="min-w-0">
                            <span className="block text-xs text-muted-foreground">{c.label}</span>
                            <span className="block break-words font-medium">{c.value}</span>
                          </span>
                        </>
                      );
                      return (
                        <li key={c.label}>
                          {c.href ? (
                            <a
                              href={c.href}
                              className="flex items-start gap-3 py-3 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {body}
                            </a>
                          ) : (
                            <div className="flex items-start gap-3 py-3">{body}</div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}
            </aside>
          )}
        </div>

        {figures.length > 0 && (
          <section aria-label={COPY.figures[lang]} className="mt-14 grid grid-cols-2 border-y py-8 text-center">
            {figures.map((f, i) => (
              <div key={f.label} className={i > 0 ? "border-l" : ""}>
                <p className={`${serif} text-4xl font-semibold text-primary`}>{f.value.toLocaleString(lang)}</p>
                <p className="mt-1 text-sm text-muted-foreground">{f.label}</p>
              </div>
            ))}
          </section>
        )}
      </main>

      <footer className="mx-auto mt-16 max-w-5xl px-5 pb-10 text-center text-xs text-muted-foreground sm:px-8">
        {COPY.powered[lang]}
      </footer>
    </div>
  );
}
