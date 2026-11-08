"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowRight, Building2, ClipboardCheck, Coins, GraduationCap, KeyRound, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { getApiErrorMessage } from "@/lib/api/errors";
import { proprietorService, type OverviewSchool } from "@/lib/api/services/proprietor.service";
import { cn } from "@/lib/utils";
import {
  BillingChip,
  CategoryBadge,
  EmptyState,
  ErrorState,
  KpiSkeletonRow,
  KpiTile,
  CardGridSkeleton,
  RateBar,
  SchoolLogo,
  SchoolStatusChip,
  SectionTitle,
  categoryLabel,
  formatMoney,
  formatNumber,
  formatRate,
  useLocale,
  useTr,
} from "./common";

export const PROPRIETOR_OVERVIEW_KEY = ["proprietor", "overview"] as const;

export function ProprietorOverview() {
  const tr = useTr();
  const locale = useLocale();
  const { user } = useAuth();
  const [category, setCategory] = useState("");

  const query = useQuery({ queryKey: PROPRIETOR_OVERVIEW_KEY, queryFn: () => proprietorService.overview(), staleTime: 60_000 });
  const data = query.data;
  const schools = data?.schools ?? [];

  const categories = useMemo(() => [...new Set(schools.map((s) => s.education_category))], [schools]);
  const shown = category ? schools.filter((s) => s.education_category === category) : schools;
  const firstName = (user?.name || "").split(" ")[0];

  const alerts = useMemo(() => {
    const list: { key: string; text: string; href: string }[] = [];
    schools.forEach((s) => {
      if (s.platform_billing?.state === "unpaid")
        list.push({ key: `bill-${s.id}`, text: tr(`${s.name}: platform subscription is unpaid.`, `${s.name} : l'abonnement à la plateforme est impayé.`), href: `/dashboard/proprietor/schools?school=${encodeURIComponent(s.id)}&tab=finance` });
      if (s.status && s.status.toLowerCase() !== "active")
        list.push({ key: `status-${s.id}`, text: tr(`${s.name} is ${s.status}.`, `${s.name} est ${s.status}.`), href: `/dashboard/proprietor/schools?school=${encodeURIComponent(s.id)}` });
      if (s.admin_count === 0)
        list.push({ key: `admin-${s.id}`, text: tr(`${s.name} has no administrator account.`, `${s.name} n'a aucun compte administrateur.`), href: "/dashboard/proprietor/admins" });
    });
    return list;
  }, [schools, tr]);

  return (
    <div className="space-y-6 pb-16">
      <div className="rounded-3xl bg-primary p-5 text-white shadow-lg sm:p-7">
        <p className="text-[11px] font-black uppercase tracking-[0.25em] text-white/60">{tr("Proprietor", "Propriétaire")}</p>
        <h1 className="mt-1 font-headline text-2xl font-bold sm:text-3xl">
          {tr("Hello", "Bonjour")}{firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="mt-1 text-sm text-white/75">
          {data
            ? tr(`Here is how your ${data.totals.schools} school(s) are doing.`, `Voici l'état de vos ${data.totals.schools} école(s).`)
            : tr("Loading your schools...", "Chargement de vos écoles...")}
        </p>
      </div>

      {query.isLoading ? (
        <>
          <KpiSkeletonRow />
          <CardGridSkeleton count={3} />
        </>
      ) : query.isError ? (
        <ErrorState message={getApiErrorMessage(query.error, tr("Your overview could not be loaded.", "Votre vue d'ensemble n'a pas pu être chargée."))} onRetry={() => query.refetch()} retrying={query.isFetching} />
      ) : !data || schools.length === 0 ? (
        <EmptyState
          title={tr("No school linked yet", "Aucune école liée pour le moment")}
          text={tr("The EduIgnite team links your schools to your account. Once done, their figures appear here.", "L'équipe EduIgnite lie vos écoles à votre compte. Leurs chiffres apparaîtront ici.")}
        />
      ) : (
        <>
          <section aria-label={tr("Key figures", "Chiffres clés")} className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <KpiTile label={tr("Schools", "Écoles")} value={formatNumber(data.totals.schools, locale)} icon={<Building2 className="h-4 w-4" />} hint={tr(`${data.totals.classes} classes`, `${data.totals.classes} classes`)} />
            <KpiTile label={tr("Pupils", "Élèves")} value={formatNumber(data.totals.students, locale)} icon={<GraduationCap className="h-4 w-4" />} tone="sky" hint={tr(`${data.totals.students_female} girls, ${data.totals.students_male} boys`, `${data.totals.students_female} filles, ${data.totals.students_male} garçons`)} />
            <KpiTile label={tr("Staff", "Personnel")} value={formatNumber(data.totals.staff, locale)} icon={<Users className="h-4 w-4" />} tone="amber" />
            <KpiTile label={tr("Attendance today", "Présence du jour")} value={formatRate(data.totals.attendance_today.rate)} icon={<ClipboardCheck className="h-4 w-4" />} tone="green" hint={tr(`Week: ${formatRate(data.totals.attendance_week.rate)}`, `Semaine : ${formatRate(data.totals.attendance_week.rate)}`)} />
            <KpiTile
              label={tr("Fees collected", "Frais perçus")}
              value={formatRate(data.totals.fees.collection_rate)}
              icon={<Coins className="h-4 w-4" />}
              tone={data.totals.platform_billing.unpaid ? "red" : "green"}
              hint={tr(`${formatMoney(data.totals.fees.outstanding, "XAF", locale)} outstanding`, `${formatMoney(data.totals.fees.outstanding, "XAF", locale)} restants`)}
            />
          </section>

          {alerts.length > 0 && (
            <section aria-label={tr("Alerts", "Alertes")} className="space-y-2 rounded-2xl border border-amber-300 bg-amber-50 p-4">
              <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-amber-900">
                <AlertTriangle className="h-4 w-4" /> {tr("Needs your attention", "À surveiller")} ({alerts.length})
              </h2>
              <ul className="space-y-1.5">
                {alerts.map((alert) => (
                  <li key={alert.key}>
                    <Link href={alert.href} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-700">
                      <span>{alert.text}</span>
                      <ArrowRight className="h-4 w-4 shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="space-y-4">
            <SectionTitle
              title={tr("Schools compared", "Comparaison des écoles")}
              subtitle={tr("Pupils, attendance and fee collection side by side.", "Élèves, présence et recouvrement des frais côte à côte.")}
              action={
                categories.length > 1 ? (
                  <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label={tr("Filter by school type", "Filtrer par type d'école")}>
                    <Button type="button" size="sm" variant={category === "" ? "default" : "outline"} aria-pressed={category === ""} className="h-9 shrink-0 rounded-full text-xs font-bold" onClick={() => setCategory("")}>
                      {tr("All", "Toutes")}
                    </Button>
                    {categories.map((c) => (
                      <Button key={c} type="button" size="sm" variant={category === c ? "default" : "outline"} aria-pressed={category === c} className="h-9 shrink-0 rounded-full text-xs font-bold" onClick={() => setCategory(category === c ? "" : c)}>
                        {categoryLabel(c, tr)}
                      </Button>
                    ))}
                  </div>
                ) : null
              }
            />

            {shown.length > 1 && (
              <div className="rounded-2xl border bg-white p-4 shadow-sm">
                <p className="mb-2 text-[11px] font-black uppercase tracking-widest text-muted-foreground">{tr("Pupils per school", "Élèves par école")}</p>
                <div className="h-56 w-full" role="img" aria-label={tr("Bar chart of pupils per school", "Histogramme des élèves par école")}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={shown.map((s) => ({ name: s.short_name || s.name, students: s.students }))} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.08)" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip formatter={(value: number) => [formatNumber(value, locale), tr("Pupils", "Élèves")]} />
                      <Bar dataKey="students" fill="#264D73" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {shown.map((school) => (
                <li key={school.id}>
                  <SchoolCompareCard school={school} />
                </li>
              ))}
            </ul>
          </section>

          <div className="flex justify-end">
            <Button asChild variant="outline" className="gap-2 rounded-xl">
              <Link href="/dashboard/proprietor/admins"><KeyRound className="h-4 w-4" /> {tr("Manage admin accounts", "Gérer les comptes administrateurs")}</Link>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export function SchoolCompareCard({ school }: { school: OverviewSchool }) {
  const tr = useTr();
  const locale = useLocale();
  return (
    <Link
      href={`/dashboard/proprietor/schools?school=${encodeURIComponent(school.id)}`}
      className={cn("block h-full rounded-3xl border bg-white p-4 shadow-sm transition hover:border-primary/40 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary")}
    >
      <div className="flex items-start gap-3">
        <SchoolLogo name={school.name} logo={school.logo} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-black text-primary">{school.name}</p>
          <p className="truncate text-xs text-muted-foreground">{school.location}</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <CategoryBadge category={school.education_category} />
            <SchoolStatusChip status={school.status} />
          </div>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[
          [tr("Pupils", "Élèves"), school.students],
          [tr("Staff", "Personnel"), school.staff],
          [tr("Classes", "Classes"), school.classes],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl bg-accent/30 py-2">
            <dd className="text-lg font-black text-primary">{formatNumber(Number(value), locale)}</dd>
            <dt className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</dt>
          </div>
        ))}
      </dl>
      <div className="mt-4 space-y-2.5">
        <RateBar rate={school.attendance_today.rate} label={tr("Attendance today", "Présence du jour")} />
        <RateBar rate={school.attendance_week.rate} label={tr("Attendance this week", "Présence de la semaine")} />
        <RateBar rate={school.fees.collection_rate} label={tr("Fees collected", "Frais perçus")} />
      </div>
      <div className="mt-4 flex items-center justify-between">
        <BillingChip billing={school.platform_billing} />
        <span className="flex items-center gap-1 text-xs font-bold text-primary">{tr("Details", "Détails")} <ArrowRight className="h-3.5 w-3.5" /></span>
      </div>
    </Link>
  );
}
