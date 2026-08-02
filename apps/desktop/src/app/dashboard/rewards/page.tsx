
"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { useAnnualResults } from "@/lib/hooks/useGrades";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Trophy, 
  Award, 
  Search, 
  Filter, 
  Download, 
  Printer, 
  ShieldCheck, 
  QrCode, 
  Star, 
  ChevronRight, 
  GraduationCap, 
  Building2, 
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  History,
  Info,
  Loader2,
  X,
  FileBadge,
  ArrowLeft,
  Save,
  TrendingUp,
  FileDown,
  Eye,
  Signature as SignatureIcon,
  Medal,
  Briefcase
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { resolveMediaUrl } from "@/lib/media";
import { downloadHtmlDocument, escapeHtml } from "@/lib/browser-download";
import { gradesService } from "@/lib/api/services/grades.service";
import { schoolsService } from "@/lib/api/services/schools.service";
import { buildHonourRollCertificateHtml as buildOfficialCertificateHtml } from "@/lib/honour-roll-certificate";
import { downloadHtmlPagesPdf } from "@/lib/browser-download";

function buildDeterministicSerial(prefix: string, ...parts: Array<string | number | null | undefined>) {
  const normalized = parts
    .map((part) => `${part ?? ""}`.replace(/[^A-Za-z0-9]+/g, "").toUpperCase())
    .filter(Boolean)
    .join("-");
  return `${prefix}-${normalized || "UNSPECIFIED"}`;
}

function termLabel(term?: number) {
  if (term === 1) return "First Term";
  if (term === 2) return "Second Term";
  if (term === 3) return "Third Term";
  return "Term";
}

function getApiList<T>(data: T[] | { results?: T[] } | null | undefined): T[] {
  if (Array.isArray(data)) return data;
  return Array.isArray(data?.results) ? data.results : [];
}

function resolveThresholdValue(settings: any, fallback = 12) {
  const value = Number(settings?.honour_roll_threshold ?? settings?.honourRollThreshold ?? fallback);
  return Number.isFinite(value) ? value : fallback;
}

function getSchoolIdentity(student: any, fallbackSchool: any) {
  const school = student?.school || fallbackSchool || {};
  return {
    name: school.name || "School",
    logo: resolveMediaUrl(school.logo || ""),
    motto: school.motto || "Excellence - Discipline - Service",
    matricule: school.matricule || school.short_name || "SCHOOL",
    location: school.location || school.region || "",
  };
}

function printableDocument(title: string, body: string) {
  return `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>
    @page { size: A4 landscape; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f3f4f6; color: #111827; font-family: Georgia, "Times New Roman", serif; }
    .sheet { width: min(1120px, calc(100vw - 24px)); min-height: 760px; margin: 24px auto; background: #fff; border: 14px double rgba(38, 77, 115, 0.28); padding: 54px 64px; position: relative; overflow: hidden; box-shadow: 0 24px 80px rgba(15, 23, 42, 0.18); page-break-after: always; }
    .sheet::before { content: ""; position: absolute; inset: 26px; border: 1px solid rgba(38, 77, 115, 0.16); pointer-events: none; }
    .sheet::after { content: ""; position: absolute; width: 420px; height: 420px; border-radius: 999px; background: rgba(252, 209, 22, 0.1); right: -170px; top: -180px; }
    .cert-content { position: relative; z-index: 1; display: flex; flex-direction: column; min-height: 640px; }
    .letterhead { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 24px; text-transform: uppercase; font-size: 10px; font-weight: 800; letter-spacing: 0.12em; }
    .letterhead .right { text-align: right; }
    .rule { width: 72px; height: 1px; background: #111827; margin: 7px 0; opacity: .6; }
    .right .rule { margin-left: auto; }
    .seal { width: 104px; height: 104px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: #fff; box-shadow: 0 14px 38px rgba(38, 77, 115, .2); overflow: hidden; }
    .seal img { width: 82px; height: 82px; object-fit: contain; }
    .seal span { font-size: 42px; color: #264D73; }
    .school-name { margin-top: 42px; text-align: center; text-transform: uppercase; color: #264D73; font-weight: 900; font-size: clamp(12px, 2vw, 14px); letter-spacing: .34em; }
    .motto { margin-top: 8px; text-align: center; color: #6b7280; font-style: italic; font-size: 13px; }
    .cert-title { text-align: center; margin-top: 18px; color: #264D73; font-size: clamp(40px, 8vw, 72px); line-height: .92; font-style: italic; font-weight: 900; text-transform: uppercase; letter-spacing: -.04em; }
    .cert-subtitle { text-align: center; margin-top: 12px; color: #b48a00; font-size: clamp(14px, 3vw, 22px); font-weight: 900; text-transform: uppercase; letter-spacing: .22em; }
    .presented { margin-top: 54px; text-align: center; color: rgba(38, 77, 115, .58); font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: .38em; }
    .student-name { margin-top: 20px; text-align: center; color: #264D73; font-size: clamp(30px, 7vw, 54px); line-height: 1; font-weight: 900; text-transform: uppercase; overflow-wrap: anywhere; }
    .meta { display: flex; align-items: center; justify-content: center; gap: 14px; margin-top: 18px; color: rgba(38, 77, 115, .72); font-size: 13px; font-family: "Courier New", monospace; font-weight: 800; text-transform: uppercase; flex-wrap: wrap; text-align: center; }
    .meta::before, .meta::after { content: ""; width: 70px; height: 1px; background: rgba(38, 77, 115, .22); }
    .statement { max-width: 790px; margin: 42px auto 0; text-align: center; color: #374151; font-size: 19px; line-height: 1.75; font-style: italic; }
    .statement strong { color: #264D73; font-weight: 900; border-bottom: 4px solid #FCD116; }
    .details-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 30px auto 0; max-width: 860px; font-family: Arial, sans-serif; }
    .details-grid div { border: 1px solid rgba(38, 77, 115, .16); border-radius: 10px; padding: 12px; background: rgba(38,77,115,.035); text-align: center; }
    .details-grid span { display: block; color: #6b7280; font-size: 9px; text-transform: uppercase; font-weight: 900; letter-spacing: .12em; }
    .details-grid strong { display: block; color: #264D73; font-size: 16px; margin-top: 4px; overflow-wrap: anywhere; }
    .congrats { margin-top: 26px; text-align: center; color: #b48a00; font-size: 42px; font-style: italic; font-weight: 900; transform: rotate(-2deg); }
    .signatures { margin-top: auto; padding-top: 54px; display: grid; grid-template-columns: 1fr 1fr; gap: 90px; align-items: end; }
    .signature-line { border-top: 1px solid rgba(17, 24, 39, .32); text-align: center; padding-top: 12px; text-transform: uppercase; color: #264D73; font-size: 11px; font-weight: 900; letter-spacing: .24em; }
    .serial { margin-top: 7px; font-family: "Courier New", monospace; font-size: 10px; color: rgba(17, 24, 39, .48); letter-spacing: .08em; }
    .footer { margin-top: 34px; padding-top: 18px; border-top: 1px solid rgba(17,24,39,.08); display: flex; justify-content: space-between; align-items: center; gap: 20px; color: rgba(17,24,39,.55); font-size: 10px; text-transform: uppercase; font-weight: 800; letter-spacing: .16em; }
    .registry { max-width: 1120px; min-height: auto; border-width: 8px; }
    .registry h1 { color: #264D73; text-transform: uppercase; letter-spacing: .08em; margin: 0 0 6px; }
    .registry .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin: 28px 0; }
    .registry .summary div { border: 1px solid rgba(38,77,115,.16); padding: 14px; border-radius: 10px; background: rgba(38,77,115,.035); }
    .registry .summary span { display: block; font-size: 10px; text-transform: uppercase; color: #6b7280; font-weight: 800; letter-spacing: .12em; }
    .registry .summary strong { display: block; color: #264D73; font-size: 22px; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; font-size: 12px; }
    th { background: #264D73; color: #fff; text-transform: uppercase; font-size: 10px; letter-spacing: .09em; padding: 12px; text-align: left; }
    td { border-bottom: 1px solid #e5e7eb; padding: 12px; }
    tr:nth-child(even) td { background: #f9fafb; }
    @media (max-width: 760px) {
      body { background: #fff; }
      .sheet { width: calc(100vw - 16px); min-height: auto; margin: 8px auto; padding: 28px 18px; border-width: 8px; box-shadow: none; }
      .sheet::before { inset: 12px; }
      .sheet::after { width: 240px; height: 240px; right: -120px; top: -130px; }
      .cert-content { min-height: auto; }
      .letterhead { grid-template-columns: 1fr; gap: 12px; text-align: center; font-size: 8px; }
      .letterhead .right { text-align: center; }
      .rule, .right .rule { margin-left: auto; margin-right: auto; }
      .seal { width: 82px; height: 82px; margin: 0 auto; }
      .seal img { width: 62px; height: 62px; }
      .school-name { margin-top: 24px; letter-spacing: .18em; }
      .presented { margin-top: 34px; letter-spacing: .18em; }
      .statement { font-size: 15px; margin-top: 28px; padding: 0 4px; }
      .details-grid { grid-template-columns: 1fr 1fr; }
      .signatures { grid-template-columns: 1fr; gap: 34px; padding-top: 36px; }
      .footer { align-items: flex-start; flex-direction: column; font-size: 8px; }
      .registry .summary { grid-template-columns: 1fr 1fr; }
      table { font-size: 11px; }
      th, td { padding: 9px 8px; }
    }
    @media print { body { background: #fff; } .sheet { width: 100%; margin: 0 auto; box-shadow: none; } }
  </style></head><body>${body}</body></html>`;
}

// The single official certificate design (shared across web, desktop and
// mobile) — identical on screen, in every account it is published to, and in
// the downloaded PDF.
function buildHonourRollCertificateHtml(student: any, fallbackSchool: any) {
  const school = getSchoolIdentity(student, fallbackSchool);
  return buildOfficialCertificateHtml(
    {
      name: student?.name,
      class_name: student?.class || student?.class_name || student?.className || student?.student_class,
      academic_year: student?.academicYear || student?.academic_year || fallbackSchool?.academic_year || "",
      term_label: student?.termLabel || student?.term_label,
      average: student?.average ?? student?.annualAvg ?? student?.annual_average ?? 0,
      class_master: student?.classMaster || student?.class_master,
      principal: fallbackSchool?.principal,
    },
    { ...(fallbackSchool || {}), ...school },
  );
}


function buildHonourRollRegistryHtml(students: any[], fallbackSchool: any, threshold: number, periodLabel: string, summary: any) {
  const school = getSchoolIdentity(null, fallbackSchool);
  const rows = students.map((student, index) => `
    <tr>
      <td>${index + 1}</td>
      <td><strong>${escapeHtml(student.name)}</strong><br/><span>${escapeHtml(student.id)}</span></td>
      <td>${escapeHtml(student.class)}</td>
      <td>${escapeHtml(student.subSchool || student.section)}</td>
      <td>${escapeHtml(Number(student.average || 0).toFixed(2))} / 20</td>
      <td>${escapeHtml(student.rank || "N/A")}</td>
      <td>${escapeHtml(student.award || "Honour Roll")}</td>
    </tr>
  `).join("");

  return `<section class="sheet registry">
    <h1>${escapeHtml(school.name)} Honour Roll Registry</h1>
    <p>${escapeHtml(periodLabel)} | School-issued academic recognition list</p>
    <div class="summary">
      <div><span>Threshold</span><strong>${escapeHtml(threshold.toFixed(2))}/20</strong></div>
      <div><span>Eligible</span><strong>${escapeHtml(students.length)}</strong></div>
      <div><span>Period Average</span><strong>${escapeHtml(Number(summary?.class_average || 0).toFixed(2))}/20</strong></div>
      <div><span>Pass Rate</span><strong>${escapeHtml(Number(summary?.pass_rate || 0))}%</strong></div>
    </div>
    <table>
      <thead><tr><th>#</th><th>Student</th><th>Class</th><th>Sub-school</th><th>Average</th><th>Rank</th><th>Award</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="7">No eligible students for this period.</td></tr>'}</tbody>
    </table>
  </section>`;
}

export default function AcademicRewardsPage() {
  const { user, platformSettings, staffRemarks } = useAuth();
  const { t, language } = useI18n();
  const { toast } = useToast();
  const router = useRouter();

  const [threshold, setThreshold] = useState(12.0);
  const [sectionFilter, setSectionFilter] = useState("all");
  const [classFilter, setClassFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isThresholdLoading, setIsThresholdLoading] = useState(false);
  const [viewingCertificate, setViewingCertificate] = useState<any>(null);
  const [viewingProfessionalCert, setViewingProfessionalCert] = useState<any>(null);

  const isAdmin = ["SCHOOL_ADMIN", "SUB_ADMIN"].includes(user?.role || "");
  const isStudent = user?.role === "STUDENT";
  const isStaff = ["TEACHER", "BURSAR", "LIBRARIAN"].includes(user?.role || "");

  // Every honour roll the student has ever earned, filterable by term.
  const [honourHistory, setHonourHistory] = useState<any[]>([]);
  const [historyTermFilter, setHistoryTermFilter] = useState<string>("all");
  const [historyLoading, setHistoryLoading] = useState(false);
  useEffect(() => {
    if (!isStudent) return;
    let alive = true;
    setHistoryLoading(true);
    gradesService
      .getHonourRollHistory()
      .then((data) => { if (alive) setHonourHistory(Array.isArray(data?.results) ? data.results : []); })
      .catch(() => { if (alive) setHonourHistory([]); })
      .finally(() => { if (alive) setHistoryLoading(false); });
    return () => { alive = false; };
  }, [isStudent]);
  const filteredHonourHistory = useMemo(
    () => honourHistory.filter((entry: any) => historyTermFilter === "all" || String(entry.term) === historyTermFilter),
    [honourHistory, historyTermFilter],
  );

  const [sequences, setSequences] = useState<any[]>([]);
  const [rewardScope, setRewardScope] = useState<"active" | "sequence" | "term">("active");
  const [selectedRewardSequenceId, setSelectedRewardSequenceId] = useState("");
  const [selectedRewardTermValue, setSelectedRewardTermValue] = useState("");
  const [rewardData, setRewardData] = useState<any>(null);
  const [isRewardsLoading, setIsRewardsLoading] = useState(false);
  const [rewardsError, setRewardsError] = useState("");
  const { data: annualResultsData } = useAnnualResults(undefined, isStudent);

  useEffect(() => {
    if (!user?.school?.id) return;
    let cancelled = false;

    const loadSchoolThreshold = async () => {
      setIsThresholdLoading(true);
      try {
        const savedThreshold = await schoolsService.getHonourRollThreshold(user.school.id);
        if (cancelled) return;
        if (Number.isFinite(savedThreshold)) {
          setThreshold(savedThreshold);
        }
      } catch (error) {
        if (!cancelled) {
          setThreshold(12);
        }
      } finally {
        if (!cancelled) setIsThresholdLoading(false);
      }
    };

    loadSchoolThreshold();
    return () => {
      cancelled = true;
    };
  }, [user?.school?.id]);

  useEffect(() => {
    if (!isAdmin && !isStudent) return;
    let cancelled = false;

    const loadSequences = async () => {
      try {
        const response = await gradesService.getSequences({ limit: 200 });
        if (cancelled) return;
        const rows = getApiList<any>(response)
          .sort((a, b) => `${b.academic_year}:${b.term}:${b.name}`.localeCompare(`${a.academic_year}:${a.term}:${a.name}`));
        setSequences(rows);
        const active = rows.find((sequence) => sequence.is_active) || rows[0];
        if (active) {
          setSelectedRewardSequenceId(String(active.id));
          setSelectedRewardTermValue(`${active.term}|${active.academic_year}`);
        }
      } catch (error) {
        if (!cancelled) {
          setSequences([]);
        }
      }
    };

    loadSequences();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, isStudent]);

  const rewardTermOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string; sequenceCount: number }>();
    sequences.forEach((sequence) => {
      const value = `${sequence.term}|${sequence.academic_year}`;
      const current = map.get(value) || {
        value,
        label: `${termLabel(Number(sequence.term))} - ${sequence.academic_year}`,
        sequenceCount: 0,
      };
      current.sequenceCount += 1;
      map.set(value, current);
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [sequences]);

  useEffect(() => {
    if (!isAdmin && !isStudent) return;
    let cancelled = false;

    const loadHonourRoll = async () => {
      setIsRewardsLoading(true);
      setRewardsError("");
      try {
        const params: Record<string, unknown> = { threshold };
        if (rewardScope === "sequence" && selectedRewardSequenceId) {
          params.sequence_id = selectedRewardSequenceId;
        }
        if (rewardScope === "term" && selectedRewardTermValue) {
          const [term, academicYear] = selectedRewardTermValue.split("|");
          params.scope = "term";
          params.term = term;
          params.academic_year = academicYear;
        }
        const data = await gradesService.getHonourRoll(params);
        if (!cancelled) setRewardData(data);
      } catch (error: any) {
        if (!cancelled) {
          setRewardData(null);
          setRewardsError(error?.response?.data?.detail || error?.response?.data?.error || error?.message || "Unable to load the honour roll from recorded marks.");
        }
      } finally {
        if (!cancelled) setIsRewardsLoading(false);
      }
    };

    loadHonourRoll();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, isStudent, rewardScope, selectedRewardSequenceId, selectedRewardTermValue, threshold]);

  // Map API students to the shape used by this page
  const studentList = useMemo(() => {
    return getApiList<any>(rewardData?.results || []).map((s: any) => ({
      id: s.matricule || s.admission_number || s.id,
      studentId: s.student_id || s.id,
      name: s.name || s.user?.name || 'Unknown',
      class: s.class_name || s.class || s.student_class || 'Unknown',
      section: s.section || s.sub_school_name || 'General',
      subSchool: s.sub_school_name || 'Main School',
      average: parseFloat(s.average || s.annual_average || '0'),
      rank: s.rank,
      totalStudents: s.total_students,
      award: s.award || 'Honour Roll',
      periodLabel: s.period_label || rewardData?.period?.sequence_name || rewardData?.period?.term_label || 'Current Period',
      academicYear: s.academic_year || rewardData?.period?.academic_year,
      school: s.school || user?.school,
      avatar: resolveMediaUrl(s.user?.avatar || s.avatar) || '',
    }));
  }, [rewardData, user?.school]);

  const availableSections = useMemo(
    () => Array.from(new Set(studentList.map((student: any) => student.section).filter(Boolean))).sort(),
    [studentList]
  );

  const availableClasses = useMemo(
    () => Array.from(new Set(studentList.map((student: any) => student.class).filter(Boolean))).sort(),
    [studentList]
  );

  const eligibleStudents = useMemo(() => {
    return studentList.filter((s: any) => {
      const matchesSection = sectionFilter === "all" || s.section === sectionFilter;
      const matchesClass = classFilter === "all" || s.class === classFilter;
      const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.id.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesSection && matchesClass && matchesSearch;
    });
  }, [studentList, sectionFilter, classFilter, searchTerm]);
  const honourRollNotPublished = rewardData?.published === false || rewardData?.status === "NO_RESULTS_PUBLISHED";
  const honourRollMessage = rewardData?.message || "No results have been published yet for this academic period.";

  const myProfessionalRemarks = useMemo(() => {
    return staffRemarks.filter(r => r.staffId === user?.id);
  }, [staffRemarks, user?.id]);

  const handleUpdateThreshold = async () => {
    setIsProcessing(true);
    try {
      if (!user?.school?.id) {
        throw new Error("Your account is not linked to a school.");
      }
      if (threshold < 0 || threshold > 20) {
        throw new Error("The honour-roll threshold must be between 0 and 20.");
      }
      const settings = await schoolsService.updateHonourRollThreshold(user.school.id, threshold);
      const savedThreshold = resolveThresholdValue(settings, threshold);
      setThreshold(Number.isFinite(savedThreshold) ? savedThreshold : threshold);
      toast({ title: "Policy synchronized", description: `Honour roll threshold updated to ${Number(savedThreshold || threshold).toFixed(2)}/20.` });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Threshold not saved",
        description: error?.response?.data?.detail || error?.message || "Could not save the school honour-roll threshold.",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = (title: string) => {
    const periodLabel = rewardData?.period?.sequence_name
      || (rewardData?.period?.term_label && rewardData?.period?.academic_year
        ? `${rewardData.period.term_label} ${rewardData.period.academic_year}`
        : "Current Academic Period");

    if (title === "Honour Roll Certificate" && viewingCertificate) {
      void downloadHtmlPagesPdf(
        [buildHonourRollCertificateHtml(viewingCertificate, viewingCertificate?.school || user?.school)],
        `${String(viewingCertificate.name || "student").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-honour-roll-certificate`,
        { landscape: true },
      );
      toast({ title: "Certificate downloaded", description: `${user?.school?.name || "The school"} honour-roll certificate has been saved as a PDF.` });
      return;
    }

    if (title === "Batch Certificates") {
      void downloadHtmlPagesPdf(
        eligibleStudents.map((student) => buildHonourRollCertificateHtml(student, user?.school)),
        `school-honour-roll-certificates`,
        { landscape: true },
      );
      toast({ title: "Certificates downloaded", description: `${eligibleStudents.length} certificates saved as a PDF — one per page.` });
      return;
    }

    if (title === "Honour Roll Registry") {
      const body = buildHonourRollRegistryHtml(eligibleStudents, user?.school, threshold, periodLabel, rewardData?.summary);
      void downloadHtmlPagesPdf([printableDocument(title, body)], `school-honour-roll-registry`);
      toast({ title: "Registry downloaded", description: `${user?.school?.name || "The school"} honour-roll registry has been saved as a styled PDF.` });
      return;
    }

    const targetId =
      title === "Professional Appreciation"
        ? "professional-cert-print"
        : "honour-roll-print";
    const element = document.getElementById(targetId);
    if (element) {
      const landscape = targetId === "honour-roll-print";
      void downloadHtmlPagesPdf([printableDocument(title, element.outerHTML)], `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, { landscape });
      toast({ title: "Document downloaded", description: `${title} has been saved as a styled PDF.` });
      return;
    }

    const summaryHtml = printableDocument(
      title,
      buildHonourRollRegistryHtml(eligibleStudents, user?.school, threshold, periodLabel, rewardData?.summary)
    );
    void downloadHtmlPagesPdf([summaryHtml], `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`);
    toast({ title: "Document downloaded", description: `${title} has been saved as a styled PDF.` });
  };

  // --- STAFF VIEW (PROFESSIONAL RECOGNITION) ---
  if (isStaff) {
    return (
      <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full shadow-sm hover:bg-white shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-primary font-headline uppercase tracking-tighter">Professional Recognition</h1>
              <p className="text-muted-foreground mt-1">Registry of administrative commendations and excellence awards.</p>
            </div>
          </div>
          <Badge variant="outline" className="h-10 px-4 rounded-xl border-primary/20 text-primary font-black uppercase tracking-widest flex items-center gap-2 bg-white">
            <Medal className="w-4 h-4 text-secondary" /> Verified Portfolio
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
           <Card className="border-none shadow-sm bg-primary text-white p-6 rounded-3xl flex items-center gap-4 group hover:shadow-md transition-all">
              <div className="p-3 bg-white/10 rounded-2xl text-secondary group-hover:scale-110 transition-transform"><Medal className="w-6 h-6" /></div>
              <div>
                 <p className="text-[10px] font-black uppercase opacity-60 tracking-widest">Formal Remarks</p>
                 <p className="text-2xl font-black">{myProfessionalRemarks.length} Records</p>
              </div>
           </Card>
           <Card className="border-none shadow-sm bg-white p-6 rounded-3xl flex items-center gap-4 group hover:shadow-md transition-all border border-primary/5">
              <div className="p-3 bg-secondary/20 rounded-2xl text-primary group-hover:scale-110 transition-transform"><Briefcase className="w-6 h-6" /></div>
              <div>
                 <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Employment Status</p>
                 <p className="text-2xl font-black text-primary">PERMANENT</p>
              </div>
           </Card>
           <Card className="border-none shadow-sm bg-white p-6 rounded-3xl flex items-center gap-4 group hover:shadow-md transition-all border border-primary/5">
              <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-600 group-hover:scale-110 transition-transform"><ShieldCheck className="w-6 h-6" /></div>
              <div>
                 <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Node Registry</p>
                 <p className="text-2xl font-black text-primary">ACTIVE</p>
              </div>
           </Card>
        </div>

        <Card className="border-none shadow-xl rounded-[2.5rem] bg-white overflow-hidden">
          <CardHeader className="bg-primary/5 p-8 border-b">
            <CardTitle className="text-xl font-black text-primary uppercase flex items-center gap-2">
              <History className="w-5 h-5 text-secondary" /> Commendation Ledger
            </CardTitle>
            <CardDescription>Verified chronological record of professional remarks issued by the school administration.</CardDescription>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader className="bg-accent/10 uppercase text-[9px] font-black tracking-widest border-b">
                <TableRow>
                  <TableHead className="pl-8 py-4">Recognition Date</TableHead>
                  <TableHead>Issuing Authority</TableHead>
                  <TableHead>Commendation Summary</TableHead>
                  <TableHead className="text-right pr-8">Official Document</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {myProfessionalRemarks.map((remark) => (
                  <TableRow key={remark.id} className="h-20 border-b hover:bg-accent/5 transition-colors">
                    <TableCell className="pl-8 font-mono text-xs font-bold text-muted-foreground">{remark.date}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 font-black text-primary text-xs uppercase">
                        <SignatureIcon className="w-4 h-4 text-secondary" />
                        {remark.adminName}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[300px]">
                      <p className="text-xs italic text-muted-foreground line-clamp-2 leading-relaxed">"{remark.text}"</p>
                    </TableCell>
                    <TableCell className="text-right pr-8">
                      <Button 
                        size="sm" 
                        className="rounded-xl font-black uppercase text-[10px] tracking-widest h-10 gap-2 shadow-lg"
                        onClick={() => setViewingProfessionalCert(remark)}
                      >
                        <Award className="w-3.5 h-3.5" /> View Certificate
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {myProfessionalRemarks.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-20">
                      <div className="space-y-4 opacity-30 flex flex-col items-center">
                        <FileBadge className="w-16 h-16" />
                        <p className="text-sm font-bold uppercase tracking-widest">No formal remarks in professional registry.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* PROFESSIONAL CERTIFICATE DIALOG */}
        <Dialog open={!!viewingProfessionalCert} onOpenChange={() => setViewingProfessionalCert(null)}>
          <DialogContent className="sm:max-w-5xl max-h-[95vh] p-0 border-none shadow-2xl rounded-[2.5rem] overflow-hidden flex flex-col">
            <DialogHeader className="bg-primary p-6 md:p-8 text-white no-print relative shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-white/10 rounded-xl text-secondary"><Medal className="w-8 h-8" /></div>
                  <div>
                    <DialogTitle className="text-xl md:text-2xl font-black uppercase">Professional Appreciation</DialogTitle>
                    <DialogDescription className="text-white/60 text-xs">Official institutional commendation record.</DialogDescription>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setViewingProfessionalCert(null)} className="text-white hover:bg-white/10 transition-all"><X className="w-6 h-6" /></Button>
              </div>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto bg-muted p-2 md:p-10 print:p-0 print:bg-white no-scrollbar">
              <div className="overflow-x-auto rounded-xl border-2 border-primary/10 shadow-inner bg-white">
                <ProfessionalCertificatePreview remark={viewingProfessionalCert} student={user} platform={platformSettings} />
              </div>
            </div>
            <DialogFooter className="bg-accent/10 p-6 border-t border-accent flex justify-between items-center shrink-0 no-print">
               <div className="flex items-center gap-2 text-muted-foreground">
                  <ShieldCheck className="w-4 h-4 text-primary opacity-40" />
                  <p className="text-[10px] font-black uppercase italic opacity-40">Verified Institutional Professional Record</p>
               </div>
               <div className="flex gap-2">
                  <Button variant="outline" className="rounded-xl h-11 px-6 font-bold" onClick={() => window.print()}><Printer className="w-4 h-4 mr-2" /> Print</Button>
                  <Button className="rounded-xl px-10 h-11 font-black uppercase text-[10px] gap-2 shadow-lg" onClick={() => handleDownload('Professional Appreciation')}><Download className="w-4 h-4" /> Download PDF</Button>
               </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  if (isStudent) {
    const currentAward = studentList[0] || null;
    const studentAverage = Number(currentAward?.average ?? user?.annualAvg ?? user?.annual_avg ?? annualResultsData?.results?.[0]?.annual_average ?? 0);
    const isEligible = Boolean(currentAward) || studentAverage >= threshold;

    return (
      <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full shadow-sm hover:bg-white">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-primary font-headline uppercase tracking-tighter">Academic Reward Portal</h1>
            <p className="text-muted-foreground mt-1">Verified recognition for pedagogical excellence.</p>
          </div>
        </div>

        <Card className="border-none shadow-sm rounded-3xl bg-white p-5">
          <CardContent className="p-0 grid gap-4 md:grid-cols-3 md:items-end">
            <div className="md:col-span-1 space-y-1">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Academic Period</Label>
              <p className="text-xs text-muted-foreground">
                Select a published sequence or term to view current and previous honour-roll records.
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Scope</Label>
              <Select value={rewardScope} onValueChange={(value: "active" | "sequence" | "term") => setRewardScope(value)}>
                <SelectTrigger className="h-11 rounded-xl bg-accent/30 border-none font-bold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Current Active Period</SelectItem>
                  <SelectItem value="sequence">Specific Sequence</SelectItem>
                  <SelectItem value="term">Full Term</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {rewardScope === "term" ? (
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Term</Label>
                <Select value={selectedRewardTermValue} onValueChange={setSelectedRewardTermValue} disabled={!rewardTermOptions.length}>
                  <SelectTrigger className="h-11 rounded-xl bg-accent/30 border-none font-bold">
                    <SelectValue placeholder="Choose term" />
                  </SelectTrigger>
                  <SelectContent>
                    {rewardTermOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Sequence</Label>
                <Select value={selectedRewardSequenceId} onValueChange={setSelectedRewardSequenceId} disabled={rewardScope !== "sequence" || !sequences.length}>
                  <SelectTrigger className="h-11 rounded-xl bg-accent/30 border-none font-bold">
                    <SelectValue placeholder="Choose sequence" />
                  </SelectTrigger>
                  <SelectContent>
                    {sequences.map((sequence) => (
                      <SelectItem key={sequence.id} value={String(sequence.id)}>
                        {sequence.name} - {termLabel(Number(sequence.term))} {sequence.academic_year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>

        {honourRollNotPublished ? (
          <Card className="border-amber-200 bg-amber-50 shadow-xl rounded-[3rem] p-12 text-center">
            <CardContent className="space-y-5 p-0">
              <Info className="mx-auto h-12 w-12 text-amber-600" />
              <div>
                <h2 className="text-2xl font-black uppercase text-amber-900">No Results Published Yet</h2>
                <p className="mx-auto mt-2 max-w-xl text-sm font-semibold text-amber-800">
                  {honourRollMessage}
                </p>
                <p className="mx-auto mt-3 max-w-xl text-xs text-amber-700">
                  Your previous honour-roll certificates remain valid and will appear when their published academic periods are selected by your school.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : isEligible ? (
          <div className="space-y-8">
            <Card className="border-none shadow-2xl rounded-[3rem] bg-primary text-white overflow-hidden relative group">
              <div className="absolute top-0 right-0 p-10 opacity-10 group-hover:scale-110 transition-transform"><Trophy className="w-48 h-48"/></div>
              <CardHeader className="p-10 pb-2 relative z-10">
                <Badge variant="secondary" className="bg-secondary text-primary border-none font-black uppercase text-[10px] px-4 py-1 mb-4 shadow-xl">
                  HONOUR ROLL QUALIFIED
                </Badge>
                <CardTitle className="text-4xl md:text-5xl font-black uppercase tracking-tighter leading-none">Congratulations, {user?.name?.split(' ')[0]}</CardTitle>
                <CardDescription className="text-white/60 text-lg mt-4 font-medium max-w-xl">
                  Based on your published average of <span className="text-secondary font-black">{studentAverage.toFixed(2)}</span>, you have been officially registered on your school Honour Roll.
                </CardDescription>
              </CardHeader>
              <CardFooter className="p-10 pt-6 relative z-10">
                <Button className="h-14 px-10 rounded-2xl bg-secondary text-primary hover:bg-secondary/90 font-black uppercase text-xs tracking-widest gap-3 shadow-2xl transition-all active:scale-95" onClick={() => setViewingCertificate(currentAward || user)}>
                  <Trophy className="w-5 h-5" /> View Digital Certificate
                </Button>
              </CardFooter>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <Card className="border-none shadow-sm bg-white p-8 rounded-3xl space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-50 rounded-xl text-green-600"><CheckCircle2 className="w-5 h-5" /></div>
                    <h4 className="text-sm font-black uppercase text-primary tracking-widest">Eligibility Verified</h4>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">Your marks have been verified against your school's academic records. Your certificate is issued by {user?.school?.name || "your school"}.</p>
               </Card>
               <Card className="border-none shadow-sm bg-secondary/10 p-8 rounded-3xl space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-secondary/20 rounded-xl text-primary"><Star className="w-5 h-5" /></div>
                    <h4 className="text-sm font-black uppercase text-primary tracking-widest">Global Ranking</h4>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">You are officially above the current honour-roll threshold for {user?.school?.name || "your institution"} based on your recorded annual average.</p>
               </Card>
            </div>
          </div>
        ) : (
          <Card className="border-none shadow-xl rounded-[3rem] bg-white overflow-hidden text-center p-12 space-y-8">
            <div className="relative">
              <div className="absolute inset-0 bg-red-50 rounded-full blur-3xl animate-pulse" />
              <div className="relative w-24 h-24 bg-red-50 text-red-400 rounded-full flex items-center justify-center mx-auto border-2 border-dashed border-red-200">
                <XCircle className="w-12 h-12" />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-black text-primary uppercase tracking-tighter">You were not eligible</h2>
              <p className="text-muted-foreground max-w-md mx-auto leading-relaxed">
                The current school threshold for the Honour Roll is <span className="font-bold text-primary">{threshold.toFixed(2)}/20</span>.
                Your current average is <span className="font-bold text-red-600">{studentAverage.toFixed(2)}</span>. Keep pushing for excellence!
              </p>
            </div>
            <div className="pt-4 border-t flex flex-col items-center gap-4">
               <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Need Support?</p>
               <Button asChild variant="outline" className="rounded-xl font-bold h-11 px-8 gap-2">
                 <Link href="/dashboard/ai-assistant">Consult AI Study Assistant <ChevronRight className="w-4 h-4"/></Link>
               </Button>
            </div>
          </Card>
        )}

        {/* ALL HONOUR ROLLS EVER EARNED, WITH TERM FILTER */}
        <Card className="border-none shadow-xl rounded-[2.5rem] bg-white overflow-hidden">
          <CardHeader className="p-8 pb-4">
            <CardTitle className="flex items-center gap-3 text-xl font-black uppercase tracking-tight text-primary">
              <Trophy className="h-5 w-5 text-secondary" /> My Honour Rolls
            </CardTitle>
            <CardDescription>Every honour roll you have earned across all terms and academic years.</CardDescription>
            <div className="mt-3 flex flex-wrap gap-2">
              {["all", "1", "2", "3"].map((value) => (
                <button
                  key={value}
                  onClick={() => setHistoryTermFilter(value)}
                  className={cn(
                    "rounded-full border px-4 py-1.5 text-[11px] font-black uppercase tracking-widest transition-colors",
                    historyTermFilter === value ? "border-primary bg-primary text-white" : "border-border bg-white text-muted-foreground",
                  )}
                >
                  {value === "all" ? "All terms" : `Term ${value}`}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="space-y-3 p-8 pt-2">
            {historyLoading ? (
              <p className="py-6 text-sm text-muted-foreground">Loading your honour rolls...</p>
            ) : filteredHonourHistory.length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">
                {honourHistory.length === 0
                  ? "You have not earned an honour roll yet — keep pushing for excellence!"
                  : "No honour rolls for this term filter."}
              </p>
            ) : (
              filteredHonourHistory.map((entry: any) => (
                <div key={`${entry.academic_year}-${entry.term}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4">
                  <div>
                    <p className="font-black text-primary">{entry.term_label || `Term ${entry.term}`} · {entry.academic_year}</p>
                    <p className="text-xs text-muted-foreground">{entry.class_name || "—"} · Average {Number(entry.average || 0).toFixed(2)}/20</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 rounded-xl font-bold"
                      onClick={() => setViewingCertificate({
                        name: user?.name,
                        class: entry.class_name,
                        academicYear: entry.academic_year,
                        termLabel: entry.term_label || `Term ${entry.term}`,
                        average: entry.average,
                        school: user?.school,
                      })}
                    >
                      View
                    </Button>
                    <Button
                      size="sm"
                      className="h-9 rounded-xl font-bold"
                      onClick={() => {
                        void downloadHtmlPagesPdf(
                          [buildHonourRollCertificateHtml({
                            name: user?.name,
                            class: entry.class_name,
                            academicYear: entry.academic_year,
                            termLabel: entry.term_label || `Term ${entry.term}`,
                            average: entry.average,
                          }, user?.school)],
                          `${String(user?.name || "student").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-honour-roll-${entry.academic_year}-t${entry.term}`,
                          { landscape: true },
                        );
                        toast({ title: "Certificate downloaded", description: "Your honour-roll certificate has been saved as a PDF." });
                      }}
                    >
                      <Download className="mr-1 h-4 w-4" /> PDF
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* STUDENT CERTIFICATE MODAL */}
        <Dialog open={!!viewingCertificate} onOpenChange={() => setViewingCertificate(null)}>
          <DialogContent className="sm:max-w-5xl max-h-[95vh] p-0 border-none shadow-2xl rounded-[2.5rem] overflow-hidden flex flex-col">
            <DialogHeader className="bg-primary p-6 md:p-8 text-white no-print relative shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-white/10 rounded-xl text-secondary"><Award className="w-8 h-8" /></div>
                  <DialogTitle className="text-xl md:text-2xl font-black uppercase">Honour Roll Certificate</DialogTitle>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setViewingCertificate(null)} className="text-white hover:bg-white/10"><X className="w-6 h-6" /></Button>
              </div>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto bg-muted p-2 md:p-10 print:p-0 print:bg-white no-scrollbar">
              <div className="overflow-x-auto rounded-xl border-2 border-primary/10 shadow-inner bg-white">
                <CertificatePreview student={{ ...viewingCertificate, school: viewingCertificate?.school || user?.school }} platform={platformSettings} />
              </div>
            </div>
            <DialogFooter className="bg-accent/10 p-6 border-t border-accent flex justify-between items-center shrink-0 no-print">
               <div className="flex items-center gap-2 text-muted-foreground">
                  <ShieldCheck className="w-4 h-4 text-primary opacity-40" />
                  <p className="text-[10px] font-black uppercase italic opacity-40">Digitally Signed Institutional Achievement</p>
               </div>
               <div className="flex gap-2">
                  <Button variant="outline" className="rounded-xl h-11 px-6 font-bold" onClick={() => window.print()}><Printer className="w-4 h-4 mr-2" /> Print</Button>
                  <Button className="rounded-xl px-10 h-11 font-black uppercase text-[10px] gap-2 shadow-lg" onClick={() => handleDownload('Honour Roll Certificate')}><Download className="w-4 h-4" /> Download PDF</Button>
               </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // --- ADMIN VIEW (REWARD SETTINGS & REGISTRY) ---
  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary font-headline flex items-center gap-3 uppercase tracking-tighter">
            <div className="p-2 bg-primary rounded-xl shadow-lg">
              <Trophy className="w-6 h-6 text-secondary" />
            </div>
            Academic Reward Management
          </h1>
          <p className="text-muted-foreground mt-1">Set excellence thresholds and manage institutional certificates.</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border shadow-sm flex items-center gap-6">
           <div className="space-y-1">
              <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Current Threshold</Label>
              <div className="flex items-center gap-3">
                 <Input 
                  type="number" 
                  step="0.1" 
                  max="20" 
                  min="10" 
                  value={threshold} 
                  onChange={(e) => setThreshold(parseFloat(e.target.value) || 0)}
                  disabled={isThresholdLoading || isProcessing}
                  className="w-24 h-10 border-none bg-accent/30 rounded-xl font-black text-primary text-center" 
                 />
                 <Button size="sm" className="h-10 rounded-xl px-4 gap-2 font-bold" onClick={handleUpdateThreshold} disabled={isProcessing}>
                   {isProcessing || isThresholdLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Sync
                 </Button>
              </div>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <Card className="border-none shadow-sm bg-white p-6 rounded-3xl flex items-center gap-4 group hover:shadow-md transition-all">
            <div className="p-3 bg-primary/5 rounded-2xl text-primary group-hover:scale-110 transition-transform"><Users className="w-6 h-6" /></div>
            <div>
               <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Total Eligible</p>
               <p className="text-2xl font-black text-primary">{eligibleStudents.length} Students</p>
            </div>
         </Card>
         <Card className="border-none shadow-sm bg-secondary/20 p-6 rounded-3xl flex items-center gap-4 group hover:shadow-md transition-all">
            <div className="p-3 bg-secondary/40 rounded-2xl text-primary group-hover:scale-110 transition-transform"><TrendingUp className="w-6 h-6" /></div>
            <div>
               <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Period Average</p>
               <p className="text-2xl font-black text-primary">{Number(rewardData?.summary?.class_average || 0).toFixed(2)} / 20</p>
            </div>
         </Card>
         <Card className="border-none shadow-sm bg-white p-6 rounded-3xl flex items-center gap-4 group hover:shadow-md transition-all">
            <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-600 group-hover:scale-110 transition-transform"><CheckCircle2 className="w-6 h-6" /></div>
            <div>
               <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Pass Rate</p>
               <p className="text-2xl font-black text-primary">{Number(rewardData?.summary?.pass_rate || 0)}%</p>
            </div>
         </Card>
      </div>

      <Card className="border-none bg-white shadow-sm rounded-[2rem]">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-black uppercase text-primary">Cameroon Academic Period</CardTitle>
          <CardDescription>
            Select the exact sequence or term whose recorded marks should determine honour-roll eligibility.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Reward Scope</Label>
            <Select value={rewardScope} onValueChange={(value: "active" | "sequence" | "term") => setRewardScope(value)}>
              <SelectTrigger className="h-11 rounded-xl bg-accent/30 border-none font-bold">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active / Latest Sequence</SelectItem>
                <SelectItem value="sequence">Selected Sequence</SelectItem>
                <SelectItem value="term">Term Honour Roll</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Sequence</Label>
            <Select value={selectedRewardSequenceId} onValueChange={setSelectedRewardSequenceId} disabled={rewardScope !== "sequence" || !sequences.length}>
              <SelectTrigger className="h-11 rounded-xl bg-accent/30 border-none font-bold">
                <SelectValue placeholder="Choose sequence" />
              </SelectTrigger>
              <SelectContent>
                {sequences.map((sequence) => (
                  <SelectItem key={sequence.id} value={String(sequence.id)}>
                    {sequence.name} - {termLabel(Number(sequence.term))} - {sequence.academic_year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Term</Label>
            <Select value={selectedRewardTermValue} onValueChange={setSelectedRewardTermValue} disabled={rewardScope !== "term" || !rewardTermOptions.length}>
              <SelectTrigger className="h-11 rounded-xl bg-accent/30 border-none font-bold">
                <SelectValue placeholder="Choose term" />
              </SelectTrigger>
              <SelectContent>
                {rewardTermOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label} ({option.sequenceCount} sequences)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="border-none shadow-xl overflow-hidden rounded-[2.5rem] bg-white">
        <CardHeader className="bg-primary/5 p-8 border-b flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary rounded-xl text-white shadow-lg"><Star className="w-8 h-8 text-secondary" /></div>
            <div>
              <CardTitle className="text-xl font-black uppercase">Honour Roll Registry</CardTitle>
              <CardDescription>Filtering students qualifying for academic recognition.</CardDescription>
            </div>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <Button variant="outline" className="flex-1 md:flex-none h-11 rounded-xl font-bold bg-white" onClick={() => handleDownload('Honour Roll Registry')}><FileDown className="w-4 h-4 mr-2" /> PDF</Button>
            <Button className="flex-1 md:flex-none h-11 px-8 rounded-xl font-black uppercase text-[10px] gap-2 shadow-lg" onClick={() => handleDownload('Batch Certificates')}>
              <Printer className="w-4 h-4" /> Issue All Certificates
            </Button>
          </div>
        </CardHeader>
        <div className="p-6 bg-accent/10 border-b flex flex-col md:flex-row items-center gap-4">
           <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search students..." className="pl-10 h-11 bg-white border-none rounded-xl" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
           </div>
           <div className="flex gap-2 w-full md:w-auto">
              <Select value={sectionFilter} onValueChange={setSectionFilter}>
                <SelectTrigger className="w-[180px] h-11 bg-white border-none rounded-xl font-bold text-xs"><SelectValue placeholder="All Sections" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sections</SelectItem>
                  {availableSections.map((section) => <SelectItem key={section} value={section}>{section}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={classFilter} onValueChange={setClassFilter}>
                <SelectTrigger className="w-[180px] h-11 bg-white border-none rounded-xl font-bold text-xs"><SelectValue placeholder="All Classes" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classes</SelectItem>
                  {availableClasses.map((className) => <SelectItem key={className} value={className}>{className}</SelectItem>)}
                </SelectContent>
              </Select>
           </div>
        </div>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader className="bg-accent/10 uppercase text-[9px] font-black tracking-widest border-b">
              <TableRow>
                <TableHead className="pl-8 py-4">Student Identity</TableHead>
                <TableHead>Class Stream</TableHead>
                <TableHead className="text-center">Mean Score</TableHead>
                <TableHead className="text-right pr-8">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isRewardsLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-16 text-muted-foreground">
                    <div className="flex items-center justify-center gap-2 font-bold">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Calculating honour roll from recorded marks...
                    </div>
                  </TableCell>
                </TableRow>
              ) : rewardsError ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-16 text-destructive font-bold">
                    {rewardsError}
                  </TableCell>
                </TableRow>
              ) : eligibleStudents.map((s) => (
                <TableRow key={s.id} className="hover:bg-primary/5 transition-colors h-16 border-b border-accent/10 last:border-0">
                  <TableCell className="pl-8">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10 border-2 border-white shadow-sm ring-1 ring-accent shrink-0">
                        <AvatarImage src={s.avatar}/>
                        <AvatarFallback className="bg-primary/5 text-primary text-[10px] font-bold">{s.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="font-bold text-sm text-primary uppercase leading-none mb-1">{s.name}</span>
                        <span className="text-[10px] font-mono font-bold text-muted-foreground uppercase">{s.id}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold uppercase text-muted-foreground">{s.class}</span>
                      <span className="text-[9px] font-black uppercase text-primary/60">{s.subSchool}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="font-black text-lg text-primary">{s.average.toFixed(2)}</div>
                    <div className="text-[9px] font-bold uppercase text-muted-foreground">{s.award} | Rank {s.rank || "N/A"}</div>
                  </TableCell>
                  <TableCell className="text-right pr-8">
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-primary/5" onClick={() => setViewingCertificate(s)}>
                      <Eye className="w-4 h-4 text-primary/60 hover:text-primary" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!isRewardsLoading && !rewardsError && honourRollNotPublished && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-20 text-amber-800 font-bold bg-amber-50">
                    {honourRollMessage}
                  </TableCell>
                </TableRow>
              )}
              {!isRewardsLoading && !rewardsError && !honourRollNotPublished && eligibleStudents.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-20 text-muted-foreground italic">No students currently meet the threshold criteria for this selection.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* STUDENT CERTIFICATE MODAL */}
      <Dialog open={!!viewingCertificate} onOpenChange={() => setViewingCertificate(null)}>
        <DialogContent className="sm:max-w-5xl max-h-[95vh] p-0 border-none shadow-2xl rounded-[2.5rem] overflow-hidden flex flex-col">
          <DialogHeader className="bg-primary p-8 text-white relative shrink-0 no-print">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-white/10 rounded-xl text-secondary"><Award className="w-8 h-8" /></div>
                <div>
                  <DialogTitle className="text-2xl font-black uppercase">Certificate of Excellence</DialogTitle>
                  <DialogDescription className="text-white/60">Professional review of {viewingCertificate?.name}'s achievement.</DialogDescription>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setViewingCertificate(null)} className="text-white hover:bg-white/10"><X className="w-6 h-6" /></Button>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto bg-muted p-4 md:p-10 print:p-0 print:bg-white no-scrollbar">
            <div className="overflow-x-auto rounded-xl border-2 border-primary/10 shadow-inner bg-white">
              <CertificatePreview student={{ ...viewingCertificate, school: viewingCertificate?.school || user?.school }} platform={platformSettings} />
            </div>
          </div>
          <DialogFooter className="bg-accent/10 p-6 border-t border-accent flex justify-end gap-3 shrink-0 no-print">
             <Button variant="outline" className="rounded-xl h-12 px-8 font-bold" onClick={() => window.print()}><Printer className="w-4 h-4 mr-2" /> Print Official Copy</Button>
             <Button className="rounded-xl px-10 h-12 font-black uppercase text-xs shadow-lg" onClick={() => setViewingCertificate(null)}>Close Review</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Renders the official certificate exactly as it is downloaded — one shared
// design across screen, PDF and every account.
function CertificatePreview({ student, platform: _platform }: { student: any, platform: any }) {
  const school = { ...(student?.school || {}) };
  const html = buildOfficialCertificateHtml(
    {
      name: student?.name,
      class_name: student?.class || student?.class_name || student?.className || student?.student_class,
      academic_year: student?.academicYear || student?.academic_year || school?.academic_year || "",
      term_label: student?.termLabel || student?.term_label,
      average: student?.average ?? student?.annualAvg ?? student?.annual_average ?? 0,
      class_master: student?.classMaster || student?.class_master,
      principal: school?.principal,
    },
    school,
  );
  return <div id="honour-roll-print" dangerouslySetInnerHTML={{ __html: html }} />;
}


function ProfessionalCertificatePreview({ remark, student, platform }: { remark: any, student: any, platform: any }) {
  const date = remark?.date || new Date().toLocaleDateString();
  const serial = buildDeterministicSerial("PROF-COMMEND", student?.id, remark?.date, remark?.adminName);
  const schoolName = student?.school?.name || platform.name + " International Node";

  return (
    <div id="professional-cert-print" className="bg-white p-12 md:p-24 border-[16px] border-double border-[#264D73]/20 shadow-2xl w-[1100px] md:w-full max-w-5xl mx-auto font-serif text-black relative overflow-hidden print:border-none print:shadow-none print:w-full">
      <div className="absolute top-0 left-0 p-8 opacity-40"><LaurelCorner className="w-24 h-24 text-[#264D73]" /></div>
      <div className="absolute top-0 right-0 p-8 opacity-40 rotate-90"><LaurelCorner className="w-24 h-24 text-[#264D73]" /></div>
      <div className="absolute bottom-0 left-0 p-8 opacity-40 -rotate-90"><LaurelCorner className="w-24 h-24 text-[#264D73]" /></div>
      <div className="absolute bottom-0 right-0 p-8 opacity-40 rotate-180"><LaurelCorner className="w-24 h-24 text-[#264D73]" /></div>
      
      <div className="relative z-10 space-y-12">
        <div className="grid grid-cols-3 gap-4 items-center text-center">
          <div className="space-y-1 text-[8px] uppercase font-black text-left">
            <p className="text-[#264D73]">Republic of Cameroon</p>
            <p>Peace - Work - Fatherland</p>
            <div className="h-px bg-black w-10 my-1" />
            <p>Ministry of Secondary Education</p>
          </div>
          <div className="flex flex-col items-center">
            <div className="w-20 h-20 bg-white rounded-full shadow-xl flex items-center justify-center border-4 border-primary/10 mb-2">
               <Medal className="w-10 h-10 text-secondary" />
            </div>
          </div>
          <div className="space-y-1 text-[8px] uppercase font-black text-right">
            <p className="text-[#264D73]">République du Cameroun</p>
            <p>Paix - Travail - Patrie</p>
            <div className="h-px bg-black w-10 ml-auto my-1" />
            <p>Min. des Enseignements Secondaires</p>
          </div>
        </div>

        <div className="text-center space-y-4">
          <h2 className="text-[10px] font-black uppercase tracking-[0.5em] text-[#264D73]/60 mb-2">{schoolName}</h2>
          <h1 className="text-5xl md:text-6xl font-black italic text-[#264D73] uppercase tracking-tighter leading-none drop-shadow-sm">Certificate of Professional Appreciation</h1>
          <p className="text-xl md:text-2xl font-bold uppercase tracking-[0.2em] text-secondary italic">Excellence in Service Delivery</p>
        </div>

        <div className="text-center space-y-10 py-6">
          <p className="text-xs font-black uppercase tracking-[0.4em] text-[#264D73]/40">THIS OFFICIAL COMMENDATION IS AWARDED TO :</p>
          
          <div className="space-y-4">
            <h2 className="text-4xl md:text-6xl font-black text-[#264D73] leading-tight uppercase tracking-tight">
              {student?.name}
            </h2>
            <div className="flex items-center justify-center gap-6 pt-2">
               <p className="font-mono text-xs md:text-sm font-bold uppercase tracking-widest text-[#264D73]/60">
                 Matricule: <span className="text-[#264D73]">{student?.id}</span> • Role: <span className="text-[#264D73]">{student?.role}</span>
               </p>
            </div>
          </div>

          <div className="max-w-3xl mx-auto p-10 bg-accent/5 border border-[#264D73]/10 rounded-[3rem] shadow-inner">
            <p className="text-lg md:text-xl font-medium text-gray-700 italic leading-relaxed">
              "{remark?.text || "For exceptional dedication to pedagogical standards and consistent contribution to institutional growth."}"
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-20 md:gap-40 pt-10 items-end">
          <div className="text-center space-y-6">
            <div className="h-px bg-black/20 w-full" />
            <div className="space-y-1">
              <p className="font-black text-[10px] md:text-xs uppercase tracking-[0.3em] text-[#264D73]">The Principal</p>
              <div className="h-16 w-full relative flex items-center justify-center">
                 <SignatureSVG className="w-full h-full text-[#264D73]/10 p-4" />
              </div>
              <p className="text-[10px] font-black uppercase opacity-40">{remark?.adminName}</p>
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

        <div className="text-center pt-10 border-t border-black/5 flex flex-col md:flex-row items-center justify-between gap-4">
           <div className="flex items-center gap-3">
              {platform.logo ? <img src={platform.logo} alt="EduIgnite" className="w-8 h-8 object-contain rounded bg-primary p-1" /> : null}
              <p className="text-left text-[8px] uppercase font-black text-muted-foreground opacity-30 tracking-[0.2em]">
                {platform.name} Secure Professional Registry • Node: {student?.schoolId} • {new Date().getFullYear()}
              </p>
           </div>
           <div className="flex items-center gap-4">
              <QrCode className="w-10 h-10 opacity-10" />
              <div className="text-left">
                <p className="text-[7px] font-black uppercase text-[#264D73]/40 leading-none">Date Verified</p>
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
      <path d="M15 30L85 10" stroke="currentColor" strokeWidth="1" strokeOpacity="0.3" strokeDasharray="2 2" />
    </svg>
  );
}
