"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import {
  Users,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  MessageSquare,
  ShieldCheck,
  Loader2,
  X,
  FileDown,
  KeyRound,
  Archive,
  RotateCcw,
  CalendarClock,
  Eye,
  Mail,
  Phone,
  Building2,
  BookOpen,
  GraduationCap,
  FileStack,
  Pencil,
} from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usersService } from "@/lib/api/services/users.service";
import { schoolsService } from "@/lib/api/services/schools.service";
import { generateBrandedTablePdf } from "@/lib/pdf-branded";
import { usePagination, DataPagination } from "@/components/ui/data-pagination";
import { UserModerationControls } from "@/components/dashboard/user-moderation";
import type { HierarchyClass, HierarchyClassSubject, HierarchySubSchool } from "@/lib/api/types";

const EXECUTIVE_STAFF_CREATION_ROLES = ["SCHOOL_ADMIN", "SUB_ADMIN", "TEACHER", "BURSAR", "LIBRARIAN"];
const SCHOOL_ADMIN_STAFF_CREATION_ROLES = ["SUB_ADMIN", "TEACHER", "BURSAR", "LIBRARIAN"];
const STAFF_ROLES = ["SCHOOL_ADMIN", "SUB_ADMIN", "TEACHER", "BURSAR", "LIBRARIAN"];
const RELATIONSHIP_ROLES = ["SUB_ADMIN", "TEACHER", "BURSAR", "LIBRARIAN"];
const emptyTeacherAssignment = () => ({ school_class: "", class_subject: "" });

type TeacherAssignmentDraft = {
  school_class: string;
  class_subject: string;
};

type CreateStaffFormState = {
  name: string;
  email: string;
  phone: string;
  whatsapp: string;
  role: string;
  school: string;
  sub_school: string;
  class_master_for: string;
  teaching_assignments: TeacherAssignmentDraft[];
  password: string;
  passwordConfirm: string;
};

const buildEmptyStaffState = (schoolId = "", role = "TEACHER"): CreateStaffFormState => ({
  name: "",
  email: "",
  phone: "",
  whatsapp: "",
  role,
  school: schoolId,
  sub_school: "",
  class_master_for: "",
  teaching_assignments: role === "TEACHER" ? [emptyTeacherAssignment()] : [],
  password: "",
  passwordConfirm: "",
});

const normalizeResults = (payload: any) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
};

type StaffRegistryMode = "active" | "draft";

const getDraftDeadline = (record: any) => record?.draftDeleteAfter || record?.draft_delete_after || null;
const getDraftReason = (record: any) => record?.draftReason || record?.draft_reason || "No reason provided.";
const getDraftReminderCount = (record: any) => record?.draftReminderCount ?? record?.draft_reminder_count ?? 0;

const formatDraftDate = (value?: string | null) => {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

const getUserSchoolId = (account: unknown): string => {
  const userRecord = account as {
    school?: string | { id?: string | null; name?: string | null } | null;
    school_id?: string | null;
    schoolId?: string | null;
  } | null;
  const school = userRecord?.school;
  if (typeof school === "string") return school;
  return school?.id || userRecord?.school_id || userRecord?.schoolId || "";
};

const getUserSchoolName = (account: unknown): string => {
  const userRecord = account as { school?: { name?: string | null } | string | null } | null;
  const school = userRecord?.school;
  return typeof school === "object" && school ? school.name || "" : "";
};

const getClassSubSchoolId = (schoolClass: HierarchyClass): string => {
  const subSchool = schoolClass.sub_school;
  if (!subSchool) return "";
  if (typeof subSchool === "string") return subSchool;
  return (subSchool as { id?: string | null }).id || "";
};

const getApiErrorMessage = (error: any) => {
  const data = error?.response?.data;
  if (!data) return error?.message || "Unable to create the staff account.";

  if (typeof data.detail === "string") return data.detail;

  const prioritizedFields = [
    "name",
    "email",
    "phone",
    "whatsapp",
    "role",
    "sub_school",
    "class_master_for",
    "teaching_assignments",
    "school_id",
    "school",
    "password_confirm",
    "password",
    "non_field_errors",
  ];

  for (const field of prioritizedFields) {
    const value = data?.[field];
    if (Array.isArray(value) && value[0]) return String(value[0]);
    if (typeof value === "string" && value.trim()) return value;
  }

  const firstValue = Object.values(data).find((value) =>
    (Array.isArray(value) && value[0]) || (typeof value === "string" && value.trim())
  );

  if (Array.isArray(firstValue) && firstValue[0]) return String(firstValue[0]);
  if (typeof firstValue === "string" && firstValue.trim()) return firstValue;

  return error?.message || "Unable to create the staff account.";
};

// API Hooks
const useUsers = (params: any, enabled = true, mode: StaffRegistryMode = "active") => {
  return useQuery({
    queryKey: ["users", mode, params],
    queryFn: async () => {
      const response = mode === "draft"
        ? await usersService.getDraftUsers(params)
        : await usersService.getUsers(params);
      return normalizeResults(response);
    },
    placeholderData: [] as any[],
    enabled,
  });
};

const useStaffRemarks = (params: any) => {
  return useQuery({
    queryKey: ["remarks", params],
    queryFn: async () => {
      const { staffRemarksService } = await import("@/lib/api/services/staff-remarks.service");
      return normalizeResults(await staffRemarksService.getRemarks(params));
    },
    placeholderData: [] as any[],
  });
};

const useMyRemarks = () => {
  return useQuery({
    queryKey: ["my-remarks"],
    queryFn: async () => {
      const { staffRemarksService } = await import("@/lib/api/services/staff-remarks.service");
      return normalizeResults(await staffRemarksService.getMyRemarks());
    },
    placeholderData: [] as any[],
  });
};

const useCreateRemark = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (remark: any) => {
      const { staffRemarksService } = await import("@/lib/api/services/staff-remarks.service");
      return staffRemarksService.createRemark({
        staff: remark.staffId,
        text: remark.message,
        remark_type: remark.type,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["remarks"] });
    },
  });
};

const useAcknowledgeRemark = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (remarkId: string) => {
      const { staffRemarksService } = await import("@/lib/api/services/staff-remarks.service");
      return staffRemarksService.acknowledgeRemark(remarkId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["remarks"] });
      queryClient.invalidateQueries({ queryKey: ["my-remarks"] });
    },
  });
};

const useSchools = () => {
  return useQuery({
    queryKey: ["staff-school-options"],
    queryFn: async () => normalizeResults(await schoolsService.getSchools()),
    placeholderData: [] as any[],
  });
};

const useCreateUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: any) =>
      payload.school_id
        ? schoolsService.createSchoolStaff(payload.school_id, payload)
        : usersService.createUser(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
};

const REMARK_TYPES = [
  { value: "Commendation", label: "Commendation", color: "bg-green-100 text-green-700" },
  { value: "Warning", label: "Warning", color: "bg-amber-100 text-amber-700" },
  { value: "Suspension", label: "Suspension", color: "bg-red-100 text-red-700" },
  { value: "Praise", label: "Praise", color: "bg-blue-100 text-blue-700" },
];

/**
 * The subjects a staff member teaches, as one readable cell.
 *
 * The server sends `subjects_taught` already merged from the two places a
 * teacher can be attached to a subject. The older `teaching_assignments` shape
 * is read as a fallback so a cached response from before this change still
 * produces a roster with subjects on it rather than a column of dashes.
 */
const subjectsOf = (staff: any, byTeacher?: Map<string, string[]>): string => {
  const fromServer: string[] = Array.isArray(staff?.subjects_taught) ? staff.subjects_taught : [];
  const fromAssignments: string[] = Array.isArray(staff?.teaching_assignments)
    ? staff.teaching_assignments.map((link: any) => link?.subject_name).filter(Boolean)
    : [];
  // Read fresh at download time. The staff list itself can come from a cached
  // response that predates this column, and a roster printing dashes because
  // of a day-old cache is indistinguishable from a teacher who teaches
  // nothing.
  const fromClassSubjects = byTeacher?.get(String(staff?.id)) ?? [];

  const seen = new Set<string>();
  const names: string[] = [];
  for (const name of [...fromClassSubjects, ...fromServer, ...fromAssignments]) {
    const cleaned = String(name || "").trim();
    if (cleaned && !seen.has(cleaned.toLowerCase())) {
      seen.add(cleaned.toLowerCase());
      names.push(cleaned);
    }
  }
  return names.length ? names.sort((a, b) => a.localeCompare(b)).join(", ") : "-";
};

/**
 * teacher id -> the subjects they take, from the class structure the school
 * actually fills in. Fetched when a roster is downloaded rather than held in
 * state, so the document always reflects today's assignments.
 */
const loadSubjectsByTeacher = async (): Promise<Map<string, string[]>> => {
  const byTeacher = new Map<string, string[]>();
  try {
    const { schoolsService } = await import("@/lib/api/services/schools.service");
    const response: any = await schoolsService.getHierarchySubjects({ page_size: 1000 } as any);
    const rows: any[] = Array.isArray(response) ? response : response?.results ?? [];
    for (const row of rows) {
      const teacherId = row?.teacher ? String(row.teacher) : "";
      const subject = String(row?.subject_name || "").trim();
      if (!teacherId || !subject) continue;
      const current = byTeacher.get(teacherId) ?? [];
      if (!current.some((name) => name.toLowerCase() === subject.toLowerCase())) {
        current.push(subject);
      }
      byTeacher.set(teacherId, current);
    }
  } catch {
    // The roster is still worth printing without it; the server's own
    // subjects_taught field covers the ordinary case.
  }
  return byTeacher;
};

export default function StaffPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState("");
  const [staffRegistryMode, setStaffRegistryMode] = useState<StaffRegistryMode>("active");
  const [isRemarkDialogOpen, setIsRemarkDialogOpen] = useState(false);
  const [isCreateStaffDialogOpen, setIsCreateStaffDialogOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [createdStaff, setCreatedStaff] = useState<any>(null);
  const [viewingStaff, setViewingStaff] = useState<any | null>(null);

  // Admin edit of a staff member's information (name, email, phone, whatsapp).
  const [editingStaff, setEditingStaff] = useState<any | null>(null);
  const [editStaffForm, setEditStaffForm] = useState({ name: "", email: "", phone: "", whatsapp: "" });
  const openEditStaff = (staff: any) => {
    setEditStaffForm({
      name: staff.name || "",
      email: staff.email || "",
      phone: staff.phone || "",
      whatsapp: staff.whatsapp || "",
    });
    setEditingStaff(staff);
  };
  const updateStaffMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, string> = {};
      (Object.keys(editStaffForm) as (keyof typeof editStaffForm)[]).forEach((key) => {
        payload[key] = editStaffForm[key].trim();
      });
      const { data } = await apiClient.patch(`/users/${editingStaff.id}/`, payload);
      return data;
    },
    onSuccess: () => {
      toast({ title: "Staff updated", description: "The staff member's information has been saved." });
      setEditingStaff(null);
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["staff-detail"] });
    },
    onError: (error: any) => {
      const data = error?.response?.data;
      const detail =
        (data && typeof data === "object"
          ? Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`).join(" | ")
          : "") || "The staff member could not be updated.";
      toast({ variant: "destructive", title: "Update failed", description: detail });
    },
  });

  const [newRemark, setNewRemark] = useState({
    staffId: "",
    type: "Commendation",
    message: "",
  });

  const [newStaff, setNewStaff] = useState<CreateStaffFormState>(() => buildEmptyStaffState());

  const isAdmin = ["SCHOOL_ADMIN", "SUB_ADMIN"].includes(user?.role || "");
  const isExecutive = ["SUPER_ADMIN", "CEO", "CTO", "COO"].includes(user?.role || "");
  const creationRoles = isExecutive ? EXECUTIVE_STAFF_CREATION_ROLES : SCHOOL_ADMIN_STAFF_CREATION_ROLES;
  const userSchoolId = getUserSchoolId(user);
  const userSchoolName = getUserSchoolName(user);
  const selectedSchoolId = newStaff.school || userSchoolId;
  const supportsSubSchool = RELATIONSHIP_ROLES.includes(newStaff.role);
  const isTeacherRole = newStaff.role === "TEACHER";

  useEffect(() => {
    if (isAdmin && userSchoolId) {
      setNewStaff((current) => ({
        ...current,
        school: userSchoolId,
        role: creationRoles.includes(current.role) ? current.role : "TEACHER",
        teaching_assignments:
          (creationRoles.includes(current.role) ? current.role : "TEACHER") === "TEACHER"
            ? current.teaching_assignments.length > 0
              ? current.teaching_assignments
              : [emptyTeacherAssignment()]
            : [],
      }));
    }
  }, [creationRoles, isAdmin, userSchoolId]);

  // Fetch staff list.
  // The backend already scopes results to a school admin's own school, so we
  // enable the query for any admin/executive even before the client-side
  // school id has resolved. Previously the query stayed disabled when
  // `userSchoolId` was empty, so the staff tab looked empty until a staff
  // account was created.
  const { data: staffList = [] } = useUsers({
    role: STAFF_ROLES.join(","),
    school: userSchoolId || undefined,
    school_id: userSchoolId || undefined,
    page_size: 500,
    limit: 500,
    ordering: "name",
  }, Boolean(userSchoolId) || isExecutive || isAdmin, staffRegistryMode);
  const { data: schoolOptions = [] } = useSchools();

  // Full detail for the staff member being viewed (matricule, sub-schools,
  // subjects/classes taught, materials uploaded, etc.).
  const staffDetailQuery = useQuery({
    queryKey: ["staff-detail", viewingStaff?.id],
    queryFn: () => usersService.getUser(String(viewingStaff.id)),
    enabled: Boolean(viewingStaff?.id),
  });
  const staffDetail: any = staffDetailQuery.data || viewingStaff || {};

  // Fetch remarks
  const { data: remarksList = [] } = useStaffRemarks({
    search: searchTerm,
  });

  const { data: myRemarks = [] } = useMyRemarks();
  const subSchoolsQuery = useQuery<HierarchySubSchool[]>({
    queryKey: ["staff-sub-school-options", selectedSchoolId],
    queryFn: () => schoolsService.getSubSchools(selectedSchoolId),
    enabled: Boolean(selectedSchoolId),
    placeholderData: [] as any[],
  });
  const classesQuery = useQuery<HierarchyClass[]>({
    queryKey: ["staff-hierarchy-classes", selectedSchoolId],
    queryFn: () => schoolsService.getSchoolClasses(selectedSchoolId),
    enabled: Boolean(selectedSchoolId),
    placeholderData: [] as any[],
  });
  const subjectLinksQuery = useQuery<HierarchyClassSubject[]>({
    queryKey: ["staff-hierarchy-subject-links", selectedSchoolId],
    queryFn: () => schoolsService.getHierarchySubjects({ school_id: selectedSchoolId }),
    enabled: Boolean(selectedSchoolId),
    placeholderData: [] as any[],
  });
  const subSchoolOptions = subSchoolsQuery.data ?? [];
  const hierarchyClasses = classesQuery.data ?? [];
  const hierarchySubjectLinks = subjectLinksQuery.data ?? [];
  const refetchSubSchools = subSchoolsQuery.refetch;
  const refetchClasses = classesQuery.refetch;
  const refetchSubjectLinks = subjectLinksQuery.refetch;

  useEffect(() => {
    if (!isCreateStaffDialogOpen || !isTeacherRole || !selectedSchoolId) return;
    void refetchSubSchools();
    void refetchClasses();
    void refetchSubjectLinks();
  }, [isCreateStaffDialogOpen, isTeacherRole, refetchClasses, refetchSubSchools, refetchSubjectLinks, selectedSchoolId]);

  const createRemarkMutation = useCreateRemark();
  const acknowledgeRemarkMutation = useAcknowledgeRemark();
  const createUserMutation = useCreateUser();
  const restoreUserMutation = useMutation({
    mutationFn: (id: string) => usersService.restoreUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  const availableClasses = useMemo(() => {
    if (!newStaff.sub_school) return hierarchyClasses as HierarchyClass[];
    return (hierarchyClasses as HierarchyClass[]).filter((schoolClass) => getClassSubSchoolId(schoolClass) === newStaff.sub_school);
  }, [hierarchyClasses, newStaff.sub_school]);

  const subjectLinksByClass = useMemo(() => {
    const grouped = new Map<string, HierarchyClassSubject[]>();
    (hierarchySubjectLinks as HierarchyClassSubject[]).forEach((link) => {
      if (!link.school_class) return;
      const existing = grouped.get(link.school_class) || [];
      existing.push(link);
      grouped.set(link.school_class, existing);
    });
    return grouped;
  }, [hierarchySubjectLinks]);

  const subjectLinkLookup = useMemo(() => {
    const lookup = new Map<string, HierarchyClassSubject>();
    (hierarchySubjectLinks as HierarchyClassSubject[]).forEach((link) => {
      lookup.set(link.id, link);
    });
    return lookup;
  }, [hierarchySubjectLinks]);

  const teacherAssignmentsById = useMemo(() => {
    const grouped = new Map<string, HierarchyClassSubject[]>();
    (hierarchySubjectLinks as HierarchyClassSubject[]).forEach((link) => {
      if (!link.teacher) return;
      const existing = grouped.get(link.teacher) || [];
      existing.push(link);
      grouped.set(link.teacher, existing);
    });
    return grouped;
  }, [hierarchySubjectLinks]);

  const classMasterAssignmentsById = useMemo(() => {
    const grouped = new Map<string, HierarchyClass[]>();
    (hierarchyClasses as HierarchyClass[]).forEach((schoolClass) => {
      if (!schoolClass.class_master) return;
      const existing = grouped.get(schoolClass.class_master) || [];
      existing.push(schoolClass);
      grouped.set(schoolClass.class_master, existing);
    });
    return grouped;
  }, [hierarchyClasses]);

  const filteredStaff = staffList
    .filter((staff: any) => STAFF_ROLES.includes(staff.role))
    .filter((s: any) =>
      s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.matricule?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.id?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  const staffPager = usePagination(filteredStaff, 20);

  const handleRoleChange = (role: string) => {
    setNewStaff((current) => ({
      ...current,
      role,
      sub_school: RELATIONSHIP_ROLES.includes(role) ? current.sub_school : "",
      class_master_for: role === "TEACHER" ? current.class_master_for : "",
      teaching_assignments:
        role === "TEACHER"
          ? current.teaching_assignments.length > 0
            ? current.teaching_assignments
            : [emptyTeacherAssignment()]
          : [],
    }));
  };

  const handleSchoolChange = (schoolId: string) => {
    setNewStaff((current) => ({
      ...current,
      school: schoolId,
      sub_school: "",
      class_master_for: "",
      teaching_assignments: current.role === "TEACHER" ? [emptyTeacherAssignment()] : [],
    }));
  };

  const handleSubSchoolChange = (subSchoolId: string) => {
    const allowedClassIds = new Set(
      (hierarchyClasses as HierarchyClass[])
        .filter((schoolClass) => !subSchoolId || getClassSubSchoolId(schoolClass) === subSchoolId)
        .map((schoolClass) => schoolClass.id)
    );

    setNewStaff((current) => ({
      ...current,
      sub_school: subSchoolId,
      class_master_for: current.class_master_for && !allowedClassIds.has(current.class_master_for) ? "" : current.class_master_for,
      teaching_assignments:
        current.role !== "TEACHER"
          ? []
          : current.teaching_assignments.map((assignment) =>
              assignment.school_class && !allowedClassIds.has(assignment.school_class)
                ? emptyTeacherAssignment()
                : assignment
            ),
    }));
  };

  const handleTeachingAssignmentChange = (index: number, field: keyof TeacherAssignmentDraft, value: string) => {
    setNewStaff((current) => ({
      ...current,
      teaching_assignments: current.teaching_assignments.map((assignment, assignmentIndex) => {
        if (assignmentIndex !== index) return assignment;
        if (field === "school_class") {
          return { school_class: value, class_subject: "" };
        }
        return { ...assignment, [field]: value };
      }),
    }));
  };

  const addTeachingAssignment = () => {
    setNewStaff((current) => ({
      ...current,
      teaching_assignments: [...current.teaching_assignments, emptyTeacherAssignment()],
    }));
  };

  const removeTeachingAssignment = (index: number) => {
    setNewStaff((current) => ({
      ...current,
      teaching_assignments:
        current.teaching_assignments.length <= 1
          ? [emptyTeacherAssignment()]
          : current.teaching_assignments.filter((_, assignmentIndex) => assignmentIndex !== index),
    }));
  };

  const handleCreateRemark = async () => {
    if (!newRemark.staffId || !newRemark.message) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please fill all fields",
      });
      return;
    }

    setIsProcessing(true);
    try {
      await createRemarkMutation.mutateAsync(newRemark);
      setIsProcessing(false);
      setIsRemarkDialogOpen(false);
      setNewRemark({ staffId: "", type: "Commendation", message: "" });
      toast({ title: "Remark Created", description: "Staff member has been notified." });
    } catch (error) {
      setIsProcessing(false);
      toast({ variant: "destructive", title: "Error", description: "Failed to create remark" });
    }
  };

  const handleAcknowledge = async (id: string) => {
    try {
      await acknowledgeRemarkMutation.mutateAsync(id);
      toast({ title: "Acknowledged", description: "Remark has been acknowledged." });
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to acknowledge." });
    }
  };

  const handleCreateStaff = async () => {
    if (
      !newStaff.name ||
      !newStaff.email.trim() ||
      !newStaff.role ||
      !selectedSchoolId
    ) {
      toast({
        variant: "destructive",
        title: "Missing Information",
        description: "Full name, email, role, and school are required so the staff member can receive their account email.",
      });
      return;
    }

    const completedTeachingAssignments = newStaff.teaching_assignments.filter(
      (assignment) => assignment.school_class || assignment.class_subject
    );

    if (
      isTeacherRole &&
      completedTeachingAssignments.some((assignment) => !assignment.school_class || !assignment.class_subject)
    ) {
      toast({
        variant: "destructive",
        title: "Incomplete teaching assignment",
        description: "Select both a class and one registered subject for every teacher assignment row.",
      });
      return;
    }

    const selectedTeachingAssignmentIds = completedTeachingAssignments.map((assignment) => assignment.class_subject);
    if (new Set(selectedTeachingAssignmentIds).size !== selectedTeachingAssignmentIds.length) {
      toast({
        variant: "destructive",
        title: "Duplicate teaching assignments",
        description: "Each class-subject relationship can only be selected once during onboarding.",
      });
      return;
    }

    setIsProcessing(true);
    try {
      const created = await createUserMutation.mutateAsync({
        name: newStaff.name.trim(),
        email: newStaff.email.trim() || undefined,
        phone: newStaff.phone.trim() || undefined,
        whatsapp: newStaff.whatsapp.trim() || undefined,
        role: newStaff.role,
        school: selectedSchoolId,
        school_id: selectedSchoolId,
        sub_school: supportsSubSchool ? newStaff.sub_school || undefined : undefined,
        class_master_for: isTeacherRole ? newStaff.class_master_for || undefined : undefined,
        teaching_assignments: isTeacherRole && selectedTeachingAssignmentIds.length > 0 ? selectedTeachingAssignmentIds : undefined,
        password: newStaff.password || undefined,
        password_confirm: newStaff.passwordConfirm || undefined,
      });

      const onboardingAssignments = selectedTeachingAssignmentIds
        .map((assignmentId) => {
          const link = subjectLinkLookup.get(assignmentId);
          return link ? `${link.class_name} - ${link.subject_name}` : null;
        })
        .filter(Boolean);

      setCreatedStaff({
        ...created,
        onboarding_sub_school_name: (subSchoolOptions as HierarchySubSchool[]).find(
          (subSchool) => subSchool.id === newStaff.sub_school
        )?.name,
        onboarding_class_master_name: (hierarchyClasses as HierarchyClass[]).find(
          (schoolClass) => schoolClass.id === newStaff.class_master_for
        )?.name,
        onboarding_assignments: onboardingAssignments,
      });
      setIsCreateStaffDialogOpen(false);
      setNewStaff(buildEmptyStaffState(isAdmin ? userSchoolId : "", "TEACHER"));
      toast({
        title: "Staff Created",
        description: "The account is ready. Share the matricule with the staff member.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Staff Creation Failed",
        description: getApiErrorMessage(error),
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRestoreStaff = async (staff: any) => {
    try {
      await restoreUserMutation.mutateAsync(staff.id);
      toast({
        title: "Staff Restored",
        description: `${staff.name} is active again with their previous school data preserved.`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Restore Failed",
        description: getApiErrorMessage(error),
      });
    }
  };

  const downloadActivationSlip = (staff: any) => {
    if (!staff) return;
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Staff Activation - ${staff.name}</title></head>
<body style="font-family:Arial,sans-serif;padding:32px;color:#111;">
  <h1 style="margin:0 0 8px;">${userSchoolName || "EduIgnite"}</h1>
  <p style="margin:0 0 24px;">Staff Activation Record</p>
  <table style="border-collapse:collapse;width:100%;max-width:720px;">
    <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Name</strong></td><td style="padding:8px;border:1px solid #ddd;">${staff.name || "-"}</td></tr>
    <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Matricule</strong></td><td style="padding:8px;border:1px solid #ddd;">${staff.matricule || "-"}</td></tr>
    <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Role</strong></td><td style="padding:8px;border:1px solid #ddd;">${staff.role || "-"}</td></tr>
    <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Sub School</strong></td><td style="padding:8px;border:1px solid #ddd;">${staff.onboarding_sub_school_name || staff.sub_school?.name || "-"}</td></tr>
    <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Class Master</strong></td><td style="padding:8px;border:1px solid #ddd;">${staff.onboarding_class_master_name || "-"}</td></tr>
    <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Teaching Assignments</strong></td><td style="padding:8px;border:1px solid #ddd;">${(staff.onboarding_assignments || []).join(", ") || "-"}</td></tr>
    <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Email</strong></td><td style="padding:8px;border:1px solid #ddd;">${staff.email || "-"}</td></tr>
    <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Phone</strong></td><td style="padding:8px;border:1px solid #ddd;">${staff.phone || "-"}</td></tr>
    <tr><td style="padding:8px;border:1px solid #ddd;"><strong>WhatsApp</strong></td><td style="padding:8px;border:1px solid #ddd;">${staff.whatsapp || "-"}</td></tr>
  </table>
  <p style="margin-top:24px;">This staff member can activate the account with the matricule above and complete remaining profile details after first login.</p>
</body>
</html>`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(staff.name || "staff").replace(/\s+/g, "_").toLowerCase()}_activation.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  // Download the current staff list as a branded PDF. On the mobile build this
  // saves into the eduignite Documents folder; on web/desktop it downloads.
  const downloadStaffList = async () => {
    const rows = filteredStaff;
    if (rows.length === 0) {
      toast({
        variant: "destructive",
        title: "Nothing to download",
        description: "There are no staff members in the current view to export.",
      });
      return;
    }
    const roleLabel = (role: string) => (role || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const subjectsByTeacher = await loadSubjectsByTeacher();
    generateBrandedTablePdf({
      title: "Official Faculty & Teaching Staff Roster",
      school: user?.school,
      schoolName: userSchoolName || "EduIgnite",
      chips: [{ label: "Total Personnel", value: `${rows.length} Staff` }],
      issuingOffice: "Human Resources & Personnel Office",
      monoColumns: [2],
      columns: ["No", "Name of Staff", "Matricule", "Role", "Subject(s) Taught", "Section", "Email", "Phone"],
      rows: rows.map((staff: any, index: number) => [
        index + 1,
        staff.name || "",
        staff.matricule || "",
        roleLabel(staff.role),
        // What a teacher actually teaches: the reason a head of department or
        // an inspector reads this document at all. A dash rather than a blank
        // for staff who teach nothing, so an empty cell never reads as a
        // missing record.
        subjectsOf(staff, subjectsByTeacher),
        staff.sub_school?.name || staff.onboarding_sub_school_name || "",
        staff.email || "",
        staff.phone || "",
      ]),
      fileName: `${(userSchoolName || "staff").toString().replace(/\s+/g, "_").toLowerCase()}_staff_list`,
    });
    toast({ title: "Staff list ready", description: "The staff list PDF has been generated." });
  };

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary font-headline flex items-center gap-3">
            <div className="p-2 bg-primary rounded-xl shadow-lg text-white">
              <Users className="w-6 h-6 text-secondary" />
            </div>
            Staff Management
          </h1>
          <p className="text-muted-foreground mt-1">Manage faculty, remarks, and institutional staff.</p>
        </div>
        {(isExecutive || isAdmin) && (
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button variant="outline" className="gap-2 h-14 px-6 rounded-2xl font-black uppercase tracking-widest text-xs" onClick={downloadStaffList}>
              <FileDown className="w-5 h-5" /> Download Staff
            </Button>
            <Button className="gap-2 shadow-xl h-14 px-8 rounded-2xl bg-primary text-white font-black uppercase tracking-widest text-xs" onClick={() => setIsCreateStaffDialogOpen(true)}>
              <Plus className="w-5 h-5" /> Create Staff Account
            </Button>
          </div>
        )}
      </div>

      <Tabs defaultValue="list" className="w-full">
        <TabsList className="grid w-full md:w-[400px] mb-8 bg-white shadow-sm border h-auto p-1.5 rounded-3xl grid-cols-2">
          <TabsTrigger value="list" className="gap-2 py-3 rounded-2xl transition-all font-bold text-xs sm:text-sm">
            <Users className="w-4 h-4" /> Staff List
          </TabsTrigger>
          <TabsTrigger value="remarks" className="gap-2 py-3 rounded-2xl transition-all font-bold text-xs sm:text-sm">
            <MessageSquare className="w-4 h-4" /> Remarks
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="animate-in fade-in slide-in-from-bottom-2 mt-0 space-y-6">
          <div className="flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 items-center gap-4">
              <Search className="ml-2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search staff by name or ID..."
                className="border-none bg-transparent focus-visible:ring-0"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-accent/40 p-1">
              <Button
                type="button"
                variant={staffRegistryMode === "active" ? "default" : "ghost"}
                className="h-10 rounded-xl gap-2 text-[10px] font-black uppercase tracking-widest"
                onClick={() => setStaffRegistryMode("active")}
              >
                <Users className="h-4 w-4" /> Active
              </Button>
              <Button
                type="button"
                variant={staffRegistryMode === "draft" ? "default" : "ghost"}
                className="h-10 rounded-xl gap-2 text-[10px] font-black uppercase tracking-widest"
                onClick={() => setStaffRegistryMode("draft")}
              >
                <Archive className="h-4 w-4" /> Draft
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {staffPager.pageItems.map((staff: any) => (
              <Card key={staff.id} className="border-none shadow-xl hover:shadow-2xl transition-all duration-300 bg-white rounded-[2rem] overflow-hidden group">
                <CardHeader className="flex flex-row items-center gap-4 pb-6">
                  <Avatar className="h-16 w-16 rounded-2xl border-2 border-primary/10 shadow-lg shrink-0">
                    <AvatarImage src={staff.avatar} alt={staff.name} />
                    <AvatarFallback className="bg-primary text-white font-black text-xl">{staff.name?.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="overflow-hidden flex-1">
                    <CardTitle className="text-lg font-black text-primary leading-tight uppercase truncate">{staff.name}</CardTitle>
                    <Badge variant="outline" className="mt-1 text-[8px] h-5 border-primary/10 text-primary font-bold uppercase">
                      {staff.role?.replace('_', ' ')}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="py-6 border-y border-accent/50 space-y-3 bg-accent/5">
                  <p className="text-[10px] font-bold text-muted-foreground">{staff.email}</p>
                  <p className="text-[10px] font-bold text-muted-foreground">{staff.phone}</p>
                  <div className="flex flex-wrap gap-2">
                    {staff.sub_school_name ? (
                      <Badge variant="outline" className="border-primary/10 text-[8px] font-bold uppercase text-primary">
                        {staff.sub_school_name}
                      </Badge>
                    ) : null}
                    {(classMasterAssignmentsById.get(staff.id) || []).slice(0, 1).map((schoolClass) => (
                      <Badge key={`master-${schoolClass.id}`} className="bg-secondary/15 text-[8px] font-bold uppercase text-primary">
                        Class Master - {schoolClass.name}
                      </Badge>
                    ))}
                    {(teacherAssignmentsById.get(staff.id) || []).slice(0, 2).map((assignment) => (
                      <Badge key={assignment.id} variant="outline" className="border-primary/10 text-[8px] font-bold uppercase text-primary">
                        {assignment.class_name} - {assignment.subject_name}
                      </Badge>
                    ))}
                    {staff.role === "TEACHER" && (teacherAssignmentsById.get(staff.id) || []).length === 0 ? (
                      <Badge className="bg-amber-100 text-[8px] font-bold uppercase text-amber-700">
                        No class-subject linked yet
                      </Badge>
                    ) : null}
                  </div>
                  {staffRegistryMode === "draft" ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
                        <CalendarClock className="h-4 w-4" />
                        Recoverable until {formatDraftDate(getDraftDeadline(staff))}
                      </div>
                      <p className="mt-2 text-xs font-medium leading-relaxed">{getDraftReason(staff)}</p>
                      <p className="mt-2 text-[10px] font-bold uppercase text-amber-700">
                        Reminder emails sent: {getDraftReminderCount(staff)} / 6
                      </p>
                    </div>
                  ) : null}
                </CardContent>

                <div className="p-4 flex justify-between items-center gap-2">
                  <Badge className={cn(
                    "text-[8px] h-5 font-black border-none",
                    staffRegistryMode === "draft" ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"
                  )}>
                    {staffRegistryMode === "draft" ? "Draft" : "Active"}
                  </Badge>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2 rounded-xl text-[10px] font-black uppercase tracking-widest"
                      onClick={() => setViewingStaff(staff)}
                    >
                      <Eye className="h-4 w-4" /> View
                    </Button>
                    {isAdmin && staffRegistryMode !== "draft" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2 rounded-xl text-[10px] font-black uppercase tracking-widest border-primary/30 text-primary"
                        onClick={() => openEditStaff(staff)}
                      >
                        <Pencil className="h-4 w-4" /> Edit
                      </Button>
                    ) : null}
                    {staffRegistryMode === "draft" ? (
                      <Button
                        size="sm"
                        className="gap-2 rounded-xl text-[10px] font-black uppercase tracking-widest"
                        onClick={() => handleRestoreStaff(staff)}
                        disabled={restoreUserMutation.isPending}
                      >
                        {restoreUserMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                        Restore
                      </Button>
                    ) : null}
                  </div>
                  {isAdmin && staffRegistryMode !== "draft" ? (
                    <div className="mt-3 border-t pt-3">
                      <UserModerationControls
                        user={staff}
                        onChanged={() => {
                          queryClient.invalidateQueries({ queryKey: ["users"] });
                          queryClient.invalidateQueries({ queryKey: ["staff-detail"] });
                        }}
                      />
                    </div>
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
          <DataPagination pager={staffPager} label="staff" />

          {filteredStaff.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-[2rem] border border-dashed bg-white py-16 text-center shadow-sm">
              <Archive className="h-10 w-10 text-primary/30" />
              <p className="mt-4 text-sm font-black uppercase tracking-widest text-primary">
                {staffRegistryMode === "draft" ? "No staff in Draft" : "No staff found"}
              </p>
              <p className="mt-2 max-w-md text-xs text-muted-foreground">
                {staffRegistryMode === "draft"
                  ? "Temporarily deleted school users will appear here until restored or permanently deleted after six months."
                  : "Try another search term or create a staff account."}
              </p>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="remarks" className="animate-in fade-in slide-in-from-bottom-2 mt-0 space-y-6">
          <div className="grid grid-cols-1 gap-6">
            {isAdmin ? (
              remarksList.map((remark: any) => (
                <Card key={remark.id} className="border-none shadow-xl overflow-hidden bg-white rounded-[2rem] group hover:shadow-2xl transition-all">
                  <div className="flex flex-col md:flex-row">
                    <div className="w-full md:w-72 bg-accent/20 border-r p-6 flex flex-col items-center text-center space-y-4 shrink-0">
                        <Avatar className="h-20 w-20 border-4 border-white shadow-lg">
                        <AvatarImage src={remark.staffAvatar || remark.staff_avatar || remark.staff?.avatar} />
                        <AvatarFallback className="bg-primary text-white text-2xl font-bold">{(remark.staffName || remark.staff_name || remark.staff?.name)?.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="space-y-1">
                        <h3 className="font-black text-primary text-sm uppercase leading-tight">{remark.staffName || remark.staff_name || remark.staff?.name}</h3>
                      </div>
                      <Badge className={cn("w-full justify-center py-1 font-black uppercase text-[9px]", REMARK_TYPES.find(t => t.value === (remark.type || remark.remark_type))?.color || "bg-gray-100 text-gray-700")}>
                        {remark.type || remark.remark_type}
                      </Badge>
                    </div>

                    <div className="flex-1 p-6 md:p-8 flex flex-col">
                      <div className="bg-white/50 border border-accent rounded-2xl p-6 italic text-sm text-muted-foreground leading-relaxed flex-1 mb-4">
                        "{remark.message || remark.text}"
                      </div>
                      <div className="pt-4 border-t flex justify-between items-center">
                        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                          <Clock className="w-3 h-3 inline mr-1" /> {new Date(remark.createdAt || remark.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              ))
            ) : (
              myRemarks.map((remark: any) => (
                <Card key={remark.id} className="border-none shadow-xl overflow-hidden bg-white rounded-[2rem] group hover:shadow-2xl transition-all">
                  <div className="flex flex-col md:flex-row">
                    <div className="w-full md:w-72 bg-accent/20 border-r p-6 flex flex-col items-center text-center space-y-4 shrink-0">
                      <div className="p-3 bg-primary rounded-xl text-white">
                        <AlertCircle className="w-8 h-8" />
                      </div>
                      <Badge className={cn("w-full justify-center py-1 font-black uppercase text-[9px]", REMARK_TYPES.find(t => t.value === (remark.type || remark.remark_type))?.color || "bg-gray-100 text-gray-700")}>
                        {remark.type || remark.remark_type}
                      </Badge>
                    </div>

                    <div className="flex-1 p-6 md:p-8 flex flex-col">
                      <div className="bg-white/50 border border-accent rounded-2xl p-6 italic text-sm text-muted-foreground leading-relaxed flex-1 mb-4">
                        "{remark.message || remark.text}"
                      </div>
                      <div className="pt-4 border-t flex justify-between items-center">
                        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                          <Clock className="w-3 h-3 inline mr-1" /> {new Date(remark.createdAt || remark.created_at).toLocaleString()}
                        </span>
                        <Button
                          className="gap-2 shadow-lg"
                          onClick={() => handleAcknowledge(remark.id)}
                          disabled={remark.acknowledged}
                        >
                          <CheckCircle2 className="w-4 h-4" /> {remark.acknowledged ? "Acknowledged" : "Acknowledge"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={isCreateStaffDialogOpen} onOpenChange={setIsCreateStaffDialogOpen}>
        <DialogContent className="sm:max-w-xl rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl flex max-h-[90vh] flex-col">
          <DialogHeader className="bg-primary p-8 text-white">
            <DialogTitle className="text-2xl font-black uppercase tracking-tighter">Create Staff Account</DialogTitle>
            <DialogDescription className="text-white/70">
              Provision a school-level account and generate a matricule for activation.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-8 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Full Name</Label>
                <Input value={newStaff.name} onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })} className="h-12 bg-accent/30 border-none rounded-xl font-bold" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Email</Label>
                <Input value={newStaff.email} onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })} className="h-12 bg-accent/30 border-none rounded-xl font-bold" type="email" placeholder="teacher@school.cm" required />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Phone</Label>
                <Input value={newStaff.phone} onChange={(e) => setNewStaff({ ...newStaff, phone: e.target.value })} className="h-12 bg-accent/30 border-none rounded-xl font-bold" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">WhatsApp</Label>
                <Input value={newStaff.whatsapp} onChange={(e) => setNewStaff({ ...newStaff, whatsapp: e.target.value })} className="h-12 bg-accent/30 border-none rounded-xl font-bold" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Role</Label>
                <Select value={newStaff.role} onValueChange={handleRoleChange}>
                  <SelectTrigger className="h-12 bg-accent/30 border-none rounded-xl font-bold">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {creationRoles.map((role) => (
                      <SelectItem key={role} value={role}>{role.replace(/_/g, " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">School</Label>
                {isAdmin ? (
                  <Input
                    value={schoolOptions.find((school: any) => school.id === selectedSchoolId)?.name || userSchoolName || "School linked automatically"}
                    readOnly
                    className="h-12 bg-accent/30 border-none rounded-xl font-bold"
                  />
                ) : (
                  <Select value={newStaff.school} onValueChange={handleSchoolChange}>
                    <SelectTrigger className="h-12 bg-accent/30 border-none rounded-xl font-bold">
                      <SelectValue placeholder="Select school" />
                    </SelectTrigger>
                    <SelectContent>
                      {schoolOptions.map((school: any) => (
                        <SelectItem key={school.id} value={school.id}>{school.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
            {supportsSubSchool ? (
              <section className="space-y-4 rounded-2xl border border-primary/10 bg-accent/10 p-5">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-primary">School Relationships</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Choose only from sub-schools, classes, and subjects already registered in the hierarchy so the school relationships stay clean and automatic.
                  </p>
                </div>

                {(subSchoolsQuery.isLoading || classesQuery.isLoading || subjectLinksQuery.isLoading) ? (
                  <div className="flex items-center gap-2 rounded-2xl border border-primary/10 bg-white px-4 py-3 text-xs font-bold text-primary">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading sub-schools, classes, and registered subjects...
                  </div>
                ) : null}

                {(subSchoolsQuery.isError || classesQuery.isError || subjectLinksQuery.isError) ? (
                  <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-xs text-destructive">
                    We could not load one or more school hierarchy dropdowns. Check your connection, then reopen this form or refresh the page.
                  </div>
                ) : null}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Sub School</Label>
                    <Select value={newStaff.sub_school || "__none__"} onValueChange={(value) => handleSubSchoolChange(value === "__none__" ? "" : value)}>
                      <SelectTrigger className="h-12 bg-white border border-primary/10 rounded-xl font-bold">
                        <SelectValue placeholder="Select sub school" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No sub school selected</SelectItem>
                        {(subSchoolOptions as HierarchySubSchool[]).map((subSchool) => (
                          <SelectItem key={subSchool.id} value={subSchool.id}>{subSchool.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {isTeacherRole ? (
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Class Master For (optional)</Label>
                      <Select value={newStaff.class_master_for || "__none__"} onValueChange={(value) => setNewStaff((current) => ({ ...current, class_master_for: value === "__none__" ? "" : value }))}>
                        <SelectTrigger className="h-12 bg-white border border-primary/10 rounded-xl font-bold">
                          <SelectValue placeholder="Choose the class this teacher should manage" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">No class master assignment</SelectItem>
                          {availableClasses.map((schoolClass: HierarchyClass) => (
                            <SelectItem key={schoolClass.id} value={schoolClass.id}>
                              {schoolClass.name}{schoolClass.class_master_name ? ` - Current master: ${schoolClass.class_master_name}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                </div>

                {isTeacherRole ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-primary">Teaching Assignments</p>
                        <p className="text-xs text-muted-foreground">Pick the class first, then select one of the registered subjects already configured for that class.</p>
                      </div>
                      <Button type="button" variant="outline" className="rounded-xl border-primary/10 font-bold text-primary" onClick={addTeachingAssignment}>
                        <Plus className="w-4 h-4 mr-2" /> Add Assignment
                      </Button>
                    </div>

                    {availableClasses.length === 0 ? (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
                        No classes are registered for this school yet. Add classes in <span className="font-bold">Hierarchy &amp; Sections</span> before onboarding teachers.
                      </div>
                    ) : null}

                    {(newStaff.teaching_assignments.length > 0 ? newStaff.teaching_assignments : [emptyTeacherAssignment()]).map((assignment, index) => {
                      const subjectOptions = assignment.school_class ? subjectLinksByClass.get(assignment.school_class) || [] : [];
                      return (
                        <div key={`teaching-assignment-${index}`} className="grid grid-cols-1 gap-4 rounded-2xl border border-primary/10 bg-white p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                          <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Class</Label>
                            <Select value={assignment.school_class || "__none__"} onValueChange={(value) => handleTeachingAssignmentChange(index, "school_class", value === "__none__" ? "" : value)}>
                              <SelectTrigger className="h-12 border-primary/10 rounded-xl font-bold">
                                <SelectValue placeholder="Select class" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">No class selected</SelectItem>
                                {availableClasses.map((schoolClass: HierarchyClass) => (
                                  <SelectItem key={schoolClass.id} value={schoolClass.id}>{schoolClass.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Registered Subject</Label>
                            <Select value={assignment.class_subject || "__none__"} onValueChange={(value) => handleTeachingAssignmentChange(index, "class_subject", value === "__none__" ? "" : value)} disabled={!assignment.school_class}>
                              <SelectTrigger className="h-12 border-primary/10 rounded-xl font-bold">
                                <SelectValue placeholder={assignment.school_class ? "Select registered subject" : "Choose class first"} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">No subject selected</SelectItem>
                                {subjectOptions.map((link) => (
                                <SelectItem key={link.id} value={link.id} disabled={Boolean(link.teacher)}>
                                    {link.subject_name} - {link.type}{link.teacher_name ? ` - Assigned to ${link.teacher_name}` : ""}
                                </SelectItem>
                              ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <Button type="button" variant="ghost" size="icon" className="h-12 w-12 rounded-xl border border-primary/10 text-muted-foreground hover:text-primary" onClick={() => removeTeachingAssignment(index)}>
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      );
                    })}

                    {(hierarchySubjectLinks as HierarchyClassSubject[]).length === 0 ? (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
                        No registered class subjects were found for this school yet. Add subjects in <span className="font-bold">Hierarchy &amp; Sections</span> so teachers can be linked by dropdown instead of typing.
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-primary/10 bg-white px-4 py-3 text-xs text-muted-foreground">
                    This role is linked to the school through the selected sub school. Class and subject links are only assigned during teacher onboarding.
                  </div>
                )}
              </section>
            ) : null}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Temporary Password (optional)</Label>
                <Input value={newStaff.password} onChange={(e) => setNewStaff({ ...newStaff, password: e.target.value })} className="h-12 bg-accent/30 border-none rounded-xl font-bold" type="password" placeholder="Leave blank to activate later with matricule" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Confirm Password</Label>
                <Input value={newStaff.passwordConfirm} onChange={(e) => setNewStaff({ ...newStaff, passwordConfirm: e.target.value })} className="h-12 bg-accent/30 border-none rounded-xl font-bold" type="password" placeholder="Only needed if a password is provided" />
              </div>
            </div>
            <div className="rounded-2xl border border-primary/10 bg-accent/10 p-4 text-xs text-muted-foreground space-y-2">
              <p className="font-black uppercase tracking-widest text-primary">Activation Notes</p>
              <p>The system always generates the staff matricule automatically.</p>
              <p>A real email address is required so the staff member can receive their account notification and password reset links.</p>
              <p>If password is omitted, the staff member can activate later using the matricule.</p>
            </div>
          </div>
          <DialogFooter className="sticky bottom-0 bg-accent/20 p-6 border-t border-accent">
            <Button type="button" onClick={handleCreateStaff} className="w-full h-14 rounded-2xl shadow-lg font-black uppercase tracking-widest text-xs gap-3 bg-primary text-white hover:bg-primary/90" disabled={isProcessing}>
              {isProcessing ? <><Loader2 className="w-5 h-5 animate-spin" /><span>Creating...</span></> : <><ShieldCheck className="w-5 h-5 text-secondary" /><span>Create Staff & Generate Matricule</span></>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!createdStaff} onOpenChange={() => setCreatedStaff(null)}>
        <DialogContent className="sm:max-w-lg rounded-[2.5rem] p-8 border-none shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tighter text-primary">Staff Account Ready</DialogTitle>
            <DialogDescription>
              Share this matricule with the staff member so they can activate the account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-2xl border border-primary/10 bg-accent/20 p-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Generated Matricule</p>
              <p className="mt-2 text-3xl font-black tracking-tight text-primary">{createdStaff?.matricule}</p>
            </div>
            <div className="rounded-2xl border border-primary/10 bg-white p-5 space-y-2">
              <p className="text-sm font-bold text-primary">{createdStaff?.name}</p>
              <p className="text-xs text-muted-foreground">{createdStaff?.email}</p>
              <Badge variant="outline" className="text-[10px] border-primary/10 text-primary font-bold uppercase">
                {createdStaff?.role?.replace('_', ' ')}
              </Badge>
              {createdStaff?.onboarding_sub_school_name ? (
                <Badge className="bg-secondary/15 text-[10px] font-bold uppercase text-primary">
                  {createdStaff.onboarding_sub_school_name}
                </Badge>
              ) : null}
              {createdStaff?.onboarding_class_master_name ? (
                <p className="text-xs text-muted-foreground">
                  Class master for <span className="font-bold text-primary">{createdStaff.onboarding_class_master_name}</span>
                </p>
              ) : null}
              {(createdStaff?.onboarding_assignments || []).length > 0 ? (
                <div className="space-y-2 pt-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Teaching Assignments</p>
                  <div className="flex flex-wrap gap-2">
                    {createdStaff.onboarding_assignments.map((assignment: string) => (
                      <Badge key={assignment} variant="outline" className="border-primary/10 text-[10px] font-bold text-primary">
                        {assignment}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Button variant="outline" className="rounded-xl border-primary/10 font-bold text-primary gap-2" onClick={() => downloadActivationSlip(createdStaff)}>
                <FileDown className="w-4 h-4" /> Download Activation Slip
              </Button>
              <div className="rounded-xl border border-primary/10 bg-accent/10 px-4 py-3 text-xs text-muted-foreground flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-primary" />
                <span>The generated matricule is the activation key.</span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Staff details view */}
      <Dialog open={!!editingStaff} onOpenChange={(open) => { if (!open) setEditingStaff(null); }}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-black text-primary">
              <Pencil className="h-4 w-4" /> Edit Staff Information
            </DialogTitle>
            <DialogDescription className="text-xs">
              Update {editingStaff?.name || "this staff member"}&apos;s details. Matricule and role stay unchanged.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {([
              ["name", "Full name"],
              ["email", "Email"],
              ["phone", "Phone"],
              ["whatsapp", "WhatsApp (optional)"],
            ] as const).map(([key, label]) => (
              <div key={key} className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
                <Input
                  value={editStaffForm[key]}
                  onChange={(e) => setEditStaffForm((prev) => ({ ...prev, [key]: e.target.value }))}
                  className="h-11 rounded-xl bg-accent/30 border-none"
                />
              </div>
            ))}
            <Button
              className="mt-2 h-12 w-full rounded-2xl font-black uppercase text-xs"
              onClick={() => updateStaffMutation.mutate()}
              disabled={updateStaffMutation.isPending || !editStaffForm.name.trim()}
            >
              {updateStaffMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewingStaff} onOpenChange={(open) => { if (!open) setViewingStaff(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <Avatar className="h-12 w-12 rounded-xl border">
                <AvatarImage src={staffDetail.avatar} alt={staffDetail.name} />
                <AvatarFallback className="bg-primary text-white font-black">{staffDetail.name?.charAt(0)}</AvatarFallback>
              </Avatar>
              <span className="flex flex-col">
                <span className="text-lg font-black text-primary uppercase leading-tight">{staffDetail.name}</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {(staffDetail.display_role || staffDetail.role || "").toString().replace(/_/g, " ")}
                </span>
              </span>
            </DialogTitle>
            <DialogDescription>Complete staff profile and workload overview.</DialogDescription>
          </DialogHeader>

          {staffDetailQuery.isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary/40" /></div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl border bg-accent/10 p-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Matricule</p>
                  <p className="mt-1 font-mono text-sm font-bold text-primary break-all">{staffDetail.matricule || "â€”"}</p>
                </div>
                <div className="rounded-xl border bg-accent/10 p-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Status</p>
                  <p className="mt-1 text-sm font-bold text-primary">{staffDetail.is_active === false ? "Inactive / Not activated" : "Active"}</p>
                </div>
                <div className="rounded-xl border bg-accent/10 p-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1"><Mail className="h-3 w-3" /> Email</p>
                  <p className="mt-1 text-sm font-bold text-primary break-all">{staffDetail.email || "â€”"}</p>
                </div>
                <div className="rounded-xl border bg-accent/10 p-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" /> Phone / WhatsApp</p>
                  <p className="mt-1 text-sm font-bold text-primary">{staffDetail.phone || "â€”"}{staffDetail.whatsapp ? ` / ${staffDetail.whatsapp}` : ""}</p>
                </div>
                <div className="rounded-xl border bg-accent/10 p-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1"><Building2 className="h-3 w-3" /> School</p>
                  <p className="mt-1 text-sm font-bold text-primary">{staffDetail.school?.name || userSchoolName || "â€”"}</p>
                </div>
                <div className="rounded-xl border bg-accent/10 p-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Sub-school</p>
                  <p className="mt-1 text-sm font-bold text-primary">{staffDetail.sub_school?.name || staffDetail.sub_school_name || "â€”"}</p>
                </div>
                <div className="rounded-xl border bg-secondary/10 p-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1"><FileStack className="h-3 w-3" /> Materials Uploaded</p>
                  <p className="mt-1 text-2xl font-black text-primary">{staffDetail.materials_count ?? 0}</p>
                  {staffDetail.materials_breakdown ? (
                    <p className="text-[10px] text-muted-foreground">
                      {staffDetail.materials_breakdown.assignments ?? 0} assignments Â· {staffDetail.materials_breakdown.ai_exam_drafts ?? 0} exam drafts
                    </p>
                  ) : null}
                </div>
                <div className="rounded-xl border bg-accent/10 p-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Joined</p>
                  <p className="mt-1 text-sm font-bold text-primary">{staffDetail.date_joined ? new Date(staffDetail.date_joined).toLocaleDateString() : "â€”"}</p>
                </div>
              </div>

              <div>
                <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-secondary" /> Subjects & Classes Taught
                </p>
                {(() => {
                  const backendAssignments = Array.isArray(staffDetail.teaching_assignments) ? staffDetail.teaching_assignments : [];
                  const fallback = (teacherAssignmentsById.get(String(staffDetail.id)) || []).map((a: any) => ({
                    id: a.id, class_name: a.class_name, subject_name: a.subject_name,
                  }));
                  const assignments = backendAssignments.length ? backendAssignments : fallback;
                  return assignments.length ? (
                    <div className="flex flex-wrap gap-2">
                      {assignments.map((a: any, idx: number) => (
                        <Badge key={a.id || idx} variant="outline" className="border-primary/10 text-[10px] font-bold text-primary">
                          {a.class_name || "Class"} â€” {a.subject_name || "Subject"}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No subjects/classes assigned yet.</p>
                  );
                })()}
              </div>

              <div>
                <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                  <GraduationCap className="h-4 w-4 text-secondary" /> Class Master Of
                </p>
                {(() => {
                  const backendMaster = Array.isArray(staffDetail.class_master_of) ? staffDetail.class_master_of : [];
                  const fallback = (classMasterAssignmentsById.get(String(staffDetail.id)) || []).map((c: any) => ({ id: c.id, name: c.name }));
                  const masters = backendMaster.length ? backendMaster : fallback;
                  return masters.length ? (
                    <div className="flex flex-wrap gap-2">
                      {masters.map((c: any, idx: number) => (
                        <Badge key={c.id || idx} className="bg-secondary/15 text-[10px] font-bold text-primary">{c.name}</Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Not a class master.</p>
                  );
                })()}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingStaff(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
