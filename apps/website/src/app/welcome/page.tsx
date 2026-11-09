"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Building2, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { Button } from "@/components/ui/button";
import { LoadingScreen } from "@/components/layout/loading-screen";
import { useSchool } from "@/lib/hooks/useSchools";
import { useEducationCategory } from "@/lib/hooks/useEducationCategory";
import { roleLabel } from "@/lib/role-labels";

type Lang = "en" | "fr";

const COPY = {
  welcomeBack: { en: "Welcome back", fr: "Bon retour" },
  enter: { en: "Enter dashboard", fr: "Accéder au tableau de bord" },
  noSchoolTitle: { en: "We could not load your school", fr: "Impossible de charger votre école" },
  noSchoolBody: {
    en: "Your session may have expired. Sign in again to continue.",
    fr: "Votre session a peut-être expiré. Reconnectez-vous pour continuer.",
  },
  backToLogin: { en: "Back to sign in", fr: "Retour à la connexion" },
  powered: { en: "Powered by EduIgnite", fr: "Propulsé par EduIgnite" },
} satisfies Record<string, Record<Lang, string>>;

const SERIF = "font-[Georgia,Cambria,'Times_New_Roman',serif]";

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "S";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

export default function SchoolWelcomePage() {
  const { user, isAuthenticated, isLoading: isAuthLoading, schools } = useAuth();
  const { language } = useI18n();
  const router = useRouter();
  const lang: Lang = language === "fr" ? "fr" : "en";
  const category = useEducationCategory();

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isAuthLoading, router]);

  const resolvedSchool =
    user?.school ||
    (user?.schoolId ? schools.find((s) => s.id === user?.schoolId) : null) ||
    schools[0];

  const { data: detail } = useSchool((resolvedSchool?.id as string | undefined) || "");

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
          <h1 className={`${SERIF} text-2xl font-semibold`}>{COPY.noSchoolTitle[lang]}</h1>
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
  const phone: string = (school.phone || d.phone || "").trim();
  const email: string = (school.email || d.email || "").trim();
  const myRole = roleLabel(user.role, category, lang);

  const linkClass =
    "rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70";

  return (
    <div className="relative isolate flex min-h-screen flex-col overflow-hidden bg-[#1B3A57] text-white">
      <style>{`
        @keyframes ei-welcome-fade { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        .ei-welcome-fade { animation: ei-welcome-fade 800ms cubic-bezier(.2,.7,.2,1) both; }
        @media (prefers-reduced-motion: reduce) { .ei-welcome-fade { animation: none; } }
      `}</style>

      {banner ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={banner} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover" />
      ) : (
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-20"
          style={{
            backgroundImage:
              "radial-gradient(circle at 80% 8%, rgba(103,208,228,.22), transparent 45%), linear-gradient(165deg, #1B3A57 0%, #264D73 65%, #2F6393 100%)",
          }}
        />
      )}
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[#0F2338]/60" />

      <main className="ei-welcome-fade flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-white p-2 shadow-xl sm:h-24 sm:w-24">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={`${name} logo`} className="h-full w-full object-contain" />
          ) : (
            <span
              role="img"
              aria-label={name}
              className={`${SERIF} flex h-full w-full items-center justify-center rounded-xl bg-[#264D73] text-2xl font-semibold text-white sm:text-3xl`}
            >
              {initialsOf(name)}
            </span>
          )}
        </div>

        <h1
          className={`${SERIF} mt-8 max-w-3xl text-balance text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl md:text-6xl`}
        >
          {name}
        </h1>
        {motto && <p className={`${SERIF} mt-4 max-w-xl text-lg italic text-white/85 sm:text-xl`}>{motto}</p>}

        <p className="mt-12 text-lg text-white sm:text-xl">
          {COPY.welcomeBack[lang]}, {firstNameOf(user.name)}
          <span className="text-white/75"> · {myRole}</span>
        </p>

        <Button
          asChild
          size="lg"
          className="mt-6 h-14 gap-3 bg-white px-10 text-base font-semibold text-[#1B3A57] hover:bg-white/90 focus-visible:ring-white"
        >
          <Link href="/dashboard">
            {COPY.enter[lang]}
            <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </Link>
        </Button>

        {(phone || email) && (
          <p className="mt-10 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-sm text-white/80">
            {phone && (
              <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className={linkClass}>
                {phone}
              </a>
            )}
            {email && (
              <a href={`mailto:${email}`} className={linkClass}>
                {email}
              </a>
            )}
          </p>
        )}
      </main>

      <footer className="pb-6 text-center text-xs text-white/60">{COPY.powered[lang]}</footer>
    </div>
  );
}
