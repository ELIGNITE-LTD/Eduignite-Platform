"use client";

import { Award } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useHigherMyResults } from "@/lib/hooks/useHigherEd";
import { HigherPageHeader, LoadFailed, Loading, useHigherText } from "./higher-shared";

export function MyResultsView() {
  const tr = useHigherText();
  const query = useHigherMyResults();
  const t = query.data;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <HigherPageHeader title={tr("My results", "Mes résultats")} help={tr("Your published results by semester, with your GPA and credits.", "Vos résultats publiés par semestre, avec votre moyenne et vos crédits.")} />
      {query.isLoading ? <Loading /> : query.isError ? <LoadFailed /> : !t || t.periods.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <Award className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="font-medium">{tr("No results published yet", "Aucun résultat publié pour l'instant")}</p>
            <p className="max-w-md text-sm text-muted-foreground">{tr("Results will appear here once your lecturers and the administration publish them.", "Les résultats apparaîtront ici dès que vos enseignants et l'administration les publieront.")}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {t.cumulative ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t.scale === "gpa_4" ? tr("Cumulative GPA", "GPA cumulé") : tr("Cumulative average", "Moyenne cumulée")}</CardTitle>
                <CardDescription>{t.cumulative.credits_earned} / {t.cumulative.credits_attempted} {tr("credits earned", "crédits validés")}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{t.scale === "gpa_4" ? `${t.cumulative.gpa} / 4.0` : `${t.cumulative.average} / 20`}</p>
                {t.cumulative.degree_class ? <p className="text-sm text-muted-foreground">{t.cumulative.degree_class}</p> : null}
                {t.cumulative.mention ? <p className="text-sm text-muted-foreground">{t.cumulative.mention}</p> : null}
              </CardContent>
            </Card>
          ) : null}
          {t.periods.map((p) => (
            <Card key={`${p.academic_year}-${p.period}`}>
              <CardHeader>
                <CardTitle className="text-base">{p.period} · {p.academic_year}</CardTitle>
                <CardDescription>
                  {t.scale === "gpa_4" ? `GPA ${p.gpa}` : `${tr("Average", "Moyenne")} ${p.average}/20`} · {p.credits_earned}/{p.credits_attempted} {tr("credits", "crédits")}
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1">{tr("Course", "Cours")}</th><th>{tr("Credits", "Crédits")}</th><th>{tr("CA", "CC")}</th><th>{tr("Exam", "Examen")}</th><th>{tr("Total", "Total")}</th><th>{t.scale === "gpa_4" ? tr("Grade", "Note") : tr("Mention", "Mention")}</th></tr></thead>
                  <tbody>
                    {p.courses.map((c) => (
                      <tr key={c.code} className="border-t">
                        <td className="py-1.5"><span className="font-medium">{c.code}</span> <span className="text-muted-foreground">{c.title}</span></td>
                        <td>{c.credits}</td><td>{c.ca_score}</td><td>{c.exam_score}</td><td>{c.total_score}</td>
                        <td>{c.grade}{c.passed ? "" : " ✗"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
