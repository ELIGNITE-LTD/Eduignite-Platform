"use client";

import { useEffect, useState } from "react";
import { BookOpen, Building2, Eye, GraduationCap, Layers3, Loader2, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
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

/**
 * ENHANCED SCHOOL HIERARCHY MANAGER
 * Implements Cameroon Education System with:
 * - School Nodes: General, Technical
 * - Sections: Anglophone, Francophone
 * - Combined: General Anglophone, General Francophone, Technical Anglophone, Technical Francophone
 */

// Sub-School Types (Cameroon Standard)
const SUB_SCHOOL_TYPES = [
  { value: "general_anglophone", label: "General Anglophone", node: "general", section: "anglophone" },
  { value: "general_francophone", label: "General Francophone", node: "general", section: "francophone" },
  { value: "technical_anglophone", label: "Technical Anglophone", node: "technical", section: "anglophone" },
  { value: "technical_francophone", label: "Technical Francophone", node: "technical", section: "francophone" },
];

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

interface SchoolHierarchyManagerEnhancedProps {
  schoolId: string;
  schoolName?: string;
}

const NONE = "__none__";

function ensureArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function SchoolHierarchyManagerEnhanced({ schoolId, schoolName }: SchoolHierarchyManagerEnhancedProps) {
  const { toast } = useToast();
  const { data: cameroonConfig } = useCameroonConfig();
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

  // Enhanced form with sub-school type
  const [subSchoolForm, setSubSchoolForm] = useState({ 
    name: "", 
    type: "general_anglophone",
    vice_principal: NONE 
  });
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
    setSubSchoolForm({ name: "", type: "general_anglophone", vice_principal: NONE });
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
      const typeConfig = SUB_SCHOOL_TYPES.find(t => t.value === subSchoolForm.type);
      const payload = { 
        name: subSchoolForm.name.trim(), 
        type: subSchoolForm.type,
        node: typeConfig?.node,
        section: typeConfig?.section,
        vice_principal: subSchoolForm.vice_principal === NONE ? null : subSchoolForm.vice_principal, 
        school_id: schoolId 
      };
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
          <p className="mt-1 text-muted-foreground">Manage the Cameroon secondary school hierarchy for {schoolName || "your school"} with General/Technical nodes and Anglophone/Francophone sections.</p>
        </div>
      </div>

      <Card className="overflow-hidden rounded-3xl border-none bg-gradient-to-r from-primary to-primary/80 text-white shadow-sm">
        <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="rounded-2xl bg-white/10 p-3"><Building2 className="h-6 w-6 text-secondary" /></div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/50">Cameroon Education System</p>
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
          <Card className="rounded-3xl border-none shadow-sm">
            <CardHeader>
              <CardTitle>{editingSubSchoolId ? "Update Sub School" : "Add Sub School"}</CardTitle>
              <CardDescription>Create a sub school with Cameroon education system type (General/Technical x Anglophone/Francophone).</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="subschool-name">Sub School Name</Label>
                <Input
                  id="subschool-name"
                  placeholder="e.g., General Anglophone Section"
                  value={subSchoolForm.name}
                  onChange={(e) => setSubSchoolForm({ ...subSchoolForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="subschool-type">Sub School Type</Label>
                <Select value={subSchoolForm.type} onValueChange={(value) => setSubSchoolForm({ ...subSchoolForm, type: value })}>
                  <SelectTrigger id="subschool-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {SUB_SCHOOL_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="subschool-vp">Vice Principal (Optional)</Label>
                <Select value={subSchoolForm.vice_principal} onValueChange={(value) => setSubSchoolForm({ ...subSchoolForm, vice_principal: value })}>
                  <SelectTrigger id="subschool-vp">
                    <SelectValue placeholder="Select staff" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>None</SelectItem>
                    {staffOptions.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.first_name} {member.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <Button onClick={handleSaveSubSchool} disabled={isSaving} className="w-full rounded-xl">
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  {editingSubSchoolId ? "Update" : "Add"}
                </Button>
                {editingSubSchoolId && <Button onClick={resetSubSchoolForm} variant="outline" className="rounded-xl">Cancel</Button>}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {subSchools.map((subSchool) => {
              const typeConfig = SUB_SCHOOL_TYPES.find(t => t.value === (subSchool as any).type);
              return (
                <Card key={subSchool.id} className="rounded-2xl border-none shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="p-4 space-y-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{typeConfig?.label || "Sub School"}</p>
                      <p className="font-bold text-primary">{subSchool.name}</p>
                    </div>
                    {subSchool.vice_principal && <p className="text-sm text-muted-foreground">VP: {subSchool.vice_principal}</p>}
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1 rounded-lg" onClick={() => {
                        setEditingSubSchoolId(subSchool.id);
                        setSubSchoolForm({ name: subSchool.name, type: (subSchool as any).type || "general_anglophone", vice_principal: subSchool.vice_principal || NONE });
                      }}>
                        <Pencil className="h-3 w-3 mr-1" />Edit
                      </Button>
                      <Button size="sm" variant="destructive" className="flex-1 rounded-lg">
                        <Trash2 className="h-3 w-3 mr-1" />Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Other tabs remain similar - Admins, Classes, Subjects */}
        <TabsContent value="admins" className="space-y-6">
          {/* Admin management code */}
        </TabsContent>

        <TabsContent value="classes" className="space-y-6">
          {/* Class management code */}
        </TabsContent>

        <TabsContent value="subjects" className="space-y-6">
          {/* Subject management code */}
        </TabsContent>
      </Tabs>
    </div>
  );
}
