"use client";

/**
 * Developer Console — uploading and reviewing apps.
 *
 * Where a founder brings an .eia package into the platform and moves it through
 * its lifecycle: upload, submit for the automated checks, approve, publish. The
 * store side of what the runbook describes, as a screen rather than curl.
 *
 * Nothing here runs app code. Uploading validates and stores a package;
 * publishing makes a reviewed build installable. The one destructive action —
 * pull — is confirmed, because it stops a build running for every school on it.
 */

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, ArrowLeft, CheckCircle2, CloudUpload, Loader2, Lock,
  PackageCheck, Rocket, Send, ShieldAlert, XCircle,
} from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { useAppBuilds, useBuildAction, useSetPricing, useUploadBuild } from "@/lib/hooks/useRegistry";
import { useSchools } from "@/lib/hooks/useSchools";
import { registryService } from "@/lib/api/services/registry";
import type { AppBuild, AppPricing, BuildState, PricingModel } from "@/lib/api/services/registry";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const STATE_STYLE: Record<BuildState, string> = {
  draft: "bg-slate-100 text-slate-700",
  submitted: "bg-sky-50 text-sky-700",
  checks_failed: "bg-red-50 text-red-700",
  in_review: "bg-amber-50 text-amber-700",
  rejected: "bg-red-50 text-red-700",
  approved: "bg-emerald-50 text-emerald-700",
  published: "bg-emerald-600 text-white",
  deprecated: "bg-slate-100 text-slate-500",
  pulled: "bg-red-600 text-white",
};

function bytes(n: number): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DeveloperConsolePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const isExecutive =
    Boolean((user as any)?.is_platform_executive) ||
    ["SUPER_ADMIN", "CEO", "CTO"].includes(String(user?.role || "").toUpperCase());

  const { data, isLoading } = useAppBuilds(isExecutive);
  const upload = useUploadBuild();
  const action = useBuildAction();
  const [busyId, setBusyId] = useState<string | null>(null);

  const builds = useMemo(() => data?.builds || [], [data]);

  if (!isExecutive) {
    return (
      <div className="mx-auto max-w-lg py-20 text-center">
        <Lock className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-bold">Founders only</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Uploading and reviewing apps is done by the CEO and CTO.
        </p>
      </div>
    );
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!file.name.endsWith(".eia")) {
      toast({ variant: "destructive", title: "Not an .eia package", description: "Choose a file built with build.py." });
      return;
    }
    try {
      const build = await upload.mutateAsync(file);
      toast({
        title: `${build.app_name} ${build.version} uploaded`,
        description: "It is a draft. Submit it to run the automated checks.",
      });
    } catch (error: any) {
      // The server's message names exactly what is wrong with the package.
      toast({
        variant: "destructive",
        title: "Upload refused",
        description: error?.response?.data?.detail || "That package could not be read.",
      });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function run(build: AppBuild, act: "submit" | "approve" | "reject" | "publish" | "pull") {
    let note = "";
    if (act === "reject" || act === "pull") {
      note = window.prompt(act === "reject" ? "Why is it being sent back?" : "Why is it being pulled?") || "";
      if (!note.trim()) return; // both require a reason server-side
    }
    setBusyId(build.id);
    try {
      const updated = await action.mutateAsync({ buildId: build.id, action: act, note });
      toast({ title: `${updated.app_name} ${updated.version}`, description: updated.state_label });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "That did not work",
        description: error?.response?.data?.detail || "Please try again.",
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/dashboard/apps" className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary">
            <ArrowLeft className="h-3.5 w-3.5" /> App Registry
          </Link>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-black tracking-tight">
            <PackageCheck className="h-6 w-6 text-primary" /> Developer Console
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload an app, run its checks, review it and publish it. Publishing makes it installable for schools.
          </p>
        </div>
      </div>

      {/* Upload */}
      <Card
        className="border-dashed"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onFile(e.dataTransfer.files?.[0]);
        }}
      >
        <CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center">
          <CloudUpload className="h-9 w-9 text-primary" />
          <div>
            <p className="font-bold">Upload an .eia package</p>
            <p className="text-sm text-muted-foreground">Drag it here, or choose a file. It is validated before anything is stored.</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".eia"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <Button onClick={() => fileRef.current?.click()} disabled={upload.isPending}>
            {upload.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Choose package
          </Button>
        </CardContent>
      </Card>

      {/* Builds */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading builds…
        </div>
      ) : builds.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 py-16 text-center text-sm text-muted-foreground">
          No apps uploaded yet. The first one you upload appears here.
        </div>
      ) : (
        <div className="space-y-3">
          {builds.map((build) => (
            <BuildRow
              key={build.id}
              build={build}
              busy={busyId === build.id}
              onAction={run}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BuildRow({
  build,
  busy,
  onAction,
}: {
  build: AppBuild;
  busy: boolean;
  onAction: (build: AppBuild, action: "submit" | "approve" | "reject" | "publish" | "pull") => void;
}) {
  const errors = build.check_report?.errors || [];
  const warnings = build.check_report?.warnings || [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base font-black">
            {build.app_name}
            <span className="text-xs font-bold text-muted-foreground">v{build.version}</span>
            {build.is_live && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-white">
                <Rocket className="h-3 w-3" /> Live
              </span>
            )}
          </CardTitle>
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-black uppercase tracking-widest ${STATE_STYLE[build.state]}`}>
            {build.state_label}
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
          <span>Key: <code className="font-mono">{build.app_key}</code></span>
          {build.size_bytes > 0 && <span>{bytes(build.size_bytes)}</span>}
          {build.submitted_by && <span>By {build.submitted_by}</span>}
          {build.reviewed_by && <span>Reviewed by {build.reviewed_by}</span>}
        </div>

        {build.changelog && (
          <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs leading-relaxed text-slate-600 whitespace-pre-line">
            {build.changelog.slice(0, 400)}
          </p>
        )}

        {/* The automated check outcome, so a failure explains itself. */}
        {errors.length > 0 && (
          <div className="rounded-lg bg-red-50 px-3 py-2">
            <p className="flex items-center gap-1.5 text-xs font-bold text-red-700">
              <ShieldAlert className="h-3.5 w-3.5" /> Checks failed
            </p>
            <ul className="mt-1 space-y-0.5 text-xs text-red-700">
              {errors.slice(0, 8).map((e, i) => <li key={i}>• {e}</li>)}
            </ul>
          </div>
        )}
        {warnings.length > 0 && errors.length === 0 && (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            {warnings.slice(0, 5).map((w, i) => <li key={i} className="list-none">• {w}</li>)}
          </div>
        )}
        {build.review_note && (
          <p className="text-xs text-muted-foreground">Note: {build.review_note}</p>
        )}

        {/* Pricing — a founder decision, editable without a rebuild. */}
        <PricingEditor appKey={build.app_key} pricing={build.pricing} />

        {/* Icon and full description — how the app presents in the store. */}
        <IconDetailsEditor appKey={build.app_key} appName={build.app_name} />

        {/* Audience — who can see and install the app. */}
        <AudienceEditor appKey={build.app_key} />

        <div className="flex flex-wrap gap-2 pt-1">
          {build.state === "draft" && (
            <Action busy={busy} onClick={() => onAction(build, "submit")} icon={Send} label="Submit for review" />
          )}
          {build.state === "checks_failed" && (
            <Action busy={busy} onClick={() => onAction(build, "submit")} icon={Send} label="Re-run checks" />
          )}
          {build.state === "in_review" && (
            <>
              <Action busy={busy} onClick={() => onAction(build, "approve")} icon={CheckCircle2} label="Approve" />
              <Action busy={busy} variant="outline" onClick={() => onAction(build, "reject")} icon={XCircle} label="Reject" />
            </>
          )}
          {build.state === "approved" && (
            <Action busy={busy} onClick={() => onAction(build, "publish")} icon={Rocket} label="Publish" />
          )}
          {(build.state === "published" || build.state === "deprecated") && (
            <Action busy={busy} variant="destructive" onClick={() => onAction(build, "pull")} icon={AlertTriangle} label="Pull" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PricingEditor({ appKey, pricing }: { appKey: string; pricing?: AppPricing }) {
  const { toast } = useToast();
  const setPricing = useSetPricing();
  const [open, setOpen] = useState(false);
  const [model, setModel] = useState<PricingModel>(pricing?.model || "free");
  const [interval, setInterval] = useState(pricing?.interval || "termly");
  const [price, setPrice] = useState(String(pricing?.price || 0));
  const [currency, setCurrency] = useState(pricing?.currency || "XAF");

  const summary =
    !pricing || pricing.model === "free"
      ? "Free"
      : pricing.model === "one_time"
        ? `${pricing.price.toLocaleString()} ${pricing.currency} — one-time`
        : `${pricing.price.toLocaleString()} ${pricing.currency} / ${pricing.interval}`;

  async function save() {
    try {
      await setPricing.mutateAsync({
        appKey,
        pricing: {
          model,
          interval: model === "subscription" ? (interval as any) : "",
          price: model === "free" ? 0 : Number(price) || 0,
          currency,
        },
      });
      toast({ title: "Pricing saved", description: "It takes effect for new installs immediately." });
      setOpen(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Could not save pricing", description: error?.response?.data?.detail || "Check the values." });
    }
  }

  if (!open) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs">
        <span className="font-bold text-muted-foreground uppercase tracking-widest">Pricing</span>
        <span className="font-semibold">{summary}</span>
        <button onClick={() => setOpen(true)} className="ml-auto font-semibold text-primary hover:underline">
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap gap-2">
        {(["free", "one_time", "subscription"] as PricingModel[]).map((m) => (
          <button
            key={m}
            onClick={() => setModel(m)}
            className={`rounded-full border px-3 py-1 text-xs font-bold ${
              model === m ? "border-primary bg-primary text-white" : "border-slate-200 text-slate-600"
            }`}
          >
            {m === "free" ? "Free" : m === "one_time" ? "One-time" : "Subscription"}
          </button>
        ))}
      </div>

      {model !== "free" && (
        <div className="flex flex-wrap items-center gap-2">
          <Input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="numeric" placeholder="10000" className="w-28" />
          <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} className="w-20" />
          {model === "subscription" && (
            <select value={interval} onChange={(e) => setInterval(e.target.value as any)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
              <option value="monthly">per month</option>
              <option value="termly">per term</option>
              <option value="yearly">per year</option>
            </select>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
        <Button size="sm" onClick={save} disabled={setPricing.isPending}>
          {setPricing.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save pricing
        </Button>
      </div>
    </div>
  );
}

/**
 * The app's real icon and its full description.
 *
 * The icon is shown as a proper app tile across the store; the description is
 * the fuller write-up on the app's store page. Both are founder-set and need
 * no rebuild — an app can be re-branded or re-described at any time.
 */
function IconDetailsEditor({ appKey, appName }: { appKey: string; appName: string }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [icon, setIcon] = useState<string>("");
  const [description, setDescription] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  async function openEditor() {
    setOpen(true);
    if (!loaded) {
      try {
        const d = await registryService.getDetails(appKey);
        setDescription(d.description || "");
      } catch {
        /* defaults */
      }
      setLoaded(true);
    }
  }

  async function onFile(file: File) {
    if (file.size > 1024 * 1024) {
      toast({ variant: "destructive", title: "Icon must be under 1 MB." });
      return;
    }
    try {
      const res = await registryService.uploadIcon(appKey, file);
      setIcon(res.icon_image || "");
      toast({ title: "Icon updated" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Could not upload", description: error?.response?.data?.detail });
    }
  }

  async function saveDetails() {
    setSaving(true);
    try {
      await registryService.setDetails(appKey, description);
      toast({ title: "Details saved" });
      setOpen(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Could not save", description: error?.response?.data?.detail });
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={openEditor}
        className="rounded-lg border border-input px-3 py-1.5 text-xs font-bold text-muted-foreground hover:bg-muted"
      >
        Icon &amp; details
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-input p-4">
      <p className="text-sm font-black">Icon &amp; details</p>

      <div className="mt-3 flex items-center gap-3">
        {icon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={icon} alt="" className="h-14 w-14 rounded-xl border border-slate-200 object-cover" />
        ) : (
          <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-[#264D73]/10 text-xl font-black text-[#264D73]">
            {(appName || "?").charAt(0).toUpperCase()}
          </span>
        )}
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            Upload icon
          </Button>
          <p className="mt-1 text-[11px] text-muted-foreground">PNG or JPG, square, under 1 MB.</p>
        </div>
      </div>

      <label className="mt-4 block text-xs font-bold uppercase tracking-widest text-muted-foreground">
        Full description
      </label>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={5}
        placeholder="What the app does, who it's for, how it helps…"
        className="mt-1.5 w-full rounded-lg border border-input bg-background p-3 text-sm"
      />

      <div className="mt-3 flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => setOpen(false)}>Close</Button>
        <Button size="sm" disabled={saving} onClick={saveDetails}>Save details</Button>
      </div>
    </div>
  );
}

/**
 * Which schools may see and install this app.
 *
 * Every school by default. A publisher can narrow it to a chosen set — the
 * app then appears only in those schools' stores, and no one else can install
 * it. Editable at any time, before or after publishing.
 */
function AudienceEditor({ appKey }: { appKey: string }) {
  const { toast } = useToast();
  const { data: schoolsData } = useSchools();
  const schools = useMemo(() => {
    const raw: any = schoolsData;
    return (Array.isArray(raw) ? raw : raw?.results || []) as Array<{ id: string; name: string }>;
  }, [schoolsData]);

  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(true);
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  async function openEditor() {
    setOpen(true);
    if (!loaded) {
      try {
        const a = await registryService.getAudience(appKey);
        setAll(a.visible_to_all);
        setIds(new Set(a.school_ids || []));
      } catch {
        /* defaults */
      }
      setLoaded(true);
    }
  }

  async function save() {
    setSaving(true);
    try {
      await registryService.setAudience(appKey, all, all ? [] : Array.from(ids));
      toast({ title: "Audience saved" });
      setOpen(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Could not save", description: error?.response?.data?.detail });
    } finally {
      setSaving(false);
    }
  }

  function toggle(id: string) {
    setIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  if (!open) {
    return (
      <button
        onClick={openEditor}
        className="rounded-lg border border-input px-3 py-1.5 text-xs font-bold text-muted-foreground hover:bg-muted"
      >
        Audience: who can install
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-input p-4">
      <p className="text-sm font-black">Who can see and install this app</p>
      <div className="mt-3 space-y-2">
        <button
          onClick={() => setAll(true)}
          className={`w-full rounded-lg border px-3 py-2 text-left text-sm font-bold ${all ? "border-primary bg-primary/5 text-primary" : "border-input"}`}
        >
          Every school
        </button>
        <button
          onClick={() => setAll(false)}
          className={`w-full rounded-lg border px-3 py-2 text-left text-sm font-bold ${!all ? "border-primary bg-primary/5 text-primary" : "border-input"}`}
        >
          Only chosen schools…
        </button>
      </div>

      {!all && (
        <div className="mt-3 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-input p-2">
          {schools.length === 0 && <p className="p-2 text-xs text-muted-foreground">No schools found.</p>}
          {schools.map((s) => (
            <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
              <input type="checkbox" checked={ids.has(s.id)} onChange={() => toggle(s.id)} className="accent-primary" />
              {s.name}
            </label>
          ))}
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
        <Button size="sm" disabled={saving || (!all && ids.size === 0)} onClick={save}>Save audience</Button>
      </div>
    </div>
  );
}

function Action({
  busy, onClick, icon: Icon, label, variant = "default",
}: {
  busy: boolean;
  onClick: () => void;
  icon: any;
  label: string;
  variant?: "default" | "outline" | "destructive";
}) {
  return (
    <Button size="sm" variant={variant} disabled={busy} onClick={onClick}>
      {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Icon className="mr-2 h-4 w-4" />}
      {label}
    </Button>
  );
}
