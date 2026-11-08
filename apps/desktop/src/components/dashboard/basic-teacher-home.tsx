"use client";

import { useState } from "react";
import Link from "next/link";
import { Award, ClipboardCheck, HeartPulse, School, ShieldCheck, FileText, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { useMyClasses } from "@/lib/hooks/useClassTeachers";
import { useDailyRoster } from "@/lib/hooks/useAttendance";

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Very simple class-teacher home for basic (nursery/primary) schools. */
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

  const tiles = [
    { href: "/dashboard/attendance", icon: ClipboardCheck, label: en ? "Take attendance" : "Faire l'appel", color: "bg-emerald-50 text-emerald-700" },
    { href: "/dashboard/class-marks", icon: Award, label: en ? "Enter marks" : "Saisir les notes", color: "bg-amber-50 text-amber-700" },
    { href: "/dashboard/students", icon: Users, label: en ? "Pupils" : "Eleves", color: "bg-purple-50 text-purple-700" },
    { href: "/dashboard/conduct", icon: ShieldCheck, label: en ? "Conduct" : "Conduite", color: "bg-sky-50 text-sky-700" },
    { href: "/dashboard/grades", icon: FileText, label: en ? "Report cards" : "Bulletins", color: "bg-rose-50 text-rose-700" },
    { href: "/dashboard/health-records", icon: HeartPulse, label: en ? "Health & certificates" : "Sante et certificats", color: "bg-teal-50 text-teal-700" },
  ];

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h1 className="text-2xl font-bold text-primary sm:text-3xl">
          {en ? "Hello" : "Bonjour"}, {user?.name}
        </h1>
        {user?.school ? <p className="text-sm text-muted-foreground">{user.school.name}</p> : null}
      </div>

      <Card className="rounded-[2rem] border-none bg-white shadow-xl">
        <CardContent className="space-y-4 p-6">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{en ? "Loading..." : "Chargement..."}</p>
          ) : !current ? (
            <p className="text-sm text-muted-foreground">
              {en ? "You have not been assigned to a class yet. Ask your school administrator." : "Vous n'avez pas encore de classe. Contactez l'administration."}
            </p>
          ) : (
            <>
              {classes.length > 1 ? (
                <div className="flex flex-wrap gap-2">
                  {classes.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setPicked(c.id)}
                      className={`rounded-full border px-4 py-1 text-sm font-semibold ${c.id === current.id ? "bg-primary text-white" : "bg-white text-primary"}`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="flex items-center gap-3">
                <School className="h-8 w-8 text-secondary" />
                <p className="text-3xl font-black text-primary">{current.name}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-2xl bg-accent/30 p-4">
                  <p className="text-3xl font-black text-primary">{pupils}</p>
                  <p className="text-sm text-muted-foreground">{en ? "Pupils" : "Eleves"}</p>
                </div>
                <div className="rounded-2xl bg-accent/30 p-4">
                  <p className="text-3xl font-black text-primary">{rate === null ? "-" : `${rate}%`}</p>
                  <p className="text-sm text-muted-foreground">
                    {registerTaken ? (en ? "Present today" : "Presents aujourd'hui") : (en ? "Register not taken yet" : "Appel pas encore fait")}
                  </p>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {tiles.map(({ href, icon: Icon, label, color }) => (
          <Link key={href} href={href} className="block">
            <Card className="rounded-[2rem] border-none shadow-lg transition hover:shadow-xl">
              <CardContent className="flex min-h-[8.5rem] flex-col items-center justify-center gap-3 p-4 text-center">
                <span className={`rounded-2xl p-4 ${color}`}><Icon className="h-8 w-8" /></span>
                <span className="text-base font-bold text-primary">{label}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
