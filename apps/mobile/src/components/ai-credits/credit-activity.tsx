"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { aiCreditsService } from "@/lib/api/services/ai-credits.service";
import { formatCredits, type CreditTransaction } from "@/lib/ai-credits";
import { aiCreditKeys } from "@/lib/hooks/useAiCredits";

const FILTERS = [
  { value: "", label: "Everything" },
  { value: "AI_USAGE", label: "AI use" },
  { value: "PURCHASE,BONUS,REFUND,ADMIN_ADJUSTMENT", label: "Added" },
  { value: "DAILY_FREE,DAILY_EXPIRY", label: "Daily free" },
];

function dayLabel(date: Date): string {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function title(row: CreditTransaction): string {
  if (row.kind === "AI_USAGE") return row.feature_label || row.description || "AI use";
  return row.description || row.kind_label;
}

/** Every credit in and out, grouped by day, newest first. */
export function CreditHistory() {
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState("");
  const { data, isLoading, isFetching } = useQuery({
    queryKey: aiCreditKeys.history(page, kind),
    queryFn: () => aiCreditsService.getHistory({ page, page_size: 30, kind: kind || undefined }),
    placeholderData: (previous) => previous,
  });

  const groups = useMemo(() => {
    const rows = data?.results ?? [];
    const byDay: { label: string; rows: CreditTransaction[] }[] = [];
    for (const row of rows) {
      const label = dayLabel(new Date(row.created_at));
      const last = byDay[byDay.length - 1];
      if (last && last.label === label) last.rows.push(row);
      else byDay.push({ label, rows: [row] });
    }
    return byDay;
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <button
            key={filter.value || "all"}
            type="button"
            onClick={() => {
              setKind(filter.value);
              setPage(1);
            }}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-bold transition-colors",
              kind === filter.value ? "border-primary bg-primary text-white" : "border-primary/15 text-primary hover:bg-primary/5",
            )}
          >
            {filter.label}
          </button>
        ))}
        {isFetching && !isLoading ? <Loader2 className="h-4 w-4 animate-spin self-center text-primary/50" /> : null}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary/40" />
        </div>
      ) : groups.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-primary/15 py-12 text-center text-sm text-muted-foreground">
          No credit activity yet.
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.label} className="overflow-hidden rounded-3xl border border-primary/10 bg-white">
            <h4 className="border-b border-primary/5 bg-accent/20 px-5 py-2.5 text-[11px] font-black uppercase tracking-widest text-primary/70">
              {group.label}
            </h4>
            <ul className="divide-y divide-primary/5">
              {group.rows.map((row) => (
                <li key={row.id} className="flex items-start justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-foreground">{title(row)}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(row.created_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                      {" · "}
                      {row.kind_label}
                      {row.kind === "AI_USAGE" && row.free_delta && row.purchased_delta
                        ? ` · ${formatCredits(-row.free_delta)} free + ${formatCredits(-row.purchased_delta)} purchased`
                        : ""}
                      {row.reference_id && row.kind === "PURCHASE" ? ` · Ref ${row.reference_id.replace(/^gw:/, "")}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={cn("text-sm font-black", row.amount > 0 ? "text-green-700" : "text-foreground")}>
                      {row.amount > 0 ? "+" : "-"}
                      {formatCredits(Math.abs(row.amount))}
                    </p>
                    <p className="text-[11px] text-muted-foreground">Balance {formatCredits(row.balance_after)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {data && (data.previous || data.next) ? (
        <div className="flex justify-between">
          <Button variant="outline" className="rounded-xl" disabled={!data.previous} onClick={() => setPage((p) => p - 1)}>
            Newer
          </Button>
          <Button variant="outline" className="rounded-xl" disabled={!data.next} onClick={() => setPage((p) => p + 1)}>
            Older
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Where the credits went: by feature, over the last month. */
export function CreditUsage() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useQuery({
    queryKey: aiCreditKeys.usage(days),
    queryFn: () => aiCreditsService.getUsage(days),
  });

  const peak = Math.max(1, ...(data?.daily ?? []).map((day) => day.credits));

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {[7, 30, 90].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setDays(value)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-bold",
              days === value ? "border-primary bg-primary text-white" : "border-primary/15 text-primary hover:bg-primary/5",
            )}
          >
            Last {value} days
          </button>
        ))}
      </div>

      {isLoading || !data ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary/40" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="space-y-4 rounded-3xl border border-primary/10 bg-white p-6 lg:col-span-3">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-black uppercase tracking-widest text-primary">By feature</h3>
              <p className="text-xs text-muted-foreground">
                {formatCredits(data.total_credits)} credits · {formatCredits(data.requests)} requests
              </p>
            </div>
            {data.by_feature.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No AI use in this period.</p>
            ) : (
              <ul className="space-y-3">
                {data.by_feature.map((row) => (
                  <li key={row.feature} className="space-y-1">
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="font-bold">{row.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatCredits(row.credits)} credits · {row.share_percent}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-primary/5">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${row.share_percent}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-3xl border border-primary/10 bg-white p-6 lg:col-span-2">
            <h3 className="mb-4 text-sm font-black uppercase tracking-widest text-primary">Day by day</h3>
            {data.daily.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nothing yet.</p>
            ) : (
              <div className="flex h-40 items-end gap-1" role="img" aria-label="Credits used per day">
                {data.daily.map((day) => (
                  <div
                    key={day.date}
                    className="flex-1 rounded-t bg-secondary"
                    style={{ height: `${Math.max(4, (day.credits / peak) * 100)}%` }}
                    title={`${day.date}: ${formatCredits(day.credits)} credits`}
                  />
                ))}
              </div>
            )}
            <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
              Simple questions use a few credits; long explanations, worked problems and generated exams or reports use
              more. You are charged for the work actually done.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
