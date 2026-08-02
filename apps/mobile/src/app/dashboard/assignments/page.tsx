
"use client";

import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { useSubjects } from "@/lib/hooks/useGrades";
import { useSchoolSettings } from "@/lib/hooks/useSchools";
import {
  useAssignments,
  useAssignmentSubmissions,
  useCreateAssignment,
  useDeleteAssignment,
  useGradeAssignmentSubmission,
  useMyAssignmentSubmissions,
} from "@/lib/hooks/useAssignments";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  FileEdit, 
  Clock, 
  ChevronRight, 
  Plus,
  Trash2,
  Inbox,
  Award,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  History,
  FileText,
  Paperclip,
  Table as TableIcon,
  Search,
  ShieldCheck,
  Download,
  Eye,
  X,
  User,
  GraduationCap,
  ArrowRight,
  ListChecks,
  ArrowLeft,
  Save,
  Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { studentsService } from "@/lib/api/services/students.service";
import { aiService } from "@/lib/api/services/ai.service";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fileToDataUrl, getApiErrorMessage } from "@/lib/api/errors";

function parseSubjectPlacement(level?: string) {
  const raw = (level || "").trim();
  if (!raw) return [];
  if (!raw.includes("||")) {
    return raw.split(",").map((item) => item.trim()).filter(Boolean);
  }
  const [, classes] = raw.split("||");
  return (classes || "").split(",").map((item) => item.trim()).filter(Boolean);
}

export default function AssignmentsPage() {
  const { user } = useAuth();
  const { t, language } = useI18n();
  const { toast } = useToast();
  const router = useRouter();
  
  const [isCreating, setIsCreating] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDrafting, setIsDrafting] = useState(false);
  const [viewingResponse, setViewingResponse] = useState<any>(null);
  const [gradingAssignment, setGradingAssignment] = useState<any>(null);
  const [reviewingSubmission, setReviewingSubmission] = useState<any>(null);
  const [reviewScore, setReviewScore] = useState("");
  const [reviewFeedback, setReviewFeedback] = useState("");
  const [assignmentPdfFile, setAssignmentPdfFile] = useState<File | null>(null);
  const [assignmentClassStudents, setAssignmentClassStudents] = useState<any[]>([]);
  
  const [newAssignment, setNewAssignment] = useState({
    title: "",
    subjectId: "",
    targetClass: "",
    dueDate: "",
    dueTime: "",
    maxMarks: 20,
    instructions: ""
  });

  const isTeacher = user?.role === "TEACHER" || user?.role === "SCHOOL_ADMIN" || user?.role === "SUB_ADMIN";
  const { data: schoolSettings } = useSchoolSettings(user?.school?.id || "");
  const { data: assignmentsData, isLoading: assignmentsLoading } = useAssignments({ limit: 200 });
  const { data: mySubmissionsData } = useMyAssignmentSubmissions({ limit: 200 });
  const { data: submissionsData } = useAssignmentSubmissions(gradingAssignment ? { assignment: gradingAssignment.id, limit: 200 } : undefined);
  const createAssignmentMutation = useCreateAssignment();
  const deleteAssignmentMutation = useDeleteAssignment();
  const gradeSubmissionMutation = useGradeAssignmentSubmission();

  // Fetch real subjects from backend for the assignment subject dropdown
  const { data: subjectsApiData } = useSubjects();
  const subjectOptions = useMemo(() => {
    const list = subjectsApiData?.results || [];
    const scoped = user?.role === "TEACHER"
      ? list.filter((subject: any) => subject.teacher === user?.id || subject.teacher === user?.uid)
      : list;
    return scoped.map((s: any) => ({
      id: s.id,
      code: s.code || s.id,
      name: s.name,
      classes: parseSubjectPlacement(s.level),
    }));
  }, [subjectsApiData?.results, user?.id, user?.role, user?.uid]);

  const availableClasses = useMemo(() => {
    const subjectClasses = subjectOptions.flatMap((subject) => subject.classes).filter(Boolean);
    // A teacher only sees the classes tied to the subjects they teach — not
    // every class in the school. Fall back to the union only if we could not
    // derive any class from their subjects.
    if (user?.role === "TEACHER") {
      const own = Array.from(new Set(subjectClasses));
      if (own.length) return own;
    }
    const schoolClasses = schoolSettings?.class_levels || [];
    return Array.from(new Set([...subjectClasses, ...schoolClasses].filter(Boolean)));
  }, [schoolSettings?.class_levels, subjectOptions, user?.role]);

  const selectedSubjectOption = useMemo(
    () => subjectOptions.find((subject) => subject.id === newAssignment.subjectId),
    [newAssignment.subjectId, subjectOptions]
  );

  const targetClassOptions = selectedSubjectOption?.classes?.length ? selectedSubjectOption.classes : availableClasses;

  useEffect(() => {
    if (!subjectOptions.length) return;
    setNewAssignment((current) => {
      const nextSubjectId = subjectOptions.some((subject) => subject.id === current.subjectId) ? current.subjectId : subjectOptions[0].id;
      const nextSubject = subjectOptions.find((subject) => subject.id === nextSubjectId);
      const nextClasses = nextSubject?.classes?.length ? nextSubject.classes : availableClasses;
      return {
        ...current,
        subjectId: nextSubjectId,
        targetClass: nextClasses.includes(current.targetClass) ? current.targetClass : nextClasses[0] || availableClasses[0] || "",
      };
    });
  }, [availableClasses, subjectOptions]);

  const assignmentRecords = useMemo(() => {
    const records = assignmentsData?.results || [];
    return records.map((assignment: any) => ({
      id: assignment.id,
      title: assignment.title,
      courseName: assignment.subject_name || "Subject",
      dueDate: assignment.due_date,
      maxMarks: assignment.max_marks,
      type: assignment.submission_type,
      targetClass: assignment.target_class,
      instructions: assignment.instructions,
      attachmentName: assignment.attachment_name,
      attachmentMimeType: assignment.attachment_mime_type,
      attachmentData: assignment.attachment_data,
      status: assignment.status,
    }));
  }, [assignmentsData?.results]);

  const submissionByAssignment = useMemo(() => {
    const submissions = mySubmissionsData?.results || [];
    return submissions.reduce((acc: Record<string, any>, submission: any) => {
      acc[submission.assignment] = submission;
      return acc;
    }, {});
  }, [mySubmissionsData?.results]);

  const studentAssignments = useMemo(() => {
    return assignmentRecords.map((assignment) => {
      const submission = submissionByAssignment[assignment.id];
      const dueDate = new Date(assignment.dueDate);
      const isMissed = !submission && dueDate < new Date();
      return {
        ...assignment,
        status: submission?.status || (isMissed ? 'missed' : 'upcoming'),
        score: submission?.score,
        submittedAt: submission?.created,
        submittedContent: submission?.content,
        submittedFileName: submission?.attachment_name,
        attachment_data: submission?.attachment_data,
        assignmentAttachmentName: assignment.attachmentName,
        assignmentAttachmentData: assignment.attachmentData,
        submissionId: submission?.id,
      };
    });
  }, [assignmentRecords, submissionByAssignment]);

  const activeTasks = studentAssignments.filter((assignment) => assignment.status === 'upcoming');
  const myWork = studentAssignments.filter((assignment) => assignment.status === 'submitted' || assignment.status === 'graded');
  const historyTasks = studentAssignments;
  const missedSubmissionStudents = useMemo(() => {
    if (!gradingAssignment || new Date(gradingAssignment.dueDate) >= new Date()) return [];
    const submittedIds = new Set((submissionsData?.results || []).map((submission: any) => String(submission.student)));
    return assignmentClassStudents.filter((student: any) => !submittedIds.has(String(student.id)));
  }, [assignmentClassStudents, gradingAssignment, submissionsData?.results]);

  useEffect(() => {
    if (!gradingAssignment?.targetClass) {
      setAssignmentClassStudents([]);
      return;
    }
    let cancelled = false;
    const loadClassStudents = async () => {
      try {
        const data = await studentsService.getClassList(gradingAssignment.targetClass);
        const list = Array.isArray(data) ? data : data?.results || [];
        if (!cancelled) setAssignmentClassStudents(list);
      } catch {
        if (!cancelled) setAssignmentClassStudents([]);
      }
    };
    loadClassStudents();
    return () => {
      cancelled = true;
    };
  }, [gradingAssignment?.targetClass]);

  const handleAiDraft = async () => {
    if (!newAssignment.title.trim()) {
      toast({ variant: "destructive", title: "Add a topic first", description: "Enter an assignment title/topic so the AI knows what to draft." });
      return;
    }
    setIsDrafting(true);
    try {
      const subjectName = selectedSubjectOption?.name || "the subject";
      const targetClass = newAssignment.targetClass || "the class";
      const prompt = `You are an experienced teacher. Draft a clear, well-structured assignment brief for the topic "${newAssignment.title}" in ${subjectName} for ${targetClass}. `
        + `Include: a short introduction, 3-6 numbered questions or tasks of increasing difficulty, and a brief note on what a good submission should contain. `
        + `Keep it concise, plain text (no markdown symbols), and ready to hand to students.`;
      const { reply } = await aiService.directChat(prompt);
      const text = (reply || "").trim();
      if (!text) {
        toast({ variant: "destructive", title: "No draft returned", description: "The assistant did not return any content. Try again." });
        return;
      }
      setNewAssignment((prev) => ({
        ...prev,
        instructions: prev.instructions.trim() ? `${prev.instructions.trim()}\n\n${text}` : text,
      }));
      toast({ title: "AI draft ready", description: "Review and edit the generated brief, then publish or save it." });
    } catch (error: any) {
      toast({ variant: "destructive", title: "AI draft failed", description: getApiErrorMessage(error, "Could not generate a draft right now.") });
    } finally {
      setIsDrafting(false);
    }
  };

  const handleCreateAssignment = async (status: 'draft' | 'published') => {
    if (!newAssignment.title || !newAssignment.subjectId || !newAssignment.targetClass || !newAssignment.dueDate || !newAssignment.dueTime) {
      toast({ variant: "destructive", title: "Missing deadline", description: "Set the latest submission date and time before saving." });
      return;
    }
    const dueDate = new Date(`${newAssignment.dueDate}T${newAssignment.dueTime}`);
    if (Number.isNaN(dueDate.getTime()) || dueDate <= new Date()) {
      toast({ variant: "destructive", title: "Invalid deadline", description: "The assignment deadline must be in the future." });
      return;
    }
    setIsProcessing(true);
    try {
      const attachmentData = assignmentPdfFile ? await fileToDataUrl(assignmentPdfFile) : "";
      await createAssignmentMutation.mutateAsync({
        subject: newAssignment.subjectId,
        title: newAssignment.title,
        instructions: newAssignment.instructions,
        attachment_name: assignmentPdfFile?.name || "",
        attachment_mime_type: assignmentPdfFile?.type || "",
        attachment_data: attachmentData,
        target_class: newAssignment.targetClass,
        due_date: dueDate.toISOString(),
        max_marks: newAssignment.maxMarks,
        submission_type: 'both',
        status,
      });
      setIsCreating(false);
      setNewAssignment({
        title: "",
        subjectId: subjectOptions[0]?.id || "",
        targetClass: targetClassOptions[0] || "",
        dueDate: "",
        dueTime: "",
        maxMarks: 20,
        instructions: ""
      });
      setAssignmentPdfFile(null);
      toast({ title: status === 'published' ? "Task Published" : "Draft Saved", description: status === 'published' ? "The assignment is now visible to students." : "The assignment has been stored successfully." });
    } catch (error) {
      toast({ variant: "destructive", title: "Assignment Failed", description: getApiErrorMessage(error, "Could not save this assignment.") });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAssignmentPdfChange = (file?: File | null) => {
    if (!file) {
      setAssignmentPdfFile(null);
      return;
    }
    if (file.type !== "application/pdf") {
      toast({ variant: "destructive", title: "Invalid file", description: "Assignment resources must be uploaded as PDF files." });
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      toast({ variant: "destructive", title: "PDF too large", description: "The assignment PDF must be 6MB or smaller." });
      return;
    }
    setAssignmentPdfFile(file);
  };

  const handleDeleteAssignment = async (id: string) => {
    try {
      await deleteAssignmentMutation.mutateAsync(id);
      toast({ variant: "destructive", title: "Assignment Deleted", description: "The task has been removed from the registry." });
    } catch (error) {
      toast({ variant: "destructive", title: "Delete Failed", description: getApiErrorMessage(error, "Could not delete this assignment.") });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'upcoming': return <Badge className="bg-blue-100 text-blue-700 border-none uppercase text-[9px] font-black">Open</Badge>;
      case 'submitted': return <Badge className="bg-amber-100 text-amber-700 border-none uppercase text-[9px] font-black">Pending Grade</Badge>;
      case 'graded': return <Badge className="bg-green-100 text-green-700 border-none uppercase text-[9px] font-black">Graded</Badge>;
      case 'missed': return <Badge className="bg-red-100 text-red-700 border-none uppercase text-[9px] font-black">Missed</Badge>;
      case 'cancelled': return <Badge className="bg-slate-100 text-slate-700 border-none uppercase text-[9px] font-black">Cancelled</Badge>;
      case 'draft': return <Badge className="bg-slate-100 text-slate-700 border-none uppercase text-[9px] font-black">Draft</Badge>;
      default: return null;
    }
  };

  if (!isTeacher) {
    return (
      <div className="space-y-8 pb-20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full hover:bg-white shadow-sm shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-primary font-headline flex items-center gap-3">
                <div className="p-2 bg-primary rounded-xl shadow-lg">
                  <FileEdit className="w-6 h-6 text-secondary" />
                </div>
                {t("assignments")}
              </h1>
              <p className="text-muted-foreground mt-1">Official portal for academic submissions and pedagogical tasks.</p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="active" className="w-full">
          <TabsList className="grid grid-cols-3 w-full md:w-[600px] mb-8 bg-white shadow-sm border h-auto p-1 rounded-2xl">
            <TabsTrigger value="active" className="gap-2 py-3 rounded-xl transition-all">
              <Inbox className="w-4 h-4" /> Active Tasks
            </TabsTrigger>
            <TabsTrigger value="work" className="gap-2 py-3 rounded-xl transition-all">
              <CheckCircle2 className="w-4 h-4" /> My Work
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2 py-3 rounded-xl transition-all">
              <History className="w-4 h-4" /> Full History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="animate-in fade-in slide-in-from-bottom-4 mt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {activeTasks.map((assignment) => (
                <StudentAssignmentCard key={assignment.id} assignment={assignment} onViewResponse={setViewingResponse} />
              ))}
              {activeTasks.length === 0 && (
                <div className="col-span-full py-20 text-center border-2 border-dashed rounded-3xl bg-white/50 space-y-4">
                  <div className="p-4 bg-primary/5 rounded-full w-fit mx-auto">
                    <FileEdit className="w-12 h-12 text-primary/20" />
                  </div>
                  <p className="text-muted-foreground font-medium">No active assignments found for your class.</p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="work" className="animate-in fade-in slide-in-from-bottom-4 mt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {myWork.map((assignment) => (
                <StudentAssignmentCard key={assignment.id} assignment={assignment} onViewResponse={setViewingResponse} />
              ))}
              {myWork.length === 0 && (
                <div className="col-span-full py-20 text-center border-2 border-dashed rounded-3xl bg-white/50">
                  <p className="text-muted-foreground font-medium">You haven't submitted any work yet.</p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="history" className="animate-in fade-in slide-in-from-bottom-4 mt-0">
            <Card className="border-none shadow-xl overflow-hidden rounded-3xl">
              <CardHeader className="bg-white border-b">
                <CardTitle className="text-sm font-black uppercase text-primary tracking-widest flex items-center gap-2">
                  <History className="w-4 h-4" /> Assignment Audit Trail
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader className="bg-accent/10">
                    <TableRow className="uppercase text-[10px] font-black tracking-widest border-b">
                      <TableHead className="pl-8 py-4">Task Title</TableHead>
                      <TableHead>Course</TableHead>
                      <TableHead className="text-center">Due Date</TableHead>
                      <TableHead className="text-center">Score</TableHead>
                      <TableHead className="text-right pr-8">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyTasks.map((task: any) => (
                      <TableRow key={task.id} className="hover:bg-accent/5 transition-colors border-b">
                        <TableCell className="pl-8 py-4 font-bold text-sm text-primary">{task.title}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px] font-bold">{task.courseName}</Badge></TableCell>
                        <TableCell className="text-center text-xs font-mono font-medium text-muted-foreground">
                          {new Date(task.dueDate).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                        </TableCell>
                        <TableCell className="text-center">
                          {task.status === 'graded' ? (
                            <span className="font-black text-primary">{task.score} / {task.maxMarks}</span>
                          ) : '---'}
                        </TableCell>
                        <TableCell className="text-right pr-8">
                          <div className="flex justify-end gap-2 items-center">
                            {getStatusBadge(task.status)}
                            {(task.status === 'submitted' || task.status === 'graded') && (
                              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setViewingResponse(task)}>
                                <Eye className="w-4 h-4 text-primary/40 hover:text-primary" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* RESPONSE VIEW DIALOG */}
        <Dialog open={!!viewingResponse} onOpenChange={() => setViewingResponse(null)}>
          <DialogContent className="sm:max-w-2xl rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl">
            <DialogHeader className="bg-primary p-8 text-white relative">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-white/10 rounded-2xl">
                  <ShieldCheck className="w-8 h-8 text-secondary" />
                </div>
                <div>
                  <DialogTitle className="text-2xl font-black">Submission Dossier</DialogTitle>
                  <DialogDescription className="text-white/60">
                    {viewingResponse?.title} • {viewingResponse?.courseName}
                  </DialogDescription>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setViewingResponse(null)} className="absolute top-4 right-4 text-white/40 hover:text-white">
                <X className="w-6 h-6" />
              </Button>
            </DialogHeader>
            <div className="p-10 space-y-8 max-h-[70vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b pb-4">
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Submission Timestamp</p>
                  <p className="text-sm font-bold text-primary">
                    {viewingResponse?.submittedAt ? new Date(viewingResponse.submittedAt).toLocaleString() : 'N/A'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Dossier Status</p>
                  <Badge className={cn(
                    "font-black text-[10px] px-3 border-none",
                    viewingResponse?.status === 'graded' ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                  )}>
                    {viewingResponse?.status === 'graded' ? "VERIFIED & GRADED" : "PENDING REVIEW"}
                  </Badge>
                </div>
              </div>

              {viewingResponse?.status === 'graded' && (
                <div className="p-6 bg-green-50 rounded-2xl border border-green-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Award className="w-8 h-8 text-green-600" />
                    <div>
                      <p className="text-[10px] font-black uppercase text-green-600 tracking-widest">Final Pedagogical Score</p>
                      <p className="text-3xl font-black text-green-700">{viewingResponse?.score} <span className="text-sm opacity-40">/ {viewingResponse?.maxMarks}</span></p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black uppercase text-green-600">Integrity</p>
                    <Badge variant="outline" className="border-green-200 text-green-700 text-[10px]">DIGITALLY SIGNED</Badge>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-accent pb-2">
                  <FileText className="w-4 h-4 text-primary/40" />
                  <h3 className="text-xs font-black uppercase text-primary tracking-widest">Submitted Response</h3>
                </div>
                <div className="bg-accent/10 p-6 rounded-2xl italic text-primary/80 leading-relaxed font-medium">
                  {viewingResponse?.submittedContent || "No written response provided."}
                </div>
              </div>

              {viewingResponse?.submittedFileName && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 border-b border-accent pb-2">
                    <Paperclip className="w-4 h-4 text-primary/40" />
                    <h3 className="text-xs font-black uppercase text-primary tracking-widest">Attached Documentation</h3>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-white border rounded-2xl shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/5 rounded-lg text-primary">
                        <FileText className="w-5 h-5" />
                      </div>
                      <span className="text-sm font-bold text-primary">{viewingResponse.submittedFileName}</span>
                    </div>
                    {viewingResponse?.submittedFileName ? (
                      <a
                        href={viewingResponse.attachment_data || "#"}
                        download={viewingResponse.submittedFileName}
                        className="inline-flex"
                      >
                        <Button variant="ghost" size="sm" className="gap-2 text-[10px] font-black uppercase tracking-widest">
                          <Download className="w-3.5 h-3.5" /> Download
                        </Button>
                      </a>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter className="bg-accent/10 p-6 border-t border-accent flex justify-center">
               <div className="flex items-center gap-2 text-muted-foreground">
                  <ShieldCheck className="w-4 h-4 text-primary opacity-40" />
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] italic opacity-40">Verified Institutional Pedagogical Record</p>
               </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Teacher View Logic
  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full hover:bg-white shadow-sm shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-primary font-headline flex items-center gap-3">
              <div className="p-2 bg-primary rounded-xl shadow-lg">
                <FileEdit className="w-6 h-6 text-secondary" />
              </div>
              Academic Tasks
            </h1>
            <p className="text-muted-foreground mt-1">Manage institutional tasks and grading workflows.</p>
          </div>
        </div>
        <Button className="gap-2 shadow-lg h-12 px-6 rounded-2xl" onClick={() => setIsCreating(true)}>
          <Plus className="w-5 h-5" /> Create Assignment
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {assignmentsLoading ? (
          <div className="col-span-full flex justify-center py-20">
            <Loader2 className="w-10 h-10 animate-spin text-primary/20" />
          </div>
        ) : assignmentRecords.map((task) => (
          <Card key={task.id} className="border-none shadow-sm overflow-hidden group hover:shadow-md transition-all bg-white rounded-2xl">
            <div className={cn("h-1.5 w-full", task.status === 'draft' ? "bg-slate-400" : "bg-primary")} />
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-widest border-primary/20 text-primary mb-2">
                    {task.targetClass}
                  </Badge>
                  <CardTitle className="text-xl text-primary font-black leading-tight">{task.title}</CardTitle>
                  <CardDescription className="font-bold flex items-center gap-2 mt-1">
                    <Award className="w-3.5 h-3.5" /> {task.courseName}
                  </CardDescription>
                </div>
                <div className="p-2 bg-accent rounded-xl"><Inbox className="w-5 h-5 text-primary" /></div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-accent/30 p-3 rounded-xl border border-accent flex justify-between items-center">
                <div className="space-y-0.5">
                  <p className="text-[9px] font-black uppercase opacity-40">Due Date</p>
                  <p className="text-xs font-bold">{new Date(task.dueDate).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</p>
                </div>
                <div className="h-8 w-px bg-accent mx-2" />
                <div className="space-y-0.5 text-right">
                  <p className="text-[9px] font-black uppercase opacity-40">Max Marks</p>
                  <p className="text-xs font-bold">{task.maxMarks}</p>
                </div>
              </div>
              <div className="flex justify-end">
                {getStatusBadge(task.status)}
              </div>
              {task.attachmentData ? (
                <a href={task.attachmentData} download={task.attachmentName || `${task.title}.pdf`} className="inline-flex w-full">
                  <Button variant="outline" className="h-10 w-full justify-between rounded-xl text-xs font-bold">
                    <span className="flex items-center gap-2"><Paperclip className="h-4 w-4" /> {task.attachmentName || "Assignment PDF"}</span>
                    <Download className="h-4 w-4" />
                  </Button>
                </a>
              ) : null}
            </CardContent>
            <CardFooter className="pt-0 flex gap-2">
              <Button 
                className="flex-1 h-10 bg-primary shadow-sm gap-2 text-xs font-bold"
                onClick={() => setGradingAssignment(task)}
                disabled={task.status === 'draft'}
              >
                <FileEdit className="w-3.5 h-3.5" /> Grade
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-10 w-10 text-destructive/40 hover:text-destructive hover:bg-red-50"
                onClick={() => handleDeleteAssignment(task.id)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      {/* CREATE DIALOG - RESPONSIVE */}
      <Dialog open={isCreating} onOpenChange={setIsCreating}>
        <DialogContent className="sm:max-w-2xl rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl">
          <DialogHeader className="bg-primary p-8 text-white relative">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/10 rounded-2xl">
                <Plus className="w-8 h-8 text-secondary" />
              </div>
              <div>
                <DialogTitle className="text-2xl font-black">Setup New Task</DialogTitle>
                <DialogDescription className="text-white/60">Configure an academic assignment for your class.</DialogDescription>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setIsCreating(false)} className="absolute top-4 right-4 text-white/40 hover:text-white">
              <X className="w-6 h-6" />
            </Button>
          </DialogHeader>
          <div className="p-8 space-y-6 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2 space-y-2">
                <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Assignment Title</Label>
                <Input value={newAssignment.title} onChange={(e) => setNewAssignment({...newAssignment, title: e.target.value})} placeholder="e.g. Chapter 4 Exercises" className="h-12 bg-accent/30 border-none rounded-xl font-bold" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Subject</Label>
                <Select value={newAssignment.subjectId} onValueChange={(v) => setNewAssignment({...newAssignment, subjectId: v})}>
                  <SelectTrigger className="h-12 bg-accent/30 border-none rounded-xl font-bold">
                    <SelectValue placeholder="Select Subject" />
                  </SelectTrigger>
                  <SelectContent>
                    {subjectOptions.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Target Class</Label>
                <Select value={newAssignment.targetClass} onValueChange={(v) => setNewAssignment({...newAssignment, targetClass: v})}>
                  <SelectTrigger className="h-12 bg-accent/30 border-none rounded-xl font-bold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>{targetClassOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Latest Date</Label>
                <Input type="date" value={newAssignment.dueDate} onChange={(e) => setNewAssignment({...newAssignment, dueDate: e.target.value})} className="h-12 bg-accent/30 border-none rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Latest Time</Label>
                <Input type="time" value={newAssignment.dueTime} onChange={(e) => setNewAssignment({...newAssignment, dueTime: e.target.value})} className="h-12 bg-accent/30 border-none rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Max Marks</Label>
                <Input type="number" value={newAssignment.maxMarks} onChange={(e) => setNewAssignment({...newAssignment, maxMarks: parseInt(e.target.value)})} className="h-12 bg-accent/30 border-none rounded-xl font-black text-primary" />
              </div>
              <div className="md:col-span-2 space-y-2">
                <div className="flex items-center justify-between ml-1">
                  <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Instructions</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleAiDraft}
                    disabled={isDrafting}
                    className="h-8 gap-1.5 rounded-full bg-secondary/10 px-3 text-[10px] font-black uppercase tracking-widest text-secondary hover:bg-secondary/20"
                  >
                    {isDrafting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {isDrafting ? "Drafting…" : "Draft with AI"}
                  </Button>
                </div>
                <Textarea value={newAssignment.instructions} onChange={(e) => setNewAssignment({...newAssignment, instructions: e.target.value})} placeholder="Guidelines for students… or tap ‘Draft with AI’ to generate a brief from the title." className="min-h-[120px] bg-accent/30 border-none rounded-xl" />
              </div>
              <div className="md:col-span-2 space-y-2">
                <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Assignment PDF (optional)</Label>
                <div className="rounded-2xl border border-dashed border-primary/20 bg-accent/20 p-4">
                  <Input
                    type="file"
                    accept="application/pdf"
                    onChange={(event) => handleAssignmentPdfChange(event.target.files?.[0])}
                    className="h-11 rounded-xl bg-white"
                  />
                  <p className="mt-2 text-xs text-muted-foreground">PDF only. Maximum size: 6MB. Files are automatically cleared from assignment storage after 90 days.</p>
                  {assignmentPdfFile ? (
                    <div className="mt-3 flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm">
                      <span className="font-bold text-primary">{assignmentPdfFile.name}</span>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setAssignmentPdfFile(null)}>Remove</Button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="bg-accent/20 p-6 border-t border-accent flex flex-col sm:flex-row gap-3">
            <Button variant="outline" onClick={() => handleCreateAssignment('draft')} disabled={isProcessing || !newAssignment.title} className="flex-1 h-14 rounded-2xl font-bold gap-2 bg-white">
              <Save className="w-4 h-4" /> Save Draft
            </Button>
            <Button onClick={() => handleCreateAssignment('published')} disabled={isProcessing || !newAssignment.title} className="flex-1 h-14 rounded-2xl shadow-xl font-black uppercase tracking-widest text-xs gap-3 bg-primary text-white hover:bg-primary/90">
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              Publish Assignment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* GRADING QUEUE DIALOG */}
      <Dialog open={!!gradingAssignment} onOpenChange={() => setGradingAssignment(null)}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0 border-none shadow-2xl rounded-[2.5rem]">
          <DialogHeader className="bg-primary p-8 text-white shrink-0 relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-white/10 rounded-2xl">
                  <ListChecks className="w-8 h-8 text-secondary" />
                </div>
                <div>
                  <DialogTitle className="text-2xl font-black">Submission Registry</DialogTitle>
                  <DialogDescription className="text-white/60">
                    {gradingAssignment?.title} • {gradingAssignment?.targetClass}
                  </DialogDescription>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setGradingAssignment(null)} className="text-white/40 hover:text-white">
                <X className="w-6 h-6" />
              </Button>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-0">
            <Table>
              <TableHeader className="bg-accent/30 sticky top-0 z-10 uppercase text-[10px] font-black tracking-widest">
                <TableRow>
                  <TableHead className="pl-8 py-4">Student Profile</TableHead>
                  <TableHead>Timestamp</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center">Score</TableHead>
                  <TableHead className="text-right pr-8">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(submissionsData?.results || []).map((sub) => (
                  <TableRow key={sub.id} className="hover:bg-accent/5 transition-colors border-b border-accent/10">
                    <TableCell className="pl-8 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10 border-2 border-white shadow-sm ring-1 ring-accent">
                          <AvatarFallback className="bg-primary/5 text-primary font-bold">{sub.student_name?.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-bold text-sm text-primary leading-tight">{sub.student_name}</p>
                          <p className="text-[9px] font-mono text-muted-foreground uppercase">{sub.student_admission}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground font-medium">
                      {sub.created ? new Date(sub.created).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'N/A'}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className={cn(
                        "text-[9px] font-black uppercase px-3 border-none",
                        sub.status === 'graded' ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                      )}>
                        {sub.status === 'graded' ? 'VERIFIED' : 'PENDING'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center font-black text-primary">
                      {sub.score ? `${sub.score} / ${gradingAssignment?.maxMarks}` : '---'}
                    </TableCell>
                    <TableCell className="text-right pr-8">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-[10px] font-black uppercase gap-2 hover:bg-primary hover:text-white"
                        onClick={() => {
                          setReviewingSubmission({ ...sub, maxMarks: gradingAssignment?.maxMarks });
                          setReviewScore(sub.score ? String(sub.score) : "");
                          setReviewFeedback(sub.feedback || "");
                        }}
                      >
                        <Eye className="w-3.5 h-3.5" /> Review
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {missedSubmissionStudents.map((student: any) => (
                  <TableRow key={`missed-${student.id}`} className="border-b border-red-100 bg-red-50/40">
                    <TableCell className="pl-8 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10 border-2 border-white shadow-sm ring-1 ring-red-100">
                          <AvatarFallback className="bg-red-100 text-red-700 font-bold">{(student.user?.name || student.student_name || "S").charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-bold text-sm text-primary leading-tight">{student.user?.name || student.student_name || "Student"}</p>
                          <p className="text-[9px] font-mono text-muted-foreground uppercase">{student.admission_number || student.matricule || "-"}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground font-medium">No submission before deadline</TableCell>
                    <TableCell className="text-center">
                      <Badge className="border-none bg-red-100 px-3 text-[9px] font-black uppercase text-red-700">Missed</Badge>
                    </TableCell>
                    <TableCell className="text-center font-black text-primary">0 / {gradingAssignment?.maxMarks}</TableCell>
                    <TableCell className="pr-8 text-right text-[10px] font-black uppercase text-red-700">Closed</TableCell>
                  </TableRow>
                ))}
                {!(submissionsData?.results || []).length && !missedSubmissionStudents.length ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-sm font-medium text-muted-foreground">
                      No submissions recorded yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
          <DialogFooter className="bg-accent/10 p-6 border-t flex justify-between items-center shrink-0">
             <div className="flex items-center gap-2 text-muted-foreground">
                <ShieldCheck className="w-4 h-4 text-primary opacity-40" />
                <p className="text-[10px] font-black uppercase tracking-widest italic opacity-40">High-fidelity grading audit active.</p>
             </div>
             <Button onClick={() => setGradingAssignment(null)} variant="outline" className="rounded-xl h-10 px-8 font-bold text-xs uppercase">Close Queue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* REVIEW SUBMISSION DIALOG */}
      <Dialog open={!!reviewingSubmission} onOpenChange={() => setReviewingSubmission(null)}>
        <DialogContent className="sm:max-w-2xl rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl">
          <DialogHeader className="bg-primary p-8 text-white relative">
            <div className="flex items-center gap-4">
              <Avatar className="h-12 w-12 border-2 border-white/20">
                <AvatarFallback className="bg-white/10">{reviewingSubmission?.student_name?.charAt(0)}</AvatarFallback>
              </Avatar>
              <div>
                <DialogTitle className="text-2xl font-black">Review Submission</DialogTitle>
                <DialogDescription className="text-white/60">Evaluating work for {reviewingSubmission?.student_name}</DialogDescription>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setReviewingSubmission(null)} className="absolute top-4 right-4 text-white/40 hover:text-white">
              <X className="w-6 h-6" />
            </Button>
          </DialogHeader>
          <div className="p-10 space-y-8 max-h-[70vh] overflow-y-auto">
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-accent pb-2">
                <FileText className="w-4 h-4 text-primary/40" />
                <h3 className="text-xs font-black uppercase text-primary tracking-widest">Student Response</h3>
              </div>
              <div className="bg-accent/10 p-6 rounded-2xl italic text-primary/80 leading-relaxed font-medium">
                "{reviewingSubmission?.content}"
              </div>
            </div>

            {reviewingSubmission?.attachment_name && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-accent pb-2">
                  <Paperclip className="w-4 h-4 text-primary/40" />
                  <h3 className="text-xs font-black uppercase text-primary tracking-widest">Attached File</h3>
                </div>
                <div className="flex items-center justify-between p-4 bg-white border rounded-2xl shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/5 rounded-lg text-primary">
                      <FileText className="w-5 h-5" />
                    </div>
                    <span className="text-sm font-bold text-primary">{reviewingSubmission.attachment_name}</span>
                  </div>
                  <a href={reviewingSubmission.attachment_data || "#"} download={reviewingSubmission.attachment_name} className="inline-flex">
                    <Button variant="ghost" size="sm" className="gap-2 text-[10px] font-black uppercase tracking-widest">
                      <Download className="w-3.5 h-3.5" /> Download
                    </Button>
                  </a>
                </div>
              </div>
            )}

            <div className="p-6 bg-primary/5 rounded-3xl border border-primary/10 space-y-4">
               <h3 className="text-xs font-black uppercase text-primary tracking-widest">Assign Score</h3>
               <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="relative flex-1 w-full">
                    <Input 
                      type="number" 
                      value={reviewScore}
                      onChange={(e) => setReviewScore(e.target.value)}
                      className="h-14 bg-white border-none rounded-2xl font-black text-2xl text-primary pl-6"
                      placeholder="0"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 font-black text-xs opacity-40">/ {reviewingSubmission?.maxMarks}</span>
                  </div>
                  <Button 
                    className="h-14 w-full sm:w-auto px-8 rounded-2xl shadow-lg font-black uppercase tracking-widest text-xs gap-2"
                    onClick={async () => {
                      if (!reviewingSubmission?.id) return;
                      try {
                        await gradeSubmissionMutation.mutateAsync({
                          id: reviewingSubmission.id,
                          payload: {
                            score: Number(reviewScore),
                            feedback: reviewFeedback,
                          },
                        });
                        setReviewingSubmission(null);
                        toast({ title: "Score Synchronized", description: "The pedagogical record has been updated." });
                      } catch (error) {
                        toast({ variant: "destructive", title: "Grading failed", description: getApiErrorMessage(error, "Could not save that score.") });
                      }
                    }}
                  >
                    <CheckCircle2 className="w-4 h-4" /> Save Score
                  </Button>
               </div>
               <Textarea
                 value={reviewFeedback}
                 onChange={(e) => setReviewFeedback(e.target.value)}
                 placeholder="Optional grading feedback..."
                 className="min-h-[100px] bg-white border-none rounded-2xl"
               />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StudentAssignmentCard({ assignment, onViewResponse }: { assignment: any, onViewResponse: (a: any) => void }) {
  const { language, t } = useI18n();
  const isSubmitted = assignment.status === 'submitted' || assignment.status === 'graded';
  const isMissed = assignment.status === 'missed';
  
  return (
    <Card className="border-none shadow-sm overflow-hidden group hover:shadow-md transition-all bg-white rounded-2xl">
      <div className={cn(
        "h-1.5 w-full",
        assignment.status === 'graded' ? "bg-green-500" : isSubmitted ? "bg-amber-500" : "bg-primary"
      )} />
      <CardHeader>
        <div className="flex justify-between items-start mb-2">
          <Badge variant="outline" className="text-[10px] uppercase font-black tracking-widest border-primary/10 text-primary">
            {assignment.status === 'upcoming' ? 'Open' : assignment.status}
          </Badge>
          <Badge className="bg-primary text-white border-none font-bold text-[10px] px-3">MAX: {assignment.maxMarks}</Badge>
        </div>
        <CardTitle className="text-xl font-black text-primary leading-tight group-hover:text-primary transition-colors">
          {assignment.title}
        </CardTitle>
        <CardDescription className="font-bold flex items-center gap-2 mt-1">
          <Award className="w-3.5 h-3.5" /> {assignment.courseName}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {assignment.status === 'graded' ? (
          <div className="bg-green-50 p-4 rounded-xl border border-green-100 text-center space-y-1">
            <p className="text-[10px] font-black uppercase text-green-600">Verified Score</p>
            <p className="text-3xl font-black text-green-700">{assignment.score} <span className="text-sm opacity-40">/ {assignment.maxMarks}</span></p>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-xs text-muted-foreground bg-accent/30 p-3 rounded-xl border border-accent">
            <Clock className="w-4 h-4 text-primary" />
            <div className="flex flex-col">
              <span className="text-[9px] uppercase font-black opacity-40">Deadline</span>
              <span className="font-bold">{new Date(assignment.dueDate).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
          <Badge variant="secondary" className="bg-primary/5 text-primary border-none text-[8px] font-black uppercase flex items-center gap-1.5 px-2">
            {assignment.type === 'both' ? (
              <><FileText className="w-3 h-3"/> Text & File</>
            ) : assignment.type === 'file' ? (
              <><Paperclip className="w-3 h-3"/> File Only</>
            ) : (
              <><FileText className="w-3 h-3"/> Text Response</>
            )}
          </Badge>
        </div>
        {assignment.assignmentAttachmentData ? (
          <a href={assignment.assignmentAttachmentData} download={assignment.assignmentAttachmentName || `${assignment.title}.pdf`} className="inline-flex w-full">
            <Button variant="outline" className="h-10 w-full justify-between rounded-xl text-xs font-bold">
              <span className="flex items-center gap-2"><Download className="h-4 w-4" /> Download assignment PDF</span>
              <Paperclip className="h-4 w-4" />
            </Button>
          </a>
        ) : null}
      </CardContent>
      <CardFooter className="pt-0 pb-6 px-6">
        {isSubmitted ? (
          <Button 
            variant="outline" 
            className="w-full justify-between transition-all group/btn h-11 rounded-xl shadow-sm font-bold"
            onClick={() => onViewResponse(assignment)}
          >
            {language === 'en' ? 'View My Response' : 'Voir ma réponse'}
            <ChevronRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
          </Button>
        ) : isMissed ? (
          <Button disabled className="w-full justify-between h-11 rounded-xl font-bold bg-red-100 text-red-700 hover:bg-red-100">
            Submission Closed
            <XCircle className="w-4 h-4" />
          </Button>
        ) : (
          <Button asChild className="w-full justify-between transition-all group/btn h-11 rounded-xl shadow-sm font-bold bg-primary hover:bg-primary/90 text-white">
            <Link href={`/dashboard/assignments/submit?id=${assignment.id}`}>
              {language === 'en' ? 'Submit Work' : 'Rendre le Travail'}
              <ChevronRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
            </Link>
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
