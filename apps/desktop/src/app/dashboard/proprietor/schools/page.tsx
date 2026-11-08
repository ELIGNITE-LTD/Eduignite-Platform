"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowLeft, Building2, MapPin, Megaphone } from "lucide-react";

import { AdminList } from "@/components/proprietor/admin-list";
import {
  BillingChip,
  CardGridSkeleton,
  CategoryBadge,
  EmptyState,
  ErrorState,
  KpiTile,
  PageHeader,
  RateBar,
  SchoolStatusChip,
  SoftBadge,
  formatDate,
  formatMoney,
  formatNumber,
  formatRate,
  useLocale,
  useTr,
  SchoolLogo,
} from "@/components/proprietor/common";
import { PROPRIETOR_OVERVIEW_KEY, SchoolCompareCard } from "@/components/proprietor/overview";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getApiErrorMessage } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth-context";
import { proprietorService, type SchoolDetail } from "@/lib/api/services/proprietor.service";
import { roleTitle } from "@/lib/role-info";

export default function ProprietorSchoolsPage() {
  return (
    <Suspense fallback={<CardGridSkeleton count={3} />}>
      <Content />
    </Suspense>
  );
}

function Content() {
  const { user } = useAuth();
  const params = useSearchParams();
  const schoolId = params.get("school");
  if (user?.role !== "PROPRIETOR") return null;
  return schoolId ? <Detail schoolId={schoolId} initialTab={params.get("tab") || "summary"} /> : <List />;
}

function List() {
  const tr = useTr();
  const query = useQuery({ queryKey: PROPRIETOR_OVERVIEW_KEY, queryFn: () => proprietorService.overview(), staleTime: 60_000 });
  const schools = query.data?.schools ?? [];
  return (
    <div className="space-y-6 pb-16">
      <PageHeader title={tr("My schools", "Mes écoles")} subtitle={tr("Open a school to see its pupils, staff, attendance, marks and finances.", "Ouvrez une école pour voir ses élèves, son personnel, ses présences, ses notes et ses finances.")} icon={<Building2 className="h-6 w-6" />} />
      {query.isLoading ? (
        <CardGridSkeleton />
      ) : query.isError ? (
        <ErrorState message={getApiErrorMessage(query.error)} onRetry={() => query.refetch()} retrying={query.isFetching} />
      ) : schools.length === 0 ? (
        <EmptyState title={tr("No school linked yet", "Aucune école liée pour le moment")} text={tr("The EduIgnite team links your schools to your account.", "L'équipe EduIgnite lie vos écoles à votre compte.")} />
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {schools.map((s) => (
            <li key={s.id}><SchoolCompareCard school={s} /></li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Detail({ schoolId, initialTab }: { schoolId: string; initialTab: string }) {
  const tr = useTr();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState(initialTab);
  const query = useQuery({ queryKey: ["proprietor", "school", schoolId], queryFn: () => proprietorService.school(schoolId), staleTime: 60_000 });
  const d = query.data;

  const back = (
    <Link href="/dashboard/proprietor/schools" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline">
      <ArrowLeft className="h-4 w-4" /> {tr("All my schools", "Toutes mes écoles")}
    </Link>
  );

  if (query.isLoading) {
    return (
      <div className="space-y-4 pb-16" aria-busy="true">
        {back}
        <Skeleton className="h-28 rounded-3xl" />
        <Skeleton className="h-64 rounded-3xl" />
      </div>
    );
  }
  if (query.isError || !d) {
    const notFound = (query.error as any)?.response?.status === 404;
    return (
      <div className="space-y-4 pb-16">
        {back}
        <ErrorState
          message={notFound ? tr("This school is not linked to your account.", "Cette école n'est pas liée à votre compte.") : getApiErrorMessage(query.error)}
          onRetry={notFound ? () => router.replace("/dashboard/proprietor/schools") : () => query.refetch()}
          retrying={query.isFetching}
        />
      </div>
    );
  }

  const admins = d.admins.map((a) => ({ ...a, schoolId: d.school.id, schoolName: d.school.name }));

  return (
    <div className="space-y-6 pb-16">
      {back}
      <div className="flex flex-col gap-4 rounded-3xl border bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:p-5">
        <SchoolLogo name={d.school.name} logo={d.school.logo} className="h-16 w-16" />
        <div className="min-w-0 flex-1">
          <h1 className="font-headline text-xl font-bold text-primary sm:text-2xl">{d.school.name}</h1>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" /> {[d.school.location, d.school.division, d.school.region].filter(Boolean).join(", ") || "-"}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <CategoryBadge category={d.school.education_category} />
            {d.school.school_type ? <SoftBadge>{d.school.school_type}</SoftBadge> : null}
            {d.school.subsystem ? <SoftBadge>{d.school.subsystem}</SoftBadge> : null}
            <SchoolStatusChip status={d.school.status} />
            <BillingChip billing={d.platform_billing} />
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <div className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
          <TabsList className="h-auto w-max min-w-full justify-start gap-1 p-1">
            {[
              ["summary", tr("Summary", "Résumé")],
              ["pupils", tr("Pupils & classes", "Élèves & classes")],
              ["staff", tr("Staff", "Personnel")],
              ["attendance", tr("Attendance", "Présence")],
              ["academic", tr("Academic", "Académique")],
              ["finance", tr("Finance", "Finances")],
              ["admins", tr("Admin accounts", "Comptes admin")],
            ].map(([value, label]) => (
              <TabsTrigger key={value} value={value} className="shrink-0 px-3 py-2 text-xs font-bold">{label}</TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="summary" className="space-y-5"><Summary d={d} /></TabsContent>
        <TabsContent value="pupils"><Pupils d={d} /></TabsContent>
        <TabsContent value="staff"><Staff d={d} /></TabsContent>
        <TabsContent value="attendance"><Attendance d={d} /></TabsContent>
        <TabsContent value="academic"><Academic d={d} /></TabsContent>
        <TabsContent value="finance"><Finance d={d} /></TabsContent>
        <TabsContent value="admins">
          <AdminList rows={admins} onChanged={() => queryClient.invalidateQueries({ queryKey: ["proprietor"] })} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
      <h2 className="mb-3 text-[11px] font-black uppercase tracking-widest text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Summary({ d }: { d: SchoolDetail }) {
  const tr = useTr();
  const locale = useLocale();
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label={tr("Pupils", "Élèves")} value={formatNumber(d.students.total, locale)} />
        <KpiTile label={tr("Staff", "Personnel")} value={formatNumber(d.staff.total, locale)} tone="amber" />
        <KpiTile label={tr("Classes", "Classes")} value={formatNumber(d.classes, locale)} tone="sky" />
        <KpiTile label={tr("Attendance today", "Présence du jour")} value={formatRate(d.attendance.today.rate)} tone="green" hint={tr(`Week: ${formatRate(d.attendance.week.rate)}`, `Semaine : ${formatRate(d.attendance.week.rate)}`)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={tr("School", "École")}>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {[
              [tr("Head", "Responsable"), d.school.principal],
              ["Email", d.school.email],
              [tr("Phone", "Téléphone"), d.school.phone],
              [tr("Motto", "Devise"), d.school.motto],
            ].map(([k, v]) => (
              <div key={String(k)} className="min-w-0">
                <dt className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{k}</dt>
                <dd className="truncate font-semibold text-primary">{v || "-"}</dd>
              </div>
            ))}
          </dl>
        </Panel>
        <Panel title={tr("Recent announcements", "Annonces récentes")}>
          {d.announcements.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tr("No announcement yet.", "Aucune annonce.")}</p>
          ) : (
            <ul className="space-y-2">
              {d.announcements.map((a) => (
                <li key={a.id} className="flex items-start gap-2 text-sm">
                  <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-primary/50" />
                  <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-primary">{a.title}</span><span className="text-xs text-muted-foreground">{formatDate(a.created_at, locale)}</span></span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}

function Pupils({ d }: { d: SchoolDetail }) {
  const tr = useTr();
  const rows = d.students.by_class;
  if (!rows.length) return <EmptyState title={tr("No pupil enrolled", "Aucun élève inscrit")} />;
  const chart = rows.map((r) => ({ name: r.class_name, girls: r.female, boys: r.male }));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <KpiTile label={tr("Total", "Total")} value={d.students.total} />
        <KpiTile label={tr("Girls", "Filles")} value={d.students.female} tone="red" />
        <KpiTile label={tr("Boys", "Garçons")} value={d.students.male} tone="sky" />
      </div>
      <Panel title={tr("Pupils per class and gender", "Élèves par classe et par genre")}>
        <div className="h-64 w-full" role="img" aria-label={tr("Stacked bars of girls and boys per class", "Barres empilées filles et garçons par classe")}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.08)" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="girls" stackId="a" fill="#d6537f" name={tr("Girls", "Filles")} />
              <Bar dataKey="boys" stackId="a" fill="#264D73" name={tr("Boys", "Garçons")} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>
      <Panel title={tr("By class", "Par classe")}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[22rem] text-sm">
            <thead><tr className="border-b text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground"><th className="py-2">{tr("Class", "Classe")}</th><th>{tr("Girls", "Filles")}</th><th>{tr("Boys", "Garçons")}</th><th>Total</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.class_id}-${r.class_name}`} className="border-b last:border-0"><td className="py-2 font-semibold text-primary">{r.class_name}</td><td>{r.female}</td><td>{r.male}</td><td className="font-black">{r.total}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function Staff({ d }: { d: SchoolDetail }) {
  const tr = useTr();
  const entries = Object.entries(d.staff.by_role).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return <EmptyState title={tr("No staff recorded", "Aucun personnel enregistré")} />;
  const max = Math.max(...entries.map(([, n]) => n), 1);
  return (
    <Panel title={`${tr("Staff", "Personnel")} (${d.staff.total})`}>
      <ul className="space-y-3">
        {entries.map(([role, count]) => (
          <li key={role}>
            <div className="mb-1 flex justify-between text-sm"><span className="font-semibold text-primary">{role === "SCHOOL_ADMIN" ? d.admins.find((a) => a.role === "SCHOOL_ADMIN")?.display_role || roleTitle(role) : roleTitle(role)}</span><span className="font-black">{count}</span></div>
            <div className="h-2 rounded-full bg-accent"><div className="h-full rounded-full bg-primary/70" style={{ width: `${(count / max) * 100}%` }} /></div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Attendance({ d }: { d: SchoolDetail }) {
  const tr = useTr();
  const locale = useLocale();
  const trend = d.attendance.trend.map((p) => ({ date: formatDate(p.date, locale).slice(0, 6), rate: p.rate }));
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Panel title={tr("Today", "Aujourd'hui")}><RateBar rate={d.attendance.today.rate} label={tr(`${d.attendance.today.records} records`, `${d.attendance.today.records} enregistrements`)} /></Panel>
        <Panel title={tr("This week", "Cette semaine")}><RateBar rate={d.attendance.week.rate} label={tr(`${d.attendance.week.records} records`, `${d.attendance.week.records} enregistrements`)} /></Panel>
      </div>
      <Panel title={tr("Trend (last days with records)", "Tendance (derniers jours avec données)")}>
        {trend.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tr("No attendance recorded yet.", "Aucune présence enregistrée.")}</p>
        ) : (
          <div className="h-60 w-full" role="img" aria-label={tr("Attendance rate over time", "Taux de présence dans le temps")}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.08)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [`${v}%`, tr("Attendance", "Présence")]} />
                <Area type="monotone" dataKey="rate" stroke="#264D73" fill="#264D73" fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>
    </div>
  );
}

function Academic({ d }: { d: SchoolDetail }) {
  const tr = useTr();
  const rows = d.marks.by_class_term;
  if (!rows.length) return <EmptyState title={tr("No marks recorded yet", "Aucune note enregistrée")} />;
  return (
    <Panel title={tr(`Average mark by class and term (out of ${d.marks.max_score})`, `Moyenne par classe et trimestre (sur ${d.marks.max_score})`)}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[24rem] text-sm">
          <thead><tr className="border-b text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground"><th className="py-2">{tr("Class", "Classe")}</th><th>{tr("Year", "Année")}</th><th>{tr("Term", "Trim.")}</th><th>{tr("Average", "Moyenne")}</th><th>{tr("Marks", "Notes")}</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="py-2 font-semibold text-primary">{r.class_name}</td><td>{r.academic_year}</td><td>{r.term}</td>
                <td className="w-40"><RateBar rate={typeof r.average === "number" ? (r.average / d.marks.max_score) * 100 : null} label={typeof r.average === "number" ? r.average.toFixed(2) : "-"} /></td>
                <td>{r.marks}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Finance({ d }: { d: SchoolDetail }) {
  const tr = useTr();
  const locale = useLocale();
  const b = d.platform_billing;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiTile label={tr("Billed", "Facturé")} value={formatMoney(d.fees.billed, "XAF", locale)} />
        <KpiTile label={tr("Collected", "Perçu")} value={formatMoney(d.fees.collected, "XAF", locale)} tone="green" />
        <KpiTile label={tr("Outstanding", "Restant")} value={formatMoney(d.fees.outstanding, "XAF", locale)} tone="red" />
      </div>
      <Panel title={tr("Collection rate", "Taux de recouvrement")}><RateBar rate={d.fees.collection_rate} /></Panel>
      <Panel title={tr("Platform subscription", "Abonnement à la plateforme")}>
        <div className="flex flex-wrap items-center gap-3">
          <BillingChip billing={b} />
          <span className="text-sm text-muted-foreground">
            {b.expires_on ? tr(`Valid until ${formatDate(b.expires_on, locale)}`, `Valable jusqu'au ${formatDate(b.expires_on, locale)}`) : null}
            {b.free_until ? tr(`Free until ${formatDate(b.free_until, locale)}`, `Gratuit jusqu'au ${formatDate(b.free_until, locale)}`) : null}
            {b.amount ? ` - ${formatMoney(b.amount, b.currency || "XAF", locale)}` : null}
          </span>
        </div>
      </Panel>
    </div>
  );
}
