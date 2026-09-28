"use client";

/**
 * Who recorded what, and when.
 *
 * A bursar and an administrator can both take a payment, confirm one and
 * adjust the ledger, so neither can tell from the figures alone which of them
 * did a thing - and if a figure looks wrong, the first question is always who
 * put it there. This answers that, for both of them, from the records
 * themselves rather than a separate log that could drift.
 */

import { useQuery } from "@tanstack/react-query";
import { Activity, Loader2, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { feesService } from "@/lib/api/services/fees.service";
import { cn } from "@/lib/utils";

const TONE: Record<string, string> = {
  "Payment recorded": "bg-sky-100 text-sky-900",
  "Payment confirmed": "bg-emerald-100 text-emerald-900",
  "Ledger updated": "bg-amber-100 text-amber-900",
  "Fee type created": "bg-slate-100 text-slate-900",
};

function when(value?: string | null): string {
  if (!value) return "";
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return "";
  return at.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function role(label?: string): string {
  return (label || "").replace(/_/g, " ").toLowerCase();
}

export function FeeActivity() {
  const activity = useQuery({
    queryKey: ["fee-activity"],
    queryFn: () => feesService.getFeeActivity(),
    staleTime: 1000 * 30,
    retry: 1,
  });

  const rows = activity.data?.results ?? [];

  return (
    <Card className="rounded-3xl border-none shadow-sm">
      <CardHeader className="gap-3 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg font-black uppercase tracking-tight text-primary">
            <Activity className="h-5 w-5 text-secondary" />
            Activity log
          </CardTitle>
          <CardDescription>
            Everything recorded on this school&apos;s fees, newest first, with who did it. The bursar
            and the administration see the same log.
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 self-start"
          onClick={() => void activity.refetch()}
          disabled={activity.isFetching}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", activity.isFetching && "animate-spin")} />
          Refresh
        </Button>
      </CardHeader>

      <CardContent>
        {activity.isLoading ? (
          <div className="flex items-center justify-center gap-3 py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-primary" /> Loading the log…
          </div>
        ) : activity.isError ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold text-amber-900">
            The log could not be loaded. It will be here when the connection is back.
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-primary/10 py-16 text-center">
            <Activity className="mx-auto h-10 w-10 text-primary/20" />
            <p className="mt-3 font-bold text-muted-foreground">
              Nothing has been recorded on fees yet.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.map((entry, index) => (
              <li
                key={`${entry.reference || entry.action}-${entry.at}-${index}`}
                className="flex flex-col gap-2 rounded-2xl border border-border p-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      className={cn(
                        "border-none text-[10px] font-black uppercase",
                        TONE[entry.action] || "bg-slate-100 text-slate-900",
                      )}
                    >
                      {entry.action}
                    </Badge>
                    {entry.subject ? (
                      <span className="truncate text-sm font-bold text-primary">{entry.subject}</span>
                    ) : null}
                  </div>
                  <p className="text-xs font-medium text-muted-foreground">
                    {entry.detail}
                    {entry.reference ? ` · ${entry.reference}` : ""}
                  </p>
                </div>

                <div className="shrink-0 text-left sm:text-right">
                  <p className="text-xs font-black text-foreground">
                    {entry.who || "Unknown"}
                    {entry.who_role ? (
                      <span className="font-semibold text-muted-foreground"> ({role(entry.who_role)})</span>
                    ) : null}
                  </p>
                  <p className="text-[11px] font-medium text-muted-foreground">{when(entry.at)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
