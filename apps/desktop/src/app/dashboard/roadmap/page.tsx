"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Map, Sparkles } from "lucide-react";

import { apiClient } from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import { aiService } from "@/lib/api/services/ai.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import type { PaginatedResponse } from "@/lib/api/types";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type StudentOption = { id: string; name?: string; user_name?: string; student_name?: string; admission_number?: string };

export default function AcademicRoadmapPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [studentId, setStudentId] = useState("");
  const [roadmapId, setRoadmapId] = useState("");
  const [academicYear, setAcademicYear] = useState("2025-2026");
  const [targetGrade, setTargetGrade] = useState("15");
  const [targetCareer, setTargetCareer] = useState("");
  const isStudent = user?.role === "STUDENT";

  useQuery({
    queryKey: ["roadmap-me"],
    enabled: isStudent,
    queryFn: async () => {
      const { data } = await apiClient.get<{ id: string }>(API.STUDENTS.ME);
      setStudentId(data.id);
      return data;
    },
  });

  const studentsQuery = useQuery({
    queryKey: ["roadmap-students"],
    enabled: !isStudent,
    queryFn: async () => {
      const { data } = await apiClient.get<PaginatedResponse<StudentOption>>(API.STUDENTS.BASE);
      return data.results ?? [];
    },
  });

  const statusQuery = useQuery({
    queryKey: ["roadmap-status", roadmapId],
    enabled: Boolean(roadmapId),
    queryFn: () => aiService.getRoadmapStatus(roadmapId),
    refetchInterval: (query) => query.state.data?.status === "PROCESSING" ? 2000 : false,
  });

  const createRoadmap = useMutation({
    mutationFn: () => aiService.createRoadmap({
      student: studentId,
      academic_year: academicYear,
      target_grade: Number(targetGrade || "0"),
      target_career: targetCareer,
    }),
    onSuccess: (result) => {
      setRoadmapId(result.id);
      toast({ title: "Roadmap started", description: "EduIgnite AI is creating the academic plan." });
    },
    onError: (error) => toast({ variant: "destructive", title: "Roadmap failed", description: getApiErrorMessage(error, "Could not generate roadmap.") }),
  });

  const data = statusQuery.data?.roadmap_data;

  return (
    <div className="space-y-6 pb-16">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-black text-primary"><Map className="h-7 w-7 text-secondary" />My Academic Roadmap</h1>
        <p className="text-muted-foreground">Build a three-term study plan with milestones, risks, and measurable goals.</p>
      </div>

      <Card className="border-none shadow-lg">
        <CardHeader><CardTitle>Roadmap Setup</CardTitle><CardDescription>Use real grades and attendance to plan the academic year.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-5">
          {!isStudent ? (
            <div className="space-y-2 md:col-span-2">
              <Label>Student</Label>
              <Select value={studentId || "none"} onValueChange={(value) => setStudentId(value === "none" ? "" : value)}>
                <SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger>
                <SelectContent><SelectItem value="none">Select student</SelectItem>{(studentsQuery.data ?? []).map((student) => <SelectItem key={student.id} value={student.id}>{student.name || student.user_name || student.student_name || student.admission_number}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="space-y-2"><Label>Academic Year</Label><Input value={academicYear} onChange={(event) => setAcademicYear(event.target.value)} /></div>
          <div className="space-y-2"><Label>Target Average /20</Label><Input value={targetGrade} onChange={(event) => setTargetGrade(event.target.value)} /></div>
          <div className="space-y-2"><Label>Target Career</Label><Input value={targetCareer} onChange={(event) => setTargetCareer(event.target.value)} placeholder="Engineer, nurse, teacher..." /></div>
          <div className="flex items-end"><Button disabled={!studentId || createRoadmap.isPending} onClick={() => createRoadmap.mutate()}>{createRoadmap.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}Generate</Button></div>
        </CardContent>
      </Card>

      {statusQuery.data?.status === "PROCESSING" ? <Card><CardContent className="flex items-center gap-2 p-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Generating academic roadmap...</CardContent></Card> : null}
      {statusQuery.data?.status === "FAILED" ? <Card><CardContent className="p-6 text-destructive">{statusQuery.data.error || "Roadmap generation failed."}</CardContent></Card> : null}

      {data ? (
        <div className="space-y-4">
          <Card className="border-none shadow-lg"><CardHeader><CardTitle>Student Summary</CardTitle></CardHeader><CardContent><p className="text-muted-foreground">{String(data.student_summary || "")}</p></CardContent></Card>
          <div className="grid gap-4 lg:grid-cols-3">
            {Array.isArray(data.term_plans) ? data.term_plans.map((term: Record<string, unknown>) => (
              <Card key={String(term.term)} className="border-none shadow-md">
                <CardHeader><CardTitle>{String(term.term)}</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p className="font-semibold text-primary">Goals</p>
                  <ul className="list-disc pl-5 text-muted-foreground">{(term.goals as string[] | undefined)?.map((goal) => <li key={goal}>{goal}</li>)}</ul>
                  <p className="font-semibold text-primary">Schedule</p>
                  <ul className="list-disc pl-5 text-muted-foreground">{(term.study_schedule as string[] | undefined)?.map((item) => <li key={item}>{item}</li>)}</ul>
                </CardContent>
              </Card>
            )) : null}
          </div>
          <Card className="border-none shadow-lg"><CardHeader><CardTitle>Risk Alerts and Measurable Goals</CardTitle></CardHeader><CardContent><pre className="overflow-x-auto rounded-xl bg-primary/5 p-4 text-xs">{JSON.stringify({ risk_alerts: data.risk_alerts, measurable_goals: data.measurable_goals }, null, 2)}</pre></CardContent></Card>
        </div>
      ) : <Card><CardContent className="p-6 text-muted-foreground">Generate a roadmap to see the three-term plan.</CardContent></Card>}
    </div>
  );
}
