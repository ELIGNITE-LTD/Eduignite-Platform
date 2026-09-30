"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, CalendarDays, ChevronRight, Clock, History, Info, LayoutGrid, Loader2, MapPin, PenTool, Plus, Printer, Sparkles, Timer, User, X } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { getApiErrorMessage } from "@/lib/api/errors";
import { useActiveSequence, useSequences, useSubjects } from "@/lib/hooks/useGrades";
import { useStudents } from "@/lib/hooks/useStudents";
import { useHierarchyClasses, useSchoolSettings } from "@/lib/hooks/useSchools";
import { useCreateExam, useExams, useMyExamResults } from "@/lib/hooks/useExams";
import { useQuery } from "@tanstack/react-query";
import { gradesService } from "@/lib/api/services/grades.service";
import type { CreateExamRequest, ExamQuestion } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const EXAM_TYPES = [
  { value: "SEQUENCE", label: "Sequence Assessment" },
  { value: "MID_TERM", label: "Mid-Term Evaluation" },
  { value: "END_TERM", label: "End of Term Examination" },
  { value: "MOCK", label: "Mock Exam" },
  { value: "OTHER", label: "Other" },
];

type ExamFormState = {
  title: string; exam_type: string; mode: "ONSITE" | "ONLINE"; subject: string; sequence: string;
  target_class: string; school_class: string; instructions: string; venue: string; start_date: string; start_time: string;
  end_date: string; end_time: string; duration_minutes: string; questions: ExamQuestion[];
};

const defaultQuestion = (order: number): ExamQuestion => ({ order, text: "", image_url: "", options: ["", "", "", ""], correct_option: 0, marks: 1, explanation: "" });
const defaultForm = (): ExamFormState => ({ title: "", exam_type: "SEQUENCE", mode: "ONSITE", subject: "", sequence: "", target_class: "", school_class: "", instructions: "", venue: "", start_date: "", start_time: "", end_date: "", end_time: "", duration_minutes: "30", questions: [defaultQuestion(1)] });
const formatDateTime = (v?: string) => (!v ? "Not scheduled" : Number.isNaN(new Date(v).getTime()) ? v : new Date(v).toLocaleString());
const examStatus = (exam: any) => {
  if (exam.status === "CANCELLED") return "Cancelled";
  if (exam.status === "COMPLETED") return "Completed";
  const now = Date.now(); const start = new Date(exam.start_time).getTime(); const end = new Date(exam.end_time ?? exam.start_time).getTime();
  if (start <= now && now < end && exam.mode === "ONLINE") return "Live";
  if (start > now) return "Upcoming";
  return "Completed";
};

export default function ExamsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { language } = useI18n();
  const { toast } = useToast();
  const isTeacher = user?.role === "TEACHER";
  const isStudent = user?.role === "STUDENT";
  const isAdmin = user?.role === "SCHOOL_ADMIN" || user?.role === "SUB_ADMIN";
  const canScheduleExams = isAdmin || isTeacher;
  const [isScheduling, setIsScheduling] = useState(false);
  const [viewingInstructions, setViewingInstructions] = useState<any>(null);
  const [form, setForm] = useState<ExamFormState>(defaultForm);

  const { data: schoolSettings } = useSchoolSettings(user?.school?.id || "");
  const classesQuery = useHierarchyClasses(user?.school?.id ? { school_id: user.school.id } : undefined);
  const { data: subjectsData } = useSubjects();
  const { data: sequencesData } = useSequences();
  const { data: activeSequenceData } = useActiveSequence();
  const { data: studentsData } = useStudents();
  const { data: examsData, isLoading: examsLoading } = useExams();
  const { data: resultsData, isLoading: resultsLoading } = useMyExamResults();
  const createExam = useCreateExam();

  // Teachers pick from the classes and subjects they are actually assigned to.
  // The hierarchy/global-subject lists are admin-scoped and come back empty for
  // teachers, which is why the class/subject dropdowns were blank — so load the
  // teacher's real assignments from their grade sheet instead.
  const teacherSheetQuery = useQuery({
    queryKey: ["exam-teacher-sheet", user?.id],
    queryFn: () => gradesService.getTeacherGradeSheet(),
    enabled: !!isTeacher,
    staleTime: 60_000,
  });
  const teacherSheetClasses = useMemo(
    () => (Array.isArray(teacherSheetQuery.data?.classes) ? teacherSheetQuery.data.classes : []),
    [teacherSheetQuery.data],
  );

  const exams = examsData?.results ?? [];
  const subjects = subjectsData?.results ?? [];
  const sequences = sequencesData?.results ?? [];
  const activeSequence = activeSequenceData?.results?.[0];

  useEffect(() => {
    if (activeSequence?.id && !form.sequence) setForm((prev) => ({ ...prev, sequence: activeSequence.id }));
  }, [activeSequence, form.sequence]);

  // The teacher's assigned subjects, keyed by the real (global) subject id so
  // the exam create payload stays valid.
  const teacherSheetSubjects = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    teacherSheetClasses.forEach((schoolClass: any) =>
      (schoolClass.subjects ?? []).forEach((subject: any) => {
        const id = subject.subject_id || subject.id;
        const name = subject.subject_name || subject.name;
        if (id && name && !map.has(String(id))) map.set(String(id), { id: String(id), name });
      }),
    );
    return Array.from(map.values());
  }, [teacherSheetClasses]);

  const teacherSubjectNames = useMemo(() => {
    if (!isTeacher) return [];
    if (teacherSheetSubjects.length) return teacherSheetSubjects.map((s) => s.name);
    return subjects
      .filter((s: any) => String(s.teacher) === String(user?.id) || s.teacher_name === user?.name)
      .map((s: any) => s.name);
  }, [isTeacher, teacherSheetSubjects, subjects, user]);

  const availableClasses = useMemo(() => {
    if (isTeacher && teacherSheetClasses.length) {
      return teacherSheetClasses.map((schoolClass: any) => ({
        id: schoolClass.id,
        name: schoolClass.name,
        sub_school_name: schoolClass.sub_school_name || "Main",
      }));
    }
    if (classesQuery.data?.length) return classesQuery.data;
    return (studentsData?.results ?? [])
      .map((student: any) => ({ id: student.school_class_id || student.student_class, name: student.student_class, sub_school_name: student.section || "Main" }))
      .filter((item: any) => Boolean(item.name));
  }, [isTeacher, teacherSheetClasses, classesQuery.data, studentsData]);

  const filteredSubjects = useMemo(() => {
    if (isTeacher) {
      if (teacherSheetSubjects.length) return teacherSheetSubjects;
      return subjects.filter((s: any) => teacherSubjectNames.includes(s.name));
    }
    return subjects;
  }, [isTeacher, teacherSheetSubjects, subjects, teacherSubjectNames]);
  const onsiteExams = useMemo(() => exams.filter((e: any) => e.mode === "ONSITE").filter((e: any) => !isTeacher || teacherSubjectNames.includes(e.subject_name)), [exams, isTeacher, teacherSubjectNames]);
  const activeOnlineExams = useMemo(() => exams.filter((e: any) => e.mode === "ONLINE" && e.status === "SCHEDULED" && new Date(e.end_time ?? e.start_time).getTime() > Date.now()), [exams]);
  const timetableRows = useMemo(() => availableClasses.map((schoolClass: any) => ({ className: schoolClass.name, exams: onsiteExams.filter((e: any) => e.target_class === schoolClass.name).slice(0, 5) })), [availableClasses, onsiteExams]);

  const updateQuestion = (index: number, patch: Partial<ExamQuestion>) => setForm((prev) => ({ ...prev, questions: prev.questions.map((q, i) => i === index ? { ...q, ...patch } : q) }));
  const updateOption = (qIndex: number, oIndex: number, value: string) => setForm((prev) => ({ ...prev, questions: prev.questions.map((q, i) => i !== qIndex ? q : { ...q, options: q.options.map((o, oi) => oi === oIndex ? value : o) }) }));

  const handleCreateExam = async () => {
    if (!form.title || !form.subject || !form.target_class || !form.start_date || !form.start_time || !form.end_date || !form.end_time) {
      toast({ variant: "destructive", title: "Missing information", description: "Please complete the title, subject, class, start time, and end time." }); return;
    }
    if (form.mode === "ONSITE" && !form.venue.trim()) {
      toast({ variant: "destructive", title: "Venue required", description: "Please provide the venue for this onsite exam." }); return;
    }
    const questions = form.questions.map((q, i) => ({ ...q, order: i + 1, options: q.options.map((o) => o.trim()).filter(Boolean) })).filter((q) => q.text.trim());
    if (form.mode === "ONLINE") {
      const invalid = !questions.length || questions.some((q) => q.options.length < 2 || typeof q.correct_option !== "number" || q.correct_option >= q.options.length);
      if (invalid) { toast({ variant: "destructive", title: "Question setup incomplete", description: "Each online exam question needs at least two options and one correct answer." }); return; }
    }
    const startDate = new Date(`${form.start_date}T${form.start_time}`);
    const endDate = new Date(`${form.end_date}T${form.end_time}`);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
      toast({ variant: "destructive", title: "Invalid schedule", description: "The exam end date and time must be after the start date and time." }); return;
    }
    const durationMinutes = Math.max(5, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
    const payload: CreateExamRequest = {
      title: form.title.trim(), exam_type: form.exam_type, mode: form.mode, subject: form.subject, sequence: form.sequence || null,
      school_class: form.school_class || null,
      target_class: form.target_class, instructions: form.instructions.trim(), venue: form.mode === "ONSITE" ? form.venue.trim() : "",
      start_time: startDate.toISOString(), duration_minutes: durationMinutes,
      status: "SCHEDULED", allow_review: true, questions: form.mode === "ONLINE" ? questions : [],
    };
    try {
      await createExam.mutateAsync(payload);
      toast({ title: form.mode === "ONLINE" ? "Online exam created" : "Onsite exam scheduled", description: "The exam is now saved and available across the platform." });
      setIsScheduling(false); setForm(defaultForm());
    } catch (error) {
      toast({ variant: "destructive", title: "Exam save failed", description: getApiErrorMessage(error, "We could not save this exam right now.") });
    }
  };

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full hover:bg-white shadow-sm shrink-0"><ArrowLeft className="w-5 h-5" /></Button>
          <div>
            <h1 className="text-3xl font-bold text-primary font-headline flex items-center gap-3"><div className="p-2 bg-primary rounded-xl shadow-lg"><PenTool className="w-6 h-6 text-secondary" /></div>{isStudent ? "Examinations" : "Institutional Schedules"}</h1>
            <p className="text-muted-foreground mt-1">{isStudent ? "Access your live assessments, onsite schedules, and graded history." : "Manage school examinations with live schedules and traceable student results."}</p>
          </div>
        </div>

        {canScheduleExams && (
          <Button asChild variant="outline" className="h-12 gap-2 rounded-2xl border-primary/20 px-5 font-bold text-primary">
            <Link href="/dashboard/exams/ai-generator">
              <Sparkles className="h-5 w-5" />
              Generate with AI
            </Link>
          </Button>
        )}

        {canScheduleExams && (
          <Dialog open={isScheduling} onOpenChange={setIsScheduling}>
            <DialogTrigger asChild><Button className="gap-2 shadow-lg h-12 px-6 rounded-2xl bg-secondary text-primary hover:bg-secondary/90 font-bold"><Plus className="w-5 h-5" /> Create Exam</Button></DialogTrigger>
            <DialogContent className="sm:max-w-4xl rounded-3xl p-0 overflow-hidden border-none shadow-2xl flex max-h-[92dvh] flex-col">
              <DialogHeader className="bg-primary p-6 sm:p-8 text-white relative shrink-0">
                <div className="flex items-center gap-4"><div className="p-3 bg-white/10 rounded-2xl"><CalendarDays className="w-8 h-8 text-secondary" /></div><div><DialogTitle className="text-2xl font-black">Create Exam</DialogTitle><DialogDescription className="text-white/70">Schedule onsite exams or publish real online MCQs for your learners.</DialogDescription></div></div>
                <Button variant="ghost" size="icon" onClick={() => setIsScheduling(false)} className="absolute top-4 right-4 text-white/40 hover:text-white"><X className="w-6 h-6" /></Button>
              </DialogHeader>
              <div className="p-6 sm:p-8 space-y-6 flex-1 min-h-0 overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2"><Label>Exam mode</Label><Select value={form.mode} onValueChange={(value: "ONSITE" | "ONLINE") => setForm((prev) => ({ ...prev, mode: value }))}><SelectTrigger className="h-12 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ONSITE">Onsite</SelectItem><SelectItem value="ONLINE">Online MCQ</SelectItem></SelectContent></Select></div>
                  <div className="space-y-2"><Label>Exam type</Label><Select value={form.exam_type} onValueChange={(value) => setForm((prev) => ({ ...prev, exam_type: value }))}><SelectTrigger className="h-12 rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{EXAM_TYPES.map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}</SelectContent></Select></div>
                  <div className="md:col-span-2 space-y-2"><Label>Exam title</Label><Input value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} className="h-12 rounded-xl" placeholder="e.g. Sequence 2 Mathematics MCQ" /></div>
                  <div className="space-y-2"><Label>Subject</Label><Select value={form.subject} onValueChange={(value) => setForm((prev) => ({ ...prev, subject: value }))}><SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="Choose subject" /></SelectTrigger><SelectContent>{filteredSubjects.map((subject: any) => <SelectItem key={subject.id} value={subject.id}>{subject.name}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-2"><Label>Sequence</Label><Select value={form.sequence} onValueChange={(value) => setForm((prev) => ({ ...prev, sequence: value }))}><SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="Choose sequence" /></SelectTrigger><SelectContent>{sequences.map((sequence: any) => <SelectItem key={sequence.id} value={sequence.id}>{sequence.name}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-2">
                    <Label>Target class</Label>
                    <Select
                      value={form.school_class || form.target_class}
                      onValueChange={(value) => {
                        const selected = availableClasses.find((schoolClass: any) => String(schoolClass.id) === value || schoolClass.name === value);
                        setForm((prev) => ({
                          ...prev,
                          school_class: selected?.id ? String(selected.id) : "",
                          target_class: selected?.name || value,
                        }));
                      }}
                    >
                      <SelectTrigger className="h-12 rounded-xl">
                        <SelectValue placeholder={classesQuery.isLoading ? "Loading classes..." : "Choose class"} />
                      </SelectTrigger>
                      <SelectContent>
                        {classesQuery.isError && <div className="px-3 py-2 text-xs font-bold text-destructive">Failed to load classes.</div>}
                        {Object.entries(
                          availableClasses.reduce((groups: Record<string, any[]>, schoolClass: any) => {
                            const group = schoolClass.sub_school_name || schoolClass.sub_school?.name || "Main";
                            groups[group] = [...(groups[group] || []), schoolClass];
                            return groups;
                          }, {})
                        ).map(([group, items]) => (
                          <SelectGroup key={group}>
                            <SelectLabel className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">{group}</SelectLabel>
                            {(items as any[]).map((schoolClass: any) => (
                              <SelectItem key={schoolClass.id || schoolClass.name} value={String(schoolClass.id || schoolClass.name)}>
                                {schoolClass.name} ({schoolClass.sub_school_name || schoolClass.sub_school?.name || "Main"})
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Start date</Label><Input type="date" value={form.start_date} onChange={(event) => setForm((prev) => ({ ...prev, start_date: event.target.value }))} className="h-12 rounded-xl" /></div>
                  <div className="space-y-2"><Label>Start time</Label><Input type="time" value={form.start_time} onChange={(event) => setForm((prev) => ({ ...prev, start_time: event.target.value }))} className="h-12 rounded-xl" /></div>
                  <div className="space-y-2"><Label>End date</Label><Input type="date" value={form.end_date} onChange={(event) => setForm((prev) => ({ ...prev, end_date: event.target.value }))} className="h-12 rounded-xl" /></div>
                  <div className="space-y-2"><Label>End time</Label><Input type="time" value={form.end_time} onChange={(event) => setForm((prev) => ({ ...prev, end_time: event.target.value }))} className="h-12 rounded-xl" /></div>
                  {form.mode === "ONSITE" && <div className="space-y-2"><Label>Venue</Label><Input value={form.venue} onChange={(event) => setForm((prev) => ({ ...prev, venue: event.target.value }))} className="h-12 rounded-xl" placeholder="Hall A / Room 2 / Physics Lab" /></div>}
                  <div className="md:col-span-2 space-y-2"><Label>Instructions</Label><textarea value={form.instructions} onChange={(event) => setForm((prev) => ({ ...prev, instructions: event.target.value }))} className="w-full rounded-2xl border bg-background px-4 py-3 min-h-28" placeholder="Write the instructions students and invigilators should see." /></div>
                </div>
                {form.mode === "ONLINE" && (
                  <div className="space-y-6 rounded-3xl border bg-accent/10 p-6">
                    <div className="flex items-center justify-between gap-4">
                      <div><h3 className="text-lg font-black text-primary">Online Exam Questions</h3><p className="text-sm text-muted-foreground">Add real MCQ content for students before saving the exam.</p></div>
                      <Button type="button" variant="outline" onClick={() => setForm((prev) => ({ ...prev, questions: [...prev.questions, defaultQuestion(prev.questions.length + 1)] }))} className="gap-2"><Plus className="w-4 h-4" /> Add Question</Button>
                    </div>
                    {form.questions.map((question, questionIndex) => (
                      <div key={`modal-question-${questionIndex}`} className="rounded-2xl border bg-white p-5 space-y-4">
                        <div className="flex items-center justify-between gap-4">
                          <h4 className="font-black text-primary">Question {questionIndex + 1}</h4>
                          {form.questions.length > 1 && <Button type="button" variant="ghost" size="sm" onClick={() => setForm((prev) => ({ ...prev, questions: prev.questions.filter((_, i) => i !== questionIndex).map((q, i) => ({ ...q, order: i + 1 })) }))}>Remove</Button>}
                        </div>
                        <div className="space-y-2"><Label>Question text</Label><textarea value={question.text} onChange={(event) => updateQuestion(questionIndex, { text: event.target.value })} className="w-full rounded-xl border bg-background px-4 py-3 min-h-24" /></div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {question.options.map((option, optionIndex) => <div key={`modal-q-${questionIndex}-o-${optionIndex}`} className="space-y-2"><Label>Option {String.fromCharCode(65 + optionIndex)}</Label><Input value={option} onChange={(event) => updateOption(questionIndex, optionIndex, event.target.value)} /></div>)}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-2"><Label>Correct option</Label><Select value={String(question.correct_option ?? 0)} onValueChange={(value) => updateQuestion(questionIndex, { correct_option: Number(value) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{question.options.map((_, optionIndex) => <SelectItem key={optionIndex} value={String(optionIndex)}>{String.fromCharCode(65 + optionIndex)}</SelectItem>)}</SelectContent></Select></div>
                          <div className="space-y-2"><Label>Marks</Label><Input type="number" min="1" value={question.marks} onChange={(event) => updateQuestion(questionIndex, { marks: Number(event.target.value || "1") })} /></div>
                          <div className="space-y-2"><Label>Image URL (optional)</Label><Input value={question.image_url ?? ""} onChange={(event) => updateQuestion(questionIndex, { image_url: event.target.value })} /></div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <DialogFooter className="bg-accent/20 p-4 sm:p-6 border-t border-accent shrink-0">
                <Button onClick={handleCreateExam} disabled={createExam.isPending} className="w-full h-12 font-bold shadow-lg">
                  {createExam.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...</> : "Save Exam"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Tabs defaultValue="onsite" className="w-full">
        <TabsList className={cn("grid w-full mb-8 bg-white shadow-sm border h-auto p-1 rounded-2xl overflow-x-auto no-scrollbar", isStudent ? "grid-cols-3 lg:w-[600px]" : "grid-cols-3 lg:w-[700px]")}>
          <TabsTrigger value="onsite" className="gap-2 py-3 rounded-xl transition-all text-xs lg:text-sm whitespace-nowrap"><CalendarDays className="w-4 h-4" /> Onsite Exams</TabsTrigger>
          {isStudent && <TabsTrigger value="available" className="gap-2 py-3 rounded-xl transition-all text-xs lg:text-sm whitespace-nowrap"><PenTool className="w-4 h-4" /> Live MCQs</TabsTrigger>}
          <TabsTrigger value="history" className="gap-2 py-3 rounded-xl transition-all text-xs lg:text-sm whitespace-nowrap"><History className="w-4 h-4" /> History</TabsTrigger>
          {!isStudent && <TabsTrigger value="timetable" className="gap-2 py-3 rounded-xl transition-all text-xs lg:text-sm whitespace-nowrap"><LayoutGrid className="w-4 h-4" /> Class Overview</TabsTrigger>}
        </TabsList>

        <TabsContent value="onsite" className="mt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {onsiteExams.map((exam: any) => (
              <Card key={exam.id} className="border-none shadow-sm overflow-hidden group hover:shadow-md transition-all bg-white">
                <div className="bg-accent/30 p-4 border-b flex justify-between items-center">
                  <Badge variant="outline" className="text-[10px] font-black uppercase tracking-widest border-primary/20 text-primary">{exam.target_class}</Badge>
                  <Badge className="bg-primary text-white border-none font-bold text-[9px] px-3">{examStatus(exam)}</Badge>
                </div>
                <CardHeader>
                  <CardTitle className="text-xl font-black text-primary leading-tight">{exam.title}</CardTitle>
                  <CardDescription className="font-bold flex items-center gap-2 mt-1"><BookOpen className="w-3.5 h-3.5 text-secondary" /> {exam.subject_name ?? "General"}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1"><p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest flex items-center gap-1"><MapPin className="w-3 h-3 text-primary/40" /> Venue</p><p className="text-xs font-black text-primary">{exam.venue || "TBD"}</p></div>
                    <div className="space-y-1"><p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest flex items-center gap-1"><Clock className="w-3 h-3 text-primary/40" /> Schedule</p><p className="text-xs font-black text-primary">{formatDateTime(exam.start_time)}</p></div>
                  </div>
                </CardContent>
                <CardFooter className="pt-0 p-4 border-t bg-accent/5"><p className="text-[9px] font-bold text-muted-foreground uppercase flex items-center gap-2"><User className="w-3 h-3" /> Invigilator: {exam.teacher_name || "School Staff"}</p></CardFooter>
              </Card>
            ))}
            {!onsiteExams.length && !examsLoading && <div className="col-span-full py-20 text-center border-2 border-dashed rounded-[2rem] bg-white/50 space-y-4"><CalendarDays className="w-12 h-12 text-primary/10 mx-auto" /><p className="text-muted-foreground font-medium">No physical exams are scheduled yet.</p></div>}
          </div>
        </TabsContent>

        {isStudent && (
          <TabsContent value="available" className="mt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {activeOnlineExams.map((exam: any) => {
                const status = examStatus(exam);
                const isLive = status === "Live";
                return (
                  <Card key={exam.id} className="border-none shadow-xl overflow-hidden group hover:shadow-2xl transition-all duration-300 rounded-3xl bg-white">
                    <div className={cn("h-1.5 w-full", isLive ? "bg-red-600" : "bg-secondary")} />
                    <CardHeader>
                      <div className="flex justify-between items-start mb-2">
                        <Badge variant="secondary" className="bg-primary/5 text-primary border-none text-[9px] font-black uppercase tracking-widest">{exam.subject_name ?? "Subject"}</Badge>
                        <Badge className={cn("border-none text-[9px] font-black", isLive ? "bg-red-600 text-white" : "bg-accent text-primary")}>{status}</Badge>
                      </div>
                      <CardTitle className="text-xl font-black text-primary">{exam.title}</CardTitle>
                      <CardDescription className="font-medium flex items-center gap-2"><User className="w-3.5 h-3.5 text-secondary" /> {exam.teacher_name || "Assigned Teacher"}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 rounded-xl bg-accent/30 border border-accent space-y-1"><p className="text-[9px] font-black text-muted-foreground uppercase">Duration</p><p className="text-sm font-black flex items-center gap-2"><Timer className="w-3.5 h-3.5 text-primary" /> {exam.duration_minutes}m</p></div>
                        <div className="p-3 rounded-xl bg-accent/30 border border-accent space-y-1"><p className="text-[9px] font-black text-muted-foreground uppercase">Start Time</p><p className="text-sm font-black truncate">{formatDateTime(exam.start_time)}</p></div>
                      </div>
                    </CardContent>
                    <CardFooter className="pt-0 p-6">
                      {isLive ? (
                        <Button asChild className="w-full h-12 rounded-xl font-black uppercase tracking-widest text-xs gap-2 shadow-lg bg-primary text-white"><Link href={`/dashboard/exams/take?id=${exam.id}`}>Enter Examination <ChevronRight className="w-4 h-4" /></Link></Button>
                      ) : (
                        <Button variant="outline" className="w-full h-12 rounded-xl font-black uppercase tracking-widest text-xs gap-2" onClick={() => setViewingInstructions(exam)}><Info className="w-4 h-4 text-primary" /> View Instructions</Button>
                      )}
                    </CardFooter>
                  </Card>
                );
              })}
              {!activeOnlineExams.length && !examsLoading && <div className="col-span-full py-20 text-center border-2 border-dashed rounded-[2rem] bg-white/50 space-y-4"><PenTool className="w-12 h-12 text-primary/10 mx-auto" /><p className="text-muted-foreground font-medium">No online exams are available for your class right now.</p></div>}
            </div>
          </TabsContent>
        )}

        <TabsContent value="history" className="mt-0">
          <Card className="border-none shadow-sm overflow-hidden rounded-3xl">
            <CardHeader className="bg-white border-b">
              <CardTitle className="text-sm font-black uppercase text-primary flex items-center gap-2"><History className="w-4 h-4" /> Assessment History</CardTitle>
              <CardDescription>Verified results from completed online examinations.</CardDescription>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table className="min-w-[600px]">
                <TableHeader className="bg-accent/10"><TableRow className="uppercase text-[10px] font-black tracking-widest"><TableHead className="pl-8 py-4">Assessment Title</TableHead><TableHead>Subject</TableHead><TableHead className="text-center">Score</TableHead><TableHead className="text-center">Submitted</TableHead><TableHead className="text-right pr-8">Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(resultsData?.results ?? []).map((submission: any) => (
                    <TableRow key={submission.id}>
                      <TableCell className="pl-8 py-4 font-bold text-sm text-primary">{submission.exam_title}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{submission.subject_name ?? "Subject"}</Badge></TableCell>
                      <TableCell className="text-center font-black text-primary">{submission.score != null && submission.total_marks != null ? `${submission.score} / ${submission.total_marks}` : "---"}</TableCell>
                      <TableCell className="text-center text-xs text-muted-foreground">{formatDateTime(submission.submitted_at)}</TableCell>
                      <TableCell className="text-right pr-8"><Link href={`/dashboard/exams/results?id=${submission.id}`}><Badge className="bg-primary text-white border-none text-[9px] font-black uppercase px-3 cursor-pointer">{submission.status}</Badge></Link></TableCell>
                    </TableRow>
                  ))}
                  {!resultsLoading && !(resultsData?.results ?? []).length && <TableRow><TableCell colSpan={5} className="py-12 text-center text-muted-foreground">No graded online exam history yet.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {!isStudent && (
          <TabsContent value="timetable" className="mt-0">
            <Card className="border-none shadow-sm overflow-hidden rounded-3xl">
              <CardHeader className="border-b bg-white flex flex-col md:flex-row items-center justify-between gap-4 p-6">
                <div><CardTitle className="text-lg font-black text-primary uppercase tracking-tight">Class Exam Overview</CardTitle><CardDescription>Live school exam schedules grouped by class level.</CardDescription></div>
                <Button variant="outline" size="sm" className="w-full md:w-auto gap-2 rounded-xl h-10 font-bold"><Printer className="w-4 h-4" /> Print Overview</Button>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table className="min-w-[800px]">
                  <TableHeader className="bg-accent/10 uppercase text-[10px] font-black tracking-widest border-b"><TableRow><TableHead className="pl-6 h-12">Class Level</TableHead><TableHead>Scheduled Exams</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {timetableRows.map((row) => (
                      <TableRow key={row.className} className="border-b last:border-0 hover:bg-accent/5">
                        <TableCell className="pl-6 font-bold text-primary text-xs whitespace-nowrap">{row.className}</TableCell>
                        <TableCell className="py-4">
                          <div className="flex flex-wrap gap-3">
                            {row.exams.length ? row.exams.map((exam: any) => <div key={exam.id} className="bg-white p-3 rounded-xl border shadow-sm min-w-[220px]"><p className="text-[11px] font-black text-primary leading-tight">{exam.title}</p><p className="text-[10px] text-muted-foreground mt-1">{exam.subject_name ?? "Subject"}</p><div className="flex items-center gap-1.5 mt-2 opacity-60"><Clock className="w-3 h-3" /><span className="text-[9px] font-bold uppercase">{formatDateTime(exam.start_time)}</span></div></div>) : <p className="text-xs text-muted-foreground">No exam scheduled for this class yet.</p>}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={!!viewingInstructions} onOpenChange={() => setViewingInstructions(null)}>
        <DialogContent className="sm:max-w-md rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl">
          <DialogHeader className="bg-primary p-8 text-white relative">
            <div className="flex items-center gap-4"><div className="p-3 bg-white/10 rounded-2xl"><Info className="w-8 h-8 text-secondary" /></div><div><DialogTitle className="text-2xl font-black">Exam Instructions</DialogTitle><DialogDescription className="text-white/60">{viewingInstructions?.title}</DialogDescription></div></div>
            <Button variant="ghost" size="icon" onClick={() => setViewingInstructions(null)} className="absolute top-4 right-4 text-white/40 hover:text-white"><X className="w-6 h-6" /></Button>
          </DialogHeader>
          <div className="p-8 space-y-6">
            <div className="bg-primary/5 p-6 rounded-2xl border border-primary/10 space-y-4">
              <div className="flex items-start gap-3"><Clock className="w-5 h-5 text-primary mt-0.5" /><div><p className="text-[10px] font-black uppercase text-primary/60">Schedule</p><p className="text-sm font-bold text-primary">Starts: {formatDateTime(viewingInstructions?.start_time)}</p></div></div>
              <div className="space-y-2"><p className="text-[10px] font-black uppercase text-primary/60">Pedagogical Guidelines</p><p className="text-sm leading-relaxed text-muted-foreground italic font-medium">"{viewingInstructions?.instructions || "Please report early and follow your school's invigilation instructions."}"</p></div>
            </div>
          </div>
          <DialogFooter className="bg-accent/20 p-6 border-t border-accent"><Button onClick={() => setViewingInstructions(null)} className="w-full h-12 rounded-xl shadow-lg font-bold">I Understand</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
