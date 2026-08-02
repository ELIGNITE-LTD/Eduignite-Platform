"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { examsService } from "@/lib/api/services/exams.service";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api/errors";
import { generateBrandedTablePdf } from "@/lib/pdf-branded";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  MonitorPlay,
  UserCheck,
  UserX,
  Users,
} from "lucide-react";
import Link from "next/link";

/**
 * Live/online exam management for teachers: list online exams, open one to
 * see who wrote vs. who was absent with their scores, download the result
 * sheet as a branded PDF, and push the results straight into the sequence's
 * Enter-Marks grade sheet.
 */

const normalizeList = (p: any) => (Array.isArray(p) ? p : Array.isArray(p?.results) ? p.results : []);

function examPhase(exam: any): { label: string; tone: string } {
  const now = Date.now();
  const start = new Date(exam.start_time || 0).getTime();
  const end = new Date(exam.end_time || exam.start_time || 0).getTime();
  if (exam.status === "COMPLETED" || (end && now > end)) return { label: "Ended", tone: "bg-slate-100 text-slate-700" };
  if (start && now >= start && (!end || now <= end)) return { label: "Live", tone: "bg-red-100 text-red-700" };
  return { label: "Scheduled", tone: "bg-amber-100 text-amber-700" };
}

export default function ManageExamsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isTeacher = user?.role === "TEACHER";
  const isAdmin = ["SCHOOL_ADMIN", "SUB_ADMIN"].includes(user?.role || "");

  const [selectedExam, setSelectedExam] = useState<any>(null);

  const examsQuery = useQuery({
    queryKey: ["manage-online-exams"],
    queryFn: async () => normalizeList((await examsService.getExams({ mode: "ONLINE", page_size: 200 } as any)) as any),
  });

  const rosterQuery = useQuery({
    queryKey: ["exam-roster", selectedExam?.id],
    queryFn: () => examsService.getExamRoster(String(selectedExam.id)),
    enabled: Boolean(selectedExam?.id),
  });

  const pushMutation = useMutation({
    mutationFn: () => examsService.pushExamToMarks(String(selectedExam.id)),
    onSuccess: (data: any) => {
      toast({ title: "Marks updated", description: data?.detail || "Results were written to the marks sheet." });
      queryClient.invalidateQueries({ queryKey: ["exam-roster", selectedExam?.id] });
    },
    onError: (e) => toast({ variant: "destructive", title: "Could not push marks", description: getApiErrorMessage(e, "Try again.") }),
  });

  const exams = useMemo(() => normalizeList(examsQuery.data), [examsQuery.data]);
  const roster = rosterQuery.data;

  const downloadResults = () => {
    if (!roster) return;
    const rows = [
      ...(roster.wrote || []).map((r: any, i: number) => [
        i + 1, r.name, r.matricule || "-", r.score ?? "-",
        r.total_marks ?? "-", r.percentage != null ? `${r.percentage}%` : "-", "Wrote",
      ]),
      ...(roster.absent || []).map((r: any, i: number) => [
        (roster.wrote?.length || 0) + i + 1, r.name, r.matricule || "-", "-", "-", "-", "Absent",
      ]),
    ];
    generateBrandedTablePdf({
      title: `Exam Results — ${selectedExam?.title || ""}`,
      subtitle: `${roster.exam?.target_class || ""} • ${roster.wrote_count} wrote • ${roster.absent_count} absent`,
      schoolName: user?.school?.name || "EduIgnite",
      columns: ["#", "Student", "Matricule", "Score", "Total", "%", "Status"],
      rows,
      fileName: `exam-results-${(selectedExam?.title || "exam").replace(/\s+/g, "-").toLowerCase()}`,
      footnote: `${roster.total_students} student(s) • ${roster.wrote_count} wrote, ${roster.absent_count} absent`,
    });
  };

  if (!isTeacher && !isAdmin) {
    return (
      <div className="rounded-3xl border bg-white p-8 text-center">
        <p className="text-sm font-semibold text-muted-foreground">Only teachers and administrators can manage exams.</p>
      </div>
    );
  }

  // -------------------------------------------------- detail (roster) view
  if (selectedExam) {
    return (
      <div className="space-y-4 pb-8">
        <button onClick={() => setSelectedExam(null)} className="flex items-center gap-2 text-sm font-bold text-primary">
          <ArrowLeft className="h-4 w-4" /> Back to exams
        </button>

        <div className="flex flex-col gap-3 rounded-3xl bg-primary p-6 text-white md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-black">{selectedExam.title}</h1>
            <p className="text-sm text-white/70">{selectedExam.subject_name} • {selectedExam.target_class}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" className="gap-2 rounded-xl" onClick={downloadResults} disabled={!roster}>
              <Download className="h-4 w-4" /> Download PDF
            </Button>
            <Button
              className="gap-2 rounded-xl bg-white text-primary hover:bg-white/90"
              onClick={() => pushMutation.mutate()}
              disabled={pushMutation.isPending || !(roster?.wrote_count)}
            >
              {pushMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Fill into Marks
            </Button>
          </div>
        </div>

        {rosterQuery.isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-primary/30" /></div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              {[
                ["Total", roster?.total_students ?? 0, Users, "text-primary"],
                ["Wrote", roster?.wrote_count ?? 0, UserCheck, "text-emerald-600"],
                ["Absent", roster?.absent_count ?? 0, UserX, "text-red-600"],
              ].map(([label, value, Icon, color]: any) => (
                <Card key={label} className="border-none shadow-sm">
                  <CardContent className="flex flex-col items-center gap-1 p-4">
                    <Icon className={cn("h-5 w-5", color)} />
                    <p className="text-2xl font-black text-foreground">{value}</p>
                    <p className="text-[11px] font-bold uppercase text-muted-foreground">{label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="border-none shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base"><UserCheck className="h-4 w-4 text-emerald-600" /> Wrote the exam</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(roster?.wrote || []).length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">No submissions yet.</p>
                ) : (
                  (roster?.wrote || []).map((r: any) => (
                    <div key={r.student_id} className="flex items-center justify-between rounded-xl bg-accent/30 px-4 py-2.5">
                      <div>
                        <p className="text-sm font-bold text-foreground">{r.name}</p>
                        <p className="text-[11px] text-muted-foreground">{r.matricule}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black text-primary">{r.score ?? "-"}{r.total_marks ? ` / ${r.total_marks}` : ""}</p>
                        {r.percentage != null ? <p className="text-[11px] font-bold text-muted-foreground">{r.percentage}%</p> : null}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base"><UserX className="h-4 w-4 text-red-600" /> Absent</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(roster?.absent || []).length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">Everyone wrote the exam.</p>
                ) : (
                  (roster?.absent || []).map((r: any) => (
                    <div key={r.student_id} className="flex items-center justify-between rounded-xl bg-red-50 px-4 py-2.5">
                      <p className="text-sm font-bold text-foreground">{r.name}</p>
                      <Badge className="bg-red-100 text-[10px] font-black text-red-700">Absent</Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    );
  }

  // -------------------------------------------------- list view
  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-primary">
            <MonitorPlay className="h-6 w-6 text-secondary" /> Manage Online Exams
          </h1>
          <p className="text-sm text-muted-foreground">See results, track who wrote or was absent, download and fill marks.</p>
        </div>
        <Button asChild variant="outline" className="gap-2 rounded-xl border-primary/20 font-bold text-primary">
          <Link href="/dashboard/exams"><FileText className="h-4 w-4" /> Create / schedule exams</Link>
        </Button>
      </div>

      {examsQuery.isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-primary/30" /></div>
      ) : exams.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed bg-white py-16 text-center">
          <MonitorPlay className="h-10 w-10 text-primary/20" />
          <p className="text-sm font-bold text-muted-foreground">No online exams yet</p>
          <Button asChild size="sm" variant="outline" className="mt-1 gap-2 rounded-xl">
            <Link href="/dashboard/exams">Create one</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {exams.map((exam: any) => {
            const phase = examPhase(exam);
            return (
              <button
                key={exam.id}
                onClick={() => setSelectedExam(exam)}
                className="rounded-3xl bg-white p-5 text-left shadow-sm ring-1 ring-black/[0.03] transition-transform active:scale-[0.99]"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-[15px] font-black leading-snug text-foreground">{exam.title}</h3>
                  <Badge className={cn("shrink-0 text-[10px] font-black", phase.tone)}>{phase.label}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{exam.subject_name} • {exam.target_class}</p>
                <div className="mt-3 flex items-center gap-3 text-[11px] font-bold text-muted-foreground">
                  <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {exam.submission_count ?? exam.submissions_count ?? "—"} submissions</span>
                  <span>{exam.duration_minutes} min</span>
                </div>
                <p className="mt-3 text-[11px] font-black uppercase tracking-widest text-primary">View results →</p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
