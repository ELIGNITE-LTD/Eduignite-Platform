"use client";

import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import {
  ArrowRight, Award, BookOpen, Building2, ClipboardCheck, Coins, GraduationCap, Library, Receipt, UserRound, Users, Wallet,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/lib/auth-context";
import { formatXaf } from "@/lib/api/services/higher-ed.service";
import { useHigherMyFees, useHigherMyResults, useHigherOverview, useHigherResultOfferings } from "@/lib/hooks/useHigherEd";
import { HigherSetupChecklist } from "./higher-setup-checklist";
import { useChildPicker } from "./child-picker";
import { useHigherText } from "./higher-shared";

type Icon = ComponentType<{ className?: string }>;

function Hero({ greeting, title, chips }: { greeting: string; title: string; chips?: string[] }) {
  return (
    <header className="rounded-3xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6 sm:p-8">
      <p className="text-sm font-semibold text-muted-foreground">{greeting}</p>
      <h1 className="mt-1 font-headline text-2xl font-black tracking-tight text-primary sm:text-3xl">{title}</h1>
      {chips?.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {chips.map((c) => <span key={c} className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-primary shadow-sm">{c}</span>)}
        </div>
      ) : null}
    </header>
  );
}

function Stat({ icon: I, label, value, hint, tone }: { icon: Icon; label: string; value: string | number; hint?: string; tone: string }) {
  return (
    <Card className="rounded-3xl border-none shadow-sm transition-shadow hover:shadow-md">
      <CardContent className="flex flex-col gap-3 p-4 sm:p-5">
        <span className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl ${tone}`}><I className="h-5 w-5" /></span>
        <div>
          <p className="text-xl font-black tracking-tight sm:text-2xl">{value}</p>
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
          {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function Stats({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">{children}</div>;
}

function Action({ icon: I, title, text, href }: { icon: Icon; title: string; text: string; href: string }) {
  return (
    <Link href={href} className="group">
      <Card className="h-full rounded-3xl border-none shadow-sm transition-all group-hover:-translate-y-0.5 group-hover:shadow-md">
        <CardContent className="flex items-center gap-4 p-4 sm:p-5">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><I className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{title}</span>
            <span className="block text-sm text-muted-foreground">{text}</span>
          </span>
          <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
        </CardContent>
      </Card>
    </Link>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-6xl space-y-6">{children}</div>;
}

const num = (n: number | undefined) => (n ?? 0).toLocaleString("fr-FR").replace(/ | /g, " ");

/** What the student owes over ALL academic years (the latest year alone hides a balance left from an earlier one). */
function feeTotals(list: Array<{ billed: number; paid: number; balance: number }> | undefined) {
  if (!list || list.length === 0) return undefined;
  return list.reduce((t, r) => ({ billed: t.billed + r.billed, paid: t.paid + r.paid, balance: t.balance + r.balance }), { billed: 0, paid: 0, balance: 0 });
}

export function HigherAdminHome() {
  const tr = useHigherText();
  const { user } = useAuth();
  const { data, isLoading } = useHigherOverview();
  const institution = user?.school?.shortName || user?.school?.name || "";
  const setupDone = !!data && data.programmes > 0 && data.students > 0 && data.lecturers > 0 && data.course_units > 0;
  const f = data?.finance;
  const collectedPct = f && f.billed > 0 ? Math.round((f.collected / f.billed) * 100) : 0;
  const r = data?.results;
  const resultsTotal = (r?.submitted ?? 0) + (r?.published ?? 0);

  return (
    <Shell>
      <Hero greeting={tr("Institution overview", "Vue d'ensemble de l'établissement")} title={institution} chips={data?.academic_year ? [`${tr("Academic year", "Année académique")} ${data.academic_year}`] : []} />
      <Stats>
        <Stat icon={Users} label={tr("Students", "Étudiants")} value={isLoading ? "…" : num(data?.students)} tone="bg-sky-100 text-sky-700" />
        <Stat icon={GraduationCap} label={tr("Programmes", "Filières")} value={isLoading ? "…" : num(data?.programmes)} hint={`${num(data?.departments)} ${(data?.departments ?? 0) === 1 ? tr("department", "département") : tr("departments", "départements")}`} tone="bg-violet-100 text-violet-700" />
        <Stat icon={UserRound} label={tr("Lecturers", "Enseignants")} value={isLoading ? "…" : num(data?.lecturers)} tone="bg-emerald-100 text-emerald-700" />
        <Stat icon={Library} label={tr("Course units", "Unités d'enseignement")} value={isLoading ? "…" : num(data?.course_units)} tone="bg-amber-100 text-amber-700" />
      </Stats>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="rounded-3xl border-none shadow-sm lg:col-span-7">
          <CardHeader>
            <CardTitle className="text-lg">{tr("Students per programme", "Étudiants par filière")}</CardTitle>
            <CardDescription>{tr("Active students of the current academic year.", "Étudiants actifs de l'année académique en cours.")}</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {data && data.students_by_programme.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.students_by_programme} margin={{ left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="flex h-full items-center justify-center text-sm text-muted-foreground">{tr("No students admitted yet.", "Aucun étudiant admis pour l'instant.")}</p>}
          </CardContent>
        </Card>

        <div className="space-y-4 lg:col-span-5">
          <Card className="rounded-3xl border-none shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">{tr("Tuition collected", "Scolarité encaissée")}</CardTitle>
              <CardDescription>{f ? `${formatXaf(f.collected)} / ${formatXaf(f.billed)}` : tr("Set fees to start tracking.", "Fixez les frais pour suivre les paiements.")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Progress value={collectedPct} />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{collectedPct}%</span>
                <span>{f ? `${f.defaulters} ${tr("students still owe", "étudiants débiteurs")}` : ""}</span>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-3xl border-none shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">{tr("Results", "Résultats")}</CardTitle>
              <CardDescription>{tr("Continuous assessment and exam marks by status.", "Notes de contrôle continu et d'examen par statut.")}</CardDescription>
            </CardHeader>
            <CardContent>
              {resultsTotal === 0 ? <p className="text-sm text-muted-foreground">{tr("No marks entered yet.", "Aucune note saisie pour l'instant.")}</p> : (
                <div className="grid grid-cols-2 gap-2 text-center">
                  {([["submitted", tr("Ready to publish", "Prêts à publier")], ["published", tr("Published", "Publiés")]] as const).map(([k, label]) => (
                    <div key={k} className="rounded-2xl bg-muted/50 p-3"><p className="text-xl font-black">{r?.[k] ?? 0}</p><p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p></div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Action icon={Users} title={tr("Admit a student", "Admettre un étudiant")} text={tr("Create the account and enrol in a programme.", "Créer le compte et inscrire dans une filière.")} href="/dashboard/higher/students" />
        <Action icon={ClipboardCheck} title={tr("Results", "Résultats")} text={tr("Review CA and exam marks, publish to students.", "Vérifier CC et examens, publier aux étudiants.")} href="/dashboard/higher/results" />
        <Action icon={Coins} title={tr("Finance", "Finance")} text={tr("Fees, payments, receipts and balances.", "Frais, paiements, reçus et soldes.")} href="/dashboard/higher/finance" />
        <Action icon={Building2} title={tr("Departments and programmes", "Départements et filières")} text={tr("Faculties, degrees and levels.", "Facultés, diplômes et niveaux.")} href="/dashboard/higher/programmes" />
        <Action icon={BookOpen} title={tr("Course units", "Unités d'enseignement")} text={tr("Credits, curriculum and who teaches what.", "Crédits, maquette et enseignants.")} href="/dashboard/higher/course-units" />
        <Action icon={Users} title={tr("People on the website", "Personnes sur le site")} text={tr("Show the rector, lecturers and founders on your public site.", "Présentez le recteur, les enseignants et les fondateurs sur votre site.")} href="/dashboard/school-website?tab=leadership" />
        <Action icon={Award} title={tr("Grading", "Notation")} text={tr("GPA out of 4.0 or marks out of 20.", "GPA sur 4,0 ou notes sur 20.")} href="/dashboard/higher/grading" />
      </div>

      {!setupDone && !isLoading ? <HigherSetupChecklist /> : null}
    </Shell>
  );
}

export function HigherLecturerHome() {
  const tr = useHigherText();
  const { user } = useAuth();
  const { data = [], isLoading } = useHigherResultOfferings();
  const students = data.reduce((n, o) => n + o.enrolled, 0);
  const toEnter = data.reduce((n, o) => n + Math.max(o.enrolled - o.submitted - o.published, 0), 0);
  const published = data.reduce((n, o) => n + o.published, 0);
  return (
    <Shell>
      <Hero greeting={tr("Welcome", "Bienvenue")} title={user?.name || ""} chips={[user?.school?.shortName || user?.school?.name || ""].filter(Boolean)} />
      <Stats>
        <Stat icon={BookOpen} label={tr("My courses", "Mes cours")} value={isLoading ? "…" : data.length} tone="bg-sky-100 text-sky-700" />
        <Stat icon={Users} label={tr("Students taught", "Étudiants")} value={isLoading ? "…" : students} tone="bg-violet-100 text-violet-700" />
        <Stat icon={ClipboardCheck} label={tr("Marks to enter", "Notes à saisir")} value={isLoading ? "…" : toEnter} tone="bg-amber-100 text-amber-700" />
        <Stat icon={Award} label={tr("Published", "Publiés")} value={isLoading ? "…" : published} tone="bg-emerald-100 text-emerald-700" />
      </Stats>
      <Card className="rounded-3xl border-none shadow-sm">
        <CardHeader><CardTitle className="text-lg">{tr("Courses I teach", "Cours que j'enseigne")}</CardTitle><CardDescription>{tr("Enter continuous assessment (CA) and exam marks for each course.", "Saisissez le contrôle continu (CC) et l'examen de chaque cours.")}</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {data.length === 0 && !isLoading ? <p className="text-sm text-muted-foreground">{tr("No course is assigned to you yet.", "Aucun cours ne vous est encore attribué.")}</p> : null}
          {data.map((o) => (
            <Link key={o.id} href="/dashboard/higher/results" className="flex items-center justify-between rounded-2xl border p-3 text-sm transition-colors hover:bg-muted/50">
              <span><span className="font-semibold">{o.course_code}</span> <span className="text-muted-foreground">{o.course_title}</span><span className="block text-xs text-muted-foreground">{o.period_name} · {o.academic_year} · {o.credits} {tr("credits", "crédits")}</span></span>
              <span className="text-xs text-muted-foreground">{o.published}/{o.enrolled} {tr("published", "publiés")}</span>
            </Link>
          ))}
        </CardContent>
      </Card>
    </Shell>
  );
}

export function HigherStudentHome() {
  const tr = useHigherText();
  const { user } = useAuth();
  const results = useHigherMyResults();
  const fees = useHigherMyFees();
  const cum = results.data?.cumulative;
  const gpa = results.data?.scale === "gpa_4";
  const current = feeTotals(fees.data);
  return (
    <Shell>
      <Hero greeting={tr("Welcome", "Bienvenue")} title={user?.name || ""} chips={[user?.school?.shortName || user?.school?.name || ""].filter(Boolean)} />
      <Stats>
        <Stat icon={Award} label={gpa ? tr("Cumulative GPA", "GPA cumulé") : tr("Average", "Moyenne")} value={cum ? (gpa ? `${cum.gpa}` : `${cum.average}/20`) : "–"} hint={cum?.degree_class || cum?.mention || undefined} tone="bg-violet-100 text-violet-700" />
        <Stat icon={GraduationCap} label={tr("Credits earned", "Crédits validés")} value={cum ? `${cum.credits_earned}` : "–"} hint={cum ? `${tr("of", "sur")} ${cum.credits_attempted}` : undefined} tone="bg-sky-100 text-sky-700" />
        <Stat icon={Wallet} label={tr("Fees paid", "Frais payés")} value={current ? formatXaf(current.paid) : "–"} hint={current ? `${tr("of", "sur")} ${formatXaf(current.billed)}` : undefined} tone="bg-emerald-100 text-emerald-700" />
        <Stat icon={Receipt} label={tr("Balance", "Solde")} value={current ? formatXaf(current.balance) : "–"} tone="bg-amber-100 text-amber-700" />
      </Stats>
      <div className="grid gap-3 sm:grid-cols-2">
        <Action icon={BookOpen} title={tr("My courses", "Mes cours")} text={tr("The course units of your level.", "Les unités d'enseignement de votre niveau.")} href="/dashboard/higher/my-courses" />
        <Action icon={Award} title={tr("My results", "Mes résultats")} text={tr("CA, exam, grade and GPA by semester.", "CC, examen, note et GPA par semestre.")} href="/dashboard/higher/my-results" />
        <Action icon={Coins} title={tr("My fees", "Mes frais")} text={tr("What you owe, payments and receipts.", "Ce que vous devez, paiements et reçus.")} href="/dashboard/higher/my-fees" />
        <Action icon={UserRound} title={tr("Profile", "Profil")} text={tr("Your details and password.", "Vos informations et mot de passe.")} href="/dashboard/profile" />
      </div>
    </Shell>
  );
}

export function HigherBursarHome() {
  const tr = useHigherText();
  const { user } = useAuth();
  const { data, isLoading } = useHigherOverview();
  const f = data?.finance;
  const pct = f && f.billed > 0 ? Math.round((f.collected / f.billed) * 100) : 0;
  return (
    <Shell>
      <Hero greeting={tr("Finance office", "Service financier")} title={user?.school?.shortName || user?.school?.name || ""} chips={data?.academic_year ? [`${tr("Academic year", "Année académique")} ${data.academic_year}`] : []} />
      <Stats>
        <Stat icon={Wallet} label={tr("Expected", "Attendu")} value={isLoading || !f ? "–" : formatXaf(f.billed)} tone="bg-sky-100 text-sky-700" />
        <Stat icon={Coins} label={tr("Collected", "Encaissé")} value={isLoading || !f ? "–" : formatXaf(f.collected)} tone="bg-emerald-100 text-emerald-700" />
        <Stat icon={Receipt} label={tr("Outstanding", "Reste à payer")} value={isLoading || !f ? "–" : formatXaf(f.outstanding)} tone="bg-amber-100 text-amber-700" />
        <Stat icon={Users} label={tr("Students owing", "Étudiants débiteurs")} value={isLoading || !f ? "–" : f.defaulters} hint={f ? `${f.fully_paid} ${tr("fully paid", "soldés")}` : undefined} tone="bg-rose-100 text-rose-700" />
      </Stats>
      <Card className="rounded-3xl border-none shadow-sm"><CardContent className="space-y-2 p-5"><p className="text-sm font-semibold">{tr("Collection progress", "Progression des encaissements")}</p><Progress value={pct} /><p className="text-xs text-muted-foreground">{pct}%</p></CardContent></Card>
      <Action icon={Coins} title={tr("Open finance", "Ouvrir la finance")} text={tr("Set fees, record payments, print receipts.", "Fixer les frais, enregistrer les paiements, imprimer les reçus.")} href="/dashboard/higher/finance" />
    </Shell>
  );
}

export function HigherParentHome() {
  const tr = useHigherText();
  const { user } = useAuth();
  const { child, picker, hasChildren, ready } = useChildPicker();
  const results = useHigherMyResults(child);
  const fees = useHigherMyFees(child);
  const cum = results.data?.cumulative;
  const gpa = results.data?.scale === "gpa_4";
  const current = feeTotals(fees.data);
  return (
    <Shell>
      <Hero greeting={tr("Welcome", "Bienvenue")} title={user?.name || ""} chips={[user?.school?.shortName || user?.school?.name || ""].filter(Boolean)} />
      {picker ? <div>{picker}</div> : null}
      {ready && !hasChildren ? (
        <Card className="rounded-3xl border-none shadow-sm"><CardContent className="p-6 text-sm text-muted-foreground">{tr("No student is linked to your account at this institution yet. Ask the administration to link your child.", "Aucun étudiant n'est lié à votre compte dans cet établissement. Demandez à l'administration de lier votre enfant.")}</CardContent></Card>
      ) : (
        <>
          <Stats>
            <Stat icon={Award} label={gpa ? tr("Cumulative GPA", "GPA cumulé") : tr("Average", "Moyenne")} value={cum ? (gpa ? `${cum.gpa}` : `${cum.average}/20`) : "–"} hint={cum?.degree_class || cum?.mention || undefined} tone="bg-violet-100 text-violet-700" />
            <Stat icon={GraduationCap} label={tr("Credits earned", "Crédits validés")} value={cum ? `${cum.credits_earned}` : "–"} hint={cum ? `${tr("of", "sur")} ${cum.credits_attempted}` : undefined} tone="bg-sky-100 text-sky-700" />
            <Stat icon={Wallet} label={tr("Fees paid", "Frais payés")} value={current ? formatXaf(current.paid) : "–"} hint={current ? `${tr("of", "sur")} ${formatXaf(current.billed)}` : undefined} tone="bg-emerald-100 text-emerald-700" />
            <Stat icon={Receipt} label={tr("Balance", "Solde")} value={current ? formatXaf(current.balance) : "–"} tone="bg-amber-100 text-amber-700" />
          </Stats>
          <div className="grid gap-3 sm:grid-cols-2">
            <Action icon={BookOpen} title={tr("Courses", "Cours")} text={tr("Course units, lecturers and results.", "Unités d'enseignement, enseignants et résultats.")} href="/dashboard/higher/my-courses" />
            <Action icon={Award} title={tr("Results", "Résultats")} text={tr("CA, exam, grade and GPA by semester.", "CC, examen, note et GPA par semestre.")} href="/dashboard/higher/my-results" />
            <Action icon={Coins} title={tr("Fees", "Frais")} text={tr("What is owed, payments and receipts.", "Ce qui est dû, paiements et reçus.")} href="/dashboard/higher/my-fees" />
            <Action icon={UserRound} title={tr("Profile", "Profil")} text={tr("Your details and password.", "Vos informations et mot de passe.")} href="/dashboard/profile" />
          </div>
        </>
      )}
    </Shell>
  );
}
