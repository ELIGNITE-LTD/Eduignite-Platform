"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, FileText, Loader2, Sparkles } from "lucide-react";

import { apiClient } from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import { aiService } from "@/lib/api/services/ai.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import type { GuidanceReportPayload, PaginatedResponse } from "@/lib/api/types";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type StudentOption = { id: string; name?: string; user_name?: string; student_name?: string; admission_number?: string };

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function GuidanceReportsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [reportId, setReportId] = useState("");
  const [form, setForm] = useState<GuidanceReportPayload>({
    student: "",
    audience: "student",
    academic_year: "2025-2026",
    term: "Term 1",
  });

  const canAccess = ["SCHOOL_ADMIN", "SUB_ADMIN", "TEACHER", "CEO", "CTO", "SUPER_ADMIN"].includes(user?.role || "");

  const studentsQuery = useQuery({
    queryKey: ["guidance-students"],
    enabled: canAccess,
    queryFn: async () => {
      const { data } = await apiClient.get<PaginatedResponse<StudentOption>>(API.STUDENTS.BASE);
      return data.results ?? [];
    },
  });

  const reportsQuery = useQuery({
    queryKey: ["guidance-reports", form.student],
    enabled: canAccess,
    queryFn: () => aiService.listGuidanceReports(form.student ? { student: form.student } : undefined),
  });

  const statusQuery = useQuery({
    queryKey: ["guidance-report-status", reportId],
    enabled: Boolean(reportId),
    queryFn: () => aiService.getGuidanceReportStatus(reportId),
    refetchInterval: (query) => query.state.data?.status === "PROCESSING" ? 2000 : false,
  });

  const createReport = useMutation({
    mutationFn: () => aiService.createGuidanceReport(form),
    onSuccess: (result) => {
      setReportId(result.id);
      toast({ title: "Guidance report started", description: "EduIgnite AI is preparing the report from school records." });
    },
    onError: (error) => toast({ variant: "destructive", title: "Report failed", description: getApiErrorMessage(error, "The guidance report could not be created.") }),
  });

  const currentData = statusQuery.data?.report_data || reportsQuery.data?.results?.[0]?.report_data;
  const reports = useMemo(() => reportsQuery.data?.results ?? [], [reportsQuery.data]);

  if (!canAccess) {
    return (
      <Card className="border-none shadow-lg">
        <CardHeader><CardTitle>Access denied</CardTitle><CardDescription>Guidance reports are available to school leadership and teachers.</CardDescription></CardHeader>
        <CardContent><Button asChild><Link href="/dashboard">Back to Dashboard</Link></Button></CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 pb-16">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" className="rounded-full"><Link href="/dashboard/students"><ArrowLeft className="h-5 w-5" /></Link></Button>
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-black text-primary"><FileText className="h-7 w-7 text-secondary" />AI Guidance Reports</h1>
          <p className="text-muted-foreground">Generate student, parent, or teacher guidance from grades, attendance, and remarks.</p>
        </div>
      </div>

      <Card className="border-none shadow-lg">
        <CardHeader><CardTitle>Generate Report</CardTitle><CardDescription>The report adapts tone and recommendations for the selected audience.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-5">
          <div className="space-y-2 md:col-span-2">
            <Label>Student</Label>
            <Select value={form.student || "none"} onValueChange={(value) => setForm((prev) => ({ ...prev, student: value === "none" ? "" : value }))}>
              <SelectTrigger><SelectValue placeholder={studentsQuery.isLoading ? "Loading students..." : "Select student"} /></SelectTrigger>
              <SelectContent><SelectItem value="none">Select student</SelectItem>{(studentsQuery.data ?? []).map((student) => <SelectItem key={student.id} value={student.id}>{student.name || student.user_name || student.student_name || student.admission_number}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Audience</Label>
            <Select value={form.audience} onValueChange={(audience: GuidanceReportPayload["audience"]) => setForm((prev) => ({ ...prev, audience }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="student">Student</SelectItem><SelectItem value="parent">Parent</SelectItem><SelectItem value="teacher">Teacher</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Academic Year</Label><Input value={form.academic_year} onChange={(event) => setForm((prev) => ({ ...prev, academic_year: event.target.value }))} /></div>
          <div className="space-y-2"><Label>Term</Label><Input value={form.term} onChange={(event) => setForm((prev) => ({ ...prev, term: event.target.value }))} /></div>
          <div className="md:col-span-5">
            <Button disabled={!form.student || createReport.isPending} onClick={() => createReport.mutate()}>
              {createReport.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Generate Report
            </Button>
          </div>
        </CardContent>
      </Card>

      {statusQuery.data?.status === "PROCESSING" ? <Card><CardContent className="flex items-center gap-2 p-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Generating guidance report...</CardContent></Card> : null}
      {statusQuery.data?.status === "FAILED" ? <Card><CardContent className="p-6 text-destructive">{statusQuery.data.error || "Report failed."}</CardContent></Card> : null}

      {currentData ? (
        <Card className="border-none shadow-lg">
          <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div><CardTitle>Report Preview</CardTitle><CardDescription>Review the AI guidance before sharing it with families.</CardDescription></div>
            {reportId ? <div className="flex gap-2"><Button variant="outline" onClick={async () => downloadBlob(await aiService.exportGuidancePDF(reportId), "guidance-report.pdf")}><Download className="mr-2 h-4 w-4" />PDF</Button><Button variant="outline" onClick={async () => downloadBlob(await aiService.exportGuidanceDocx(reportId), "guidance-report.docx")}><Download className="mr-2 h-4 w-4" />Word</Button></div> : null}
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
            {Object.entries(currentData).map(([key, value]) => (
              <div key={key} className="rounded-xl border p-4">
                <h3 className="mb-2 font-bold capitalize text-primary">{key.replaceAll("_", " ")}</h3>
                {Array.isArray(value) ? <ul className="list-disc pl-5 text-sm text-muted-foreground">{value.map((item) => <li key={String(item)}>{String(item)}</li>)}</ul> : <p className="text-sm text-muted-foreground">{String(value || "")}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : <Card><CardContent className="p-6 text-muted-foreground">Select a student and generate a report to see guidance sections here.</CardContent></Card>}

      <Card className="border-none shadow-lg">
        <CardHeader><CardTitle>Previous Guidance Reports</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {!reports.length ? <p className="text-muted-foreground">No previous reports found.</p> : null}
          {reports.map((report) => (
            <button key={report.id} className="rounded-xl border p-4 text-left hover:border-primary" onClick={() => setReportId(report.id)}>
              <p className="font-bold text-primary">{report.student_name || "Student"}</p>
              <p className="text-sm text-muted-foreground">{report.audience} | {report.term} | {report.academic_year}</p>
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
