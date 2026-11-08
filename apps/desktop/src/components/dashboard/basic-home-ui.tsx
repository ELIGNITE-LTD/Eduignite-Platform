"use client";

import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

type IconType = ComponentType<{ className?: string }>;

/** Calm greeting band shared by the nursery/primary home screens. */
export function HomeGreeting({ greeting, name, context, badge }: { greeting: string; name?: string; context?: string; badge?: ReactNode }) {
  return (
    <header className="rounded-3xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6 sm:p-8">
      <p className="text-sm font-semibold text-muted-foreground">{greeting}</p>
      <h1 className="mt-1 text-2xl font-black tracking-tight text-primary sm:text-4xl">{name}</h1>
      {context || badge ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {context ? <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-primary shadow-sm">{context}</span> : null}
          {badge}
        </div>
      ) : null}
    </header>
  );
}

export interface HomeStat {
  icon: IconType;
  label: string;
  value: string;
  tone: string; // tailwind classes for the icon chip
}

/** ONE row of at most four key numbers. */
export function StatRow({ stats }: { stats: HomeStat[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {stats.slice(0, 4).map(({ icon: Icon, label, value, tone }) => (
        <Card key={label} className="rounded-3xl border-none shadow-sm">
          <CardContent className="flex flex-col gap-3 p-4 sm:p-5">
            <span className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl ${tone}`}>
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <p className="break-words text-2xl font-black leading-none text-primary sm:text-3xl">{value}</p>
              <p className="mt-1.5 text-xs font-medium leading-snug text-muted-foreground sm:text-sm">{label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export interface HomeTile {
  href: string;
  icon: IconType;
  label: string;
  tone: string;
}

/** Big task tiles (six at most on the main grid). */
export function TaskTiles({ tiles }: { tiles: HomeTile[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
      {tiles.slice(0, 6).map(({ href, icon: Icon, label, tone }) => (
        <Link key={href} href={href} className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-3xl">
          <Card className="h-full rounded-3xl border-none shadow-sm transition group-hover:-translate-y-0.5 group-hover:shadow-md">
            <CardContent className="flex min-h-[7.5rem] flex-col items-center justify-center gap-3 p-4 text-center sm:min-h-[8.5rem]">
              <span className={`flex h-14 w-14 items-center justify-center rounded-2xl ${tone}`}>
                <Icon className="h-7 w-7" />
              </span>
              <span className="text-sm font-bold leading-tight text-primary sm:text-base">{label}</span>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

/** Collapsed list of everything else, so the main screen stays quiet. */
export function MoreLinks({ label, links }: { label: string; links: Array<{ href: string; label: string }> }) {
  if (links.length === 0) return null;
  return (
    <details className="rounded-3xl bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between rounded-3xl px-5 py-4 text-sm font-bold text-primary hover:bg-accent/30">
        {label}
        <ChevronRight className="h-4 w-4" />
      </summary>
      <div className="grid gap-1 px-3 pb-3 sm:grid-cols-2">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className="rounded-2xl px-3 py-3 text-sm font-semibold text-primary hover:bg-accent/40">
            {link.label}
          </Link>
        ))}
      </div>
    </details>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="px-1 text-sm font-black uppercase tracking-widest text-muted-foreground">{children}</h2>;
}
