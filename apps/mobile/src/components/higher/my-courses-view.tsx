"use client";

import { BookOpen } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useHigherMyCourses } from "@/lib/hooks/useHigherEd";
import type { HigherMyCourses } from "@/lib/api/services/higher-ed.service";
import { HigherPageHeader, LoadFailed, Loading, useHigherText } from "./higher-shared";
import { useChildPicker } from "./child-picker";
import { HigherTable, StatusBadge } from "./higher-table";

type Course = HigherMyCourses["courses"][number];

export function MyCoursesView() {
  const tr = useHigherText();
  const { child, picker, hasChildren } = useChildPicker();
  const query = useHigherMyCourses(child);
  const data = query.data;
  const courses = data?.courses ?? [];
  const credits = courses.reduce((n, c) => n + c.credits, 0);
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <HigherPageHeader
        title={tr("My courses", "Mes cours")}
        help={data?.enrolment
          ? `${data.enrolment.programme} · ${data.enrolment.level} · ${data.enrolment.academic_year} — ${courses.length} ${tr("course units", "unités d'enseignement")}, ${credits} ${tr("credits", "crédits")}`
          : tr("The course units of your programme level.", "Les unités d'enseignement de votre niveau.")}
      >
        {picker}
      </HigherPageHeader>
      {!hasChildren ? <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">{tr("No student is linked to your account at this institution yet.", "Aucun étudiant n'est lié à votre compte dans cet établissement.")}</p> : query.isLoading ? <Loading /> : query.isError ? <LoadFailed /> : courses.length === 0 ? (
        <Card className="rounded-3xl border-none shadow-sm">
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <BookOpen className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="font-medium">{tr("No course units to show yet", "Aucune unité d'enseignement pour l'instant")}</p>
            <p className="max-w-md text-sm text-muted-foreground">{tr("Your course units appear once your institution adds them to your programme level. Ask your department if you expected to see some.", "Vos unités apparaissent dès que l'établissement les ajoute à votre niveau. Demandez à votre département si vous en attendiez.")}</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-3xl border-none shadow-sm"><CardContent className="pt-6">
          <HigherTable<Course>
            rows={courses}
            rowKey={(c) => `${c.code}-${c.semester}`}
            label={tr("courses", "cours")}
            searchPlaceholder={tr("Search code, title or lecturer", "Rechercher code, intitulé ou enseignant")}
            empty={tr("No course matches.", "Aucun cours ne correspond.")}
            exportConfig={{ title: tr("My Course List", "Ma liste de cours"), fileName: "my_courses", issuingOffice: tr("Registry and Examination Office", "Service de la scolarité et des examens"),
              chips: data?.enrolment ? [{ label: tr("Programme", "Filière"), value: data.enrolment.programme }, { label: tr("Level", "Niveau"), value: data.enrolment.level }] : [] }}
            columns={[
              { key: "code", header: "Code", value: (c) => c.code, mono: true },
              { key: "title", header: tr("Course unit", "Unité d'enseignement"), value: (c) => c.title, render: (c) => <span className="font-medium">{c.title}</span> },
              { key: "sem", header: tr("Semester", "Semestre"), value: (c) => `S${c.semester}`, align: "center" },
              { key: "credits", header: tr("Credits", "Crédits"), value: (c) => c.credits, align: "center" },
              { key: "cat", header: tr("Type", "Type"), value: (c) => (c.category === "core" ? tr("Core", "Obligatoire") : tr("Elective", "Optionnel")),
                render: (c) => <StatusBadge tone={c.category === "core" ? "blue" : "slate"}>{c.category === "core" ? tr("Core", "Obligatoire") : tr("Elective", "Optionnel")}</StatusBadge> },
              { key: "lect", header: tr("Lecturer", "Enseignant"), value: (c) => c.lecturers.join(", ") || "-" },
              { key: "grade", header: tr("Result", "Résultat"), value: (c) => (c.grade ? `${c.grade}${c.total_score ? ` (${c.total_score})` : ""}` : "-"),
                render: (c) => (c.grade ? <StatusBadge tone={c.passed ? "green" : "red"}>{c.grade}</StatusBadge> : <span className="text-muted-foreground">-</span>) },
            ]}
          />
        </CardContent></Card>
      )}
    </div>
  );
}
