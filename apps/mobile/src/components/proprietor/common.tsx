"use client";

import type { ReactNode } from "react";
import { AlertTriangle, Building2, Inbox, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/lib/i18n-context";
import { resolveMediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";
import type { PlatformBilling, Rate } from "@/lib/api/services/proprietor.service";

/**
 * Small pieces shared by the founder's Proprietors section and the proprietor's
 * own area. Identical in the website, mobile and desktop apps.
 */

/** `tr("English", "Français")` in the active interface language. */
export function useTr() {
  const { language } = useI18n();
  return (en: string, fr: string) => (language === "fr" ? fr : en);
}

export function useLocale() {
  const { language } = useI18n();
  return language === "fr" ? "fr-FR" : "en-GB";
}

export function formatNumber(value: number | null | undefined, locale = "en-GB") {
  return new Intl.NumberFormat(locale).format(Number(value || 0));
}

export function formatMoney(value: string | number | null | undefined, currency = "XAF", locale = "en-GB") {
  const amount = Number(value || 0);
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(amount)} ${currency}`;
}

export function formatRate(rate: number | null | undefined) {
  return typeof rate === "number" ? `${rate.toFixed(1)}%` : "-";
}

export function formatDate(value: string | null | undefined, locale = "en-GB") {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(value: string | null | undefined, locale = "en-GB") {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(locale, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function categoryLabel(category: string | undefined, tr: (en: string, fr: string) => string) {
  if (category === "basic") return tr("Nursery & Primary", "Maternelle & Primaire");
  if (category === "secondary") return tr("Secondary", "Secondaire");
  if (category === "higher") return tr("Higher", "Supérieur");
  return category || "";
}

const CATEGORY_STYLE: Record<string, string> = {
  basic: "bg-amber-100 text-amber-800",
  secondary: "bg-sky-100 text-sky-800",
  higher: "bg-violet-100 text-violet-800",
};

export function CategoryBadge({ category }: { category?: string }) {
  const tr = useTr();
  if (!category) return null;
  return (
    <Badge className={cn("border-none px-2 text-[10px] font-bold uppercase tracking-wide", CATEGORY_STYLE[category] || "bg-gray-100 text-gray-700")}>
      {categoryLabel(category, tr)}
    </Badge>
  );
}

export function SoftBadge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Badge variant="outline" className={cn("px-2 text-[10px] font-semibold capitalize", className)}>
      {children}
    </Badge>
  );
}

export function SchoolStatusChip({ status }: { status?: string }) {
  const tr = useTr();
  const value = String(status || "").toLowerCase();
  const style =
    value === "active"
      ? "bg-green-100 text-green-700"
      : value === "pending"
        ? "bg-amber-100 text-amber-800"
        : value
          ? "bg-red-100 text-red-700"
          : "bg-gray-100 text-gray-600";
  const label =
    value === "active"
      ? tr("Active", "Actif")
      : value === "pending"
        ? tr("Pending", "En attente")
        : value === "suspended"
          ? tr("Suspended", "Suspendu")
          : status || "-";
  return <Badge className={cn("border-none px-2 text-[10px] font-bold uppercase", style)}>{label}</Badge>;
}

export function BillingChip({ billing }: { billing?: PlatformBilling | null }) {
  const tr = useTr();
  const state = billing?.state;
  if (!state) return null;
  const style =
    state === "paid" ? "bg-green-100 text-green-700" : state === "free" ? "bg-sky-100 text-sky-700" : "bg-red-100 text-red-700";
  const label =
    state === "paid" ? tr("Platform paid", "Plateforme payée") : state === "free" ? tr("Free period", "Période gratuite") : tr("Platform unpaid", "Plateforme impayée");
  return <Badge className={cn("border-none px-2 text-[10px] font-bold uppercase", style)}>{label}</Badge>;
}

/** The school's logo, or its initial when it has none. */
export function SchoolLogo({ name, logo, className }: { name: string; logo?: string | null; className?: string }) {
  const src = resolveMediaUrl(logo || "");
  return (
    <div
      className={cn(
        "flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-primary/10 bg-white text-lg font-black text-primary shadow-sm",
        className,
      )}
    >
      {src ? <img src={src} alt="" className="h-full w-full object-contain p-1" /> : name?.charAt(0)?.toUpperCase() || <Building2 className="h-5 w-5" />}
    </div>
  );
}

/** A number with a label: the building block of every KPI row. */
export function KpiTile({
  label,
  value,
  hint,
  icon,
  tone = "primary",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: "primary" | "green" | "amber" | "red" | "sky";
}) {
  const tones: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    green: "bg-green-100 text-green-700",
    amber: "bg-amber-100 text-amber-700",
    red: "bg-red-100 text-red-700",
    sky: "bg-sky-100 text-sky-700",
  };
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
        {icon ? <span className={cn("rounded-lg p-1.5", tones[tone])}>{icon}</span> : null}
      </div>
      <p className="mt-2 truncate text-2xl font-black text-primary sm:text-3xl">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Horizontal bar for a 0-100 rate; `null` shows a muted empty track. */
export function RateBar({ rate, label, className }: { rate: number | null | undefined; label?: string; className?: string }) {
  const value = typeof rate === "number" ? Math.max(0, Math.min(100, rate)) : 0;
  const color = typeof rate !== "number" ? "bg-gray-300" : value >= 85 ? "bg-green-500" : value >= 60 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className={cn("space-y-1", className)}>
      {label ? (
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-semibold text-muted-foreground">{label}</span>
          <span className="font-black text-primary">{formatRate(rate)}</span>
        </div>
      ) : null}
      <div
        className="h-2 overflow-hidden rounded-full bg-accent"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={typeof rate === "number" ? Math.round(value) : undefined}
        aria-label={label}
      >
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function rateOf(value: Rate | null | undefined) {
  return value?.rate ?? null;
}

/** Tiny bar sparkline for a list of 0-100 values. */
export function Sparkbars({ values, className, label }: { values: (number | null)[]; className?: string; label?: string }) {
  if (!values.length) return null;
  return (
    <div className={cn("flex h-8 items-end gap-0.5", className)} role="img" aria-label={label}>
      {values.map((value, index) => (
        <span
          key={index}
          className={cn("w-1.5 rounded-sm", typeof value === "number" ? "bg-primary/70" : "bg-gray-200")}
          style={{ height: `${typeof value === "number" ? Math.max(8, value) : 8}%` }}
        />
      ))}
    </div>
  );
}

export function SectionTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h2 className="text-lg font-black tracking-tight text-primary">{title}</h2>
        {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, icon, action }: { title: string; subtitle?: string; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        {icon ? <div className="shrink-0 rounded-xl bg-primary p-2.5 text-white shadow-lg">{icon}</div> : null}
        <div className="min-w-0">
          <h1 className="font-headline text-2xl font-bold text-primary sm:text-3xl">{title}</h1>
          {subtitle ? <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-white px-6 py-12 text-center">
      <div className="rounded-full bg-primary/5 p-4">
        <Inbox className="h-7 w-7 text-primary/40" />
      </div>
      <p className="text-base font-black text-primary">{title}</p>
      {text ? <p className="max-w-md text-sm text-muted-foreground">{text}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry, retrying }: { message?: string; onRetry?: () => void; retrying?: boolean }) {
  const tr = useTr();
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
      <AlertTriangle className="h-8 w-8 text-destructive" />
      <p className="text-sm font-bold text-destructive">{message || tr("We could not load this page.", "Impossible de charger cette page.")}</p>
      {onRetry ? (
        <Button type="button" variant="outline" size="sm" className="gap-2" onClick={onRetry} disabled={retrying}>
          <RefreshCw className={cn("h-4 w-4", retrying && "animate-spin")} /> {tr("Try again", "Réessayer")}
        </Button>
      ) : null}
    </div>
  );
}

export function KpiSkeletonRow({ count = 5 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-28 rounded-2xl" />
      ))}
    </div>
  );
}

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-56 rounded-3xl" />
      ))}
    </div>
  );
}

export function RowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-16 rounded-2xl" />
      ))}
    </div>
  );
}
