"use client";

import { useState } from "react";
import Link from "next/link";
import { Award, CheckCircle2, ClipboardCheck, FileText, ShieldCheck, UserCheck, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { useMyClasses } from "@/lib/hooks/useClassTeachers";
import { useDailyRoster } from "@/lib/hooks/useAttendance";
import { HomeGreeting, MoreLinks, SectionTitle, StatRow, TaskTiles } from "@/components/dashboard/basic-home-ui";

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Calm class-teacher home for nursery/primary: greeting + class, 2 numbers, today, 5 tiles. */
export function BasicTeacherHome() {
  const { user } = useAuth();
  const { language } = useI18n();
  const en = language === "en";
  const { data, isLoading } = useMyClasses(true);
  const classes = data?.classes ?? [];
  const [picked, setPicked] = useState<string>("");
  const current = classes.find((c) => c.id === picked) ?? classes[0];
  const [today] = useState(todayIso);
  const { data: roster } = useDailyRoster(current?.id ?? "", today);

  const learners = roster?.learners ?? [];
  const pupils = learners.length;
  const marked = learners.filter((l) => l.status).length;
  const present = learners.filter((l) => l.status === "present" || l.status === "late").length;
  const registerTaken = marked > 0;
  const rate = registerTaken ? Math.round((present / marked) * 100) : null;

  const stats = [
    { icon: Users, label: en ? "Pupils" : "Eleves", value: String(pupils), tone: "bg-purple-50 text-purple-700" },
    {
      icon: UserCheck,
      label: registerTaken ? (en ? "Present today" : "Presents aujourd'hui") : (en ? "Register not taken yet" : "Appel pas encore fait"),
      value: rate === null ? "-" : `${rate}%`,
      tone: "bg-emerald-50 text-emerald-700",
    },
  ];

  const tiles = [
    { href: "/dashboard/attendance", icon: ClipboardCheck, label: en ? "Take attendance" : "Faire l'appel", tone: "bg-emerald-50 text-emerald-700" },
    { href: "/dashboard/class-marks", icon: Award, label: en ? "Enter marks" : "Saisir les notes", tone: "bg-amber-50 text-amber-700" },
    { href: "/dashboard/my-class", icon: Users, label: en ? "Pupils" : "Eleves", tone: "bg-purple-50 text-purple-700" },
    { href: "/dashboard/conduct", icon: ShieldCheck, label: en ? "Conduct" : "Conduite", tone: "bg-sky-50 text-sky-700" },
    { href: "/dashboard/report-cards", icon: FileText, label: en ? "Report cards" : "Bulletins", tone: "bg-rose-50 text-rose-700" },
  ];

  const more = [{ href: "/dashboard/health-records", label: en ? "Health & certificates" : "Sante et certificats" }];

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-20">
      <HomeGreeting
        greeting={en ? "Hello" : "Bonjour"}
        name={user?.name}
        context={current ? `${current.name}${user?.school?.name ? ` · ${user.school.name}` : ""}` : user?.school?.name}
      />

      {classes.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {classes.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setPicked(c.id)}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${c.id === current?.id ? "border-primary bg-primary text-white" : "border-primary/20 bg-white text-primary hover:bg-primary/5"}`}
            >
              {c.name}
            </button>
          ))}
        </div>
      ) : null}

      {isLoading ? (
        <p className="px-1 text-sm text-muted-foreground">{en ? "Loading..." : "Chargement..."}</p>
      ) : !current ? (
        <Card className="rounded-3xl border-none shadow-sm">
          <CardContent className="p-6 text-sm text-muted-foreground">
            {en ? "You have not been assigned to a class yet. Ask your school administrator." : "Vous n'avez pas encore de classe. Contactez l'administration."}
          </CardContent>
        </Card>
      ) : (
        <>
          <StatRow stats={stats} />

          <section className="space-y-3">
            <SectionTitle>{en ? "Today" : "Aujourd'hui"}</SectionTitle>
            <Card className="rounded-3xl border-none shadow-sm">
              <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${registerTaken ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                    {registerTaken ? <CheckCircle2 className="h-5 w-5" /> : <ClipboardCheck className="h-5 w-5" />}
                  </span>
                  <p className="text-sm font-semibold text-primary sm:text-base">
                    {registerTaken
                      ? (en ? `Attendance done: ${present} of ${marked} present.` : `Appel fait : ${present} presents sur ${marked}.`)
                      : (en ? "Today's attendance has not been taken yet." : "L'appel d'aujourd'hui n'a pas encore ete fait.")}
                  </p>
                </div>
                {!registerTaken ? (
                  <Link href="/dashboard/attendance" className="inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-5 text-sm font-bold text-white shadow-sm hover:opacity-90">
                    {en ? "Take attendance" : "Faire l'appel"}
                  </Link>
                ) : null}
              </CardContent>
            </Card>
          </section>

          <section className="space-y-3">
            <SectionTitle>{en ? "What would you like to do?" : "Que voulez-vous faire ?"}</SectionTitle>
            <TaskTiles tiles={tiles} />
          </section>

          <MoreLinks label={en ? "More" : "Plus"} links={more} />
        </>
      )}
    </div>
  );
}
