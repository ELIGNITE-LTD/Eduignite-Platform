
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n-context";
import { useAuth } from "@/lib/auth-context";
import { useStudent, useMyChildren } from "@/lib/hooks/useStudents";
import { useGrades, useActiveSequence } from "@/lib/hooks/useGrades";
import { gradesService } from "@/lib/api/services/grades.service";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  ArrowLeft, 
  Award, 
  Calendar, 
  ClipboardCheck, 
  BookOpen, 
  User,
  GraduationCap,
  MapPin,
  Clock,
  FileText,
  CreditCard,
  Receipt,
  Download,
  Building2,
  Eye,
  CheckCircle2,
  Printer,
  ChevronRight,
  XCircle,
  History,
  ShieldCheck,
  Mail,
  Info,
  Phone,
  QrCode,
  Loader2,
  AlertCircle,
  X,
  TrendingUp,
  ListChecks,
  Users,
  Send,
  Scale,
  Activity,
  Lock,
  FileBadge,
  FileDown,
  Briefcase,
  Fingerprint,
  Heart,
  CalendarDays,
  Zap,
  Signature as SignatureIcon,
  Trophy,
  Sparkles,
  Star
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import Link from "next/link";
import { attendanceService } from "@/lib/api/services/attendance.service";
import { resolveMediaUrl } from "@/lib/media";
import { downloadHtmlDocument, downloadReportCardsPdf, downloadHtmlPagesPdf, downloadElementPdf, escapeHtml } from "@/lib/browser-download";
import { buildHonourRollCertificateHtml } from "@/lib/honour-roll-certificate";
import { buildCameroonReportCardDocument, buildCameroonReportCardHtml } from "@/lib/cameroon-report-card";
import { buildSequenceLedger } from "@/lib/sequence-ledger";
import { StudentIdCard } from "@/components/student-id-card";

const CLASSES = ["6ème / Form 1", "5ème / Form 2", "4ème / Form 3", "3ème / Form 4", "2nde / Form 5", "1ère / Lower Sixth", "Terminale / Upper Sixth"];

function normalizeStatus(status?: string) {
  const value = (status || "").toLowerCase();
  if (value === "present" || value === "late" || value === "excused") return "present";
  if (value === "absent") return "absent";
  return "unknown";
}

function buildGradeLedger(grades: any[] = []) {
  const grouped = grades.reduce((acc: Record<string, any>, grade: any) => {
    const subject = grade.subject?.name || grade.subject_name || "Unknown Subject";
    const coefficient = Number(grade.subject?.coefficient || 1);

    if (!acc[subject]) {
      acc[subject] = {
        subject,
        teacher: grade.teacher_name || grade.teacher?.name || "",
        coef: coefficient,
        seq1: 0,
        seq2: 0,
        average: 0,
        total: 0,
        rank: "-",
        initials: subject.substring(0, 2).toUpperCase(),
        scores: [] as number[],
      };
    }

    const score = Number(grade.score || 0);
    const sequenceName = `${grade.sequence?.name || grade.sequence_name || ""}`.toLowerCase();
    if (sequenceName.includes("1")) {
      acc[subject].seq1 = score;
    } else if (sequenceName.includes("2")) {
      acc[subject].seq2 = score;
    } else if (acc[subject].seq1 === 0) {
      acc[subject].seq1 = score;
    } else if (acc[subject].seq2 === 0) {
      acc[subject].seq2 = score;
    }

    acc[subject].scores.push(score);
    return acc;
  }, {});

  return Object.values(grouped).map((entry: any) => {
    const average =
      entry.scores.length > 0
        ? entry.scores.reduce((sum: number, score: number) => sum + score, 0) / entry.scores.length
        : 0;
    return {
      ...entry,
      average,
      total: average * entry.coef,
    };
  });
}

function buildTranscriptRows(grades: any[] = []) {
  const grouped = grades.reduce((acc: Record<string, Record<string, number>>, grade: any) => {
    const subject = grade.subject?.name || grade.subject_name || "Unknown Subject";
    const sequence = grade.sequence?.name || grade.sequence_name || "Sequence";
    if (!acc[subject]) {
      acc[subject] = {};
    }
    acc[subject][sequence] = Number(grade.score || 0);
    return acc;
  }, {});

  return Object.entries(grouped).map(([subject, sequences]) => ({ subject, sequences }));
}

function buildReportCardPayloadFromStudent(student: any, term = "Published Period") {
  return {
    student: {
      name: student?.name,
      admission_number: student?.id,
      matricule: student?.id,
      class: student?.class,
      section: student?.section,
      gender: student?.gender,
      avatar: student?.avatar,
      school: student?.school,
    },
    school: student?.school,
    sequence: {
      name: term,
      academic_year: student?.academicYear || student?.school?.academic_year || "",
      term: student?.term || "",
      type: "TERM",
    },
    grades: (student?.grades || []).map((grade: any) => ({
      subject_name: grade.subject,
      teacher_name: grade.teacher,
      coefficient: grade.coef,
      seq1: grade.seq1,
      seq2: grade.seq2,
      score: grade.average,
      total: grade.total,
    })),
    average: Number(student?.annualAvg || 0),
    rank: student?.attendanceSummary?.rank || "",
    total_students: student?.attendanceSummary?.total_students || "",
    attendance: student?.attendanceSummary || {},
  };
}

export default function StudentDetailsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user: currentUser, platformSettings } = useAuth();
  const { toast } = useToast();
  const { t, language } = useI18n();
  const studentId = searchParams.get("id");

  const [viewingDoc, setViewingDoc] = useState<any>(null);
  const [viewingCertificate, setViewingCertificate] = useState<boolean>(false);
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [attendanceSummary, setAttendanceSummary] = useState<any>(null);

  // Fetch real student data
  const { data: studentData, isLoading: studentLoading } = useStudent(studentId || '');
  const { data: myChildrenData } = useMyChildren();
  const { data: gradesData, refetch: refetchGrades } = useGrades({ student: studentId || undefined });
  const { data: activeSequenceData } = useActiveSequence();

  // The parent must see the SAME official report card as the school admin and the
  // student — same data, styling and a working verification QR. So instead of
  // rebuilding it from local grades, fetch the official published report card
  // from the backend (which only returns it once the admin has published it).
  const [officialReportCard, setOfficialReportCard] = useState<any>(null);
  const [officialReportError, setOfficialReportError] = useState("");
  const reportSequenceId =
    activeSequenceData?.results?.[0]?.id ||
    (gradesData?.results || []).map((g: any) => g.sequence?.id || g.sequence_id).find(Boolean) ||
    "";

  useEffect(() => {
    let cancelled = false;
    if (viewingDoc?.type !== "report" || !studentId || !reportSequenceId) {
      setOfficialReportCard(null);
      setOfficialReportError("");
      return;
    }
    setOfficialReportError("");
    gradesService
      .getReportCard(studentId, reportSequenceId)
      .then((data: any) => { if (!cancelled) setOfficialReportCard(data); })
      .catch((error: any) => {
        if (cancelled) return;
        setOfficialReportCard(null);
        setOfficialReportError(
          error?.response?.data?.detail ||
          "This report card has not been published by the school admin yet."
        );
      });
    return () => { cancelled = true; };
  }, [viewingDoc, studentId, reportSequenceId]);

  const childOptions = myChildrenData?.results || [];
  const fallbackChild =
    childOptions.find((child: any) => child.id === studentId || child.admission_number === studentId || child.user?.matricule === studentId) ||
    childOptions[0];
  const rawStudent = studentData || fallbackChild;

  const gradeList = useMemo(() => buildGradeLedger(gradesData?.results || []), [gradesData?.results]);
  // Dynamic follow-up ledger: one column per sequence that already has marks,
  // regardless of the active term — identical to the student's own table.
  const sequenceLedger = useMemo(() => buildSequenceLedger(gradesData?.results || []), [gradesData?.results]);
  const transcriptRows = useMemo(() => buildTranscriptRows(gradesData?.results || []), [gradesData?.results]);

  const student = useMemo(() => {
    if (!rawStudent) return null;

    return {
      recordId: rawStudent.id,
      id: rawStudent.admission_number || rawStudent.user?.matricule || rawStudent.id,
      uid: rawStudent.user?.id,
      name: rawStudent.user?.name || "Unknown",
      class: rawStudent.student_class || "Unknown",
      section: rawStudent.section || "Unknown",
      email: rawStudent.user?.email || "",
      status: "active",
      isLicensePaid: rawStudent.user?.is_license_paid || false,
      avatar: resolveMediaUrl(rawStudent.user?.avatar) || "",
      dob: rawStudent.date_of_birth || "",
      admissionDate: rawStudent.admission_date || "",
      admissionYear: rawStudent.admission_date ? String(new Date(rawStudent.admission_date).getFullYear()) : "",
      gender: rawStudent.gender || "Unknown",
      guardian: rawStudent.guardian_name || "",
      guardianPhone: rawStudent.guardian_phone || "",
      address: rawStudent.address || "",
      annualAvg: Number(rawStudent.annual_average || rawStudent.user?.annual_avg || 0),
      school: rawStudent.school || currentUser?.school,
      grades: gradeList,
      transcriptRows,
      attendance: attendanceRecords,
      attendanceSummary,
    };
  }, [attendanceRecords, attendanceSummary, currentUser?.school, gradeList, rawStudent, transcriptRows]);

  const loading = studentLoading && !student;

  useEffect(() => {
    if (!studentId) return;
    const refreshInterval = window.setInterval(() => {
      void refetchGrades();
    }, 15000);
    return () => window.clearInterval(refreshInterval);
  }, [refetchGrades, studentId]);

  useEffect(() => {
    const loadAttendance = async () => {
      if (!rawStudent?.id) {
        setAttendanceRecords([]);
        setAttendanceSummary(null);
        return;
      }

      try {
        const [recordsResponse, summaryResponse] = await Promise.all([
          attendanceService.getAttendanceRecords({ student: rawStudent.id, limit: 50 }),
          attendanceService.getStudentSummary(rawStudent.id),
        ]);

        const records = Array.isArray(recordsResponse)
          ? recordsResponse
          : recordsResponse?.results || [];

        setAttendanceRecords(
          records.map((record: any) => ({
            subject: record.session?.subject_name || record.session?.subject || "General Studies",
            time: record.session?.date || "",
            teacher: record.session?.teacher_name || "School Registry",
            status: normalizeStatus(record.status),
            rawStatus: record.status,
          }))
        );
        setAttendanceSummary(summaryResponse || null);
      } catch (error) {
        console.error("Failed to load child attendance dossier", error);
        setAttendanceRecords([]);
        setAttendanceSummary(null);
      }
    };

    loadAttendance();
  }, [rawStudent?.id]);

  const handleDownload = async (title: string) => {
    if (!student) return;
    const type =
      title === "Digital ID Card"
        ? "id"
        : title === "Honour Roll Certificate"
          ? "certificate"
          : "report";

    const safeName = `${student.name || "student"}_${title}`.replace(/\s+/g, "_").toLowerCase();

    if (type === "report") {
      // The report card is only available to the family once the school admin
      // has published it: use the official published card (same data + QR as the
      // admin/student). If it is missing, publication has not happened yet.
      let cardData = officialReportCard;
      if (!cardData && studentId && reportSequenceId) {
        try {
          cardData = await gradesService.getReportCard(studentId, reportSequenceId);
        } catch {
          cardData = null;
        }
      }
      if (!cardData) {
        toast({ variant: "destructive", title: "Report card unavailable", description: officialReportError || "This report card has not been published by the school admin yet." });
        return;
      }
      // Pixel-exact PDF — identical to the on-screen official report card.
      await downloadReportCardsPdf(
        [buildCameroonReportCardHtml(cardData, { title, school: student.school, student, attendance: student.attendanceSummary })],
        safeName,
      );
      toast({ title: "Download ready", description: `${title} has been saved as a PDF, exactly as shown.` });
      return;
    }

    if (type === "id") {
      // Capture the very ID card on screen, so the download is identical.
      const el = document.getElementById("parent-id-card-print");
      if (!el) {
        toast({ variant: "destructive", title: "Card unavailable", description: "Open the ID card preview first." });
        return;
      }
      await downloadElementPdf(el, safeName, { landscape: true });
      toast({ title: "Download ready", description: `${title} has been saved as a PDF, exactly as shown.` });
      return;
    }

    // Honour Roll Certificate — the shared official design, landscape.
    await downloadHtmlPagesPdf(
      [buildHonourRollCertificateHtml(
        {
          name: student.name,
          class_name: student.class,
          academic_year: (student as any).academicYear || (student.school as any)?.academic_year || "",
          average: (student as any).annualAvg,
          principal: (student.school as any)?.principal,
        },
        student.school,
      )],
      safeName,
      { landscape: true },
    );
    toast({ title: "Download ready", description: `${title} has been saved as a PDF, exactly as shown.` });
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
      <Loader2 className="w-12 h-12 animate-spin text-primary opacity-20" />
      <p className="text-muted-foreground italic font-medium">Syncing child academic dossier...</p>
    </div>
  );

  if (!student) return null;

  const threshold = platformSettings.honourRollThreshold || 12.0;
  const isHonourRoll = student.annualAvg >= threshold;

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4 w-full">
          <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/children')} className="rounded-full shadow-sm hover:bg-white shrink-0">
            <ArrowLeft className="w-6 h-6" />
          </Button>
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 md:h-20 md:w-20 border-4 border-white shadow-xl shrink-0 ring-1 ring-primary/10">
              <AvatarImage src={student.avatar} />
              <AvatarFallback className="bg-primary/5 text-primary text-2xl font-black">{student.name?.charAt(0)}</AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-primary font-headline flex items-center gap-2 uppercase tracking-tight">
                {student.name}
                <Badge className="bg-green-100 text-green-700 uppercase hidden md:inline-flex">ACTIVE</Badge>
              </h1>
              <p className="text-sm md:text-base text-muted-foreground">{student.class} • Matricule: {student.id}</p>
            </div>
          </div>
        </div>
        <Button className="flex-1 sm:flex-none gap-2 shadow-xl rounded-xl h-12 px-8 font-black uppercase text-[10px] tracking-widest" onClick={() => window.print()}>
          <Printer className="w-4 h-4" /> {t("print")} Record
        </Button>
      </div>

      {isHonourRoll ? (
        <Card className="border-none shadow-xl bg-primary text-white overflow-hidden rounded-[2rem] relative group">
          <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform"><Trophy className="w-32 h-32"/></div>
          <CardContent className="p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div className="flex items-center gap-6">
              <div className="p-4 bg-secondary text-primary rounded-[1.5rem] shadow-2xl">
                <Award className="w-10 h-10" />
              </div>
              <div>
                <h3 className="text-2xl font-black uppercase tracking-tighter text-secondary">Academic Distinction</h3>
                <p className="text-white/60 text-sm font-medium">Your child has achieved the **Honour Roll** with an average of **{student.annualAvg.toFixed(2)}**.</p>
              </div>
            </div>
            <Button 
              className="h-14 px-8 rounded-2xl bg-secondary text-primary hover:bg-secondary/90 font-black uppercase text-xs tracking-widest gap-2 shadow-lg transition-all active:scale-95"
              onClick={() => setViewingCertificate(true)}
            >
              <Trophy className="w-4 h-4" /> View Official Certificate
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-none shadow-sm bg-accent/20 border border-accent rounded-[2rem]">
          <CardContent className="p-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white rounded-xl shadow-inner text-primary/40">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Honour Roll Status</p>
                <p className="text-sm font-bold text-primary">Not Yet Eligible (Threshold: {threshold.toFixed(1)})</p>
              </div>
            </div>
            <Button asChild variant="ghost" className="text-[10px] font-black uppercase gap-2 hover:bg-white">
              <Link href="/dashboard/ai-assistant">Get Support <Sparkles className="w-3.5 h-3.5"/></Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="test" className="w-full">
        <TabsList className="grid w-full bg-white border shadow-sm h-auto p-1.5 rounded-2xl grid-cols-5 overflow-x-auto no-scrollbar">
          <TabsTrigger value="profile" className="gap-2 py-3 font-bold"><User className="w-4 h-4" /> {t("profile")}</TabsTrigger>
          <TabsTrigger value="test" className="gap-2 py-3 font-bold"><Award className="w-4 h-4" /> Test</TabsTrigger>
          <TabsTrigger value="attendance" className="gap-2 py-3 font-bold"><ClipboardCheck className="w-4 h-4" /> {t("presence")}</TabsTrigger>
          <TabsTrigger value="documents" className="gap-2 py-3 font-bold"><FileText className="w-4 h-4" /> {t("documents")}</TabsTrigger>
          <TabsTrigger value="transcript" className="gap-2 py-3 font-bold"><FileBadge className="w-4 h-4" /> {t("transcript")}</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-6">
          <Card className="border-none shadow-sm rounded-3xl overflow-hidden bg-white">
            <CardHeader className="bg-primary p-10 text-white text-center">
              <Avatar className="h-28 w-28 border-4 border-white/20 mx-auto shadow-xl mb-4">
                <AvatarImage src={student.avatar} />
                <AvatarFallback>{student.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <CardTitle className="text-3xl font-black uppercase tracking-tight">{student.name}</CardTitle>
              <Badge variant="secondary" className="bg-secondary text-primary border-none font-black mt-2 px-4 py-1">ID: {student.id}</Badge>
            </CardHeader>
            <CardContent className="p-10 grid grid-cols-1 md:grid-cols-2 gap-12">
               <div className="space-y-6">
                  <div className="space-y-1"><p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Date of Birth</p><p className="font-bold text-primary">{student.dob}</p></div>
                  <div className="space-y-1"><p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Section</p><p className="font-bold text-primary">{student.section}</p></div>
                  <div className="space-y-1"><p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Home Address</p><p className="font-bold text-primary">{student.address}</p></div>
               </div>
               <div className="space-y-6">
                  <div className="space-y-1"><p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Primary Guardian</p><p className="font-bold text-primary">{student.guardian}</p></div>
                  <div className="space-y-1"><p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Emergency Contact</p><p className="font-bold text-secondary">{student.guardianPhone}</p></div>
                  <div className="space-y-1"><p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Enrollment Status</p><Badge className="bg-green-100 text-green-700 border-none uppercase font-black text-[9px]">ENROLLED</Badge></div>
               </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="test" className="mt-6 space-y-6">
          <Card className="border-none shadow-xl overflow-hidden rounded-[2.5rem] bg-white">
            <CardHeader className="bg-primary p-8 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl font-black uppercase tracking-tighter">Test Marks Follow-up</CardTitle>
                  <CardDescription className="text-white/60">Teacher-saved marks for parent academic follow-up before official reports are released.</CardDescription>
                </div>
                <Badge variant="secondary" className="bg-secondary text-primary font-black px-4 py-1">TERM 3 ACTIVE</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader className="bg-accent/10">
                  <TableRow className="uppercase text-[10px] font-black tracking-widest border-b">
                    <TableHead className="pl-8 py-4">Subject</TableHead>
                    <TableHead className="text-center">Coefficient</TableHead>
                    {sequenceLedger.columns.map((col) => (
                      <TableHead key={col.id} className="text-center bg-primary/5">{col.label}</TableHead>
                    ))}
                    <TableHead className="text-center">Average</TableHead>
                    <TableHead className="text-right pr-8">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sequenceLedger.rows.length > 0 ? (
                    sequenceLedger.rows.map((g, idx: number) => (
                      <TableRow key={idx} className="h-16 border-b last:border-0 hover:bg-accent/5 transition-colors">
                        <TableCell className="pl-8 font-black uppercase text-xs text-primary">{g.subject}</TableCell>
                        <TableCell className="text-center font-mono font-bold">{g.coef}</TableCell>
                        {sequenceLedger.columns.map((col) => (
                          <TableCell key={col.id} className="text-center font-black text-primary bg-primary/5">
                            {g.scores[col.id] !== null && g.scores[col.id] !== undefined ? Number(g.scores[col.id]).toFixed(2) : "—"}
                          </TableCell>
                        ))}
                        <TableCell className="text-center font-black text-secondary">{g.average.toFixed(2)}</TableCell>
                        <TableCell className="text-right pr-8">
                          <Badge className={cn(
                            "text-[9px] font-black border-none px-3",
                            g.average >= 10 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                          )}>
                            {g.average >= 10 ? 'PASSED' : 'FAILED'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4 + sequenceLedger.columns.length} className="py-10 text-center text-sm text-muted-foreground">
                        No marks have been saved for this student yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
            <CardFooter className="bg-accent/10 p-6 border-t flex justify-center">
               <div className="flex items-center gap-2 text-muted-foreground italic">
                  <ShieldCheck className="w-4 h-4 text-primary opacity-40" />
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Live Node Synchronization Active</p>
               </div>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="attendance" className="mt-6 space-y-8">
          <Card className="border-none shadow-xl overflow-hidden rounded-[2.5rem] bg-secondary/10 border-b p-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-secondary text-primary rounded-2xl shadow-lg">
                  <Calendar className="w-8 h-8" />
                </div>
                <div>
                  <CardTitle className="text-xl font-black uppercase tracking-tight text-primary">Today's Presence</CardTitle>
                  <CardDescription className="font-bold text-primary/60">Live session participation registry.</CardDescription>
                </div>
              </div>
              <Badge className="bg-primary text-white border-none font-black px-4 py-1 uppercase text-[10px]">
                {attendanceSummary?.percentage != null ? `${Number(attendanceSummary.percentage).toFixed(0)}% present` : new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
              </Badge>
            </div>
          </Card>
          <Card className="border-none shadow-xl overflow-hidden rounded-[2.5rem] bg-white">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader className="bg-accent/30 uppercase text-[9px] font-black tracking-widest border-b">
                  <TableRow>
                    <TableHead className="pl-8 py-4">Subject</TableHead>
                    <TableHead>Time Slot</TableHead>
                    <TableHead>Teacher</TableHead>
                    <TableHead className="text-right pr-8">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {student.attendance.length > 0 ? student.attendance.map((today: any, i: number) => (
                    <TableRow key={`${today.subject}-${i}`} className="hover:bg-accent/5 h-16 border-b last:border-0">
                      <TableCell className="pl-8 font-black uppercase text-xs text-primary">{today.subject}</TableCell>
                      <TableCell className="font-bold text-xs">
                        <div className="flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5 text-primary/40" />
                          {today.time ? new Date(today.time).toLocaleDateString() : "Recorded"}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-bold text-muted-foreground uppercase">{today.teacher}</TableCell>
                      <TableCell className="text-right pr-8">
                        <Badge className={cn(
                          "text-[8px] font-black border-none px-3 gap-1.5",
                          today.status === 'present' ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                        )}>
                          {today.status === 'present' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          {today.status.toUpperCase()}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                        No attendance entries have been recorded for this learner yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {gradeList.length > 0 ? (
              <Card className="border-none shadow-sm overflow-hidden bg-white group hover:shadow-md transition-all rounded-3xl">
                <div className="h-1.5 w-full bg-blue-500" />
                <CardHeader className="pb-4">
                  <div className="flex justify-between items-start">
                    <div className="p-3 bg-blue-50 rounded-2xl text-blue-600"><FileText className="w-6 h-6" /></div>
                    <Badge variant="secondary" className="bg-blue-100 text-blue-700 border-none text-[8px] font-black uppercase tracking-widest px-2 h-5">Published Bulletin</Badge>
                  </div>
                  <CardTitle className="text-lg font-black mt-4 uppercase text-primary">Published Report Card</CardTitle>
                  <CardDescription className="text-[10px] font-bold uppercase tracking-tight">
                    Displayed only after the school publishes results for the learner.
                  </CardDescription>
                </CardHeader>
                <CardFooter className="pt-0 flex gap-2 p-6">
                  <Button variant="outline" size="sm" className="flex-1 gap-2 text-[10px] font-black uppercase h-10 rounded-xl border-primary/10 hover:bg-primary/5" onClick={() => setViewingDoc({ title: 'Published Report Card', type: 'report', term: 'Published Period' })}>
                    <Eye className="w-3.5 h-3.5" /> View
                  </Button>
                  <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl border-primary/10 hover:bg-primary/5" onClick={() => handleDownload('Published Report Card')}>
                    <Download className="w-3.5 h-3.5 text-primary/60" />
                  </Button>
                </CardFooter>
              </Card>
            ) : null}

            <Card className="border-none shadow-sm overflow-hidden bg-white group hover:shadow-md transition-all rounded-3xl">
              <div className="h-1.5 w-full bg-secondary" />
              <CardHeader className="pb-4">
                <div className="flex justify-between items-start">
                  <div className="p-3 bg-secondary/20 rounded-2xl text-primary"><CreditCard className="w-6 h-6" /></div>
                  <Badge variant="secondary" className="bg-secondary/20 text-primary border-none text-[8px] font-black uppercase tracking-widest px-2 h-5">Digital PVC</Badge>
                </div>
                <CardTitle className="text-lg font-black mt-4 uppercase text-primary">Student Identity Card</CardTitle>
                <CardDescription className="text-[10px] font-bold uppercase tracking-tight">Verified Digital Registry Copy</CardDescription>
              </CardHeader>
              <CardFooter className="pt-0 flex gap-2 p-6">
                <Button variant="outline" size="sm" className="flex-1 gap-2 text-[10px] font-black uppercase h-10 rounded-xl border-primary/10 hover:bg-primary/5" onClick={() => setViewingDoc({ title: 'Digital ID Card', type: 'id' })}>
                  <Eye className="w-3.5 h-3.5" /> Preview
                </Button>
                <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl border-primary/10 hover:bg-primary/5" onClick={() => handleDownload('Digital ID Card')}>
                  <Download className="w-3.5 h-3.5 text-primary/60" />
                </Button>
              </CardFooter>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="transcript" className="mt-6">
          <Card className="border-none shadow-xl overflow-hidden rounded-[2.5rem] bg-white p-8">
            <div className="overflow-x-auto scrollbar-thin">
              <LandscapeTranscript student={student} platform={platformSettings} />
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!viewingDoc} onOpenChange={() => setViewingDoc(null)}>
        <DialogContent className="sm:max-w-4xl max-h-[95vh] p-0 overflow-hidden border-none shadow-2xl bg-white flex flex-col">
          <DialogHeader className="bg-primary p-6 md:p-8 text-white relative shrink-0 no-print">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-white/10 rounded-xl">
                {viewingDoc?.type === 'report' ? <FileText className="w-6 h-6 text-secondary" /> : <CreditCard className="w-6 h-6 text-secondary" />}
              </div>
              <div>
                <DialogTitle className="text-xl font-black uppercase tracking-tight">{viewingDoc?.title}</DialogTitle>
                <DialogDescription className="text-white/60 text-xs">Official Institutional Dossier Preview</DialogDescription>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setViewingDoc(null)} className="absolute top-4 right-4 text-white hover:bg-white/10">
              <X className="w-6 h-6" />
            </Button>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-muted scrollbar-thin">
            {viewingDoc?.type === 'report' ? (
              officialReportCard ? (
                // Identical to the admin/student view: the official published card + QR.
                <div
                  dangerouslySetInnerHTML={{
                    __html: buildCameroonReportCardHtml(officialReportCard, {
                      title: viewingDoc?.title || "Published Report Card",
                      school: student?.school,
                      student,
                      attendance: student?.attendanceSummary,
                    }),
                  }}
                />
              ) : (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center text-sm font-semibold text-amber-800">
                  {officialReportError || "Loading the official report card..."}
                </div>
              )
            ) : !((rawStudent as any)?.qr_code) ? (
              // The identity card is only available once the school has issued it
              // (a verification code has been generated for the student).
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center text-sm font-semibold text-amber-800">
                This student&apos;s identity card has not been issued by the school yet.
              </div>
            ) : (
              // Same official ID card component the school admin uses — identical
              // design, data and a working verification QR.
              <div id="parent-id-card-print" className="flex justify-center">
                <StudentIdCard
                  student={{
                    name: student.name,
                    matricule: rawStudent?.user?.matricule || student.id,
                    className: student.class,
                    section: student.section,
                    dob: student.dob,
                    placeOfBirth: (rawStudent as any)?.place_of_birth || (rawStudent as any)?.placeOfBirth || "",
                    gender: student.gender,
                    admissionNumber: (rawStudent as any)?.admission_number || student.id,
                    avatar: student.avatar,
                    qrCode: (rawStudent as any)?.qr_code || "",
                    guardian: student.guardian,
                    guardianPhone: student.guardianPhone,
                  }}
                  school={{
                    name: student.school?.name || currentUser?.school?.name || "School Name",
                    motto: student.school?.motto,
                    logo: student.school?.logo,
                    address: student.school?.address || student.school?.location,
                    phone: student.school?.phone,
                    principal: student.school?.principal,
                  }}
                  platform={{ name: platformSettings?.name, logo: platformSettings?.logo }}
                />
              </div>
            )}
          </div>

          <DialogFooter className="bg-accent/10 p-6 border-t border-accent flex flex-col sm:flex-row gap-3 shrink-0 no-print">
            <Button variant="outline" className="flex-1 rounded-xl font-bold h-12" onClick={() => setViewingDoc(null)}>Close Preview</Button>
            <Button className="flex-1 rounded-xl font-black uppercase text-xs h-12 shadow-lg gap-2" onClick={() => { window.print(); setViewingDoc(null); }}>
              <Printer className="w-4 h-4" /> Print Official Copy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={viewingCertificate} onOpenChange={setViewingCertificate}>
        <DialogContent className="sm:max-w-5xl max-h-[95vh] p-0 border-none shadow-2xl rounded-[2.5rem] overflow-hidden flex flex-col">
          <DialogHeader className="bg-primary p-6 md:p-8 text-white no-print relative shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-white/10 rounded-xl text-secondary"><Trophy className="w-8 h-8" /></div>
                <div>
                  <DialogTitle className="text-xl md:text-2xl font-black uppercase">Honour Roll Certificate</DialogTitle>
                  <DialogDescription className="text-white/60 text-xs">Verified academic achievement for {student.name}.</DialogDescription>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setViewingCertificate(false)} className="text-white hover:bg-white/10"><X className="w-6 h-6" /></Button>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto bg-muted p-2 md:p-10 print:p-0 print:bg-white no-scrollbar">
            <div className="overflow-x-auto rounded-xl border-2 border-primary/10 shadow-inner bg-white">
              <CertificatePreview student={student} platform={platformSettings} />
            </div>
          </div>
          <DialogFooter className="bg-accent/10 p-6 border-t border-accent flex justify-between items-center shrink-0 no-print">
             <div className="flex items-center gap-2 text-muted-foreground">
                <ShieldCheck className="w-4 h-4 text-primary opacity-40" />
                <p className="text-[10px] font-black uppercase italic opacity-40">Digitally Signed Institutional Achievement</p>
             </div>
             <div className="flex gap-2">
                <Button variant="outline" className="rounded-xl h-11 px-6 font-bold text-xs" onClick={() => window.print()}><Printer className="w-4 h-4 mr-2" /> Print</Button>
                <Button className="rounded-xl px-10 h-11 font-black uppercase text-[10px] gap-2 shadow-lg" onClick={() => handleDownload('Honour Roll Certificate')}><Download className="w-4 h-4" /> Download PDF</Button>
             </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LandscapeTranscript({ student, platform }: { student: any, platform: any }) {
  const transcriptRows = student?.transcriptRows || [];
  const schoolLogo = resolveMediaUrl(student?.school?.logo || student?.school?.logo_url || "");
  const schoolName = student?.school?.name || platform?.name || "School";
  const visibleSequences = Array.from(
    new Set(
      transcriptRows.flatMap((row: any) => Object.keys(row.sequences || {}))
    )
  );
  const sequenceHeaders = visibleSequences.length > 0 ? visibleSequences : ["No sequence"];

  return (
    <div className="bg-white p-8 md:p-12 relative overflow-hidden font-serif text-black min-w-[1100px] print:p-0">
      <div className="grid grid-cols-3 gap-4 items-start text-center border-b-2 border-black pb-6">
        <div className="space-y-1 text-[9px] uppercase font-black text-left">
          <p>Republic of Cameroon</p>
          <p>Peace - Work - Fatherland</p>
          <div className="h-px bg-black w-8 my-1" />
          <p>Ministry of Secondary Education</p>
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="w-20 h-20 bg-white flex items-center justify-center p-2 border-2 border-primary/10">
             {schoolLogo ? <img src={schoolLogo} alt={`${schoolName} logo`} className="w-14 h-14 object-contain" /> : null}
          </div>
          <p className="text-[9px] font-black uppercase text-primary tracking-tighter">{schoolName}</p>
        </div>
        <div className="space-y-1 text-[9px] uppercase font-black text-right">
          <p>République du Cameroun</p>
          <p>Paix - Travail - Patrie</p>
          <div className="h-px bg-black w-8 ml-auto my-1" />
          <p>Min. des Enseignements Secondaires</p>
        </div>
      </div>

      <div className="text-center my-10 space-y-2">
        <h1 className="text-4xl font-black uppercase tracking-widest underline underline-offset-8 decoration-double">OFFICIAL TRANSCRIPT</h1>
        <p className="text-sm font-bold opacity-60 italic">Academic Record 2023 / 2024</p>
      </div>

      <div className="grid grid-cols-12 gap-8 bg-accent/5 p-6 border border-black/10 rounded-2xl items-center mb-10 shadow-inner">
        <div className="col-span-3">
           <Avatar className="w-28 h-28 border-4 border-white rounded-[2rem] shadow-xl mx-auto">
              <AvatarImage src={student?.avatar} />
              <AvatarFallback className="text-3xl font-black">{student?.name?.charAt(0)}</AvatarFallback>
           </Avatar>
        </div>
        <div className="col-span-9 grid grid-cols-2 gap-x-12 gap-y-3 text-sm">
          <div className="flex justify-between border-b border-black/5 pb-1"><span className="font-bold uppercase opacity-60 text-[9px]">Identity:</span><span className="font-black uppercase">{student?.name}</span></div>
          <div className="flex justify-between border-b border-black/5 pb-1"><span className="font-bold uppercase opacity-60 text-[9px]">Matricule:</span><span className="font-mono font-bold text-primary">{student?.id}</span></div>
          <div className="flex justify-between border-b border-black/5 pb-1"><span className="font-bold uppercase opacity-60 text-[9px]">Class:</span><span className="font-bold">{student?.class}</span></div>
          <div className="flex justify-between border-b border-black/5 pb-1"><span className="font-bold uppercase opacity-60 text-[9px]">Status:</span><span className="font-bold text-green-600">ENROLLED</span></div>
        </div>
      </div>

      <div className="border-2 border-black overflow-hidden rounded-sm mb-10">
        <Table className="border-collapse">
          <TableHeader className="bg-black/5">
            <TableRow className="border-b-2 border-black h-12">
              <TableHead className="border-r-2 border-black font-black text-black uppercase text-[10px] text-center w-48">Subject</TableHead>
              {sequenceHeaders.map((sequence, i) => (
                <TableHead key={sequence} className={cn("border-r border-black font-black text-black uppercase text-[10px] text-center", i === sequenceHeaders.length - 1 ? "border-r-0" : "")}>
                  {sequence}
                </TableHead>
              ))}
              <TableHead className="font-black text-black uppercase text-[10px] text-center">Decision</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transcriptRows.length > 0 ? transcriptRows.map((row: any, idx: number) => (
              <TableRow key={`${row.subject}-${idx}`} className="border-b border-black last:border-0 h-10">
                <TableCell className="border-r-2 border-black font-black text-[10px] uppercase py-2 pl-4">{row.subject}</TableCell>
                {sequenceHeaders.map((sequence, i) => {
                  const score = row.sequences?.[sequence];
                  return (
                    <TableCell
                      key={`${row.subject}-${sequence}`}
                      className={cn(
                        "border-r border-black text-center text-[10px] font-mono",
                        i === sequenceHeaders.length - 1 ? "border-r-0" : "",
                        score != null && Number(score) < 10 ? "text-red-600" : ""
                      )}
                    >
                      {score != null ? Number(score).toFixed(2) : "---"}
                    </TableCell>
                  );
                })}
                <TableCell className="text-center text-[10px] font-black text-[#264D73]">
                  {Object.values(row.sequences || {}).some((value: any) => Number(value) >= 10) ? "PASSED" : "REVIEW"}
                </TableCell>
              </TableRow>
            )) : (
              <TableRow>
                <TableCell colSpan={sequenceHeaders.length + 2} className="py-10 text-center text-sm text-muted-foreground">
                  No transcript grades are available yet for this learner.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="grid grid-cols-3 gap-10 mt-16 pt-10 border-t-2 border-black/5">
        <div className="flex flex-col items-center gap-4 text-center">
          <QrCode className="w-20 h-20 opacity-10" />
          <p className="text-[8px] font-black uppercase text-muted-foreground opacity-40">Security Scan</p>
        </div>
        <div className="text-center space-y-6 w-48 mx-auto">
          <div className="h-14 w-full bg-accent/10 border-b-2 border-black/40 relative flex items-center justify-center overflow-hidden">
             <SignatureSVG className="w-full h-full text-primary/10 p-2" />
          </div>
          <p className="text-[10px] font-black uppercase text-primary tracking-widest leading-none">The Registrar</p>
        </div>
        <div className="text-center space-y-6">
          <div className="h-14 w-full bg-accent/10 border-b-2 border-black/40 flex items-center justify-center">
             <Badge variant="outline" className="border-black text-[8px] font-black uppercase px-4 py-1">OFFICIAL SEAL</Badge>
          </div>
          <p className="text-[10px] font-black uppercase text-primary tracking-widest leading-none">Institutional Head</p>
        </div>
      </div>
    </div>
  );
}

function PortraitReportCard({ student, platform, term }: { student: any, platform: any, term: string }) {
  const grades = student?.grades || [];
  const totalCoefficient = grades.reduce((sum: number, grade: any) => sum + Number(grade.coef || 0), 0);
  const average = grades.length > 0
    ? grades.reduce((sum: number, grade: any) => sum + Number(grade.average || 0), 0) / grades.length
    : Number(student?.annualAvg || 0);
  const presentDays = Number(student?.attendanceSummary?.present || 0);
  const absentDays = Number(student?.attendanceSummary?.absent || 0);

  return (
    <div className="bg-white p-6 md:p-10 shadow-sm relative flex flex-col space-y-6 font-serif text-black max-w-[800px] mx-auto print:shadow-none print:p-0">
       <div className="grid grid-cols-12 gap-2 items-start text-center border-b border-black pb-4">
          <div className="col-span-4 space-y-0.5 text-[7px] uppercase font-bold text-left">
            <p className="text-[#264D73] font-black">Republic of Cameroon</p>
            <p>Peace - Work - Fatherland</p>
          </div>
          <div className="col-span-4 flex flex-col items-center">
            <div className="w-12 h-12 flex items-center justify-center mb-1">
              {student?.school?.logo ? <img src={student.school.logo} alt="School" className="w-full h-full object-contain" /> : null}
            </div>
          </div>
          <div className="col-span-4 space-y-0.5 text-[7px] uppercase font-bold text-right">
            <p className="text-[#264D73] font-black">République du Cameroun</p>
            <p>Paix - Travail - Patrie</p>
          </div>
       </div>

       <div className="text-center space-y-1">
          <p className="text-[8px] font-black uppercase text-[#264D73]">Ministry of Secondary Education / Ministère de l'Éducation Secondaire</p>
          <div className="h-px bg-[#264D73] w-full my-1 opacity-20" />
          <h2 className="font-black text-xl uppercase text-[#264D73] tracking-tight">{student?.school?.name || "School"}</h2>
          <p className="text-[8px] font-bold italic opacity-60">Report Card: {term}</p>
       </div>

       <div className="grid grid-cols-12 border rounded-xl overflow-hidden mt-4 text-[9px] relative">
          <div className="col-span-9 p-4 grid grid-cols-2 gap-x-8 gap-y-2 border-r bg-accent/5">
            <div className="flex gap-2"><span className="font-bold whitespace-nowrap">Name:</span><span className="border-b border-dotted border-black/40 flex-1 font-black uppercase">{student?.name}</span></div>
            <div className="flex gap-2"><span className="font-bold whitespace-nowrap">Class:</span><span className="border-b border-dotted border-black/40 flex-1 font-bold">{student?.class || "N/A"}</span></div>
            <div className="flex gap-2"><span className="font-bold whitespace-nowrap">Matricule:</span><span className="border-b border-dotted border-black/40 flex-1 font-mono font-bold text-primary">{student?.id}</span></div>
            <div className="flex gap-2"><span className="font-bold whitespace-nowrap">Sex:</span><span className="border-b border-dotted border-black/40 flex-1">Female</span></div>
            <div className="flex gap-2"><span className="font-bold whitespace-nowrap">Date of Birth:</span><span className="border-b border-dotted border-black/40 flex-1">{student?.dob}</span></div>
            <div className="flex gap-2"><span className="font-bold whitespace-nowrap">Parent Contact:</span><span className="border-b border-dotted border-black/40 flex-1">{student?.guardianPhone}</span></div>
          </div>
          <div className="col-span-3 p-2 flex items-center justify-center bg-white">
            <div className="w-20 h-24 border rounded shadow-sm overflow-hidden">
              {student?.avatar ? <img src={student.avatar} alt="Student" className="w-full h-full object-cover" /> : null}
            </div>
          </div>
       </div>

       <div className="mt-6 border border-black rounded-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-[#264D73]">
              <TableRow className="h-8 border-none hover:bg-[#264D73]">
                <TableHead className="text-[8px] font-black uppercase text-white pl-2 border-r border-white/20">Subject</TableHead>
                <TableHead className="text-[8px] font-black uppercase text-white text-center border-r border-white/20">Teacher</TableHead>
                <TableHead className="text-[8px] font-black uppercase text-white text-center border-r border-white/20">Seq 1</TableHead>
                <TableHead className="text-[8px] font-black uppercase text-white text-center border-r border-white/20">Seq 2</TableHead>
                <TableHead className="text-[8px] font-black uppercase text-white text-center border-r border-white/20">Average</TableHead>
                <TableHead className="text-[8px] font-black uppercase text-white text-center border-r border-white/20">Coef</TableHead>
                <TableHead className="text-[8px] font-black uppercase text-white text-center border-r border-white/20">Avg x Coef</TableHead>
                <TableHead className="text-[8px] font-black uppercase text-white text-center pr-2">Rank</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grades.length > 0 ? grades.map((g: any, idx: number) => (
                <TableRow key={idx} className="border-b border-black/10 last:border-0 h-7 hover:bg-accent/5">
                  <TableCell className="pl-2 font-bold text-[8px] uppercase border-r border-black/10">{g.subject}</TableCell>
                  <TableCell className="text-center text-[8px] border-r border-black/10 italic opacity-60">{g.teacher}</TableCell>
                  <TableCell className="text-center text-[8px] border-r border-black/10 font-bold">{g.seq1.toFixed(2)}</TableCell>
                  <TableCell className="text-center text-[8px] border-r border-black/10 font-bold">{g.seq2.toFixed(2)}</TableCell>
                  <TableCell className="text-center text-[8px] border-r border-black/10 font-black text-[#264D73]">{g.average.toFixed(2)}</TableCell>
                  <TableCell className="text-center text-[8px] border-r border-black/10 font-bold">{g.coef}</TableCell>
                  <TableCell className="text-center text-[8px] border-r border-black/10">{g.total.toFixed(2)}</TableCell>
                  <TableCell className="text-center text-[8px] pr-2">{g.rank}</TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-xs text-muted-foreground">
                    No report-card grades are available yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
       </div>

       <div className="grid grid-cols-3 gap-4 mt-6">
          <div className="border border-dotted border-black/40 p-3 rounded-lg space-y-1.5 text-[8px] bg-accent/5">
            <h4 className="font-black text-[#264D73] uppercase border-b border-black/10 mb-1">Statistical Summary</h4>
            <div className="flex justify-between border-b border-dotted border-black/20 pb-0.5"><span className="font-bold">Total Coefficient:</span><span className="font-black">{totalCoefficient}</span></div>
            <div className="flex justify-between border-b border-dotted border-black/20 pb-0.5"><span className="font-bold text-[#264D73]">General Average:</span><span className="font-black text-[#264D73]">{average.toFixed(2)}</span></div>
            <div className="flex justify-between pt-0.5"><span className="font-bold">Position:</span><span className="font-black">{student?.attendanceSummary?.rank || "—"}</span></div>
          </div>

          <div className="border border-dotted border-black/40 p-3 rounded-lg space-y-1.5 text-[8px] bg-accent/5">
            <h4 className="font-black text-[#264D73] uppercase border-b border-black/10 mb-1">Discipline & Presence</h4>
            <div className="flex justify-between border-b border-dotted border-black/20 pb-0.5"><span className="font-bold">Days Present:</span><span className="font-black">{presentDays}</span></div>
            <div className="flex justify-between border-b border-dotted border-black/20 pb-0.5"><span className="font-bold">Days Absent:</span><span className="font-black">{absentDays}</span></div>
            <div className="flex justify-between pt-0.5"><span className="font-bold">Conduct:</span><span className="font-black">{absentDays === 0 ? "Excellent" : "Needs Review"}</span></div>
          </div>

          <div className="space-y-4 flex flex-col justify-end">
            <div className="grid grid-cols-3 gap-2">
               <div className="text-center space-y-1">
                  <div className="h-8 border-b border-black/20 relative flex items-center justify-center">
                    <SignatureSVG className="w-full h-full text-primary/10" />
                  </div>
                  <p className="text-[6px] font-black uppercase text-primary">Parent</p>
               </div>
               <div className="text-center space-y-1">
                  <div className="h-8 border-b border-black/20 relative flex items-center justify-center">
                    <SignatureSVG className="w-full h-full text-primary/10" />
                  </div>
                  <p className="text-[6px] font-black uppercase text-primary">Class Master</p>
               </div>
               <div className="text-center space-y-1">
                  <div className="h-8 border-b border-black/20 relative flex items-center justify-center">
                    <SignatureSVG className="w-full h-full text-primary/10" />
                  </div>
                  <p className="text-[6px] font-black uppercase text-primary">Principal</p>
               </div>
            </div>
            <div className="flex justify-center mt-2">
               <QrCode className="w-8 h-8 opacity-10" />
            </div>
          </div>
       </div>
    </div>
  );
}

function IDCardPreview({ student, platform }: { student: any, platform: any }) {
  const schoolLogo = resolveMediaUrl(student?.school?.logo || student?.school?.logo_url || "");
  const admissionYear = student?.admissionYear || (student?.admissionDate ? String(new Date(student.admissionDate).getFullYear()) : "Pending");
  return (
    <div className="flex flex-col gap-12 items-center">
      <div className="relative group card-container">
        <Card className="w-[450px] h-[280px] border shadow-xl bg-white overflow-hidden relative border-primary/20 flex flex-col">
          <div className="bg-primary p-2 flex items-center justify-between text-white text-[7px] font-black uppercase tracking-tighter shrink-0 border-b border-white/10">
            <div className="text-left leading-none space-y-0.5">
              <p>Republic of Cameroon</p>
              <p>Peace - Work - Fatherland</p>
            </div>
            <div className="flex gap-1 h-3">
              <div className="w-2 h-full bg-[#007a5e]" />
              <div className="w-2 h-full bg-[#ce1126] flex items-center justify-center"><div className="w-0.5 h-0.5 bg-yellow-400 rounded-full" /></div>
              <div className="w-2 h-full bg-[#fcd116]" />
            </div>
            <div className="text-right leading-none space-y-0.5">
              <p>République du Cameroun</p>
              <p>Paix - Travail - Patrie</p>
            </div>
          </div>

          <div className="p-3 border-b border-accent flex items-center gap-3 bg-accent/5 shrink-0">
            <div className="w-12 h-12 bg-white rounded-lg p-1 border shadow-sm flex items-center justify-center shrink-0 overflow-hidden">
              {schoolLogo ? <img src={schoolLogo} alt="School Logo" className="w-full h-full object-contain" /> : null}
            </div>
            <div className="flex-1">
              <p className="text-[8px] font-black uppercase text-muted-foreground leading-none mb-0.5">Ministry of Secondary Education</p>
              <h3 className="text-xs font-black uppercase text-primary leading-tight">
                {student?.school?.name || "School"}
              </h3>
              <p className="text-[7px] font-bold text-muted-foreground italic">"Discipline - Work - Success"</p>
            </div>
          </div>

          <div className="flex-1 p-4 flex gap-6 relative">
            <div className="w-28 h-28 rounded-xl border-2 border-primary/10 overflow-hidden shadow-lg shrink-0 bg-accent/5">
              {student?.avatar ? <img src={student.avatar} alt={student?.name} className="w-full h-full object-cover" /> : null}
            </div>
            <div className="flex-1 flex flex-col justify-center gap-3">
              <div className="space-y-0.5">
                <p className="text-[7px] uppercase font-black text-muted-foreground tracking-widest">Full Name / Nom Complet</p>
                <p className="text-sm font-black text-primary uppercase leading-tight">{student?.name}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-0.5">
                  <p className="text-[7px] uppercase font-black text-muted-foreground tracking-widest">Matricule</p>
                  <p className="text-sm font-mono font-black text-secondary">{student?.id}</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[7px] uppercase font-black text-muted-foreground tracking-widest">Class / Classe</p>
                  <p className="text-xs font-black text-primary">{student?.class || "N/A"}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-primary/5 p-2 flex justify-between items-center border-t border-accent shrink-0">
            <div className="px-3 py-1 bg-primary text-white rounded-md text-[9px] font-black tracking-widest">
              STUDENT ID CARD
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[8px] font-black text-muted-foreground uppercase">Admission Year</span>
              <Badge className="bg-secondary text-primary border-none text-[9px] font-black h-5">{admissionYear}</Badge>
            </div>
          </div>
        </Card>
        <p className="text-center text-[10px] font-black uppercase text-muted-foreground mt-2 tracking-[0.2em]">Front Side</p>
      </div>

      <div className="relative card-container">
        <Card className="w-[450px] h-[280px] border shadow-xl bg-white overflow-hidden relative border-primary/20 flex flex-col">
          <div className="bg-primary h-1 w-full shrink-0" />
          <div className="flex-1 p-6 flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="space-y-1">
                  <p className="text-[7px] uppercase font-black text-muted-foreground tracking-widest">Guardian / Tuteur</p>
                  <div className="h-10 bg-accent/30 border-none rounded-xl font-bold flex items-center px-4 text-sm text-primary">{student?.guardian || "Pending"}</div>
                  <p className="text-[10px] font-black text-secondary flex items-center gap-1"><Phone className="w-2.5 h-2.5" /> {student?.guardianPhone || "Pending"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[7px] uppercase font-black text-muted-foreground tracking-widest">Date of Birth / Né(e) le</p>
                  <p className="text-[10px] font-bold text-primary">{student?.dob || "Pending"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[7px] uppercase font-black text-muted-foreground tracking-widest">Residential Address / Adresse</p>
                  <p className="text-[9px] font-medium text-muted-foreground leading-tight">{student?.address || "Pending"}</p>
                </div>
              </div>
              <div className="flex flex-col items-center justify-center gap-4 text-center border-l border-accent pl-8">
                <div className="p-2 bg-white border-2 border-accent rounded-xl shadow-inner">
                  <QrCode className="w-20 h-20 text-primary" />
                </div>
                <p className="text-[7px] font-black text-muted-foreground uppercase leading-tight tracking-widest">
                  Secure Scan<br/>Verification
                </p>
              </div>
            </div>
            <div className="mt-auto flex justify-between items-end border-t border-accent/50 pt-4">
              <div className="text-[8px] max-w-[200px] leading-relaxed text-muted-foreground font-medium">
                <p className="font-black text-[7px] uppercase text-primary mb-1">Notice</p>
                This card is property of the school. If found, return to the administration.
              </div>
              <div className="text-center space-y-1 relative">
                <div className="h-px bg-primary/20 w-24 mx-auto mb-1" />
                <p className="text-[8px] font-black text-primary uppercase">The Principal</p>
              </div>
            </div>
          </div>
          <div className="bg-accent/20 p-2 px-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              {platform.logo ? <img src={platform.logo} alt="EduIgnite" className="w-4 h-4 object-contain rounded-sm" /> : null}
              <p className="text-[7px] font-black text-primary uppercase tracking-widest">
                Powered by {platform.name} SaaS
              </p>
            </div>
            <span className="text-[6px] text-muted-foreground font-bold italic">Secure Node Registry</span>
          </div>
        </Card>
        <p className="text-center text-[10px] font-black uppercase text-muted-foreground mt-2 tracking-[0.2em]">Back Side</p>
      </div>
    </div>
  );
}

function CertificatePreview({ student, platform }: { student: any, platform: any }) {
  const date = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  const schoolName = student?.school?.name || "School";
  const schoolLogo = resolveMediaUrl(student?.school?.logo || "");
  const schoolMatricule = student?.school?.matricule || student?.school?.short_name || "SCHOOL";
  const serial = `${schoolMatricule}-HONOUR-${String(student?.id || "STUDENT").replace(/[^A-Za-z0-9]+/g, "").toUpperCase()}-${new Date().getFullYear()}`;
  const termNumber = "Third Term (Annual)";

  return (
    <div id="honour-roll-print" className="bg-white p-12 md:p-24 border-[16px] border-double border-[#264D73]/20 shadow-2xl w-[1100px] md:w-full max-w-5xl mx-auto font-serif text-black relative overflow-hidden print:border-none print:shadow-none print:w-full">
      <div className="absolute top-0 left-0 p-8 opacity-40"><LaurelCorner className="w-24 h-24 text-[#264D73]" /></div>
      <div className="absolute top-0 right-0 p-8 opacity-40 rotate-90"><LaurelCorner className="w-24 h-24 text-[#264D73]" /></div>
      <div className="absolute bottom-0 left-0 p-8 opacity-40 -rotate-90"><LaurelCorner className="w-24 h-24 text-[#264D73]" /></div>
      <div className="absolute bottom-0 right-0 p-8 opacity-40 rotate-180"><LaurelCorner className="w-24 h-24 text-[#264D73]" /></div>
      
      <div className="absolute inset-6 border border-[#264D73]/10 pointer-events-none" />
      
      <div className="relative z-10 space-y-12">
        <div className="grid grid-cols-3 gap-4 items-center text-center">
          <div className="space-y-1 text-[8px] uppercase font-black text-left">
            <p className="text-[#264D73]">Republic of Cameroon</p>
            <p>Peace - Work - Fatherland</p>
            <div className="h-px bg-black w-10 my-1" />
            <p>Ministry of Secondary Education</p>
          </div>
          <div className="flex flex-col items-center">
            <div className="w-24 h-24 bg-white rounded-full shadow-2xl flex items-center justify-center border-[6px] border-[#FCD116] relative mb-2">
               <div className="absolute -bottom-4 bg-[#FCD116] text-[#264D73] px-3 py-0.5 rounded text-[8px] font-black uppercase shadow-sm">EXCELLENCE</div>
               {schoolLogo ? <img src={schoolLogo} alt={`${schoolName} logo`} className="w-16 h-16 object-contain" /> : null}
            </div>
          </div>
          <div className="space-y-1 text-[8px] uppercase font-black text-right">
            <p className="text-[#264D73]">Republique du Cameroun</p>
            <p>Paix - Travail - Patrie</p>
            <div className="h-px bg-black w-10 ml-auto my-1" />
            <p>Min. des Enseignements Secondaires</p>
          </div>
        </div>

        <div className="text-center space-y-4">
          <h2 className="text-[10px] font-black uppercase tracking-[0.5em] text-[#264D73]/60 mb-2">{schoolName}</h2>
          <h1 className="text-6xl md:text-8xl font-black italic text-[#264D73] uppercase tracking-tighter leading-none drop-shadow-sm">Honour Roll</h1>
          <p className="text-2xl md:text-3xl font-bold uppercase tracking-[0.3em] text-[#FCD116] italic drop-shadow-sm">Certificate of Achievement</p>
        </div>

        <div className="text-center space-y-12 py-10">
          <p className="text-xs font-black uppercase tracking-[0.4em] text-[#264D73]/40">THIS SCHOOL-ISSUED ACADEMIC AWARD IS PRESENTED TO:</p>
          
          <div className="space-y-4">
            <h2 className="text-5xl md:text-7xl font-black text-[#264D73] leading-tight uppercase tracking-tight">
              {student?.name}
            </h2>
            <div className="flex items-center justify-center gap-6 pt-4">
               <div className="h-px w-16 bg-[#264D73]/20" />
               <p className="font-mono text-sm md:text-lg font-bold uppercase tracking-widest text-[#264D73]/60">
                 Matricule: <span className="text-[#264D73]">{student?.id}</span> | Class: <span className="text-[#264D73]">{student?.class}</span>
               </p>
               <div className="h-px w-16 bg-[#264D73]/20" />
            </div>
          </div>

          <div className="max-w-2xl mx-auto leading-relaxed text-lg md:text-xl font-medium text-gray-700 italic px-10">
            For demonstrating exceptional academic commitment during the <span className="font-black text-[#264D73]">{termNumber}</span> pedagogical cycle, and achieving a verified annual average of <span className="font-black text-[#264D73] underline decoration-[#FCD116] decoration-4 underline-offset-8">{student?.annualAvg || "0.00"} / 20</span>.
          </div>

          <div className="py-6">
             <p className="text-4xl md:text-5xl font-black text-[#FCD116] font-serif opacity-80 italic transform -rotate-3">Congratulations</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-20 md:gap-40 pt-16 items-end">
          <div className="text-center space-y-6">
            <div className="h-px bg-black/20 w-full" />
            <div className="space-y-1">
              <p className="font-black text-[10px] md:text-xs uppercase tracking-[0.3em] text-[#264D73]">The Principal</p>
              <div className="h-16 w-full relative flex items-center justify-center">
                 <SignatureSVG className="w-full h-full text-[#264D73]/10 p-4" />
                 <div className="absolute inset-0 flex items-center justify-center opacity-5">
                    {schoolLogo ? <img src={schoolLogo} className="w-12 h-12 grayscale" /> : null}
                 </div>
              </div>
            </div>
          </div>
          <div className="text-center space-y-6 relative">
            <div className="absolute top-[-80px] left-1/2 -translate-x-1/2">
              <ShieldCheck className="w-24 h-24 text-[#264D73] opacity-[0.05] rotate-12" />
            </div>
            <div className="h-px bg-black/20 w-full" />
            <div className="space-y-1">
              <p className="font-black text-[10px] md:text-xs uppercase tracking-[0.3em] text-[#264D73]">Institutional Seal</p>
              <p className="font-mono font-black text-[9px] opacity-40">{serial}</p>
            </div>
          </div>
        </div>

        <div className="text-center pt-12 border-t border-black/5 flex flex-col md:flex-row items-center justify-between gap-4">
           <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#264D73] rounded-lg p-2 flex items-center justify-center">
                 {schoolLogo ? <img src={schoolLogo} alt={`${schoolName} logo`} className="w-full h-full object-contain" /> : null}
              </div>
              <p className="text-left text-[8px] md:text-[10px] uppercase font-black text-muted-foreground opacity-30 tracking-[0.2em]">
                {schoolName} Official Academic Registry | School-Issued Honour Roll | {new Date().getFullYear()}
              </p>
           </div>
           <div className="flex items-center gap-4">
              <QrCode className="w-12 h-12 opacity-10" />
              <div className="text-left">
                <p className="text-[7px] font-black uppercase text-[#264D73]/40 leading-none">Date Issued</p>
                <p className="text-[10px] font-bold text-[#264D73]/60">{date}</p>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}

function LaurelCorner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 10 C 20 10, 10 20, 10 40 M10 10 C 10 20, 20 10, 40 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="10" cy="10" r="3" />
      <path d="M15 25 L25 15 M20 35 L35 20 M25 45 L45 25" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.5"/>
    </svg>
  );
}

function SignatureSVG({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 40" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 25C15 25 20 15 25 15C30 15 35 30 40 30C45 30 50 10 55 10C60 10 65 35 70 35C75 35 80 20 85 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function buildStudentDocumentHtml({
  title,
  student,
  platform,
  type,
}: {
  title: string;
  student: any;
  platform: any;
  type: "report" | "id" | "certificate";
}) {
  const grades = (student?.grades || [])
    .map(
      (grade: any) => `
        <tr>
          <td>${escapeHtml(grade.subject)}</td>
          <td>${escapeHtml(Number(grade.seq1 || 0).toFixed(2))}</td>
          <td>${escapeHtml(Number(grade.seq2 || 0).toFixed(2))}</td>
          <td>${escapeHtml(Number(grade.average || 0).toFixed(2))}</td>
        </tr>`
    )
    .join("");

  const identityBlock = `
    <div class="identity">
      ${student?.avatar ? `<img class="avatar" src="${escapeHtml(student.avatar)}" alt="${escapeHtml(student.name)}" />` : ""}
      <div>
        <h1>${escapeHtml(student?.name)}</h1>
        <p><strong>Matricule:</strong> ${escapeHtml(student?.id)}</p>
        <p><strong>Class:</strong> ${escapeHtml(student?.class)}</p>
        <p><strong>Section:</strong> ${escapeHtml(student?.section)}</p>
      </div>
    </div>`;

  const body =
    type === "id"
      ? `
        ${identityBlock}
        <p class="summary">This is the official student identity copy generated from the live registry.</p>`
      : type === "certificate"
        ? `
          ${identityBlock}
          <p class="summary">
            This certifies that <strong>${escapeHtml(student?.name)}</strong> obtained an annual average of
            <strong>${escapeHtml(Number(student?.annualAvg || 0).toFixed(2))} / 20</strong> and qualifies for the honour roll.
          </p>`
        : `
          ${identityBlock}
          <table>
            <thead>
              <tr>
                <th>Subject</th>
                <th>Seq 1</th>
                <th>Seq 2</th>
                <th>Average</th>
              </tr>
            </thead>
            <tbody>
              ${grades || '<tr><td colspan="4">No report-card grades are available yet.</td></tr>'}
            </tbody>
          </table>`;

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(title)}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 32px; color: #14263d; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #14263d; padding-bottom: 16px; margin-bottom: 24px; }
        .logo { max-width: 72px; max-height: 72px; object-fit: contain; }
        .identity { display: flex; gap: 20px; align-items: center; margin-bottom: 24px; background: #f5f8fb; padding: 16px; border-radius: 12px; }
        .avatar { width: 96px; height: 96px; border-radius: 16px; object-fit: cover; background: #edf3f8; }
        .summary { background: #f5f8fb; padding: 16px; border-radius: 12px; line-height: 1.6; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #d8e0e8; padding: 10px; font-size: 12px; text-align: left; }
        th { background: #edf3f8; text-transform: uppercase; font-size: 11px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <p>Republic of Cameroon</p>
          <p>Peace - Work - Fatherland</p>
          <h2>${escapeHtml(title)}</h2>
          <p>${escapeHtml(student?.school?.name || platform?.name || "EduIgnite")}</p>
        </div>
        ${student?.school?.logo ? `<img class="logo" src="${escapeHtml(student.school.logo)}" alt="Institution logo" />` : ""}
      </div>
      ${body}
    </body>
  </html>`;
}
