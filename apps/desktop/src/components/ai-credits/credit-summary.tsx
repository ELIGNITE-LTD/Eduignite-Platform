"use client";

import Link from "next/link";
import { Clock, Coins, CreditCard, Gift, History, Infinity as InfinityIcon, Sparkles, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCredits, type CreditBalance } from "@/lib/ai-credits";
import { useAiCreditBalance } from "@/lib/hooks/useAiCredits";

function resetsIn(iso: string | undefined): string {
  if (!iso) return "tomorrow";
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "shortly";
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours >= 1) return `in ${hours}h ${minutes.toString().padStart(2, "0")}m`;
  return `in ${minutes} min`;
}

/** A compact balance for the dashboard header: always there, never loud. */
export function CreditPill({ className }: { className?: string }) {
  const { data } = useAiCreditBalance();
  if (!data) return null;
  return (
    <Link
      href="/dashboard/ai-credits"
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-black transition-colors",
        data.unlimited
          ? "border-primary/15 bg-primary/5 text-primary hover:bg-primary/10"
          : data.exhausted
            ? "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"
            : data.low_balance
              ? "border-amber-200 bg-amber-50/60 text-amber-800 hover:bg-amber-50"
              : "border-primary/15 bg-secondary/15 text-primary hover:bg-secondary/25",
        className,
      )}
      title="AI credits"
    >
      <Sparkles className="h-3.5 w-3.5" />
      {data.unlimited ? (
        <span>{data.free_mode ? "AI free for now" : "Unlimited AI"}</span>
      ) : (
        <span>
          {formatCredits(data.total_available)}
          <span className="ml-1 font-bold opacity-70">credits</span>
        </span>
      )}
    </Link>
  );
}

/**
 * The AI credits card: today's free credits, credits bought, and the total.
 *
 * `onSelect` lets the credits page switch tabs in place; elsewhere the
 * buttons link to the credits page.
 */
export function CreditBalanceCard({
  balance,
  onSelect,
  className,
}: {
  balance?: CreditBalance | null;
  onSelect?: (tab: "buy" | "usage" | "history") => void;
  className?: string;
}) {
  const query = useAiCreditBalance();
  const data = balance ?? query.data;

  if (!data) {
    return <div className={cn("h-56 animate-pulse rounded-3xl bg-primary/5", className)} />;
  }

  const freePercent = data.daily_free_limit
    ? Math.min(100, Math.round((data.daily_free_remaining / data.daily_free_limit) * 100))
    : 0;

  const action = (tab: "buy" | "usage" | "history", label: string, Icon: typeof Coins, primary = false) =>
    onSelect ? (
      <Button
        key={tab}
        variant={primary ? "secondary" : "ghost"}
        size="sm"
        className={cn("h-9 rounded-xl font-bold", primary ? "" : "text-white hover:bg-white/10 hover:text-white")}
        onClick={() => onSelect(tab)}
      >
        <Icon className="mr-1.5 h-4 w-4" />
        {label}
      </Button>
    ) : (
      <Button
        key={tab}
        asChild
        variant={primary ? "secondary" : "ghost"}
        size="sm"
        className={cn("h-9 rounded-xl font-bold", primary ? "" : "text-white hover:bg-white/10 hover:text-white")}
      >
        <Link href={`/dashboard/ai-credits?tab=${tab}`}>
          <Icon className="mr-1.5 h-4 w-4" />
          {label}
        </Link>
      </Button>
    );

  return (
    <div className={cn("overflow-hidden rounded-3xl bg-primary text-white shadow-xl", className)}>
      <div className="flex items-center justify-between gap-3 px-6 pt-6">
        <div className="flex items-center gap-2.5">
          <div className="rounded-xl bg-white/10 p-2">
            <Sparkles className="h-4 w-4 text-secondary" />
          </div>
          <h2 className="text-sm font-black uppercase tracking-[0.2em]">AI Credits</h2>
        </div>
        {data.unlimited ? null : (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-white/60">
            <Clock className="h-3 w-3" /> Free credits refresh {resetsIn(data.next_reset_at)}
          </span>
        )}
      </div>

      {data.unlimited ? (
        <div className="flex items-center gap-3 px-6 py-8">
          <InfinityIcon className="h-9 w-9 text-secondary" />
          <div>
            <p className="text-xl font-black">{data.free_mode ? "Free for now" : "Unlimited"}</p>
            <p className="text-xs text-white/60">
              {data.free_mode
                ? "EduIgnite AI is free to use while it is being tested. No credits are used."
                : "Executive accounts are not charged. Usage is still recorded."}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 px-6 py-6 sm:grid-cols-3">
          <div className="space-y-2 sm:col-span-1">
            <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-white/50">
              <Gift className="h-3.5 w-3.5" /> Daily free
            </p>
            <p className="text-2xl font-black">
              {formatCredits(data.daily_free_remaining)}
              <span className="text-sm font-bold text-white/50"> / {formatCredits(data.daily_free_limit)}</span>
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
              <div className="h-full rounded-full bg-secondary transition-all" style={{ width: `${freePercent}%` }} />
            </div>
          </div>
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-white/50">
              <CreditCard className="h-3.5 w-3.5" /> Purchased
            </p>
            <p className="text-2xl font-black">{formatCredits(data.purchased_balance)}</p>
            <p className="text-[11px] text-white/50">Kept until you use them</p>
          </div>
          <div className="space-y-2 rounded-2xl bg-white/10 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/60">Total available</p>
            <p className="text-3xl font-black text-secondary">{formatCredits(data.total_available)}</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-white/10 bg-black/10 px-4 py-3">
        {data.unlimited ? null : action("buy", "Buy credits", Coins, true)}
        {action("usage", "Usage", Zap)}
        {action("history", "History", History)}
      </div>
    </div>
  );
}

/** A quiet line when the balance is getting low. Never a pop-up. */
export function LowCreditNotice({ balance, className }: { balance?: CreditBalance | null; className?: string }) {
  if (!balance || balance.unlimited || !balance.low_balance || balance.exhausted) return null;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900",
        className,
      )}
    >
      <span className="font-bold">
        <Zap className="mr-1 inline h-3.5 w-3.5" />
        You&apos;re running low on AI credits. {formatCredits(balance.total_available)} credits remaining.
      </span>
      {balance.purchases_enabled ? (
        <Link href="/dashboard/ai-credits?tab=buy" className="font-black underline underline-offset-2">
          Buy credits
        </Link>
      ) : null}
    </div>
  );
}

/** Shown only when free and bought credits are both gone. */
export function OutOfCreditsPanel({ balance, className }: { balance?: CreditBalance | null; className?: string }) {
  if (!balance || balance.unlimited || !balance.exhausted) return null;
  return (
    <div className={cn("rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center", className)}>
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
        <Zap className="h-5 w-5" />
      </div>
      <p className="mt-3 text-sm font-black text-amber-900">You&apos;re out of AI credits.</p>
      <p className="mx-auto mt-1 max-w-sm text-xs font-medium leading-relaxed text-amber-800">
        You&apos;ve used today&apos;s {formatCredits(balance.daily_free_limit)} free AI credits. Your free credits will
        refresh {resetsIn(balance.next_reset_at)}.
        {balance.purchases_enabled ? " You can also purchase additional credits and continue learning now." : ""}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {balance.purchases_enabled ? (
          <Link
            href="/dashboard/ai-credits?tab=buy"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-black uppercase tracking-widest text-white transition-transform hover:-translate-y-0.5"
          >
            <Coins className="h-3.5 w-3.5" />
            Buy AI credits
          </Link>
        ) : null}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-xl border border-amber-300 px-5 py-2.5 text-xs font-black uppercase tracking-widest text-amber-900 hover:bg-amber-100"
        >
          Wait until tomorrow
        </Link>
      </div>
    </div>
  );
}
