"use client";

/**
 * Executive Console — App Registry.
 *
 * Where a founder sees every app in the release and decides which schools have
 * which. Installing writes a licence; it does not move any code, because the
 * code is already in the release.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, Boxes, CheckCircle2, Clock, Loader2, Lock, PackageCheck, Search, X,
} from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { useSchools } from "@/lib/hooks/useSchools";
import { useSchoolApps, useUpdateSchoolApp } from "@/lib/hooks/useRegistry";
import type { SchoolApp } from "@/lib/api/services/registry";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const TIER_STYLES: Record<string, string> = {
  core: "bg-slate-100 text-slate-700 border-slate-200",
  included: "bg-emerald-50 text-emerald-700 border-emerald-200",
  standard: "bg-sky-50 text-sky-700 border-sky-200",
  premium: "bg-amber-50 text-amber-700 border-amber-200",
};

export default function AppRegistryPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isExecutive = Boolean((user as any)?.is_platform_executive)
    || ["SUPER_ADMIN", "CEO", "CTO", "COO"].includes(String(user?.role || "").toUpperCase());

  const { data: schoolsData, isLoading: schoolsLoading } = useSchools();
  const schools = useMemo(() => {
    const raw: any = schoolsData;
    return (Array.isArray(raw) ? raw : raw?.results || []) as Array<{ id: string; name: string }>;
  }, [schoolsData]);

  const [schoolId, setSchoolId] = useState("");
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<SchoolApp | null>(null);

  useEffect(() => {
    if (!schoolId && schools.length) setSchoolId(schools[0].id);
  }, [schools, schoolId]);

  const { data, isLoading } = useSchoolApps(schoolId);
  const update = useUpdateSchoolApp(schoolId);

  const apps = useMemo(() => {
    const list = data?.apps || [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (a) => a.name.toLowerCase().includes(q) || a.summary.toLowerCase().includes(q)
    );
  }, [data, query]);

  if (!isExecutive) {
    return (
      <div className="mx-auto max-w-lg py-20 text-center">
        <Lock className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-bold">Founders only</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The App Registry is managed by the CEO and CTO.
        </p>
      </div>
    );
  }

  async function run(app: SchoolApp, action: "install" | "uninstall") {
    setPending(app.key);
    try {
      await update.mutateAsync({ app_key: app.key, action });
      toast({
        title: action === "install" ? `${app.name} installed` : `${app.name} removed`,
        description:
          action === "install"
            ? "The school can use it immediately."
            : "The school keeps its data; you can put the app back at any time.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "That did not work",
        description: error?.response?.data?.detail || "Please try again.",
      });
    } finally {
      setPending(null);
      setConfirming(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight">
            <Boxes className="h-6 w-6 text-primary" /> App Registry
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose which apps each school can use. Installing grants a licence — the app
            is already in the release.
          </p>
          <Link
            href="/dashboard/apps/developer"
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            <PackageCheck className="h-4 w-4" /> Developer Console — upload &amp; publish apps
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={schoolId}
            onChange={(e) => setSchoolId(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            disabled={schoolsLoading}
          >
            {schools.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search apps"
              className="w-56 pl-9"
            />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading apps…
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {apps.map((app) => (
            <Card key={app.key} className="flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-base font-black">{app.name}</CardTitle>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${
                      TIER_STYLES[app.tier] || TIER_STYLES.standard
                    }`}
                  >
                    {app.tier}
                  </span>
                </div>
                <CardDescription className="text-xs leading-relaxed">{app.summary}</CardDescription>
              </CardHeader>

              <CardContent className="mt-auto space-y-3">
                <div className="flex items-center gap-2 text-xs">
                  {app.is_core ? (
                    <span className="inline-flex items-center gap-1.5 font-bold text-slate-600">
                      <Lock className="h-3.5 w-3.5" /> Always available
                    </span>
                  ) : app.enabled ? (
                    <span className="inline-flex items-center gap-1.5 font-bold text-emerald-600">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Installed
                    </span>
                  ) : app.expired ? (
                    <span className="inline-flex items-center gap-1.5 font-bold text-amber-600">
                      <Clock className="h-3.5 w-3.5" /> Licence expired
                    </span>
                  ) : (
                    <span className="font-bold text-muted-foreground">Not installed</span>
                  )}
                  {app.licence_expiry && (
                    <span className="text-muted-foreground">· until {app.licence_expiry}</span>
                  )}
                </div>

                {!app.is_core && (
                  <Button
                    size="sm"
                    variant={app.enabled ? "outline" : "default"}
                    className="w-full"
                    disabled={pending === app.key}
                    onClick={() =>
                      app.enabled ? setConfirming(app) : run(app, "install")
                    }
                  >
                    {pending === app.key && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {app.enabled ? "Remove from this school" : "Install for this school"}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Uninstall is the only destructive action here, so it is confirmed and
          the confirmation says plainly what happens to the school's data. */}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-background p-6 shadow-xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <div>
                <h2 className="text-base font-black">Remove {confirming.name}?</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Staff and families at this school will no longer see it.
                </p>
                {confirming.owns_data.length > 0 && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Their {confirming.owns_data.join(", ")} are kept, not deleted. Re-installing
                    restores access to everything.
                  </p>
                )}
              </div>
              <button
                onClick={() => setConfirming(null)}
                className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted"
                aria-label="Cancel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirming(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={pending === confirming.key}
                onClick={() => run(confirming, "uninstall")}
              >
                {pending === confirming.key && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Remove app
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
