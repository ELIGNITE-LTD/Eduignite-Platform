"use client";

import Link from "next/link";
import { useAuth, type UserRole } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { useDashboardRoutes } from "@/components/layout/dashboard-sidebar";
import { CalendarDays, ChevronRight, HandHeart, PlaySquare, Quote } from "lucide-react";
import { cn } from "@/lib/utils";

const EXECUTIVE_ROLES: UserRole[] = ["SUPER_ADMIN", "CEO", "CTO", "COO", "INV", "DESIGNER"];

/**
 * Mobile Workspace tab: every tab from the (former) hamburger menu rendered
 * as a two-per-row grid of styled cards. Uses the exact same role-filtered
 * route registry as the sidebar, so nothing is added or removed.
 */

// Rotating tint palette so each card gets a distinct, branded accent.
const TINTS = [
  { bg: "bg-violet-50", fg: "text-violet-600" },
  { bg: "bg-emerald-50", fg: "text-emerald-600" },
  { bg: "bg-blue-50", fg: "text-blue-600" },
  { bg: "bg-orange-50", fg: "text-orange-500" },
  { bg: "bg-rose-50", fg: "text-rose-500" },
  { bg: "bg-teal-50", fg: "text-teal-600" },
  { bg: "bg-amber-50", fg: "text-amber-600" },
  { bg: "bg-indigo-50", fg: "text-indigo-600" },
];

export default function MobileWorkspacePage() {
  const { language } = useI18n();
  const { user } = useAuth();
  const routes = useDashboardRoutes();

  // The registry can map several labels to one href across roles; keep the
  // first occurrence per href so the grid shows each destination once.
  const seen = new Set<string>();
  const tiles = routes.filter((route) => {
    if (seen.has(route.href)) return false;
    seen.add(route.href);
    return true;
  });

  // Training, Support and Testimony moved here from the removed footer —
  // same features, now first-class workspace destinations (school roles only,
  // matching the footer's previous visibility).
  const isPlatformExecutive = EXECUTIVE_ROLES.includes(user?.role as UserRole);
  const isSchoolAdmin = ["SCHOOL_ADMIN", "SUB_ADMIN"].includes(user?.role || "");
  const adminTiles = isSchoolAdmin
    ? [
        {
          href: "/dashboard/school-events",
          label: language === "en" ? "Events" : "Événements",
          icon: CalendarDays,
        },
      ]
    : [];
  const engagementTiles = isPlatformExecutive
    ? []
    : [
        {
          href: "/dashboard/training",
          label: language === "en" ? "Training" : "Formation",
          icon: PlaySquare,
        },
        {
          href: "/dashboard/support-us",
          label: language === "en" ? "Support" : "Soutien",
          icon: HandHeart,
        },
        {
          href: "/dashboard/testimony",
          label: language === "en" ? "Testimony" : "Témoignage",
          icon: Quote,
        },
      ];
  const allTiles = [...tiles, ...adminTiles, ...engagementTiles];

  return (
    <div className="pb-4">
      <div className="mb-4">
        <h1 className="text-2xl font-black tracking-tight text-foreground">
          {language === "en" ? "Workspace" : "Espace de travail"}
        </h1>
        <p className="mt-0.5 text-[13px] font-medium text-muted-foreground">
          {language === "en"
            ? "Everything in your account, one tap away."
            : "Tout votre compte, à portée de main."}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {allTiles.map((route, index) => {
          const tint = TINTS[index % TINTS.length];
          return (
            <Link
              key={`${route.href}-${route.label}`}
              href={route.href}
              className="group relative flex flex-col gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/[0.03] transition-all active:scale-[0.97]"
            >
              <span
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-2xl",
                  tint.bg
                )}
              >
                <route.icon className={cn("h-[22px] w-[22px]", tint.fg)} strokeWidth={2.2} />
              </span>
              <span className="flex items-end justify-between gap-1">
                <span className="text-[13px] font-bold leading-snug text-foreground">
                  {route.label}
                </span>
                <ChevronRight className="mb-0.5 h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-active:translate-x-0.5" />
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
