
"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  useCreateSubjectMaterial,
  useDeleteSubject,
  useDeleteSubjectMaterial,
  useSubjectMaterials,
  useStudentSubjectEnrollments,
  useUpdateStudentSubjectEnrollment,
  useSubjects,
} from "@/lib/hooks/useGrades";
import { useUsers } from "@/lib/hooks/useUsers";
import { useSchoolSettings } from "@/lib/hooks/useSchools";
import { schoolsService } from "@/lib/api/services/schools.service";
import { gradesService } from "@/lib/api/services/grades.service";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  BookOpen, 
  Plus, 
  Eye, 
  CheckCircle2, 
  Loader2,
  Trash2,
  Sparkles,
  BookMarked,
  ChevronRight,
  ArrowLeft,
  FileText,
  Video,
  Link as LinkIcon,
  Download,
  Upload,
  Clock,
  ShieldCheck,
  Filter,
  Image as ImageIcon,
  File as FileIcon,
  X,
  Radio,
  PenTool,
  Users,
  Building2,
  GraduationCap,
  History,
  QrCode,
  MapPin,
  XCircle
} from "lucide-react";
import { useI18n } from "@/lib/i18n-context";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { resolveMediaUrl } from "@/lib/media";
import { downloadBlob } from "@/lib/browser-download";
import type { HierarchyClass, HierarchyClassSubject, StudentSubjectEnrollment, SubjectMaterial } from "@/lib/api/types";

const SECTIONS = ["Anglophone Section", "Francophone Section", "Technical Section"];

const SECTION_CLASSES: Record<string, string[]> = {
  "Anglophone Section": ["Form 1", "Form 2", "Form 3", "Form 4", "Form 5", "Lower Sixth", "Upper Sixth"],
  "Francophone Section": ["6ème", "5ème", "4ème", "3ème", "2nde", "1ère", "Terminale"],
  "Technical Section": ["1ère Year", "2nd Year", "3rd Year", "4th Year", "5th Year", "6th Year", "7th Year"]
};

const MATERIAL_ACCEPT_MAP: Record<string, string> = {
  pdf: "application/pdf",
  video: "video/mp4,video/webm,video/ogg,video/quicktime",
  image: "image/*",
  document: ".txt,.doc,.docx,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  link: "",
};

function parseSubjectPlacement(level?: string) {
  const raw = (level || "").trim();
  if (!raw) {
    return { section: "General", targetClass: "All Classes", targetClasses: [] as string[] };
  }
  if (!raw.includes("||")) {
    return { section: "General", targetClass: raw, targetClasses: raw.split(",").map((item) => item.trim()).filter(Boolean) };
  }
  const [section, classes] = raw.split("||");
  const targetClasses = (classes || "").split(",").map((item) => item.trim()).filter(Boolean);
  return {
    section: section?.trim() || "General",
    targetClass: targetClasses.join(", ") || "All Classes",
    targetClasses,
  };
}

function colorForCourse(name: string) {
  const palette = ["bg-blue-500", "bg-emerald-500", "bg-purple-500", "bg-rose-500", "bg-amber-500"];
  const seed = (name || "course").charCodeAt(0);
  return palette[Math.abs(seed) % palette.length];
}

function mapHierarchySubjectToCourse(
  item: HierarchyClassSubject,
  teacherOptions: any[],
  classMap: Map<string, HierarchyClass>
) {
  const teacherOption = teacherOptions.find((teacher: any) => teacher.id === item.teacher);
  const hierarchyClass = classMap.get(item.school_class);
  return {
    id: item.id,
    classSubjectId: item.id,
    code: item.subject_code || item.subject || item.id,
    subjectId: item.subject || item.id,
    name: item.subject_name || "Subject",
    instructorId: item.teacher || "",
    instructorName: item.teacher_name || "Unassigned",
    instructorAvatar: resolveMediaUrl(teacherOption?.avatar || teacherOption?.user?.avatar) || "",
    type: item.type,
    coefficient: Number(item.coefficient || 1),
    color: colorForCourse(item.subject_name || item.id),
    section: hierarchyClass?.sub_school_name || item.sub_school?.name || "General",
    targetClass: item.class_name || "Unassigned",
    targetClasses: item.class_name ? [item.class_name] : [],
  };
}

function mapEnrollmentToCourse(enrollment: StudentSubjectEnrollment, classMap: Map<string, HierarchyClass>) {
  const hierarchyClass = classMap.get(enrollment.school_class);
  return {
    id: enrollment.id,
    enrollmentId: enrollment.id,
    classSubjectId: enrollment.class_subject,
    code: enrollment.subject_code || enrollment.subject,
    subjectId: enrollment.subject,
    name: enrollment.subject_name,
    instructorId: enrollment.teacher || "",
    instructorName: enrollment.teacher_name || "Unassigned",
    instructorAvatar: "",
    type: enrollment.type,
    coefficient: Number(enrollment.coefficient || 1),
    color: colorForCourse(enrollment.subject_name),
    section: hierarchyClass?.sub_school_name || "General",
    targetClass: enrollment.class_name || "Assigned Class",
    targetClasses: enrollment.class_name ? [enrollment.class_name] : [],
    isActive: enrollment.is_active,
    canRemove: enrollment.can_remove,
  };
}

function formatCoefficient(value: number | string | undefined) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) {
    return "0";
  }
  return numeric % 1 === 0 ? `${numeric}` : numeric.toFixed(2);
}

function getApiErrorMessage(error: any, fallback: string) {
  const payload = error?.response?.data;
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  if (payload?.detail) {
    return payload.detail;
  }

  const fieldOrder = [
    "non_field_errors",
    "subject_name",
    "subject_code",
    "subject",
    "school_class",
    "teacher",
    "coefficient",
    "type",
    "code",
  ];

  for (const field of fieldOrder) {
    const value = payload?.[field];
    if (Array.isArray(value) && value.length) {
      return value[0];
    }
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return error?.message || fallback;
}

function mapMaterialForDisplay(material: SubjectMaterial) {
  return {
    ...material,
    type: material.material_type,
    date: material.created ? new Date(material.created).toISOString().split('T')[0] : "",
    size: material.size_label || "Unknown",
    fileUrl: material.source_url,
    subjectId: material.subject,
    subjectName: material.subject_name || "Subject",
    subjectCode: material.subject_code || "",
  };
}

function materialDownloadName(material: ReturnType<typeof mapMaterialForDisplay>) {
  if (material.file_name) return material.file_name;
  const extensionMap: Record<string, string> = {
    pdf: "pdf",
    video: "mp4",
    image: "png",
    document: "docx",
    link: "url",
  };
  const safeTitle = (material.title || "learning-material").replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "");
  return `${safeTitle || "learning-material"}.${extensionMap[material.type] || "file"}`;
}

export default function CoursesPage() {
  const { user, platformSettings } = useAuth();
  const { t, language } = useI18n();
  const { toast } = useToast();
  
  const [isAddingSubject, setIsAddingSubject] = useState(false);
  const [isEnrollingOptional, setIsEnrollingOptional] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [hierarchyClasses, setHierarchyClasses] = useState<HierarchyClass[]>([]);
  const [hierarchySubjects, setHierarchySubjects] = useState<HierarchyClassSubject[]>([]);
  
  const [viewingMaterialsFor, setViewingMaterialsFor] = useState<any>(null);
  const [viewingPortfolio, setViewingPortfolio] = useState<any>(null);
  const [isAddingMaterial, setIsAddingMaterial] = useState(false);
  
  // Material Upload State
  const [uploadSource, setUploadSource] = useState<'file' | 'url'>('file');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newMaterialData, setNewMaterialData] = useState({ 
    title: "", 
    description: "", 
    type: "pdf", 
    url: "" 
  });

  const [previewMaterial, setPreviewMaterial] = useState<any>(null);
  
  const [newSubject, setNewSubject] = useState<{
    name: string;
    id: string;
    instructorId: string;
    instructorName: string;
    instructorAvatar: string;
    targetClasses: string[];
    section: string;
    type: "mandatory" | "optional";
    coefficient: number;
    color: string;
  }>({
    name: "",
    id: "",
    instructorId: "",
    instructorName: "",
    instructorAvatar: "",
    targetClasses: [] as string[],
    section: "General",
    type: "mandatory",
    coefficient: 1,
    color: "bg-blue-500"
  });

  const isTeacher = user?.role === "TEACHER";
  const isSchoolAdmin = user?.role === "SCHOOL_ADMIN";
  const isSubAdmin = user?.role === "SUB_ADMIN";
  const isAdmin = isSchoolAdmin || isSubAdmin;
  const isStudent = user?.role === "STUDENT";
  const { data: schoolSettings } = useSchoolSettings(user?.school?.id || "");
  const { data: studentEnrollmentsData } = useStudentSubjectEnrollments(undefined, isStudent);

  // Fetch subjects from API
  const { data: subjectsData, isLoading: subjectsLoading } = useSubjects();
  const { data: teachersData } = useUsers({ role: 'TEACHER' });
  const deleteSubjectMutation = useDeleteSubject();
  const updateEnrollmentMutation = useUpdateStudentSubjectEnrollment();
  const materialsQuery = useSubjectMaterials(
    viewingMaterialsFor?.subjectId ? { subject: viewingMaterialsFor.subjectId, ordering: "-created" } : undefined,
    !!viewingMaterialsFor?.subjectId
  );
  const studentMaterialsQuery = useSubjectMaterials(
    { ordering: "-created", page_size: 12 },
    isStudent
  );
  const createMaterialMutation = useCreateSubjectMaterial();
  const deleteMaterialMutation = useDeleteSubjectMaterial();

  const availableSections = useMemo(
    () => schoolSettings?.sections?.filter(Boolean)?.length ? schoolSettings.sections : SECTIONS,
    [schoolSettings]
  );

  const teacherOptions = useMemo<any[]>(() => teachersData?.results || [], [teachersData?.results]);
  const classMap = useMemo(
    () => new Map((hierarchyClasses || []).map((item) => [item.id, item])),
    [hierarchyClasses]
  );
  const availableClassOptions = useMemo(() => {
    if (hierarchyClasses.length) {
      return hierarchyClasses.map((item) => ({ id: item.id, name: item.name, section: item.sub_school_name || "General" }));
    }
    const fallbackClasses = schoolSettings?.class_levels?.filter(Boolean)?.length
      ? schoolSettings.class_levels
      : Array.from(new Set(Object.values(SECTION_CLASSES).flat()));
    return fallbackClasses.map((name) => ({ id: name, name, section: "General" }));
  }, [hierarchyClasses, schoolSettings]);
  const sectionScopedClassOptions = useMemo(() => {
    if (!hierarchyClasses.length) {
      return availableClassOptions;
    }
    return availableClassOptions.filter((item) => item.section === newSubject.section);
  }, [availableClassOptions, hierarchyClasses.length, newSubject.section]);

  const refreshHierarchySubjects = async () => {
    if (!user?.school?.id) {
      setHierarchyClasses([]);
      setHierarchySubjects([]);
      return;
    }

    try {
      const [classData, subjectData] = await Promise.all([
        schoolsService.getHierarchyClasses({ school_id: user.school.id }),
        schoolsService.getHierarchySubjects({ school_id: user.school.id }),
      ]);
      setHierarchyClasses(Array.isArray(classData) ? classData : []);
      setHierarchySubjects(Array.isArray(subjectData) ? subjectData : []);
    } catch (error) {
      console.error("Failed to load hierarchy-linked subjects:", error);
      setHierarchyClasses([]);
      setHierarchySubjects([]);
    }
  };

  const subjectMaterials = useMemo(
    () => (materialsQuery.data?.results || []).map(mapMaterialForDisplay),
    [materialsQuery.data?.results]
  );
  const studentLearningResources = useMemo(
    () => (studentMaterialsQuery.data?.results || []).map(mapMaterialForDisplay),
    [studentMaterialsQuery.data?.results]
  );

  useEffect(() => {
    void refreshHierarchySubjects();
  }, [user?.school?.id]);

  useEffect(() => {
    setNewSubject((current) => {
      if (availableSections.includes(current.section)) {
        return current;
      }
      return { ...current, section: availableSections[0] || "General", targetClasses: [] };
    });
  }, [availableSections]);

  useEffect(() => {
    const subjectCatalog = subjectsData?.results || [];

    if (isStudent) {
      const mappedStudentSubjects = (studentEnrollmentsData?.results || [])
        .map((enrollment) => mapEnrollmentToCourse(enrollment, classMap));
      setSubjects(mappedStudentSubjects);
      setIsLoading(subjectsLoading);
      return;
    }

    const linkedSubjects = hierarchySubjects
      .filter((item) => {
        if (isTeacher) {
          return item.teacher === user?.id || item.teacher === user?.uid;
        }
        return true;
      })
      .map((item) => mapHierarchySubjectToCourse(item, teacherOptions, classMap));

    if (linkedSubjects.length) {
      setSubjects(linkedSubjects);
      setIsLoading(subjectsLoading);
      return;
    }

    const fallbackMappedSubjects = subjectCatalog.map((s: any) => ({
      ...parseSubjectPlacement(s.level),
      id: s.id,
      code: s.code || s.id,
      subjectId: s.id,
      name: s.name,
      instructorId: s.teacher || "",
      instructorName: s.teacher_name || "Unassigned",
      instructorAvatar: resolveMediaUrl((teacherOptions.find((teacher: any) => teacher.id === s.teacher)?.avatar)) || "",
      type: "mandatory",
      coefficient: Number(s.coefficient || 1),
      color: colorForCourse(s.name),
    }));
    setSubjects(fallbackMappedSubjects);
    setIsLoading(subjectsLoading);
  }, [classMap, hierarchySubjects, isStudent, isTeacher, studentEnrollmentsData?.results, subjectsData, subjectsLoading, teacherOptions, user?.id, user?.uid]);

  useEffect(() => {
    if (uploadSource === 'url' || newMaterialData.type === 'link') {
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [newMaterialData.type, uploadSource]);

  const handleCreateSubject = async () => {
    const subjectName = newSubject.name.trim();
    const subjectCode = newSubject.id.trim().toUpperCase();
    const uniqueTargetClasses = Array.from(new Set(newSubject.targetClasses));

    if (!subjectName || !newSubject.instructorId || uniqueTargetClasses.length === 0) {
      toast({ 
        variant: "destructive", 
        title: "Incomplete Form", 
        description: "Subject name, assigned teacher, and at least one target class are required." 
      });
      return;
    }

    setIsProcessing(true);
    try {
      const classNameById = new Map(availableClassOptions.map((item) => [item.id, item.name]));
      const allocationResults = await Promise.allSettled(
        uniqueTargetClasses.map((classId) =>
          schoolsService.createHierarchySubject({
            school_class: classId,
            subject_name: subjectName,
            subject_code: subjectCode,
            coefficient: newSubject.coefficient,
            teacher: newSubject.instructorId,
            type: newSubject.type,
            school_id: user?.school?.id,
          })
        )
      );

      const failedAllocations = allocationResults
        .map((result, index) => ({ classId: uniqueTargetClasses[index], result }))
        .filter(
          (
            entry
          ): entry is { classId: string; result: PromiseRejectedResult } => entry.result.status === "rejected"
        );

      const createdCount = allocationResults.length - failedAllocations.length;

      if (!createdCount) {
        throw failedAllocations[0]?.result.reason;
      }

      await refreshHierarchySubjects();

      if (failedAllocations.length) {
        const failedClassNames = failedAllocations.map((entry) => classNameById.get(entry.classId) || "Unknown class");
        setNewSubject((current) => ({
          ...current,
          name: subjectName,
          id: subjectCode,
          targetClasses: failedAllocations.map((entry) => entry.classId),
        }));
        toast({
          variant: "destructive",
          title: "Subject partially assigned",
          description: `${subjectName} was saved for ${createdCount} class${createdCount > 1 ? "es" : ""}, but ${failedClassNames.join(", ")} still need attention.`,
        });
        return;
      }

      setIsAddingSubject(false);
      setNewSubject({ 
        name: "", 
        id: "", 
        instructorId: "",
        instructorName: "", 
        instructorAvatar: "",
        targetClasses: [], 
        section: availableSections[0] || "General", 
        type: "mandatory", 
        coefficient: 1,
        color: "bg-blue-500" 
      });
      toast({ title: "Subject Registered", description: `${subjectName} added to curriculum.` });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Subject creation failed",
        description: getApiErrorMessage(error, "Could not save this subject assignment."),
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEnrollOptional = async (enrollmentId: string) => {
    try {
      await updateEnrollmentMutation.mutateAsync({ id: enrollmentId, data: { is_active: true } });
      toast({ title: "Enrollment Confirmed", description: "This subject has been added to your curriculum." });
      setIsEnrollingOptional(false);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Enrollment failed",
        description: error?.response?.data?.detail || error?.response?.data?.is_active?.[0] || "We could not update this optional subject right now.",
      });
    }
  };

  const handleDeleteSubject = async (course: any) => {
    try {
      if (isStudent && course?.enrollmentId && course?.canRemove) {
        await updateEnrollmentMutation.mutateAsync({ id: course.enrollmentId, data: { is_active: false } });
        toast({ title: "Optional Subject Removed", description: "This subject has been removed from your active curriculum." });
        return;
      }

      if (course?.classSubjectId) {
        await schoolsService.deleteHierarchySubject(course.classSubjectId);
        await refreshHierarchySubjects();
      } else {
        await deleteSubjectMutation.mutateAsync(course.subjectId || course.id);
      }
      toast({ title: "Removed", description: "Subject removed from curriculum." });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: error?.response?.data?.detail || "Could not remove this subject right now.",
      });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type?: 'logo' | 'banner') => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const maxSize = newMaterialData.type === 'video' ? 12 * 1024 * 1024 : 8 * 1024 * 1024;
      const limitLabel = newMaterialData.type === 'video' ? "12MB" : "8MB";
      if (file.size > maxSize) {
        if (fileInputRef.current) fileInputRef.current.value = "";
        toast({ variant: "destructive", title: "File too large", description: `Maximum file size is ${limitLabel}.` });
        return;
      }
      setSelectedFile(file);
      if (!newMaterialData.title) {
        setNewMaterialData({ ...newMaterialData, title: file.name.split('.')[0] });
      }
    }
  };

  const clearSelectedMaterialFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleAddMaterial = async () => {
    if (!newMaterialData.title) return;
    if (uploadSource === 'url' && !newMaterialData.url) return;
    if (uploadSource === 'file' && !selectedFile) return;

    if (!viewingMaterialsFor?.subjectId) {
      toast({ variant: "destructive", title: "Subject not found", description: "Open a subject first before publishing its material." });
      return;
    }

    setIsProcessing(true);
    try {
      await createMaterialMutation.mutateAsync({
        subject: viewingMaterialsFor.subjectId,
        title: newMaterialData.title,
        description: newMaterialData.description,
        material_type: newMaterialData.type as SubjectMaterial["material_type"],
        external_url: uploadSource === 'url' ? newMaterialData.url : undefined,
        upload: uploadSource === 'file' ? selectedFile : null,
      });
      setIsAddingMaterial(false);
      setNewMaterialData({ title: "", description: "", type: "pdf", url: "" });
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast({ title: "Material Published", description: "Resource added to the institutional subject archive." });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Upload failed",
        description:
          error?.response?.data?.upload?.[0] ||
          error?.response?.data?.external_url?.[0] ||
          error?.response?.data?.detail ||
          "We could not publish this material right now.",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteMaterial = async (id: string) => {
    try {
      await deleteMaterialMutation.mutateAsync(id);
      toast({ title: "Material Removed", description: "Resource deleted from the subject library." });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: error?.response?.data?.detail || "This material could not be removed right now.",
      });
    }
  };

  const handleViewMaterial = (material: any) => {
    if (!material.fileUrl) {
      toast({ variant: "destructive", title: "Resource Unavailable", description: "This file does not have a valid source URL." });
      return;
    }

    if (material.type === 'pdf' || material.type === 'document' || material.type === 'link') {
      window.open(material.fileUrl, '_blank');
    } else {
      setPreviewMaterial(material);
    }
  };

  const handleDownloadMaterial = async (material: any) => {
    if (!material.fileUrl) {
      toast({ variant: "destructive", title: "Download Failed", description: "Source URL is missing." });
      return;
    }

    try {
      if (material.external_url) {
        const link = document.createElement('a');
        link.href = material.external_url;
        link.target = '_blank';
        link.rel = 'noreferrer';
        link.setAttribute('download', materialDownloadName(material));
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        const blob = await gradesService.downloadSubjectMaterial(material.id);
        downloadBlob(blob, materialDownloadName(material));
      }
      toast({ title: "Download Started", description: `${material.title} is being saved to this device.` });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Download failed",
        description: getApiErrorMessage(error, "This resource could not be downloaded. Please check your connection and try again."),
      });
    }
  };

  const visibleSubjects = useMemo(() => subjects, [subjects]);
  const viewingMaterialsCount = subjectMaterials.length;
  const viewingMandatoryCount = visibleSubjects.filter((course) => course.type === "mandatory").length;
  const viewingOptionalCount = visibleSubjects.filter((course) => course.type === "optional").length;
  const viewingTeacherLoad = visibleSubjects.filter((course) => course.instructorId === viewingMaterialsFor?.instructorId).length;

  if (viewingMaterialsFor) {
    return (
      <div className="space-y-8 pb-20 animate-in fade-in slide-in-from-right-4 duration-500">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setViewingMaterialsFor(null)} className="rounded-full hover:bg-white shadow-sm">
              <ArrowLeft className="w-6 h-6" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <Badge className={cn("text-[9px] font-black border-none text-white", viewingMaterialsFor.color)}>{viewingMaterialsFor.code || viewingMaterialsFor.id}</Badge>
                <h1 className="text-2xl md:text-3xl font-bold text-primary font-headline tracking-tight">{viewingMaterialsFor.name}</h1>
              </div>
              <p className="text-muted-foreground mt-1 text-sm">{language === 'en' ? 'Course Dossier & Analytics' : 'Dossier de Cours & Analyses'}</p>
            </div>
          </div>
          
          {(isTeacher || isAdmin) && (
            <Dialog open={isAddingMaterial} onOpenChange={setIsAddingMaterial}>
              <DialogTrigger asChild>
                <Button className="gap-2 shadow-lg h-12 px-8 rounded-2xl bg-primary text-white font-bold">
                  <Upload className="w-5 h-5" /> {language === 'en' ? 'Upload Material' : 'Ajouter un Support'}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-xl rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
                <DialogHeader className="bg-primary p-8 text-white">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-white/10 rounded-2xl"><BookMarked className="w-8 h-8 text-secondary" /></div>
                    <div>
                      <DialogTitle className="text-2xl font-black">Publish Resource</DialogTitle>
                      <DialogDescription className="text-white/60">Upload new pedagogical material for students.</DialogDescription>
                    </div>
                  </div>
                </DialogHeader>
                <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
                  <div className="space-y-4">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Upload Source</Label>
                    <div className="flex gap-2 p-1 bg-accent/30 rounded-xl">
                      <Button 
                        variant={uploadSource === 'file' ? 'default' : 'ghost'} 
                        className={cn("flex-1 rounded-lg h-10 font-bold", uploadSource === 'file' && "bg-white text-primary shadow-sm")}
                        onClick={() => setUploadSource('file')}
                        disabled={newMaterialData.type === 'link'}
                      >
                        <FileIcon className="w-4 h-4 mr-2" /> Local File
                      </Button>
                      <Button 
                        variant={uploadSource === 'url' ? 'default' : 'ghost'} 
                        className={cn("flex-1 rounded-lg h-10 font-bold", uploadSource === 'url' && "bg-white text-primary shadow-sm")}
                        onClick={() => setUploadSource('url')}
                      >
                        <LinkIcon className="w-4 h-4 mr-2" /> External URL
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Resource Title</Label>
                      <Input 
                        value={newMaterialData.title} 
                        onChange={(e) => setNewMaterialData({...newMaterialData, title: e.target.value})} 
                        placeholder="e.g. Chapter 4 Summary" 
                        className="h-12 bg-accent/30 border-none rounded-xl font-bold"
                      />
                    </div>

                    {uploadSource === 'file' && newMaterialData.type !== 'link' ? (
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Select File</Label>
                        {!selectedFile ? (
                          <div 
                            className="group relative h-32 bg-accent/20 rounded-2xl border-2 border-dashed border-accent flex flex-col items-center justify-center cursor-pointer transition-all hover:border-primary hover:bg-primary/5"
                            onClick={() => fileInputRef.current?.click()}
                          >
                            <input
                              type="file"
                              ref={fileInputRef}
                              className="hidden"
                              accept={MATERIAL_ACCEPT_MAP[newMaterialData.type] || undefined}
                              onChange={handleFileChange}
                            />
                            <Upload className="w-6 h-6 text-primary/40 group-hover:scale-110 transition-transform mb-2" />
                            <p className="text-xs font-bold text-primary/60">Click to browse or drag file</p>
                            <p className="text-[9px] text-muted-foreground uppercase font-black mt-1">
                              MAX SIZE: {newMaterialData.type === 'video' ? '12MB' : '8MB'}
                            </p>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between p-4 bg-primary/5 rounded-2xl border border-primary/10">
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-white rounded-lg shadow-sm">
                                <FileText className="w-5 h-5 text-primary" />
                              </div>
                              <div className="overflow-hidden">
                                <p className="text-sm font-bold text-primary truncate max-w-[200px]">{selectedFile.name}</p>
                                <p className="text-[10px] font-black text-muted-foreground uppercase">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                              </div>
                            </div>
                            <Button variant="ghost" size="icon" className="text-red-400 hover:text-red-600" onClick={clearSelectedMaterialFile}>
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Source URL</Label>
                        <div className="relative">
                          <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/40" />
                          <Input 
                            value={newMaterialData.url} 
                            onChange={(e) => setNewMaterialData({...newMaterialData, url: e.target.value})} 
                            placeholder="https://..." 
                            className="h-12 bg-accent/30 border-none rounded-xl pl-10"
                          />
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Content Type</Label>
                        <Select value={newMaterialData.type} onValueChange={(v) => setNewMaterialData({...newMaterialData, type: v})}>
                          <SelectTrigger className="h-12 bg-accent/30 border-none rounded-xl font-bold"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pdf">PDF Document</SelectItem>
                            <SelectItem value="video">Lecture Video</SelectItem>
                            <SelectItem value="image">Image / Diagram</SelectItem>
                            <SelectItem value="document">Text File</SelectItem>
                            <SelectItem value="link">Web Link</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Brief Context</Label>
                        <Input 
                          value={newMaterialData.description} 
                          onChange={(e) => setNewMaterialData({...newMaterialData, description: e.target.value})} 
                          placeholder="What is this?" 
                          className="h-12 bg-accent/30 border-none rounded-xl"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <DialogFooter className="bg-accent/20 p-6 border-t border-accent">
                  <Button
                    onClick={handleAddMaterial}
                    disabled={
                      isProcessing ||
                      createMaterialMutation.isPending ||
                      !newMaterialData.title ||
                      ((uploadSource === 'url' || newMaterialData.type === 'link') && !newMaterialData.url) ||
                      (uploadSource === 'file' && newMaterialData.type !== 'link' && !selectedFile)
                    }
                    className="w-full h-14 rounded-2xl shadow-xl font-black uppercase tracking-widest text-xs gap-2"
                  >
                    {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                    Finalize Upload
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {isAdmin && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <Card className="lg:col-span-4 border-none shadow-sm overflow-hidden bg-white">
              <CardHeader className="bg-primary p-6 text-white text-center pb-8 relative">
                <Avatar className="h-24 w-24 border-4 border-white shadow-2xl mb-4">
                  <AvatarImage src={viewingMaterialsFor.instructorAvatar} alt={viewingMaterialsFor.instructorName} />
                  <AvatarFallback>{viewingMaterialsFor.instructorName.charAt(0)}</AvatarFallback>
                </Avatar>
                <CardTitle className="text-lg font-black">{viewingMaterialsFor.instructorName}</CardTitle>
                <Badge variant="secondary" className="bg-white/10 text-white border-none mt-2 uppercase text-[8px] tracking-widest">Lead Instructor</Badge>
              </CardHeader>
              <CardContent className="p-6 -mt-4 bg-white rounded-t-3xl space-y-4">
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Strategic Purview</p>
                  <p className="text-sm font-bold text-primary">{viewingMaterialsFor.name} Department</p>
                </div>
                <div className="pt-4 border-t flex justify-between items-center">
                   <Button 
                    variant="outline" 
                    size="sm" 
                    className="rounded-xl h-10 px-4 text-[10px] font-black uppercase w-full shadow-sm hover:bg-primary/5 transition-all"
                    onClick={() => setViewingPortfolio(viewingMaterialsFor)}
                   >
                    View Professional Portfolio
                   </Button>
                </div>
              </CardContent>
            </Card>

            <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <Card className="border-none shadow-sm bg-purple-50/50 group hover:shadow-md transition-all">
                <CardContent className="pt-6">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-[10px] font-black uppercase text-purple-600 tracking-widest">Online Exams</p>
                    <PenTool className="w-4 h-4 text-purple-600" />
                  </div>
                  <div className="text-3xl font-black text-purple-700">{viewingMaterialsFor.stats?.exams || 0}</div>
                  <p className="text-[9px] font-bold text-purple-600/60 uppercase mt-1">Assessments Published</p>
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm bg-emerald-50/50 group hover:shadow-md transition-all">
                <CardContent className="pt-6">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-[10px] font-black uppercase text-emerald-600 tracking-widest">Attendance</p>
                    <Users className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="text-3xl font-black text-emerald-700">{viewingMaterialsFor.stats?.attendance || 0}%</div>
                  <p className="text-[9px] font-bold text-emerald-600/60 uppercase mt-1">Student Average</p>
                </CardContent>
              </Card>
              
              {/* Virtual Pedagogical Metrics */}
              <Card className="border-none shadow-sm bg-blue-50/50 group hover:shadow-md transition-all">
                <CardContent className="pt-6">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-[10px] font-black uppercase text-blue-600 tracking-widest">Scheduled Live</p>
                    <Video className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="text-3xl font-black text-blue-700">{viewingMaterialsFor.stats?.liveScheduled || 0}</div>
                  <p className="text-[9px] font-bold text-blue-600/60 uppercase mt-1">Upcoming Virtual Nodes</p>
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm bg-green-50/50 group hover:shadow-md transition-all">
                <CardContent className="pt-6">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-[10px] font-black uppercase text-green-600 tracking-widest">Sessions Held</p>
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                  </div>
                  <div className="text-3xl font-black text-green-700">{viewingMaterialsFor.stats?.liveCompleted || 0}</div>
                  <p className="text-[9px] font-bold text-green-600/60 uppercase mt-1">Completed Lectures</p>
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm bg-red-50/50 group hover:shadow-md transition-all">
                <CardContent className="pt-6">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-[10px] font-black uppercase text-red-600 tracking-widest">Cancelled</p>
                    <XCircle className="w-4 h-4 text-red-600" />
                  </div>
                  <div className="text-3xl font-black text-red-700">{viewingMaterialsFor.stats?.liveCancelled || 0}</div>
                  <p className="text-[9px] font-bold text-red-600/60 uppercase mt-1">Decommissioned Slots</p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-primary/10" />
            <h2 className="text-sm font-black uppercase text-primary/40 tracking-[0.3em]">Pedagogical Materials</h2>
            <div className="h-px flex-1 bg-primary/10" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {materialsQuery.isLoading ? (
              <Card className="border-none shadow-sm bg-white md:col-span-2 lg:col-span-3">
                <CardContent className="flex h-40 items-center justify-center gap-3">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">Loading subject materials...</span>
                </CardContent>
              </Card>
            ) : subjectMaterials.length === 0 ? (
              <Card className="border-none shadow-sm bg-white md:col-span-2 lg:col-span-3">
                <CardContent className="flex h-40 flex-col items-center justify-center gap-3 text-center">
                  <BookMarked className="w-10 h-10 text-primary/30" />
                  <div>
                    <p className="font-bold text-primary">No pedagogical material published yet</p>
                    <p className="text-sm text-muted-foreground">
                      {isTeacher || isAdmin
                        ? "Upload the first resource for this subject and it will become available across the institutional archive."
                        : "Your teacher has not published any learning resources for this subject yet."}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              subjectMaterials.map((material) => (
              <Card key={material.id} className="border-none shadow-sm group hover:shadow-md transition-all overflow-hidden bg-white flex flex-col">
                <div className="p-6 flex items-start gap-4 flex-1">
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm",
                    material.type === 'pdf' ? "bg-red-50 text-red-600" :
                    material.type === 'video' ? "bg-blue-50 text-blue-600" :
                    material.type === 'image' ? "bg-purple-50 text-purple-600" :
                    material.type === 'link' ? "bg-emerald-50 text-emerald-600" :
                    "bg-amber-50 text-amber-600"
                  )}>
                    {material.type === 'pdf' ? <FileText className="w-6 h-6" /> :
                     material.type === 'video' ? <Video className="w-6 h-6" /> :
                     material.type === 'image' ? <ImageIcon className="w-6 h-6" /> :
                     material.type === 'link' ? <LinkIcon className="w-6 h-6" /> :
                     <FileIcon className="w-6 h-6" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-primary text-base leading-tight truncate mb-1">{material.title}</h3>
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-3 leading-relaxed">
                      {material.description || "No description provided for this resource."}
                    </p>
                    <div className="flex items-center gap-3 text-[10px] font-bold text-muted-foreground uppercase tracking-tight">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {material.date}</span>
                      <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                      <span>{material.size}</span>
                    </div>
                  </div>
                </div>
                <CardFooter className="bg-accent/10 p-3 border-t flex items-center justify-between gap-2">
                  <div className="flex flex-1 gap-2">
                    <Button 
                      variant="ghost" 
                      className="flex-1 h-9 rounded-lg hover:bg-white text-primary text-[10px] font-black uppercase tracking-widest gap-2"
                      onClick={() => handleViewMaterial(material)}
                    >
                      <Eye className="w-3.5 h-3.5" /> {language === 'en' ? 'View' : 'Voir'}
                    </Button>
                    <Button 
                      variant="ghost" 
                      className="flex-1 h-9 rounded-lg hover:bg-white text-primary text-[10px] font-black uppercase tracking-widest gap-2"
                      onClick={() => handleDownloadMaterial(material)}
                    >
                      <Download className="w-3.5 h-3.5" /> {language === 'en' ? 'Download' : 'Télécharger'}
                    </Button>
                  </div>
                  {(isTeacher || isAdmin) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-lg text-destructive/20 hover:text-destructive hover:bg-red-50"
                      onClick={() => handleDeleteMaterial(material.id)}
                      disabled={deleteMaterialMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </CardFooter>
              </Card>
            ))
            )}
          </div>
        </div>

        <Dialog open={!!previewMaterial} onOpenChange={() => setPreviewMaterial(null)}>
          <DialogContent className="sm:max-w-4xl rounded-[2rem] p-0 overflow-hidden border-none shadow-2xl bg-black">
            <DialogHeader className="p-6 bg-white/5 text-white absolute top-0 left-0 right-0 z-10 backdrop-blur-md border-b border-white/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-primary rounded-xl text-white">
                    {previewMaterial?.type === 'video' ? <Video className="w-5 h-5" /> : <ImageIcon className="w-5 h-5" />}
                  </div>
                  <div>
                    <DialogTitle className="text-lg font-black">{previewMaterial?.title}</DialogTitle>
                    <DialogDescription className="text-white/40 text-xs">{previewMaterial?.description}</DialogDescription>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setPreviewMaterial(null)} className="text-white/40 hover:text-white hover:bg-white/10">
                  <X className="w-6 h-6" />
                </Button>
              </div>
            </DialogHeader>
            <div className="aspect-video w-full flex items-center justify-center bg-slate-900 pt-20">
              {previewMaterial?.type === 'video' ? (
                <video 
                  controls 
                  autoPlay 
                  className="w-full h-full max-h-[70vh] object-contain"
                  src={previewMaterial.fileUrl}
                />
              ) : previewMaterial?.type === 'image' ? (
                <img 
                  src={previewMaterial.fileUrl} 
                  alt={previewMaterial.title}
                  className="w-full h-full max-h-[70vh] object-contain"
                />
              ) : null}
            </div>
            <DialogFooter className="bg-white/5 p-6 border-t border-white/10 flex justify-between items-center">
              <div className="flex items-center gap-2 text-white/40 text-[10px] font-black uppercase tracking-widest">
                <ShieldCheck className="w-4 h-4" />
                EduIgnite Secure Viewer
              </div>
              <Button 
                variant="secondary" 
                className="gap-2 rounded-xl font-bold"
                onClick={() => handleDownloadMaterial(previewMaterial)}
              >
                <Download className="w-4 h-4" /> Download Original
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!viewingPortfolio} onOpenChange={() => setViewingPortfolio(null)}>
          <DialogContent className="sm:max-w-4xl max-h-[90vh] p-0 border-none shadow-2xl rounded-[2.5rem] overflow-hidden flex flex-col">
            <DialogHeader className="bg-primary p-8 text-white shrink-0 relative">
              <div className="flex items-center gap-6">
                <Avatar className="h-24 w-24 border-4 border-white shadow-2xl shrink-0">
                  <AvatarImage src={viewingPortfolio?.instructorAvatar} />
                  <AvatarFallback className="text-3xl font-black text-primary bg-white">{viewingPortfolio?.instructorName?.charAt(0)}</AvatarFallback>
                </Avatar>
                <div>
                  <DialogTitle className="text-3xl font-black uppercase tracking-tighter">{viewingPortfolio?.instructorName}</DialogTitle>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="bg-secondary text-primary border-none font-black h-6">PEDAGOGICAL LEAD</Badge>
                    <Badge variant="outline" className="border-white/20 text-white font-mono text-[10px]">{viewingPortfolio?.code || viewingPortfolio?.id}</Badge>
                  </div>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setViewingPortfolio(null)} className="absolute top-4 right-4 text-white/40 hover:text-white">
                <X className="w-6 h-6" />
              </Button>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto bg-white p-8 md:p-12 space-y-12 no-scrollbar">
               <div className="grid grid-cols-3 gap-2 text-center border-b pb-6 opacity-40">
                  <div className="text-[7px] font-black uppercase">Republic of Cameroon</div>
                  <div className="flex justify-center"><Building2 className="w-4 h-4" /></div>
                  <div className="text-[7px] font-black uppercase">République du Cameroun</div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div className="md:col-span-2 space-y-10">
                    <section className="space-y-4">
                      <div className="flex items-center gap-3 border-b border-accent pb-2">
                        <GraduationCap className="w-5 h-5 text-primary" />
                        <h3 className="text-sm font-black uppercase text-primary tracking-widest">Academic Credentials</h3>
                      </div>
                      <div className="space-y-4">
                        <div className="flex justify-between items-start gap-4">
                          <div className="space-y-2">
                            <p className="font-black text-primary text-base">{viewingPortfolio?.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {viewingPortfolio?.targetClass || "Assigned class group"} • {viewingPortfolio?.section || "School-wide section"}
                            </p>
                            <p className="text-[11px] font-bold uppercase tracking-widest text-primary/60">
                              {viewingPortfolio?.type === "optional" ? "Optional subject" : "Mandatory subject"} • Coef {formatCoefficient(viewingPortfolio?.coefficient)}
                            </p>
                          </div>
                          <Badge variant="outline" className="text-[9px] font-bold">ACTIVE</Badge>
                        </div>
                      </div>
                    </section>
                  </div>

                  <div className="space-y-8">
                    <Card className="border-none shadow-sm bg-accent/20 rounded-3xl overflow-hidden">
                      <CardHeader className="bg-primary/5 p-6 border-b">
                        <CardTitle className="text-xs font-black uppercase text-primary tracking-widest">Pedagogical Stats</CardTitle>
                      </CardHeader>
                      <CardContent className="p-6 space-y-6">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold uppercase opacity-60">Materials Published</span>
                          <span className="text-lg font-black text-primary">{viewingMaterialsCount}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold uppercase opacity-60">Mandatory Subjects</span>
                          <span className="text-lg font-black text-primary">{viewingMandatoryCount}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold uppercase opacity-60">Optional Subjects</span>
                          <span className="text-lg font-black text-primary">{viewingOptionalCount}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold uppercase opacity-60">Teacher Teaching Load</span>
                          <span className="text-lg font-black text-primary">{viewingTeacherLoad}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
               </div>
            </div>

            <DialogFooter className="bg-accent/10 p-6 border-t border-accent shrink-0">
               <Button onClick={() => setViewingPortfolio(null)} className="rounded-xl px-10 h-12 font-black uppercase text-xs">Close Dossier</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  const mandatorySubjects = visibleSubjects.filter((course) => course.type === "mandatory" && (course.isActive ?? true));
  const enrolledOptional = visibleSubjects.filter((course) => course.type === "optional" && (isAdmin || isTeacher || course.isActive));
  const availableOptional = visibleSubjects.filter((course) => isStudent && course.type === "optional" && !course.isActive);

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary font-headline flex items-center gap-3">
            <div className="p-2 bg-primary rounded-xl shadow-lg">
              <BookOpen className="w-6 h-6 text-secondary" />
            </div>
            {isAdmin ? (language === 'en' ? "Institutional Subjects" : "Matières Institutionnelles") : t("courses")}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isAdmin 
              ? "Monitor pedagogical activity, resources, and performance for all courses."
              : "Manage your class subjects and access learning materials."}
          </p>
        </div>
        
        {(isSchoolAdmin || isSubAdmin) && (
          <Dialog open={isAddingSubject} onOpenChange={setIsAddingSubject}>
            <DialogTrigger asChild>
              <Button className="gap-2 shadow-lg h-12 px-6 rounded-2xl">
                <Plus className="w-5 h-5" /> Add New Subject
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
              <DialogHeader className="bg-primary p-8 text-white">
                <DialogTitle className="text-2xl font-black">Setup New Subject</DialogTitle>
                <DialogDescription className="text-white/60">Configure curriculum requirements and instructor assignment.</DialogDescription>
              </DialogHeader>
              <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto text-foreground">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="col-span-2 space-y-2">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Subject Name</Label>
                    <Input value={newSubject.name} onChange={(e) => setNewSubject({...newSubject, name: e.target.value})} placeholder="e.g. Advanced Physics" className="h-11 bg-accent/30 border-none rounded-xl" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Subject Code (Optional)</Label>
                    <Input value={newSubject.id} onChange={(e) => setNewSubject({...newSubject, id: e.target.value.toUpperCase()})} placeholder="e.g. PHY101" className="h-11 bg-accent/30 border-none rounded-xl" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Coefficient</Label>
                    <Input 
                      type="number" 
                      min="1" 
                      max="10" 
                      value={newSubject.coefficient} 
                      onChange={(e) => setNewSubject({...newSubject, coefficient: parseInt(e.target.value) || 1})} 
                      className="h-11 bg-accent/30 border-none rounded-xl font-black text-primary" 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Assigned Teacher</Label>
                    <Select value={newSubject.instructorId} onValueChange={(value) => {
                      const teacher = teacherOptions.find((item: any) => (item.id || item.user?.id) === value);
                      setNewSubject({
                        ...newSubject,
                        instructorId: value,
                        instructorName: teacher?.name || teacher?.user?.name || "",
                        instructorAvatar: resolveMediaUrl(teacher?.avatar || teacher?.user?.avatar) || "",
                      })
                    }}>
                      <SelectTrigger className="h-11 bg-accent/30 border-none rounded-xl font-bold">
                        <SelectValue placeholder="Select Instructor" />
                      </SelectTrigger>
                      <SelectContent>
                        {teacherOptions.map((t: any) => (
                          <SelectItem key={t.id || t.user?.id} value={t.id || t.user?.id}>{t.name || t.user?.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Subject Type</Label>
                    <Select value={newSubject.type} onValueChange={(v) => setNewSubject({...newSubject, type: v as any})}>
                      <SelectTrigger className="h-11 bg-accent/30 border-none rounded-xl font-bold"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mandatory">Mandatory</SelectItem>
                        <SelectItem value="optional">Optional</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Sub-School / Section</Label>
                    <Select value={newSubject.section} onValueChange={(v) => setNewSubject({...newSubject, section: v, targetClasses: []})}>
                      <SelectTrigger className="h-11 bg-accent/30 border-none rounded-xl font-bold"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {availableSections.map((section) => <SelectItem key={section} value={section}>{section}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="col-span-2 space-y-3">
                    <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Target Classes (Select All That Apply)</Label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-4 bg-accent/20 rounded-2xl border border-accent/50 max-h-[200px] overflow-y-auto">
                      {sectionScopedClassOptions.map((cls) => (
                        <div key={cls.id} className="flex items-center space-x-2">
                          <Checkbox 
                            id={`cls-${cls.id}`} 
                            checked={newSubject.targetClasses.includes(cls.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setNewSubject({...newSubject, targetClasses: [...newSubject.targetClasses, cls.id]})
                              } else {
                                setNewSubject({...newSubject, targetClasses: newSubject.targetClasses.filter(c => c !== cls.id)})
                              }
                            }}
                          />
                          <Label htmlFor={`cls-${cls.id}`} className="text-xs font-bold cursor-pointer leading-none">{cls.name}</Label>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <DialogFooter className="bg-accent/20 p-6 border-t border-accent">
                <Button onClick={handleCreateSubject} className="w-full h-14 rounded-2xl shadow-xl font-black uppercase tracking-widest text-xs gap-2" disabled={isProcessing}>
                  {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                  Register Subject to Curriculum
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {isStudent && (
          <Dialog open={isEnrollingOptional} onOpenChange={setIsEnrollingOptional}>
            <DialogTrigger asChild>
              <Button variant="secondary" className="gap-2 shadow-lg h-12 px-6 rounded-2xl bg-secondary text-primary hover:bg-secondary/90">
                <Plus className="w-5 h-5" /> {t("addSubject")}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
              <DialogHeader className="bg-primary p-8 text-white">
                <DialogTitle className="text-2xl font-black">{t("availableSubjects")}</DialogTitle>
                <DialogDescription className="text-white/60">Elective courses available for your class level.</DialogDescription>
              </DialogHeader>
              <div className="p-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {availableOptional.map((course) => (
                    <Card key={course.id} className="border border-accent hover:border-primary/20 transition-all group cursor-pointer" onClick={() => handleEnrollOptional(course.enrollmentId)}>
                      <CardContent className="p-4 flex items-center gap-4">
                        <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center shrink-0 text-white", course.color)}>
                          <BookMarked className="w-6 h-6" />
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <p className="font-bold text-sm truncate">{course.name}</p>
                          <p className="text-[10px] text-muted-foreground">{course.instructorName}</p>
                        </div>
                        <Plus className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      </CardContent>
                    </Card>
                  ))}
                  {availableOptional.length === 0 ? (
                    <Card className="border border-dashed border-accent bg-accent/10 md:col-span-2">
                      <CardContent className="p-6 text-center text-sm text-muted-foreground">
                        No optional subjects are currently available beyond the ones already assigned to you.
                      </CardContent>
                    </Card>
                  ) : null}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center p-20"><Loader2 className="w-12 h-12 animate-spin text-primary opacity-20" /></div>
      ) : (
        <div className="space-y-12">
          {isStudent && (
            <section className="space-y-6">
              <div className="flex flex-col gap-1">
                <h2 className="text-xl font-black text-primary">My Learning Resources</h2>
                <p className="text-sm text-muted-foreground">Teacher-uploaded files and links for your registered subjects, ready to view or download.</p>
              </div>
              {studentMaterialsQuery.isLoading ? (
                <Card className="border-none shadow-sm bg-white">
                  <CardContent className="flex h-32 items-center justify-center gap-3">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">Loading your resources...</span>
                  </CardContent>
                </Card>
              ) : studentLearningResources.length === 0 ? (
                <Card className="border border-dashed border-primary/15 bg-white shadow-sm">
                  <CardContent className="flex h-36 flex-col items-center justify-center gap-2 text-center">
                    <BookMarked className="h-10 w-10 text-primary/25" />
                    <p className="font-bold text-primary">No learning resources yet</p>
                    <p className="max-w-md text-sm text-muted-foreground">When your teachers upload notes, PDFs, videos, images, or links for your subjects, they will appear here automatically.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                  {studentLearningResources.map((material) => (
                    <Card key={material.id} className="border-none bg-white shadow-sm overflow-hidden">
                      <CardContent className="p-5 space-y-4">
                        <div className="flex items-start gap-3">
                          <div className={cn(
                            "h-11 w-11 rounded-2xl flex shrink-0 items-center justify-center",
                            material.type === 'pdf' ? "bg-red-50 text-red-600" :
                            material.type === 'video' ? "bg-blue-50 text-blue-600" :
                            material.type === 'image' ? "bg-purple-50 text-purple-600" :
                            material.type === 'link' ? "bg-emerald-50 text-emerald-600" :
                            "bg-amber-50 text-amber-600"
                          )}>
                            {material.type === 'pdf' ? <FileText className="w-5 h-5" /> :
                             material.type === 'video' ? <Video className="w-5 h-5" /> :
                             material.type === 'image' ? <ImageIcon className="w-5 h-5" /> :
                             material.type === 'link' ? <LinkIcon className="w-5 h-5" /> :
                             <FileIcon className="w-5 h-5" />}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-primary">{material.title}</p>
                            <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-primary/40">{material.subjectName} {material.subjectCode ? `(${material.subjectCode})` : ""}</p>
                          </div>
                        </div>
                        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{material.description || "Learning material uploaded by your teacher."}</p>
                        <div className="flex items-center justify-between text-[10px] font-black uppercase text-muted-foreground">
                          <span>{material.date}</span>
                          <span>{material.size}</span>
                        </div>
                      </CardContent>
                      <CardFooter className="grid grid-cols-2 gap-2 border-t bg-accent/10 p-3">
                        <Button variant="ghost" className="h-9 rounded-lg text-[10px] font-black uppercase" onClick={() => handleViewMaterial(material)}>
                          <Eye className="mr-2 h-3.5 w-3.5" /> View
                        </Button>
                        <Button variant="ghost" className="h-9 rounded-lg text-[10px] font-black uppercase" onClick={() => handleDownloadMaterial(material)}>
                          <Download className="mr-2 h-3.5 w-3.5" /> Download
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          )}

          <section className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-primary/10" />
              <h2 className="text-sm font-black uppercase text-primary/40 tracking-[0.3em]">{language === 'en' ? 'Mandatory Subjects' : 'Matières Obligatoires'}</h2>
              <div className="h-px flex-1 bg-primary/10" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {mandatorySubjects.map((course) => (
                <CourseCard key={course.classSubjectId || course.subjectId || course.id} course={course} isAdmin={isAdmin} onDelete={() => handleDeleteSubject(course)} onViewMaterials={() => setViewingMaterialsFor(course)} />
              ))}
            </div>
          </section>

          {(isAdmin || isTeacher || enrolledOptional.length > 0 || availableOptional.length > 0) && (
            <section className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-primary/10" />
                <h2 className="text-sm font-black uppercase text-primary/40 tracking-[0.3em]">{language === 'en' ? 'Optional Subjects' : 'Matières Facultatives'}</h2>
                <div className="h-px flex-1 bg-primary/10" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {enrolledOptional.map((course) => (
                  <CourseCard key={course.classSubjectId || course.subjectId || course.id} course={course} isAdmin={isAdmin} onDelete={() => handleDeleteSubject(course)} onViewMaterials={() => setViewingMaterialsFor(course)} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function CourseCard({ course, isAdmin, onDelete, onViewMaterials }: { course: any, isAdmin: boolean, onDelete: () => void, onViewMaterials: () => void }) {
  const { language } = useI18n();
  const canRemove = isAdmin || !!course?.canRemove;
  
  return (
    <Card className="border-none shadow-sm overflow-hidden group hover:shadow-md transition-shadow bg-white">
      <div className={cn("h-2", course.color || 'bg-blue-500')} />
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] font-bold">{course.code || course.id}</Badge>
              <Badge className={cn(
                "text-[9px] uppercase font-black border-none h-4 px-2",
                course.type === 'mandatory' ? "bg-primary text-white" : "bg-secondary text-primary"
              )}>
                {course.type}
              </Badge>
              <Badge variant="secondary" className="text-[9px] font-black border-none h-4 px-2 bg-accent text-primary">Coef: {course.coefficient}</Badge>
            </div>
            <CardTitle className="text-xl font-black text-primary tracking-tight">{course.name}</CardTitle>
          </div>
          <div className="p-2 bg-accent/50 rounded-lg"><BookOpen className="w-5 h-5 text-primary" /></div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Instructor</p>
            <div className="flex items-center gap-2">
              <Avatar className="h-8 w-8 border-2 border-white shadow-sm ring-1 ring-accent shrink-0">
                <AvatarImage src={course.instructorAvatar} alt={course.instructorName} />
                <AvatarFallback className="bg-primary/5 text-primary text-[10px] font-bold">
                  {course.instructorName?.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <p className="text-xs font-bold truncate text-primary/80">{course.instructorName}</p>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Section</p>
            <p className="text-xs font-black text-primary/80 pt-1.5">{course.section}</p>
          </div>
        </div>
        <div className="pt-2">
           <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-1">Target Classes</p>
           <p className="text-xs font-bold text-primary/60">{course.targetClass || "All Streams"}</p>
        </div>
      </CardContent>
      <CardFooter className="bg-accent/30 border-t border-accent/50 pt-4 flex gap-2">
        <Button variant="ghost" className="flex-1 justify-between hover:bg-white h-10 group/btn" onClick={onViewMaterials}>
          <span className="flex items-center gap-2 font-bold text-xs">
            <Eye className="w-4 h-4" /> {isAdmin ? 'Course Suite' : (language === 'en' ? 'Materials' : 'Supports')}
          </span>
          <ChevronRight className="w-4 h-4 opacity-0 group-hover/btn:opacity-100 group-hover/btn:translate-x-1 transition-all" />
        </Button>
        {canRemove && (
          <Button variant="ghost" size="icon" className="text-destructive/20 hover:text-destructive hover:bg-destructive/5" onClick={onDelete}>
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
