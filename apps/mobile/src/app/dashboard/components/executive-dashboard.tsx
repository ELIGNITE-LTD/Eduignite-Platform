"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Building2, Globe, GraduationCap, ArrowUpRight, PieChart, Zap, Crown, TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, Legend } from "recharts";
import { usePlatformStats } from "@/lib/hooks/usePlatform";

const CHART_COLORS = ["#264D73", "#67D0E4", "#FCD116", "#CE1126", "#10B981", "#8B5CF6", "#F97316"];

export function ExecutiveDashboard() {
  const { schools } = useAuth();
  const { data: stats, isLoading: statsLoading } = usePlatformStats();

  const schoolsByRegion = useMemo(
    () =>
      (stats?.schools_by_region ?? [])
        .map((entry, index) => ({
          name: entry.region || "Unknown",
          value: Number(entry.count || 0),
          color: CHART_COLORS[index % CHART_COLORS.length],
        }))
        .sort((a, b) => b.value - a.value),
    [stats?.schools_by_region]
  );

  const userDistribution = useMemo(
    () =>
      Object.entries(stats?.users_by_role ?? {}).map(([role, count], index) => ({
        name: role,
        value: Number(count || 0),
        color: CHART_COLORS[index % CHART_COLORS.length],
      })),
    [stats?.users_by_role]
  );

  const schoolStatusBreakdown = useMemo(
    () =>
      (stats?.schools_by_status ?? []).map((entry) => ({
        name: entry.status || "Unknown",
        value: Number(entry.count || 0),
      })),
    [stats?.schools_by_status]
  );

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-500">
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-primary font-headline flex items-start sm:items-center gap-3">
            <div className="p-2 bg-primary rounded-xl shadow-lg">
              <Globe className="w-6 h-6 text-secondary" />
            </div>
            Platform Intelligence
          </h1>
          <p className="text-muted-foreground">Live operational metrics from the EduIgnite network.</p>
        </div>

        <div className="bg-white p-4 rounded-[1.5rem] shadow-sm border flex flex-wrap items-center gap-3">
          <Badge variant="secondary" className="bg-primary/5 text-primary border-none uppercase text-[9px] font-black h-7 px-3">
            <Zap className="w-3 h-3 mr-1.5" />
            {statsLoading ? "Syncing" : "Live Data"}
          </Badge>
          <Badge variant="outline" className="uppercase text-[9px] font-black h-7 px-3">
            {schools?.length ?? 0} school nodes in context
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        <MetricCard
          title="Global Users"
          value={stats?.total_users ?? 0}
          loading={statsLoading}
          icon={<Users className="w-16 h-16" />}
          className="bg-primary text-white"
          valueClassName="text-secondary"
          footer="+ live platform total"
        />
        <MetricCard
          title="Active Schools"
          value={stats?.active_schools ?? 0}
          loading={statsLoading}
          icon={<GraduationCap className="w-4 h-4 text-primary/40" />}
          footer={`${stats?.total_schools ?? 0} total schools`}
        />
        <MetricCard
          title="Teachers"
          value={stats?.total_teachers ?? 0}
          loading={statsLoading}
          icon={<Users className="w-4 h-4 text-primary/40" />}
          footer={`${stats?.total_students ?? 0} students`}
        />
        <MetricCard
          title="New Orders"
          value={stats?.new_orders ?? 0}
          loading={statsLoading}
          icon={<Crown className="w-4 h-4 text-secondary" />}
          footer={`${stats?.total_orders ?? 0} total orders`}
        />
        <MetricCard
          title="Net Revenue"
          value={stats?.total_revenue ? `XAF ${Number(stats.total_revenue).toLocaleString()}` : "XAF 0"}
          loading={statsLoading}
          icon={null}
          className="bg-secondary text-primary"
          valueClassName=""
          footer="confirmed platform revenue"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <Card className="lg:col-span-8 border-none shadow-xl overflow-hidden rounded-[2rem] sm:rounded-[2.5rem] bg-white">
          <CardHeader className="border-b bg-accent/5 p-5 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-black text-primary uppercase tracking-tight flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-secondary" />
                Schools by Region
              </CardTitle>
              <CardDescription>Real institution distribution across the platform.</CardDescription>
            </div>
            <Badge variant="secondary" className="bg-primary/5 text-primary border-none uppercase text-[9px] font-black h-7 px-3">
              <Building2 className="w-3 h-3 mr-1.5" />
              {stats?.total_schools ?? 0} registered schools
            </Badge>
          </CardHeader>
          <CardContent className="h-[300px] sm:h-[400px] pt-6 sm:pt-10">
            {schoolsByRegion.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={schoolsByRegion}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: "bold" }} />
                  <YAxis axisLine={false} tickLine={false} allowDecimals={false} tick={{ fontSize: 10 }} />
                  <RechartsTooltip />
                  <Legend />
                  <Bar dataKey="value" name="Schools" radius={[10, 10, 0, 0]}>
                    {schoolsByRegion.map((entry, index) => (
                      <Cell key={entry.name} fill={entry.color || CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart text="No regional school data available yet." />
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-4 border-none shadow-xl overflow-hidden rounded-[2rem] sm:rounded-[2.5rem] bg-white flex flex-col">
          <CardHeader className="bg-primary p-5 sm:p-8 text-white">
            <CardTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
              <PieChart className="w-5 h-5 text-secondary" />
              User Segment Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 pt-6 sm:pt-10">
            {userDistribution.length ? (
              <>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={userDistribution} layout="vertical">
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} width={90} />
                    <RechartsTooltip />
                    <Bar dataKey="value" radius={[0, 10, 10, 0]} barSize={24}>
                      {userDistribution.map((entry, index) => (
                        <Cell key={entry.name} fill={entry.color || CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-6 space-y-3">
                  {userDistribution.map((segment) => (
                    <div key={segment.name} className="flex items-center justify-between p-3 rounded-xl bg-accent/20 border border-accent">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: segment.color }} />
                        <span className="text-xs font-bold text-primary">{segment.name}</span>
                      </div>
                      <span className="text-sm font-black">{segment.value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <EmptyChart text="No user distribution data available yet." />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatBreakdownCard
          title="School Status"
          items={schoolStatusBreakdown}
          emptyText="No school status data available."
        />
        <StatBreakdownCard
          title="Licenses"
          items={[
            { name: "Paid", value: stats?.license_paid_count ?? 0 },
            { name: "Unpaid", value: stats?.license_unpaid_count ?? 0 },
          ]}
          emptyText="No license data available."
        />
        <StatBreakdownCard
          title="Leadership"
          items={[
            { name: "Founders", value: stats?.founder_count ?? 0 },
            { name: "Executives", value: stats?.executive_count ?? 0 },
            { name: "Active Users", value: stats?.active_users ?? 0 },
          ]}
          emptyText="No leadership data available."
        />
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  loading,
  icon,
  className = "bg-white",
  valueClassName = "text-primary",
  footer,
}: {
  title: string;
  value: string | number;
  loading: boolean;
  icon: ReactNode;
  className?: string;
  valueClassName?: string;
  footer: string;
}) {
  return (
    <Card className={`border-none shadow-sm overflow-hidden relative group ${className}`}>
      {icon && <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">{icon}</div>}
      <CardHeader className="pb-2">
        <CardTitle className="text-[10px] uppercase font-black opacity-60 tracking-widest">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-8 w-20 bg-black/10 animate-pulse rounded" />
        ) : (
          <div className={`text-2xl font-black ${valueClassName}`}>{value}</div>
        )}
        <p className="text-[9px] font-bold mt-2 uppercase flex items-center gap-1">
          <ArrowUpRight className="w-3 h-3" />
          {footer}
        </p>
      </CardContent>
    </Card>
  );
}

function StatBreakdownCard({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: Array<{ name: string; value: number }>;
  emptyText: string;
}) {
  const meaningfulItems = items.filter((item) => item.value > 0);

  return (
    <Card className="border-none shadow-sm bg-white">
      <CardHeader>
        <CardTitle className="text-sm font-black uppercase tracking-widest text-primary">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {meaningfulItems.length ? (
          meaningfulItems.map((item) => (
            <div key={item.name} className="flex items-center justify-between rounded-xl border bg-accent/10 px-4 py-3">
              <span className="text-xs font-bold text-primary">{item.name}</span>
              <span className="text-sm font-black">{item.value.toLocaleString()}</span>
            </div>
          ))
        ) : (
          <p className="text-xs text-muted-foreground">{emptyText}</p>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyChart({ text }: { text: string }) {
  return (
    <div className="h-full flex items-center justify-center text-center px-6">
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
