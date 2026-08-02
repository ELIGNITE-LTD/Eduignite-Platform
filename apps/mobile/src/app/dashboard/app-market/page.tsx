"use client";

/**
 * The school-facing App Store.
 *
 * Where a school administrator browses published apps and installs them for
 * their own school. Free apps install on tap; a paid app collects mobile money
 * first, and the install lands only when that payment confirms — the server
 * ties the two together, so the school is never charged for nothing.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Boxes, CheckCircle2, Clock, Loader2, Lock, Search, Smartphone, X,
} from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { registryService, type StoreApp } from "@/lib/api/services/registry";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

function priceLabel(p: StoreApp["pricing"]): string {
  if (p.model === "free" || !p.price) return "Free";
  const amount = `${p.price.toLocaleString()} ${p.currency}`;
  if (p.model === "subscription") {
    const per = p.interval === "monthly" ? "month" : p.interval === "yearly" ? "year" : "term";
    return `${amount} / ${per}`;
  }
  return `${amount} once`;
}

/** The app's real icon if it has one, otherwise its initial in a tile. */
function AppIcon({ app, size = 44 }: { app: StoreApp; size?: number }) {
  if (app.icon_image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={app.icon_image}
        alt=""
        width={size}
        height={size}
        className="rounded-xl border border-slate-200 object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="flex items-center justify-center rounded-xl bg-[#264D73]/10 font-black text-[#264D73]"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {(app.name || "?").charAt(0).toUpperCase()}
    </span>
  );
}

export default function AppMarketPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const role = String(user?.role || "").toUpperCase();
  const canManage = role === "SCHOOL_ADMIN" || role === "SUB_ADMIN";

  const [apps, setApps] = useState<StoreApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [paying, setPaying] = useState<{ app: StoreApp; roles: string[] } | null>(null);
  const [choosing, setChoosing] = useState<StoreApp | null>(null);
  const [detailing, setDetailing] = useState<StoreApp | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const data = await registryService.store();
      setApps(data.apps || []);
    } catch {
      toast({ variant: "destructive", title: "Could not load the app store." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return apps;
    return apps.filter(
      (a) => a.name.toLowerCase().includes(q) || a.summary.toLowerCase().includes(q)
    );
  }, [apps, query]);

  async function install(app: StoreApp, roles: string[]) {
    setChoosing(null);
    setBusy(app.key);
    try {
      const result = await registryService.storeInstall(app.key, roles);
      if (result?.payment_required) {
        setPaying({ app, roles });      // paid — open the mobile-money dialog
        return;
      }
      toast({ title: `${app.name} installed`, description: "The chosen users have it now." });
      await refresh();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Could not install",
        description: error?.response?.data?.detail || "Please try again.",
      });
    } finally {
      setBusy(null);
    }
  }

  async function remove(app: StoreApp) {
    setBusy(app.key);
    try {
      await registryService.storeUninstall(app.key);
      toast({ title: `${app.name} removed`, description: "Your data is kept." });
      await refresh();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Could not remove",
        description: error?.response?.data?.detail || "Please try again.",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight">
            <Boxes className="h-6 w-6 text-primary" /> App Store
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Add apps to your school. Free apps install straight away; paid apps are
            billed by mobile money.
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search apps"
            className="w-60 pl-9"
          />
        </div>
      </div>

      {!canManage && (
        <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Lock className="h-4 w-4" />
          You can browse the store, but only a school administrator can install apps.
        </div>
      )}

      {canManage && <SchoolSubscriptionBanner />}

      {loading ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading apps…
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-20 text-center">
          <p className="font-black text-[#12314d]">No apps published yet</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            When apps are published to the platform, they appear here for you to install.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((app) => (
            <Card key={app.key} className="flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-start gap-3">
                  <AppIcon app={app} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base font-black">{app.name}</CardTitle>
                      <span className="shrink-0 rounded-full bg-[#67D0E4]/15 px-2.5 py-0.5 text-[11px] font-black text-[#264D73]">
                        {priceLabel(app.pricing)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">
                      {app.publisher} · v{app.version}
                    </p>
                  </div>
                </div>
                <CardDescription className="mt-2 text-xs leading-relaxed">{app.summary}</CardDescription>
                {(app.description || app.summary) && (
                  <button
                    onClick={() => setDetailing(app)}
                    className="mt-1 self-start text-[11px] font-bold text-[#264D73] hover:underline"
                  >
                    View details
                  </button>
                )}
              </CardHeader>

              <CardContent className="mt-auto space-y-3">
                <div className="flex items-center gap-2 text-xs">
                  {app.installed && !app.expired ? (
                    <span className="inline-flex items-center gap-1.5 font-bold text-emerald-600">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Installed
                    </span>
                  ) : app.expired ? (
                    <span className="inline-flex items-center gap-1.5 font-bold text-amber-600">
                      <Clock className="h-3.5 w-3.5" /> Expired — renew to continue
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Not installed</span>
                  )}
                  {app.licence_expiry && (
                    <span className="text-muted-foreground">· until {app.licence_expiry}</span>
                  )}
                </div>

                {canManage && (
                  <div className="flex gap-2">
                    {app.installed && !app.expired ? (
                      <Button
                        size="sm" variant="outline" className="flex-1"
                        disabled={busy === app.key}
                        onClick={() => remove(app)}
                      >
                        {busy === app.key && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Remove
                      </Button>
                    ) : (
                      <Button
                        size="sm" className="flex-1"
                        disabled={busy === app.key}
                        onClick={() => setChoosing(app)}
                      >
                        {busy === app.key && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {app.pricing.model === "free" || !app.pricing.price
                          ? "Install"
                          : app.expired ? "Renew" : "Get app"}
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {detailing && (
        <DetailsDialog app={detailing} onClose={() => setDetailing(null)} />
      )}

      {choosing && (
        <RoleDialog
          app={choosing}
          onClose={() => setChoosing(null)}
          onConfirm={(roles) => install(choosing, roles)}
        />
      )}

      {paying && (
        <PaymentDialog
          app={paying.app}
          roles={paying.roles}
          onClose={() => setPaying(null)}
          onPaid={async () => {
            setPaying(null);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

/** The app's full write-up, its icon and what it costs. */
function DetailsDialog({ app, onClose }: { app: StoreApp; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-background p-6 shadow-xl">
        <div className="flex items-start gap-4">
          <AppIcon app={app} size={56} />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-black">{app.name}</h2>
            <p className="text-xs font-semibold text-muted-foreground">
              {app.publisher} · v{app.version} · {priceLabel(app.pricing)}
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-4 text-sm font-semibold text-[#12314d]">{app.summary}</p>
        {app.description ? (
          <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {app.description}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">No further details provided.</p>
        )}

        <Button className="mt-6 w-full" variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

/** The roles that can be handed an app. "Everyone" clears the list server-side. */
const ROLE_CHOICES: { key: string; label: string }[] = [
  { key: "STUDENT", label: "Students" },
  { key: "TEACHER", label: "Teachers" },
  { key: "SCHOOL_ADMIN", label: "Administrators" },
  { key: "BURSAR", label: "Bursars" },
  { key: "LIBRARIAN", label: "Librarians" },
  { key: "PARENT", label: "Parents" },
];

/**
 * Who at the school should get this app.
 *
 * Everyone is the default. Narrowing it hands the app to only those roles —
 * they get it in their account and a notification; nobody else sees it.
 */
function RoleDialog({
  app,
  onClose,
  onConfirm,
}: {
  app: StoreApp;
  onClose: () => void;
  onConfirm: (roles: string[]) => void;
}) {
  const [everyone, setEveryone] = useState(true);
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  function toggle(role: string) {
    setChosen((prev) => {
      const next = new Set(prev);
      next.has(role) ? next.delete(role) : next.add(role);
      return next;
    });
  }

  const paid = app.pricing.model !== "free" && !!app.pricing.price;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-background p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-black">Add {app.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose who at your school gets this app.
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <button
          onClick={() => setEveryone(true)}
          className={`mt-5 w-full rounded-xl border px-4 py-3 text-left text-sm font-bold ${
            everyone ? "border-primary bg-primary/5 text-primary" : "border-input"
          }`}
        >
          Everyone the app is built for
        </button>

        <button
          onClick={() => setEveryone(false)}
          className={`mt-2 w-full rounded-xl border px-4 py-3 text-left text-sm font-bold ${
            !everyone ? "border-primary bg-primary/5 text-primary" : "border-input"
          }`}
        >
          Only certain roles…
        </button>

        {!everyone && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {ROLE_CHOICES.map((r) => (
              <label
                key={r.key}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                  chosen.has(r.key) ? "border-primary bg-primary/5" : "border-input"
                }`}
              >
                <input
                  type="checkbox"
                  checked={chosen.has(r.key)}
                  onChange={() => toggle(r.key)}
                  className="accent-primary"
                />
                {r.label}
              </label>
            ))}
          </div>
        )}

        <Button
          className="mt-6 w-full"
          disabled={!everyone && chosen.size === 0}
          onClick={() => onConfirm(everyone ? [] : Array.from(chosen))}
        >
          {paid ? "Continue to payment" : "Install"}
        </Button>
      </div>
    </div>
  );
}

/**
 * Mobile-money payment for a paid app.
 *
 * Starts a collection, then polls until it resolves. The install is applied by
 * the server when the payment confirms, so success here means the app is
 * already the school's — we just refresh to show it.
 */
function PaymentDialog({
  app,
  roles,
  onClose,
  onPaid,
}: {
  app: StoreApp;
  roles: string[];
  onClose: () => void;
  onPaid: () => void;
}) {
  const { toast } = useToast();
  const [phone, setPhone] = useState("");
  const [operator, setOperator] = useState("mtn");
  const [stage, setStage] = useState<"form" | "waiting">("form");

  async function pay() {
    if (!/^\+?\d{8,}$/.test(phone.replace(/\s/g, ""))) {
      toast({ variant: "destructive", title: "Enter a valid mobile-money number." });
      return;
    }
    setStage("waiting");
    try {
      const txn = await registryService.buyApp(app.key, phone.replace(/\s/g, ""), roles, operator);
      if (txn?.status === "SUCCESS" || txn?.processed) {
        toast({ title: `${app.name} is now yours`, description: "Payment confirmed." });
        onPaid();
        return;
      }
      // Poll — the user approves the charge on their phone.
      const id = txn?.transaction_id;
      for (let i = 0; i < 24 && id; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const status = await registryService.paymentStatus(id);
        if (status?.status === "SUCCESS" || status?.processed) {
          toast({ title: `${app.name} is now yours`, description: "Payment confirmed." });
          onPaid();
          return;
        }
        if (status?.status === "FAILED" || status?.status === "CANCELLED") {
          toast({ variant: "destructive", title: "Payment not completed." });
          setStage("form");
          return;
        }
      }
      toast({
        title: "Still waiting on the payment",
        description: "If you approved it, the app will appear shortly. You can close this.",
      });
      onClose();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Payment could not start",
        description: error?.response?.data?.detail || "Please try again.",
      });
      setStage("form");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-background p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-black">Get {app.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{priceLabel(app.pricing)}</p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {stage === "form" ? (
          <div className="mt-5 space-y-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Operator</label>
              <div className="mt-1.5 flex gap-2">
                {["mtn", "orange"].map((op) => (
                  <button
                    key={op}
                    onClick={() => setOperator(op)}
                    className={`flex-1 rounded-xl border px-3 py-2 text-sm font-bold capitalize ${
                      operator === op ? "border-primary bg-primary/5 text-primary" : "border-input"
                    }`}
                  >
                    {op}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Mobile-money number
              </label>
              <div className="relative mt-1.5">
                <Smartphone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="6XX XXX XXX"
                  className="pl-9"
                  inputMode="tel"
                />
              </div>
            </div>
            <Button className="w-full" onClick={pay}>
              Pay {app.pricing.price?.toLocaleString()} {app.pricing.currency}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              You'll get a prompt on your phone to approve the payment.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center py-10 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-sm font-semibold">Approve the payment on your phone…</p>
            <p className="mt-1 text-xs text-muted-foreground">
              This installs {app.name} as soon as the payment confirms.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The school's own yearly subscription, for a school administrator.
 *
 * Shows the current state and, when there is an amount to pay, a button to
 * settle it by mobile money. Paying activates every non-parent account at the
 * school without individual payments.
 */
function SchoolSubscriptionBanner() {
  const { toast } = useToast();
  const [sub, setSub] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [phone, setPhone] = useState("");
  const [operator, setOperator] = useState("mtn");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const { schoolsService } = await import("@/lib/api/services/schools.service");
      const me = await schoolsService.getMySchool();
      setSub((me as any).subscription || null);
    } catch {
      setSub(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading || !sub) return null;

  const state = sub.effective_state as string;
  const amount = Number(sub.amount || 0);

  // Nothing to show when it's free with no charge configured.
  if (state !== "unpaid" && amount <= 0) return null;

  async function pay() {
    if (!/^\+?\d{8,}$/.test(phone.replace(/\s/g, ""))) {
      toast({ variant: "destructive", title: "Enter a valid mobile-money number." });
      return;
    }
    setBusy(true);
    try {
      const { schoolsService } = await import("@/lib/api/services/schools.service");
      const txn = await schoolsService.paySchoolSubscription(phone.replace(/\s/g, ""), operator);
      const done = txn?.status === "SUCCESS" || txn?.processed;
      if (done) {
        toast({ title: "School subscription paid", description: "All accounts are now active." });
        setPaying(false);
        load();
        return;
      }
      const { registryService } = await import("@/lib/api/services/registry");
      const id = txn?.transaction_id;
      for (let i = 0; i < 24 && id; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const st = await registryService.paymentStatus(id);
        if (st?.status === "SUCCESS" || st?.processed) {
          toast({ title: "School subscription paid", description: "All accounts are now active." });
          setPaying(false);
          load();
          return;
        }
        if (st?.status === "FAILED" || st?.status === "CANCELLED") {
          toast({ variant: "destructive", title: "Payment not completed." });
          return;
        }
      }
      toast({ title: "Still waiting on the payment", description: "It will activate once confirmed." });
      setPaying(false);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Payment could not start", description: e?.response?.data?.detail });
    } finally {
      setBusy(false);
    }
  }

  const tone =
    state === "unpaid"
      ? "border-red-200 bg-red-50 text-red-800"
      : state === "free"
      ? "border-sky-200 bg-sky-50 text-sky-800"
      : "border-emerald-200 bg-emerald-50 text-emerald-800";

  return (
    <>
      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${tone}`}>
        <div className="text-sm">
          <span className="font-black uppercase tracking-wide">School subscription: {state}</span>
          {state === "unpaid" && amount > 0 && (
            <span className="ml-2">
              Pay {amount.toLocaleString()} {sub.currency} for the year to activate every account.
            </span>
          )}
          {state === "free" && sub.free_until && (
            <span className="ml-2">Free until {sub.free_until}.</span>
          )}
        </div>
        {state === "unpaid" && amount > 0 && (
          <Button size="sm" onClick={() => setPaying(true)}>Pay now</Button>
        )}
      </div>

      {paying && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-background p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-black">Pay school subscription</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {amount.toLocaleString()} {sub.currency} · activates all accounts
                </p>
              </div>
              <button onClick={() => setPaying(false)} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-5 flex gap-2">
              {["mtn", "orange"].map((op) => (
                <button
                  key={op}
                  onClick={() => setOperator(op)}
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm font-bold capitalize ${operator === op ? "border-primary bg-primary/5 text-primary" : "border-input"}`}
                >
                  {op}
                </button>
              ))}
            </div>
            <div className="relative mt-3">
              <Smartphone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="6XX XXX XXX" className="pl-9" inputMode="tel" />
            </div>
            <Button className="mt-4 w-full" disabled={busy} onClick={pay}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Pay {amount.toLocaleString()} {sub.currency}
            </Button>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              You'll get a prompt on your phone to approve the payment.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
