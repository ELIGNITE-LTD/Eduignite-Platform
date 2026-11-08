"use client";

import Link from "next/link";
import { Baby, ClipboardCheck, Coins, FileText, Megaphone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { useMyChildren } from "@/lib/hooks/useStudents";
import { pupilName } from "@/lib/pupil-name";
import { HomeGreeting, MoreLinks, SectionTitle, TaskTiles } from "@/components/dashboard/basic-home-ui";

/** Calm parent home for nursery/primary: greeting, my children, 4 tiles. */
export function BasicParentHome() {
  const { user } = useAuth();
  const { language } = useI18n();
  const en = language === "en";
  const { data } = useMyChildren();
  const children = data?.results ?? [];

  const tiles = [
    { href: "/dashboard/children", icon: Baby, label: en ? "My children" : "Mes enfants", tone: "bg-purple-50 text-purple-700" },
    { href: "/dashboard/report-cards", icon: FileText, label: en ? "Report cards" : "Bulletins", tone: "bg-rose-50 text-rose-700" },
    { href: "/dashboard/fees", icon: Coins, label: en ? "Fees" : "Frais scolaires", tone: "bg-amber-50 text-amber-700" },
    { href: "/dashboard/attendance", icon: ClipboardCheck, label: en ? "Attendance" : "Presences", tone: "bg-emerald-50 text-emerald-700" },
    { href: "/dashboard/announcements", icon: Megaphone, label: en ? "Announcements" : "Annonces", tone: "bg-orange-50 text-orange-700" },
  ];

  const more = [
    { href: "/dashboard/health-records", label: en ? "Health" : "Sante" },
    { href: "/dashboard/certificates", label: en ? "Certificates" : "Certificats" },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-20">
      <HomeGreeting greeting={en ? "Hello" : "Bonjour"} name={user?.name} context={user?.school?.name} />

      <section className="space-y-3">
        <SectionTitle>{en ? "My children" : "Mes enfants"}</SectionTitle>
        {children.length === 0 ? (
          <Card className="rounded-3xl border-none shadow-sm">
            <CardContent className="p-5 text-sm text-muted-foreground">
              {en ? "No child is linked to your account yet. Ask the school." : "Aucun enfant n'est lie a votre compte. Contactez l'ecole."}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {children.map((child) => (
              <Link key={child.id} href="/dashboard/children" className="block">
                <Card className="rounded-3xl border-none shadow-sm transition hover:shadow-md">
                  <CardContent className="flex items-center gap-4 p-4">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={child.user?.avatar} />
                      <AvatarFallback>{pupilName(child, "P").charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-base font-bold text-primary">{pupilName(child)}</p>
                      <p className="truncate text-sm text-muted-foreground">{child.student_class}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <SectionTitle>{en ? "What would you like to do?" : "Que voulez-vous faire ?"}</SectionTitle>
        <TaskTiles tiles={tiles} />
      </section>

      <MoreLinks label={en ? "More" : "Plus"} links={more} />
    </div>
  );
}
