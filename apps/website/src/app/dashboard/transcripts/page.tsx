"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { gradesService } from "@/lib/api/services/grades.service";
import { buildOfficialTranscriptHtml } from "@/lib/official-transcript";
import { downloadHtmlPagesPdf } from "@/lib/browser-download";
import { useI18n } from "@/lib/i18n-context";
import { useMyClassHistory, useStudents } from "@/lib/hooks/useStudents";
import { useGrades, useSequences } from "@/lib/hooks/useGrades";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileBadge, Search, Download, Printer, ArrowLeft, QrCode, Loader2, X, Eye, Info } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { resolveMediaUrl } from "@/lib/media";

export default function TranscriptsPage() {
  const { user, platformSettings } = useAuth();
  const { language } = useI18n();
  const { toast } = useToast();
  const router = useRouter();

  const [searchTerm, setSearchTerm] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewStudent, setPreviewStudent] = useState<any>(null);
  const isStudent = user?.role === "STUDENT";

  const { data: studentsData } = useStudents({ search: searchTerm || undefined });
  const { data: gradesData } = useGrades({ limit: 500, include_history: true });
  const { data: sequencesData } = useSequences({ limit: 200, include_history: true });
  const classHistoryQuery = useMyClassHistory(isStudent);

  const schoolBrand = useMemo(
    () => ({
      name: user?.school?.name || platformSettings?.name || "School",
      logo: resolveMediaUrl(user?.school?.logo || ""),
      motto: user?.school?.motto || platformSettings?.motto || "",
      matricule: user?.school?.matricule || "",
      location: user?.school?.location || "",
    }),
    [platformSettings?.motto, platformSettings?.name, user?.school?.location, user?.school?.logo, user?.school?.matricule, user?.school?.motto, user?.school?.name]
  );

  const studentList = useMemo(
    () =>
      (studentsData?.results || []).map((student: any) => {
        const userProfile = student.user || {};
        const classObject = typeof student.school_class === "object" && student.school_class ? student.school_class : null;
        const subSchoolObject = classObject?.sub_school || student.sub_school;
        const matricule = userProfile.matricule || student.matricule || student.student_matricule || "";
        const admissionNumber = student.admission_number || student.registration_number || student.admissionNo || "";
        return {
          recordId: student.id,
          id: matricule || admissionNumber || student.id,
          matricule: matricule || "-",
          admissionNumber: admissionNumber || "-",
          name: userProfile.name || student.full_name || student.name || "Unknown",
          class: classObject?.name || student.school_class_name || student.student_class || student.class_name || "Unknown",
          section: subSchoolObject?.name || student.sub_school_name || student.section || "Main School",
          avatar: resolveMediaUrl(userProfile.avatar || student.avatar) || "",
        };
      }),
    [studentsData?.results]
  );

  const gradeRowsByStudent = useMemo(() => {
    const sequenceLookup = new Map(
      (sequencesData?.results || []).map((sequence: any) => [String(sequence.id), sequence])
    );
    const rows = (gradesData?.results || []).reduce((acc: Record<string, any[]>, grade: any) => {
      const studentId = typeof grade.student === "string" ? grade.student : grade.student?.id;
      if (!studentId) return acc;
      if (!acc[studentId]) acc[studentId] = [];
      const sequenceId = typeof grade.sequence === "string" ? grade.sequence : grade.sequence?.id;
      const sequence = typeof grade.sequence === "object" && grade.sequence ? grade.sequence : sequenceLookup.get(String(sequenceId));

      acc[studentId].push({
        id: grade.id,
        subject: grade.subject?.name || grade.subject_name || "Subject",
        subjectCode: grade.subject?.code || grade.subject_code || "",
        sequence: sequence?.name || grade.sequence_name || "Sequence",
        term: sequence?.term || grade.term || null,
        academicYear: sequence?.academic_year || grade.academic_year || "",
        className: grade.school_class_name || grade.class_name_snapshot || "",
        coefficient: Number(grade.coefficient || grade.subject?.coefficient || 1),
        score: grade.score,
        gradeLetter: grade.grade_letter || grade.grade || "",
        teacher: grade.teacher_name || grade.teacher?.name || "",
        comment: grade.comment || "",
      });

      return acc;
    }, {});

    Object.values(rows).forEach((studentRows) => {
      studentRows.sort((a, b) => `${a.subject}${a.sequence}`.localeCompare(`${b.subject}${b.sequence}`));
    });

    return rows;
  }, [gradesData?.results, sequencesData?.results]);

  const buildTranscriptStudent = (student: any) => ({
    ...student,
    grades: gradeRowsByStudent[student.recordId] || [],
  });

  const availableClasses = useMemo(
    () => Array.from(new Set(studentList.map((student: any) => student.class).filter(Boolean))).sort(),
    [studentList]
  );

  const availableSections = useMemo(
    () => Array.from(new Set(studentList.map((student: any) => student.section).filter(Boolean))).sort(),
    [studentList]
  );

  const filteredStudents = useMemo(
    () =>
      studentList.filter((student: any) => {
        const matchesSearch =
          student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          student.id.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesClass = classFilter === "all" || student.class === classFilter;
        const matchesSection = sectionFilter === "all" || student.section === sectionFilter;
        return matchesSearch && matchesClass && matchesSection;
      }),
    [studentList, searchTerm, classFilter, sectionFilter]
  );

  // The official transcript uses the real multi-year record computed by the
  // school platform (every class level, every term, both cycles) — the same
  // data and design on screen and in the downloaded PDF.
  const fetchTranscriptData = async (student: any) => {
    const params = !isStudent && (student?.recordId || student?.id)
      ? { student_id: String(student.recordId || student.id) }
      : undefined;
    return gradesService.getTranscript(params);
  };

  const [previewTranscriptHtml, setPreviewTranscriptHtml] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  useEffect(() => {
    if (!previewStudent) { setPreviewTranscriptHtml(""); return; }
    let alive = true;
    setPreviewLoading(true);
    fetchTranscriptData(previewStudent)
      .then((data) => { if (alive) setPreviewTranscriptHtml(buildOfficialTranscriptHtml(data)); })
      .catch(() => { if (alive) setPreviewTranscriptHtml(""); })
      .finally(() => { if (alive) setPreviewLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewStudent]);

  const downloadTranscript = async (student: any) => {
    const safeName = `${student.name || "student"}_official_transcript`.replace(/\s+/g, "_").toLowerCase();
    const data = await fetchTranscriptData(student);
    await downloadHtmlPagesPdf([buildOfficialTranscriptHtml(data)], safeName, { landscape: true });
  };

  const handleBulkIssue = async () => {
    if (!filteredStudents.length) return;

    setIsProcessing(true);
    try {
      const batchLabel = classFilter !== "all" ? classFilter : sectionFilter !== "all" ? sectionFilter : "school";
      const htmls: string[] = [];
      for (const student of filteredStudents) {
        try {
          const data = await fetchTranscriptData(student);
          htmls.push(buildOfficialTranscriptHtml(data));
        } catch {
          /* skip students whose transcript cannot be generated */
        }
      }
      if (!htmls.length) throw new Error("No transcripts could be generated.");
      await downloadHtmlPagesPdf(htmls, `${batchLabel.replace(/\s+/g, "_").toLowerCase()}_transcripts`, { landscape: true });
      toast({ title: "Batch ready", description: `Downloaded ${htmls.length} official transcript(s) — one per page.` });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Batch failed", description: error?.message || "The transcripts could not be generated." });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleIndividualIssue = async (student: any) => {
    setIsProcessing(true);
    try {
      await downloadTranscript(buildTranscriptStudent(student));
      toast({ title: "Transcript ready", description: `Downloaded the official PDF record for ${student.name}.` });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Transcript failed", description: error?.message || "The transcript could not be generated." });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full hover:bg-white shadow-sm shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-primary font-headline flex items-center gap-3">
              <div className="p-2 bg-primary rounded-xl shadow-lg">
                <FileBadge className="w-6 h-6 text-secondary" />
              </div>
              {isStudent ? "My Transcript" : language === "en" ? "Transcripts Registry" : "Gestion des Releves"}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {isStudent
                ? "View and download your official transcript once your school has published grade records."
                : "Issue official transcript exports from the live grade registry."}
            </p>
          </div>
        </div>

        {!isStudent ? (
          <Button
            className="gap-2 shadow-lg h-12 px-8 rounded-2xl bg-primary text-white font-black uppercase tracking-widest text-[9px] md:text-[10px] w-full md:w-auto"
            onClick={handleBulkIssue}
            disabled={isProcessing || filteredStudents.length === 0}
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Issue Batch ({filteredStudents.length})
          </Button>
        ) : null}
      </div>

      <Card className="border-none shadow-xl overflow-hidden rounded-[2.5rem] bg-white">
        <CardHeader className="bg-white border-b p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative col-span-1 md:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search name or matricule..."
                className="pl-10 h-12 bg-accent/20 border-none rounded-xl text-sm"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-2 col-span-1 md:col-span-2">
              <Select value={sectionFilter} onValueChange={setSectionFilter}>
                <SelectTrigger className="flex-1 h-12 bg-accent/20 border-none rounded-xl font-bold text-xs">
                  <SelectValue placeholder="All Sections" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Whole Node</SelectItem>
                  {availableSections.map((section) => (
                    <SelectItem key={section} value={section}>
                      {section}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={classFilter} onValueChange={setClassFilter}>
                <SelectTrigger className="flex-1 h-12 bg-accent/20 border-none rounded-xl font-bold text-xs">
                  <SelectValue placeholder="All Classes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Entire School</SelectItem>
                  {availableClasses.map((className) => (
                    <SelectItem key={className} value={className}>
                      {className}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader className="bg-accent/10">
              <TableRow className="uppercase text-[9px] font-black tracking-widest border-b border-accent/20">
                <TableHead className="pl-8 py-4">Matricule</TableHead>
                <TableHead>Student Profile</TableHead>
                <TableHead className="hidden md:table-cell">Class</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right pr-8">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredStudents.map((student) => (
                <TableRow key={student.id} className="hover:bg-accent/5 transition-colors border-b border-accent/10 h-16">
                  <TableCell className="pl-8 font-mono text-[10px] font-bold text-primary">{student.id}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9 border shrink-0">
                        <AvatarImage src={student.avatar} />
                        <AvatarFallback className="bg-primary/5 text-primary text-[10px] font-bold">{student.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="font-bold text-xs md:text-sm text-primary uppercase leading-none">{student.name}</span>
                        <span className="text-[8px] font-black uppercase text-muted-foreground md:hidden">{student.class}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant="outline" className="text-[9px] border-primary/10 text-primary font-bold">
                      {student.class}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge className={`${gradeRowsByStudent[student.recordId]?.length ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"} border-none text-[8px] font-black`}>
                      {gradeRowsByStudent[student.recordId]?.length ? "PUBLISHED" : "PENDING"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right pr-8">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-primary/5" onClick={() => setPreviewStudent(buildTranscriptStudent(student))}>
                        <Eye className="w-4 h-4 text-primary/60" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-primary/5" onClick={() => handleIndividualIssue(student)}>
                        <Download className="w-4 h-4 text-primary/60" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!filteredStudents.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-20 text-center text-sm text-muted-foreground">
                    No students match the current transcript filters.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!previewStudent} onOpenChange={() => setPreviewStudent(null)}>
        <DialogContent className="sm:max-w-6xl max-h-[95vh] p-0 border-none shadow-2xl rounded-[2.5rem] overflow-hidden flex flex-col">
          <DialogHeader className="bg-primary p-6 md:p-8 text-white relative shrink-0 no-print">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-white/10 rounded-xl text-secondary">
                  <FileBadge className="w-8 h-8" />
                </div>
                <div>
                  <DialogTitle className="text-xl md:text-2xl font-black uppercase">Transcript Preview</DialogTitle>
                  <DialogDescription className="text-white/60 text-xs">Official academic record for {previewStudent?.name}.</DialogDescription>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setPreviewStudent(null)} className="text-white hover:bg-white/10">
                <X className="w-6 h-6" />
              </Button>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto bg-muted p-2 md:p-10 print:p-0 print:bg-white no-scrollbar">
            <div className="overflow-x-auto rounded-xl border-2 border-primary/10 shadow-inner bg-white">
              {previewLoading ? (
                <div className="flex items-center justify-center gap-3 py-20">
                  <Loader2 className="h-6 w-6 animate-spin text-primary/40" />
                  <span className="text-sm text-muted-foreground">Compiling the official transcript...</span>
                </div>
              ) : previewTranscriptHtml ? (
                <div dangerouslySetInnerHTML={{ __html: previewTranscriptHtml }} />
              ) : (
                <p className="py-20 text-center text-sm text-muted-foreground">The transcript could not be loaded. Please try again.</p>
              )}
            </div>
          </div>
          <DialogFooter className="bg-accent/10 p-6 border-t border-accent flex justify-between items-center shrink-0 no-print">
            <div className="hidden sm:flex items-center gap-2 text-muted-foreground italic">
              <Info className="w-4 h-4 text-primary opacity-40" />
              <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Records up to current session are included.</p>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button variant="outline" className="flex-1 sm:flex-none rounded-xl h-11 px-6 font-bold text-xs" onClick={() => window.print()}>
                <Printer className="w-4 h-4 mr-2" /> Print
              </Button>
              <Button
                onClick={() => previewStudent && void downloadTranscript(previewStudent)}
                className="flex-1 sm:flex-none rounded-xl px-10 h-11 font-black uppercase text-[9px] bg-primary text-white"
              >
                Issue Official Copy
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type TranscriptPdfContext = {
  schoolName: string;
  schoolLogo?: string;
  schoolMotto?: string;
  schoolMatricule?: string;
  schoolLocation?: string;
  currentClass?: string;
  historyRecords?: any[];
  filename: string;
};

function transcriptGradeFromScore(score: number) {
  if (score >= 16) return "A";
  if (score >= 14) return "B";
  if (score >= 12) return "C";
  if (score >= 10) return "D";
  return "F";
}

function transcriptRemark(score: number) {
  if (score >= 16) return "Excellent";
  if (score >= 14) return "Very Good";
  if (score >= 12) return "Good";
  if (score >= 10) return "Pass";
  return "Needs Improvement";
}

function formatTermLabel(term: unknown) {
  const value = String(term || "").trim();
  if (!value) return "Term not set";
  const lower = value.toLowerCase();
  if (lower.includes("first") || lower === "1" || lower === "term 1") return "First Term";
  if (lower.includes("second") || lower === "2" || lower === "term 2") return "Second Term";
  if (lower.includes("third") || lower === "3" || lower === "term 3") return "Third Term";
  return value.includes("Term") ? value : `${value} Term`;
}

function termSortValue(term: string) {
  const lower = term.toLowerCase();
  if (lower.includes("first")) return 1;
  if (lower.includes("second")) return 2;
  if (lower.includes("third")) return 3;
  return 99;
}

function sequenceSortValue(sequence: unknown) {
  const match = String(sequence || "").match(/\d+/);
  return match ? Number(match[0]) : 99;
}

function weightedAverage(rows: any[]) {
  let weighted = 0;
  let coefficients = 0;
  rows.forEach((grade) => {
    const score = Number(grade.score);
    if (!Number.isFinite(score)) return;
    const coefficient = Number(grade.coefficient || 1) || 1;
    weighted += score * coefficient;
    coefficients += coefficient;
  });
  return coefficients ? weighted / coefficients : 0;
}

function buildTranscriptGroups(student: any, historyRecords: any[] = []) {
  const groups = new Map<string, { academicYear: string; className: string; grades: any[]; archivedAverage?: number }>();

  (student?.grades || []).forEach((grade: any) => {
    const academicYear = grade.academicYear || "Academic Year Not Set";
    const className = grade.className || student?.class || "Class Not Set";
    const key = `${academicYear}::${className}`;
    const existing = groups.get(key) || { academicYear, className, grades: [] };
    existing.grades.push(grade);
    groups.set(key, existing);
  });

  historyRecords.forEach((record) => {
    const academicYear = record.academic_year || record.academicYear || "Archived Academic Year";
    const className = record.class_name || record.className || "Archived Class";
    const key = `${academicYear}::${className}`;
    if (!groups.has(key)) {
      groups.set(key, {
        academicYear,
        className,
        grades: [],
        archivedAverage: Number(record.annual_average || record.annualAverage || 0) || undefined,
      });
    }
  });

  return Array.from(groups.values())
    .map((group) => {
      const termMap = new Map<string, any[]>();
      group.grades.forEach((grade) => {
        const term = formatTermLabel(grade.term);
        const rows = termMap.get(term) || [];
        rows.push(grade);
        termMap.set(term, rows);
      });
      const terms = Array.from(termMap.entries())
        .map(([term, rows]) => ({
          term,
          rows: rows
            .slice()
            .sort((a, b) => sequenceSortValue(a.sequence) - sequenceSortValue(b.sequence) || String(a.subject || "").localeCompare(String(b.subject || ""))),
          sequences: Array.from(new Set(rows.map((row) => row.sequence || "Sequence not set"))).sort((a, b) => sequenceSortValue(a) - sequenceSortValue(b)),
          average: weightedAverage(rows),
        }))
        .sort((a, b) => termSortValue(a.term) - termSortValue(b.term));
      const average = group.grades.length ? weightedAverage(group.grades) : group.archivedAverage || 0;
      return {
        ...group,
        terms,
        average,
        decision: average >= 10 ? "Passed / Eligible" : average > 0 ? "Requires Review" : "Pending Publication",
      };
    })
    .sort((a, b) => `${a.academicYear}${a.className}`.localeCompare(`${b.academicYear}${b.className}`));
}

async function loadPdfImage(url?: string): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("data:image/")) return url;
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result));
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function addPdfImage(doc: any, dataUrl: string | null, x: number, y: number, width: number, height: number) {
  if (!dataUrl) return;
  const format = dataUrl.includes("image/png") ? "PNG" : dataUrl.includes("image/webp") ? "WEBP" : "JPEG";
  try {
    doc.addImage(dataUrl, format, x, y, width, height);
  } catch {
    // External images may fail due to CORS; the document remains valid without the logo.
  }
}

async function drawTranscriptPdfPage(doc: any, autoTable: any, student: any, context: TranscriptPdfContext, isFirstPage: boolean) {
  if (!isFirstPage) doc.addPage("a4", "landscape");
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const primary = "#1a3c6e";
  const logo = await loadPdfImage(context.schoolLogo);
  const generatedAt = new Date().toLocaleDateString();
  const grades = student?.grades || [];
  const transcriptGroups = buildTranscriptGroups(student, context.historyRecords || []);
  const summaryRows = transcriptGroups.map((group) => [
    group.academicYear,
    group.className,
    group.grades.length ? String(group.grades.length) : "Archived",
    group.average ? group.average.toFixed(2) : "Pending",
    group.decision,
  ]);
  const termRows = transcriptGroups.flatMap((group) =>
    group.terms.length
      ? group.terms.map((term) => [
          group.academicYear,
          group.className,
          term.term,
          term.sequences.join(", "),
          String(term.rows.length),
          term.average ? term.average.toFixed(2) : "Pending",
          term.average >= 10 ? "Pass" : term.average > 0 ? "Weak" : "Pending",
        ])
      : [[group.academicYear, group.className, "No term records", "-", "0", group.average ? group.average.toFixed(2) : "Pending", group.decision]]
  );
  const gradeRows = grades.length
    ? grades
        .slice()
        .sort((a: any, b: any) => `${a.academicYear}${a.className}${a.term}${a.sequence}${a.subject}`.localeCompare(`${b.academicYear}${b.className}${b.term}${b.sequence}${b.subject}`))
        .map((grade: any) => {
          const score = Number(grade.score || 0);
          return [
            grade.academicYear || "-",
            grade.className || student?.class || "-",
            formatTermLabel(grade.term),
            grade.sequence || "-",
            grade.subject || "-",
            grade.subjectCode || "-",
            Number(grade.coefficient || 1).toFixed(0),
            score.toFixed(2),
            grade.gradeLetter || transcriptGradeFromScore(score),
            grade.teacher || "-",
            grade.comment || transcriptRemark(score),
          ];
        })
    : [["-", student?.class || "-", "-", "-", "No published grade records yet", "-", "-", "-", "-", "-", "-"]];

  doc.setFillColor(245, 248, 252);
  doc.rect(0, 0, pageWidth, pageHeight, "F");
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(22, 18, pageWidth - 44, pageHeight - 36, 6, 6, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor("#111827");
  doc.text("REPUBLIC OF CAMEROON", 34, 34);
  doc.setFont("helvetica", "normal");
  doc.text("Peace - Work - Fatherland", 34, 45);
  doc.text("Ministry of Secondary Education", 34, 56);
  doc.setFont("helvetica", "bold");
  doc.text("REPUBLIQUE DU CAMEROUN", pageWidth - 34, 34, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.text("Paix - Travail - Patrie", pageWidth - 34, 45, { align: "right" });
  doc.text("Ministere des Enseignements Secondaires", pageWidth - 34, 56, { align: "right" });

  addPdfImage(doc, logo, pageWidth / 2 - 18, 28, 36, 36);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(primary);
  doc.text(context.schoolName || "School", pageWidth / 2, 78, { align: "center" });
  doc.setFont("times", "italic");
  doc.setFontSize(9);
  doc.setTextColor("#64748b");
  doc.text(context.schoolMotto || context.schoolLocation || "Official academic record", pageWidth / 2, 90, { align: "center" });
  doc.setDrawColor(primary);
  doc.setLineWidth(1.2);
  doc.line(34, 100, pageWidth - 34, 100);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(primary);
  doc.text("OFFICIAL STUDENT TRANSCRIPT", pageWidth / 2, 122, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor("#475569");
  doc.text("Cameroon secondary education scale: 0-20, pass mark: 10/20, class rank and promotion decisions issued by the school.", pageWidth / 2, 136, { align: "center" });

  autoTable(doc, {
    startY: 150,
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: primary, textColor: 255, fontStyle: "bold" },
    body: [
      ["Student", student?.name || "-", "Matricule", student?.matricule || student?.id || "-", "Admission No.", student?.admissionNumber || "-"],
      ["Current Class", context.currentClass || student?.class || "-", "Section", student?.section || "-", "Generated", generatedAt],
      ["School Matricule", context.schoolMatricule || "-", "Status", "Current class account plus archived academic record", "System", "EduIgnite"],
    ],
  });

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 10,
    head: [["Academic Year", "Class", "Recorded Marks", "Average /20", "Decision"]],
    body: summaryRows.length ? summaryRows : [["-", student?.class || "-", "0", "Pending", "Pending publication"]],
    theme: "striped",
    styles: { font: "helvetica", fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: primary, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 248, 252] },
  });

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 10,
    head: [["Academic Year", "Class", "Term", "Sequences", "Marks", "Term Avg /20", "Term Status"]],
    body: termRows.length ? termRows : [["-", student?.class || "-", "-", "-", "0", "Pending", "Pending publication"]],
    theme: "striped",
    styles: { font: "helvetica", fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: primary, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 248, 252] },
  });

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 10,
    head: [["Year", "Class", "Term", "Sequence", "Subject", "Code", "Coef.", "Mark /20", "Grade", "Teacher", "Remark"]],
    body: gradeRows,
    theme: "grid",
    styles: { font: "helvetica", fontSize: 7, cellPadding: 3, overflow: "linebreak" },
    headStyles: { fillColor: primary, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      4: { cellWidth: 42 },
      9: { cellWidth: 34 },
      10: { cellWidth: 38 },
    },
    didDrawPage: (data: any) => {
      doc.setFontSize(7);
      doc.setTextColor("#64748b");
      doc.text("Issued by the school from EduIgnite live records. Verify with the school administration for official use.", pageWidth / 2, pageHeight - 18, { align: "center" });
      doc.text(`Page ${data.pageNumber}`, pageWidth - 34, pageHeight - 18, { align: "right" });
    },
  });

  const signY = Math.min((doc as any).lastAutoTable.finalY + 20, pageHeight - 42);
  doc.setDrawColor("#94a3b8");
  doc.line(44, signY, 118, signY);
  doc.line(pageWidth / 2 - 36, signY, pageWidth / 2 + 36, signY);
  doc.line(pageWidth - 118, signY, pageWidth - 44, signY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(primary);
  doc.text("Registrar", 81, signY + 10, { align: "center" });
  doc.text("School Seal", pageWidth / 2, signY + 10, { align: "center" });
  doc.text("Principal", pageWidth - 81, signY + 10, { align: "center" });
}

async function downloadOfficialTranscriptPdf(student: any, context: TranscriptPdfContext) {
  const [{ default: jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = (autoTableModule as any).default ?? autoTableModule;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4", compress: true });
  await drawTranscriptPdfPage(doc, autoTable, student, context, true);
  doc.save(context.filename);
}

async function downloadTranscriptBatchPdf(students: any[], context: Omit<TranscriptPdfContext, "currentClass" | "historyRecords">) {
  const [{ default: jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = (autoTableModule as any).default ?? autoTableModule;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4", compress: true });
  for (const [index, student] of students.entries()) {
    await drawTranscriptPdfPage(doc, autoTable, student, { ...context, currentClass: student.class, filename: context.filename }, index === 0);
  }
  doc.save(context.filename);
}

function LandscapeTranscript({ student, school, historyRecords = [] }: { student: any; school: any; historyRecords?: any[] }) {
  const transcriptGroups = buildTranscriptGroups(student, historyRecords);
  const gradeRows = student?.grades || [];
  const academicYears = transcriptGroups.map((group) => group.academicYear).filter(Boolean);
  const academicYearLabel = academicYears.length
    ? `${academicYears[0]}${academicYears.length > 1 ? ` - ${academicYears[academicYears.length - 1]}` : ""}`
    : "Academic year pending";
  const currentAverage = weightedAverage(gradeRows);

  return (
    <div className="bg-white p-8 md:p-12 relative overflow-hidden font-serif text-black min-w-[1100px] print:p-0">
      <div className="grid grid-cols-3 gap-4 items-start text-center border-b-2 border-black pb-6">
        <div className="space-y-1 text-[9px] uppercase font-black text-left">
          <p>Republic of Cameroon</p>
          <p>Peace - Work - Fatherland</p>
          <div className="h-px bg-black w-8 my-1" />
          <p>Ministry of Secondary Education</p>
          <p>{school?.location || "Regional Delegation"}</p>
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="w-20 h-20 bg-white flex items-center justify-center p-2 border-2 border-primary/10">
            {school?.logo ? <img src={school.logo} alt="School logo" className="w-14 h-14 object-contain" /> : null}
          </div>
          <p className="text-[9px] font-black uppercase text-primary tracking-tighter">{school?.name || "School"}</p>
          {school?.matricule ? <p className="text-[8px] font-black uppercase text-muted-foreground">Matricule: {school.matricule}</p> : null}
        </div>
        <div className="space-y-1 text-[9px] uppercase font-black text-right">
          <p>Republique du Cameroun</p>
          <p>Paix - Travail - Patrie</p>
          <div className="h-px bg-black w-8 ml-auto my-1" />
          <p>Min. des Enseignements Secondaires</p>
        </div>
      </div>

      <div className="text-center my-10 space-y-2">
        <h1 className="text-4xl font-black uppercase tracking-widest underline underline-offset-8 decoration-double">OFFICIAL TRANSCRIPT</h1>
        <p className="text-sm font-bold opacity-60 italic">Cumulative Secondary School Academic Record: {academicYearLabel}</p>
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
          <div className="flex justify-between border-b border-black/5 pb-1"><span className="font-bold uppercase opacity-60 text-[9px]">Matricule:</span><span className="font-mono font-bold text-primary">{student?.matricule || student?.id}</span></div>
          <div className="flex justify-between border-b border-black/5 pb-1"><span className="font-bold uppercase opacity-60 text-[9px]">Class:</span><span className="font-bold">{student?.class}</span></div>
          <div className="flex justify-between border-b border-black/5 pb-1"><span className="font-bold uppercase opacity-60 text-[9px]">Admission No.:</span><span className="font-bold">{student?.admissionNumber || "-"}</span></div>
          <div className="flex justify-between border-b border-black/5 pb-1"><span className="font-bold uppercase opacity-60 text-[9px]">Section:</span><span className="font-bold">{student?.section || "Main School"}</span></div>
          <div className="flex justify-between border-b border-black/5 pb-1"><span className="font-bold uppercase opacity-60 text-[9px]">Current Avg.:</span><span className={`font-bold ${currentAverage >= 10 ? "text-green-700" : "text-amber-700"}`}>{currentAverage ? currentAverage.toFixed(2) : "Pending"} /20</span></div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        {transcriptGroups.length ? (
          transcriptGroups.map((group) => (
            <div key={`${group.academicYear}-${group.className}`} className="rounded-xl border-2 border-black/10 p-4">
              <p className="text-[8px] font-black uppercase tracking-widest opacity-60">{group.academicYear}</p>
              <p className="mt-1 text-sm font-black uppercase text-primary">{group.className}</p>
              <div className="mt-3 flex items-center justify-between text-[10px] font-bold">
                <span>{group.grades.length ? `${group.grades.length} marks` : "Archived record"}</span>
                <span className={group.average >= 10 ? "text-green-700" : "text-amber-700"}>{group.average ? group.average.toFixed(2) : "Pending"} /20</span>
              </div>
              <p className="mt-2 text-[8px] font-black uppercase text-muted-foreground">{group.decision}</p>
            </div>
          ))
        ) : (
          <div className="col-span-3 rounded-xl border-2 border-dashed border-black/10 p-6 text-center text-[10px] font-black uppercase text-muted-foreground">
            No transcript summary can be calculated until marks are published.
          </div>
        )}
      </div>

      <div className="border-2 border-black overflow-hidden rounded-sm mb-10">
        <Table className="border-collapse">
          <TableHeader className="bg-black/5">
            <TableRow className="border-b-2 border-black h-12">
              <TableHead className="border-r-2 border-black font-black text-black uppercase text-[10px] text-center">Academic Year</TableHead>
              <TableHead className="border-r border-black font-black text-black uppercase text-[10px] text-center">Class</TableHead>
              <TableHead className="border-r border-black font-black text-black uppercase text-[10px] text-center">Term</TableHead>
              <TableHead className="border-r border-black font-black text-black uppercase text-[10px] text-center">Sequences</TableHead>
              <TableHead className="border-r border-black font-black text-black uppercase text-[10px] text-center">Term Avg. /20</TableHead>
              <TableHead className="font-black text-black uppercase text-[10px] text-center">Decision</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transcriptGroups.flatMap((group) =>
              group.terms.length
                ? group.terms.map((term) => (
                    <TableRow key={`${group.academicYear}-${group.className}-${term.term}`} className="border-b border-black last:border-0 h-10">
                      <TableCell className="border-r-2 border-black text-center text-[10px] font-bold">{group.academicYear}</TableCell>
                      <TableCell className="border-r border-black text-center text-[10px] font-bold">{group.className}</TableCell>
                      <TableCell className="border-r border-black text-center text-[10px] font-bold">{term.term}</TableCell>
                      <TableCell className="border-r border-black text-center text-[10px]">{term.sequences.join(", ")}</TableCell>
                      <TableCell className={`border-r border-black text-center text-[10px] font-mono font-black ${term.average >= 10 ? "text-green-700" : "text-red-600"}`}>{term.average ? term.average.toFixed(2) : "Pending"}</TableCell>
                      <TableCell className="text-center text-[10px]">{term.average >= 10 ? "Pass" : term.average > 0 ? "Weak" : "Pending"}</TableCell>
                    </TableRow>
                  ))
                : [
                    <TableRow key={`${group.academicYear}-${group.className}-archived`} className="border-b border-black last:border-0 h-10">
                      <TableCell className="border-r-2 border-black text-center text-[10px] font-bold">{group.academicYear}</TableCell>
                      <TableCell className="border-r border-black text-center text-[10px] font-bold">{group.className}</TableCell>
                      <TableCell className="border-r border-black text-center text-[10px] font-bold">Archived</TableCell>
                      <TableCell className="border-r border-black text-center text-[10px]">-</TableCell>
                      <TableCell className="border-r border-black text-center text-[10px] font-mono font-black">{group.average ? group.average.toFixed(2) : "Pending"}</TableCell>
                      <TableCell className="text-center text-[10px]">{group.decision}</TableCell>
                    </TableRow>,
                  ]
            )}
            {!transcriptGroups.length ? (
              <TableRow className="h-16">
                <TableCell colSpan={6} className="text-center text-[10px] font-black uppercase text-muted-foreground">
                  No term or sequence data has been published.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <div className="border-2 border-black overflow-hidden rounded-sm mb-10">
        <Table className="border-collapse">
          <TableHeader className="bg-black/5">
            <TableRow className="border-b-2 border-black h-12">
              <TableHead className="border-r-2 border-black font-black text-black uppercase text-[10px] text-center">Year</TableHead>
              <TableHead className="border-r border-black font-black text-black uppercase text-[10px] text-center">Class</TableHead>
              <TableHead className="border-r border-black font-black text-black uppercase text-[10px] text-center">Term</TableHead>
              <TableHead className="border-r-2 border-black font-black text-black uppercase text-[10px] text-center w-56">Subject</TableHead>
              <TableHead className="border-r border-black font-black text-black uppercase text-[10px] text-center">Code</TableHead>
              <TableHead className="border-r border-black font-black text-black uppercase text-[10px] text-center">Sequence</TableHead>
              <TableHead className="border-r border-black font-black text-black uppercase text-[10px] text-center">Coef.</TableHead>
              <TableHead className="border-r border-black font-black text-black uppercase text-[10px] text-center">Score / 20</TableHead>
              <TableHead className="border-r border-black font-black text-black uppercase text-[10px] text-center">Teacher</TableHead>
              <TableHead className="font-black text-black uppercase text-[10px] text-center">Remark</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {gradeRows.length === 0 ? (
              <TableRow className="h-16">
                <TableCell colSpan={10} className="text-center text-[10px] font-black uppercase text-muted-foreground">
                  No saved grades are available for this student yet.
                </TableCell>
              </TableRow>
            ) : (
              gradeRows
                .slice()
                .sort((a: any, b: any) => `${a.academicYear}${a.className}${formatTermLabel(a.term)}${a.sequence}${a.subject}`.localeCompare(`${b.academicYear}${b.className}${formatTermLabel(b.term)}${b.sequence}${b.subject}`))
                .map((grade: any) => (
                <TableRow key={grade.id} className="border-b border-black last:border-0 h-10">
                  <TableCell className="border-r-2 border-black text-center text-[10px] font-bold">{grade.academicYear || "-"}</TableCell>
                  <TableCell className="border-r border-black text-center text-[10px] font-bold">{grade.className || student?.class || "-"}</TableCell>
                  <TableCell className="border-r border-black text-center text-[10px] font-bold">{formatTermLabel(grade.term)}</TableCell>
                  <TableCell className="border-r-2 border-black font-black text-[10px] uppercase py-2 pl-4">{grade.subject}</TableCell>
                  <TableCell className="border-r border-black text-center text-[10px] font-mono">{grade.subjectCode || "---"}</TableCell>
                  <TableCell className="border-r border-black text-center text-[10px] font-bold">{grade.sequence}</TableCell>
                  <TableCell className="border-r border-black text-center text-[10px] font-bold">{Number(grade.coefficient || 1).toFixed(0)}</TableCell>
                  <TableCell className={`border-r border-black text-center text-[10px] font-mono font-black ${Number(grade.score) < 10 ? "text-red-600" : "text-green-700"}`}>
                    {Number(grade.score).toFixed(2)}
                  </TableCell>
                  <TableCell className="border-r border-black text-center text-[10px]">{grade.teacher || "---"}</TableCell>
                  <TableCell className="text-center text-[10px]">{grade.comment || "---"}</TableCell>
                </TableRow>
              ))
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

function SignatureSVG({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 40" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 25C15 25 20 15 25 15C30 15 35 30 40 30C45 30 50 10 55 10C60 10 65 35 70 35C75 35 80 20 85 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
