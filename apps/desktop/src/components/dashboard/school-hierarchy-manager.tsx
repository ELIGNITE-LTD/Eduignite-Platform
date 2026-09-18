"use client";

import { useEffect, useState } from "react";
import { BookOpen, Building2, Eye, FileText, GraduationCap, Layers3, Loader2, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { generateBrandedTablePdf } from "@/lib/pdf-branded";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { schoolsService } from "@/lib/api/services/schools.service";
import { gradesService } from "@/lib/api/services/grades.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import type { HierarchyClass, HierarchyClassExplore, HierarchyClassSubject, HierarchySubAdmin, HierarchySubSchool, Subject, User } from "@/lib/api/types";

import { useCameroonConfig } from "@/lib/hooks/useConfig";

// Francophone + Anglophone general class level options
const CLASS_LEVEL_OPTIONS_FR = [
  "Sixième (6ème)","Cinquième (5ème)","Quatrième (4ème)","Troisième (3ème)",
  "Seconde","Première","Terminale",
];
const CLASS_LEVEL_OPTIONS_AN = [
  "Form 1","Form 2","Form 3","Form 4","Form 5","Lower Sixth","Upper Sixth",
];
const CLASS_LEVEL_OPTIONS_TECH_FR = [
  "CAP 1","CAP 2","BEP 1","BEP 2","BAC TECH 1","BAC TECH 2","BAC TECH 3",
];
const CLASS_LEVEL_OPTIONS_TECH_AN = [
  "Technical Year 1","Technical Year 2","Technical Year 3","Technical Year 4","Technical Year 5",
];
const TECHNICAL_CLASS_LEVELS = new Set([...CLASS_LEVEL_OPTIONS_TECH_FR,...CLASS_LEVEL_OPTIONS_TECH_AN]);

const SPECIALISATION_OPTIONS = [
  "Informatique","Électronique","Mécanique Automobile","Génie Civil",
  "Secrétariat-Bureautique","Comptabilité","Hôtellerie-Restauration",
  "Agriculture","Couture-Mode","Électricité","Menuiserie","Plomberie",
  "Soudure","Commerce","Gestion",
];

interface SchoolHierarchyManagerProps {
  schoolId: string;
  schoolName?: string;
}

const NONE = "__none__";

function ensureArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function SchoolHierarchyManager({ schoolId, schoolName }: SchoolHierarchyManagerProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: cameroonConfig } = useCameroonConfig();
  const [isDownloadingClassList, setIsDownloadingClassList] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [subSchools, setSubSchools] = useState<HierarchySubSchool[]>([]);
  const [staff, setStaff] = useState<User[]>([]);
  const [subAdmins, setSubAdmins] = useState<HierarchySubAdmin[]>([]);
  const [classes, setClasses] = useState<HierarchyClass[]>([]);
  const [subjects, setSubjects] = useState<HierarchyClassSubject[]>([]);
  const [subjectCatalog, setSubjectCatalog] = useState<Subject[]>([]);
  const [classFilter, setClassFilter] = useState("all");
  const [subjectClassFilter, setSubjectClassFilter] = useState("all");
  const [subjectSubSchoolFilter, setSubjectSubSchoolFilter] = useState("all");
  const [subjectTypeFilter, setSubjectTypeFilter] = useState("all");
  const [editingSubSchoolId, setEditingSubSchoolId] = useState<string | null>(null);
  const [editingAdminId, setEditingAdminId] = useState<string | null>(null);
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
  const [exploreClass, setExploreClass] = useState<HierarchyClassExplore | null>(null);
  const [isExploreLoading, setIsExploreLoading] = useState(false);

  const [subSchoolForm, setSubSchoolForm] = useState({ name: "", vice_principal: NONE });
  const [adminForm, setAdminForm] = useState({ staff: "", sub_school: "" });
  const [classForm, setClassForm] = useState({ name: "", class_master: NONE, sub_school: NONE, classLevel: "", specialisation: "" });
  const [subjectForm, setSubjectForm] = useState({
    school_class: "",
    subject: NONE,
    subject_name: "",
    teacher: NONE,
    type: "mandatory" as "mandatory" | "optional",
    coefficient: "1",
  });

  const staffOptions = ensureArray<User>(staff).filter((member) => member && member.role !== "STUDENT" && member.role !== "PARENT");
  const teacherOptions = ensureArray<User>(staff).filter((member) =>
    member && ["TEACHER", "SUB_ADMIN", "SCHOOL_ADMIN"].includes(member.role)
  );

  const refreshHierarchy = async () => {
    setIsLoading(true);
    try {
      const [subSchoolData, staffData, subAdminData, classData, subjectData, subjectDataSet] = await Promise.all([
        schoolsService.getSubSchools(schoolId),
        schoolsService.getHierarchyStaff(schoolId),
        schoolsService.getSubAdmins(schoolId),
        schoolsService.getHierarchyClasses({ school_id: schoolId }),
        schoolsService.getHierarchySubjects({ school_id: schoolId }),
        gradesService.getSubjects({ school_id: schoolId }),
      ]);
      setSubSchools(ensureArray<HierarchySubSchool>(subSchoolData));
      setStaff(ensureArray<User>(staffData));
      setSubAdmins(ensureArray<HierarchySubAdmin>(subAdminData));
      setClasses(ensureArray<HierarchyClass>(classData));
      setSubjects(ensureArray<HierarchyClassSubject>(subjectData));
      setSubjectCatalog(ensureArray<Subject>(subjectDataSet?.results));
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Hierarchy load failed",
        description: getApiErrorMessage(error, "Could not load the hierarchy workspace."),
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refreshHierarchy();
  }, [schoolId]);

  const withSave = async (work: () => Promise<void>) => {
    setIsSaving(true);
    try {
      await work();
    } finally {
      setIsSaving(false);
    }
  };

  const resetSubSchoolForm = () => {
    setEditingSubSchoolId(null);
    setSubSchoolForm({ name: "", vice_principal: NONE });
  };

  const resetAdminForm = () => {
    setEditingAdminId(null);
    setAdminForm({ staff: "", sub_school: "" });
  };

  const resetClassForm = () => {
    setEditingClassId(null);
    setClassForm({ name: "", class_master: NONE, sub_school: NONE, classLevel: "", specialisation: "" });
  };

  const resetSubjectForm = () => {
    setEditingSubjectId(null);
    setSubjectForm({ school_class: "", subject: NONE, subject_name: "", teacher: NONE, type: "mandatory", coefficient: "1" });
  };

  const filteredClasses = ensureArray<HierarchyClass>(classes).filter((item) => item && (classFilter === "all" || item.sub_school === classFilter));

  // The classes in view as an official class list: class master and the
  // number of teachers, subjects and students in each, with the totals.
  const downloadClassList = async () => {
    if (filteredClasses.length === 0) {
      toast({ variant: "destructive", title: "Nothing to download", description: "There are no classes in the current view." });
      return;
    }
    setIsDownloadingClassList(true);
    try {
      // The signed-in school's own record supplies the crest, motto and
      // principal; anyone viewing another school gets its name alone.
      const ownSchool = user?.school && String(user.school.id) === String(schoolId) ? user.school : null;
      const sectionName = classFilter === "all"
        ? "All Sub Schools"
        : subSchools.find((item) => item.id === classFilter)?.name || "-";
      const count = (value: unknown) => Number(value) || 0;
      const totalStudents = filteredClasses.reduce((sum, item) => sum + count(item.total_students), 0);
      const totalTeachers = filteredClasses.reduce((sum, item) => sum + count(item.total_teachers), 0);
      const name = schoolName || ownSchool?.name || "EduIgnite";

      await generateBrandedTablePdf({
        title: "Official Class List & Enrollment Roster",
        school: ownSchool ?? { name },
        schoolName: name,
        chips: [
          { label: "Section", value: sectionName },
          { label: "Total Classes", value: `${filteredClasses.length} Classes` },
          { label: "Total Students", value: `${totalStudents} Students` },
        ],
        issuingOffice: "Academic Studies & Timetable Board",
        centerColumns: [3, 4, 5],
        columns: ["No", "Class Name", "Class Master", "Number of Teachers", "Number of Subjects", "Number of Students"],
        rows: filteredClasses.map((item, index) => [
          index + 1,
          item.name,
          item.class_master_name || "-",
          count(item.total_teachers),
          count(item.total_subjects),
          count(item.total_students),
        ]),
        footnote: `Total institutional summary: ${filteredClasses.length} classes, average ${Math.round(totalTeachers / filteredClasses.length)} teachers per class, ${totalStudents} students enrolled.`,
        fileName: `${name.replace(/\s+/g, "_").toLowerCase()}_class_list`,
      });
      toast({ title: "Class list ready", description: "The class list PDF has been generated." });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Download failed",
        description: error instanceof Error ? error.message : "Could not generate the class list PDF.",
      });
    } finally {
      setIsDownloadingClassList(false);
    }
  };
  const filteredSubjects = ensureArray<HierarchyClassSubject>(subjects).filter((item) => {
    if (!item) return false;
    if (subjectClassFilter !== "all" && item.school_class !== subjectClassFilter) return false;
    if (subjectSubSchoolFilter !== "all" && item.sub_school?.id !== subjectSubSchoolFilter) return false;
    if (subjectTypeFilter !== "all" && item.type !== subjectTypeFilter) return false;
    return true;
  });

  const handleSaveSubSchool = async () => {
    if (!subSchoolForm.name.trim()) {
      toast({ variant: "destructive", title: "Name required", description: "Sub school name is required." });
      return;
    }
    await withSave(async () => {
      const payload = { name: subSchoolForm.name.trim(), vice_principal: subSchoolForm.vice_principal === NONE ? null : subSchoolForm.vice_principal, school_id: schoolId };
      if (editingSubSchoolId) await schoolsService.updateSubSchool(editingSubSchoolId, payload);
      else await schoolsService.createSubSchool(payload);
      resetSubSchoolForm();
      await refreshHierarchy();
      toast({ title: "Sub school saved", description: "The sub school hierarchy has been updated." });
    });
  };

  const handleSaveAdmin = async () => {
    if (!adminForm.staff || !adminForm.sub_school) {
      toast({ variant: "destructive", title: "Selection required", description: "Pick both staff and sub school." });
      return;
    }
    await withSave(async () => {
      if (editingAdminId) await schoolsService.updateSubAdmin(editingAdminId, { sub_school: adminForm.sub_school, school_id: schoolId });
      else await schoolsService.assignSubAdmin({ staff: adminForm.staff, sub_school: adminForm.sub_school, school_id: schoolId });
      resetAdminForm();
      await refreshHierarchy();
      toast({ title: "Sub admin saved", description: "Admin assignment is now active." });
    });
  };

  const handleSaveClass = async () => {
    if (!classForm.name.trim()) {
      toast({ variant: "destructive", title: "Class name required", description: "Enter the class name." });
      return;
    }
    await withSave(async () => {
      const payload = { name: classForm.name.trim(), class_master: classForm.class_master === NONE ? null : classForm.class_master, sub_school: classForm.sub_school === NONE ? null : classForm.sub_school, school_id: schoolId };
      if (editingClassId) await schoolsService.updateHierarchyClass(editingClassId, payload);
      else await schoolsService.createHierarchyClass(payload);
      resetClassForm();
      await refreshHierarchy();
      toast({ title: "Class saved", description: "The class hierarchy has been updated." });
    });
  };

  const handleSaveSubject = async () => {
    if (!subjectForm.school_class) {
      toast({ variant: "destructive", title: "Class required", description: "Pick a class for this subject." });
      return;
    }
    if (subjectForm.subject === NONE && !subjectForm.subject_name.trim()) {
      toast({ variant: "destructive", title: "Subject required", description: "Select an existing subject or type a new subject name." });
      return;
    }
    if (!subjectForm.coefficient || Number(subjectForm.coefficient) <= 0) {
      toast({ variant: "destructive", title: "Coefficient required", description: "Enter a coefficient greater than zero." });
      return;
    }
    await withSave(async () => {
      const payload = {
        school_class: subjectForm.school_class,
        subject: subjectForm.subject === NONE ? null : subjectForm.subject,
        subject_name: subjectForm.subject === NONE ? subjectForm.subject_name.trim() : "",
        teacher: subjectForm.teacher === NONE ? null : subjectForm.teacher,
        type: subjectForm.type,
        coefficient: subjectForm.coefficient,
        school_id: schoolId,
      };
      if (editingSubjectId) await schoolsService.updateHierarchySubject(editingSubjectId, payload);
      else await schoolsService.createHierarchySubject(payload);
      resetSubjectForm();
      await refreshHierarchy();
      toast({ title: "Subject saved", description: "The class-subject relationship is now active." });
    });
  };

  const openExplore = async (classId: string) => {
    setIsExploreLoading(true);
    try {
      setExploreClass(await schoolsService.exploreHierarchyClass(classId, schoolId));
    } catch (error) {
      toast({ variant: "destructive", title: "Explore failed", description: getApiErrorMessage(error, "Could not load class details.") });
    } finally {
      setIsExploreLoading(false);
    }
  };

  if (isLoading) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary/30" /></div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-20">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold text-primary font-headline">
            <div className="rounded-xl bg-primary p-2 text-secondary shadow-lg"><Layers3 className="h-6 w-6" /></div>
            Hierarchy & Sections
          </h1>
          <p className="mt-1 text-muted-foreground">Review the system-generated Cameroon secondary school structure for {schoolName || "your school"} and manage vice-principals, classes, and subjects.</p>
        </div>
      </div>

      <Card className="overflow-hidden rounded-3xl border-none bg-primary text-white shadow-sm">
        <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="rounded-2xl bg-white/10 p-3"><Building2 className="h-6 w-6 text-secondary" /></div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/50">Hierarchy Registry</p>
              <h2 className="text-xl font-black">{schoolName || "Institution"}</h2>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-center md:grid-cols-4">
            <div className="rounded-2xl bg-white/10 px-4 py-3"><p className="text-2xl font-black text-secondary">{subSchools.length}</p><p className="text-[9px] font-black uppercase tracking-widest text-white/50">Sub Schools</p></div>
            <div className="rounded-2xl bg-white/10 px-4 py-3"><p className="text-2xl font-black text-secondary">{subAdmins.length}</p><p className="text-[9px] font-black uppercase tracking-widest text-white/50">Admins</p></div>
            <div className="rounded-2xl bg-white/10 px-4 py-3"><p className="text-2xl font-black text-secondary">{classes.length}</p><p className="text-[9px] font-black uppercase tracking-widest text-white/50">Classes</p></div>
            <div className="rounded-2xl bg-white/10 px-4 py-3"><p className="text-2xl font-black text-secondary">{subjects.length}</p><p className="text-[9px] font-black uppercase tracking-widest text-white/50">Class Subjects</p></div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="sub-schools" className="space-y-6">
        <TabsList className="grid h-auto w-full grid-cols-2 rounded-3xl bg-white p-2 shadow-sm md:grid-cols-4">
          <TabsTrigger value="sub-schools" className="rounded-2xl py-3 font-bold"><Building2 className="mr-2 h-4 w-4" />Sub Schools</TabsTrigger>
          <TabsTrigger value="admins" className="rounded-2xl py-3 font-bold"><ShieldCheck className="mr-2 h-4 w-4" />Admins</TabsTrigger>
          <TabsTrigger value="classes" className="rounded-2xl py-3 font-bold"><GraduationCap className="mr-2 h-4 w-4" />Classes</TabsTrigger>
          <TabsTrigger value="subjects" className="rounded-2xl py-3 font-bold"><BookOpen className="mr-2 h-4 w-4" />Subjects</TabsTrigger>
        </TabsList>

        <TabsContent value="sub-schools" className="space-y-6">
          <Card className="rounded-3xl border-none bg-primary/5 shadow-sm">
            <CardContent className="p-6">
              <p className="text-sm font-semibold text-primary">
                Core sections are automatically determined by your school type and language subsystem. You can add extra school-created sections for campuses, streams, or special programmes without affecting the system-generated Cameroon structure.
              </p>
            </CardContent>
          </Card>
          <Card className="rounded-3xl border-none shadow-sm">
            <CardHeader>
              <CardTitle>{editingSubSchoolId ? "Update Sub School" : "Add Sub School"}</CardTitle>
              <CardDescription>Create an additional school-managed section and optionally assign its vice principal from existing staff.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={subSchoolForm.name} onChange={(event) => setSubSchoolForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="e.g. English Section Campus" />
              </div>
              <div className="space-y-2">
                <Label>Vice Principal</Label>
                <Select value={subSchoolForm.vice_principal} onValueChange={(value) => setSubSchoolForm((prev) => ({ ...prev, vice_principal: value }))}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No VP assigned</SelectItem>
                    {staffOptions.map((member) => <SelectItem key={member.id} value={member.id}>{member.name} · {member.matricule}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <Button onClick={handleSaveSubSchool} disabled={isSaving} className="flex-1 rounded-xl">
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  {editingSubSchoolId ? "Update" : "Save"}
                </Button>
                {editingSubSchoolId ? <Button variant="outline" onClick={resetSubSchoolForm} className="rounded-xl">Cancel</Button> : null}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            {subSchools.map((item) => (
              <Card key={item.id} className="rounded-3xl border-none shadow-sm">
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-primary">{item.name}</CardTitle>
                        <Badge variant={item.is_system_managed ? "secondary" : "outline"} className="rounded-full text-[9px] font-black uppercase tracking-widest">
                          {item.is_system_managed ? "System" : "School-created"}
                        </Badge>
                      </div>
                      <CardDescription>{item.vice_principal_name ? `VP: ${item.vice_principal_name}` : "No vice principal assigned yet."}</CardDescription>
                    </div>
                    <div className="min-w-56 space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Assign Vice-Principal</Label>
                      <Select
                        value={item.vice_principal || NONE}
                        onValueChange={async (value) => {
                          await withSave(async () => {
                            await schoolsService.assignVicePrincipal(schoolId, item.id, value === NONE ? null : value);
                            await refreshHierarchy();
                            toast({ title: "Vice-principal assigned", description: `${item.name} has been updated.` });
                          });
                        }}
                      >
                        <SelectTrigger className="rounded-xl"><SelectValue placeholder="Choose staff" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>No VP assigned</SelectItem>
                          {staffOptions.map((member) => <SelectItem key={member.id} value={member.id}>{member.name} · {member.matricule}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end gap-2">
                      <Button variant="outline" size="sm" className="rounded-xl" onClick={() => {
                        setEditingSubSchoolId(item.id);
                        setSubSchoolForm({ name: item.name, vice_principal: item.vice_principal || NONE });
                      }}><Pencil className="mr-2 h-4 w-4" />Edit</Button>
                      <Button variant="outline" size="sm" disabled={isSaving} className="rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10" onClick={async () => {
                        if (typeof window !== "undefined" && !window.confirm(`Delete the "${item.name}" section? Its classes and staff stay in the school but will no longer be grouped under this section.`)) return;
                        await withSave(async () => {
                          try {
                            await schoolsService.deleteSubSchool(item.id);
                            await refreshHierarchy();
                            toast({ title: "Sub school deleted", description: `${item.name} was removed from the hierarchy.` });
                          } catch (error) {
                            toast({ variant: "destructive", title: "Could not delete section", description: getApiErrorMessage(error, "This section could not be deleted.") });
                          }
                        });
                      }}><Trash2 className="mr-2 h-4 w-4" />Delete</Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="grid grid-cols-3 gap-3">
                  <div className="rounded-2xl bg-accent/30 p-4 text-center"><p className="text-2xl font-black text-primary">{item.total_classes}</p><p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Classes</p></div>
                  <div className="rounded-2xl bg-accent/30 p-4 text-center"><p className="text-2xl font-black text-primary">{item.total_staff}</p><p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Staff</p></div>
                  <div className="rounded-2xl bg-accent/30 p-4 text-center"><p className="text-2xl font-black text-primary">{item.total_subjects}</p><p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Subjects</p></div>
                </CardContent>
              </Card>
            ))}
            {subSchools.length === 0 ? <Card className="rounded-3xl border-none bg-accent/20 p-8 shadow-sm"><p className="text-sm text-muted-foreground">No sub schools created yet.</p></Card> : null}
          </div>
        </TabsContent>

        <TabsContent value="admins" className="space-y-6">
          <Card className="rounded-3xl border-none shadow-sm">
            <CardHeader>
              <CardTitle>{editingAdminId ? "Update Sub Admin" : "Add Sub Admin"}</CardTitle>
              <CardDescription>Admins are existing staff members promoted into a sub school admin role.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Staff</Label>
                <Select value={adminForm.staff} onValueChange={(value) => setAdminForm((prev) => ({ ...prev, staff: value }))} disabled={Boolean(editingAdminId)}>
                  <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                  <SelectContent>
                    {staffOptions.map((member) => <SelectItem key={member.id} value={member.id}>{member.name} · {member.matricule}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Sub School</Label>
                <Select value={adminForm.sub_school} onValueChange={(value) => setAdminForm((prev) => ({ ...prev, sub_school: value }))}>
                  <SelectTrigger><SelectValue placeholder="Assign sub school" /></SelectTrigger>
                  <SelectContent>
                    {subSchools.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <Button onClick={handleSaveAdmin} disabled={isSaving} className="flex-1 rounded-xl">
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                  {editingAdminId ? "Update" : "Assign"}
                </Button>
                {editingAdminId ? <Button variant="outline" onClick={resetAdminForm} className="rounded-xl">Cancel</Button> : null}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            {subAdmins.map((item) => (
              <Card key={item.id} className="rounded-3xl border-none shadow-sm">
                <CardHeader>
                  <CardTitle className="text-primary">{item.name}</CardTitle>
                  <CardDescription>{item.matricule}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-2xl bg-accent/30 p-4 text-sm">Assigned Sub School: <span className="font-bold text-primary">{item.assigned_sub_school_name || "None"}</span></div>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1 rounded-xl" onClick={() => {
                      setEditingAdminId(item.id);
                      setAdminForm({ staff: item.staff, sub_school: item.sub_school || "" });
                    }}><Pencil className="mr-2 h-4 w-4" />Update</Button>
                    <Button variant="outline" className="flex-1 rounded-xl text-destructive" onClick={async () => {
                      await withSave(async () => {
                        await schoolsService.unassignSubAdmin(item.id);
                        await refreshHierarchy();
                        toast({ title: "Sub admin unassigned", description: "The staff member returned to normal staff role." });
                      });
                    }}><Trash2 className="mr-2 h-4 w-4" />Unassign</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {subAdmins.length === 0 ? <Card className="rounded-3xl border-none bg-accent/20 p-8 shadow-sm"><p className="text-sm text-muted-foreground">No sub admins assigned yet.</p></Card> : null}
          </div>
        </TabsContent>

        <TabsContent value="classes" className="space-y-6">
          <Card className="rounded-3xl border-none shadow-sm">
            <CardHeader>
              <CardTitle>{editingClassId ? "Update Class" : "Add Class"}</CardTitle>
              <CardDescription>Classes link students, class masters, and class-level subject assignments.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Row 1: Class Level + Specialisation */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs font-bold">Class Level <span className="text-destructive">*</span></Label>
                  <Select
                    value={classForm.classLevel}
                    onValueChange={(value) => {
                      const isTech = TECHNICAL_CLASS_LEVELS.has(value);
                      const autoName = isTech && classForm.specialisation
                        ? `${value} ${classForm.specialisation}`
                        : value;
                      setClassForm((prev) => ({
                        ...prev,
                        classLevel: value,
                        specialisation: isTech ? prev.specialisation : "",
                        name: autoName,
                      }));
                    }}
                  >
                    <SelectTrigger className="rounded-xl h-11">
                      <SelectValue placeholder="Select class level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__sep_fr_gen" disabled className="text-[10px] font-black uppercase text-muted-foreground">── Francophone General ──</SelectItem>
                      {CLASS_LEVEL_OPTIONS_FR.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                      <SelectItem value="__sep_an_gen" disabled className="text-[10px] font-black uppercase text-muted-foreground">── Anglophone General ──</SelectItem>
                      {CLASS_LEVEL_OPTIONS_AN.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                      <SelectItem value="__sep_fr_tech" disabled className="text-[10px] font-black uppercase text-muted-foreground">── Francophone Technical ──</SelectItem>
                      {CLASS_LEVEL_OPTIONS_TECH_FR.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                      <SelectItem value="__sep_an_tech" disabled className="text-[10px] font-black uppercase text-muted-foreground">── Anglophone Technical ──</SelectItem>
                      {CLASS_LEVEL_OPTIONS_TECH_AN.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Specialisation — only visible for technical levels */}
                {TECHNICAL_CLASS_LEVELS.has(classForm.classLevel) && (
                  <div className="space-y-2">
                    <Label className="text-xs font-bold">Specialisation <span className="text-destructive">*</span></Label>
                    <Select
                      value={classForm.specialisation}
                      onValueChange={(value) => {
                        const autoName = classForm.classLevel ? `${classForm.classLevel} ${value}` : value;
                        setClassForm((prev) => ({ ...prev, specialisation: value, name: autoName }));
                      }}
                    >
                      <SelectTrigger className="rounded-xl h-11">
                        <SelectValue placeholder="Select specialisation" />
                      </SelectTrigger>
                      <SelectContent>
                        {SPECIALISATION_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Row 2: Class Name (auto-generated but editable) */}
              <div className="space-y-2">
                <Label className="text-xs font-bold">Class Name <span className="text-destructive">*</span> <span className="text-muted-foreground font-normal">(auto-generated, editable)</span></Label>
                <Input
                  value={classForm.name}
                  onChange={(event) => setClassForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="e.g. Form 5 Science A"
                  className="rounded-xl h-11"
                />
              </div>

              {/* Row 3: Class Master + Sub School */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs font-bold">Class Master / Form Master</Label>
                  <Select value={classForm.class_master} onValueChange={(value) => setClassForm((prev) => ({ ...prev, class_master: value }))}>
                    <SelectTrigger className="rounded-xl h-11"><SelectValue placeholder="Optional" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>No class master</SelectItem>
                      {staffOptions.map((member) => <SelectItem key={member.id} value={member.id}>{member.name} ({member.role})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold">Sub School / Stream</Label>
                  <Select value={classForm.sub_school} onValueChange={(value) => setClassForm((prev) => ({ ...prev, sub_school: value }))}>
                    <SelectTrigger className="rounded-xl h-11"><SelectValue placeholder="Optional" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>No sub school</SelectItem>
                      {subSchools.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2">
                <Button onClick={handleSaveClass} disabled={isSaving} className="flex-1 rounded-xl h-11">
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  {editingClassId ? "Update Class" : "Save Class"}
                </Button>
                {editingClassId && <Button variant="outline" onClick={resetClassForm} className="rounded-xl h-11">Cancel</Button>}
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            <Label className="text-sm font-semibold">Filter by Sub School</Label>
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger className="max-w-xs rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sub schools</SelectItem>
                {subSchools.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              className="ml-auto gap-2 rounded-xl border-primary/20 font-bold text-primary"
              disabled={isDownloadingClassList}
              onClick={() => void downloadClassList()}
            >
              {isDownloadingClassList ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Download class list
            </Button>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {filteredClasses.map((item) => (
              <Card key={item.id} className="rounded-3xl border-none shadow-sm">
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle className="text-primary">{item.name}</CardTitle>
                      <CardDescription>{item.class_master_name || "No class master"} · {item.sub_school_name || "No sub school"}</CardDescription>
                    </div>
                    <Button variant="outline" size="sm" className="rounded-xl" onClick={() => void openExplore(item.id)}><Eye className="mr-2 h-4 w-4" />Explore</Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-2xl bg-accent/30 p-4 text-center"><p className="text-2xl font-black text-primary">{item.total_subjects}</p><p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Subjects</p></div>
                    <div className="rounded-2xl bg-accent/30 p-4 text-center"><p className="text-2xl font-black text-primary">{item.total_teachers}</p><p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Teachers</p></div>
                    <div className="rounded-2xl bg-accent/30 p-4 text-center"><p className="text-2xl font-black text-primary">{item.total_students}</p><p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Students</p></div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1 rounded-xl" onClick={() => {
                      setEditingClassId(item.id);
                      setClassForm({ name: item.name, class_master: item.class_master || NONE, sub_school: item.sub_school || NONE, classLevel: item.name, specialisation: "" });
                    }}><Pencil className="mr-2 h-4 w-4" />Edit</Button>
                    <Button variant="outline" className="flex-1 rounded-xl text-destructive" onClick={async () => {
                      await withSave(async () => {
                        await schoolsService.deleteHierarchyClass(item.id);
                        await refreshHierarchy();
                        toast({ title: "Class deleted", description: "The class record was removed from the hierarchy." });
                      });
                    }}><Trash2 className="mr-2 h-4 w-4" />Delete</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {filteredClasses.length === 0 ? <Card className="rounded-3xl border-none bg-accent/20 p-8 shadow-sm"><p className="text-sm text-muted-foreground">No classes match this filter yet.</p></Card> : null}
          </div>
        </TabsContent>

        <TabsContent value="subjects" className="space-y-6">
          <Card className="rounded-3xl border-none shadow-sm">
            <CardHeader>
              <CardTitle>{editingSubjectId ? "Update Subject Assignment" : "Add Subject"}</CardTitle>
              <CardDescription>Subjects are assigned through classes, with the mandatory or optional type stored per class.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-6">
              <div className="space-y-2">
                <Label>Class</Label>
                <Select value={subjectForm.school_class} onValueChange={(value) => setSubjectForm((prev) => ({ ...prev, school_class: value }))}>
                  <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                  <SelectContent>{classes.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Existing Subject</Label>
                <Select value={subjectForm.subject} onValueChange={(value) => setSubjectForm((prev) => ({ ...prev, subject: value }))}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Create or type new subject</SelectItem>
                    {subjectCatalog.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Subject Name</Label>
                <Input value={subjectForm.subject_name} onChange={(event) => setSubjectForm((prev) => ({ ...prev, subject_name: event.target.value }))} placeholder="e.g. Mathematics" disabled={subjectForm.subject !== NONE} />
              </div>
              <div className="space-y-2">
                <Label>Teacher</Label>
                <Select value={subjectForm.teacher} onValueChange={(value) => setSubjectForm((prev) => ({ ...prev, teacher: value }))}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No teacher assigned</SelectItem>
                    {teacherOptions.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={subjectForm.type} onValueChange={(value: "mandatory" | "optional") => setSubjectForm((prev) => ({ ...prev, type: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mandatory">Mandatory</SelectItem>
                    <SelectItem value="optional">Optional</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Coefficient</Label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={subjectForm.coefficient}
                  onChange={(event) => setSubjectForm((prev) => ({ ...prev, coefficient: event.target.value }))}
                  placeholder="e.g. 2"
                />
              </div>
            </CardContent>
            <CardContent className="pt-0">
              <div className="flex gap-2">
                <Button onClick={handleSaveSubject} disabled={isSaving} className="rounded-xl">
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  {editingSubjectId ? "Update Subject" : "Save Subject"}
                </Button>
                {editingSubjectId ? <Button variant="outline" onClick={resetSubjectForm} className="rounded-xl">Cancel</Button> : null}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Filter by Sub School</Label>
              <Select value={subjectSubSchoolFilter} onValueChange={setSubjectSubSchoolFilter}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sub schools</SelectItem>
                  {subSchools.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Filter by Class</Label>
              <Select value={subjectClassFilter} onValueChange={setSubjectClassFilter}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All classes</SelectItem>
                  {classes.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Filter by Type</Label>
              <Select value={subjectTypeFilter} onValueChange={setSubjectTypeFilter}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="mandatory">Mandatory</SelectItem>
                  <SelectItem value="optional">Optional</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {filteredSubjects.map((item) => (
              <Card key={item.id} className="rounded-3xl border-none shadow-sm">
                <CardHeader>
                  <CardTitle className="text-primary">{item.subject_name}</CardTitle>
                  <CardDescription>{item.class_name} · {item.teacher_name || "No teacher assigned"} · {item.type}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-2xl bg-accent/30 p-4 text-sm">Sub School: <span className="font-bold text-primary">{item.sub_school?.name || "Unassigned"}</span></div>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1 rounded-xl" onClick={() => {
                      setEditingSubjectId(item.id);
                      setSubjectForm({
                        school_class: item.school_class,
                        subject: item.subject || NONE,
                        subject_name: item.subject_name || "",
                        teacher: item.teacher || NONE,
                        type: item.type,
                        coefficient: `${item.coefficient || 1}`,
                      });
                    }}><Pencil className="mr-2 h-4 w-4" />Edit</Button>
                    <Button variant="outline" className="flex-1 rounded-xl text-destructive" onClick={async () => {
                      await withSave(async () => {
                        await schoolsService.deleteHierarchySubject(item.id);
                        await refreshHierarchy();
                        toast({ title: "Subject deleted", description: "The class-subject relationship was removed." });
                      });
                    }}><Trash2 className="mr-2 h-4 w-4" />Delete</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {filteredSubjects.length === 0 ? <Card className="rounded-3xl border-none bg-accent/20 p-8 shadow-sm"><p className="text-sm text-muted-foreground">No subject assignments match this filter yet.</p></Card> : null}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(exploreClass) || isExploreLoading} onOpenChange={(open) => { if (!open) setExploreClass(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto rounded-3xl sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{exploreClass?.name || "Class details"}</DialogTitle>
            <DialogDescription>Detailed class view with linked teachers, students, and subjects.</DialogDescription>
          </DialogHeader>
          {isExploreLoading ? (
            <div className="flex min-h-[240px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary/30" /></div>
          ) : exploreClass ? (
            <div className="space-y-6">
              <Card className="rounded-3xl border-none bg-accent/20 shadow-none">
                <CardContent className="grid gap-4 p-6 md:grid-cols-4">
                  <div><p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Class Master</p><p className="font-bold text-primary">{exploreClass.class_master_name || "Not assigned"}</p></div>
                  <div><p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Sub School</p><p className="font-bold text-primary">{exploreClass.sub_school_name || "Not assigned"}</p></div>
                  <div><p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Teachers</p><p className="font-bold text-primary">{exploreClass.teachers.length}</p></div>
                  <div><p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Students</p><p className="font-bold text-primary">{exploreClass.students.length}</p></div>
                </CardContent>
              </Card>
              <div className="grid gap-6 md:grid-cols-3">
                <Card className="rounded-3xl border-none shadow-sm"><CardHeader><CardTitle className="text-lg">Teachers</CardTitle></CardHeader><CardContent className="space-y-3">{exploreClass.teachers.map((teacher) => <div key={teacher.id} className="rounded-2xl bg-accent/30 p-3 text-sm"><p className="font-bold text-primary">{teacher.name}</p><p className="text-muted-foreground">{teacher.matricule}</p></div>)}{exploreClass.teachers.length === 0 ? <p className="text-sm text-muted-foreground">No teachers linked yet.</p> : null}</CardContent></Card>
                <Card className="rounded-3xl border-none shadow-sm"><CardHeader><CardTitle className="text-lg">Students</CardTitle></CardHeader><CardContent className="space-y-3">{exploreClass.students.map((student) => <div key={student.id} className="rounded-2xl bg-accent/30 p-3 text-sm"><p className="font-bold text-primary">{student.name}</p><p className="text-muted-foreground">{student.admission_number}</p></div>)}{exploreClass.students.length === 0 ? <p className="text-sm text-muted-foreground">No students assigned yet.</p> : null}</CardContent></Card>
                <Card className="rounded-3xl border-none shadow-sm"><CardHeader><CardTitle className="text-lg">Subjects</CardTitle></CardHeader><CardContent className="space-y-3">{exploreClass.subjects.map((subject) => <div key={subject.id} className="rounded-2xl bg-accent/30 p-3 text-sm"><p className="font-bold text-primary">{subject.subject_name}</p><p className="text-muted-foreground">{subject.teacher_name || "No teacher"} · {subject.type}</p></div>)}{exploreClass.subjects.length === 0 ? <p className="text-sm text-muted-foreground">No subjects linked yet.</p> : null}</CardContent></Card>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
