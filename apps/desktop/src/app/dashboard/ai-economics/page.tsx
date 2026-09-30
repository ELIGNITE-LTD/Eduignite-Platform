"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Calculator, Coins, Loader2, Save, Search, Settings2, Sparkles, TrendingUp, Users } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api/errors";
import { aiCreditsService } from "@/lib/api/services/ai-credits.service";
import { formatCredits, formatFcfa, type CreditBalance, type CreditTransaction } from "@/lib/ai-credits";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const EXECUTIVE_ROLES = ["SUPER_ADMIN", "CEO", "CTO", "COO", "INV", "DESIGNER"];
const PRICING_ROLES = ["SUPER_ADMIN", "CEO", "CTO"];
const WINDOWS = [7, 30, 90, 365];
const BAR = "hsl(var(--primary))";

function Tile({ label, value, hint, icon: Icon }: { label: string; value: string; hint?: string; icon?: typeof Coins }) {
  return (
    <div className="rounded-3xl border border-primary/10 bg-white p-5">
      <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
        {label}
      </p>
      <p className="mt-2 text-2xl font-black text-primary">{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function DailyChart({ data, dataKey, label, format }: {
  data: any[];
  dataKey: string;
  label: string;
  format: (value: number) => string;
}) {
  return (
    <div className="rounded-3xl border border-primary/10 bg-white p-5">
      <h3 className="mb-3 text-sm font-black text-primary">{label}</h3>
      {data.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No AI use in this period.</p>
      ) : (
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.6} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={11} tickFormatter={(value) => String(value).slice(5)} />
              <YAxis tickLine={false} axisLine={false} fontSize={11} width={48} />
              <Tooltip
                cursor={{ fill: "hsl(var(--primary) / 0.06)" }}
                formatter={(value: number) => [format(value), label]}
                labelFormatter={(value) => new Date(`${value}T00:00:00`).toLocaleDateString()}
                contentStyle={{ borderRadius: 12, fontSize: 12 }}
              />
              <Bar dataKey={dataKey} fill={BAR} radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function Overview({ days }: { days: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["ai-credits", "economics", days],
    queryFn: () => aiCreditsService.getEconomics(days),
  });

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary/40" />
      </div>
    );
  }

  const { credits, money, activity, pricing_insight: insight } = data;
  const margin = money.gross_margin_percent;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile icon={Sparkles} label="Credits issued" value={formatCredits(credits.issued_total)}
              hint={`${formatCredits(credits.free_issued)} free · ${formatCredits(credits.purchased_sold)} sold`} />
        <Tile label="Credits consumed" value={formatCredits(credits.consumed)}
              hint={`${formatCredits(credits.free_used)} free · ${formatCredits(credits.purchased_used)} purchased`} />
        <Tile label="Free credits used" value={formatCredits(credits.free_used)}
              hint={`${formatCredits(credits.free_expired_unused)} expired unused`} />
        <Tile label="Purchased credits" value={formatCredits(credits.purchased_sold)}
              hint={`${formatCredits(money.purchases)} purchases`} />
        <Tile icon={Coins} label="Credit revenue" value={formatFcfa(money.credit_revenue)} />
        <Tile label="AI provider cost" value={formatFcfa(money.provider_cost)}
              hint={money.payment_processing_cost || money.infrastructure_cost
                ? `+ ${formatFcfa(money.payment_processing_cost + money.infrastructure_cost)} fees & servers`
                : undefined} />
        <Tile icon={TrendingUp} label="Estimated gross margin" value={formatFcfa(money.gross_margin)}
              hint={margin == null ? "No credit sales yet" : `${margin}% of revenue`} />
        <Tile icon={Users} label="Active AI users" value={formatCredits(activity.active_users)}
              hint={`${formatCredits(activity.requests)} requests · ${activity.failed_requests} failed, not charged`} />
        <Tile label="Avg credits / user / day" value={String(activity.avg_credits_per_user_per_day)} />
        <Tile label="Avg credits / request" value={String(activity.avg_credits_per_request)}
              hint={`${formatCredits(activity.avg_input_tokens)} in · ${formatCredits(activity.avg_output_tokens)} out tokens`} />
        <Tile label="Avg AI cost / request" value={formatFcfa(activity.avg_cost_per_request)}
              hint={`${activity.avg_cost_per_request} FCFA exact`} />
        <Tile label="Estimate accuracy" value={activity.estimate_accuracy_percent == null ? "-" : `${activity.estimate_accuracy_percent}%`}
              hint="Actual credits as a share of the estimates held" />
      </div>

      <div className="rounded-3xl border border-primary/10 bg-white p-6">
        <h3 className="flex items-center gap-2 text-sm font-black text-primary">
          <Calculator className="h-4 w-4" /> Setting the price of a credit
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Worked out from real usage in this period. Provider rates come from the configuration; check them against the
          invoice.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label="AI cost per credit" value={`${insight.provider_cost_per_credit} FCFA`} />
          <Tile label="Break-even price per credit" value={`${insight.break_even_price_per_credit} FCFA`}
                hint="Provider cost plus the payment gateway's share" />
          <Tile label="Current price per credit"
                value={insight.current_price_per_credit == null ? "Not set" : `${insight.current_price_per_credit} FCFA`}
                hint={insight.current_price_per_credit == null ? "Purchases are closed until it is set" : undefined} />
          <Tile label="Free allowance cost / user / day"
                value={`${insight.cost_of_free_allowance_per_user_day} FCFA`}
                hint={`At ${insight.avg_free_credits_used_per_user_day} credits used; ${insight.cost_of_full_free_allowance_per_user_day} FCFA if all ${insight.daily_free_credits} are used`} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <DailyChart data={data.daily} dataKey="credits_worth" label="Credits of AI work per day" format={(v) => `${formatCredits(v)} credits`} />
        <DailyChart data={data.daily} dataKey="provider_cost" label="AI provider cost per day" format={(v) => formatFcfa(v)} />
      </div>

      <div className="overflow-hidden rounded-3xl border border-primary/10 bg-white">
        <div className="border-b border-primary/5 px-6 py-4">
          <h3 className="text-sm font-black text-primary">Which features use the most credits</h3>
          <p className="text-xs text-muted-foreground">Share of all AI work, including executives&apos; uncharged use.</p>
        </div>
        {data.by_feature.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No AI use in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-accent/20 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-6 py-2.5">Feature</th>
                  <th className="px-3 py-2.5">Usage</th>
                  <th className="px-3 py-2.5 text-right">Requests</th>
                  <th className="px-3 py-2.5 text-right">Credits</th>
                  <th className="px-3 py-2.5 text-right">Avg / request</th>
                  <th className="px-6 py-2.5 text-right">AI cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary/5">
                {data.by_feature.map((row: any) => (
                  <tr key={row.feature}>
                    <td className="px-6 py-3 font-bold">{row.label}</td>
                    <td className="min-w-[10rem] px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-primary/5">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${row.share_percent}%` }} />
                        </div>
                        <span className="w-12 text-right text-xs font-bold">{row.share_percent}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right">{formatCredits(row.requests)}</td>
                    <td className="px-3 py-3 text-right">{formatCredits(row.credits_worth)}</td>
                    <td className="px-3 py-3 text-right">{row.avg_credits_per_request}</td>
                    <td className="px-6 py-3 text-right">{formatFcfa(row.provider_cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const NUMBER_FIELDS: { key: string; label: string; hint?: string; step?: string }[] = [
  { key: "daily_free_credits", label: "Daily free credits" },
  { key: "price_per_credit", label: "Price per credit (FCFA)", hint: "Leave empty to keep purchases closed", step: "0.0001" },
  { key: "min_purchase_credits", label: "Minimum purchase (credits)" },
  { key: "max_purchase_credits", label: "Maximum purchase (credits)" },
  { key: "credits_per_1k_input_tokens", label: "Credits per 1,000 input tokens", step: "0.001" },
  { key: "credits_per_1k_cached_input_tokens", label: "Credits per 1,000 cached input tokens", step: "0.001" },
  { key: "credits_per_1k_output_tokens", label: "Credits per 1,000 output tokens", step: "0.001" },
  { key: "minimum_charge", label: "Minimum charge per request" },
  { key: "per_document_credits", label: "Credits per attached document" },
  { key: "per_image_credits", label: "Credits per photo sent with a question" },
  { key: "estimated_tokens_per_image", label: "Tokens per photo (estimates only)" },
  { key: "cached_response_credits", label: "Cached answer cost (credits)" },
  { key: "confirm_above_credits", label: "Ask before requests above (credits)" },
  { key: "low_balance_threshold", label: "Low balance warning at (credits)" },
  { key: "hold_timeout_minutes", label: "Return stuck holds after (minutes)" },
  { key: "payment_processing_percent", label: "Payment gateway share (%)", step: "0.01" },
  { key: "infrastructure_cost_per_request", label: "Server cost per request (FCFA)", step: "0.0001" },
];
const JSON_FIELDS: { key: string; label: string; hint: string }[] = [
  { key: "feature_multipliers", label: "Feature multipliers", hint: "How much heavier each feature is than a chat answer." },
  { key: "model_multipliers", label: "Model multipliers", hint: "How much each AI model costs relative to the default." },
  { key: "feature_estimates", label: "Feature estimates (tokens)", hint: "Typical input and output tokens, used only to estimate." },
  { key: "provider_costs", label: "Provider costs (FCFA per million tokens)", hint: "From the AI provider's invoice." },
];

function Configuration({ canEdit }: { canEdit: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["ai-credits", "config"], queryFn: () => aiCreditsService.getConfig() });
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    const next: Record<string, string> = {};
    NUMBER_FIELDS.forEach(({ key }) => (next[key] = data[key] == null ? "" : String(data[key])));
    JSON_FIELDS.forEach(({ key }) => (next[key] = JSON.stringify(data[key] ?? {}, null, 2)));
    next.partial_response_policy = data.partial_response_policy;
    next.exempt_platform_executives = String(Boolean(data.exempt_platform_executives));
    setForm(next);
  }, [data]);

  const save = async () => {
    const payload: Record<string, any> = {};
    try {
      NUMBER_FIELDS.forEach(({ key }) => {
        payload[key] = form[key] === "" ? null : form[key];
      });
      JSON_FIELDS.forEach(({ key, label }) => {
        try {
          payload[key] = JSON.parse(form[key] || "{}");
        } catch {
          throw new Error(`${label} is not valid JSON.`);
        }
      });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Check the configuration", description: error.message });
      return;
    }
    payload.partial_response_policy = form.partial_response_policy;
    payload.exempt_platform_executives = form.exempt_platform_executives === "true";
    setSaving(true);
    try {
      await aiCreditsService.updateConfig(payload);
      await queryClient.invalidateQueries({ queryKey: ["ai-credits"] });
      toast({ title: "Saved", description: "The new AI credit rules apply from the next request." });
    } catch (error) {
      toast({ variant: "destructive", title: "Not saved", description: getApiErrorMessage(error, "Please check the values.") });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary/40" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {canEdit ? null : (
        <p className="rounded-2xl bg-accent/30 px-4 py-3 text-xs text-muted-foreground">
          Only the CEO, CTO or Super Admin can change AI credit pricing.
        </p>
      )}
      <div className="grid gap-4 rounded-3xl border border-primary/10 bg-white p-6 sm:grid-cols-2 lg:grid-cols-3">
        {NUMBER_FIELDS.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <Label htmlFor={field.key} className="text-xs font-bold">{field.label}</Label>
            <Input
              id={field.key}
              type="number"
              step={field.step || "1"}
              min="0"
              value={form[field.key] ?? ""}
              disabled={!canEdit}
              onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
              className="rounded-xl"
            />
            {field.hint ? <p className="text-[11px] text-muted-foreground">{field.hint}</p> : null}
          </div>
        ))}
        <div className="space-y-1.5">
          <Label htmlFor="partial" className="text-xs font-bold">Answer cut off at its length limit</Label>
          <select
            id="partial"
            value={form.partial_response_policy || "charge_actual"}
            disabled={!canEdit}
            onChange={(event) => setForm({ ...form, partial_response_policy: event.target.value })}
            className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
          >
            <option value="charge_actual">Charge what was generated</option>
            <option value="charge_half">Charge half</option>
            <option value="refund">Charge nothing</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="exempt" className="text-xs font-bold">Executives</Label>
          <select
            id="exempt"
            value={form.exempt_platform_executives || "true"}
            disabled={!canEdit}
            onChange={(event) => setForm({ ...form, exempt_platform_executives: event.target.value })}
            className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
          >
            <option value="true">Not charged (usage still recorded)</option>
            <option value="false">Charged like everyone else</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {JSON_FIELDS.map((field) => (
          <div key={field.key} className="space-y-1.5 rounded-3xl border border-primary/10 bg-white p-5">
            <Label htmlFor={field.key} className="text-xs font-bold">{field.label}</Label>
            <p className="text-[11px] text-muted-foreground">{field.hint}</p>
            <Textarea
              id={field.key}
              value={form[field.key] ?? ""}
              disabled={!canEdit}
              onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
              className="min-h-[12rem] rounded-xl font-mono text-xs"
              spellCheck={false}
            />
          </div>
        ))}
      </div>

      {canEdit ? (
        <div className="flex items-center justify-between gap-4">
          <p className="text-[11px] text-muted-foreground">
            {data.updated_by_name ? `Last changed by ${data.updated_by_name}, ` : ""}
            {data.updated_at ? new Date(data.updated_at).toLocaleString() : ""}
          </p>
          <Button className="rounded-xl font-bold" onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save configuration
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Accounts({ canAdjust }: { canAdjust: boolean }) {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [account, setAccount] = useState<{ user: any; balance: CreditBalance; history: CreditTransaction[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const [adjustment, setAdjustment] = useState({ amount: "", kind: "BONUS", reason: "" });
  const [saving, setSaving] = useState(false);

  const find = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      setAccount(await aiCreditsService.lookupAccount(query.trim()));
    } catch (error) {
      setAccount(null);
      toast({ variant: "destructive", title: "Not found", description: getApiErrorMessage(error, "No such user.") });
    } finally {
      setSearching(false);
    }
  };

  const adjust = async () => {
    if (!account) return;
    setSaving(true);
    try {
      await aiCreditsService.adjust({
        user: account.user.id,
        amount: Number(adjustment.amount),
        kind: adjustment.kind,
        reason: adjustment.reason,
      });
      setAdjustment({ amount: "", kind: "BONUS", reason: "" });
      setAccount(await aiCreditsService.lookupAccount(account.user.id));
      toast({ title: "Adjusted", description: "The change is on the ledger with your reason." });
    } catch (error) {
      toast({ variant: "destructive", title: "Not adjusted", description: getApiErrorMessage(error, "Please check the values.") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="Matricule, email or user id"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && void find()}
          className="h-11 rounded-xl"
        />
        <Button className="h-11 rounded-xl" onClick={() => void find()} disabled={searching}>
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </div>

      {account ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-3xl border border-primary/10 bg-white p-6">
            <p className="text-lg font-black text-primary">{account.user.name}</p>
            <p className="text-xs text-muted-foreground">
              {account.user.matricule} · {account.user.role} · {account.user.email}
            </p>
            <div className="grid grid-cols-3 gap-3 pt-2">
              <Tile label="Daily free" value={`${account.balance.daily_free_remaining}/${account.balance.daily_free_limit}`} />
              <Tile label="Purchased" value={formatCredits(account.balance.purchased_balance)} />
              <Tile label="Total" value={account.balance.unlimited ? "Unlimited" : formatCredits(account.balance.total_available)} />
            </div>
            {canAdjust ? (
              <div className="space-y-2 border-t border-primary/5 pt-4">
                <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Adjust credits</p>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    placeholder="+200 or -50"
                    value={adjustment.amount}
                    onChange={(event) => setAdjustment({ ...adjustment, amount: event.target.value })}
                    className="rounded-xl"
                  />
                  <select
                    value={adjustment.kind}
                    onChange={(event) => setAdjustment({ ...adjustment, kind: event.target.value })}
                    className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                  >
                    <option value="BONUS">Bonus</option>
                    <option value="REFUND">Refund</option>
                    <option value="ADMIN_ADJUSTMENT">Adjustment</option>
                  </select>
                </div>
                <Input
                  placeholder="Reason (kept on the ledger)"
                  value={adjustment.reason}
                  onChange={(event) => setAdjustment({ ...adjustment, reason: event.target.value })}
                  className="rounded-xl"
                />
                <Button
                  className="w-full rounded-xl font-bold"
                  onClick={() => void adjust()}
                  disabled={saving || !adjustment.amount || !adjustment.reason.trim()}
                >
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Apply
                </Button>
                <p className="text-[11px] text-muted-foreground">Added credits go to the purchased balance and do not expire.</p>
              </div>
            ) : null}
          </div>
          <div className="overflow-hidden rounded-3xl border border-primary/10 bg-white">
            <p className="border-b border-primary/5 px-5 py-3 text-xs font-black uppercase tracking-widest text-primary/70">
              Recent ledger
            </p>
            <ul className="max-h-[26rem] divide-y divide-primary/5 overflow-y-auto">
              {account.history.map((row) => (
                <li key={row.id} className="flex justify-between gap-3 px-5 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-bold">{row.feature_label || row.description || row.kind_label}</p>
                    <p className="text-[11px] text-muted-foreground">{new Date(row.created_at).toLocaleString()} · {row.kind_label}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={cn("font-black", row.amount > 0 ? "text-green-700" : "")}>
                      {row.amount > 0 ? "+" : ""}{formatCredits(row.amount)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">= {formatCredits(row.balance_after)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function AiEconomicsPage() {
  const { user } = useAuth();
  const [days, setDays] = useState(30);
  const role = (user?.role || "").toUpperCase();
  const isExecutive = EXECUTIVE_ROLES.includes(role);
  const canPrice = useMemo(() => PRICING_ROLES.includes(role), [role]);

  if (!isExecutive) {
    return <p className="py-20 text-center text-sm text-muted-foreground">This page is for EduIgnite executives.</p>;
  }

  return (
    <div className="space-y-6 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary p-2 shadow-sm">
            <TrendingUp className="h-5 w-5 text-secondary" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-primary">AI Economics</h1>
            <p className="text-sm text-muted-foreground">What AI use costs, what credits earn, and the rules that price them.</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList className="h-11 rounded-2xl">
            <TabsTrigger value="overview" className="rounded-xl font-bold">Overview</TabsTrigger>
            <TabsTrigger value="config" className="rounded-xl font-bold">
              <Settings2 className="mr-1.5 h-4 w-4" /> Configuration
            </TabsTrigger>
            <TabsTrigger value="accounts" className="rounded-xl font-bold">Accounts</TabsTrigger>
          </TabsList>
          <div className="flex gap-1.5">
            {WINDOWS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setDays(value)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-bold",
                  days === value ? "border-primary bg-primary text-white" : "border-primary/15 text-primary hover:bg-primary/5",
                )}
              >
                {value === 365 ? "1 year" : `${value} days`}
              </button>
            ))}
          </div>
        </div>
        <TabsContent value="overview" className="mt-5">
          <Overview days={days} />
        </TabsContent>
        <TabsContent value="config" className="mt-5">
          <Configuration canEdit={canPrice} />
        </TabsContent>
        <TabsContent value="accounts" className="mt-5">
          <Accounts canAdjust={canPrice} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
