"use client";

import React, { useState, useMemo, useEffect } from "react";
import { generateBrandedTablePdf } from "@/lib/pdf-branded";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Award,
  Loader2,
  CalendarClock,
  Layers,
  ShieldCheck,
  History,
  FileText,
  FileEdit,
  User,
  Save,
  ArrowLeft,
  XCircle,
  FileBadge,
  Printer,
  FileDown,
  Download,
  Eye,
  CreditCard,
  QrCode,
  X,
  Building2,
  CalendarDays,
  Info,
  Users,
  LayoutGrid,
  TrendingUp,
  Activity,
  Filter,
  FileSpreadsheet,
  Zap,
  AlertCircle,
  RotateCcw
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { gradesService } from "@/lib/api/services/grades.service";
import { studentsService } from "@/lib/api/services/students.service";
import { schoolsService } from "@/lib/api/services/schools.service";
import { useSchoolSettings } from "@/lib/hooks/useSchools";
import { downloadHtmlDocument, downloadReportCardsPdf, escapeHtml } from "@/lib/browser-download";
import { buildSequenceLedger } from "@/lib/sequence-ledger";
import { buildCameroonReportCardDocument, buildCameroonReportCardHtml } from "@/lib/cameroon-report-card";

const ACADEMIC_YEARS = ["2023 / 2024", "2022 / 2023", "2021 / 2022"];
const TERMS = ["Term 1", "Term 2", "Term 3"];

type TeacherSheetSubject = {
  id: string;
  class_id: string;
  class_name: string;
  sub_school_id?: string | null;
  sub_school_name: string;
  subject_id: string;
  subject_name: string;
  subject_code: string;
  coefficient: number;
  type: "mandatory" | "optional";
};

type TeacherSheetClass = {
  id: string;
  name: string;
  sub_school_name: string;
  subjects: TeacherSheetSubject[];
};

type TeacherSheetSequence = {
  id: string;
  name: string;
  academic_year: string;
  term: number;
  term_label: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  marks_deadline?: string | null;
};

type TeacherSheetTerm = {
  term: number;
  label: string;
  sequence_count: number;
  academic_years: string[];
  is_active: boolean;
};

type TeacherSheetStudent = {
  id: string;
  index: number;
  name: string;
  matricule: string;
  admission_number: string;
  class_name: string;
  sub_school_name: string;
  grade: { id: string; score: number | null; comment: string; grade_letter: string; modified?: string } | null;
  status: "entered" | "pending";
};

type TeacherGradeSheet = {
  classes: TeacherSheetClass[];
  terms: TeacherSheetTerm[];
  sequences: TeacherSheetSequence[];
  selected_class_subject_id: string | null;
  selected_term: number | null;
  selected_sequence_id: string | null;
  selected: TeacherSheetSubject | null;
  students: TeacherSheetStudent[];
  summary: { total_students: number; entered: number; pending: number };
  scale: { min: number; max: number; pass_mark: number; system: string };
};

function parseSubjectPlacement(level?: string) {
  const raw = (level || "").trim();
  if (!raw) return [];
  if (!raw.includes("||")) {
    return raw.split(",").map((item) => item.trim()).filter(Boolean);
  }
  const [, classes] = raw.split("||");
  return (classes || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function termLabel(term?: number) {
  if (term === 1) return "First Term";
  if (term === 2) return "Second Term";
  if (term === 3) return "Third Term";
  return "Term";
}

function formatSequenceLabel(sequence: TeacherSheetSequence | any) {
  if (!sequence) return "";
  const active = sequence.is_active ? " - Active" : "";
  return `${sequence.name} | ${termLabel(sequence.term)} | ${sequence.academic_year}${active}`;
}

function getApiList<T>(data: T[] | { results?: T[] } | null | undefined): T[] {
  if (Array.isArray(data)) return data;
  return Array.isArray(data?.results) ? data.results : [];
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

function getStudentDisplayName(student: any) {
  return (
    student?.full_name
    || student?.name
    || student?.user_name
    || student?.user?.full_name
    || student?.user?.name
    || [student?.user?.first_name, student?.user?.last_name].filter(Boolean).join(" ")
    || "Student"
  );
}

function buildTeacherTermsFromSequences(sequences: TeacherSheetSequence[]): TeacherSheetTerm[] {
  const byTerm = new Map<number, TeacherSheetTerm>();
  sequences.forEach((sequence) => {
    const existing = byTerm.get(sequence.term) ?? {
      term: sequence.term,
      label: termLabel(sequence.term),
      sequence_count: 0,
      academic_years: [],
      is_active: false,
    };
    existing.sequence_count += 1;
    if (!existing.academic_years.includes(sequence.academic_year)) {
      existing.academic_years.push(sequence.academic_year);
    }
    existing.is_active = existing.is_active || Boolean(sequence.is_active);
    byTerm.set(sequence.term, existing);
  });
  return Array.from(byTerm.values())
    .map((term) => ({ ...term, academic_years: [...term.academic_years].sort().reverse() }))
    .sort((a, b) => a.term - b.term);
}

function getLinkedTeacherIds(link: any) {
  return [
    link?.teacher,
    link?.teacher_id,
    link?.teacher?.id,
    link?.teacher?.uid,
  ].filter(Boolean).map(String);
}

function getSubjectIdFromLink(link: any) {
  return String(link?.subject?.id || link?.subject || link?.subject_id || "");
}

function getSubjectNameFromLink(link: any) {
  return String(link?.subject_name || link?.subject?.name || link?.name || "Subject");
}

function getSubjectCodeFromLink(link: any) {
  return String(link?.subject_code || link?.subject?.code || "");
}

function extractApiErrorMessage(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const message = extractApiErrorMessage(item);
      if (message) return message;
    }
    return "";
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["detail", "error", "message", "non_field_errors", "sequence", "grades", "score", "subject", "student"]) {
      const message = extractApiErrorMessage(record[key]);
      if (message) return message;
    }
    for (const item of Object.values(record)) {
      const message = extractApiErrorMessage(item);
      if (message) return message;
    }
  }
  return "";
}

// Pivot raw grades into a per-subject ledger (Seq 1 / Seq 2 / Average) — the
// exact shape the parent account's "Test Marks Follow-up" table uses, so the
// student marks table can render identically.
function buildGradeLedger(grades: any[] = []) {
  const grouped = grades.reduce((acc: Record<string, any>, grade: any) => {
    const subject = grade.subject?.name || grade.subject_name || "Unknown Subject";
    const coefficient = Number(grade.subject?.coefficient || grade.coefficient || 1);

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
    return { ...entry, average, total: average * entry.coef };
  });
}

export default function GradeBookPage() {
  const { user } = useAuth();
  const { t, language } = useI18n();
  const { toast } = useToast();
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [selectedClass, setSelectedClass] = useState("2nde / Form 5");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedSequence, setSelectedSequence] = useState("");
  const [viewingDoc, setViewingDoc] = useState<any>(null);
  const [adminView, setAdminView] = useState<"list" | "details">("list");
  // Report-card class grid: let admins narrow the classes down to one
  // sub-school (Anglophone / Francophone / custom sections).
  const [adminSubSchoolFilter, setAdminSubSchoolFilter] = useState("all");
  const [inspectedClass, setInspectedClass] = useState<any>(null);
  const [adminClassResults, setAdminClassResults] = useState<any[]>([]);
  const [adminClassError, setAdminClassError] = useState("");
  const [isAdminClassLoading, setIsAdminClassLoading] = useState(false);
  const [adminReportCard, setAdminReportCard] = useState<any>(null);
  const [isAdminReportLoading, setIsAdminReportLoading] = useState(false);
  const [isGeneratingClassReports, setIsGeneratingClassReports] = useState(false);
  const [isPublishingReportCards, setIsPublishingReportCards] = useState(false);
  const [isPublishingAllSchool, setIsPublishingAllSchool] = useState(false);
  const [publishAllOpen, setPublishAllOpen] = useState(false);
  const [adminReportScope, setAdminReportScope] = useState<"sequence" | "term">("sequence");
  const [selectedAdminTerm, setSelectedAdminTerm] = useState("");
  const [selectedAdminAcademicYear, setSelectedAdminAcademicYear] = useState("");

  const [subjects, setSubjects] = useState<any[]>([]);
  const [classSubjectLinks, setClassSubjectLinks] = useState<any[]>([]);
  const [sequences, setSequences] = useState<any[]>([]);
  const [deadlineSequenceId, setDeadlineSequenceId] = useState("");
  const [deadlineDate, setDeadlineDate] = useState("");
  const [savingDeadline, setSavingDeadline] = useState(false);
  const [classes, setClasses] = useState<any[]>([]);
  const [cycleClasses, setCycleClasses] = useState<any[]>([]);
  const [savingCycleId, setSavingCycleId] = useState<string | null>(null);
  const [studentTestGrades, setStudentTestGrades] = useState<any[]>([]);
  const [isStudentTestLoading, setIsStudentTestLoading] = useState(false);
  const [reportCard, setReportCard] = useState<any>(null);
  const [reportCardError, setReportCardError] = useState("");
  const [classResults, setClassResults] = useState<any[]>([]);
  const [annualResults, setAnnualResults] = useState<any[]>([]);
  const [studentProfile, setStudentProfile] = useState<any>(null);
  const [studentReportScope, setStudentReportScope] = useState<"sequence" | "term">("sequence");
  const [selectedStudentTerm, setSelectedStudentTerm] = useState("");
  const [teacherClassStudents, setTeacherClassStudents] = useState<any[]>([]);
  const [existingGradeMap, setExistingGradeMap] = useState<Record<string, any>>({});
  const [gradeDrafts, setGradeDrafts] = useState<Record<string, string>>({});
  const [gradeCommentDrafts, setGradeCommentDrafts] = useState<Record<string, string>>({});
  const [editingGradeRows, setEditingGradeRows] = useState<Record<string, boolean>>({});
  const [teacherSheet, setTeacherSheet] = useState<TeacherGradeSheet | null>(null);
  const [selectedClassSubject, setSelectedClassSubject] = useState("");
  const [selectedTeacherClassId, setSelectedTeacherClassId] = useState("");
  const [selectedTeacherTerm, setSelectedTeacherTerm] = useState("");
  const [isTeacherSheetLoading, setIsTeacherSheetLoading] = useState(false);
  const [teacherSheetError, setTeacherSheetError] = useState("");
  const [savingGradeFor, setSavingGradeFor] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [isGeneratingReportPdf, setIsGeneratingReportPdf] = useState(false);

  const isTeacher = user?.role === "TEACHER";
  const isStudent = user?.role === "STUDENT";
  const isAdmin = user?.role === "SCHOOL_ADMIN" || user?.role === "SUB_ADMIN";
  const { data: schoolSettings } = useSchoolSettings(user?.school?.id || "");

  const teacherSubjects = useMemo(() => {
    if (!isTeacher) return subjects;
    const linked = classSubjectLinks.filter((link: any) => String(link.teacher || "") === String(user?.id) || String(link.teacher || "") === String(user?.uid));
    const byId = new Map<string, any>();
    linked.forEach((link: any) => {
      if (!link.subject) return;
      byId.set(String(link.subject), {
        id: String(link.subject),
        name: link.subject_name || "Subject",
        code: link.subject_code || "",
        coefficient: link.coefficient || 1,
        level: link.class_name || "",
        teacher: link.teacher,
      });
    });
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [classSubjectLinks, isTeacher, subjects, user?.id, user?.uid]);

  const availableClasses = useMemo(() => {
    const sourceSubjects = isTeacher ? teacherSubjects : subjects;
    const subjectClasses = sourceSubjects.flatMap((subject: any) => parseSubjectPlacement(subject.level));
    const schoolClasses = schoolSettings?.class_levels || [];
    return Array.from(new Set([...subjectClasses, ...schoolClasses].filter(Boolean)));
  }, [isTeacher, schoolSettings?.class_levels, subjects, teacherSubjects]);

  const availableTeacherClasses = useMemo(() => {
    const linkedClasses = classSubjectLinks
      .filter((link: any) =>
        (String(link.teacher || "") === String(user?.id) || String(link.teacher || "") === String(user?.uid)) &&
        (!selectedSubject || String(link.subject) === String(selectedSubject))
      )
      .map((link: any) => link.class_name)
      .filter(Boolean);
    const scopedClasses = Array.from(new Set(linkedClasses));
    if (scopedClasses.length) return scopedClasses;
    const selected = teacherSubjects.find((subject: any) => subject.id === selectedSubject);
    const fallbackClasses = parseSubjectPlacement(selected?.level);
    return fallbackClasses.length ? fallbackClasses : availableClasses;
  }, [availableClasses, classSubjectLinks, selectedSubject, teacherSubjects, user?.id, user?.uid]);

  const teacherSheetClasses = Array.isArray(teacherSheet?.classes) ? teacherSheet.classes : [];
  const selectedTeacherClass = useMemo(() => {
    return teacherSheetClasses.find((item) => item.id === selectedTeacherClassId) ?? teacherSheetClasses[0] ?? null;
  }, [selectedTeacherClassId, teacherSheetClasses]);
  const teacherSheetSubjects = Array.isArray(selectedTeacherClass?.subjects) ? selectedTeacherClass.subjects : [];
  const selectedTeacherSubject = useMemo(() => {
    return teacherSheetSubjects.find((item) => item.id === selectedClassSubject) ?? teacherSheet?.selected ?? teacherSheetSubjects[0] ?? null;
  }, [selectedClassSubject, teacherSheet?.selected, teacherSheetSubjects]);
  const teacherSheetSequences = Array.isArray(teacherSheet?.sequences) ? teacherSheet.sequences : [];
  const selectedTeacherSequence = useMemo(() => {
    return teacherSheetSequences.find((item) => item.id === selectedSequence) ?? null;
  }, [selectedSequence, teacherSheetSequences]);
  const teacherSheetTerms = Array.isArray(teacherSheet?.terms) ? teacherSheet.terms : [];
  const selectedTeacherTermValue = selectedTeacherTerm || (
    selectedTeacherSequence?.term
      ? String(selectedTeacherSequence.term)
      : teacherSheet?.selected_term
        ? String(teacherSheet.selected_term)
        : ""
  );
  const teacherTermSequences = useMemo(() => {
    const allSequences = teacherSheetSequences;
    if (!selectedTeacherTermValue) return allSequences;
    return allSequences.filter((sequence) => String(sequence.term) === selectedTeacherTermValue);
  }, [selectedTeacherTermValue, teacherSheetSequences]);
  const selectedTeacherTermInfo = useMemo(() => {
    return teacherSheetTerms.find((term) => String(term.term) === selectedTeacherTermValue) ?? null;
  }, [selectedTeacherTermValue, teacherSheetTerms]);
  const canEditSelectedTeacherTerm = Boolean(selectedTeacherTermInfo?.is_active || selectedTeacherSequence?.is_active);
  const adminTermOptions = useMemo(() => {
    const options = new Map<string, { value: string; term: number; academicYear: string; label: string; sequenceCount: number; isActive: boolean }>();
    sequences.forEach((sequence: any) => {
      const term = Number(sequence.term);
      const academicYear = String(sequence.academic_year || "");
      if (!term || !academicYear) return;
      const value = `${term}|${academicYear}`;
      const current = options.get(value);
      if (current) {
        current.sequenceCount += 1;
        current.isActive = current.isActive || Boolean(sequence.is_active);
      } else {
        options.set(value, {
          value,
          term,
          academicYear,
          label: `${termLabel(term)} | ${academicYear}`,
          sequenceCount: 1,
          isActive: Boolean(sequence.is_active),
        });
      }
    });
    return Array.from(options.values()).sort((a, b) => (
      b.academicYear.localeCompare(a.academicYear) || a.term - b.term
    ));
  }, [sequences]);
  const selectedAdminTermValue = selectedAdminTerm && selectedAdminAcademicYear
    ? `${selectedAdminTerm}|${selectedAdminAcademicYear}`
    : "";

  const applyTeacherGradeSheet = React.useCallback((data: TeacherGradeSheet) => {
    setTeacherSheet(data);
    const responseClasses = Array.isArray(data.classes) ? data.classes : [];
    const responseSequences = Array.isArray(data.sequences) ? data.sequences : [];
    const responseTerms = Array.isArray(data.terms) ? data.terms : [];
    const nextClassSubjectId = data.selected_class_subject_id || "";
    const nextSequenceId = data.selected_sequence_id || "";
    const nextClassId = data.selected?.class_id || responseClasses[0]?.id || "";
    const nextSequence = responseSequences.find((sequence) => sequence.id === nextSequenceId);
    const nextTerm = data.selected_term
      ? String(data.selected_term)
      : nextSequence?.term
        ? String(nextSequence.term)
        : "";

    setSelectedClassSubject((current) => current || nextClassSubjectId);
    setSelectedSequence((current) => {
      if (!current) return nextSequenceId;
      const currentSequence = responseSequences.find((sequence) => sequence.id === current);
      if (!currentSequence) return nextSequenceId;
      if (data.selected_term && currentSequence.term !== data.selected_term) return nextSequenceId;
      return current;
    });
    setSelectedTeacherClassId((current) => current || nextClassId);
    setSelectedTeacherTerm((current) => {
      if (!current) return nextTerm;
      return responseTerms.some((term) => String(term.term) === current) ? current : nextTerm;
    });
    if (data.selected) {
      setSelectedClass(data.selected.class_name);
      setSelectedSubject(data.selected.subject_id);
    }

    const nextStudents = Array.isArray(data.students) ? data.students : [];
    const nextGradeMap = nextStudents.reduce<Record<string, any>>((acc, student) => {
      if (student.grade) {
        acc[student.id] = student.grade;
      }
      return acc;
    }, {});
    setTeacherClassStudents(nextStudents);
    setExistingGradeMap(nextGradeMap);
    setGradeDrafts(
      nextStudents.reduce<Record<string, string>>((acc, student) => {
        acc[student.id] = student.grade?.score !== null && student.grade?.score !== undefined ? String(student.grade.score) : "";
        return acc;
      }, {})
    );
    setGradeCommentDrafts(
      nextStudents.reduce<Record<string, string>>((acc, student) => {
        acc[student.id] = student.grade?.comment || "";
        return acc;
      }, {})
    );
    setEditingGradeRows({});
    setClassResults(
      nextStudents
        .filter((student) => student.grade)
        .map((student) => ({
          student_name: student.name,
          admission_number: student.admission_number,
          average: student.grade?.score ?? 0,
          rank: null,
          teacher_limited: true,
        }))
    );
  }, []);

  const loadTeacherGradeSheetFallback = React.useCallback(async (): Promise<TeacherGradeSheet> => {
    const teacherIds = [user?.id, user?.uid].filter(Boolean).map(String);
    const schoolId = user?.school?.id;
    if (!schoolId || teacherIds.length === 0) {
      throw new Error("Your teacher account is not linked to a school.");
    }

    const [hierarchySubjects, sequenceResponse] = await Promise.all([
      schoolsService.getHierarchySubjects({ school_id: schoolId }),
      gradesService.getSequences({ limit: 100 }),
    ]);

    const teacherLinks = getApiList<any>(hierarchySubjects)
      .filter((link) => getLinkedTeacherIds(link).some((teacherId) => teacherIds.includes(teacherId)))
      .sort((a, b) => `${a.sub_school?.name || ""}${a.class_name || ""}${a.subject_name || ""}`.localeCompare(
        `${b.sub_school?.name || ""}${b.class_name || ""}${b.subject_name || ""}`
      ));

    const sequences = getApiList<any>(sequenceResponse).map((sequence) => ({
      id: String(sequence.id),
      name: sequence.name,
      academic_year: sequence.academic_year,
      term: Number(sequence.term),
      term_label: termLabel(Number(sequence.term)),
      start_date: sequence.start_date,
      end_date: sequence.end_date,
      is_active: Boolean(sequence.is_active),
    })) as TeacherSheetSequence[];
    const terms = buildTeacherTermsFromSequences(sequences);

    const groupedClasses: TeacherSheetClass[] = [];
    const classMap = new Map<string, TeacherSheetClass>();
    teacherLinks.forEach((link) => {
      const classId = String(link.school_class || link.class_id || link.id);
      const subject: TeacherSheetSubject = {
        id: String(link.id),
        class_id: classId,
        class_name: link.class_name || "Class",
        sub_school_id: link.sub_school?.id ? String(link.sub_school.id) : null,
        sub_school_name: link.sub_school?.name || "Main School",
        subject_id: getSubjectIdFromLink(link),
        subject_name: getSubjectNameFromLink(link),
        subject_code: getSubjectCodeFromLink(link),
        coefficient: Number(link.coefficient || 1),
        type: link.type || "mandatory",
      };

      if (!classMap.has(classId)) {
        const cls = {
          id: classId,
          name: subject.class_name,
          sub_school_name: subject.sub_school_name,
          subjects: [],
        };
        classMap.set(classId, cls);
        groupedClasses.push(cls);
      }
      classMap.get(classId)?.subjects.push(subject);
    });

    const flattenedSubjects = groupedClasses.flatMap((cls) => cls.subjects);
    const selectedLink = flattenedSubjects.find((subject) => subject.id === selectedClassSubject) ?? flattenedSubjects[0] ?? null;
    const selectedTermNumber = selectedTeacherTerm
      ? Number(selectedTeacherTerm)
      : sequences.find((sequence) => sequence.id === selectedSequence)?.term
        ?? terms.find((term) => term.is_active)?.term
        ?? terms[0]?.term
        ?? null;
    const termSequences = selectedTermNumber
      ? sequences.filter((sequence) => sequence.term === selectedTermNumber)
      : sequences;
    const selectedSequenceItem = termSequences.find((sequence) => sequence.id === selectedSequence)
      ?? termSequences.find((sequence) => sequence.is_active)
      ?? termSequences[0]
      ?? null;

    let students: TeacherSheetStudent[] = [];
    if (selectedLink) {
      const classStudentsResponse = await studentsService.getClassList(selectedLink.class_name);
      const classStudents = getApiList<any>(classStudentsResponse);
      const gradeResponse = selectedSequenceItem ? await gradesService.getGrades({ limit: 1000 } as any) : [];
      const gradeList = selectedSequenceItem ? getApiList<any>(gradeResponse) : [];
      const gradesByStudent = new Map<string, any>();
      gradeList
        .filter((grade) =>
          getEntityId(grade.subject) === selectedLink.subject_id
          && getEntityId(grade.sequence) === selectedSequenceItem?.id
        )
        .forEach((grade) => gradesByStudent.set(getEntityId(grade.student), grade));

      students = classStudents.map((student, index) => {
        const grade = gradesByStudent.get(String(student.id));
        const className = student.school_class_name || student.class_name || student.student_class || selectedLink.class_name;
        const subSchoolName = student.sub_school_name || student.school_class?.sub_school_name || selectedLink.sub_school_name;
        return {
          index: index + 1,
          id: String(student.id),
          name: getStudentDisplayName(student),
          matricule: student.matricule || student.user?.matricule || "",
          admission_number: student.admission_number || "",
          class_name: className,
          sub_school_name: subSchoolName || "Main School",
          grade: grade ? {
            id: String(grade.id),
            score: grade.score === null || grade.score === undefined ? null : Number(grade.score),
            comment: grade.comment || "",
            grade_letter: grade.grade_letter || "",
            modified: grade.modified,
          } : null,
          status: grade ? "entered" : "pending",
        };
      });
    }

    return {
      classes: groupedClasses,
      terms,
      sequences,
      selected_class_subject_id: selectedLink?.id ?? null,
      selected_term: selectedSequenceItem?.term ?? selectedTermNumber,
      selected_sequence_id: selectedSequenceItem?.id ?? null,
      selected: selectedLink,
      students,
      summary: {
        total_students: students.length,
        entered: students.filter((student) => student.status === "entered").length,
        pending: students.filter((student) => student.status === "pending").length,
      },
      scale: {
        min: 0,
        max: 20,
        pass_mark: 10,
        system: "Cameroon secondary education",
      },
    };
  }, [selectedClassSubject, selectedSequence, selectedTeacherTerm, user?.id, user?.school?.id, user?.uid]);

  const loadTeacherGradeSheetData = React.useCallback(async (): Promise<TeacherGradeSheet> => {
    try {
      return await gradesService.getTeacherGradeSheet({
        class_subject_id: selectedClassSubject || undefined,
        sequence_id: selectedSequence || undefined,
        term: selectedTeacherTerm || undefined,
      });
    } catch (error) {
      console.warn("Dedicated teacher grade sheet endpoint failed, using compatibility fallback:", error);
      return loadTeacherGradeSheetFallback();
    }
  }, [loadTeacherGradeSheetFallback, selectedClassSubject, selectedSequence, selectedTeacherTerm]);

  // Load subjects
  useEffect(() => {
    if (isTeacher) return;
    const loadSubjects = async () => {
      try {
        const data = await gradesService.getSubjects({ limit: 200 });
        const list = Array.isArray(data) ? data : data?.results || [];
        setSubjects(list);
        if (user?.school?.id) {
          const links = await schoolsService.getHierarchySubjects({ school_id: user.school.id });
          setClassSubjectLinks(Array.isArray(links) ? links : []);
        }
      } catch (error) {
        console.error("Error loading subjects:", error);
        if (!isAdmin) {
          setHasError(true);
        }
        toast({ title: "Error", description: "Failed to load subjects", variant: "destructive" });
      }
    };

    loadSubjects();
  }, [isAdmin, isTeacher, toast, user?.school?.id]);

  useEffect(() => {
    if (isTeacher) return;
    const subjectPool = isTeacher ? teacherSubjects : subjects;
    if (!subjectPool.length) return;
    setSelectedSubject((current) => (
      current && subjectPool.some((subject: any) => subject.id === current) ? current : subjectPool[0].id
    ));
  }, [isTeacher, subjects, teacherSubjects]);

  useEffect(() => {
    if (isTeacher) return;
    const classPool = isTeacher ? availableTeacherClasses : availableClasses;
    if (!classPool.length) return;
    setSelectedClass((current) => (current && classPool.includes(current) ? current : classPool[0]));
  }, [availableClasses, availableTeacherClasses, isTeacher]);

  // Load sequences
  useEffect(() => {
    if (isTeacher) return;
    const loadSequences = async () => {
      try {
        const data = await gradesService.getSequences({ limit: 50 });
        const list = Array.isArray(data) ? data : data?.results || [];
        setSequences(list);
        if (list.length > 0) {
          const activeSequence = list.find((sequence: any) => Boolean(sequence.is_active)) || list[0];
          setSelectedSequence(activeSequence.id);
          setSelectedAdminTerm(String(activeSequence.term || ""));
          setSelectedAdminAcademicYear(String(activeSequence.academic_year || ""));
          setSelectedStudentTerm(`${activeSequence.term || ""}|${activeSequence.academic_year || ""}`);
        }
      } catch (error) {
        console.error("Error loading sequences:", error);
        toast({ title: "Error", description: "Failed to load sequences", variant: "destructive" });
      }
    };

    loadSequences();
  }, [isTeacher, toast]);

  // Keep the deadline editor in sync with the sequence the admin selects.
  useEffect(() => {
    if (!deadlineSequenceId && sequences.length > 0) {
      const activeSequence = sequences.find((sequence: any) => Boolean(sequence.is_active)) || sequences[0];
      setDeadlineSequenceId(activeSequence.id);
      setDeadlineDate(activeSequence.marks_deadline || "");
    }
  }, [sequences, deadlineSequenceId]);

  const handleSelectDeadlineSequence = (sequenceId: string) => {
    setDeadlineSequenceId(sequenceId);
    const sequence = sequences.find((item: any) => item.id === sequenceId);
    setDeadlineDate(sequence?.marks_deadline || "");
  };

  const handleSaveMarksDeadline = async () => {
    if (!deadlineSequenceId) return;
    setSavingDeadline(true);
    try {
      const updated = await gradesService.updateSequence(deadlineSequenceId, {
        marks_deadline: deadlineDate || null,
      } as any);
      setSequences((prev) => prev.map((sequence: any) =>
        sequence.id === deadlineSequenceId ? { ...sequence, marks_deadline: (updated?.marks_deadline ?? deadlineDate) || null } : sequence
      ));
      toast({
        title: deadlineDate ? "Marks deadline saved" : "Marks deadline cleared",
        description: deadlineDate
          ? "Teachers will see the latest date to submit marks for this sequence."
          : "The submission deadline has been removed for this sequence.",
      });
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to update the marks deadline." });
    } finally {
      setSavingDeadline(false);
    }
  };

  useEffect(() => {
    if (!isTeacher) return;
    let cancelled = false;

    const loadTeacherSheet = async () => {
      setIsTeacherSheetLoading(true);
      setTeacherSheetError("");
      try {
        const data = await loadTeacherGradeSheetData();
        if (cancelled) return;
        applyTeacherGradeSheet(data);
      } catch (error: any) {
        if (cancelled) return;
        console.error("Error loading teacher grade sheet:", error);
        setTeacherSheetError(
          error?.response?.data?.detail
            || error?.response?.data?.error
            || "Unable to load your assigned classes, subjects, terms, sequences, and students."
        );
        setTeacherSheet(null);
        setTeacherClassStudents([]);
        setExistingGradeMap({});
        setGradeDrafts({});
        setGradeCommentDrafts({});
      } finally {
        if (!cancelled) setIsTeacherSheetLoading(false);
      }
    };

    loadTeacherSheet();
    return () => {
      cancelled = true;
    };
  }, [applyTeacherGradeSheet, isTeacher, loadTeacherGradeSheetData, reloadNonce, selectedClassSubject, selectedSequence, selectedTeacherTerm]);

  useEffect(() => {
    if (!isStudent) return;

    const loadStudentProfile = async () => {
      try {
        const data = await studentsService.getMyProfile();
        setStudentProfile(data || null);
      } catch (error) {
        console.error("Error loading student profile:", error);
      }
    };

    loadStudentProfile();
  }, [isStudent, reloadNonce]);

  const studentTermOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string; count: number }>();
    sequences.forEach((sequence: any) => {
      if (!sequence?.term || !sequence?.academic_year) return;
      const value = `${sequence.term}|${sequence.academic_year}`;
      const current = map.get(value) || {
        value,
        label: `${termLabel(Number(sequence.term))} - ${sequence.academic_year}`,
        count: 0,
      };
      current.count += 1;
      map.set(value, current);
    });
    return Array.from(map.values()).sort((a, b) => b.label.localeCompare(a.label));
  }, [sequences]);

  // Load student's published report card
  useEffect(() => {
    if (!isStudent || !studentProfile?.id) return;
    if (studentReportScope === "sequence" && !selectedSequence) return;
    if (studentReportScope === "term" && !selectedStudentTerm) return;

    const loadReportCard = async () => {
      try {
        setReportCardError("");
        setReportCard(null);
        const data = studentReportScope === "term"
          ? await gradesService.getTermReportCard(
              studentProfile.id,
              Number(selectedStudentTerm.split("|")[0]),
              selectedStudentTerm.split("|")[1] || ""
            )
          : await gradesService.getReportCard(studentProfile.id, selectedSequence);
        setReportCard(data);
      } catch (error: any) {
        console.error("Error loading report card:", error);
        setReportCard(null);
        const message = extractApiErrorMessage(error?.response?.data)
          || "This report card is not available yet. Your school may still need to publish it.";
        setReportCardError(message);
      }
    };

    loadReportCard();
  }, [isStudent, selectedSequence, selectedStudentTerm, studentProfile?.id, studentReportScope]);

  useEffect(() => {
    if (!isStudent || !studentProfile?.id) return;
    let cancelled = false;

    const loadStudentTests = async (showSpinner = false) => {
      if (showSpinner) setIsStudentTestLoading(true);
      try {
        const data = await gradesService.getGrades({ student: studentProfile.id, limit: 1000 } as any);
        if (!cancelled) setStudentTestGrades(getApiList<any>(data));
      } catch (error) {
        console.error("Error loading student marks:", error);
        if (!cancelled) setStudentTestGrades([]);
      } finally {
        if (!cancelled && showSpinner) setIsStudentTestLoading(false);
      }
    };

    loadStudentTests(true);
    const refreshInterval = window.setInterval(() => loadStudentTests(false), 15000);
    return () => {
      cancelled = true;
      window.clearInterval(refreshInterval);
    };
  }, [isStudent, studentProfile?.id, reloadNonce]);

  // Load teacher's own marks summary for the selected class and subject
  useEffect(() => {
    if (isTeacher) return;
    if (!isTeacher || !selectedClass || !selectedSequence || !selectedSubject) return;

    const loadClassResults = async () => {
      try {
        const data = await gradesService.getClassResults(selectedClass, selectedSequence, selectedSubject);
        setClassResults(Array.isArray(data) ? data : data?.results || []);
      } catch (error) {
        console.error("Error loading class results:", error);
        toast({ title: "Error", description: "Failed to load your marks summary", variant: "destructive" });
      }
    };

    loadClassResults();
  }, [isTeacher, selectedClass, selectedSequence, selectedSubject, toast]);

  useEffect(() => {
    if (isTeacher) return;
    if (!isTeacher || !selectedClass || !selectedSequence || !selectedSubject) {
      setTeacherClassStudents([]);
      setExistingGradeMap({});
      setGradeDrafts({});
      return;
    }

    const loadTeacherGradeSheet = async () => {
      try {
        const studentData = await studentsService.getClassList(selectedClass);
        const studentList = Array.isArray(studentData) ? studentData : studentData?.results || [];
        setTeacherClassStudents(studentList);

        const reportCards = await Promise.all(
          studentList.map(async (student: any) => {
            try {
              const report = await gradesService.getReportCard(student.id, selectedSequence);
              return { studentId: student.id, report };
            } catch (error) {
              return { studentId: student.id, report: null };
            }
          })
        );

        const nextGradeMap: Record<string, any> = {};
        reportCards.forEach(({ studentId, report }) => {
          const gradeEntries = report?.grades || report?.subjects || [];
          const matched = gradeEntries.find((grade: any) =>
            grade?.subject === selectedSubject ||
            grade?.subject?.id === selectedSubject ||
            grade?.subject_id === selectedSubject
          );
          if (matched) {
            nextGradeMap[studentId] = matched;
          }
        });

        setExistingGradeMap(nextGradeMap);
        setGradeDrafts(
          studentList.reduce((acc: Record<string, string>, student: any) => {
            const existing = nextGradeMap[student.id];
            acc[student.id] = existing?.score !== undefined && existing?.score !== null ? String(existing.score) : "";
            return acc;
          }, {})
        );
      } catch (error) {
        console.error("Error loading teacher grade sheet:", error);
        setTeacherClassStudents([]);
        setExistingGradeMap({});
        setGradeDrafts({});
      }
    };

    loadTeacherGradeSheet();
  }, [isTeacher, selectedClass, selectedSequence, selectedSubject]);

  // Load admin view classes
  useEffect(() => {
    if (!isAdmin) return;

    const loadClasses = async () => {
      try {
        setIsLoading(true);
        let statisticRows: any[] = [];
        try {
          const statistics = await gradesService.getClassStatistics();
          statisticRows = Array.isArray(statistics?.classes) ? statistics.classes : [];
        } catch (statisticsError) {
          console.warn("Class statistics endpoint failed; falling back to student registry grouping:", statisticsError);
        }
        if (statisticRows.length) {
          setClasses(
            statisticRows.map((row: any) => ({
              id: row.id,
              name: row.name,
              subSchoolName: row.sub_school_name,
              students: Number(row.students ?? row.student_count ?? 0),
              performance: Number(row.performance ?? 0),
              averageMark: Number(row.averageMark ?? row.average_mark ?? 0),
              teachers: Number(row.teachers ?? row.teacher_count ?? 0),
              passRate: Number(row.pass_rate ?? row.passRate ?? 0),
              completionRate: Number(row.completion_rate ?? row.completionRate ?? 0),
              marksEntered: Number(row.marks_entered ?? row.marksEntered ?? 0),
            }))
          );
          return;
        }

        const data = await studentsService.getStudents({ limit: 500 });
        const students = Array.isArray(data) ? data : data?.results || [];
        const grouped = Object.values(
          students.reduce((acc: Record<string, any>, student: any) => {
            const className = student.student_class || student.school_class_name || "Unassigned";
            if (!acc[className]) {
              acc[className] = {
                id: className,
                name: className,
                students: 0,
                performance: 0,
                averageMark: 0,
                teachers: 0,
              };
            }
            acc[className].students += 1;
            const average = Number(student.annual_average ?? student.annual_avg ?? student.average ?? 0);
            if (!Number.isNaN(average) && average > 0) {
              acc[className].averageTotal = Number(acc[className].averageTotal || 0) + average;
              acc[className].averageCount = Number(acc[className].averageCount || 0) + 1;
            }
            return acc;
          }, {})
        ).map((row: any) => {
          const averageMark = row.averageCount ? row.averageTotal / row.averageCount : 0;
          return {
            ...row,
            averageMark,
            performance: Math.round((averageMark / 20) * 100),
          };
        });
        setClasses(grouped);
      } catch (error) {
        console.error("Error loading classes:", error);
        setHasError(true);
        toast({ title: "Error", description: "Failed to load classes", variant: "destructive" });
      } finally {
        setIsLoading(false);
      }
    };

    loadClasses();
  }, [isAdmin, reloadNonce, toast]);

  // Load the real class registry so admins can set each class's cycle.
  useEffect(() => {
    if (!isAdmin || !user?.school?.id) return;
    let alive = true;
    schoolsService
      .getHierarchyClasses({ school_id: user.school.id })
      .then((rows) => alive && setCycleClasses(Array.isArray(rows) ? rows : []))
      .catch(() => alive && setCycleClasses([]));
    return () => {
      alive = false;
    };
  }, [isAdmin, user?.school?.id, reloadNonce]);

  const handleSetClassCycle = async (classId: string, cycle: string) => {
    setSavingCycleId(classId);
    try {
      await schoolsService.updateHierarchyClass(classId, { cycle: cycle as any, school_id: user?.school?.id });
      setCycleClasses((prev) => prev.map((c) => (String(c.id) === String(classId) ? { ...c, cycle } : c)));
      toast({ title: "Cycle updated", description: `Class set to ${cycle === "second" ? "Second" : "First"} Cycle.` });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Update failed", description: extractApiErrorMessage(error?.response?.data) || "Could not update the cycle." });
    } finally {
      setSavingCycleId(null);
    }
  };

  useEffect(() => {
    const canLoadSequence = adminReportScope === "sequence" && Boolean(selectedSequence);
    const canLoadTerm = adminReportScope === "term" && Boolean(selectedAdminTerm && selectedAdminAcademicYear);
    if (!isAdmin || adminView !== "details" || !inspectedClass?.name || (!canLoadSequence && !canLoadTerm)) return;
    let cancelled = false;

    const loadAdminClassResults = async () => {
      setIsAdminClassLoading(true);
      setAdminClassError("");
      try {
        const data = adminReportScope === "term"
          ? await gradesService.getTermClassResults(inspectedClass.name, Number(selectedAdminTerm), selectedAdminAcademicYear)
          : await gradesService.getClassResults(inspectedClass.name, selectedSequence);
        if (cancelled) return;
        setAdminClassResults(Array.isArray(data) ? data : data?.results || []);
      } catch (error: any) {
        if (cancelled) return;
        console.error("Error loading admin class results:", error);
        setAdminClassError(extractApiErrorMessage(error?.response?.data) || error?.message || "Unable to load this class report-card data.");
        setAdminClassResults([]);
      } finally {
        if (!cancelled) setIsAdminClassLoading(false);
      }
    };

    loadAdminClassResults();
    return () => {
      cancelled = true;
    };
  }, [adminReportScope, adminView, inspectedClass?.name, isAdmin, reloadNonce, selectedAdminAcademicYear, selectedAdminTerm, selectedSequence]);

  const handleDownload = async (title: string) => {
    if (isStudent && reportCard) {
      setIsGeneratingReportPdf(true);
      try {
        await downloadReportCardsPdf(
          [buildCameroonReportCardHtml(reportCard, { title, school: user?.school, student: studentProfile })],
          `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        );
        toast({ title: "Report card downloaded", description: `${title} was generated with the official Cameroon report-card design.` });
      } catch (error) {
        toast({
          variant: "destructive",
          title: "PDF generation failed",
          description: error instanceof Error ? error.message : "The report card PDF could not be generated.",
        });
      } finally {
        setIsGeneratingReportPdf(false);
      }
      return;
    }

    const elementId = isStudent ? "student-grade-report" : "";
    const element = elementId ? document.getElementById(elementId) : null;
    if (!element) {
      toast({ variant: "destructive", title: "Download unavailable", description: "Open the report data before downloading it." });
      return;
    }
    const html = `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(title)}</title></head><body>${element.outerHTML}</body></html>`;
    downloadHtmlDocument(html, `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.html`);
    toast({ title: "Document prepared", description: `${title} has been downloaded for printing or PDF export.` });
  };

  const handleViewAdminReportCard = async (row: any) => {
    const canGenerate = adminReportScope === "term"
      ? Boolean(row?.student_id && selectedAdminTerm && selectedAdminAcademicYear)
      : Boolean(row?.student_id && selectedSequence);
    if (!canGenerate) {
      toast({ variant: "destructive", title: "Report unavailable", description: "Select a valid student and report period first." });
      return;
    }

    setIsAdminReportLoading(true);
    try {
      const data = adminReportScope === "term"
        ? await gradesService.getTermReportCard(row.student_id, Number(selectedAdminTerm), selectedAdminAcademicYear)
        : await gradesService.getReportCard(row.student_id, selectedSequence);
      setAdminReportCard(data);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Report card failed",
        description: extractApiErrorMessage(error?.response?.data) || error?.message || "This report card could not be loaded.",
      });
    } finally {
      setIsAdminReportLoading(false);
    }
  };

  const handleDownloadClassReportCards = async () => {
    const canGenerate = adminReportScope === "term"
      ? Boolean(selectedAdminTerm && selectedAdminAcademicYear && adminClassResults.length)
      : Boolean(selectedSequence && adminClassResults.length);
    if (!canGenerate) {
      toast({ variant: "destructive", title: "No reports available", description: "Choose a report period and load a class with students first." });
      return;
    }

    const studentsWithIds = adminClassResults.filter((row) => row.student_id);
    if (!studentsWithIds.length) {
      toast({ variant: "destructive", title: "No reports available", description: "This class does not have student IDs for report generation yet." });
      return;
    }

    setIsGeneratingClassReports(true);
    try {
      const cards = await Promise.all(
        studentsWithIds.map(async (row) => {
          try {
            return adminReportScope === "term"
              ? await gradesService.getTermReportCard(row.student_id, Number(selectedAdminTerm), selectedAdminAcademicYear)
              : await gradesService.getReportCard(row.student_id, selectedSequence);
          } catch (error) {
            console.error("Could not load report card for student", row.student_id, error);
            return null;
          }
        })
      );
      const validCards = cards.filter(Boolean);
      if (!validCards.length) {
        throw new Error("No report cards could be generated for this class.");
      }
      const className = inspectedClass?.name || "Class";
      const reportLabel = adminReportScope === "term"
        ? `${termLabel(Number(selectedAdminTerm))} ${selectedAdminAcademicYear}`
        : sequences.find((sequence: any) => sequence.id === selectedSequence)?.name || "Sequence";
      // One report card per page (fit-to-page, ordered, no page numbers) so each
      // student's card can be printed individually from the same document.
      await downloadReportCardsPdf(
        validCards.map((card) => buildCameroonReportCardHtml(card, { title: `${className} ${reportLabel} Report Card`, school: user?.school })),
        `${className.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${adminReportScope}-report-cards`,
      );
      toast({ title: "Report cards generated", description: `${validCards.length} report cards were prepared — one per page for individual printing.` });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Class report failed",
        description: error?.message || "The class report cards could not be generated.",
      });
    } finally {
      setIsGeneratingClassReports(false);
    }
  };

  const handlePublishClassReportCards = async () => {
    const canPublish = adminReportScope === "term"
      ? Boolean(selectedAdminTerm && selectedAdminAcademicYear && adminClassResults.length)
      : Boolean(selectedSequence && adminClassResults.length);
    if (!canPublish) {
      toast({ variant: "destructive", title: "Publish unavailable", description: "Choose a report period and load a class with students first." });
      return;
    }

    setIsPublishingReportCards(true);
    try {
      const result = await gradesService.publishReportCards({
        class_id: inspectedClass?.id,
        class_name: inspectedClass?.name || "",
        scope: adminReportScope === "term" ? "TERM" : "SEQUENCE",
        sequence_id: adminReportScope === "sequence" ? selectedSequence : undefined,
        term: adminReportScope === "term" ? Number(selectedAdminTerm) : undefined,
        academic_year: adminReportScope === "term" ? selectedAdminAcademicYear : undefined,
      });
      toast({
        title: "Report cards published",
        description: result?.message || "Students and parents can now view these report cards.",
      });
      setReloadNonce((current) => current + 1);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Publish failed",
        description: extractApiErrorMessage(error?.response?.data) || error?.message || "The report cards could not be published.",
      });
    } finally {
      setIsPublishingReportCards(false);
    }
  };

  const handlePublishAllSchool = async () => {
    const canPublish = adminReportScope === "term"
      ? Boolean(selectedAdminTerm && selectedAdminAcademicYear)
      : Boolean(selectedSequence);
    if (!canPublish) {
      toast({ variant: "destructive", title: "Choose a period", description: "Pick the sequence or term to publish for the whole school." });
      return;
    }
    setIsPublishingAllSchool(true);
    try {
      const result = await gradesService.publishAllReportCards({
        scope: adminReportScope === "term" ? "TERM" : "SEQUENCE",
        sequence_id: adminReportScope === "sequence" ? selectedSequence : undefined,
        term: adminReportScope === "term" ? Number(selectedAdminTerm) : undefined,
        academic_year: adminReportScope === "term" ? selectedAdminAcademicYear : undefined,
      });
      toast({
        title: "Report cards published",
        description: result?.message || "All eligible class report cards are now published for students and parents.",
      });
      setPublishAllOpen(false);
      setReloadNonce((current) => current + 1);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Publish failed",
        description: extractApiErrorMessage(error?.response?.data) || error?.message || "The report cards could not be published.",
      });
    } finally {
      setIsPublishingAllSchool(false);
    }
  };

  const getSystemStatus = (average: number) => {
    return average >= 10 ? "PASSED" : "FAILED";
  };

  const getSystemRemark = (average: number) => {
    if (average >= 16) return "Excellent Work";
    if (average >= 14) return "Very Good";
    if (average >= 12) return "Good Progress";
    if (average >= 10) return "Fair Effort";
    return "Needs Improvement";
  };

  const refreshTeacherClassResults = async () => {
    if (!selectedClassSubject || !selectedTeacherTermValue || !selectedSequence) return;
    try {
      const data = await loadTeacherGradeSheetData();
      applyTeacherGradeSheet(data);
    } catch (error: any) {
      console.error("Error refreshing class results:", error);
    }
  };

  const getGradeErrorMessage = (error: any) => (
    extractApiErrorMessage(error?.response?.data)
    || error?.message
    || "Could not save these marks right now."
  );

  const handleSaveGrade = async (studentId: string) => {
    const rawValue = gradeDrafts[studentId];
    const score = Number(rawValue);
    const subjectId = selectedTeacherSubject?.subject_id || selectedSubject;

    if (!subjectId || !selectedTeacherTermValue || !selectedSequence || !selectedClassSubject) {
      toast({ title: "Missing selection", description: "Choose the subject, term, and sequence first.", variant: "destructive" });
      return;
    }

    if (!canEditSelectedTeacherTerm) {
      toast({ title: "Term is view-only", description: "Teachers can only enter or edit marks in the active academic term.", variant: "destructive" });
      return;
    }

    if (rawValue === undefined || rawValue === "" || Number.isNaN(score) || score < 0 || score > 20) {
      toast({ title: "Invalid grade", description: "Enter a score between 0 and 20.", variant: "destructive" });
      return;
    }

    setSavingGradeFor(studentId);
    try {
      const existingGrade = existingGradeMap[studentId];
      const payload = {
        student: studentId,
        subject: subjectId,
        sequence: selectedSequence,
        score,
        comment: gradeCommentDrafts[studentId] || "",
      };

      const [savedGrade] = await gradesService.bulkCreateGrades({
        sequence_id: selectedSequence,
        class_subject_id: selectedClassSubject,
        grades: [payload],
      });

      setExistingGradeMap((current) => ({
        ...current,
        [studentId]: savedGrade || existingGrade,
      }));
      setGradeDrafts((current) => ({
        ...current,
        [studentId]: String(savedGrade?.score ?? score),
      }));
      setGradeCommentDrafts((current) => ({
        ...current,
        [studentId]: savedGrade?.comment ?? payload.comment,
      }));
      setEditingGradeRows((current) => ({
        ...current,
        [studentId]: false,
      }));
      await refreshTeacherClassResults();
      toast({ title: "Grade saved", description: "The student's mark has been recorded successfully." });
    } catch (error: any) {
      console.error("Error saving grade:", error);
      toast({
        title: "Failed to save grade",
        description: getGradeErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setSavingGradeFor(null);
    }
  };

  // Save every mark entered in the sheet in one request, so teachers fill
  // the whole class then commit once instead of saving row by row.
  const [isSavingAllGrades, setIsSavingAllGrades] = useState(false);
  const handleSaveAllGrades = async () => {
    const subjectId = selectedTeacherSubject?.subject_id || selectedSubject;
    if (!subjectId || !selectedTeacherTermValue || !selectedSequence || !selectedClassSubject) {
      toast({ title: "Missing selection", description: "Choose the subject, term, and sequence first.", variant: "destructive" });
      return;
    }
    if (!canEditSelectedTeacherTerm) {
      toast({ title: "Term is view-only", description: "Teachers can only enter or edit marks in the active academic term.", variant: "destructive" });
      return;
    }

    const grades: any[] = [];
    let invalidCount = 0;
    for (const [studentId, rawValue] of Object.entries(gradeDrafts)) {
      if (rawValue === undefined || rawValue === "") continue;
      const score = Number(rawValue);
      if (Number.isNaN(score) || score < 0 || score > 20) {
        invalidCount += 1;
        continue;
      }
      grades.push({
        student: studentId,
        subject: subjectId,
        sequence: selectedSequence,
        score,
        comment: gradeCommentDrafts[studentId] || "",
      });
    }
    if (grades.length === 0) {
      toast({ title: "Nothing to save", description: "Enter at least one mark between 0 and 20 first.", variant: "destructive" });
      return;
    }

    setIsSavingAllGrades(true);
    try {
      const saved = await gradesService.bulkCreateGrades({
        sequence_id: selectedSequence,
        class_subject_id: selectedClassSubject,
        grades,
      });
      const savedList = Array.isArray(saved) ? saved : [];
      setExistingGradeMap((current) => {
        const next = { ...current };
        for (const grade of savedList) {
          const sid = String(grade.student?.id ?? grade.student ?? "");
          if (sid) next[sid] = grade;
        }
        return next;
      });
      setEditingGradeRows({});
      await refreshTeacherClassResults();
      toast({
        title: "All marks saved",
        description: `${grades.length} mark(s) recorded in one batch.${invalidCount ? ` ${invalidCount} invalid entr(ies) were skipped.` : ""}`,
      });
    } catch (error: any) {
      console.error("Error saving all grades:", error);
      toast({ title: "Failed to save marks", description: getGradeErrorMessage(error), variant: "destructive" });
    } finally {
      setIsSavingAllGrades(false);
    }
  };

  const handleRetry = () => {
    setHasError(false);
    setReloadNonce((current) => current + 1);
  };

  if (hasError && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <AlertCircle className="w-12 h-12 text-destructive" />
        <h2 className="text-lg font-bold">Failed to Load Grades</h2>
        <p className="text-sm text-muted-foreground">Please try again.</p>
        <Button onClick={handleRetry}>
          <RotateCcw className="w-4 h-4 mr-2" /> Retry
        </Button>
      </div>
    );
  }

  // Admin View
  if (isAdmin) {
    if (adminView === "details" && inspectedClass) {
      const selectedSequenceLabel = sequences.find((sequence: any) => sequence.id === selectedSequence);
      const selectedReportLabel = adminReportScope === "term"
        ? `${termLabel(Number(selectedAdminTerm))} - ${selectedAdminAcademicYear || "Academic Year"}`
        : selectedSequenceLabel
          ? `${selectedSequenceLabel.name} - ${termLabel(Number(selectedSequenceLabel.term))}`
          : "Choose a sequence";
      return (
        <div className="space-y-8 pb-20 animate-in fade-in duration-500">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <Button
                variant="ghost"
                className="mb-3 gap-2 px-0 font-bold text-primary"
                onClick={() => {
                  setAdminView("list");
                  setInspectedClass(null);
                  setAdminReportCard(null);
                }}
              >
                <ArrowLeft className="h-4 w-4" /> Back to Classes
              </Button>
              <h1 className="text-3xl font-bold text-primary font-headline uppercase tracking-tighter">{inspectedClass.name}</h1>
              <p className="text-muted-foreground mt-1 text-sm">
                Class report-card control room for {inspectedClass.subSchoolName || "Main School"}.
              </p>
            </div>
            <div className="flex flex-col gap-2 lg:flex-row">
              <Select value={adminReportScope} onValueChange={(value: "sequence" | "term") => setAdminReportScope(value)}>
                <SelectTrigger className="h-11 min-w-[175px] rounded-xl bg-white">
                  <SelectValue placeholder="Report type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sequence">Sequence Report</SelectItem>
                  <SelectItem value="term">Term Report</SelectItem>
                </SelectContent>
              </Select>
              {adminReportScope === "sequence" ? (
                <Select
                  value={selectedSequence}
                  onValueChange={(value) => {
                    setSelectedSequence(value);
                    const sequence = sequences.find((item: any) => item.id === value);
                    if (sequence) {
                      setSelectedAdminTerm(String(sequence.term || ""));
                      setSelectedAdminAcademicYear(String(sequence.academic_year || ""));
                    }
                  }}
                >
                  <SelectTrigger className="h-11 min-w-[240px] rounded-xl bg-white">
                    <SelectValue placeholder="Choose sequence" />
                  </SelectTrigger>
                  <SelectContent>
                    {sequences.map((sequence: any) => (
                      <SelectItem key={sequence.id} value={sequence.id}>
                        {formatSequenceLabel(sequence)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select
                  value={selectedAdminTermValue}
                  onValueChange={(value) => {
                    const [term, academicYear] = value.split("|");
                    setSelectedAdminTerm(term);
                    setSelectedAdminAcademicYear(academicYear);
                  }}
                >
                  <SelectTrigger className="h-11 min-w-[240px] rounded-xl bg-white">
                    <SelectValue placeholder="Choose term" />
                  </SelectTrigger>
                  <SelectContent>
                    {adminTermOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label} ({option.sequenceCount} seq.)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button variant="outline" className="gap-2 rounded-xl bg-white font-bold" onClick={() => setReloadNonce((current) => current + 1)}>
                <RotateCcw className="h-4 w-4" /> Refresh
              </Button>
              <Button
                className="gap-2 rounded-xl font-bold"
                onClick={handleDownloadClassReportCards}
                disabled={
                  isGeneratingClassReports
                  || !adminClassResults.length
                  || (adminReportScope === "sequence" ? !selectedSequence : !selectedAdminTermValue)
                }
              >
                {isGeneratingClassReports ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                Generate Report Cards
              </Button>
              <Button
                className="gap-2 rounded-xl bg-emerald-600 font-bold text-white hover:bg-emerald-700"
                onClick={handlePublishClassReportCards}
                disabled={
                  isPublishingReportCards
                  || !adminClassResults.length
                  || (adminReportScope === "sequence" ? !selectedSequence : !selectedAdminTermValue)
                }
              >
                {isPublishingReportCards ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Publish for Students & Parents
              </Button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-5">
            {[
              { label: "Students", value: inspectedClass.students || 0, tone: "bg-primary text-white" },
              { label: "Teachers", value: inspectedClass.teachers || 0, tone: "bg-blue-50 text-blue-700" },
              { label: "Avg Mark", value: `${Number(inspectedClass.averageMark || 0).toFixed(2)}/20`, tone: "bg-green-50 text-green-700" },
              { label: "Performance", value: `${Math.round(Number(inspectedClass.performance || 0))}%`, tone: "bg-amber-50 text-amber-700" },
              { label: "Marks Entered", value: inspectedClass.marksEntered || 0, tone: "bg-white text-primary" },
            ].map((stat) => (
              <Card key={stat.label} className={cn("border-none shadow-sm", stat.tone)}>
                <CardContent className="p-4">
                  <p className="text-xs font-bold uppercase opacity-70">{stat.label}</p>
                  <p className="mt-1 text-2xl font-black">{stat.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {adminClassError ? (
            <Card className="border-destructive/30 bg-destructive/5">
              <CardContent className="flex items-center gap-3 p-5 text-destructive">
                <AlertCircle className="h-5 w-5" />
                <span className="text-sm font-semibold">{adminClassError}</span>
              </CardContent>
            </Card>
          ) : null}

          {adminReportScope === "sequence" && !selectedSequence ? (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="flex items-center gap-3 p-5 text-amber-800">
                <AlertCircle className="h-5 w-5" />
                <span className="text-sm font-semibold">No academic sequence is available yet. Configure the Cameroon academic calendar before generating report cards.</span>
              </CardContent>
            </Card>
          ) : null}

          {adminReportScope === "term" && !selectedAdminTermValue ? (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="flex items-center gap-3 p-5 text-amber-800">
                <AlertCircle className="h-5 w-5" />
                <span className="text-sm font-semibold">Choose a Cameroon academic term before generating term report cards.</span>
              </CardContent>
            </Card>
          ) : null}

          <Card className="border-none bg-white shadow-sm">
            <CardHeader>
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>Class Report Cards</CardTitle>
                  <CardDescription>
                    {adminReportScope === "term"
                      ? `${selectedReportLabel}. Term report cards combine both sequences in the selected term.`
                      : `${selectedReportLabel}. Sequence report cards use the selected sequence only.`}
                  </CardDescription>
                </div>
                <Badge variant="secondary" className="w-fit">
                  Cameroon scale: 0-20, pass mark 10
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Student</TableHead>
                      <TableHead>Admission No.</TableHead>
                      <TableHead>Average</TableHead>
                      <TableHead>Rank</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isAdminClassLoading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                          <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" />
                          Loading class report cards...
                        </TableCell>
                      </TableRow>
                    ) : adminClassResults.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                          No students or marks were found for this class and sequence yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      adminClassResults.map((row, index) => {
                        const average = Number(row.average || 0);
                        return (
                          <TableRow key={row.student_id || `${row.student_name}-${index}`}>
                            <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                            <TableCell className="font-bold text-primary">{row.student_name}</TableCell>
                            <TableCell>{row.admission_number || "-"}</TableCell>
                            <TableCell className="font-black">{average.toFixed(2)}/20</TableCell>
                            <TableCell>{row.rank || "N/A"}</TableCell>
                            <TableCell>
                              <Badge className={cn(average >= 10 ? "bg-green-600" : "bg-destructive")}>
                                {getSystemStatus(average)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-2 rounded-xl"
                                onClick={() => handleViewAdminReportCard(row)}
                                disabled={
                                  isAdminReportLoading
                                  || !row.student_id
                                  || (adminReportScope === "sequence" ? !selectedSequence : !selectedAdminTermValue)
                                }
                              >
                                {isAdminReportLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                                View / Generate
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Dialog open={Boolean(adminReportCard)} onOpenChange={(open) => !open && setAdminReportCard(null)}>
            <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Student Report Card</DialogTitle>
                <DialogDescription>
                  Review the generated report card before printing or downloading.
                </DialogDescription>
              </DialogHeader>
              {adminReportCard ? (
                <div className="space-y-5">
                  <div dangerouslySetInnerHTML={{ __html: buildCameroonReportCardHtml(adminReportCard, { title: "Report Card", school: user?.school }) }} />
                  <DialogFooter className="gap-2 sm:justify-end">
                    <Button variant="outline" onClick={() => window.print()} className="gap-2 rounded-xl">
                      <Printer className="h-4 w-4" /> Print
                    </Button>
                    <Button
                      className="gap-2 rounded-xl"
                      onClick={() => {
                        void downloadReportCardsPdf([buildCameroonReportCardHtml(adminReportCard, { title: "Report Card", school: user?.school })], `${(adminReportCard.student?.name || "student").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-report-card`);
                      }}
                    >
                      <Download className="h-4 w-4" /> Download
                    </Button>
                  </DialogFooter>
                </div>
              ) : null}
            </DialogContent>
          </Dialog>
        </div>
      );
    }

    return (
      <div className="space-y-8 pb-20 animate-in fade-in duration-500">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-primary font-headline uppercase tracking-tighter">Academic Governance</h1>
            <p className="text-muted-foreground mt-1 text-sm">Audit class-level report cards and pedagogical performance.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              className="rounded-xl h-11 px-6 font-bold gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => setPublishAllOpen(true)}
            >
              <ShieldCheck className="w-4 h-4" /> Publish Entire School
            </Button>
            <Button variant="outline" className="rounded-xl h-11 px-6 font-bold bg-white" onClick={() => handleDownload("Global Performance Audit")}>
              <FileDown className="w-4 h-4 mr-2" /> Global Audit
            </Button>
          </div>
        </div>

        <Dialog open={publishAllOpen} onOpenChange={(open) => { if (!isPublishingAllSchool) setPublishAllOpen(open); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-primary">
                <ShieldCheck className="h-5 w-5 text-emerald-600" /> Publish Entire School
              </DialogTitle>
              <DialogDescription>
                Publish report cards for every class in the school at once. Choose the period below; classes with no marks yet are skipped automatically.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-1">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Report Type</label>
                <Select value={adminReportScope} onValueChange={(value: "sequence" | "term") => setAdminReportScope(value)}>
                  <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Report type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sequence">Sequence Report</SelectItem>
                    <SelectItem value="term">Term Report</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {adminReportScope === "sequence" ? (
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Sequence</label>
                  <Select
                    value={selectedSequence}
                    onValueChange={(value) => {
                      setSelectedSequence(value);
                      const sequence = sequences.find((item: any) => item.id === value);
                      if (sequence) {
                        setSelectedAdminTerm(String(sequence.term || ""));
                        setSelectedAdminAcademicYear(String(sequence.academic_year || ""));
                      }
                    }}
                  >
                    <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Choose sequence" /></SelectTrigger>
                    <SelectContent>
                      {sequences.map((sequence: any) => (
                        <SelectItem key={sequence.id} value={sequence.id}>{formatSequenceLabel(sequence)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Term</label>
                  <Select
                    value={selectedAdminTermValue}
                    onValueChange={(value) => {
                      const [term, academicYear] = value.split("|");
                      setSelectedAdminTerm(term);
                      setSelectedAdminAcademicYear(academicYear);
                    }}
                  >
                    <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Choose term" /></SelectTrigger>
                    <SelectContent>
                      {adminTermOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label} ({option.sequenceCount} seq.)</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPublishAllOpen(false)} disabled={isPublishingAllSchool}>Cancel</Button>
              <Button
                className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={handlePublishAllSchool}
                disabled={isPublishingAllSchool || (adminReportScope === "sequence" ? !selectedSequence : !selectedAdminTermValue)}
              >
                {isPublishingAllSchool ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Publish All
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Card className="border-none shadow-sm bg-white">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-black text-primary flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-secondary" />
              Marks Submission Deadline
            </CardTitle>
            <CardDescription>
              Set and edit the latest date teachers may fill their marks for a sequence or term.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-[1.2fr_1fr_auto] md:items-end">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Sequence / Term</label>
              <Select value={deadlineSequenceId} onValueChange={handleSelectDeadlineSequence}>
                <SelectTrigger className="h-11 rounded-xl bg-white"><SelectValue placeholder="Choose sequence" /></SelectTrigger>
                <SelectContent>
                  {sequences.map((sequence: any) => (
                    <SelectItem key={sequence.id} value={sequence.id}>
                      {sequence.name} — {termLabel(Number(sequence.term))} ({sequence.academic_year}){sequence.is_active ? " • Active" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Latest submission date</label>
              <Input
                type="date"
                value={deadlineDate || ""}
                onChange={(event) => setDeadlineDate(event.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
            <Button
              onClick={handleSaveMarksDeadline}
              disabled={!deadlineSequenceId || savingDeadline}
              className="h-11 rounded-xl font-black gap-2"
            >
              {savingDeadline ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
              Save Deadline
            </Button>
          </CardContent>
        </Card>

        {(() => {
          const subSchoolOptions = Array.from(
            new Set(classes.map((cls: any) => cls.subSchoolName || "Main School"))
          ).sort();
          if (subSchoolOptions.length <= 1) return null;
          return (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Filter by sub-school:
              </span>
              {["all", ...subSchoolOptions].map((option) => (
                <button
                  key={option}
                  onClick={() => setAdminSubSchoolFilter(option)}
                  className={cn(
                    "rounded-full px-4 py-1.5 text-xs font-bold transition-all",
                    adminSubSchoolFilter === option
                      ? "bg-primary text-white shadow-sm"
                      : "bg-white text-muted-foreground ring-1 ring-black/[0.06]"
                  )}
                >
                  {option === "all" ? "All sub-schools" : option}
                </button>
              ))}
            </div>
          );
        })()}

        {cycleClasses.length > 0 ? (
          <Card className="border-none shadow-sm bg-white">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-black text-primary flex items-center gap-2">
                <Layers className="h-5 w-5 text-secondary" />
                Class Cycles
              </CardTitle>
              <CardDescription>
                Assign each class to the First or Second Cycle. This appears on report cards.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {cycleClasses.map((cls: any) => (
                <div key={cls.id} className="flex items-center justify-between gap-3 rounded-xl border border-accent/60 bg-accent/10 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-primary">{cls.name}</p>
                    {cls.sub_school_name ? <p className="truncate text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{cls.sub_school_name}</p> : null}
                  </div>
                  <Select value={cls.cycle || "first"} onValueChange={(v) => handleSetClassCycle(String(cls.id), v)} disabled={savingCycleId === String(cls.id)}>
                    <SelectTrigger className="h-9 w-[130px] rounded-lg bg-white text-xs font-bold shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="first">First Cycle</SelectItem>
                      <SelectItem value="second">Second Cycle</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 bg-gray-200 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {classes.filter((cls: any) =>
              adminSubSchoolFilter === "all" ||
              (cls.subSchoolName || "Main School") === adminSubSchoolFilter
            ).map((cls) => (
              <Card
                key={cls.id}
                className="border-none shadow-sm overflow-hidden group hover:shadow-md transition-all bg-white cursor-pointer"
                onClick={() => {
                  setInspectedClass(cls);
                  setAdminView("details");
                }}
              >
                <div className={cn("h-1.5 w-full", cls.performance >= 80 ? "bg-green-500" : "bg-amber-500")} />
                <CardHeader className="pb-2">
                  <CardTitle className="text-xl font-black text-primary uppercase leading-tight">{cls.name}</CardTitle>
                  <CardDescription className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 mt-1">
                    <Users className="w-3.5 h-3.5" /> {cls.students} Students
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex justify-between items-center text-xs mb-2">
                      <span className="text-muted-foreground font-bold">Academic Performance</span>
                      <span className="font-bold text-primary">{cls.performance}%</span>
                    </div>
                    <Progress value={cls.performance} className="h-2" />
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div>
                      <p className="text-[9px] text-muted-foreground font-bold uppercase">Avg Mark</p>
                      <p className="text-lg font-black text-primary">{cls.averageMark?.toFixed(1) || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-muted-foreground font-bold uppercase">Teachers</p>
                      <p className="text-lg font-black text-blue-600">{cls.teachers}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Student View
  if (isStudent) {
    const selectedStudentTermLabel = studentTermOptions.find((option) => option.value === selectedStudentTerm)?.label || "Selected Term";
    const selectedStudentSequenceLabel = sequences.find((sequence: any) => sequence.id === selectedSequence)?.name || "Selected Sequence";
    const testMarks = studentTestGrades.map((grade: any) => {
      const score = Number(grade.score ?? 0);
      return {
        id: grade.id || `${grade.subject_name}-${grade.sequence_name}-${score}`,
        subject: grade.subject?.name || grade.subject_name || "Unknown Subject",
        teacher: grade.teacher?.name || grade.teacher_name || "Teacher",
        sequence: grade.sequence?.name || grade.sequence_name || "Sequence",
        term: grade.sequence?.term || grade.term || "",
        score,
        comment: grade.comment || "",
        status: score >= 10 ? "Passed" : "Needs Improvement",
      };
    });
    // Same dynamic per-subject ledger the parent account uses: one column for
    // EVERY sequence that already has marks, regardless of the active term.
    const studentLedger = buildSequenceLedger(studentTestGrades);

    return (
      <div className="space-y-8 pb-20">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-primary font-headline uppercase tracking-tighter">My Grades</h1>
            <p className="text-muted-foreground mt-1 text-sm">View your academic performance and report cards.</p>
          </div>
          {reportCard && (
            <div className="flex gap-2">
              <Button variant="outline" className="rounded-xl h-11 px-5 font-bold" onClick={() => window.print()}>
                <Printer className="w-4 h-4 mr-2" /> Print
              </Button>
              <Button variant="outline" className="rounded-xl h-11 px-6 font-bold" onClick={() => handleDownload("My Report Card")} disabled={isGeneratingReportPdf}>
                {isGeneratingReportPdf ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                {isGeneratingReportPdf ? "Preparing PDF" : "Download Report"}
              </Button>
            </div>
          )}
        </div>

        <Tabs defaultValue="report-cards" className="w-full">
          <TabsList className="grid w-full grid-cols-2 rounded-2xl border bg-white p-1.5 shadow-sm">
            <TabsTrigger value="report-cards" className="gap-2 rounded-xl py-3 text-xs font-bold sm:text-sm">
              <FileBadge className="h-4 w-4" /> Term Report Cards
            </TabsTrigger>
            <TabsTrigger value="test" className="gap-2 rounded-xl py-3 text-xs font-bold sm:text-sm">
              <FileSpreadsheet className="h-4 w-4" /> Test
            </TabsTrigger>
          </TabsList>

          <TabsContent value="report-cards" className="mt-6 space-y-6">
            <Card className="border-none bg-white shadow-sm">
              <CardHeader>
                <CardTitle>Published Academic Records</CardTitle>
                <CardDescription>
                  Sequence and term report cards appear here after the school administration publishes them.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase">Report Type</Label>
                  <Select value={studentReportScope} onValueChange={(value: "sequence" | "term") => setStudentReportScope(value)}>
                    <SelectTrigger className="h-12 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sequence">Sequence Report Card</SelectItem>
                      <SelectItem value="term">Term Report Card</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className={cn("space-y-2", studentReportScope === "term" ? "md:col-span-2" : "md:col-span-2")}>
                  <Label className="text-xs font-bold uppercase">
                    {studentReportScope === "term" ? "Select Term" : "Select Sequence"}
                  </Label>
                  {studentReportScope === "term" ? (
                    <Select value={selectedStudentTerm} onValueChange={setSelectedStudentTerm}>
                      <SelectTrigger className="h-12 rounded-xl">
                        <SelectValue placeholder="Choose term..." />
                      </SelectTrigger>
                      <SelectContent>
                        {studentTermOptions.map((term) => (
                          <SelectItem key={term.value} value={term.value}>
                            {term.label} ({term.count} {term.count === 1 ? "sequence" : "sequences"})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select value={selectedSequence} onValueChange={setSelectedSequence}>
                      <SelectTrigger className="h-12 rounded-xl">
                        <SelectValue placeholder="Choose sequence..." />
                      </SelectTrigger>
                      <SelectContent>
                        {sequences.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name} - {termLabel(Number(s.term))} - {s.academic_year}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </CardContent>
            </Card>

            {!reportCard ? (
              <Card className={cn("border-dashed bg-white", reportCardError ? "border-amber-200 bg-amber-50" : "")}>
                <CardContent className="py-12 text-center">
                  <FileBadge className={cn("mx-auto mb-3 h-8 w-8", reportCardError ? "text-amber-600" : "text-muted-foreground")} />
                  <p className={cn("font-bold", reportCardError ? "text-amber-800" : "text-muted-foreground")}>
                    {reportCardError || `Select ${studentReportScope === "term" ? "a term" : "a sequence"} to view your published report card.`}
                  </p>
                  <p className="mx-auto mt-2 max-w-xl text-xs text-muted-foreground">
                    Previous class records are kept in Previous Classes. This tab shows current-class report cards after the school publishes them.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div
                id="student-grade-report"
                dangerouslySetInnerHTML={{
                  __html: buildCameroonReportCardHtml(reportCard, {
                    title: studentReportScope === "term" ? `${selectedStudentTermLabel} Report Card` : `${selectedStudentSequenceLabel} Report Card`,
                    school: user?.school,
                    student: studentProfile,
                  }),
                }}
              />
            )}
          </TabsContent>

          <TabsContent value="test" className="mt-6">
            <Card className="border-none shadow-xl overflow-hidden rounded-[2.5rem] bg-white">
              <CardHeader className="bg-primary p-8 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl font-black uppercase tracking-tighter">Test Marks Follow-up</CardTitle>
                    <CardDescription className="text-white/60">Teacher-saved marks for academic follow-up before official reports are released.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader className="bg-accent/10">
                    <TableRow className="uppercase text-[10px] font-black tracking-widest border-b">
                      <TableHead className="pl-8 py-4">Subject</TableHead>
                      <TableHead className="text-center">Coefficient</TableHead>
                      {studentLedger.columns.map((col) => (
                        <TableHead key={col.id} className="text-center bg-primary/5">{col.label}</TableHead>
                      ))}
                      <TableHead className="text-center">Average</TableHead>
                      <TableHead className="text-right pr-8">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isStudentTestLoading ? (
                      <TableRow>
                        <TableCell colSpan={4 + studentLedger.columns.length} className="py-10 text-center text-muted-foreground">
                          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                          Loading saved marks...
                        </TableCell>
                      </TableRow>
                    ) : studentLedger.rows.length > 0 ? (
                      studentLedger.rows.map((g, idx: number) => (
                        <TableRow key={idx} className="h-16 border-b last:border-0 hover:bg-accent/5 transition-colors">
                          <TableCell className="pl-8 font-black uppercase text-xs text-primary">{g.subject}</TableCell>
                          <TableCell className="text-center font-mono font-bold">{g.coef}</TableCell>
                          {studentLedger.columns.map((col) => (
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
                        <TableCell colSpan={4 + studentLedger.columns.length} className="py-10 text-center text-sm text-muted-foreground">
                          Your teachers have not saved any marks yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  // Teacher View
  if (isTeacher) {
    return (
      <div className="space-y-8 pb-20">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-primary font-headline uppercase tracking-tighter">Enter Marks</h1>
            <p className="text-muted-foreground mt-1 text-sm">Record only the marks for subjects and classes assigned to you.</p>
          </div>
        </div>

        <Tabs defaultValue="entry" className="w-full">
          <TabsList className="grid w-full mb-8 bg-white shadow-sm border h-auto p-1.5 rounded-2xl grid-cols-2">
            <TabsTrigger value="entry" className="gap-2 py-3 rounded-xl transition-all font-bold text-xs sm:text-sm">
              <Award className="w-4 h-4" /> Enter Marks
            </TabsTrigger>
            <TabsTrigger value="results" className="gap-2 py-3 rounded-xl transition-all font-bold text-xs sm:text-sm">
              <LayoutGrid className="w-4 h-4" /> My Marks Summary
            </TabsTrigger>
          </TabsList>

          <TabsContent value="entry" className="space-y-6">
            <div className="grid grid-cols-1 gap-4 rounded-3xl border bg-white p-5 shadow-sm md:grid-cols-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase">Class / Sub-school</Label>
                <Select
                  value={selectedTeacherClass?.id || ""}
                  onValueChange={(value) => {
                    const nextClass = teacherSheetClasses.find((item) => item.id === value);
                    const firstSubject = nextClass?.subjects?.[0];
                    setSelectedTeacherClassId(value);
                    setSelectedClass(nextClass?.name || "");
                    setSelectedClassSubject(firstSubject?.id || "");
                    setSelectedSubject(firstSubject?.subject_id || "");
                  }}
                  disabled={isTeacherSheetLoading || !teacherSheetClasses.length}
                >
                  <SelectTrigger className="h-12 rounded-xl">
                    <SelectValue placeholder={isTeacherSheetLoading ? "Loading classes..." : "Choose class"} />
                  </SelectTrigger>
                  <SelectContent>
                    {teacherSheetClasses.map((cls) => (
                      <SelectItem key={cls.id} value={cls.id}>
                        {cls.name} ({cls.sub_school_name || "Main School"})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase">Subject</Label>
                <Select
                  value={selectedTeacherSubject?.id || ""}
                  onValueChange={(value) => {
                    const subject = teacherSheetSubjects.find((item) => item.id === value);
                    setSelectedClassSubject(value);
                    setSelectedSubject(subject?.subject_id || "");
                    if (subject) {
                      setSelectedClass(subject.class_name);
                      setSelectedTeacherClassId(subject.class_id);
                    }
                  }}
                  disabled={isTeacherSheetLoading || !teacherSheetSubjects.length}
                >
                  <SelectTrigger className="h-12 rounded-xl">
                    <SelectValue placeholder={isTeacherSheetLoading ? "Loading subjects..." : "Choose subject"} />
                  </SelectTrigger>
                  <SelectContent>
                    {teacherSheetSubjects.map((subject) => (
                      <SelectItem key={subject.id} value={subject.id}>
                        {subject.subject_name} ({subject.subject_code || "No code"}) - Coef. {subject.coefficient}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase">Term</Label>
                <Select
                  value={selectedTeacherTermValue}
                  onValueChange={(value) => {
                    setSelectedTeacherTerm(value);
                    const firstSequenceForTerm = (teacherSheet?.sequences ?? []).find((sequence) => String(sequence.term) === value);
                    setSelectedSequence(firstSequenceForTerm?.id || "");
                  }}
                  disabled={isTeacherSheetLoading || !teacherSheetTerms.length}
                >
                  <SelectTrigger className="h-12 rounded-xl">
                    <SelectValue placeholder={isTeacherSheetLoading ? "Loading terms..." : "Choose term"} />
                  </SelectTrigger>
                  <SelectContent>
                    {teacherSheetTerms.map((term) => (
                      <SelectItem key={term.term} value={String(term.term)}>
                        {term.label} ({term.sequence_count} {term.sequence_count === 1 ? "sequence" : "sequences"})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase">Sequence</Label>
                <Select value={selectedSequence} onValueChange={setSelectedSequence} disabled={isTeacherSheetLoading || !teacherTermSequences.length}>
                  <SelectTrigger className="h-12 rounded-xl">
                    <SelectValue placeholder={isTeacherSheetLoading ? "Loading sequences..." : "Choose sequence"} />
                  </SelectTrigger>
                  <SelectContent>
                    {teacherTermSequences.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {formatSequenceLabel(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <Card className="border-none bg-primary text-white shadow-sm">
                <CardContent className="p-4">
                  <p className="text-xs font-bold uppercase text-white/70">Assigned Students</p>
                  <p className="mt-1 text-3xl font-black">{teacherSheet?.summary.total_students ?? 0}</p>
                </CardContent>
              </Card>
              <Card className="border-none bg-green-50 shadow-sm">
                <CardContent className="p-4">
                  <p className="text-xs font-bold uppercase text-green-700">Marks Entered</p>
                  <p className="mt-1 text-3xl font-black text-green-700">{teacherSheet?.summary.entered ?? 0}</p>
                </CardContent>
              </Card>
              <Card className="border-none bg-amber-50 shadow-sm">
                <CardContent className="p-4">
                  <p className="text-xs font-bold uppercase text-amber-700">Pending</p>
                  <p className="mt-1 text-3xl font-black text-amber-700">{teacherSheet?.summary.pending ?? 0}</p>
                </CardContent>
              </Card>
              <Card className="border-none bg-white shadow-sm">
                <CardContent className="p-4">
                  <p className="text-xs font-bold uppercase text-muted-foreground">Cameroon Scale</p>
                  <p className="mt-1 text-lg font-black text-primary">0-20 / Pass 10</p>
                </CardContent>
              </Card>
            </div>

            {teacherSheetError ? (
              <Card className="border-destructive/30 bg-destructive/5">
                <CardContent className="flex items-center gap-3 p-5 text-destructive">
                  <AlertCircle className="h-5 w-5" />
                  <span className="text-sm font-semibold">{teacherSheetError}</span>
                </CardContent>
              </Card>
            ) : null}

            {!teacherSheetError && teacherSheetClasses.length > 0 && teacherSheetTerms.length === 0 ? (
              <Card className="border-amber-200 bg-amber-50">
                <CardContent className="flex items-center gap-3 p-5 text-amber-800">
                  <AlertCircle className="h-5 w-5" />
                  <span className="text-sm font-semibold">
                    No academic terms or sequences have been configured yet. Students are shown below, but marks can be saved after the school calendar is generated.
                  </span>
                </CardContent>
              </Card>
            ) : null}

            {!teacherSheetError && selectedTeacherTermValue && !canEditSelectedTeacherTerm ? (
              <Card className="border-blue-200 bg-blue-50">
                <CardContent className="flex items-center gap-3 p-5 text-blue-800">
                  <Info className="h-5 w-5" />
                  <span className="text-sm font-semibold">
                    This term is view-only. Teachers can enter, submit, and edit marks only in the active academic term.
                  </span>
                </CardContent>
              </Card>
            ) : null}

            <Card className="border-none shadow-sm bg-white">
              <CardHeader>
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <CardTitle>Student Mark Entry Sheet</CardTitle>
                    <CardDescription>
                      {selectedTeacherSubject
                        ? `${selectedTeacherSubject.subject_name} - ${selectedTeacherSubject.class_name} (${selectedTeacherSubject.sub_school_name})`
                        : "Select a class, subject, and sequence to enter marks."}
                    </CardDescription>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    {selectedTeacherSequence ? (
                      <Badge variant="secondary" className="w-fit">
                        {termLabel(selectedTeacherSequence.term)} - {selectedTeacherSequence.name}
                      </Badge>
                    ) : null}
                    {selectedTeacherTermValue ? (
                      <Badge className={cn("w-fit", canEditSelectedTeacherTerm ? "bg-green-600" : "bg-blue-600")}>
                        {canEditSelectedTeacherTerm ? "Active term" : "View-only term"}
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {selectedTeacherSequence?.marks_deadline ? (() => {
                  const deadline = new Date(selectedTeacherSequence.marks_deadline as string);
                  const overdue = !Number.isNaN(deadline.getTime()) && deadline < new Date(new Date().toDateString());
                  return (
                    <div className={cn(
                      "mb-4 flex items-center gap-2 rounded-xl border p-3 text-xs font-bold",
                      overdue ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-800"
                    )}>
                      <CalendarClock className="h-4 w-4 shrink-0" />
                      {overdue
                        ? `Marks submission deadline passed on ${deadline.toLocaleDateString()}. Please contact your administration.`
                        : `Latest date to submit marks for this sequence: ${deadline.toLocaleDateString()}.`}
                    </div>
                  );
                })() : null}
                <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-primary/15 bg-primary/5 p-3">
                  <p className="text-xs font-semibold text-muted-foreground">
                    Enter marks for the whole class, then record everything with one click.
                  </p>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="outline"
                      className="gap-2 rounded-xl border-primary/20 font-bold text-primary"
                      onClick={() => {
                        if (!teacherClassStudents || teacherClassStudents.length === 0) {
                          toast({
                            variant: "destructive",
                            title: "Nothing to download",
                            description: "Select a class, subject and sequence with students loaded before downloading the marks sheet.",
                          });
                          return;
                        }
                        try {
                          generateBrandedTablePdf({
                            title: `Marks Sheet — ${selectedTeacherSubject?.subject_name || "Subject"}`,
                            subtitle: `${selectedTeacherSubject?.class_name || ""} • ${selectedTeacherSequence?.name || ""} (${selectedTeacherSequence?.academic_year || ""})`,
                            schoolName: user?.school?.name || "EduIgnite",
                            columns: ["#", "Student", "Matricule", "Admission No.", "Mark /20", "Remark"],
                            rows: teacherClassStudents.map((s: any) => [
                              s.index,
                              s.name,
                              s.matricule || "—",
                              s.admission_number || "—",
                              existingGradeMap[s.id]?.score ?? gradeDrafts[s.id] ?? "—",
                              existingGradeMap[s.id]?.comment || gradeCommentDrafts[s.id] || "",
                            ]),
                            fileName: `marks-${(selectedTeacherSubject?.class_name || "class").replace(/\s+/g, "-").toLowerCase()}`,
                            footnote: `Total: ${teacherClassStudents.length} student(s)`,
                          });
                          toast({ title: "Marks sheet downloaded", description: "Your marks sheet PDF has been generated." });
                        } catch (error) {
                          toast({
                            variant: "destructive",
                            title: "Download failed",
                            description: error instanceof Error ? error.message : "Could not generate the marks sheet PDF.",
                          });
                        }
                      }}
                    >
                      <FileText className="h-4 w-4" /> Download PDF
                    </Button>
                    <Button
                      className="gap-2 rounded-xl font-black uppercase text-[11px] tracking-widest"
                      onClick={handleSaveAllGrades}
                      disabled={isSavingAllGrades || Boolean(savingGradeFor)}
                    >
                      {isSavingAllGrades ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save All Marks
                    </Button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Student</TableHead>
                        <TableHead>Matricule</TableHead>
                        <TableHead>Admission No.</TableHead>
                        <TableHead>Current</TableHead>
                        <TableHead>Mark /20</TableHead>
                        <TableHead>Comment</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isTeacherSheetLoading ? (
                        <TableRow>
                          <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                            <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" />
                            Loading assigned students...
                          </TableCell>
                        </TableRow>
                      ) : teacherSheetClasses.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                            No class or subject has been assigned to your teacher account yet.
                          </TableCell>
                        </TableRow>
                      ) : teacherSheetTerms.length > 0 && teacherTermSequences.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                            No sequence has been configured for the selected term.
                          </TableCell>
                        </TableRow>
                      ) : teacherClassStudents.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                            No active students are registered for this class subject.
                          </TableCell>
                        </TableRow>
                      ) : (
                        teacherClassStudents.map((student: TeacherSheetStudent) => {
                          const hasExistingGrade = Boolean(existingGradeMap[student.id]?.id || student.grade?.id);
                          const isEditingRow = Boolean(editingGradeRows[student.id]);
                          const canEditRow = canEditSelectedTeacherTerm && (!hasExistingGrade || isEditingRow);
                          return (
                          <TableRow key={student.id}>
                            <TableCell className="text-muted-foreground">{student.index}</TableCell>
                            <TableCell>
                              <div>
                                <p className="font-bold text-primary">{student.name}</p>
                                <p className="text-xs text-muted-foreground">{student.class_name} - {student.sub_school_name}</p>
                              </div>
                            </TableCell>
                            <TableCell className="text-xs font-semibold">{student.matricule || "-"}</TableCell>
                            <TableCell className="text-xs">{student.admission_number || "-"}</TableCell>
                            <TableCell>
                              {existingGradeMap[student.id]?.score !== undefined && existingGradeMap[student.id]?.score !== null
                                ? `${existingGradeMap[student.id].score}/20`
                                : "Not set"}
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                step="0.25"
                                placeholder="Mark"
                                className="h-9 w-24 rounded-lg"
                                max="20"
                                min="0"
                                value={gradeDrafts[student.id] ?? ""}
                                disabled={!canEditRow || !selectedTeacherTermValue || !selectedSequence}
                                onChange={(e) => setGradeDrafts((current) => ({ ...current, [student.id]: e.target.value }))}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                placeholder="Short remark"
                                className="h-9 min-w-[180px] rounded-lg"
                                value={gradeCommentDrafts[student.id] ?? ""}
                                disabled={!canEditRow || !selectedTeacherTermValue || !selectedSequence}
                                onChange={(event) => setGradeCommentDrafts((current) => ({ ...current, [student.id]: event.target.value }))}
                              />
                            </TableCell>
                            <TableCell>
                              <Badge className={cn(student.status === "entered" ? "bg-green-600" : "bg-amber-500")}>
                                {student.status === "entered" ? "Entered" : "Pending"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {!canEditSelectedTeacherTerm ? (
                                <Badge variant="outline" className="border-blue-200 text-blue-700">View only</Badge>
                              ) : hasExistingGrade && !isEditingRow ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-2 text-xs"
                                  onClick={() => setEditingGradeRows((current) => ({ ...current, [student.id]: true }))}
                                >
                                  <FileEdit className="h-3 w-3" />
                                  Edit
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-2 text-xs"
                                  onClick={() => handleSaveGrade(student.id)}
                                  disabled={savingGradeFor === student.id || !selectedTeacherTermValue || !selectedSequence}
                                >
                                  {savingGradeFor === student.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                                  Save
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="results" className="space-y-6">
            <Card className="border-none shadow-sm bg-white overflow-hidden">
              <CardHeader>
                <CardTitle>My Marks Summary</CardTitle>
                <CardDescription>
                  Only marks for your selected class-subject are shown here. Other teachers' marks stay private.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead>Class</TableHead>
                        <TableHead>Sequence</TableHead>
                        <TableHead>Mark</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Remark</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isTeacherSheetLoading ? (
                        <TableRow>
                          <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                            <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" />
                            Loading marks summary...
                          </TableCell>
                        </TableRow>
                      ) : teacherClassStudents.filter((student: TeacherSheetStudent) => student.grade).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                            No marks have been entered for this selection yet.
                          </TableCell>
                        </TableRow>
                      ) : (
                        teacherClassStudents
                          .filter((student: TeacherSheetStudent) => student.grade)
                          .map((student: TeacherSheetStudent) => {
                            const score = Number(student.grade?.score ?? 0);
                            return (
                              <TableRow key={student.id}>
                                <TableCell className="font-bold">{student.name}</TableCell>
                                <TableCell>{student.class_name}</TableCell>
                                <TableCell>{selectedTeacherSequence ? `${selectedTeacherSequence.name} (${termLabel(selectedTeacherSequence.term)})` : "Sequence"}</TableCell>
                                <TableCell className="font-bold text-primary">{score.toFixed(2)}/20</TableCell>
                                <TableCell>
                                  <Badge className={cn(score >= 10 ? "bg-green-600" : "bg-destructive")}>
                                    {getSystemStatus(score)}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-sm">{student.grade?.comment || getSystemRemark(score)}</TableCell>
                              </TableRow>
                            );
                          })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  return null;
}
