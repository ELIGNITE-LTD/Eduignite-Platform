"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { pupilName } from "@/lib/pupil-name";
import { useMyClasses } from "@/lib/hooks/useClassTeachers";
import { useAllStudents } from "@/lib/hooks/useStudents";

/** Class teacher (basic): the pupils of my class, read-only, with search and a small profile. */
export default function MyClassPage() {
  const { user } = useAuth();
  const { language } = useI18n();
  const en = language === "en";
  const { data, isLoading } = useMyClasses(user?.role === "TEACHER");
  const classes = data?.classes ?? [];
  const [classId, setClassId] = useState("");
  const current = classes.find((c: any) => c.id === classId) ?? classes[0];
  const students = useAllStudents({ school_class: current?.id } as any, Boolean(current?.id));
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState("");

  useEffect(() => {
    setSearch("");
    setOpen("");
  }, [current?.id]);

  const pupils = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ((students.data?.results ?? []) as any[])
      .filter((s) => !q || `${pupilName(s)} ${s.admission_number ?? ""}`.toLowerCase().includes(q))
      .sort((a, b) => pupilName(a).localeCompare(pupilName(b)));
  }, [students.data, search]);

  if (user && user.role !== "TEACHER") return null;

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-20">
      <header className="rounded-3xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6">
        <h1 className="text-2xl font-black tracking-tight text-primary sm:text-3xl">{en ? "My pupils" : "Mes eleves"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {current ? `${current.name} - ${pupils.length} ${en ? "pupils" : "eleves"}` : ""}
        </p>
      </header>

      {isLoading ? (
        <p className="px-1 text-sm text-muted-foreground">{en ? "Loading..." : "Chargement..."}</p>
      ) : !current ? (
        <Card className="rounded-3xl border-none shadow-sm">
          <CardContent className="p-5 text-sm text-muted-foreground">
            {en ? "You have not been assigned to a class yet. Ask your school administrator." : "Vous n'avez pas encore de classe. Contactez l'administration."}
          </CardContent>
        </Card>
      ) : (
        <>
          {classes.length > 1 ? (
            <div className="flex flex-wrap gap-2">
              {classes.map((c: any) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setClassId(c.id)}
                  className={`h-11 rounded-full border px-5 text-sm font-semibold transition ${c.id === current.id ? "border-primary bg-primary text-white" : "border-primary/20 bg-white text-primary hover:bg-primary/5"}`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          ) : null}

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={en ? "Search a pupil" : "Chercher un eleve"}
              className="h-11 rounded-2xl pl-9"
            />
          </div>

          {students.isLoading ? (
            <p className="px-1 text-sm text-muted-foreground">{en ? "Loading..." : "Chargement..."}</p>
          ) : pupils.length === 0 ? (
            <Card className="rounded-3xl border-none shadow-sm">
              <CardContent className="p-5 text-sm text-muted-foreground">{en ? "No pupils found." : "Aucun eleve trouve."}</CardContent>
            </Card>
          ) : (
            pupils.map((s) => {
              const isOpen = open === s.id;
              return (
                <Card key={s.id} className="rounded-3xl border-none shadow-sm">
                  <CardContent className="p-4">
                    <button type="button" className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setOpen(isOpen ? "" : s.id)}>
                      <div className="min-w-0">
                        <p className="truncate text-base font-bold text-primary">{pupilName(s, "-")}</p>
                        <p className="truncate text-sm text-muted-foreground">{s.admission_number || s.display_matricule || ""}</p>
                      </div>
                      {isOpen ? <ChevronUp className="h-5 w-5 shrink-0" /> : <ChevronDown className="h-5 w-5 shrink-0" />}
                    </button>
                    {isOpen ? (
                      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                        <div><dt className="text-muted-foreground">{en ? "Class" : "Classe"}</dt><dd className="font-semibold">{s.school_class_name || s.student_class || "-"}</dd></div>
                        <div><dt className="text-muted-foreground">{en ? "Sex" : "Sexe"}</dt><dd className="font-semibold">{s.gender || "-"}</dd></div>
                        <div><dt className="text-muted-foreground">{en ? "Date of birth" : "Date de naissance"}</dt><dd className="font-semibold">{s.date_of_birth || "-"}</dd></div>
                        <div><dt className="text-muted-foreground">{en ? "Parent / guardian" : "Parent / tuteur"}</dt><dd className="font-semibold">{s.guardian_name || "-"}</dd></div>
                        <div><dt className="text-muted-foreground">{en ? "Phone" : "Telephone"}</dt><dd className="font-semibold">{s.guardian_phone || "-"}</dd></div>
                      </dl>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })
          )}
        </>
      )}
    </div>
  );
}
