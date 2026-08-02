"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, GraduationCap, Loader2, MapPinned, Sparkles } from "lucide-react";

import { aiService } from "@/lib/api/services/ai.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import type { CareerReportData, CareerReportPayload } from "@/lib/api/types";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

const subjectSuggestions = ["Mathematics", "Physics", "Chemistry", "Biology", "Computer Science", "Economics", "Literature", "French", "English"];
const strengthSuggestions = ["Problem Solving", "Creativity", "Leadership", "Communication", "Discipline", "Research", "Teamwork"];

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="border-none shadow-md">
      <CardHeader><CardTitle className="text-lg">{title}</CardTitle></CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default function CareerOrientationPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [currentId, setCurrentId] = useState("");
  const [form, setForm] = useState<CareerReportPayload>({
    desired_career: "",
    career_goals: "",
    education_level: "Senior Secondary",
    country: "Cameroon",
    favorite_subjects: [],
    strengths: "",
    preferred_university_country: "Cameroon",
    preferred_study_style: "onsite",
    budget_level: "medium",
    response_language: "English",
  });

  const reportsQuery = useQuery({
    queryKey: ["career-reports"],
    queryFn: () => aiService.listCareerReports(),
  });

  const statusQuery = useQuery({
    queryKey: ["career-report-status", currentId],
    enabled: Boolean(currentId),
    queryFn: () => aiService.getCareerReportStatus(currentId),
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.status === "PROCESSING" ? 2000 : false;
    },
  });

  const createReport = useMutation({
    mutationFn: (payload: CareerReportPayload) => aiService.createCareerReport(payload),
    onSuccess: (result) => {
      setCurrentId(result.id);
      setStep(4);
      if (result.report_data || result.status === "COMPLETED") {
        queryClient.setQueryData(["career-report-status", result.id], {
          status: "COMPLETED",
          report_data: result.report_data ?? null,
          error: result.error,
        });
      }
      void queryClient.invalidateQueries({ queryKey: ["career-reports"] });
      toast({
        title: result.status === "COMPLETED" ? "Career report ready" : "Career report started",
        description: result.status === "COMPLETED"
          ? "Your personalized career roadmap is ready to review."
          : "Our AI is building your personalized path.",
      });
    },
    onError: (error) => toast({ variant: "destructive", title: "Report failed", description: getApiErrorMessage(error, "The career report could not be started.") }),
  });

  const data = statusQuery.data?.report_data as CareerReportData | null | undefined;
  const reports = useMemo(() => reportsQuery.data?.results ?? [], [reportsQuery.data]);

  const toggleSubject = (subject: string) => {
    setForm((prev) => ({
      ...prev,
      favorite_subjects: prev.favorite_subjects.includes(subject)
        ? prev.favorite_subjects.filter((item) => item !== subject)
        : [...prev.favorite_subjects, subject],
    }));
  };

  const addStrength = (strength: string) => {
    const current = form.strengths ? form.strengths.split(",").map((item) => item.trim()).filter(Boolean) : [];
    if (current.includes(strength)) return;
    setForm((prev) => ({ ...prev, strengths: [...current, strength].join(", ") }));
  };

  const handleDownload = async (format: "pdf" | "docx") => {
    if (!currentId) return;
    try {
      const blob = format === "pdf"
        ? await aiService.exportCareerPDF(currentId)
        : await aiService.exportCareerDocx(currentId);
      downloadBlob(blob, `career-report.${format}`);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Download failed",
        description: getApiErrorMessage(error, "The career orientation document could not be downloaded right now."),
      });
    }
  };

  return (
    <div className="space-y-6 pb-16">
      <div className="flex flex-col gap-3 rounded-2xl bg-primary p-6 text-white shadow-lg">
        <h1 className="flex items-center gap-3 text-3xl font-black"><GraduationCap className="h-8 w-8 text-secondary" />Discover Your Future Career Path</h1>
        <p className="max-w-3xl text-white/75">Answer a few questions and EduIgnite AI will craft a personalized career roadmap with subjects, universities, skills, and next steps.</p>
        <Button className="w-fit bg-secondary text-primary hover:bg-secondary/90" onClick={() => setStep(1)}><Sparkles className="mr-2 h-4 w-4" />Start Career Assessment</Button>
      </div>

      <Card className="border-none shadow-lg">
        <CardHeader>
          <CardTitle>Assessment Step {Math.min(step, 3)} of 3</CardTitle>
          <CardDescription>{step === 1 ? "Your Dream" : step === 2 ? "Your Education" : "Your Preferences"}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {step === 1 ? (
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2"><Label>What career do you want to pursue?</Label><Input value={form.desired_career} onChange={(event) => setForm((prev) => ({ ...prev, desired_career: event.target.value }))} placeholder="Doctor, Engineer, Lawyer..." /></div>
              <div className="space-y-2"><Label>Response Language</Label><Select value={form.response_language} onValueChange={(value: "English" | "French") => setForm((prev) => ({ ...prev, response_language: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="English">English</SelectItem><SelectItem value="French">French</SelectItem></SelectContent></Select></div>
              <div className="space-y-2 md:col-span-2"><Label>What are your career goals?</Label><Textarea value={form.career_goals} onChange={(event) => setForm((prev) => ({ ...prev, career_goals: event.target.value }))} /></div>
              <Button onClick={() => setStep(2)} disabled={!form.desired_career.trim()}>Next</Button>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-5">
              <div className="space-y-2"><Label>Current education level</Label><Select value={form.education_level} onValueChange={(value) => setForm((prev) => ({ ...prev, education_level: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["Primary", "Junior Secondary", "Senior Secondary", "University"].map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label>Subjects you enjoy most</Label><div className="flex flex-wrap gap-2">{subjectSuggestions.map((subject) => <Button key={subject} type="button" variant={form.favorite_subjects.includes(subject) ? "default" : "outline"} size="sm" onClick={() => toggleSubject(subject)}>{subject}</Button>)}</div></div>
              <div className="space-y-2"><Label>Key strengths</Label><div className="flex flex-wrap gap-2">{strengthSuggestions.map((strength) => <Button key={strength} type="button" variant="outline" size="sm" onClick={() => addStrength(strength)}>{strength}</Button>)}</div><Textarea value={form.strengths} onChange={(event) => setForm((prev) => ({ ...prev, strengths: event.target.value }))} placeholder="Selected strengths appear here. You can edit them." /></div>
              <div className="flex gap-2"><Button variant="outline" onClick={() => setStep(1)}>Back</Button><Button onClick={() => setStep(3)}>Next</Button></div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2"><Label>Country</Label><Input value={form.country} onChange={(event) => setForm((prev) => ({ ...prev, country: event.target.value }))} /></div>
              <div className="space-y-2"><Label>Preferred university country</Label><Input value={form.preferred_university_country} onChange={(event) => setForm((prev) => ({ ...prev, preferred_university_country: event.target.value }))} /></div>
              <div className="space-y-2"><Label>Study style</Label><Select value={form.preferred_study_style} onValueChange={(value: CareerReportPayload["preferred_study_style"]) => setForm((prev) => ({ ...prev, preferred_study_style: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="online">Online</SelectItem><SelectItem value="onsite">On-site</SelectItem><SelectItem value="hybrid">Hybrid</SelectItem></SelectContent></Select></div>
              <div className="space-y-2"><Label>Budget level</Label><Select value={form.budget_level} onValueChange={(value: CareerReportPayload["budget_level"]) => setForm((prev) => ({ ...prev, budget_level: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem></SelectContent></Select></div>
              <div className="flex gap-2 md:col-span-2"><Button variant="outline" onClick={() => setStep(2)}>Back</Button><Button disabled={createReport.isPending} onClick={() => createReport.mutate(form)}>{createReport.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}Generate My Career Roadmap</Button></div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {currentId ? (
        <Card className="border-none shadow-lg">
          <CardHeader>
            <CardTitle>Career Report</CardTitle>
            <CardDescription>{statusQuery.data?.status === "PROCESSING" ? "Our AI is building your personalized path. This usually finishes in a few seconds." : "Your report is ready to review and export."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {statusQuery.data?.status === "PROCESSING" || statusQuery.isLoading ? <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Generating report...</div> : null}
            {statusQuery.data?.status === "FAILED" ? <p className="text-destructive">{statusQuery.data.error || "The report could not be generated."}</p> : null}
            {data ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => handleDownload("pdf")}><Download className="mr-2 h-4 w-4" />Download PDF</Button>
                  <Button variant="outline" onClick={() => handleDownload("docx")}><Download className="mr-2 h-4 w-4" />Download Word</Button>
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <Section title="Career Overview"><p>{data.career_overview}</p></Section>
                  <Section title="Subjects to Focus On"><div className="flex flex-wrap gap-2">{data.subjects_to_focus?.map((item) => <Badge key={item}>{item}</Badge>)}</div></Section>
                  <Section title="Exam Requirements"><ul className="list-disc pl-5">{data.exam_requirements?.map((item) => <li key={item}>{item}</li>)}</ul></Section>
                  <Section title="Career Opportunities"><ul className="list-disc pl-5">{data.career_opportunities?.map((item) => <li key={item}>{item}</li>)}</ul></Section>
                  <Section title="Important Skills"><div className="flex flex-wrap gap-2">{data.important_skills?.map((item) => <Badge key={item} variant="secondary">{item}</Badge>)}</div></Section>
                  <Section title="Future Recommendations"><p>{data.future_recommendations}</p></Section>
                </div>
                <Section title="Recommended Universities">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Name</th><th>Country</th><th>Program</th><th>Website</th></tr></thead><tbody>{data.recommended_universities?.map((uni) => <tr key={`${uni.name}-${uni.program}`} className="border-b"><td className="p-2 font-semibold">{uni.name}</td><td>{uni.country}</td><td>{uni.program}</td><td>{uni.website}</td></tr>)}</tbody></table>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">University recommendations are AI-generated suggestions. Please verify admission requirements directly with each institution.</p>
                </Section>
                <Section title="Step-by-Step Roadmap">
                  <div className="space-y-3">{data.step_by_step_roadmap?.map((item) => <div key={item.step} className="rounded-xl border p-4"><div className="flex items-center gap-2 font-bold text-primary"><MapPinned className="h-4 w-4" />{item.step}. {item.title} <Badge variant="outline">{item.timeline}</Badge></div><p className="mt-2 text-sm text-muted-foreground">{item.description}</p></div>)}</div>
                </Section>
              </>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-none shadow-lg">
        <CardHeader><CardTitle>Previous Reports</CardTitle><CardDescription>Open a recent report and continue from where you stopped.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {reportsQuery.isLoading ? <p className="text-muted-foreground">Loading previous reports...</p> : null}
          {!reportsQuery.isLoading && !reports.length ? <p className="text-muted-foreground">No previous career reports yet.</p> : null}
          {reports.map((report) => (
            <button key={report.id} className="rounded-xl border p-4 text-left transition hover:border-primary" onClick={() => setCurrentId(report.id)}>
              <p className="font-bold text-primary">{report.desired_career}</p>
              <p className="text-sm text-muted-foreground">{new Date(report.created_at).toLocaleDateString()}</p>
              <Badge className="mt-2">{report.status}</Badge>
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
