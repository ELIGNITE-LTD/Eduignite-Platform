"use client";

/**
 * "Download Attendance History" for principals and vice principals, and
 * "Download Subject Attendance History" for teachers.
 *
 * The filters offered come from the server and already respect who is asking:
 * a vice principal only sees their sections, a teacher only their subjects and
 * classes. Previewing fetches the real records and shows the totals before
 * anything is downloaded; an empty result says so instead of producing an
 * empty document.
 *
 * This file is identical in the website, mobile and desktop apps.
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Eye, FileText, Loader2, Printer } from "lucide-react";

import { attendanceService } from "@/lib/api/services/attendance.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import {
  attendanceRateLabel,
  downloadAttendanceHistoryPdf,
  formatReportDate,
  reportTitle,
  type AttendanceHistoryReport,
} from "@/lib/attendance-history-pdf";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL = "all";

function todayIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function AttendanceHistoryExport({ variant }: { variant: "school" | "subject" }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState("");
  const [term, setTerm] = useState(ALL);
  const [section, setSection] = useState(ALL);
  const [classId, setClassId] = useState(ALL);
  const [subjectId, setSubjectId] = useState(ALL);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [report, setReport] = useState<AttendanceHistoryReport | null>(null);
  const [busy, setBusy] = useState<"preview" | "download" | "print" | null>(null);

  const optionsQuery = useQuery({
    queryKey: ["attendance-history-options"],
    queryFn: () => attendanceService.getHistoryReportOptions(),
    enabled: open,
  });
  const options = optionsQuery.data;
  const calendar = options?.calendar ?? [];

  // Start on the newest year and the term running today, when there is one.
  useEffect(() => {
    if (!calendar.length || year) return;
    const today = todayIso();
    const current = calendar.find((y) => y.start_date <= today && today <= y.end_date) ?? calendar[0];
    setYear(current.academic_year);
    const running = current.terms.find((t) => t.start_date <= today && today <= t.end_date);
    setTerm(running ? String(running.term) : ALL);
  }, [calendar, year]);

  const selectedYear = calendar.find((y) => y.academic_year === year);
  const selectedTerm = selectedYear?.terms.find((t) => String(t.term) === term);
  const windowStart = selectedTerm?.start_date ?? selectedYear?.start_date ?? "";
  const windowEnd = selectedTerm?.end_date ?? selectedYear?.end_date ?? "";

  const sections = options?.sub_schools ?? [];
  const classes = useMemo(() => {
    if (variant === "subject") {
      const seen = new Map<string, string>();
      for (const a of options?.assignments ?? []) {
        if (subjectId === ALL || a.subject_id === subjectId) seen.set(a.class_id, a.class_name);
      }
      return [...seen].map(([id, name]) => ({ id, name }));
    }
    return (options?.classes ?? []).filter((c) => section === ALL || c.sub_school_id === section);
  }, [variant, options, subjectId, section]);
  const subjects = useMemo(() => {
    const seen = new Map<string, string>();
    for (const a of options?.assignments ?? []) seen.set(a.subject_id, a.subject_name);
    return [...seen].map(([id, name]) => ({ id, name }));
  }, [options]);

  // A change of filters makes the last preview stale.
  useEffect(() => setReport(null), [year, term, section, classId, subjectId, startDate, endDate]);
  useEffect(() => {
    if (classId !== ALL && !classes.some((c) => c.id === classId)) setClassId(ALL);
  }, [classes, classId]);

  const params = () => {
    const query: Record<string, string> = {};
    if (year) query.academic_year = year;
    if (year && term !== ALL) query.term = term;
    if (section !== ALL) query.sub_school = section;
    if (classId !== ALL) query.class_id = classId;
    if (subjectId !== ALL) query.subject = subjectId;
    if (startDate) query.start_date = startDate;
    if (endDate) query.end_date = endDate;
    return query;
  };

  const fetchReport = async () => {
    const data = await attendanceService.getHistoryReport(params());
    setReport(data);
    return data;
  };

  const run = async (action: "preview" | "download" | "print") => {
    setBusy(action);
    try {
      const data = report ?? (await fetchReport());
      if (action === "preview") return;
      if (!data.rows.length) {
        toast({ title: "Nothing to download", description: "No attendance was recorded for these filters." });
        return;
      }
      await downloadAttendanceHistoryPdf(data, { print: action === "print" });
    } catch (error) {
      toast({ variant: "destructive", title: "Report unavailable", description: getApiErrorMessage(error, "The report could not be prepared.") });
    } finally {
      setBusy(null);
    }
  };

  const label = variant === "subject" ? "Download Subject Attendance History" : "Download Attendance History";
  const noCalendar = !!options && calendar.length === 0;

  return (
    <>
      <Button variant="outline" className="gap-2 rounded-xl font-bold" onClick={() => setOpen(true)}>
        <FileText className="h-4 w-4" /> {label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-primary">{reportTitle(variant)}</DialogTitle>
            <DialogDescription>
              {variant === "subject"
                ? "Attendance you recorded in the subjects and classes you teach."
                : "Attendance recorded across your school, by term, section, class and dates."}
            </DialogDescription>
          </DialogHeader>

          {optionsQuery.isLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading filters...
            </div>
          ) : optionsQuery.isError ? (
            <p className="py-6 text-sm text-destructive">{getApiErrorMessage(optionsQuery.error, "Filters could not be loaded.")}</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {noCalendar ? (
                <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 sm:col-span-2">
                  Your school calendar has no terms yet, so choose a start and end date.
                </p>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Academic Year</Label>
                    <Select value={year} onValueChange={(value) => { setYear(value); setTerm(ALL); }}>
                      <SelectTrigger><SelectValue placeholder="Select year" /></SelectTrigger>
                      <SelectContent>
                        {calendar.map((y) => <SelectItem key={y.academic_year} value={y.academic_year}>{y.academic_year}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Term</Label>
                    <Select value={term} onValueChange={setTerm}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL}>Whole year</SelectItem>
                        {selectedYear?.terms.map((t) => <SelectItem key={t.term} value={String(t.term)}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {variant === "school" && sections.length > 1 ? (
                <div className="space-y-2">
                  <Label>Section</Label>
                  <Select value={section} onValueChange={setSection}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>All sections</SelectItem>
                      {sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              {variant === "subject" ? (
                <div className="space-y-2">
                  <Label>Subject</Label>
                  <Select value={subjectId} onValueChange={setSubjectId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>All my subjects</SelectItem>
                      {subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              <div className="space-y-2">
                <Label>Class</Label>
                <Select value={classId} onValueChange={setClassId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>{variant === "subject" ? "All my classes" : "All classes"}</SelectItem>
                    {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>From</Label>
                <Input type="date" value={startDate} min={windowStart || undefined} max={windowEnd || undefined} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>To</Label>
                <Input type="date" value={endDate} min={startDate || windowStart || undefined} max={windowEnd || undefined} onChange={(e) => setEndDate(e.target.value)} />
              </div>
              {windowStart ? (
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  {selectedTerm ? selectedTerm.label : "This year"} runs from {formatReportDate(windowStart)} to {formatReportDate(windowEnd)}. Leave the dates empty to cover all of it.
                </p>
              ) : null}
            </div>
          )}

          {report ? (
            report.rows.length === 0 ? (
              <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
                No attendance was recorded for these filters.
              </p>
            ) : (
              <div className="rounded-xl border bg-accent/10 p-4">
                <p className="mb-3 text-xs font-black uppercase tracking-wider text-primary">Preview</p>
                <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                  {[
                    ["Students on roll", report.summary.students_on_roll],
                    ["Students recorded", report.summary.students_recorded],
                    ["Sessions", report.summary.sessions],
                    ["Attendance records", report.summary.records],
                    ["Present", report.summary.present],
                    ["Absent", report.summary.absent],
                    ["Late", report.summary.late],
                    ["Excused", report.summary.excused],
                    ["Attendance rate", attendanceRateLabel(report.summary.attendance_rate)],
                  ].map(([name, value]) => (
                    <div key={name} className="rounded-lg bg-white p-2 shadow-sm">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground">{name}</p>
                      <p className="text-lg font-black text-primary">{value}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {formatReportDate(report.filters.start_date)} to {formatReportDate(report.filters.end_date)}
                  {report.filters.class ? ` · ${report.filters.class}` : ""}
                  {report.filters.subject ? ` · ${report.filters.subject}` : ""}
                </p>
              </div>
            )
          ) : null}

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" className="gap-2" disabled={!!busy || optionsQuery.isLoading} onClick={() => void run("preview")}>
              {busy === "preview" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} Preview
            </Button>
            <Button variant="outline" className="gap-2" disabled={!!busy || optionsQuery.isLoading || report?.rows.length === 0} onClick={() => void run("print")}>
              {busy === "print" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />} Print
            </Button>
            <Button className="gap-2" disabled={!!busy || optionsQuery.isLoading || report?.rows.length === 0} onClick={() => void run("download")}>
              {busy === "download" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
