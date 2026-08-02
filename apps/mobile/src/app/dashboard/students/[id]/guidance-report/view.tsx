"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, Loader2, Sparkles } from "lucide-react";

import { aiService } from "@/lib/api/services/ai.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import type { GuidanceReportPayload } from "@/lib/api/types";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function StudentGuidanceReportPage() {
  const params = useParams<{ id: string }>();
  const { toast } = useToast();
  const [reportId, setReportId] = useState("");
  const [form, setForm] = useState<GuidanceReportPayload>({
    student: params.id,
    audience: "student",
    academic_year: "2025-2026",
    term: "Term 1",
  });

  const statusQuery = useQuery({
    queryKey: ["student-guidance-status", reportId],
    enabled: Boolean(reportId),
    queryFn: () => aiService.getGuidanceReportStatus(reportId),
    refetchInterval: (query) => query.state.data?.status === "PROCESSING" ? 2000 : false,
  });

  const createReport = useMutation({
    mutationFn: () => aiService.createGuidanceReport({ ...form, student: params.id }),
    onSuccess: (result) => {
      setReportId(result.id);
      toast({ title: "Guidance report started" });
    },
    onError: (error) => toast({ variant: "destructive", title: "Report failed", description: getApiErrorMessage(error, "The report could not be created.") }),
  });

  const reportData = statusQuery.data?.report_data;

  return (
    <div className="space-y-6 pb-16">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" className="rounded-full"><Link href={`/dashboard/students/${params.id}`}><ArrowLeft className="h-5 w-5" /></Link></Button>
        <div><h1 className="text-3xl font-black text-primary">AI Guidance Report</h1><p className="text-muted-foreground">Generate a tailored report for this student.</p></div>
      </div>
      <Card className="border-none shadow-lg">
        <CardHeader><CardTitle>Report Settings</CardTitle><CardDescription>Select audience, term, and academic year.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2"><Label>Audience</Label><Select value={form.audience} onValueChange={(audience: GuidanceReportPayload["audience"]) => setForm((prev) => ({ ...prev, audience }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="student">Student</SelectItem><SelectItem value="parent">Parent</SelectItem><SelectItem value="teacher">Teacher</SelectItem></SelectContent></Select></div>
          <div className="space-y-2"><Label>Academic Year</Label><Input value={form.academic_year} onChange={(event) => setForm((prev) => ({ ...prev, academic_year: event.target.value }))} /></div>
          <div className="space-y-2"><Label>Term</Label><Input value={form.term} onChange={(event) => setForm((prev) => ({ ...prev, term: event.target.value }))} /></div>
          <div className="flex items-end"><Button disabled={createReport.isPending} onClick={() => createReport.mutate()}>{createReport.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}Generate</Button></div>
        </CardContent>
      </Card>
      {statusQuery.data?.status === "PROCESSING" ? <Card><CardContent className="flex items-center gap-2 p-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Generating report...</CardContent></Card> : null}
      {reportData ? (
        <Card className="border-none shadow-lg">
          <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div><CardTitle>Report Preview</CardTitle><CardDescription>Review before sharing.</CardDescription></div>
            <div className="flex gap-2"><Button variant="outline" onClick={async () => downloadBlob(await aiService.exportGuidancePDF(reportId), "guidance-report.pdf")}><Download className="mr-2 h-4 w-4" />PDF</Button><Button variant="outline" onClick={async () => downloadBlob(await aiService.exportGuidanceDocx(reportId), "guidance-report.docx")}><Download className="mr-2 h-4 w-4" />Word</Button></div>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">{Object.entries(reportData).map(([key, value]) => <div key={key} className="rounded-xl border p-4"><h3 className="font-bold capitalize text-primary">{key.replaceAll("_", " ")}</h3>{Array.isArray(value) ? <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">{value.map((item) => <li key={String(item)}>{String(item)}</li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">{String(value || "")}</p>}</div>)}</CardContent>
        </Card>
      ) : null}
    </div>
  );
}
