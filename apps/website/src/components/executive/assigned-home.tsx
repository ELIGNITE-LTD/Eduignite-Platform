"use client";

import Link from "next/link";
import { ArrowUpRight, ClipboardList, Inbox } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { assignedActivities } from "@/lib/executive-modules";
import { usePlatformStats } from "@/lib/hooks/usePlatform";

/**
 * The home of an executive who is not a founder: only the activities the
 * founders assigned, each with a link, and a figure only where an assigned
 * module covers it. No school, fee or revenue widgets.
 */
function StatsStrip({ modules, en }: { modules: string[]; en: boolean }) {
  // Only mounted when an assigned module covers these figures, so an
  // executive without them never calls the statistics endpoint.
  const { data: stats } = usePlatformStats();
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {modules.includes("schools") && (
        <Card className="rounded-2xl border-none shadow-sm">
          <CardContent className="p-4">
            <p className="text-[10px] font-black uppercase text-muted-foreground">{en ? "Active schools" : "Ecoles actives"}</p>
            <p className="text-2xl font-black text-primary">{stats?.active_schools ?? 0}</p>
          </CardContent>
        </Card>
      )}
      {modules.includes("support") && (
        <Card className="rounded-2xl border-none shadow-sm">
          <CardContent className="p-4">
            <p className="text-[10px] font-black uppercase text-muted-foreground">{en ? "New requests" : "Nouvelles demandes"}</p>
            <p className="text-2xl font-black text-primary">{stats?.new_orders ?? 0}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function ExecutiveAssignedHome() {
  const { user } = useAuth();
  const { language } = useI18n();
  const en = language === "en";
  const modules: string[] = ((user as any)?.allowed_modules as string[]) ?? [];
  const activities = assignedActivities(modules);
  const wantsStats = modules.includes("schools") || modules.includes("support");

  // The Overview is a general tab and is never blocked: with nothing assigned
  // yet it explains that inline, with no link to another page.
  if (!activities.length) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-3 rounded-3xl border border-dashed bg-white p-8 text-center">
        <Inbox className="h-8 w-8 text-primary/50" />
        <h1 className="text-xl font-black text-primary">
          {en ? "No activity assigned yet" : "Aucune activite attribuee pour le moment"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {en
            ? "The founders (CEO or CTO) choose the activities each executive carries out. They will appear here, and in your menu, as soon as they are assigned."
            : "Les fondateurs (PDG ou DTO) choisissent les activites de chaque dirigeant. Elles apparaitront ici, et dans votre menu, des qu'elles seront attribuees."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-black text-primary">
          <ClipboardList className="h-6 w-6 text-secondary" />
          {en ? "Your assigned activities" : "Vos activites attribuees"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {en ? "The founders assigned these activities to your account." : "Les fondateurs ont attribue ces activites a votre compte."}
        </p>
      </div>

      {wantsStats && <StatsStrip modules={modules} en={en} />}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {activities.map((activity) => (
          <Link key={activity.key} href={activity.href} className="group">
            <Card className="h-full rounded-2xl border-none shadow-sm transition-shadow group-hover:shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base font-black text-primary">
                  {activity.label}
                  <ArrowUpRight className="h-4 w-4 text-primary/40" />
                </CardTitle>
                <CardDescription className="text-xs">{activity.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
