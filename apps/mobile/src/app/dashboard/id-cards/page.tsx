
"use client";

import { roleLabel, categoryOfPerson } from "@/lib/role-labels";
import { useEffect, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { useAllStudents } from "@/lib/hooks/useStudents";
import { StudentIdCard } from "@/components/student-id-card";
import { isNativeApp, saveToEduignite } from "@/lib/native-download";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  CreditCard, 
  Search, 
  Printer, 
  Download, 
  Building2, 
  User, 
  MapPin, 
  QrCode, 
  Layers, 
  GraduationCap, 
  ShieldCheck,
  CheckCircle2,
  X,
  Eye,
  FileCheck,
  ChevronRight,
  Plus,
  Info,
  Phone,
  Signature,
  Network,
  Filter
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { resolveMediaUrl } from "@/lib/media";
import { resolvePlatformLogoUrl } from "@/lib/platform-brand";
import { pdfGenerationService } from "@/lib/pdf-generation-service";
import { usersService } from "@/lib/api/services/users.service";
import { useEducationCategory, useBasicSections } from "@/lib/hooks/useEducationCategory";
import { useSchool, useSchoolSettings } from "@/lib/hooks/useSchools";
import { getClassLevels, type Subsystem } from "@/lib/cameroon-education-system";
import {
  BasicEducationIdCard,
  DEFAULT_BASIC_CARD_OPTIONS,
  splitClassLabel,
  shortLevelLabel,
  type BasicIdCardData,
  type BasicIdCardOptions,
} from "@/components/basic-education-id-card";
import {
  BasicCardControls,
  BasicStaffTable,
  type CardListMode,
  type CardTemplateChoice,
  type StaffCardRow,
} from "@/components/basic-id-card-controls";
import { computeAcademicYear } from "@/components/student-id-card";

const STAFF_ROLES_FOR_CARDS = "TEACHER,SUB_ADMIN,BURSAR,LIBRARIAN,SCHOOL_ADMIN";
const STAFF_ROLE_LABELS: Record<string, string> = {
  TEACHER: "Teacher",
  SUB_ADMIN: "Sub-Admin",
  BURSAR: "Bursar",
  LIBRARIAN: "Librarian",
};

const CLASSES = ["6ème / Form 1", "5ème / Form 2", "4ème / Form 3", "3ème / Form 4", "2nde / Form 5", "1ère / Lower Sixth", "Terminale / Upper Sixth"];
const SECTIONS = ["Anglophone Section", "Francophone Section", "Technical Section"];

export default function IdCardsPage() {
  const { user, platformSettings } = useAuth();
  const platformLogo = resolvePlatformLogoUrl(platformSettings.logo);
  const { t, language } = useI18n();
  const { toast } = useToast();
  const schoolInfo = user?.school as (typeof user.school & { settings?: { academic_year?: string }; matricule?: string }) | undefined;
  const isStudent = user?.role === "STUDENT";

  const [searchTerm, setSearchTerm] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // ---- Basic Education (nursery and primary) ----
  // The Basic Education template is chosen automatically for basic schools; the
  // classic card stays available from the template selector. Every other
  // category renders exactly what it did before.
  const educationCategory = useEducationCategory();
  const isBasic = educationCategory === "basic";
  const basicSections = useBasicSections();
  const basicSchoolId = isBasic ? schoolInfo?.id ?? "" : "";
  const { data: schoolDetail } = useSchool(basicSchoolId);
  const { data: schoolSettingsData } = useSchoolSettings(basicSchoolId);
  const [templateChoice, setTemplateChoice] = useState<CardTemplateChoice | null>(null);
  const useBasicCard = isBasic && templateChoice !== "classic";
  const [cardMode, setCardMode] = useState<CardListMode>("students");
  const showStaff = useBasicCard && cardMode === "staff" && !isStudent;
  const [staffSearch, setStaffSearch] = useState("");
  const [basicOptions, setBasicOptions] = useState<BasicIdCardOptions>(() => ({
    ...DEFAULT_BASIC_CARD_OPTIONS,
    schoolColor:
      ((user?.school as unknown as { primary_color?: string } | undefined)?.primary_color) || DEFAULT_BASIC_CARD_OPTIONS.schoolColor,
  }));
  const optionsStorageKey = `eduignite.basic-id-card.${basicSchoolId}`;

  useEffect(() => {
    if (!basicSchoolId) return;
    try {
      const saved = window.localStorage.getItem(optionsStorageKey);
      if (saved) setBasicOptions((prev) => ({ ...prev, ...JSON.parse(saved), lang: prev.lang }));
    } catch {
      /* private mode or bad JSON: keep the defaults */
    }
  }, [basicSchoolId, optionsStorageKey]);

  const updateBasicOptions = (patch: Partial<BasicIdCardOptions>) => {
    setBasicOptions((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage.setItem(optionsStorageKey, JSON.stringify(next));
      } catch {
        /* storage unavailable: the choice just is not remembered */
      }
      return next;
    });
  };

  const rawSubsystem = String((schoolDetail as unknown as { subsystem?: string } | undefined)?.subsystem || "").toLowerCase();
  const basicSubsystem: Subsystem = rawSubsystem === "anglophone" || rawSubsystem === "francophone" ? rawSubsystem : "bilingual";
  // Category-driven class list (nursery and/or primary, per the school's sections).
  const basicClassOptions = useMemo(
    () => getClassLevels(basicSubsystem, "general", "basic", basicSections).map((c) => ({ value: c.value, label: c.label })),
    [basicSubsystem, basicSections],
  );

  const { data: staffApi, isLoading: staffLoading } = useQuery({
    queryKey: ["id-card-staff", schoolInfo?.id],
    queryFn: () => usersService.getAllUsers({ role: STAFF_ROLES_FOR_CARDS } as any),
    enabled: showStaff,
  });

  // Fetch real student data from API
  const { data: studentsApiData } = useAllStudents({ search: searchTerm || undefined, include_qr: true });

  // Build student list from real API data
  const studentList = useMemo(() => {
    return (studentsApiData?.results || []).map((s: any) => ({
      id: s.admission_number || s.user?.matricule || s.id,
      // The full account matricule — this is what the ID card must display,
      // not the registration/admission number.
      matricule: (isBasic ? s.display_matricule : '') || s.user?.matricule || '',
      name: (isBasic ? s.full_name : '') || s.user?.name || 'Unknown',
      class: s.student_class || 'Unknown',
      section: s.section || 'Unknown',
      avatar: resolveMediaUrl((isBasic ? s.display_avatar : '') || s.user?.avatar) || '',
      classLevel: s.class_level || '',
      dob: s.date_of_birth || '',
      placeOfBirth: s.place_of_birth || '',
      gender: s.gender || '',
      admissionNumber: s.admission_number || '',
      admissionDate: s.admission_date || '',
      admissionYear: s.admission_date ? String(new Date(s.admission_date).getFullYear()) : '',
      qrCode: s.qr_code || '',
      guardian: s.guardian_name || '',
      guardianPhone: s.guardian_phone || '',
      address: s.address || '',
    }));
  }, [studentsApiData, isBasic]);

  const availableClasses = useMemo(
    () => Array.from(new Set(studentList.map((student: any) => student.class).filter(Boolean))).sort(),
    [studentList]
  );

  const availableSections = useMemo(
    () => Array.from(new Set(studentList.map((student: any) => student.section).filter(Boolean))).sort(),
    [studentList]
  );

  const filtered = studentList.filter((s: any) => {
    const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesClass =
      classFilter === "all" ||
      (isBasic
        ? s.classLevel === classFilter || s.class === (basicClassOptions.find((o) => o.value === classFilter)?.label ?? classFilter)
        : s.class === classFilter);
    const matchesSection = sectionFilter === "all" || s.section === sectionFilter;
    return matchesSearch && matchesClass && matchesSection;
  });

  useEffect(() => {
    if (isStudent && studentList[0] && selectedStudents.length === 0) {
      setSelectedStudents([studentList[0].id]);
    }
  }, [isStudent, selectedStudents.length, studentList]);

  const toggleSelectAll = () => {
    if (selectedStudents.length === filtered.length) {
      setSelectedStudents([]);
    } else {
      setSelectedStudents(filtered.map(s => s.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedStudents(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const staffList: StaffCardRow[] = useMemo(
    () =>
      ((staffApi as any)?.results || []).map((u: any) => ({
        id: String(u.id),
        name: u.name || "Unknown",
        matricule: u.matricule || "",
        role: u.role === "SCHOOL_ADMIN"
          ? roleLabel(u.role, categoryOfPerson(u) ?? educationCategory, language)
          : STAFF_ROLE_LABELS[u.role] || String(u.role || ""),
        phone: u.phone || "",
        avatar: resolveMediaUrl(u.avatar) || "",
      })),
    [staffApi, educationCategory, language],
  );
  const filteredStaff = staffList.filter((u) => {
    const q = staffSearch.toLowerCase();
    return !q || u.name.toLowerCase().includes(q) || u.matricule.toLowerCase().includes(q);
  });

  const academicYearLabel =
    (schoolSettingsData as unknown as { academic_year?: string } | undefined)?.academic_year ||
    schoolInfo?.settings?.academic_year ||
    computeAcademicYear();

  const buildBasicCardData = (id: string): BasicIdCardData | null => {
    const school = {
      name: user?.school?.name || "School Name",
      logo: user?.school?.logo,
      address: schoolInfo?.address || (schoolInfo as any)?.location,
    };
    const member = staffList.find((u) => u.id === id);
    if (member) {
      return {
        kind: "staff",
        name: member.name,
        idNo: member.matricule,
        role: member.role,
        photo: member.avatar || undefined,
        emergencyPhone: member.phone,
        academicYear: academicYearLabel,
        school,
      };
    }
    const s: any = studentList.find((item: any) => item.id === id);
    if (!s) return null;
    const levelLabel = shortLevelLabel(basicClassOptions.find((o) => o.value === s.classLevel)?.label || s.classLevel);
    const { level, stream } = splitClassLabel(levelLabel, s.class === "Unknown" ? "" : s.class);
    return {
      kind: "student",
      name: s.name,
      idNo: s.matricule || s.id,
      level,
      stream,
      dob: s.dob || undefined,
      photo: s.avatar || undefined,
      qr: s.qrCode || undefined,
      emergencyName: s.guardian,
      emergencyPhone: s.guardianPhone,
      academicYear: academicYearLabel,
      school,
    };
  };

  const toggleSelectAllStaff = () => {
    setSelectedStudents(selectedStudents.length === filteredStaff.length ? [] : filteredStaff.map((u) => u.id));
  };

  const handleGenerate = () => {
    if (selectedStudents.length === 0) {
      toast({ variant: "destructive", title: "No Students Selected", description: "Please select at least one student to generate IDs." });
      return;
    }
    setIsPreviewing(true);
  };

  const downloadGeneratedFile = (url: string, fileName: string) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  // One CR80 card per page, each side on its own page — built by the shared
  // helper, which waits for the web font and the school logo before capturing
  // so the header is never cut off. On the phone the WebView has no print
  // dialog, so the same PDF is saved into the eduignite folder instead.
  const cardFileName = () => {
    const first = document.querySelector<HTMLElement>("[data-idcard-side]")?.getAttribute("data-idcard-name") || "student";
    const slug = first.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "student";
    return selectedStudents.length > 1 ? "student-id-cards.pdf" : `id-card-${slug}.pdf`;
  };

  const handleDownloadPdf = async () => {
    if (selectedStudents.length === 0) {
      toast({ variant: "destructive", title: "No Students Selected", description: "Please select at least one student to generate IDs." });
      return;
    }
    setIsGeneratingPdf(true);
    try {
      const { buildIdCardsPdf } = await import("@/lib/id-card-pdf");
      const doc = await buildIdCardsPdf(document.body);
      const fileName = cardFileName();
      if (isNativeApp()) {
        const base64 = doc.output("datauristring").split(",")[1] || "";
        await saveToEduignite({ fileName, base64, mimeType: "application/pdf" });
        toast({ title: "ID card saved", description: `Saved as a PDF (${selectedStudents.length * 2} pages at 85.6 × 53.98 mm) in your Documents/eduignite folder.` });
      } else {
        doc.save(fileName);
        toast({ title: "ID cards downloaded", description: `${selectedStudents.length * 2} pages at 85.6 × 53.98 mm, front and back separated.` });
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Could not build the cards", description: err?.message || "Please try again." });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handlePrint = async () => {
    if (selectedStudents.length === 0) {
      toast({ variant: "destructive", title: "No Students Selected", description: "Please select at least one student to generate IDs." });
      return;
    }
    // No print dialog inside the WebView — save the PDF instead.
    if (isNativeApp()) { await handleDownloadPdf(); return; }
    setIsGeneratingPdf(true);
    try {
      const { printIdCardsPdf } = await import("@/lib/id-card-pdf");
      await printIdCardsPdf(document.body);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Could not open print", description: err?.message || "Please try again." });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary font-headline flex items-center gap-3">
            <div className="p-2 bg-primary rounded-xl shadow-lg text-white">
              <CreditCard className="w-6 h-6 text-secondary" />
            </div>
            {language === 'en' ? 'Institutional ID Cards' : 'Cartes d\'Identité'}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isStudent
              ? "View, print, and download your official Cameroonian secondary school ID card when published by your school."
              : "Generate and manage official dual-sided ID cards for the student body."}
          </p>
        </div>
        
        <Button 
          className="gap-2 shadow-lg h-12 px-6 rounded-2xl" 
          onClick={handleGenerate}
          disabled={selectedStudents.length === 0}
        >
          <Plus className="w-5 h-5" /> {language === 'en' ? 'Generate Selected' : 'Générer la Sélection'} ({selectedStudents.length})
        </Button>
      </div>

      {isBasic && !isStudent && (
        <BasicCardControls
          template={useBasicCard ? "basic" : "classic"}
          onTemplateChange={(value) => { setTemplateChoice(value); setSelectedStudents([]); if (value === "classic") setCardMode("students"); }}
          mode={cardMode}
          onModeChange={(value) => { setCardMode(value); setSelectedStudents([]); }}
          options={basicOptions}
          onOptionsChange={updateBasicOptions}
          fr={language === "fr"}
        />
      )}

      {showStaff && (
        <BasicStaffTable
          rows={filteredStaff}
          selected={selectedStudents}
          onToggle={toggleSelect}
          onToggleAll={toggleSelectAllStaff}
          search={staffSearch}
          onSearchChange={setStaffSearch}
          fr={language === "fr"}
          loading={staffLoading}
        />
      )}

      {!showStaff && (
      <Card className="border-none shadow-xl overflow-hidden rounded-3xl">
        <CardHeader className="bg-white border-b p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative col-span-1 md:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Find student by name or ID..." 
                className="pl-10 h-11 bg-accent/20 border-none rounded-xl"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex gap-2 col-span-1 md:col-span-2">
              <Select value={sectionFilter} onValueChange={setSectionFilter}>
                <SelectTrigger className="flex-1 h-11 bg-accent/20 border-none rounded-xl">
                  <div className="flex items-center gap-2">
                    <Network className="w-3.5 h-3.5 text-primary/40" />
                    <SelectValue placeholder="All Sections" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Entire Node</SelectItem>
                  {availableSections.map((section) => <SelectItem key={section} value={section}>{section}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={classFilter} onValueChange={setClassFilter}>
                <SelectTrigger className="flex-1 h-11 bg-accent/20 border-none rounded-xl">
                  <div className="flex items-center gap-2">
                    <Filter className="w-3.5 h-3.5 text-primary/40" />
                    <SelectValue placeholder="All Classes" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classes</SelectItem>
                  {(isBasic ? basicClassOptions : availableClasses.map((className) => ({ value: className, label: className }))).map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-accent/10 border-b border-accent/20">
                <TableHead className="w-[50px] pl-8">
                  {isStudent ? null : (
                    <Checkbox
                      checked={selectedStudents.length === filtered.length && filtered.length > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                  )}
                </TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest py-4">Matricule</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest">Student Profile</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest">Academic Level</TableHead>
                <TableHead className="text-center font-black uppercase text-[10px] tracking-widest">Card Status</TableHead>
                <TableHead className="pr-8 text-right font-black uppercase text-[10px] tracking-widest">Preview</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => (
                <TableRow key={s.id} className={cn("group hover:bg-accent/5 border-b border-accent/10", selectedStudents.includes(s.id) && "bg-primary/5")}>
                  <TableCell className="pl-8">
                    {isStudent ? null : (
                      <Checkbox
                        checked={selectedStudents.includes(s.id)}
                        onCheckedChange={() => toggleSelect(s.id)}
                      />
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs font-bold text-primary">{s.id}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10 border-2 border-white shadow-sm ring-1 ring-accent">
                        <AvatarImage src={s.avatar} />
                        <AvatarFallback className="bg-primary/5 text-primary text-xs">{s.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="font-bold text-sm text-primary">{s.name}</span>
                        <span className="text-[8px] font-black uppercase opacity-40">{s.section}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] border-primary/20 text-primary font-bold">{s.class}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge className="bg-green-100 text-green-700 border-none text-[9px] font-black">VALIDATED</Badge>
                  </TableCell>
                  <TableCell className="pr-8 text-right">
                    <Button variant="ghost" size="icon" onClick={() => { setSelectedStudents([s.id]); setIsPreviewing(true); }} className="rounded-full hover:bg-accent">
                      <Eye className="w-4 h-4 text-primary" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      )}

      {/* ID CARD PREVIEW & PRINT DIALOG */}
      <Dialog open={isPreviewing} onOpenChange={setIsPreviewing}>
        <DialogContent className="sm:max-w-5xl max-h-[95vh] overflow-y-auto p-0 border-none shadow-2xl rounded-3xl">
          <DialogHeader className="bg-primary p-8 text-white no-print">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="bg-white/20 p-3 rounded-2xl">
                  <CreditCard className="w-8 h-8 text-secondary" />
                </div>
                <div>
                  <DialogTitle className="text-2xl font-black">Professional ID Card Suite</DialogTitle>
                  <DialogDescription className="text-white/60">Dual-sided Cameroonian standard cards for {selectedStudents.length} students.</DialogDescription>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setIsPreviewing(false)} className="text-white">
                <X className="w-6 h-6" />
              </Button>
            </div>
          </DialogHeader>

          <div className="bg-muted p-8 print:p-0 print:bg-white min-h-[60vh]">
            <div className="flex flex-col gap-12 items-center print:gap-8">
              {selectedStudents.map(id => {
                if (useBasicCard) {
                  const basicData = buildBasicCardData(id);
                  return basicData ? (
                    <BasicEducationIdCard key={id} data={basicData} options={{ ...basicOptions, lang: language === "fr" ? "fr" : "en" }} />
                  ) : null;
                }
                const s = studentList.find((item: any) => item.id === id);
                if (!s) return null;
                return (
                  <StudentIdCard
                    key={s.id}
                    student={{
                      name: s.name,
                      matricule: (s as any).matricule || s.id,
                      className: s.class,
                      section: s.section,
                      dob: s.dob,
                      placeOfBirth: (s as any).placeOfBirth,
                      gender: s.gender,
                      admissionNumber: (s as any).admissionNumber,
                      avatar: s.avatar,
                      qrCode: s.qrCode,
                      guardian: s.guardian,
                      guardianPhone: s.guardianPhone,
                    }}
                    school={{
                      name: user?.school?.name || "School Name",
                      motto: user?.school?.motto,
                      logo: user?.school?.logo,
                      address: schoolInfo?.address || schoolInfo?.location,
                      phone: schoolInfo?.phone,
                      principal: user?.school?.principal,
                    }}
                    platform={{ name: platformSettings.name, logo: platformLogo }}
                  />
                );
              })}
            </div>
          </div>

          <DialogFooter className="bg-accent/10 p-6 border-t no-print flex sm:flex-row gap-3">
            <div className="flex-1 flex items-center gap-2 text-muted-foreground italic">
               <Info className="w-4 h-4" />
               <p className="text-[10px]">Optimized for standard 85.60 × 53.98 mm (CR80) PVC cards.</p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="rounded-xl h-12 px-8" onClick={() => setIsPreviewing(false)}>Back to List</Button>
              <Button variant="outline" className="rounded-xl h-12 px-8 font-bold gap-2" onClick={handleDownloadPdf} disabled={isGeneratingPdf}>
                <Download className="w-5 h-5" /> {isGeneratingPdf ? "Preparing PDF..." : `Download PDF (${selectedStudents.length})`}
              </Button>
              <Button className="rounded-xl h-12 px-8 shadow-lg font-bold gap-2" onClick={handlePrint}>
                <Printer className="w-5 h-5" /> Print Batch ({selectedStudents.length})
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
