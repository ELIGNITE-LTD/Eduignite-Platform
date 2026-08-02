"use client";

/**
 * End-of-term and end-of-year performance, for the school administration.
 *
 * The report a head teacher reads out at the close of a term: who came first
 * and last in the school, and the top and bottom of every class, each with
 * their average. Averages are computed from the marks teachers have actually
 * entered, so the report is available the moment marking finishes rather than
 * waiting on a compiled annual result.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Award, Download, Loader2, TrendingDown, TrendingUp, Trophy, Users } from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { downloadPerformanceReportPdf } from "@/lib/performance-report-pdf";

function defaultAcademicYear() {
  const today = new Date();
  const start = today.getMonth() >= 7 ? today.getFullYear() : today.getFullYear() - 1;
  return `${start}-${start + 1}`;
}

export default function PerformanceReportPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [academicYear, setAcademicYear] = useState(defaultAcademicYear());
  const [term, setTerm] = useState("ALL");
  const [isExporting, setIsExporting] = useState(false);

  const canView = ["SCHOOL_ADMIN", "SUB_ADMIN"].includes(String(user?.role || "").toUpperCase());

  const reportQuery = useQuery({
    queryKey: ["performance-report", academicYear, term],
    queryFn: async () => {
      const { data } = await apiClient.get("/students/students/performance-report/", {
        params: { academic_year: academicYear, term: term === "ALL" ? undefined : term },
      });
      return data;
    },
    enabled: canView,
    retry: 1,
  });

  const report = reportQuery.data;
  const schoolName = (user as any)?.school?.name || "School";

  const handleExport = async () => {
    if (!report) return;
    setIsExporting(true);
    try {
      await downloadPerformanceReportPdf({
        schoolName,
        schoolMotto: (user as any)?.school?.motto || "",
        principal: (user as any)?.school?.principal || user?.name || "The Principal",
        report,
      });
      toast({ title: "Report downloaded", description: `${report.scope} report for ${report.academic_year}.` });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Could not build the report", description: error?.message || "Please try again." });
    } finally {
      setIsExporting(false);
    }
  };

  if (!canView) {
    return (
      <div className="mx-auto max-w-lg py-20 text-center">
        <Award className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-bold">School administration only</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          End-of-term performance reports are prepared by the school administration.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="flex items-center gap-3 font-headline text-2xl font-bold uppercase tracking-tighter text-primary md:text-3xl">
            <span className="rounded-xl bg-primary p-2 text-white shadow-lg"><Trophy className="h-6 w-6 text-secondary" /></span>
            Performance Report
          </h1>
          <p className="mt-1 text-xs text-muted-foreground md:text-sm">
            End-of-term and end-of-year standings for the school and every class.
          </p>
        </div>
        <Button onClick={handleExport} disabled={isExporting || !report} className="gap-2 rounded-xl font-bold">
          {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Download report
        </Button>
      </div>

      <Card className="border-none shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base text-primary">Reporting period</CardTitle>
          <CardDescription>Leave the term on “Whole academic year” for the end-of-year report.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Academic year</Label>
            <Input value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} placeholder="2025-2026" className="rounded-xl" />
          </div>
          <div className="space-y-2">
            <Label>Term</Label>
            <Select value={term} onValueChange={setTerm}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Whole academic year</SelectItem>
                <SelectItem value="1">First term</SelectItem>
                <SelectItem value="2">Second term</SelectItem>
                <SelectItem value="3">Third term</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Learners covered</Label>
            <div className="flex h-10 items-center gap-2 rounded-xl border bg-muted/40 px-3 text-sm font-bold text-primary">
              <Users className="h-4 w-4 text-muted-foreground" />
              {reportQuery.isLoading ? "…" : `${report?.student_count ?? 0} with marks recorded`}
            </div>
          </div>
        </CardContent>
      </Card>

      {reportQuery.isLoading ? (
        <div className="flex items-center justify-center gap-3 py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" /> Building the report…
        </div>
      ) : !report || !report.student_count ? (
        <Card className="border-none shadow-sm">
          <CardContent className="py-16 text-center">
            <Award className="mx-auto h-10 w-10 text-primary/20" />
            <p className="mt-3 font-bold text-muted-foreground">No marks recorded for this period yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">Check the academic year and term above.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Headline: school average, first and last */}
          <div className="grid gap-4 md:grid-cols-3">
            <HeadlineCard
              tone="primary"
              icon={<Users className="h-5 w-5" />}
              label="School average"
              value={`${Number(report.school_average).toFixed(2)} / 20`}
              caption={`${report.scope} · ${report.academic_year}`}
            />
            <HeadlineCard
              tone="green"
              icon={<TrendingUp className="h-5 w-5" />}
              label="First in school"
              value={report.best?.name || "-"}
              caption={`${Number(report.best?.average ?? 0).toFixed(2)} / 20 · ${report.best?.class_name || ""}`}
            />
            <HeadlineCard
              tone="amber"
              icon={<TrendingDown className="h-5 w-5" />}
              label="Last in school"
              value={report.weakest?.name || "-"}
              caption={`${Number(report.weakest?.average ?? 0).toFixed(2)} / 20 · ${report.weakest?.class_name || ""}`}
            />
          </div>

          {/* Whole-school tally: how many sat, passed and failed (and, for the
              end-of-year report, how many were promoted or repeated). */}
          <div className="flex flex-wrap gap-3">
            <StatChip tone="primary" label="Students" value={report.student_count} />
            <StatChip tone="green" label="Passed" value={report.passed_count ?? 0} />
            <StatChip tone="red" label="Failed" value={report.failed_count ?? 0} />
            {report.is_annual && (
              <>
                <StatChip tone="blue" label="Promoted" value={report.promoted_count ?? 0} />
                <StatChip tone="amber" label="Repeated" value={report.repeated_count ?? 0} />
              </>
            )}
            {report.pass_mark != null && (
              <span className="ml-auto self-center text-[11px] font-semibold text-muted-foreground">
                Pass mark {Number(report.pass_mark).toFixed(2)} / 20
              </span>
            )}
          </div>

          {/* Class by class */}
          <div className="space-y-5">
            {(report.classes || []).map((klass: any) => (
              <Card key={klass.class_name} className="border-none shadow-sm">
                <CardHeader className="flex-row items-start justify-between gap-4 pb-3">
                  <div>
                    <CardTitle className="text-base text-primary">{klass.class_name}</CardTitle>
                    <CardDescription>{klass.student_count} learner(s) with marks</CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Badge className="border-none bg-green-100 text-xs font-black text-green-700">
                      {klass.passed_count ?? 0} passed
                    </Badge>
                    <Badge className="border-none bg-red-100 text-xs font-black text-red-700">
                      {klass.failed_count ?? 0} failed
                    </Badge>
                    {report.is_annual && (
                      <>
                        <Badge className="border-none bg-blue-100 text-xs font-black text-blue-700">
                          {klass.promoted_count ?? 0} promoted
                        </Badge>
                        <Badge className="border-none bg-amber-100 text-xs font-black text-amber-700">
                          {klass.repeated_count ?? 0} repeated
                        </Badge>
                      </>
                    )}
                    <Badge className="border-none bg-primary/10 text-xs font-black text-primary">
                      Avg {Number(klass.class_average).toFixed(2)} / 20
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-5 lg:grid-cols-2">
                  <RankTable title="Top of the class" rows={klass.top} tone="green" />
                  <RankTable title="Needs support" rows={klass.bottom} tone="amber" />
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function HeadlineCard({
  icon, label, value, caption, tone,
}: { icon: React.ReactNode; label: string; value: string; caption: string; tone: "primary" | "green" | "amber" }) {
  const tones: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    green: "bg-green-100 text-green-700",
    amber: "bg-amber-100 text-amber-700",
  };
  return (
    <Card className="border-none shadow-sm">
      <CardContent className="flex items-start gap-4 p-5">
        <span className={cn("rounded-2xl p-3", tones[tone])}>{icon}</span>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
          <p className="mt-1 truncate text-lg font-black text-primary">{value}</p>
          <p className="mt-0.5 truncate text-[11px] font-semibold text-muted-foreground">{caption}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function StatChip({ label, value, tone }: { label: string; value: number; tone: "primary" | "green" | "red" | "blue" | "amber" }) {
  const tones: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    green: "bg-green-100 text-green-700",
    red: "bg-red-100 text-red-700",
    blue: "bg-blue-100 text-blue-700",
    amber: "bg-amber-100 text-amber-700",
  };
  return (
    <span className={cn("flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-black", tones[tone])}>
      <span className="text-lg tabular-nums">{value}</span>
      <span className="text-[10px] font-black uppercase tracking-widest opacity-80">{label}</span>
    </span>
  );
}

function RankTable({ title, rows, tone }: { title: string; rows: any[]; tone: "green" | "amber" }) {
  return (
    <div className="rounded-2xl border">
      <p className={cn(
        "rounded-t-2xl px-4 py-2 text-[10px] font-black uppercase tracking-widest",
        tone === "green" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700",
      )}>
        {title}
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">Pos</TableHead>
            <TableHead>Student</TableHead>
            <TableHead className="text-right">Average</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(rows || []).map((row) => (
            <TableRow key={row.student_id}>
              <TableCell className="font-black text-muted-foreground">{row.position}</TableCell>
              <TableCell>
                <p className="font-bold text-primary">{row.name}</p>
                <p className="font-mono text-[10px] text-muted-foreground">{row.matricule}</p>
              </TableCell>
              <TableCell className="text-right font-black tabular-nums text-primary">
                {Number(row.average).toFixed(2)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
