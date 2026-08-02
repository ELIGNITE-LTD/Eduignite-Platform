"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Radar, Sparkles } from "lucide-react";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar as RadarShape, RadarChart, ResponsiveContainer } from "recharts";

import { apiClient } from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import { aiService } from "@/lib/api/services/ai.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import type { PaginatedResponse, SkillGapReport } from "@/lib/api/types";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

type StudentOption = { id: string; name?: string; user_name?: string; student_name?: string; admission_number?: string };
type SequenceOption = { id: string; name: string; academic_year: string; term: number };
type WeakSubject = { subject?: string; student_score?: number; class_average?: number; gap?: number; severity?: string; root_cause_hypothesis?: string; improvement_strategies?: string[]; recommended_resources?: string[] };

export default function SkillGapPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [studentId, setStudentId] = useState("");
  const [sequenceId, setSequenceId] = useState("");
  const [reportId, setReportId] = useState("");
  const isStudent = user?.role === "STUDENT";
  const canChooseStudent = !isStudent;

  const meQuery = useQuery({
    queryKey: ["skill-gap-me"],
    enabled: isStudent,
    queryFn: async () => {
      const { data } = await apiClient.get<{ id: string }>(API.STUDENTS.ME);
      setStudentId(data.id);
      return data;
    },
  });

  const studentsQuery = useQuery({
    queryKey: ["skill-gap-students"],
    enabled: canChooseStudent,
    queryFn: async () => {
      const { data } = await apiClient.get<PaginatedResponse<StudentOption>>(API.STUDENTS.BASE);
      return data.results ?? [];
    },
  });

  const sequencesQuery = useQuery({
    queryKey: ["skill-gap-sequences"],
    queryFn: async () => {
      const { data } = await apiClient.get<PaginatedResponse<SequenceOption>>(API.GRADES.SEQUENCES);
      const sequences = data.results ?? [];
      if (!sequenceId && sequences[0]) setSequenceId(sequences[0].id);
      return sequences;
    },
  });

  const previousQuery = useQuery({
    queryKey: ["skill-gap-reports", studentId],
    enabled: Boolean(studentId),
    queryFn: () => aiService.listSkillGapReports({ student: studentId }),
  });

  const statusQuery = useQuery({
    queryKey: ["skill-gap-status", reportId],
    enabled: Boolean(reportId),
    queryFn: () => aiService.getSkillGapStatus(reportId),
    refetchInterval: (query) => query.state.data?.status === "PROCESSING" ? 2000 : false,
  });

  const generateMutation = useMutation({
    mutationFn: () => aiService.generateSkillGap(studentId, sequenceId),
    onSuccess: (result) => {
      setReportId(result.id);
      toast({ title: "Skill gap analysis started", description: "EduIgnite AI is reading real grades and class averages." });
    },
    onError: (error) => toast({ variant: "destructive", title: "Analysis failed", description: getApiErrorMessage(error, "Could not start skill gap analysis.") }),
  });

  const latestReport = previousQuery.data?.results?.[0] as SkillGapReport | undefined;
  const currentData = statusQuery.data?.analysis_data || latestReport?.analysis_data;
  const weakSubjects = (currentData?.weak_subjects ?? []) as WeakSubject[];
  const strongSubjects = (currentData?.strong_subjects ?? []) as WeakSubject[];
  const chartData = useMemo(() => [...weakSubjects, ...strongSubjects].map((item) => ({
    subject: item.subject || "Subject",
    student: Number(item.student_score ?? 0),
    classAverage: Number(item.class_average ?? 0),
  })), [weakSubjects, strongSubjects]);

  return (
    <div className="space-y-6 pb-16">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-black text-primary"><Radar className="h-7 w-7 text-secondary" />Skill Gap Analysis</h1>
        <p className="text-muted-foreground">Compare student performance with class averages and get practical improvement steps.</p>
      </div>

      <Card className="border-none shadow-lg">
        <CardHeader><CardTitle>Generate Analysis</CardTitle><CardDescription>Students can analyze themselves; teachers and admins can select a learner.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          {canChooseStudent ? (
            <Select value={studentId || "none"} onValueChange={(value) => setStudentId(value === "none" ? "" : value)}>
              <SelectTrigger><SelectValue placeholder={studentsQuery.isLoading ? "Loading students..." : "Select student"} /></SelectTrigger>
              <SelectContent><SelectItem value="none">Select student</SelectItem>{(studentsQuery.data ?? []).map((student) => <SelectItem key={student.id} value={student.id}>{student.name || student.user_name || student.student_name || student.admission_number}</SelectItem>)}</SelectContent>
            </Select>
          ) : (
            <div className="rounded-xl border px-3 py-2 text-sm text-muted-foreground">{meQuery.isLoading ? "Loading your student profile..." : "Your student profile is selected."}</div>
          )}
          <Select value={sequenceId || "none"} onValueChange={(value) => setSequenceId(value === "none" ? "" : value)}>
            <SelectTrigger><SelectValue placeholder={sequencesQuery.isLoading ? "Loading sequences..." : "Select sequence"} /></SelectTrigger>
            <SelectContent><SelectItem value="none">Latest available</SelectItem>{(sequencesQuery.data ?? []).map((sequence) => <SelectItem key={sequence.id} value={sequence.id}>{sequence.name} ({sequence.academic_year})</SelectItem>)}</SelectContent>
          </Select>
          <Button disabled={!studentId || generateMutation.isPending} onClick={() => generateMutation.mutate()}>
            {generateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Generate Analysis
          </Button>
        </CardContent>
      </Card>

      {statusQuery.data?.status === "PROCESSING" ? <Card><CardContent className="flex items-center gap-2 p-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Analyzing grades and class averages...</CardContent></Card> : null}
      {statusQuery.data?.status === "FAILED" ? <Card><CardContent className="p-6 text-destructive">{statusQuery.data.error || "Analysis failed."}</CardContent></Card> : null}

      {currentData ? (
        <>
          <Card className="border-none shadow-lg">
            <CardHeader><CardTitle>Performance Radar</CardTitle><CardDescription>Student score versus class average per subject.</CardDescription></CardHeader>
            <CardContent className="h-80">
              {chartData.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={chartData}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="subject" />
                    <PolarRadiusAxis angle={30} domain={[0, 20]} />
                    <RadarShape name="Student" dataKey="student" stroke="#1a3c6e" fill="#1a3c6e" fillOpacity={0.25} />
                    <RadarShape name="Class Average" dataKey="classAverage" stroke="#f6b51e" fill="#f6b51e" fillOpacity={0.18} />
                  </RadarChart>
                </ResponsiveContainer>
              ) : <p className="text-muted-foreground">No subject data available for the chart.</p>}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-none shadow-lg">
              <CardHeader><CardTitle>Weak Subjects</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {!weakSubjects.length ? <p className="text-muted-foreground">No weak subjects detected.</p> : null}
                {weakSubjects.map((subject) => (
                  <div key={subject.subject} className="rounded-xl border p-4">
                    <div className="flex items-center justify-between gap-3"><p className="font-bold text-primary">{subject.subject}</p><Badge variant={subject.severity === "HIGH" ? "destructive" : "secondary"}>{subject.severity || "WATCH"}</Badge></div>
                    <p className="mt-2 text-sm text-muted-foreground">{subject.root_cause_hypothesis}</p>
                    <ul className="mt-3 list-disc pl-5 text-sm">{subject.improvement_strategies?.map((item) => <li key={item}>{item}</li>)}</ul>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="border-none shadow-lg">
              <CardHeader><CardTitle>Priority Action Plan</CardTitle><CardDescription>{currentData.overall_assessment as string}</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                {(currentData.priority_action_plan as string[] | undefined)?.map((item, index) => <div key={item} className="rounded-xl bg-accent/30 p-3 text-sm"><span className="font-bold text-primary">{index + 1}.</span> {item}</div>)}
                <pre className="overflow-x-auto rounded-xl bg-primary/5 p-4 text-xs text-muted-foreground">{JSON.stringify(currentData.study_hours_recommendation ?? {}, null, 2)}</pre>
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        <Card><CardContent className="p-6 text-muted-foreground">Generate an analysis to see weak subjects, strong subjects, study hours, and action steps.</CardContent></Card>
      )}
    </div>
  );
}
