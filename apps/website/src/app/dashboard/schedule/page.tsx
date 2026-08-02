"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CalendarDays, CheckCircle2, Clock, Download, Loader2, Plus, Send, Trash2, User as UserIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api/errors";
import { gradesService } from "@/lib/api/services/grades.service";
import { schoolsService } from "@/lib/api/services/schools.service";
import { studentsService } from "@/lib/api/services/students.service";
import type { HierarchyClass, HierarchyClassSubject, Student, Subject, TimetableEntry, User } from "@/lib/api/types";
import { useAuth } from "@/lib/auth-context";
import { pdfGenerationService } from "@/lib/pdf-generation-service";
import { cn } from "@/lib/utils";

const DAY_OPTIONS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

const TERM_OPTIONS = ["First", "Second", "Third"];

type TimetableForm = {
  schoolClass: string;
  classSubject: string;
  subject: string;
  teacher: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  room: string;
  notes: string;
  academicYear: string;
  term: string;
};

const EMPTY_FORM: TimetableForm = {
  schoolClass: "",
  classSubject: "",
  subject: "",
  teacher: "",
  dayOfWeek: "1",
  startTime: "07:30",
  endTime: "08:25",
  room: "",
  notes: "",
  academicYear: "",
  term: "First",
};

function normalizeList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  const response = payload as { results?: T[] } | undefined;
  return response?.results ?? [];
}

function formatTime(value?: string) {
  if (!value) return "--:--";
  return value.slice(0, 5);
}

function isAcademicStaff(user?: User) {
  return ["TEACHER", "SUB_ADMIN", "SCHOOL_ADMIN"].includes(String(user?.role || ""));
}

function getEntityId(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return getEntityId(record.id || record.uid || record.pk);
  }
  return "";
}

function getRecordText(value: unknown, keys: string[]): string {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const item = record[key];
    if (typeof item === "string" && item.trim()) return item.trim();
  }
  return "";
}

function downloadGeneratedFile(url: string, fileName: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export default function SchedulePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const schoolId = user?.school?.id || user?.school_id || user?.schoolId || "";
  const role = String(user?.role || "");
  const isAdmin = role === "SCHOOL_ADMIN" || role === "SUB_ADMIN";
  const isTeacher = role === "TEACHER";
  const isStudent = role === "STUDENT";
  const isParent = role === "PARENT";

  const [form, setForm] = useState<TimetableForm>(EMPTY_FORM);

  const settingsQuery = useQuery({
    queryKey: ["school-settings-for-timetable", schoolId],
    queryFn: () => schoolsService.getSchoolSettings(schoolId),
    enabled: Boolean(schoolId),
  });

  const classesQuery = useQuery({
    queryKey: ["timetable-classes", schoolId],
    queryFn: () => schoolsService.getSchoolClasses(schoolId),
    enabled: Boolean(schoolId && isAdmin),
  });

  const subjectsQuery = useQuery({
    queryKey: ["timetable-class-subjects", schoolId],
    queryFn: () => schoolsService.getHierarchySubjects(),
    enabled: Boolean(schoolId && isAdmin),
  });

  const subjectCatalogQuery = useQuery({
    queryKey: ["timetable-subject-catalog", schoolId],
    queryFn: () => gradesService.getSubjects({ limit: 500 }),
    enabled: Boolean(schoolId && isAdmin),
  });

  const staffQuery = useQuery({
    queryKey: ["timetable-staff", schoolId],
    queryFn: () => schoolsService.getHierarchyStaff(),
    enabled: Boolean(schoolId && isAdmin),
  });

  const timetableQuery = useQuery({
    queryKey: ["school-timetable", schoolId, role, isAdmin],
    queryFn: () => schoolsService.getTimetable(isAdmin ? {} : { status: "PUBLISHED" }),
    enabled: Boolean(user?.id),
  });

  // Parents view a separate timetable per child, so we need each child's class.
  const childrenQuery = useQuery({
    queryKey: ["timetable-children", schoolId],
    queryFn: () => studentsService.getMyChildren(),
    enabled: Boolean(user?.id) && isParent,
  });

  const settings = settingsQuery.data;
  const classes = normalizeList<HierarchyClass>(classesQuery.data);
  const classSubjects = normalizeList<HierarchyClassSubject>(subjectsQuery.data);
  const subjectCatalog = normalizeList<Subject>(subjectCatalogQuery.data);
  const staff = normalizeList<User>(staffQuery.data).filter(isAcademicStaff);
  const entries = normalizeList<TimetableEntry>(timetableQuery.data);
  const children = normalizeList<Student>(childrenQuery.data);

  const subjectNameById = useMemo(() => {
    const map = new Map<string, string>();
    subjectCatalog.forEach((subject) => {
      if (subject.id) map.set(String(subject.id), subject.name);
    });
    return map;
  }, [subjectCatalog]);

  const teacherNameById = useMemo(() => {
    const map = new Map<string, string>();
    staff.forEach((member) => {
      if (member.id) map.set(String(member.id), member.name || "Teacher");
    });
    return map;
  }, [staff]);

  useEffect(() => {
    setForm((current) => ({
      ...current,
      academicYear: current.academicYear || settings?.academic_year || "2026-2027",
      term: current.term || settings?.term || "First",
    }));
  }, [settings?.academic_year, settings?.term]);

  useEffect(() => {
    if (!isAdmin || form.schoolClass || !classes.length) return;
    setForm((current) => ({ ...current, schoolClass: classes[0].id }));
  }, [classes, form.schoolClass, isAdmin]);

  const filteredClassSubjects = useMemo(
    () => classSubjects.filter((item) => item.school_class === form.schoolClass),
    [classSubjects, form.schoolClass]
  );

  useEffect(() => {
    const selected = filteredClassSubjects.find((item) => item.id === form.classSubject);
    if (selected) {
      setForm((current) => ({
        ...current,
        subject: selected.subject || current.subject,
        teacher: selected.teacher || current.teacher,
      }));
      return;
    }
    if (filteredClassSubjects.length) {
      const first = filteredClassSubjects[0];
      setForm((current) => ({
        ...current,
        classSubject: first.id,
        subject: first.subject || "",
        teacher: first.teacher || "",
      }));
    }
  }, [filteredClassSubjects, form.classSubject]);

  const grouped = useMemo(() => {
    const map = new Map<number, TimetableEntry[]>();
    DAY_OPTIONS.forEach((day) => map.set(day.value, []));
    entries
      .slice()
      .sort((a, b) => Number(a.day_of_week) - Number(b.day_of_week) || a.start_time.localeCompare(b.start_time))
      .forEach((entry) => {
        map.set(Number(entry.day_of_week), [...(map.get(Number(entry.day_of_week)) ?? []), entry]);
      });
    return map;
  }, [entries]);

  const createMutation = useMutation({
    mutationFn: () => schoolsService.createTimetableEntry({
      school_class: form.schoolClass,
      class_subject: form.classSubject || undefined,
      subject: form.subject,
      teacher: form.teacher || undefined,
      academic_year: form.academicYear,
      term: form.term,
      day_of_week: Number(form.dayOfWeek),
      start_time: form.startTime,
      end_time: form.endTime,
      room: form.room,
      notes: form.notes,
    }),
    onSuccess: () => {
      toast({ title: "Timetable period added", description: "The period was saved as a draft." });
      setForm((current) => ({ ...current, room: "", notes: "" }));
      queryClient.invalidateQueries({ queryKey: ["school-timetable"] });
    },
    onError: (error) => {
      toast({ variant: "destructive", title: "Could not save period", description: getApiErrorMessage(error, "Check the time, class, teacher and subject.") });
    },
  });

  const publishMutation = useMutation({
    mutationFn: (id: string) => schoolsService.publishTimetableEntry(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["school-timetable"] }),
  });

  const unpublishMutation = useMutation({
    mutationFn: (id: string) => schoolsService.unpublishTimetableEntry(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["school-timetable"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => schoolsService.deleteTimetableEntry(id),
    onSuccess: () => {
      toast({ title: "Timetable period removed" });
      queryClient.invalidateQueries({ queryKey: ["school-timetable"] });
    },
  });

  const publishAllMutation = useMutation({
    mutationFn: () => schoolsService.publishTimetable({ academic_year: form.academicYear, term: form.term }),
    onSuccess: (result) => {
      toast({ title: "Timetable published", description: `${result.published_count || 0} draft period(s) were published.` });
      queryClient.invalidateQueries({ queryKey: ["school-timetable"] });
    },
    onError: (error) => toast({ variant: "destructive", title: "Publish failed", description: getApiErrorMessage(error, "Could not publish the timetable.") }),
  });

  const downloadTimetable = async () => {
    try {
      const school = user?.school;
      const result = await pdfGenerationService.generateTimetablePDF({
        entries,
        academicYear: form.academicYear || settings?.academic_year || entries[0]?.academic_year || "Current Academic Year",
        term: form.term || settings?.term || entries[0]?.term || "Current Term",
        title: isAdmin ? "OFFICIAL SCHOOL TIMETABLE" : "MY OFFICIAL TIMETABLE",
        scopeLabel: isAdmin ? "School timetable" : `${user?.name || "User"} timetable`,
        schoolData: {
          name: school?.name || "School",
          logo: school?.logo,
          motto: school?.motto,
          principal: school?.principal,
          address: school?.address,
          location: school?.location,
          region: school?.region,
          matricule: school?.matricule,
        },
      });
      if (!result.success || !result.downloadUrl) {
        throw new Error(result.error || "The timetable PDF could not be generated.");
      }
      downloadGeneratedFile(result.downloadUrl, result.fileName);
      toast({ title: "Timetable downloaded", description: "A branded PDF copy of the timetable has been generated." });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Download failed",
        description: error instanceof Error ? error.message : "The timetable PDF could not be generated.",
      });
    }
  };

  const getSubjectOptionLabel = (item: HierarchyClassSubject) => {
    if (item.display_name?.trim()) return item.display_name.trim();
    const subjectId = getEntityId(item.subject);
    const teacherId = getEntityId(item.teacher);
    const subjectName = item.subject_name
      || getRecordText(item.subject, ["name", "title"])
      || subjectNameById.get(subjectId)
      || item.subject_code
      || "Unnamed subject";
    const teacherName = item.teacher_name
      || getRecordText(item.teacher, ["name", "full_name"])
      || teacherNameById.get(teacherId)
      || "";
    return teacherName ? `${subjectName} (${teacherName})` : subjectName;
  };

  const canSubmit = Boolean(form.schoolClass && form.subject && form.dayOfWeek && form.startTime && form.endTime && form.academicYear && form.term);
  const isLoading = timetableQuery.isLoading || (isAdmin && (classesQuery.isLoading || subjectsQuery.isLoading || subjectCatalogQuery.isLoading));

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold text-primary font-headline">
            <span className="rounded-xl bg-primary p-2 text-white shadow-lg">
              <CalendarDays className="h-6 w-6 text-secondary" />
            </span>
            {isAdmin ? "School Timetable" : isParent ? "Children's Timetables" : "My Timetable"}
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Cameroon secondary timetable periods for classes, subjects and assigned teachers. Published periods are visible to teachers, students and parents.
          </p>
        </div>
        {isAdmin ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              className="h-11 rounded-xl font-black uppercase"
              onClick={downloadTimetable}
              disabled={!entries.length}
            >
              <Download className="mr-2 h-4 w-4" />
              Download PDF
            </Button>
            <Button
              className="h-11 rounded-xl font-black uppercase"
              onClick={() => publishAllMutation.mutate()}
              disabled={publishAllMutation.isPending || !entries.some((entry) => entry.status === "DRAFT")}
            >
              {publishAllMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Publish Drafts
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            className="h-11 rounded-xl font-black uppercase"
            onClick={downloadTimetable}
            disabled={!entries.length}
          >
            <Download className="mr-2 h-4 w-4" />
            Download PDF
          </Button>
        )}
      </div>

      {isAdmin ? (
        <Card className="border-none bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-black uppercase text-primary">Draft a Teaching Period</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-4">
            <Field label="Class">
              <Select value={form.schoolClass} onValueChange={(value) => setForm((current) => ({ ...current, schoolClass: value, classSubject: "", subject: "", teacher: "" }))}>
                <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                <SelectContent>
                  {classes.map((item) => (
                    <SelectItem key={item.id} value={item.id}>{item.name}{item.sub_school_name ? ` (${item.sub_school_name})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Subject">
              <Select value={form.classSubject} onValueChange={(value) => setForm((current) => ({ ...current, classSubject: value }))}>
                <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
                <SelectContent>
                  {filteredClassSubjects.map((item) => (
                    <SelectItem key={item.id} value={item.id}>{getSubjectOptionLabel(item)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Teacher">
              <Select value={form.teacher} onValueChange={(value) => setForm((current) => ({ ...current, teacher: value }))}>
                <SelectTrigger><SelectValue placeholder="Teacher" /></SelectTrigger>
                <SelectContent>
                  {staff.map((item) => <SelectItem key={item.id} value={item.id}>{item.name} ({item.role})</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Day">
              <Select value={form.dayOfWeek} onValueChange={(value) => setForm((current) => ({ ...current, dayOfWeek: value }))}>
                <SelectTrigger><SelectValue placeholder="Day" /></SelectTrigger>
                <SelectContent>
                  {DAY_OPTIONS.map((day) => <SelectItem key={day.value} value={String(day.value)}>{day.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Start Time"><Input type="time" value={form.startTime} onChange={(event) => setForm((current) => ({ ...current, startTime: event.target.value }))} /></Field>
            <Field label="End Time"><Input type="time" value={form.endTime} onChange={(event) => setForm((current) => ({ ...current, endTime: event.target.value }))} /></Field>
            <Field label="Academic Year"><Input value={form.academicYear} onChange={(event) => setForm((current) => ({ ...current, academicYear: event.target.value }))} placeholder="2026-2027" /></Field>
            <Field label="Term">
              <Select value={form.term} onValueChange={(value) => setForm((current) => ({ ...current, term: value }))}>
                <SelectTrigger><SelectValue placeholder="Term" /></SelectTrigger>
                <SelectContent>{TERM_OPTIONS.map((term) => <SelectItem key={term} value={term}>{term} Term</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Room / Block"><Input value={form.room} onChange={(event) => setForm((current) => ({ ...current, room: event.target.value }))} placeholder="Room 4 / Lab / Workshop" /></Field>
            <div className="lg:col-span-3">
              <Field label="Notes"><Textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Optional preparation note" /></Field>
            </div>
            <div className="lg:col-span-4">
              <Button className="h-11 rounded-xl font-black uppercase" onClick={() => createMutation.mutate()} disabled={!canSubmit || createMutation.isPending}>
                {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Add Draft Period
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {isLoading ? (
        <div className="flex h-64 items-center justify-center rounded-3xl border bg-white">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : timetableQuery.isError ? (
        <Card className="border-none shadow-sm">
          <CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
            <AlertCircle className="h-10 w-10 text-destructive" />
            <p className="font-bold text-primary">Could not load timetable.</p>
            <Button variant="outline" onClick={() => timetableQuery.refetch()}>Retry</Button>
          </CardContent>
        </Card>
      ) : isAdmin ? (
        entries.length === 0 ? (
          <Card className="border-none shadow-sm">
            <CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
              <Clock className="h-10 w-10 text-primary/20" />
              <p className="font-bold text-primary">No timetable periods have been drafted yet.</p>
              <p className="max-w-lg text-sm text-muted-foreground">Add periods above, then publish when the timetable is ready.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-5 xl:grid-cols-3">
            {DAY_OPTIONS.map((day) => {
              const dayEntries = grouped.get(day.value) ?? [];
              return (
                <Card key={day.value} className="border-none bg-white shadow-sm">
                  <CardHeader className="border-b">
                    <CardTitle className="text-base font-black uppercase text-primary">{day.label}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {dayEntries.length ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Time</TableHead>
                            <TableHead>Class / Subject</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {dayEntries.map((entry) => (
                            <TableRow key={entry.id}>
                              <TableCell className="whitespace-nowrap text-xs font-black text-primary">{formatTime(entry.start_time)}-{formatTime(entry.end_time)}</TableCell>
                              <TableCell>
                                <div className="space-y-1">
                                  <p className="text-xs font-black text-primary">{entry.subject_name || "Subject"}</p>
                                  <p className="text-[10px] font-bold text-muted-foreground">{entry.school_class_name}{entry.room ? ` | ${entry.room}` : ""}</p>
                                  <p className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground">
                                    <UserIcon className="h-3 w-3" /> {entry.teacher_name || "Teacher pending"}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge className={cn("border-none text-[8px] font-black uppercase", entry.status === "PUBLISHED" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700")}>
                                  {entry.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                  {entry.status === "PUBLISHED" ? (
                                    <Button size="sm" variant="outline" onClick={() => unpublishMutation.mutate(entry.id)}>Unpublish</Button>
                                  ) : (
                                    <Button size="sm" variant="outline" onClick={() => publishMutation.mutate(entry.id)}>
                                      <CheckCircle2 className="mr-1 h-3 w-3" /> Publish
                                    </Button>
                                  )}
                                  <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteMutation.mutate(entry.id)}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="py-10 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">No periods</div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      ) : isParent ? (
        childrenQuery.isLoading ? (
          <div className="flex h-64 items-center justify-center rounded-3xl border bg-white"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : children.length === 0 ? (
          <Card className="border-none shadow-sm">
            <CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
              <Clock className="h-10 w-10 text-primary/20" />
              <p className="font-bold text-primary">No linked children yet.</p>
              <p className="max-w-lg text-sm text-muted-foreground">Once your children are linked and their class timetable is published, each child&apos;s timetable will appear here separately.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {children.map((child) => {
              const childClass = child.school_class_name || child.student_class || "";
              const childEntries = entries.filter((entry) =>
                (Boolean(child.school_class) && String(entry.school_class) === String(child.school_class))
                || (Boolean(childClass) && String(entry.school_class_name || "") === String(childClass)),
              );
              return (
                <Card key={child.id} className="border-none bg-white shadow-sm">
                  <CardHeader className="flex flex-row items-center gap-3 border-b">
                    <span className="rounded-xl bg-primary/10 p-2 text-primary"><UserIcon className="h-5 w-5" /></span>
                    <div>
                      <CardTitle className="text-base font-black uppercase text-primary">{child.user?.name || "Child"}</CardTitle>
                      <p className="text-xs font-bold text-muted-foreground">{childClass || "Class not assigned"}</p>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4">
                    <WeeklyTimetable entries={childEntries} variant="student" />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      ) : entries.length === 0 ? (
        <Card className="border-none shadow-sm">
          <CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
            <Clock className="h-10 w-10 text-primary/20" />
            <p className="font-bold text-primary">No published timetable is available yet.</p>
            <p className="max-w-lg text-sm text-muted-foreground">Once the school admin publishes your class timetable, it will appear here.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-none bg-white shadow-sm">
          <CardContent className="p-4">
            <WeeklyTimetable entries={entries} variant={isTeacher ? "teacher" : "student"} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

// A professional weekly timetable grid: time-slot rows × day columns. Each cell
// shows the subject with the class (teacher view) or the teacher (student view)
// plus the room. Real data from the published TimetableEntry feed.
function WeeklyTimetable({ entries, variant }: { entries: TimetableEntry[]; variant: "teacher" | "student" }) {
  const slots = useMemo(() => {
    const map = new Map<string, { start: string; end: string }>();
    entries.forEach((entry) => {
      map.set(`${entry.start_time}|${entry.end_time}`, { start: entry.start_time, end: entry.end_time });
    });
    return Array.from(map.values()).sort((a, b) => a.start.localeCompare(b.start));
  }, [entries]);

  const days = useMemo(() => {
    const hasSaturday = entries.some((entry) => Number(entry.day_of_week) === 6);
    return DAY_OPTIONS.filter((day) => day.value <= 5 || hasSaturday);
  }, [entries]);

  if (!entries.length) {
    return (
      <div className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed py-10 text-center">
        <Clock className="h-8 w-8 text-primary/20" />
        <p className="text-sm font-bold text-muted-foreground">No published periods yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border shadow-sm">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="bg-primary text-white">
            <th className="sticky left-0 z-10 bg-primary px-4 py-3 text-left text-[11px] font-black uppercase tracking-widest">Time</th>
            {days.map((day) => (
              <th key={day.value} className="border-l border-white/10 px-3 py-3 text-center text-[11px] font-black uppercase tracking-widest">{day.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {slots.map((slot, index) => (
            <tr key={`${slot.start}-${slot.end}`} className={cn(index % 2 === 1 ? "bg-accent/5" : "bg-white")}>
              <td className={cn("sticky left-0 z-10 whitespace-nowrap border-t px-4 py-3 text-xs font-black text-primary", index % 2 === 1 ? "bg-accent/5" : "bg-white")}>
                {formatTime(slot.start)} <span className="text-muted-foreground">–</span> {formatTime(slot.end)}
              </td>
              {days.map((day) => {
                const cells = entries.filter(
                  (entry) => Number(entry.day_of_week) === day.value && entry.start_time === slot.start && entry.end_time === slot.end,
                );
                return (
                  <td key={day.value} className="border-l border-t px-2 py-2 align-top">
                    {cells.length ? (
                      cells.map((entry) => (
                        <div key={entry.id} className="mb-1 rounded-lg border border-primary/10 bg-primary/5 px-2.5 py-1.5 last:mb-0">
                          <p className="text-xs font-black leading-tight text-primary">{entry.subject_name || "Subject"}</p>
                          <p className="text-[10px] font-bold text-muted-foreground">{variant === "teacher" ? (entry.school_class_name || "Class") : (entry.teacher_name || "Teacher")}</p>
                          {entry.room ? <p className="mt-0.5 text-[9px] font-black uppercase tracking-wide text-secondary">{entry.room}</p> : null}
                        </div>
                      ))
                    ) : (
                      <div className="py-2 text-center text-[10px] text-muted-foreground/30">—</div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
