"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useEducationCategory } from "@/lib/hooks/useEducationCategory";
import {
  useAllStudents,
  useCreateStudent,
  useHonourRoll,
  useLinkParent,
  useStudentRegistrySummary,
  useUpdateStudent,
} from "@/lib/hooks/useStudents";
import { useAllUsersBySchool, useCreateUser, useUsers } from "@/lib/hooks/useUsers";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { BookOpen, Check, ChevronDown, Copy, Download, Eye, FileText, KeyRound, Link2, Loader2, Plus, Search, Sparkles, Upload, UserPlus, Users } from "lucide-react";
import { usersService } from "@/lib/api/services/users.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type {
  BulkStudentUploadRequest,
  CreateStudentRequest,
  CreateUserRequest,
  HierarchyClass,
  HierarchyClassSubject,
  HierarchySubSchool,
  LinkParentRequest,
  Student,
  UpdateStudentRequest,
  User,
} from "@/lib/api/types";
import { schoolsService } from "@/lib/api/services/schools.service";
import { studentsService } from "@/lib/api/services/students.service";
import { generateBrandedTablePdf } from "@/lib/pdf-branded";
import { usePagination, DataPagination } from "@/components/ui/data-pagination";
import { UserModerationControls } from "@/components/dashboard/user-moderation";

const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

const RELATIONSHIP_OPTIONS = [
  { value: "father", label: "Father" },
  { value: "mother", label: "Mother" },
  { value: "legal_guardian", label: "Guardian" },
  { value: "uncle", label: "Uncle" },
  { value: "aunt", label: "Aunt" },
  { value: "elder_sibling", label: "Elder Sibling" },
  { value: "other", label: "Other" },
];

const STUDENT_ADMISSION_MANAGER_ROLES = ["SCHOOL_ADMIN", "SUB_ADMIN"] as const;

const canManageStudentAdmissionsForRole = (role?: string | null) =>
  Boolean(role && STUDENT_ADMISSION_MANAGER_ROLES.includes(role as (typeof STUDENT_ADMISSION_MANAGER_ROLES)[number]));

const normalizeGuardianRelationship = (relationship?: string) =>
  relationship === "guardian" ? "legal_guardian" : relationship || "legal_guardian";

const getUserSchoolId = (account: unknown): string => {
  const userRecord = account as {
    school?: string | { id?: string | null } | null;
    school_id?: string | null;
    schoolId?: string | null;
  } | null;
  const school = userRecord?.school;
  if (typeof school === "string") return school;
  return school?.id || userRecord?.school_id || userRecord?.schoolId || "";
};

const getHierarchyClassSubSchoolId = (schoolClass: HierarchyClass): string => {
  const subSchool = schoolClass.sub_school;
  if (!subSchool) return "";
  if (typeof subSchool === "string") return subSchool;
  return (subSchool as { id?: string | null }).id || "";
};

const OPTIONAL_STUDENT_FIELDS: Array<keyof CreateStudentRequest> = [
  "email",
  "phone",
  "whatsapp",
  "password",
  "school_class",
  "class_level",
  "section",
  "date_of_birth",
  "guardian_name",
  "guardian_phone",
  "guardian_whatsapp",
  "admission_number",
  "admission_date",
  "parent_name",
  "parent_email",
  "parent_phone",
  "parent_whatsapp",
];

const buildAdmissionPayload = (formData: CreateStudentRequest, schoolId: string): CreateStudentRequest => {
  const payload: Partial<CreateStudentRequest> = {
    ...formData,
    school: schoolId,
    parent_relationship: normalizeGuardianRelationship(formData.parent_relationship),
  };

  for (const key of OPTIONAL_STUDENT_FIELDS) {
    const value = payload[key];
    if (value === "" || value === null || value === undefined) {
      delete payload[key];
    }
  }

  if (!payload.create_parent_account) {
    delete payload.parent_name;
    delete payload.parent_email;
    delete payload.parent_phone;
    delete payload.parent_whatsapp;
  }

  return payload as CreateStudentRequest;
};

const emptyForm: CreateStudentRequest = {
  name: "",
  email: "",
  phone: "",
  whatsapp: "",
  password: "",
  school_class: null,
  student_class: "",
  class_level: "Form 1",
  section: "General",
  date_of_birth: "",
  gender: "male",
  guardian_name: "",
  guardian_phone: "",
  guardian_whatsapp: "",
  admission_number: "",
  admission_date: "",
  parent_name: "",
  parent_email: "",
  parent_phone: "",
  parent_whatsapp: "",
  parent_relationship: "legal_guardian",
  create_parent_account: false,
};

type AdmissionResult = {
  id?: string;
  user?: {
    name?: string;
  };
  student_matricule?: string;
  parent_matricule?: string | null;
};

type BulkUploadResult = {
  created_count?: number;
  failed_count?: number;
  detail?: string;
  document_html?: string;
  generated_students?: Array<{
    id: string;
    matricule: string;
    sub_school_name?: string;
    student_class: string;
    class_level: string;
    section: string;
    department?: string;
    stream?: string;
  }>;
  created_students?: Array<{
    id: string;
    name: string;
    matricule: string;
    admission_number: string;
  }>;
  failed_rows?: Array<{
    row: number;
    name?: string;
    reason?: string;
    errors?: unknown;
  }>;
};

const emptyParentLinkForm: LinkParentRequest = {
  relationship: "legal_guardian",
  parent_name: "",
  parent_email: "",
  parent_phone: "",
  parent_whatsapp: "",
  is_primary: true,
};

type ParentCreateForm = CreateUserRequest & {
  relationship: string;
  is_primary: boolean;
};

type ParentCreateResult = {
  id?: string;
  matricule?: string;
  name?: string;
  linkedStudentNames?: string[];
  failedStudentNames?: string[];
};

const emptyParentCreateForm: ParentCreateForm = {
  name: "",
  email: "",
  phone: "",
  whatsapp: "",
  role: "PARENT",
  relationship: "legal_guardian",
  is_primary: true,
};

type RegistryStudentCard = {
  key: string;
  id: string;
  profileId?: string;
  user: User;
  admissionNumber: string;
  admission_number: string;
  studentClass: string;
  student_class: string;
  schoolClassName?: string;
  school_class_name?: string;
  schoolClassId?: string | null;
  school_class_id?: string | null;
  subSchoolName?: string;
  sub_school_name?: string;
  classLevel: string;
  class_level: string;
  section: string;
  guardianName: string;
  guardian_name: string;
  guardianPhone: string;
  guardian_phone: string;
  guardianWhatsapp?: string;
  guardian_whatsapp?: string;
  admissionDate?: string;
  admission_date?: string;
  parentCount: number;
  parent_count: number;
  parentLinks: Student["parent_links"];
  parent_links: Student["parent_links"];
  hasProfile: boolean;
  profile?: Student;
};

function studentInitials(student: Student) {
  const name = student.user?.name || "Student";
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatHierarchyValue(value?: string) {
  return (value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatRegistryDate(value?: string) {
  if (!value) return "Not recorded";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function registryStudentName(student: RegistryStudentCard) {
  return student.user?.name || "Unnamed student";
}

function registryStudentInitials(student: RegistryStudentCard) {
  return registryStudentName(student)
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function registryClassLabel(student: RegistryStudentCard) {
  return student.schoolClassName || student.studentClass || "Awaiting class placement";
}

function registrySubSchoolLabel(student: RegistryStudentCard) {
  return student.subSchoolName || "Main School";
}

function queryErrorMessage(error: unknown) {
  const responseData = (error as { response?: { data?: unknown } })?.response?.data;
  if (typeof responseData === "string") return responseData;
  if (responseData && typeof responseData === "object") {
    const detail = (responseData as { detail?: unknown; message?: unknown; error?: unknown }).detail
      || (responseData as { message?: unknown }).message
      || (responseData as { error?: unknown }).error;
    if (typeof detail === "string") return detail;
  }
  return error instanceof Error ? error.message : "The student registry could not be loaded right now.";
}

export default function StudentsPage() {
  const { user } = useAuth();
  const isBasicSchool = useEducationCategory() === "basic";
  const { toast } = useToast();
  const currentSchoolId = getUserSchoolId(user);
  const canManageStudentAdmissions = canManageStudentAdmissionsForRole(user?.role);

  // Issuing a student a new password when they have forgotten theirs. The
  // value is shown once, on the way back from the server - stored passwords
  // are hashed, so it cannot be looked up again afterwards.
  const [resettingFor, setResettingFor] = useState<any | null>(null);
  const [issuedPassword, setIssuedPassword] = useState<string | null>(null);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  // Opening the dialog only asks for confirmation; nothing changes until the
  // principal confirms.
  const handleGeneratePassword = (studentRow: any) => {
    if (!studentRow?.user?.id) return;
    setResettingFor(studentRow);
    setIssuedPassword(null);
  };

  const confirmResetPassword = async () => {
    const studentRow = resettingFor;
    const userId = studentRow?.user?.id;
    if (!userId) return;
    setIsResettingPassword(true);
    try {
      const result = await usersService.adminResetStudentPassword(userId);
      setIssuedPassword(result.password);
    } catch (error: any) {
      setResettingFor(null);
      toast({
        variant: "destructive",
        title: "Could not reset the password",
        description: getApiErrorMessage(error, "Please try again."),
      });
    } finally {
      setIsResettingPassword(false);
    }
  };
  const [searchTerm, setSearchTerm] = useState("");
  const [adminSubSchoolFilter, setAdminSubSchoolFilter] = useState("all");
  const [adminClassFilter, setAdminClassFilter] = useState("all");
  const [parentSearchTerm, setParentSearchTerm] = useState("");
  const [isAdmissionOpen, setIsAdmissionOpen] = useState(false);
  const [showOptionalAdmissionFields, setShowOptionalAdmissionFields] = useState(false);
  const [createdResult, setCreatedResult] = useState<AdmissionResult | null>(null);
  const [formData, setFormData] = useState<CreateStudentRequest>(emptyForm);
  const [guardianSearchTerm, setGuardianSearchTerm] = useState("");
  const [selectedAdmissionGuardian, setSelectedAdmissionGuardian] = useState<User | null>(null);
  const [isLinkingAdmissionGuardian, setIsLinkingAdmissionGuardian] = useState(false);
  const [viewingStudent, setViewingStudent] = useState<RegistryStudentCard | null>(null);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [editPhotoPreview, setEditPhotoPreview] = useState<string>("");
  const [editData, setEditData] = useState<UpdateStudentRequest>({});
  const [linkingStudent, setLinkingStudent] = useState<Student | null>(null);
  const [linkParentData, setLinkParentData] = useState<LinkParentRequest>(emptyParentLinkForm);
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkUploadResult | null>(null);
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);
  // Generate-once guard: after a successful generation the admin must refill the
  // form (re-enter the count) before they can generate again, to avoid
  // accidentally generating a second batch of matricules.
  const [bulkGenerated, setBulkGenerated] = useState(false);
  const [isParentDialogOpen, setIsParentDialogOpen] = useState(false);
  const [isParentWorkflowRunning, setIsParentWorkflowRunning] = useState(false);
  const [createdParentResult, setCreatedParentResult] = useState<ParentCreateResult | null>(null);
  const [parentFormData, setParentFormData] = useState<ParentCreateForm>(emptyParentCreateForm);
  const [selectedParentStudentIds, setSelectedParentStudentIds] = useState<string[]>([]);
  const [parentStudentSearchTerm, setParentStudentSearchTerm] = useState("");
  const [linkingParent, setLinkingParent] = useState<User | null>(null);
  const [existingParentLinkData, setExistingParentLinkData] = useState<Pick<LinkParentRequest, "relationship" | "is_primary">>({
    relationship: "legal_guardian",
    is_primary: false,
  });
  const [selectedExistingParentStudentIds, setSelectedExistingParentStudentIds] = useState<string[]>([]);
  const [existingParentStudentSearchTerm, setExistingParentStudentSearchTerm] = useState("");
  const [bulkData, setBulkData] = useState<BulkStudentUploadRequest>({
    sub_school: "",
    school_class: "",
    student_class: "",
    generation_count: 30,
    class_level: undefined,
    section: undefined,
    department: "",
    stream: "",
    batch_name: "",
  });

  const studentsQuery = useAllStudents({
    search: searchTerm || undefined,
    ordering: "user__name",
    school: currentSchoolId || undefined,
    page_size: 100,
  }, Boolean(currentSchoolId || user?.role === "CEO" || user?.role === "CTO" || user?.role === "SUPER_ADMIN"));
  const studentRosterQuery = useAllStudents({
    ordering: "user__name",
    school: currentSchoolId || undefined,
    page_size: 100,
  }, Boolean(currentSchoolId || user?.role === "CEO" || user?.role === "CTO" || user?.role === "SUPER_ADMIN"));
  const registrySummaryQuery = useStudentRegistrySummary();
  const studentUsersQuery = useAllUsersBySchool(currentSchoolId, {
    role: "STUDENT",
    ordering: "name",
    search: searchTerm || undefined,
    page_size: 100,
  }, Boolean(currentSchoolId));
  const studentUserRosterQuery = useAllUsersBySchool(currentSchoolId, {
    role: "STUDENT",
    ordering: "name",
    page_size: 100,
  }, Boolean(currentSchoolId));
  const parentsQuery = useUsers({
    role: "PARENT",
    school_id: currentSchoolId || undefined,
    ordering: "name",
    search: parentSearchTerm || undefined,
    page_size: 300,
  });
  const parentRosterQuery = useUsers({
    role: "PARENT",
    school_id: currentSchoolId || undefined,
    ordering: "name",
    page_size: 500,
  });
  const honourRollQuery = useHonourRoll();
  const hierarchyClassesQuery = useQuery<HierarchyClass[]>({
    queryKey: ["student-hierarchy-classes", currentSchoolId],
    queryFn: () => schoolsService.getSchoolClasses(currentSchoolId),
    enabled: Boolean(currentSchoolId && canManageStudentAdmissions),
  });
  const subSchoolsQuery = useQuery<HierarchySubSchool[]>({
    queryKey: ["student-sub-schools", currentSchoolId],
    queryFn: () => schoolsService.getSubSchools(currentSchoolId),
    enabled: Boolean(currentSchoolId && canManageStudentAdmissions),
  });
  const teacherClassSubjectsQuery = useQuery<HierarchyClassSubject[]>({
    queryKey: ["teacher-student-roster-subjects", currentSchoolId, user?.id],
    queryFn: () => schoolsService.getHierarchySubjects({ school_id: currentSchoolId }),
    enabled: Boolean(currentSchoolId && user?.role === "TEACHER"),
  });
  const createStudentMutation = useCreateStudent();
  const updateStudentMutation = useUpdateStudent();
  const linkParentMutation = useLinkParent();
  const createUserMutation = useCreateUser();

  const students = studentsQuery.data?.results ?? [];
  const studentRoster = studentRosterQuery.data?.results ?? [];
  const studentUsers = studentUsersQuery.data?.results ?? [];
  const studentUserRoster = studentUserRosterQuery.data?.results ?? [];
  const parents = parentsQuery.data?.results ?? [];
  const parentRoster = parentRosterQuery.data?.results ?? [];
  const honourRoll = Array.isArray(honourRollQuery.data)
    ? honourRollQuery.data
    : honourRollQuery.data?.results ?? [];
  const hierarchyClasses = hierarchyClassesQuery.data ?? [];
  const subSchools = subSchoolsQuery.data ?? [];
  const teacherClassSubjectLinks = useMemo(
    () =>
      (teacherClassSubjectsQuery.data ?? []).filter((link) => {
        const teacherId = link.teacher ? String(link.teacher) : "";
        return teacherId === String(user?.id) || teacherId === String((user as any)?.uid);
      }),
    [teacherClassSubjectsQuery.data, user]
  );
  const [teacherClassFilter, setTeacherClassFilter] = useState("all");
  const [teacherSubjectFilter, setTeacherSubjectFilter] = useState("all");
  const honourRollCount = Math.max(
    Number(registrySummaryQuery.data?.honour_roll_count || 0),
    honourRoll.length
  );

  const activeEnrollment = Math.max(
    Number(registrySummaryQuery.data?.active_enrollment || 0),
    Number(registrySummaryQuery.data?.student_profiles || 0),
    studentRosterQuery.data?.count ?? 0,
    studentRoster.length,
    studentUserRosterQuery.data?.count ?? 0,
    studentUserRoster.length
  );
  const linkedParents = useMemo(
    () =>
      Math.max(
        Number(registrySummaryQuery.data?.students_linked || 0),
        studentRoster.filter((student: any) => (student.parent_count ?? 0) > 0).length
      ),
    [registrySummaryQuery.data?.students_linked, studentRoster]
  );
  const registeredParents = Math.max(
    Number(registrySummaryQuery.data?.parent_accounts || 0),
    parentRosterQuery.data?.count ?? 0,
    parentRoster.length
  );
  const parentChildrenMap = useMemo(() => {
    const links = new Map<string, Student[]>();
    for (const student of studentRoster) {
      for (const parentLink of student.parent_links ?? []) {
        const current = links.get(parentLink.parent) ?? [];
        current.push(student);
        links.set(parentLink.parent, current);
      }
    }
    return links;
  }, [studentRoster]);
  const linkedParentAccounts = useMemo(
    () => parentRoster.filter((parent) => (parentChildrenMap.get(parent.id) ?? []).length > 0).length,
    [parentChildrenMap, parentRoster]
  );
  const admissionGuardianOptions = useMemo(() => {
    const query = guardianSearchTerm.trim().toLowerCase();
    const source = parentRoster.slice(0, 500);
    if (!query) return source.slice(0, 8);
    return source
      .filter((parent) =>
        [
          parent.name,
          parent.email,
          parent.phone,
          parent.whatsapp,
          parent.matricule,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query)
      )
      .slice(0, 12);
  }, [guardianSearchTerm, parentRoster]);
  const unlinkedParentAccounts = Math.max(registeredParents - linkedParentAccounts, 0);
  const studentRosterMap = useMemo(
    () => new Map(studentRoster.map((student) => [student.id, student])),
    [studentRoster]
  );
  const studentRosterByUserId = useMemo(
    () =>
      new Map(
        studentRoster
          .filter((student) => student.user?.id)
          .map((student) => [student.user.id, student] as const)
      ),
    [studentRoster]
  );
  const registryCards = useMemo<RegistryStudentCard[]>(() => {
    const cards: RegistryStudentCard[] = students.map((student) => ({
      key: student.id,
      id: student.id,
      profileId: student.id,
      user: student.user,
      admissionNumber: student.admission_number,
      admission_number: student.admission_number,
      studentClass: student.student_class,
      student_class: student.student_class,
      schoolClassName: student.school_class_name,
      school_class_name: student.school_class_name,
      schoolClassId: student.school_class_id,
      school_class_id: student.school_class_id,
      subSchoolName: student.sub_school_name,
      sub_school_name: student.sub_school_name,
      classLevel: student.class_level,
      class_level: student.class_level,
      section: student.section,
      guardianName: student.guardian_name,
      guardian_name: student.guardian_name,
      guardianPhone: student.guardian_phone,
      guardian_phone: student.guardian_phone,
      guardianWhatsapp: student.guardian_whatsapp,
      guardian_whatsapp: student.guardian_whatsapp,
      admissionDate: student.admission_date,
      admission_date: student.admission_date,
      parentCount: (student.parent_count ?? student.parent_links?.length ?? 0) as number,
      parent_count: (student.parent_count ?? student.parent_links?.length ?? 0) as number,
      parentLinks: student.parent_links,
      parent_links: student.parent_links,
      hasProfile: true,
      profile: student,
    }));

    for (const studentUser of studentUsers) {
      if (studentRosterByUserId.has(studentUser.id)) {
        continue;
      }

      cards.push({
        key: `user-${studentUser.id}`,
        id: studentUser.id,
        user: studentUser,
        admissionNumber: studentUser.matricule || "Pending profile",
        admission_number: studentUser.matricule || "Pending profile",
        studentClass: studentUser.student_class || "Awaiting class placement",
        student_class: studentUser.student_class || "Awaiting class placement",
        schoolClassName: studentUser.student_class || "Awaiting class placement",
        school_class_name: studentUser.student_class || "Awaiting class placement",
        schoolClassId: null,
        school_class_id: null,
        subSchoolName: "",
        sub_school_name: "",
        classLevel: "Profile pending",
        class_level: "Profile pending",
        section: "Profile pending",
        guardianName: "",
        guardian_name: "",
        guardianPhone: "",
        guardian_phone: "",
        guardianWhatsapp: "",
        guardian_whatsapp: "",
        admissionDate: "",
        admission_date: "",
        parentCount: 0,
        parent_count: 0,
        parentLinks: [],
        parent_links: [],
        hasProfile: false,
      });
    }

    return cards;
  }, [studentUsers, studentRosterByUserId, students]);
  const filteredAdminClassOptions = useMemo(() => {
    const selectedSubSchool = adminSubSchoolFilter === "all" ? "" : adminSubSchoolFilter;
    const options = new Map<string, { id: string; name: string; subSchoolName?: string }>();

    hierarchyClasses
      .filter((schoolClass) => !selectedSubSchool || getHierarchyClassSubSchoolId(schoolClass) === selectedSubSchool)
      .forEach((schoolClass) => {
        options.set(schoolClass.id, {
          id: schoolClass.id,
          name: schoolClass.name,
          subSchoolName: schoolClass.sub_school_name || subSchools.find((subSchool) => subSchool.id === getHierarchyClassSubSchoolId(schoolClass))?.name,
        });
      });

    registryCards.forEach((student) => {
      const id = student.schoolClassId ? String(student.schoolClassId) : "";
      const name = registryClassLabel(student);
      if (!id || options.has(id) || name === "Awaiting class placement") return;
      if (selectedSubSchool) {
        const selectedSubSchoolName = subSchools.find((subSchool) => subSchool.id === selectedSubSchool)?.name || "";
        if (selectedSubSchoolName && student.subSchoolName !== selectedSubSchoolName) return;
      }
      options.set(id, { id, name, subSchoolName: student.subSchoolName });
    });

    return Array.from(options.values()).sort((left, right) => left.name.localeCompare(right.name));
  }, [adminSubSchoolFilter, hierarchyClasses, registryCards, subSchools]);
  const filteredRegistryCards = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const selectedSubSchoolName = subSchools.find((subSchool) => subSchool.id === adminSubSchoolFilter)?.name || "";
    const selectedClass = filteredAdminClassOptions.find((schoolClass) => schoolClass.id === adminClassFilter);

    return registryCards.filter((student) => {
      const haystack = [
        registryStudentName(student),
        student.user?.email,
        student.user?.matricule,
        student.admissionNumber,
        registryClassLabel(student),
        registrySubSchoolLabel(student),
        student.guardianName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchesSearch = !query || haystack.includes(query);
      const matchesSubSchool =
        adminSubSchoolFilter === "all" ||
        student.subSchoolName === selectedSubSchoolName ||
        hierarchyClasses.some(
          (schoolClass) =>
            String(schoolClass.id) === String(student.schoolClassId || "") &&
            getHierarchyClassSubSchoolId(schoolClass) === adminSubSchoolFilter
        );
      const matchesClass =
        adminClassFilter === "all" ||
        String(student.schoolClassId || "") === adminClassFilter ||
        (selectedClass ? registryClassLabel(student) === selectedClass.name : false);

      return matchesSearch && matchesSubSchool && matchesClass;
    });
  }, [adminClassFilter, adminSubSchoolFilter, filteredAdminClassOptions, hierarchyClasses, registryCards, searchTerm, subSchools]);
  // Paginate the user tables/grids at 20 records per page.
  const registryPager = usePagination(filteredRegistryCards, 20);
  const parentsPager = usePagination(parents, 20);
  const registryLoading = studentsQuery.isLoading || studentUsersQuery.isLoading;
  const registryError =
    studentsQuery.error
      ? queryErrorMessage(studentsQuery.error)
      : studentUsersQuery.error
        ? queryErrorMessage(studentUsersQuery.error)
        : "";
  const parentRegistryLoading =
    parentsQuery.isLoading || parentRosterQuery.isLoading || (studentRosterQuery.isLoading && studentUserRosterQuery.isLoading);
  const teacherClassOptions = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; subSchoolName?: string | null }>();
    teacherClassSubjectLinks.forEach((link) => {
      if (!link.school_class || !link.class_name) return;
      byId.set(String(link.school_class), {
        id: String(link.school_class),
        name: link.class_name,
        subSchoolName: link.sub_school?.name || null,
      });
    });
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [teacherClassSubjectLinks]);
  const teacherSubjectOptions = useMemo(() => {
    const byId = new Map<string, { id: string; name: string }>();
    teacherClassSubjectLinks.forEach((link) => {
      if (!link.subject || !link.subject_name) return;
      byId.set(String(link.subject), { id: String(link.subject), name: link.subject_name });
    });
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [teacherClassSubjectLinks]);
  const teacherStudentRows = useMemo(() => {
    const allowedClassIds = new Set(
      teacherClassSubjectLinks
        .filter((link) => teacherSubjectFilter === "all" || String(link.subject) === teacherSubjectFilter)
        .map((link) => String(link.school_class))
    );
    return registryCards.filter((student) => {
      const classId = student.schoolClassId ? String(student.schoolClassId) : "";
      const className = student.schoolClassName || student.studentClass;
      const classAllowed = classId ? allowedClassIds.has(classId) : teacherClassOptions.some((item) => item.name === className);
      const matchesClass = teacherClassFilter === "all" || classId === teacherClassFilter || className === teacherClassOptions.find((item) => item.id === teacherClassFilter)?.name;
      return classAllowed && matchesClass;
    });
  }, [registryCards, teacherClassFilter, teacherClassOptions, teacherClassSubjectLinks, teacherSubjectFilter]);
  const teacherSubjectsForStudent = (student: RegistryStudentCard) => {
    const classId = student.schoolClassId ? String(student.schoolClassId) : "";
    const className = student.schoolClassName || student.studentClass;
    const names = teacherClassSubjectLinks
      .filter((link) => String(link.school_class) === classId || link.class_name === className)
      .filter((link) => teacherSubjectFilter === "all" || String(link.subject) === teacherSubjectFilter)
      .map((link) => link.subject_name || "Subject");
    return Array.from(new Set(names));
  };

  const resetAdmissionOptionalFields = () => {
    setShowOptionalAdmissionFields(false);
  };

  const closeAdmissionDialog = () => {
    setIsAdmissionOpen(false);
    resetAdmissionOptionalFields();
  };

  const openOptionalAdmissionFields = () => {
    setShowOptionalAdmissionFields((current) => !current);
  };
  

  useEffect(() => {
    if (editingStudent) {
      setEditPhotoPreview("");
setEditData({
        name: editingStudent.user?.name ?? "",
        email: editingStudent.user?.email ?? "",
        phone: editingStudent.user?.phone ?? "",
        whatsapp: editingStudent.user?.whatsapp ?? "",
        school_class: editingStudent.school_class_id ?? null,
        student_class: editingStudent.student_class ?? "",
        class_level: editingStudent.class_level ?? "Form 1",
        section: editingStudent.section ?? "General",
        date_of_birth: editingStudent.date_of_birth ?? "",
        gender: (editingStudent.gender?.toLowerCase?.() as "male" | "female" | "other") ?? "male",
        guardian_name: editingStudent.guardian_name ?? "",
        guardian_phone: editingStudent.guardian_phone ?? "",
        guardian_whatsapp: (editingStudent as any).guardian_whatsapp ?? "",
      });
    }
  }, [editingStudent]);

  const handleChange = (field: keyof CreateStudentRequest, value: string | boolean) => {
    setFormData((current) => ({ ...current, [field]: value }));
  };

  const selectAdmissionGuardian = (parent: User) => {
    setSelectedAdmissionGuardian(parent);
    setGuardianSearchTerm(parent.name || parent.email || "");
    setFormData((current) => ({
      ...current,
      guardian_name: parent.name || current.guardian_name,
      guardian_phone: parent.phone || current.guardian_phone,
      guardian_whatsapp: parent.whatsapp || current.guardian_whatsapp,
      parent_name: parent.name || current.parent_name,
      parent_email: parent.email || current.parent_email,
      parent_phone: parent.phone || current.parent_phone,
      parent_whatsapp: parent.whatsapp || current.parent_whatsapp,
      parent_relationship: normalizeGuardianRelationship(current.parent_relationship),
      create_parent_account: false,
    }));
  };

  const clearAdmissionGuardian = () => {
    setSelectedAdmissionGuardian(null);
    setGuardianSearchTerm("");
  };

  const handleCreateClassSelection = (value: string) => {
    const selectedClass = hierarchyClasses.find((schoolClass) => schoolClass.id === value);
    setFormData((current) => ({
      ...current,
      school_class: value || null,
      student_class: selectedClass?.name || current.student_class,
    }));
  };

  const handleBulkClassSelection = (value: string) => {
    const selectedClass = hierarchyClasses.find((schoolClass) => schoolClass.id === value);
    setBulkData((current) => ({
      ...current,
      sub_school: selectedClass?.sub_school || current.sub_school,
      school_class: value,
      student_class: selectedClass?.name || current.student_class,
    }));
  };

  const handleBulkSubSchoolSelection = (value: string) => {
    setBulkData((current) => ({
      ...current,
      sub_school: value,
      school_class: "",
      student_class: "",
    }));
  };

  const handleEditClassSelection = (value: string) => {
    const selectedClass = hierarchyClasses.find((schoolClass) => schoolClass.id === value);
    setEditData((current) => ({
      ...current,
      school_class: value || null,
      student_class: selectedClass?.name || (current.student_class as string) || "",
    }));
  };

  const resetAdmissionForm = () => {
    setFormData({
      ...emptyForm,
      admission_date: "",
    });
    clearAdmissionGuardian();
    resetAdmissionOptionalFields();
  };

  const resetParentLinkForm = (student?: Student | null) => {
    setLinkParentData({
      ...emptyParentLinkForm,
      relationship: "legal_guardian",
      parent_name: student?.guardian_name || "",
      parent_phone: student?.guardian_phone || "",
      parent_whatsapp: student?.guardian_whatsapp || "",
      is_primary: (student?.parent_count ?? 0) === 0,
    });
  };

  const resetParentCreateForm = () => {
    setParentFormData(emptyParentCreateForm);
    setSelectedParentStudentIds([]);
    setParentStudentSearchTerm("");
  };

  const resetExistingParentLinkForm = () => {
    setExistingParentLinkData({
      relationship: "legal_guardian",
      is_primary: false,
    });
    setSelectedExistingParentStudentIds([]);
    setExistingParentStudentSearchTerm("");
  };

  const openAdmissionDialog = () => {
    if (!canManageStudentAdmissions) {
      toast({
        variant: "destructive",
        title: "Permission required",
        description: "Only the school admin and sub-admin can register students.",
      });
      return;
    }
    resetAdmissionForm();
    setIsAdmissionOpen(true);
  };

  const openParentDialog = () => {
    if (!canManageStudentAdmissions) {
      toast({
        variant: "destructive",
        title: "Permission required",
        description: "Only the school admin and sub-admin can create parent accounts from this registry.",
      });
      return;
    }
    resetParentCreateForm();
    setIsParentDialogOpen(true);
  };

  const openExistingParentLinkDialog = (parent: User) => {
    if (!canManageStudentAdmissions) {
      toast({
        variant: "destructive",
        title: "Permission required",
        description: "Only the school admin and sub-admin can link parents to students.",
      });
      return;
    }
    setLinkingParent(parent);
    resetExistingParentLinkForm();
  };

  const toggleNewParentStudentSelection = (studentId: string) => {
    setSelectedParentStudentIds((current) =>
      current.includes(studentId)
        ? current.filter((id) => id !== studentId)
        : [...current, studentId]
    );
  };

  const toggleExistingParentStudentSelection = (studentId: string) => {
    setSelectedExistingParentStudentIds((current) =>
      current.includes(studentId)
        ? current.filter((id) => id !== studentId)
        : [...current, studentId]
    );
  };

  const isStudentLinkedToParent = (student: Student, parentId: string) =>
    (student.parent_links ?? []).some((link) => link.parent === parentId);

  const schoolStudentsForParentSearch = useMemo(() => {
    const query = parentStudentSearchTerm.trim().toLowerCase();
    if (!query) return studentRoster;
    return studentRoster.filter((student) => {
      const haystack = [
        student.user?.name,
        student.user?.matricule,
        student.user?.email,
        student.student_class,
        student.admission_number,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [parentStudentSearchTerm, studentRoster]);

  const schoolStudentsForExistingParentSearch = useMemo(() => {
    const query = existingParentStudentSearchTerm.trim().toLowerCase();
    const source = studentRoster.filter(
      (student) => !linkingParent || !isStudentLinkedToParent(student, linkingParent.id)
    );
    if (!query) return source;
    return source.filter((student) => {
      const haystack = [
        student.user?.name,
        student.user?.matricule,
        student.user?.email,
        student.student_class,
        student.admission_number,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [existingParentStudentSearchTerm, linkingParent, studentRoster]);

  const filteredBulkHierarchyClasses = useMemo(() => {
    if (!bulkData.sub_school) {
      return hierarchyClasses;
    }
    return hierarchyClasses.filter((schoolClass) => getHierarchyClassSubSchoolId(schoolClass) === bulkData.sub_school);
  }, [bulkData.sub_school, hierarchyClasses]);

  const openLinkParentDialog = (student: Student) => {
    if (!canManageStudentAdmissions) {
      toast({
        variant: "destructive",
        title: "Permission required",
        description: "Only the school admin and sub-admin can link parents to students.",
      });
      return;
    }
    setLinkingStudent(student);
    resetParentLinkForm(student);
  };

  const handleSubmitAdmission = async () => {
    if (!canManageStudentAdmissions) {
      toast({
        variant: "destructive",
        title: "Permission required",
        description: "Only the school admin and sub-admin can register students.",
      });
      return;
    }
    if (
      !formData.name.trim() ||
      !(formData.school_class || formData.student_class.trim())
    ) {
      toast({
        variant: "destructive",
        title: "Incomplete registration",
        description: "Student name and class are the minimum required details for first admission.",
      });
      return;
    }

    try {
      if (!currentSchoolId) {
        toast({
          variant: "destructive",
          title: "School unavailable",
          description: "Your account is not linked to a school, so this student cannot be registered.",
        });
        return;
      }

      const created = await createStudentMutation.mutateAsync(buildAdmissionPayload(formData, currentSchoolId));

      if ((created as any)?.id && selectedAdmissionGuardian?.id && currentSchoolId) {
        setIsLinkingAdmissionGuardian(true);
        try {
          await studentsService.addStudentGuardian(currentSchoolId, (created as any).id, {
            user_id: selectedAdmissionGuardian.id,
            relationship: normalizeGuardianRelationship(formData.parent_relationship),
            is_primary: true,
            can_pickup: true,
            emergency_contact: true,
          });
        } catch (linkError: any) {
          toast({
            variant: "destructive",
            title: "Guardian link needs attention",
            description:
              linkError?.response?.data?.detail ||
              linkError?.response?.data?.parent_user_id ||
              "The student was registered, but the selected guardian could not be linked automatically.",
          });
        } finally {
          setIsLinkingAdmissionGuardian(false);
        }
      }

      if ((created as any)?.id) {
        await downloadAdmissionForm((created as any).id, (created as any)?.user?.name || formData.name || "student");
      }

      setCreatedResult({
        ...(created as any),
        student_matricule: (created as any)?.student_matricule,
        parent_matricule: (created as any)?.parent_matricule,
      });
      setIsAdmissionOpen(false);
      resetAdmissionForm();
      toast({
        title: "Student registered",
        description: "The student profile, school linkage, and optional parent account were created successfully.",
      });
    } catch (error: any) {
      const responseData = error?.response?.data;
      const firstError =
        responseData?.detail ||
        responseData?.name?.[0] ||
        responseData?.email?.[0] ||
        responseData?.admission_number?.[0] ||
        responseData?.parent_email?.[0] ||
        responseData?.school_class?.[0] ||
        responseData?.student_class?.[0] ||
        responseData?.school?.[0] ||
        responseData?.non_field_errors?.[0] ||
        (typeof responseData === "string" ? responseData : null) ||
        "The student registration could not be completed. Please check all fields and try again.";
      toast({
        variant: "destructive",
        title: "Registration failed",
        description: firstError,
      });
    }
  };

  const downloadAdmissionForm = async (studentId: string, studentName: string) => {
    try {
      const blob = await studentsService.downloadAdmissionForm(studentId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${studentName.replace(/\s+/g, "_").toLowerCase()}_admission.html`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Revoke after a delay: on the native app a download bridge intercepts the
      // click and reads the blob URL asynchronously, so revoking it synchronously
      // here would kill the URL before it is read ("Failed to fetch").
      window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Download failed",
        description: "We could not generate the admission document right now.",
      });
    }
  };

  // Build a well-styled, branded PDF activation sheet from the generated
  // matricules (never an HTML dump).
  const downloadActivationPdf = (students: any[], className: string) => {
    const rows = (students || []).filter(Boolean);
    if (rows.length === 0) {
      toast({
        variant: "destructive",
        title: "Nothing to download",
        description: "No generated matricules were found for this batch.",
      });
      return;
    }
    generateBrandedTablePdf({
      title: "Official Student Activation Record",
      school: user?.school,
      schoolName: user?.school?.name || "EduIgnite",
      chips: [
        { label: "Class", value: className || bulkData.student_class || "All Classes" },
        { label: "Matricules Issued", value: rows.length },
      ],
      issuingOffice: "Registry & Examination Office",
      monoColumns: [1],
      columns: ["No", "Matricule", "Class", "Level", "Section"],
      rows: rows.map((student, index) => [
        index + 1,
        student.matricule || "",
        student.student_class || className || "",
        formatHierarchyValue(student.class_level) || "",
        student.section || "",
      ]),
      fileName: `${(className || "student_activation_sheet").replace(/\s+/g, "_").toLowerCase()}_matricules`,
    });
  };

  // Download the current student registry (respecting the active search and
  // sub-school/class filters) as a branded PDF. On the mobile build this saves
  // straight into the eduignite Documents folder; on web/desktop it downloads.
  const downloadStudentsList = () => {
    const rows = filteredRegistryCards;
    if (rows.length === 0) {
      toast({
        variant: "destructive",
        title: "Nothing to download",
        description: "There are no students in the current view to export.",
      });
      return;
    }
    const classFilterName =
      filteredAdminClassOptions.find((schoolClass) => schoolClass.id === adminClassFilter)?.name || "All Classes";
    generateBrandedTablePdf({
      title: "Official Student Roster & Registration Record",
      school: user?.school,
      schoolName: user?.school?.name || "EduIgnite",
      chips: [
        { label: "Class Filter", value: classFilterName },
        { label: "Total Enrolled", value: `${rows.length} Student${rows.length === 1 ? "" : "s"}` },
      ],
      issuingOffice: "Registry & Examination Office",
      monoColumns: [2, 3],
      columns: ["No", "Name", "Matricule", "Admission No", "Class", "Section", "Guardian", "Guardian Phone"],
      rows: rows.map((student, index) => [
        index + 1,
        registryStudentName(student),
        student.user?.matricule || "",
        student.admissionNumber || "",
        registryClassLabel(student),
        registrySubSchoolLabel(student),
        student.guardianName || "",
        student.guardianPhone || "",
      ]),
      fileName: `${((user?.school as any)?.short_name || user?.school?.name || "student").toString().replace(/\s+/g, "_").toLowerCase()}_student_list`,
    });
    toast({ title: "Student list ready", description: "The student list PDF has been generated." });
  };

  // Turn any backend/network failure into a clear, plain-text reason the admin
  // can act on — never a raw HTML error page.
  const plainErrorMessage = (error: any, fallback: string): string => {
    const data = error?.response?.data;
    if (typeof data === "string") {
      const text = data.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      return text ? text.slice(0, 400) : fallback;
    }
    if (data && typeof data === "object") {
      const fromRows = data.failed_rows?.[0]?.reason;
      const nonField = Array.isArray(data.non_field_errors) ? data.non_field_errors.join(" ") : "";
      const firstField = (() => {
        for (const [key, value] of Object.entries(data)) {
          if (["detail", "reason", "failed_rows", "non_field_errors"].includes(key)) continue;
          if (Array.isArray(value) && value.length) return `${key}: ${value.join(" ")}`;
          if (typeof value === "string") return `${key}: ${value}`;
        }
        return "";
      })();
      return (
        data.detail ||
        data.reason ||
        fromRows ||
        nonField ||
        firstField ||
        error?.message ||
        fallback
      );
    }
    return error?.message || fallback;
  };

  const handleBulkUpload = async () => {
    if (!canManageStudentAdmissions) {
      toast({
        variant: "destructive",
        title: "Permission required",
        description: "Only the school admin and sub-admin can bulk register students.",
      });
      return;
    }
    if (!currentSchoolId) {
      toast({
        variant: "destructive",
        title: "School unavailable",
        description: "Your account is not linked to a school, so the import cannot continue.",
      });
      return;
    }
    if (subSchools.length > 0 && !bulkData.sub_school) {
      toast({
        variant: "destructive",
        title: "Sub-school required",
        description: "Select the sub-school first so the matricules stay linked to the right branch of the school hierarchy.",
      });
      return;
    }
    if (!(bulkData.school_class || bulkData.student_class.trim()) || !bulkData.generation_count || bulkData.generation_count < 1) {
      toast({
        variant: "destructive",
        title: "Matricule generation incomplete",
        description: "Provide the target class and the number of matricules to generate.",
      });
      return;
    }

    if (bulkGenerated && !bulkData.file) {
      toast({
        variant: "destructive",
        title: "Already generated",
        description: "This batch has already been generated. Enter a new number of matricules to generate again.",
      });
      return;
    }

    setIsBulkSubmitting(true);
    try {
      const result = await studentsService.bulkUploadStudents({
        ...bulkData,
        school_id: currentSchoolId,
      });
      setBulkResult(result);
      const generated = result.generated_students || [];
      if (generated.length > 0) {
        downloadActivationPdf(generated, bulkData.student_class);
      }
      // Lock the form so a second click cannot generate another batch; the
      // admin must re-enter the count to generate again.
      setBulkGenerated(true);
      setBulkData((current) => ({ ...current, generation_count: 0, file: undefined }));
      toast({
        title: "Matricules generated",
        description: result.detail || `${result.created_count || 0} matricules were generated for ${bulkData.student_class}.`,
      });
    } catch (error: any) {
      const responseData = error?.response?.data;
      setBulkResult(responseData && typeof responseData === "object" ? responseData : null);
      toast({
        variant: "destructive",
        title: "Generation failed",
        description: plainErrorMessage(error, "We could not generate the class matricules. Please review the form and try again."),
      });
    } finally {
      setIsBulkSubmitting(false);
    }
  };

  const handleUploadStudentPhoto = async (file: File | undefined | null) => {
    if (!file || !editingStudent) return;
    setUploadingPhoto(true);
    try {
      const result = await studentsService.uploadStudentPhoto(String(editingStudent.id), file);
      setEditPhotoPreview(result.avatar || "");
      toast({ title: "Photo updated", description: "The student's profile picture was uploaded successfully." });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Photo upload failed",
        description: error?.response?.data?.detail || "The photo could not be uploaded. Use a clear image under 6MB.",
      });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!canManageStudentAdmissions) {
      toast({
        variant: "destructive",
        title: "Permission required",
        description: "Only the school admin and sub-admin can edit learner records.",
      });
      return;
    }
    if (!editingStudent) return;

    try {
      await updateStudentMutation.mutateAsync({
        id: editingStudent.id,
        data: editData,
      });
      toast({
        title: "Student updated",
        description: "The learner record was updated successfully.",
      });
      setEditingStudent(null);
      setEditData({});
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: plainErrorMessage(error, "We could not save the learner changes."),
      });
    }
  };

  const handleLinkParent = async () => {
    if (!canManageStudentAdmissions) {
      toast({
        variant: "destructive",
        title: "Permission required",
        description: "Only the school admin and sub-admin can link parents to students.",
      });
      return;
    }
    if (!linkingStudent) return;
    if (!linkParentData.relationship || !linkParentData.parent_name?.trim()) {
      toast({
        variant: "destructive",
        title: "Parent details incomplete",
        description: "Parent name and relationship are required before we can create or link the account.",
      });
      return;
    }

    try {
      const response = await linkParentMutation.mutateAsync({
        studentId: linkingStudent.id,
        data: {
          ...linkParentData,
          relationship: normalizeGuardianRelationship(linkParentData.relationship),
        },
      });
      toast({
        title: response?.parent_created ? "Parent account created" : "Parent linked",
        description: response?.parent_matricule
          ? `Parent matricule: ${response.parent_matricule}. The child relationship is now active in the platform.`
          : "The parent-child relationship is now active in the platform.",
      });
      setLinkingStudent(null);
      resetParentLinkForm(null);
    } catch (error: any) {
      const responseData = error?.response?.data;
      const firstError =
        responseData?.parent_name?.[0] ||
        responseData?.parent_email?.[0] ||
        responseData?.parent_phone?.[0] ||
        responseData?.parent_whatsapp?.[0] ||
        responseData?.relationship?.[0] ||
        responseData?.error ||
        responseData?.detail ||
        "The parent account could not be linked right now.";
      toast({
        variant: "destructive",
        title: "Parent linking failed",
        description: firstError,
      });
    }
  };

  const linkParentAcrossStudents = async ({
    parentId,
    studentIds,
    relationship,
    isPrimary,
  }: {
    parentId: string;
    studentIds: string[];
    relationship: string;
    isPrimary: boolean;
  }) => {
    const outcomes = await Promise.allSettled(
      studentIds.map((studentId, index) =>
        linkParentMutation.mutateAsync({
          studentId,
          data: {
            parentId,
            relationship: normalizeGuardianRelationship(relationship),
            is_primary: index === 0 ? isPrimary : false,
          },
        })
      )
    );

    const linkedStudentNames: string[] = [];
    const failedStudentNames: string[] = [];

    outcomes.forEach((outcome, index) => {
      const studentName = studentRosterMap.get(studentIds[index])?.user?.name || "Student";
      if (outcome.status === "fulfilled") {
        linkedStudentNames.push(studentName);
      } else {
        failedStudentNames.push(studentName);
      }
    });

    return {
      linkedStudentNames,
      failedStudentNames,
    };
  };

  const handleCreateParentAccount = async () => {
    if (!canManageStudentAdmissions) {
      toast({
        variant: "destructive",
        title: "Permission required",
        description: "Only the school admin and sub-admin can create parent accounts from this registry.",
      });
      return;
    }
    if (!parentFormData.name.trim()) {
      toast({
        variant: "destructive",
        title: "Parent details incomplete",
        description: "Parent name is required before the account can be created.",
      });
      return;
    }

    if (!currentSchoolId) {
      toast({
        variant: "destructive",
        title: "School not found",
        description: "Your account must be linked to a school before parent accounts can be created.",
      });
      return;
    }

    setIsParentWorkflowRunning(true);
    try {
      const createdParent = await createUserMutation.mutateAsync({
        name: parentFormData.name.trim(),
        email: parentFormData.email?.trim() || undefined,
        phone: parentFormData.phone?.trim() || undefined,
        whatsapp: parentFormData.whatsapp?.trim() || undefined,
        role: "PARENT",
        school: currentSchoolId,
        school_id: currentSchoolId,
      });

      let linkedStudentNames: string[] = [];
      let failedStudentNames: string[] = [];

      if (selectedParentStudentIds.length > 0) {
        const linkOutcome = await linkParentAcrossStudents({
          parentId: createdParent.id,
          studentIds: selectedParentStudentIds,
          relationship: normalizeGuardianRelationship(parentFormData.relationship),
          isPrimary: parentFormData.is_primary,
        });
        linkedStudentNames = linkOutcome.linkedStudentNames;
        failedStudentNames = linkOutcome.failedStudentNames;
      }

      setCreatedParentResult({
        id: createdParent.id,
        name: createdParent.name,
        matricule: createdParent.matricule,
        linkedStudentNames,
        failedStudentNames,
      });
      setIsParentDialogOpen(false);
      resetParentCreateForm();

      const description =
        linkedStudentNames.length > 0
          ? `Parent account created and linked to ${linkedStudentNames.length} student${linkedStudentNames.length > 1 ? "s" : ""}.`
          : "The parent account was created and is ready to be linked to students.";

      toast({
        title: "Parent account created",
        description,
      });
    } catch (error: any) {
      const responseData = error?.response?.data;
      const firstError =
        responseData?.name?.[0] ||
        responseData?.email?.[0] ||
        responseData?.phone?.[0] ||
        responseData?.whatsapp?.[0] ||
        responseData?.role?.[0] ||
        responseData?.school?.[0] ||
        responseData?.detail ||
        "The parent account could not be created right now.";
      toast({
        variant: "destructive",
        title: "Parent creation failed",
        description: firstError,
      });
    } finally {
      setIsParentWorkflowRunning(false);
    }
  };

  const handleLinkExistingParent = async () => {
    if (!canManageStudentAdmissions) {
      toast({
        variant: "destructive",
        title: "Permission required",
        description: "Only the school admin and sub-admin can link parents to students.",
      });
      return;
    }
    if (!linkingParent) return;
    if (!selectedExistingParentStudentIds.length) {
      toast({
        variant: "destructive",
        title: "No student selected",
        description: "Select at least one student from this school before saving the parent relationship.",
      });
      return;
    }

    setIsParentWorkflowRunning(true);
    try {
      const { linkedStudentNames, failedStudentNames } = await linkParentAcrossStudents({
        parentId: linkingParent.id,
        studentIds: selectedExistingParentStudentIds,
        relationship: normalizeGuardianRelationship(existingParentLinkData.relationship),
        isPrimary: !!existingParentLinkData.is_primary,
      });

      setLinkingParent(null);
      resetExistingParentLinkForm();

      const successCount = linkedStudentNames.length;
      const failureCount = failedStudentNames.length;
      toast({
        title: successCount > 0 ? "Parent linked to students" : "Parent linking incomplete",
        description:
          failureCount > 0
            ? `${successCount} linked, ${failureCount} failed. Review the selected students and try again for the remaining ones.`
            : `${linkingParent.name} is now linked to ${successCount} student${successCount > 1 ? "s" : ""}.`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Parent linking failed",
        description:
          error?.response?.data?.detail ||
          error?.response?.data?.error ||
          "The selected students could not be linked to this parent right now.",
      });
    } finally {
      setIsParentWorkflowRunning(false);
    }
  };

  if (user?.role === "TEACHER") {
    return (
      <div className="space-y-8 pb-20">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="flex items-center gap-3 text-3xl font-bold text-primary font-headline">
              <div className="rounded-xl bg-primary p-2 text-white shadow-lg">
                <Users className="h-6 w-6 text-secondary" />
              </div>
              My Students
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Confidential academic roster for the students in classes and subjects assigned to you.
            </p>
          </div>
          <Badge className="w-fit border-none bg-primary/10 px-4 py-2 font-black uppercase text-primary">
            {teacherStudentRows.length} visible students
          </Badge>
        </div>

        <Card className="border-none shadow-sm">
          <CardContent className="grid gap-4 p-5 lg:grid-cols-[2fr,1fr,1fr]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search students by name, matricule, admission number, or class..."
                className="h-12 rounded-xl pl-10"
              />
            </div>
            <Select value={teacherClassFilter} onValueChange={setTeacherClassFilter}>
              <SelectTrigger className="h-12 rounded-xl">
                <SelectValue placeholder="Filter by class" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All my classes</SelectItem>
                {teacherClassOptions.map((schoolClass) => (
                  <SelectItem key={schoolClass.id} value={schoolClass.id}>
                    {schoolClass.name}{schoolClass.subSchoolName ? ` (${schoolClass.subSchoolName})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={teacherSubjectFilter} onValueChange={setTeacherSubjectFilter}>
              <SelectTrigger className="h-12 rounded-xl">
                <SelectValue placeholder="Filter by subject" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All my subjects</SelectItem>
                {teacherSubjectOptions.map((subject) => (
                  <SelectItem key={subject.id} value={subject.id}>{subject.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-none shadow-xl">
          <CardHeader className="border-b bg-white">
            <CardTitle className="flex items-center gap-2 text-lg font-black uppercase text-primary">
              <BookOpen className="h-5 w-5 text-secondary" />
              Teaching Roster
            </CardTitle>
            <CardDescription>
              Parent contacts, private health notes, and finance records are intentionally hidden from teacher rosters.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-accent/10">
                  <TableRow>
                    <TableHead className="pl-6">Student</TableHead>
                    <TableHead>Matricule</TableHead>
                    <TableHead>Admission No.</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Sub-School</TableHead>
                    <TableHead>Subjects</TableHead>
                    <TableHead className="pr-6 text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {registryLoading || teacherClassSubjectsQuery.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center">
                        <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" />
                      </TableCell>
                    </TableRow>
                  ) : teacherStudentRows.length ? (
                    teacherStudentRows.map((student) => {
                      const subjectsForStudent = teacherSubjectsForStudent(student);
                      return (
                        <TableRow key={student.key}>
                          <TableCell className="pl-6">
                            <div className="flex items-center gap-3">
                              <Avatar className="h-9 w-9">
                                <AvatarImage src={student.user?.avatar || ""} />
                                <AvatarFallback className="bg-primary/5 text-xs font-black text-primary">
                                  {student.user?.name?.charAt(0) || "S"}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-bold text-primary">{student.user?.name || "Student"}</p>
                                <p className="text-[10px] font-bold uppercase text-muted-foreground">{student.section || student.classLevel}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{student.user?.matricule || "-"}</TableCell>
                          <TableCell className="font-mono text-xs">{student.admissionNumber || "-"}</TableCell>
                          <TableCell className="font-bold">{student.schoolClassName || student.studentClass}</TableCell>
                          <TableCell>{student.subSchoolName || "Main"}</TableCell>
                          <TableCell>
                            <div className="flex max-w-md flex-wrap gap-1.5">
                              {subjectsForStudent.length ? subjectsForStudent.map((subjectName) => (
                                <Badge key={subjectName} variant="outline" className="border-primary/10 text-[10px] font-bold text-primary">
                                  {subjectName}
                                </Badge>
                              )) : <span className="text-xs text-muted-foreground">Class master access</span>}
                            </div>
                          </TableCell>
                          <TableCell className="pr-6 text-right">
                            <Badge className="border-none bg-green-100 text-[10px] font-black uppercase text-green-700">
                              Active
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">
                        No students match your current class and subject filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold text-primary font-headline">
            <div className="rounded-xl bg-primary p-2 text-white shadow-lg">
              <Users className="h-6 w-6 text-secondary" />
            </div>
            Student Admissions
          </h1>
          <p className="mt-1 text-muted-foreground">
            Register learners, link guardians and parents, and keep a clean school-wide registry.
          </p>
        </div>
        {canManageStudentAdmissions ? (
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button variant="outline" className="h-14 gap-2 rounded-2xl px-6 font-black uppercase tracking-widest text-xs" onClick={downloadStudentsList}>
              <Download className="h-5 w-5" />
              Download Students
            </Button>
            <Button variant="outline" className="h-14 gap-2 rounded-2xl px-6 font-black uppercase tracking-widest text-xs" onClick={() => setIsBulkOpen(true)}>
              <FileText className="h-5 w-5" />
              Bulk Import (CSV)
            </Button>
            <Button className="h-14 gap-2 rounded-2xl px-8 font-black uppercase tracking-widest text-xs shadow-xl" onClick={openAdmissionDialog}>
              <Plus className="h-5 w-5" />
              Register Student
            </Button>
          </div>
        ) : (
          <div className="rounded-2xl border border-primary/10 bg-white px-5 py-4 text-sm font-semibold text-muted-foreground shadow-sm">
            Student registration is reserved for the school admin and sub-admin.
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Active Enrollment</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-primary">{activeEnrollment}</div>
            <p className="text-xs text-muted-foreground">Students currently linked to {user?.school?.name || "your school"}.</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Parent Accounts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-primary">{registeredParents}</div>
            <p className="text-xs text-muted-foreground">Parent logins currently registered inside {user?.school?.name || "your school"}.</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Students Linked</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-primary">{linkedParents}</div>
            <p className="text-xs text-muted-foreground">Students already tied to at least one parent account.</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Honour Roll</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-primary">{honourRollCount}</div>
            <p className="text-xs text-muted-foreground">Learners currently above the school honour-roll threshold.</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="registry" className="w-full">
        <TabsList className="grid h-auto w-full max-w-2xl grid-cols-3 rounded-3xl border bg-white p-1.5 shadow-sm">
          <TabsTrigger value="registry" className="rounded-2xl py-3 font-bold">
            Student Registry
          </TabsTrigger>
          <TabsTrigger value="parents" className="rounded-2xl py-3 font-bold">
            Parent Registry
          </TabsTrigger>
          <TabsTrigger value="honour-roll" className="rounded-2xl py-3 font-bold">
            Honour Roll
          </TabsTrigger>
        </TabsList>

        <TabsContent value="registry" className="mt-6 space-y-6">
          <Card className="border-none shadow-sm">
            <CardContent className="grid gap-3 p-4 lg:grid-cols-[2fr,1fr,1fr,auto]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search by name, email, matricule, admission number, guardian, or class..."
                  className="h-12 rounded-xl pl-10"
                />
              </div>
              <Select
                value={adminSubSchoolFilter}
                onValueChange={(value) => {
                  setAdminSubSchoolFilter(value);
                  setAdminClassFilter("all");
                }}
              >
                <SelectTrigger className="h-12 rounded-xl">
                  <SelectValue placeholder="Filter by sub-school" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sub-schools</SelectItem>
                  {subSchools.map((subSchool) => (
                    <SelectItem key={subSchool.id} value={subSchool.id}>{subSchool.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={adminClassFilter} onValueChange={setAdminClassFilter}>
                <SelectTrigger className="h-12 rounded-xl">
                  <SelectValue placeholder="Filter by class" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All classes</SelectItem>
                  {filteredAdminClassOptions.map((schoolClass) => (
                    <SelectItem key={schoolClass.id} value={schoolClass.id}>
                      {schoolClass.name}{schoolClass.subSchoolName ? ` (${schoolClass.subSchoolName})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                className="h-12 rounded-xl border-primary/10 font-bold text-primary"
                onClick={() => {
                  setSearchTerm("");
                  setAdminSubSchoolFilter("all");
                  setAdminClassFilter("all");
                }}
              >
                Clear
              </Button>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-none shadow-xl">
            <CardHeader className="border-b bg-white">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle className="text-lg font-black uppercase text-primary">School Student Registry</CardTitle>
                  <CardDescription>
                    Showing {filteredRegistryCards.length} of {registryCards.length} learner{registryCards.length === 1 ? "" : "s"} from the current school registry.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="w-fit border-primary/10 px-3 py-1 text-[10px] font-black uppercase text-primary">
                  Tabular view
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {registryLoading ? (
                <div className="flex h-40 items-center justify-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">Loading student registry...</span>
                </div>
              ) : registryError ? (
                <div className="flex min-h-40 flex-col items-center justify-center gap-3 p-8 text-center">
                  <div>
                    <p className="font-bold text-destructive">Unable to load student registry</p>
                    <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{registryError}</p>
                  </div>
                  <Button
                    variant="outline"
                    className="rounded-xl border-primary/10 font-bold text-primary"
                    onClick={() => {
                      void studentsQuery.refetch();
                      void studentUsersQuery.refetch();
                    }}
                  >
                    Retry Loading Students
                  </Button>
                </div>
              ) : filteredRegistryCards.length === 0 ? (
                <div className="flex h-40 flex-col items-center justify-center gap-3 text-center">
                  <UserPlus className="h-10 w-10 text-primary/30" />
                  <div>
                    <p className="font-bold text-primary">{registryCards.length ? "No students match these filters" : "No students found yet"}</p>
                    <p className="text-sm text-muted-foreground">
                      {registryCards.length
                        ? "Try another sub-school, class, or search term."
                        : canManageStudentAdmissions
                        ? "Use the registration flow to onboard your first learner."
                        : "Only the school admin or sub-admin can onboard the first learner."}
                    </p>
                  </div>
                </div>
              ) : (
                <Table className="min-w-[1120px]">
                  <TableHeader className="bg-primary">
                    <TableRow className="border-primary hover:bg-primary">
                      <TableHead className="pl-6 text-xs font-black uppercase tracking-widest text-white">Student</TableHead>
                      <TableHead className="text-xs font-black uppercase tracking-widest text-white">Matricule</TableHead>
                      <TableHead className="text-xs font-black uppercase tracking-widest text-white">Admission No.</TableHead>
                      <TableHead className="text-xs font-black uppercase tracking-widest text-white">Class</TableHead>
                      <TableHead className="text-xs font-black uppercase tracking-widest text-white">Sub-School</TableHead>
                      <TableHead className="text-xs font-black uppercase tracking-widest text-white">Guardian</TableHead>
                      <TableHead className="text-xs font-black uppercase tracking-widest text-white">Parents</TableHead>
                      <TableHead className="pr-6 text-right text-xs font-black uppercase tracking-widest text-white">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {registryPager.pageItems.map((student) => (
                      <TableRow key={student.key} className="odd:bg-accent/5">
                        <TableCell className="pl-6">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10 rounded-xl border border-primary/10">
                              <AvatarImage src={student.user?.avatar || ""} alt={registryStudentName(student)} />
                              <AvatarFallback className="bg-primary/10 text-xs font-black text-primary">
                                {registryStudentInitials(student)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="truncate font-black text-primary">{registryStudentName(student)}</p>
                              <p className="truncate text-xs text-muted-foreground">{student.user?.email || "No email recorded"}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs font-semibold text-slate-700">
                          {student.user?.matricule || "Pending"}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-slate-700">
                          {student.admissionNumber || "-"}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-bold text-primary">{registryClassLabel(student)}</p>
                            <p className="text-xs text-muted-foreground">{formatHierarchyValue(student.classLevel || student.section)}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-slate-700">{registrySubSchoolLabel(student)}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-semibold text-slate-800">{student.guardianName || "Not recorded"}</p>
                            <p className="text-xs text-muted-foreground">{student.guardianPhone || student.guardianWhatsapp || "No contact"}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {student.parentCount > 0 ? (
                            <Badge className="border-none bg-green-100 text-[10px] font-black uppercase text-green-700">
                              {student.parentCount} linked
                            </Badge>
                          ) : (
                            <Badge className="border-none bg-amber-100 text-[10px] font-black uppercase text-amber-700">
                              Not linked
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="pr-6 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-9 rounded-xl border-primary/10 font-bold text-primary"
                              onClick={() => setViewingStudent(student)}
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              View
                            </Button>
                            {canManageStudentAdmissions && student.user?.id ? (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-9 rounded-xl border-primary/10 font-bold text-primary"
                                  onClick={() => handleGeneratePassword(student)}
                                  title="Reset this student's password"
                                >
                                  <KeyRound className="mr-2 h-4 w-4" />
                                  Reset Password
                                </Button>
                                <UserModerationControls
                                  user={student.user}
                                  onChanged={() => { void studentsQuery.refetch(); }}
                                  compact
                                />
                              </>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <DataPagination pager={registryPager} label="students" />

          {/* The generated password, shown once. */}
          <Dialog
            open={Boolean(resettingFor)}
            onOpenChange={(open) => { if (!open) { setResettingFor(null); setIssuedPassword(null); } }}
          >
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-primary">
                  <KeyRound className="h-5 w-5" /> Reset Student Password
                </DialogTitle>
                <DialogDescription>
                  {issuedPassword
                    ? `${resettingFor?.user?.name || resettingFor?.name} signs in with this temporary password and must then choose their own.`
                    : `Reset the password for ${resettingFor?.user?.name || resettingFor?.name}? Their current password stops working immediately, and they must choose a new one when they next sign in.`}
                </DialogDescription>
              </DialogHeader>

              {isResettingPassword ? (
                <div className="flex items-center justify-center gap-3 py-10 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" /> Generating...
                </div>
              ) : issuedPassword ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 text-center">
                    <p className="font-mono text-2xl font-black tracking-wider text-primary">{issuedPassword}</p>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full gap-2 rounded-xl"
                    onClick={() => {
                      void navigator.clipboard?.writeText(issuedPassword);
                      toast({ title: "Copied", description: "The password is on your clipboard." });
                    }}
                  >
                    <Copy className="h-4 w-4" /> Copy password
                  </Button>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Give it to the student now — passwords are stored hashed, so this value cannot be
                    shown again. Resetting again replaces it.
                  </p>
                </div>
              ) : null}

              <DialogFooter>
                {issuedPassword ? (
                  <Button onClick={() => { setResettingFor(null); setIssuedPassword(null); }} className="gap-2">
                    <Check className="h-4 w-4" /> Done
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" disabled={isResettingPassword} onClick={() => setResettingFor(null)}>
                      Cancel
                    </Button>
                    <Button disabled={isResettingPassword} onClick={() => void confirmResetPassword()} className="gap-2">
                      <KeyRound className="h-4 w-4" /> Reset Password
                    </Button>
                  </>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
            </CardContent>
          </Card>

          {false && (
          <div className="grid gap-6 lg:grid-cols-2">
            {registryLoading ? (
              <Card className="border-none shadow-sm lg:col-span-2">
                <CardContent className="flex h-40 items-center justify-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">Loading student registry...</span>
                </CardContent>
              </Card>
            ) : registryCards.length === 0 ? (
              <Card className="border-none shadow-sm lg:col-span-2">
                <CardContent className="flex h-40 flex-col items-center justify-center gap-3 text-center">
                  <UserPlus className="h-10 w-10 text-primary/30" />
                  <div>
                    <p className="font-bold text-primary">No students found yet</p>
                    <p className="text-sm text-muted-foreground">
                      {canManageStudentAdmissions
                        ? "Use the registration flow to onboard your first learner."
                        : "Only the school admin or sub-admin can onboard the first learner."}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              registryCards.map((student) => (
                <Card key={student.key} className="overflow-hidden rounded-[2rem] border-none shadow-xl">
                  <CardHeader className="flex flex-row items-start gap-4 pb-4">
                    <Avatar className="h-16 w-16 rounded-2xl border-2 border-primary/10 shadow-lg">
                      <AvatarImage src={student.user?.avatar} alt={student.user?.name} />
                      <AvatarFallback className="bg-primary text-lg font-black text-white">
                        {(student.user?.name || "Student")
                          .split(" ")
                          .map((part) => part[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <CardTitle className="truncate text-lg font-black uppercase text-primary">
                        {student.user?.name}
                      </CardTitle>
                      <CardDescription className="mt-1 text-xs">
                        {student.user?.email || "No email"} · {student.admission_number}
                      </CardDescription>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge variant="outline" className="border-primary/10 text-[10px] font-bold uppercase text-primary">
                          {student.school_class_name || student.student_class}
                        </Badge>
                        <Badge className="bg-secondary/15 text-[10px] font-bold uppercase text-primary">
                          {formatHierarchyValue(student.class_level)}
                        </Badge>
                        {((student as any).parent_count ?? 0) > 0 ? (
                          <Badge className="bg-green-100 text-[10px] font-bold uppercase text-green-700">
                            {(student as any).parent_count} parent link
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-[10px] font-bold uppercase text-amber-700">
                            No parent linked yet
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 rounded-2xl bg-accent/10 p-4 text-sm md:grid-cols-2">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Guardian</p>
                        <p className="font-semibold text-primary">{student.guardian_name || "Not recorded yet"}</p>
                        <p className="text-xs text-muted-foreground">{student.guardian_phone || student.guardian_whatsapp || "No contact on file"}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Student Matricule</p>
                        <p className="font-semibold text-primary">{student.user?.matricule || "Pending"}</p>
                        <p className="text-xs text-muted-foreground">Admission date: {student.admission_date}</p>
                      </div>
                    </div>
                    {student.parent_links?.length ? (
                      <div className="rounded-2xl border border-primary/10 bg-white p-4">
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Linked Parents</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {student.parent_links.map((link) => (
                            <Badge key={link.id} variant="outline" className="border-primary/10 px-3 py-1 text-[10px] font-bold uppercase text-primary">
                              {link.parent_name} • {formatHierarchyValue(link.relationship)}{link.is_primary ? " • Primary" : ""}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-3">
                      {student.hasProfile && student.profile ? (
                        <>
                          {canManageStudentAdmissions ? (
                            <Button variant="outline" className="rounded-xl border-primary/10 font-bold text-primary" onClick={() => openLinkParentDialog(student.profile!)}>
                              <Link2 className="mr-2 h-4 w-4" />
                              Create / Link Parent
                            </Button>
                          ) : null}
                          <Button variant="outline" className="rounded-xl border-primary/10 font-bold text-primary" onClick={() => downloadAdmissionForm(student.profileId || student.id, student.user?.name || "student")}>
                            Download Admission Form
                          </Button>
                          {canManageStudentAdmissions ? (
                            <Button variant="outline" className="rounded-xl border-primary/10 font-bold text-primary" onClick={() => setEditingStudent(student.profile!)}>
                              Edit Learner
                            </Button>
                          ) : null}
                        </>
                      ) : (
                        <div className="rounded-xl border border-dashed border-primary/10 bg-accent/10 px-4 py-3 text-xs text-muted-foreground">
                          This student login is linked to the school, but its detailed learner profile is still pending.
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
          )}
        </TabsContent>

        <TabsContent value="parents" className="mt-6 space-y-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4 rounded-2xl border bg-white p-4 shadow-sm lg:flex-1">
              <Search className="ml-1 h-4 w-4 text-muted-foreground" />
              <Input
                value={parentSearchTerm}
                onChange={(event) => setParentSearchTerm(event.target.value)}
                placeholder="Search parents by name, email, phone, or matricule..."
                className="border-none bg-transparent focus-visible:ring-0"
              />
            </div>
            {canManageStudentAdmissions ? (
              <Button className="h-14 gap-2 rounded-2xl px-8 font-black uppercase tracking-widest text-xs shadow-xl" onClick={openParentDialog}>
                <UserPlus className="h-5 w-5" />
                Add Parent Account
              </Button>
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Card className="border-none shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Registered Parents</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-black text-primary">{registeredParents}</div>
                <p className="text-xs text-muted-foreground">Parent accounts available for the school admin to manage and link.</p>
              </CardContent>
            </Card>
            <Card className="border-none shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Linked Parents</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-black text-primary">{linkedParentAccounts}</div>
                <p className="text-xs text-muted-foreground">Parents already connected to at least one child in the student registry.</p>
              </CardContent>
            </Card>
            <Card className="border-none shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Unlinked Parents</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-black text-primary">{unlinkedParentAccounts}</div>
                <p className="text-xs text-muted-foreground">Parent accounts still waiting to be tied to one or more students.</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {parentRegistryLoading ? (
              <Card className="border-none shadow-sm lg:col-span-2">
                <CardContent className="flex h-40 items-center justify-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">Loading parent registry...</span>
                </CardContent>
              </Card>
            ) : parents.length === 0 ? (
              <Card className="border-none shadow-sm lg:col-span-2">
                <CardContent className="flex h-40 flex-col items-center justify-center gap-3 text-center">
                  <UserPlus className="h-10 w-10 text-primary/30" />
                  <div>
                    <p className="font-bold text-primary">No parent accounts found yet</p>
                    <p className="text-sm text-muted-foreground">Create a parent separately, then search the school students to link the family relationship in one flow.</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              parentsPager.pageItems.map((parent) => {
                const linkedChildren = parentChildrenMap.get(parent.id) ?? [];

                return (
                  <Card key={parent.id} className="overflow-hidden rounded-[2rem] border-none shadow-xl">
                    <CardHeader className="flex flex-row items-start gap-4 pb-4">
                      <Avatar className="h-16 w-16 rounded-2xl border-2 border-primary/10 shadow-lg">
                        <AvatarImage src={parent.avatar} alt={parent.name} />
                        <AvatarFallback className="bg-primary text-lg font-black text-white">
                          {(parent.name || "Parent")
                            .split(" ")
                            .map((part) => part[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <CardTitle className="truncate text-lg font-black uppercase text-primary">
                          {parent.name}
                        </CardTitle>
                        <CardDescription className="mt-1 text-xs">
                          {parent.email || "No email"} · {parent.matricule || "Pending matricule"}
                        </CardDescription>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Badge variant="outline" className="border-primary/10 text-[10px] font-bold uppercase text-primary">
                            {parent.phone || parent.whatsapp || "No phone"}
                          </Badge>
                          <Badge className={linkedChildren.length > 0 ? "bg-green-100 text-[10px] font-bold uppercase text-green-700" : "bg-amber-100 text-[10px] font-bold uppercase text-amber-700"}>
                            {linkedChildren.length > 0 ? `${linkedChildren.length} linked student${linkedChildren.length > 1 ? "s" : ""}` : "Awaiting child link"}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {linkedChildren.length > 0 ? (
                        <div className="rounded-2xl border border-primary/10 bg-white p-4">
                          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Linked Students</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {linkedChildren.map((student) => (
                              <Badge key={`${parent.id}-${student.id}`} variant="outline" className="border-primary/10 px-3 py-1 text-[10px] font-bold uppercase text-primary">
                                {student.user?.name} · {student.school_class_name || student.student_class}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-primary/10 bg-accent/10 p-4 text-xs text-muted-foreground">
                          This parent account exists, but it is not yet connected to any student in the school registry.
                        </div>
                      )}
                        {canManageStudentAdmissions ? (
                          <div className="flex flex-wrap gap-3">
                            <Button variant="outline" className="rounded-xl border-primary/10 font-bold text-primary" onClick={() => openExistingParentLinkDialog(parent)}>
                              <Link2 className="mr-2 h-4 w-4" />
                              Search & Link Students
                            </Button>
                          </div>
                        ) : null}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
          <DataPagination pager={parentsPager} label="parents" />
        </TabsContent>

        <TabsContent value="honour-roll" className="mt-6">
          <Card className="border-none shadow-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl font-black uppercase text-primary">
                <Sparkles className="h-5 w-5 text-secondary" />
                Honour Roll
              </CardTitle>
              <CardDescription>Students meeting the academic recognition threshold configured for this school.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {honourRollQuery.isLoading ? (
                <div className="flex items-center gap-3 py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">Loading honour roll...</span>
                </div>
              ) : honourRoll.length === 0 ? (
                <p className="py-8 text-sm text-muted-foreground">No learners have reached the honour-roll threshold yet.</p>
              ) : (
                honourRoll.map((student: any) => (
                  <div key={student.id} className="flex items-center justify-between rounded-2xl border p-4">
                    <div>
                      <p className="font-bold text-primary">{student.user?.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {student.student_class} · {student.admission_number}
                      </p>
                    </div>
                    <Badge className="bg-green-100 text-green-700">{student.annual_average}/20</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!viewingStudent} onOpenChange={(open) => !open && setViewingStudent(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-[2rem] border-none p-0 shadow-2xl sm:max-w-5xl">
          <DialogHeader className="bg-primary p-8 text-white">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <Avatar className="h-20 w-20 rounded-2xl border-2 border-white/30 bg-white/10 shadow-lg">
                <AvatarImage src={viewingStudent?.user?.avatar || ""} alt={viewingStudent ? registryStudentName(viewingStudent) : "Student"} />
                <AvatarFallback className="bg-white text-lg font-black text-primary">
                  {viewingStudent ? registryStudentInitials(viewingStudent) : "ST"}
                </AvatarFallback>
              </Avatar>
              <div>
                <DialogTitle className="text-2xl font-black uppercase">
                  {viewingStudent ? registryStudentName(viewingStudent) : "Student Profile"}
                </DialogTitle>
                <DialogDescription className="mt-2 text-white/70">
                  School registry profile, class placement, and parent-link summary.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {viewingStudent ? (
            <div className="space-y-6 p-8">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-primary/10 bg-accent/10 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Student Matricule</p>
                  <p className="mt-2 font-mono text-lg font-black text-primary">{viewingStudent.user?.matricule || "Pending"}</p>
                </div>
                <div className="rounded-2xl border border-primary/10 bg-accent/10 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Admission No.</p>
                  <p className="mt-2 font-mono text-lg font-black text-primary">{viewingStudent.admissionNumber || "Not recorded"}</p>
                </div>
                <div className="rounded-2xl border border-primary/10 bg-accent/10 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Profile Status</p>
                  <p className="mt-2 text-lg font-black text-primary">{viewingStudent.hasProfile ? "Complete profile" : "Profile pending"}</p>
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <section className="rounded-2xl border border-primary/10 bg-white p-5 shadow-sm">
                  <h3 className="text-sm font-black uppercase tracking-widest text-primary">Identity</h3>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Full Name</p>
                      <p className="font-semibold text-slate-900">{registryStudentName(viewingStudent)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Gender</p>
                      <p className="font-semibold text-slate-900">{formatHierarchyValue(viewingStudent.profile?.gender || "Not recorded")}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Email</p>
                      <p className="break-all font-semibold text-slate-900">{viewingStudent.user?.email || "Not recorded"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Phone / WhatsApp</p>
                      <p className="font-semibold text-slate-900">{viewingStudent.user?.phone || viewingStudent.user?.whatsapp || "Not recorded"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Date of Birth</p>
                      <p className="font-semibold text-slate-900">{formatRegistryDate(viewingStudent.profile?.date_of_birth)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Admission Date</p>
                      <p className="font-semibold text-slate-900">{formatRegistryDate(viewingStudent.admissionDate)}</p>
                    </div>
                  </div>
                </section>

                <section className="rounded-2xl border border-primary/10 bg-white p-5 shadow-sm">
                  <h3 className="text-sm font-black uppercase tracking-widest text-primary">Academic Placement</h3>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Class</p>
                      <p className="font-semibold text-slate-900">{registryClassLabel(viewingStudent)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Sub-School</p>
                      <p className="font-semibold text-slate-900">{registrySubSchoolLabel(viewingStudent)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Class Level</p>
                      <p className="font-semibold text-slate-900">{formatHierarchyValue(viewingStudent.classLevel)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Section</p>
                      <p className="font-semibold text-slate-900">{formatHierarchyValue(viewingStudent.section)}</p>
                    </div>
                  </div>
                </section>
              </div>

              <section className="rounded-2xl border border-primary/10 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-black uppercase tracking-widest text-primary">Guardian And Parent Links</h3>
                <div className="mt-4 grid gap-4 lg:grid-cols-[1fr,2fr]">
                  <div className="rounded-2xl bg-accent/10 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Guardian Contact</p>
                    <p className="mt-2 font-black text-primary">{viewingStudent.guardianName || "Not recorded"}</p>
                    <p className="text-sm text-muted-foreground">
                      {viewingStudent.guardianPhone || viewingStudent.guardianWhatsapp || "No contact on file"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-primary/10 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Linked Parents</p>
                    {viewingStudent.parentLinks?.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {viewingStudent.parentLinks.map((link) => (
                          <Badge key={link.id} variant="outline" className="border-primary/10 px-3 py-1 text-[10px] font-bold uppercase text-primary">
                            {link.parent_name} - {formatHierarchyValue(link.relationship)}{link.is_primary ? " - Primary" : ""}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-muted-foreground">No parent account has been linked to this student yet.</p>
                    )}
                  </div>
                </div>
              </section>

              {viewingStudent.hasProfile && viewingStudent.profile ? (
                <div className="flex flex-wrap gap-3">
                  {canManageStudentAdmissions ? (
                    <Button
                      variant="outline"
                      className="rounded-xl border-primary/10 font-bold text-primary"
                      onClick={() => {
                        openLinkParentDialog(viewingStudent.profile!);
                        setViewingStudent(null);
                      }}
                    >
                      <Link2 className="mr-2 h-4 w-4" />
                      Create / Link Parent
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    className="rounded-xl border-primary/10 font-bold text-primary"
                    onClick={() => downloadAdmissionForm(viewingStudent.profileId || viewingStudent.id, registryStudentName(viewingStudent))}
                  >
                    Download Admission Form
                  </Button>
                  {canManageStudentAdmissions ? (
                    <Button
                      variant="outline"
                      className="rounded-xl border-primary/10 font-bold text-primary"
                      onClick={() => {
                        setEditingStudent(viewingStudent.profile!);
                        setViewingStudent(null);
                      }}
                    >
                      Edit Learner
                    </Button>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-primary/20 bg-accent/10 p-4 text-sm text-muted-foreground">
                  This student login is linked to the school, but its detailed learner profile is still pending.
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={canManageStudentAdmissions && isAdmissionOpen} onOpenChange={(open) => (open ? openAdmissionDialog() : closeAdmissionDialog())}>
        <DialogContent className="max-h-[85vh] overflow-y-auto rounded-[2rem] border-none p-0 shadow-2xl sm:max-w-4xl">
          <DialogHeader className="bg-primary p-8 text-white">
            <DialogTitle className="text-2xl font-black uppercase">Register Student</DialogTitle>
            <DialogDescription className="text-white/70">
              Complete the school admission form and optionally create the parent activation account immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-8 p-8">
            <div className="flex flex-col gap-3 rounded-2xl border bg-accent/10 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-bold text-primary">Start with only the essentials</p>
                <p className="text-xs text-muted-foreground">
                  Full name, class placement, and guardian contact are enough to register a learner. Extra details are optional.
                </p>
              </div>
              <Button type="button" variant="ghost" className="h-10 rounded-xl px-4 font-bold text-primary" onClick={openOptionalAdmissionFields}>
                {showOptionalAdmissionFields ? "Hide Optional Fields" : "Show Optional Fields"}
                <ChevronDown className={`ml-2 h-4 w-4 transition-transform ${showOptionalAdmissionFields ? "rotate-180" : ""}`} />
              </Button>
            </div>

            <section className="space-y-4">
              <h3 className="text-sm font-black uppercase tracking-widest text-primary">Learner Identity</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2"><Label>Full Name</Label><Input value={formData.name} onChange={(event) => handleChange("name", event.target.value)} /></div>
                {showOptionalAdmissionFields ? (
                  <>
                    <div className="space-y-2"><Label>Email (optional)</Label><Input type="email" value={formData.email || ""} onChange={(event) => handleChange("email", event.target.value)} placeholder="Leave blank to auto-generate a temporary student email" /></div>
                    <div className="space-y-2"><Label>Phone (optional)</Label><Input value={formData.phone || ""} onChange={(event) => handleChange("phone", event.target.value)} /></div>
                    <div className="space-y-2"><Label>WhatsApp (optional)</Label><Input value={formData.whatsapp || ""} onChange={(event) => handleChange("whatsapp", event.target.value)} /></div>
                    <div className="space-y-2"><Label>Date of Birth (optional)</Label><Input type="date" value={formData.date_of_birth || ""} onChange={(event) => handleChange("date_of_birth", event.target.value)} /></div>
                    <div className="space-y-2">
                      <Label>Gender</Label>
                      <Select value={formData.gender} onValueChange={(value) => handleChange("gender", value as CreateStudentRequest["gender"])}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{GENDER_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </>
                ) : null}
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-sm font-black uppercase tracking-widest text-primary">Admission Placement</h3>
              {(hierarchyClassesQuery.isLoading || subSchoolsQuery.isLoading) ? (
                <div className="flex items-center gap-2 rounded-2xl border border-primary/10 bg-accent/10 px-4 py-3 text-xs font-bold text-primary">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading registered classes and sub-schools...
                </div>
              ) : null}
              {(hierarchyClassesQuery.isError || subSchoolsQuery.isError) ? (
                <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-xs text-destructive">
                  We could not load the school hierarchy dropdowns. You can still type a class name, or refresh and try again.
                </div>
              ) : null}
              <div className="grid gap-4 md:grid-cols-2">
                {hierarchyClasses.length > 0 ? (
                  <div className="space-y-2">
                    <Label>Registered Class</Label>
                    <Select value={(formData.school_class as string) || ""} onValueChange={handleCreateClassSelection}>
                      <SelectTrigger><SelectValue placeholder="Select a class from the hierarchy" /></SelectTrigger>
                      <SelectContent>{hierarchyClasses.map((schoolClass: HierarchyClass) => <SelectItem key={schoolClass.id} value={schoolClass.id}>{schoolClass.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                ) : null}
                <div className="space-y-2"><Label>Class Name</Label><Input placeholder="Form 5 Science" value={formData.student_class} onChange={(event) => handleChange("student_class", event.target.value)} readOnly={hierarchyClasses.length > 0 && !!formData.school_class} /></div>
                {showOptionalAdmissionFields ? (
                  <>
                    <div className="space-y-2"><Label>Admission Number (optional)</Label><Input value={formData.admission_number || ""} onChange={(event) => handleChange("admission_number", event.target.value)} placeholder="Leave blank to auto-generate" /></div>
                    <div className="space-y-2"><Label>Admission Date (optional)</Label><Input type="date" value={formData.admission_date || ""} onChange={(event) => handleChange("admission_date", event.target.value)} /></div>
                    <div className="space-y-2"><Label>Class Level</Label><Input placeholder={isBasicSchool ? "Class 1, CP, Nursery 2..." : "Form 1, 6eme, Lower Sixth..."} value={formData.class_level || ""} onChange={(event) => handleChange("class_level", event.target.value)} /></div>
                    <div className="space-y-2"><Label>Section</Label><Input placeholder="English Section, Technical, Bilingual..." value={formData.section || ""} onChange={(event) => handleChange("section", event.target.value)} /></div>
                    <div className="space-y-2 md:col-span-2"><Label>Initial Password (optional)</Label><Input type="password" placeholder="Leave empty for activation later." value={formData.password || ""} onChange={(event) => handleChange("password", event.target.value)} /></div>
                  </>
                ) : null}
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-sm font-black uppercase tracking-widest text-primary">Guardian Details</h3>
              <div className="rounded-2xl border border-primary/10 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-end">
                  <div className="flex-1 space-y-2">
                    <Label>Search existing parent or guardian</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        className="pl-9"
                        value={guardianSearchTerm}
                        onChange={(event) => {
                          setGuardianSearchTerm(event.target.value);
                          if (selectedAdmissionGuardian) {
                            setSelectedAdmissionGuardian(null);
                          }
                        }}
                        placeholder="Search by name, phone, email, or matricule"
                      />
                    </div>
                  </div>
                  {selectedAdmissionGuardian ? (
                    <Button type="button" variant="outline" className="rounded-xl border-primary/10 font-bold text-primary" onClick={clearAdmissionGuardian}>
                      Use New Guardian
                    </Button>
                  ) : null}
                </div>

                {selectedAdmissionGuardian ? (
                  <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm">
                    <p className="font-black text-green-800">{selectedAdmissionGuardian.name}</p>
                    <p className="text-xs text-green-700">
                      Existing parent account selected{selectedAdmissionGuardian.matricule ? `: ${selectedAdmissionGuardian.matricule}` : ""}.
                      This guardian will be linked to the student after registration.
                    </p>
                  </div>
                ) : (
                  <div className="mt-4 grid gap-2 md:grid-cols-2">
                    {admissionGuardianOptions.map((parent) => (
                      <button
                        key={parent.id}
                        type="button"
                        className="rounded-xl border border-primary/10 p-3 text-left transition hover:border-primary/30 hover:bg-accent/10"
                        onClick={() => selectAdmissionGuardian(parent)}
                      >
                        <p className="font-bold text-primary">{parent.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {[parent.matricule, parent.phone, parent.email].filter(Boolean).join(" · ") || "Parent account"}
                        </p>
                      </button>
                    ))}
                    {guardianSearchTerm.trim() && admissionGuardianOptions.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-primary/20 p-3 text-xs text-muted-foreground md:col-span-2">
                        No existing parent matched this search. Fill in the guardian fields below, or enable parent account creation to add a new parent login.
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2"><Label>Guardian Name (optional)</Label><Input value={formData.guardian_name || ""} onChange={(event) => handleChange("guardian_name", event.target.value)} readOnly={!!selectedAdmissionGuardian} /></div>
                <div className="space-y-2"><Label>Guardian Phone (optional)</Label><Input value={formData.guardian_phone || ""} onChange={(event) => handleChange("guardian_phone", event.target.value)} readOnly={!!selectedAdmissionGuardian} /></div>
                {showOptionalAdmissionFields ? (
                  <div className="space-y-2 md:col-span-2"><Label>Guardian WhatsApp (optional)</Label><Input value={formData.guardian_whatsapp || ""} onChange={(event) => handleChange("guardian_whatsapp", event.target.value)} readOnly={!!selectedAdmissionGuardian} /></div>
                ) : null}
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex items-center justify-between rounded-2xl border bg-accent/10 p-4">
                <div>
                  <p className="font-bold text-primary">Create parent account now</p>
                  <p className="text-xs text-muted-foreground">Generate a linked parent login and activation matricule immediately. If no email is available yet, the platform can still prepare the parent account.</p>
                </div>
                <Switch
                  checked={!!formData.create_parent_account}
                  disabled={!!selectedAdmissionGuardian}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      clearAdmissionGuardian();
                    }
                    handleChange("create_parent_account", checked);
                  }}
                />
              </div>

              {formData.create_parent_account && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2"><Label>Parent Name</Label><Input value={formData.parent_name || ""} onChange={(event) => handleChange("parent_name", event.target.value)} /></div>
                  <div className="space-y-2"><Label>Parent Phone</Label><Input value={formData.parent_phone || ""} onChange={(event) => handleChange("parent_phone", event.target.value)} /></div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Relationship</Label>
                    <Select value={normalizeGuardianRelationship(formData.parent_relationship)} onValueChange={(value) => handleChange("parent_relationship", value)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{RELATIONSHIP_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  {showOptionalAdmissionFields ? (
                    <>
                      <div className="space-y-2"><Label>Parent Email (optional)</Label><Input type="email" value={formData.parent_email || ""} onChange={(event) => handleChange("parent_email", event.target.value)} /></div>
                      <div className="space-y-2"><Label>Parent WhatsApp (optional)</Label><Input value={formData.parent_whatsapp || ""} onChange={(event) => handleChange("parent_whatsapp", event.target.value)} /></div>
                    </>
                  ) : null}
                </div>
              )}
            </section>
          </div>
          <DialogFooter className="border-t bg-accent/20 p-6">
            <Button onClick={handleSubmitAdmission} disabled={createStudentMutation.isPending || isLinkingAdmissionGuardian} className="h-14 w-full gap-3 rounded-2xl font-black uppercase tracking-widest text-xs">
              {createStudentMutation.isPending || isLinkingAdmissionGuardian ? <Loader2 className="h-5 w-5 animate-spin" /> : <UserPlus className="h-5 w-5" />}
              {isLinkingAdmissionGuardian ? "Linking Guardian..." : "Save Admission"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={canManageStudentAdmissions && isBulkOpen}
        onOpenChange={(open) => {
          if (!canManageStudentAdmissions && open) return;
          setIsBulkOpen(open);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto rounded-[2rem] border-none p-0 shadow-2xl sm:max-w-3xl">
          <DialogHeader className="bg-primary p-8 text-white">
            <DialogTitle className="text-2xl font-black uppercase">Generate Student Matricules</DialogTitle>
            <DialogDescription className="text-white/70">
              Choose the class placement and number of activation matricules. The platform prepares a printable activation sheet immediately.
            </DialogDescription>
            </DialogHeader>
            <div className="space-y-6 p-8">
              {(hierarchyClassesQuery.isLoading || subSchoolsQuery.isLoading) ? (
                <div className="flex items-center gap-2 rounded-2xl border border-primary/10 bg-accent/10 px-4 py-3 text-xs font-bold text-primary">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading registered classes and sub-schools...
                </div>
              ) : null}
              {(hierarchyClassesQuery.isError || subSchoolsQuery.isError) ? (
                <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-xs text-destructive">
                  We could not load the hierarchy dropdowns for bulk import. Check your connection and try again.
                </div>
              ) : null}
              <div className="grid gap-4 md:grid-cols-2">
              {subSchools.length > 0 ? (
                <div className="space-y-2">
                  <Label>Sub-School</Label>
                  <Select value={bulkData.sub_school || ""} onValueChange={handleBulkSubSchoolSelection}>
                    <SelectTrigger><SelectValue placeholder="Select the sub-school first" /></SelectTrigger>
                    <SelectContent>{subSchools.map((subSchool: HierarchySubSchool) => <SelectItem key={subSchool.id} value={subSchool.id}>{subSchool.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              ) : null}
              {hierarchyClasses.length > 0 ? (
                <div className="space-y-2">
                  <Label>Registered Class</Label>
                  <Select value={bulkData.school_class || ""} onValueChange={handleBulkClassSelection}>
                    <SelectTrigger><SelectValue placeholder="Select a class from the hierarchy" /></SelectTrigger>
                    <SelectContent>{filteredBulkHierarchyClasses.map((schoolClass: HierarchyClass) => <SelectItem key={schoolClass.id} value={schoolClass.id}>{schoolClass.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              ) : null}
              <div className="space-y-2">
                <Label>Target Class</Label>
                <Input value={bulkData.student_class} onChange={(event) => setBulkData((current) => ({ ...current, student_class: event.target.value }))} placeholder="Form 1 A" readOnly={hierarchyClasses.length > 0 && !!bulkData.school_class} />
              </div>
              <div className="space-y-2">
                <Label>Number of Matricules</Label>
                <Input
                  type="number"
                  min={1}
                  max={500}
                  value={bulkData.generation_count || ""}
                  onChange={(event) => { setBulkGenerated(false); setBulkData((current) => ({ ...current, generation_count: Number(event.target.value || 0) })); }}
                  placeholder="30"
                />
              </div>
              <div className="space-y-2"><Label>Class Level (optional)</Label><Input value={bulkData.class_level || ""} onChange={(event) => setBulkData((current) => ({ ...current, class_level: event.target.value }))} placeholder="Leave blank to infer or type your own level" /></div>
              <div className="space-y-2"><Label>Section (optional)</Label><Input value={bulkData.section || ""} onChange={(event) => setBulkData((current) => ({ ...current, section: event.target.value }))} placeholder="Leave blank to infer or type your own section" /></div>
              <div className="space-y-2">
                <Label>Department (optional)</Label>
                <Input value={bulkData.department || ""} onChange={(event) => setBulkData((current) => ({ ...current, department: event.target.value }))} placeholder="Science Department" />
              </div>
              <div className="space-y-2">
                <Label>Stream (optional)</Label>
                <Input value={bulkData.stream || ""} onChange={(event) => setBulkData((current) => ({ ...current, stream: event.target.value }))} placeholder="General Education" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Batch Name (optional)</Label>
                <Input value={bulkData.batch_name || ""} onChange={(event) => setBulkData((current) => ({ ...current, batch_name: event.target.value }))} placeholder="Form 1 A - 2026 Intake" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>CSV File (optional)</Label>
                <Input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => setBulkData((current) => ({ ...current, file: event.target.files?.[0] }))}
                />
                <p className="text-xs text-muted-foreground">Upload a CSV to create students in bulk, or leave this empty to generate activation matricules for the selected class.</p>
              </div>
            </div>

            <div className="rounded-2xl border border-primary/10 bg-accent/10 p-4 text-xs text-muted-foreground space-y-2">
              <p className="font-black uppercase tracking-widest text-primary">How It Works</p>
              <p>Each matricule is single-use and remains attached to the selected sub-school, class, section, and level.</p>
              <p>If a matricule has already been used, the activation flow now tells the student that the matricule is already used.</p>
              <p>The activation sheet downloads as a styled PDF you can print or share directly.</p>
            </div>

            {bulkResult && (
              <Card className="border border-primary/10 shadow-none">
                <CardHeader>
                  <CardTitle className="text-base font-black text-primary">Matricule Generation Result</CardTitle>
                  <CardDescription>
                    {bulkResult.detail || `${bulkResult.created_count} created, ${bulkResult.failed_count} failed.`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(bulkResult.generated_students || []).slice(0, 20).map((student: any) => (
                    <div key={student.id} className="flex items-center justify-between rounded-xl border p-3">
                      <div>
                        <p className="font-bold text-primary">{student.student_class}</p>
                        <p className="text-xs text-muted-foreground">{student.matricule} · {formatHierarchyValue(student.class_level)}</p>
                      </div>
                      <Badge variant="outline" className="border-primary/10 font-bold text-primary uppercase">
                        {student.section}
                      </Badge>
                    </div>
                  ))}
                  {(bulkResult.created_students || []).slice(0, 10).map((student: any) => (
                    <div key={student.id} className="flex items-center justify-between rounded-xl border p-3">
                      <div>
                        <p className="font-bold text-primary">{student.name}</p>
                        <p className="text-xs text-muted-foreground">{student.matricule} · {student.admission_number}</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl border-primary/10 font-bold text-primary"
                        onClick={() => downloadAdmissionForm(student.id, student.name || "student")}
                      >
                        Download Form
                      </Button>
                    </div>
                  ))}
                  {(bulkResult.failed_rows || []).slice(0, 10).map((row: any) => (
                    <div key={`failed-${row.row}`} className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                      Row {row.row}{row.name ? ` (${row.name})` : ""}: {row.reason || "This row failed validation."}
                    </div>
                  ))}
                  {(bulkResult.generated_students || []).length > 0 && (
                    <Button
                      variant="outline"
                      className="rounded-xl border-primary/10 font-bold text-primary"
                      onClick={() => downloadActivationPdf(bulkResult.generated_students || [], bulkData.student_class)}
                    >
                      Download Activation Sheet (PDF)
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
          <DialogFooter className="border-t bg-accent/20 p-6">
            <Button onClick={handleBulkUpload} disabled={isBulkSubmitting || (bulkGenerated && !bulkData.file)} className="h-14 w-full gap-3 rounded-2xl font-black uppercase tracking-widest text-xs">
              {isBulkSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
              {bulkData.file ? "Import CSV" : bulkGenerated ? "Enter a new count to generate again" : "Generate Matricules"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={canManageStudentAdmissions && !!editingStudent} onOpenChange={(open) => !open && setEditingStudent(null)}>
        <DialogContent className="rounded-[2rem] border-none p-0 shadow-2xl sm:max-w-2xl">
          <DialogHeader className="bg-primary p-8 text-white">
            <DialogTitle className="text-2xl font-black uppercase">Edit Student</DialogTitle>
            <DialogDescription className="text-white/70">Keep the learner, guardian, and class details accurate across the school system.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 p-8 md:grid-cols-2">
            <div className="flex items-center gap-4 md:col-span-2 rounded-2xl border bg-accent/10 p-4">
              <Avatar className="h-16 w-16 border-2 border-primary/20">
                <AvatarImage src={editPhotoPreview || editingStudent?.user?.avatar || ""} />
                <AvatarFallback className="bg-primary/5 font-black text-primary">
                  {(editingStudent?.user?.name || "S").charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-1">
                <Label>Profile Photo</Label>
                <Input
                  type="file"
                  accept="image/*"
                  disabled={uploadingPhoto}
                  onChange={(event) => void handleUploadStudentPhoto(event.target.files?.[0])}
                  className="h-11 rounded-xl file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white"
                />
                <p className="text-[10px] text-muted-foreground">{uploadingPhoto ? "Uploading photo..." : "Used on the student's ID card, report card and community profile."}</p>
              </div>
            </div>
            <div className="space-y-2"><Label>Full Name</Label><Input value={(editData.name as string) || ""} onChange={(event) => setEditData((current) => ({ ...current, name: event.target.value }))} /></div>
            <div className="space-y-2"><Label>Email</Label><Input type="email" value={(editData.email as string) || ""} onChange={(event) => setEditData((current) => ({ ...current, email: event.target.value }))} /></div>
            <div className="space-y-2"><Label>Phone</Label><Input value={(editData.phone as string) || ""} onChange={(event) => setEditData((current) => ({ ...current, phone: event.target.value }))} /></div>
            <div className="space-y-2"><Label>WhatsApp</Label><Input value={(editData.whatsapp as string) || ""} onChange={(event) => setEditData((current) => ({ ...current, whatsapp: event.target.value }))} /></div>
            {hierarchyClasses.length > 0 ? (
              <div className="space-y-2">
                <Label>Registered Class</Label>
                <Select value={(editData.school_class as string) || ""} onValueChange={handleEditClassSelection}>
                  <SelectTrigger><SelectValue placeholder="Select a class from the hierarchy" /></SelectTrigger>
                  <SelectContent>{hierarchyClasses.map((schoolClass: HierarchyClass) => <SelectItem key={schoolClass.id} value={schoolClass.id}>{schoolClass.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="space-y-2"><Label>Class Name</Label><Input value={(editData.student_class as string) || ""} onChange={(event) => setEditData((current) => ({ ...current, student_class: event.target.value }))} readOnly={hierarchyClasses.length > 0 && !!editData.school_class} /></div>
            <div className="space-y-2"><Label>Class Level</Label><Input value={(editData.class_level as string) || "Form 1"} onChange={(event) => setEditData((current) => ({ ...current, class_level: event.target.value }))} /></div>
            <div className="space-y-2"><Label>Section</Label><Input value={(editData.section as string) || "General"} onChange={(event) => setEditData((current) => ({ ...current, section: event.target.value }))} /></div>
            <div className="space-y-2"><Label>Date of Birth</Label><Input type="date" value={(editData.date_of_birth as string) || ""} onChange={(event) => setEditData((current) => ({ ...current, date_of_birth: event.target.value }))} /></div>
            <div className="space-y-2">
              <Label>Gender</Label>
              <Select value={(editData.gender as string) || "male"} onValueChange={(value) => setEditData((current) => ({ ...current, gender: value as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{GENDER_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Guardian Name</Label><Input value={(editData.guardian_name as string) || ""} onChange={(event) => setEditData((current) => ({ ...current, guardian_name: event.target.value }))} /></div>
            <div className="space-y-2"><Label>Guardian Phone</Label><Input value={(editData.guardian_phone as string) || ""} onChange={(event) => setEditData((current) => ({ ...current, guardian_phone: event.target.value }))} /></div>
            <div className="space-y-2 md:col-span-2"><Label>Guardian WhatsApp</Label><Input value={(editData.guardian_whatsapp as string) || ""} onChange={(event) => setEditData((current) => ({ ...current, guardian_whatsapp: event.target.value }))} /></div>
          </div>
          <DialogFooter className="border-t bg-accent/20 p-6">
            <Button onClick={handleSaveEdit} disabled={updateStudentMutation.isPending} className="h-14 w-full gap-3 rounded-2xl font-black uppercase tracking-widest text-xs">
              {updateStudentMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={canManageStudentAdmissions && !!linkingStudent}
        onOpenChange={(open) => {
          if (!open) {
            setLinkingStudent(null);
            resetParentLinkForm(null);
          }
        }}
      >
        <DialogContent className="rounded-[2rem] border-none p-0 shadow-2xl sm:max-w-2xl">
          <DialogHeader className="bg-primary p-8 text-white">
            <DialogTitle className="text-2xl font-black uppercase">Create or Link Parent</DialogTitle>
            <DialogDescription className="text-white/70">
              Use the parent's real contact if it already exists in your school. Otherwise the platform creates a parent account and activation matricule automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 p-8 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>Student</Label>
              <Input value={linkingStudent?.user?.name || ""} readOnly />
            </div>
            <div className="space-y-2">
              <Label>Relationship</Label>
              <Select
                value={normalizeGuardianRelationship(linkParentData.relationship)}
                onValueChange={(value) => setLinkParentData((current) => ({ ...current, relationship: value }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RELATIONSHIP_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 flex items-center justify-between rounded-2xl border bg-accent/10 px-4 py-3">
              <div>
                <Label className="text-xs font-black uppercase tracking-widest text-primary">Primary Parent</Label>
                <p className="text-xs text-muted-foreground">Mark as the main parent contact for this student.</p>
              </div>
              <Switch
                checked={!!linkParentData.is_primary}
                onCheckedChange={(checked) => setLinkParentData((current) => ({ ...current, is_primary: checked }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Parent Name</Label>
              <Input
                value={linkParentData.parent_name || ""}
                onChange={(event) => setLinkParentData((current) => ({ ...current, parent_name: event.target.value }))}
                placeholder="Parent or guardian full name"
              />
            </div>
            <div className="space-y-2">
              <Label>Parent Email (optional)</Label>
              <Input
                type="email"
                value={linkParentData.parent_email || ""}
                onChange={(event) => setLinkParentData((current) => ({ ...current, parent_email: event.target.value }))}
                placeholder="Use the real email when available"
              />
            </div>
            <div className="space-y-2">
              <Label>Parent Phone (optional)</Label>
              <Input
                value={linkParentData.parent_phone || ""}
                onChange={(event) => setLinkParentData((current) => ({ ...current, parent_phone: event.target.value }))}
                placeholder="+237..."
              />
            </div>
            <div className="space-y-2">
              <Label>Parent WhatsApp (optional)</Label>
              <Input
                value={linkParentData.parent_whatsapp || ""}
                onChange={(event) => setLinkParentData((current) => ({ ...current, parent_whatsapp: event.target.value }))}
                placeholder="+237..."
              />
            </div>
            <div className="rounded-2xl border border-primary/10 bg-accent/10 p-4 text-xs text-muted-foreground md:col-span-2">
              If the email, phone, or WhatsApp already belongs to a parent in this school, the platform reuses that parent account automatically and links this child to it.
            </div>
          </div>
          <DialogFooter className="border-t bg-accent/20 p-6">
            <Button onClick={handleLinkParent} disabled={linkParentMutation.isPending} className="h-14 w-full gap-3 rounded-2xl font-black uppercase tracking-widest text-xs">
              {linkParentMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Link2 className="h-5 w-5" />}
              Save Parent Relationship
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={canManageStudentAdmissions && isParentDialogOpen}
        onOpenChange={(open) => {
          if (!canManageStudentAdmissions && open) return;
          setIsParentDialogOpen(open);
          if (!open) {
            resetParentCreateForm();
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-[2rem] border-none p-0 shadow-2xl sm:max-w-4xl">
          <DialogHeader className="bg-primary p-8 text-white">
            <DialogTitle className="text-2xl font-black uppercase">Add Parent Account</DialogTitle>
            <DialogDescription className="text-white/70">
              Create the parent separately, then search the school student registry and link children in the same onboarding flow.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-8 p-8">
            <section className="space-y-4">
              <h3 className="text-sm font-black uppercase tracking-widest text-primary">Parent Identity</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Parent Full Name</Label>
                  <Input value={parentFormData.name} onChange={(event) => setParentFormData((current) => ({ ...current, name: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Email (optional)</Label>
                  <Input type="email" value={parentFormData.email || ""} onChange={(event) => setParentFormData((current) => ({ ...current, email: event.target.value }))} placeholder="Leave blank to auto-generate a safe activation email" />
                </div>
                <div className="space-y-2">
                  <Label>Phone (optional)</Label>
                  <Input value={parentFormData.phone || ""} onChange={(event) => setParentFormData((current) => ({ ...current, phone: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>WhatsApp (optional)</Label>
                  <Input value={parentFormData.whatsapp || ""} onChange={(event) => setParentFormData((current) => ({ ...current, whatsapp: event.target.value }))} />
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest text-primary">Link Children From School Registry</h3>
                  <p className="text-sm text-muted-foreground">Search the students already registered in this school and pre-link them to the parent now.</p>
                </div>
                <Badge variant="outline" className="border-primary/10 px-3 py-1 text-[10px] font-bold uppercase text-primary">
                  {selectedParentStudentIds.length} selected
                </Badge>
              </div>

              <div className="grid gap-4 md:grid-cols-[1fr,220px]">
                <div className="flex items-center gap-4 rounded-2xl border bg-white p-4 shadow-sm">
                  <Search className="ml-1 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={parentStudentSearchTerm}
                    onChange={(event) => setParentStudentSearchTerm(event.target.value)}
                    placeholder="Search students by name, matricule, class, or admission number..."
                    className="border-none bg-transparent focus-visible:ring-0"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-1">
                  <div className="space-y-2">
                    <Label>Relationship</Label>
                    <Select value={parentFormData.relationship} onValueChange={(value) => setParentFormData((current) => ({ ...current, relationship: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{RELATIONSHIP_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border bg-accent/10 px-4 py-3">
                    <div>
                      <Label className="text-xs font-black uppercase tracking-widest text-primary">Primary Parent</Label>
                      <p className="text-xs text-muted-foreground">First selected child gets this parent as primary contact.</p>
                    </div>
                    <Switch checked={!!parentFormData.is_primary} onCheckedChange={(checked) => setParentFormData((current) => ({ ...current, is_primary: checked }))} />
                  </div>
                </div>
              </div>

              <div className="max-h-80 space-y-3 overflow-y-auto rounded-2xl border bg-accent/5 p-3">
                {schoolStudentsForParentSearch.length === 0 ? (
                  <div className="flex h-28 items-center justify-center text-sm text-muted-foreground">
                    No students match the current search.
                  </div>
                ) : (
                  schoolStudentsForParentSearch.map((student) => {
                    const isSelected = selectedParentStudentIds.includes(student.id);
                    return (
                      <button
                        key={student.id}
                        type="button"
                        onClick={() => toggleNewParentStudentSelection(student.id)}
                        className={`flex w-full items-start justify-between rounded-2xl border px-4 py-3 text-left transition ${isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-transparent bg-white hover:border-primary/10"}`}
                      >
                        <div>
                          <p className="font-bold text-primary">{student.user?.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {student.user?.matricule || "Pending matricule"} · {student.school_class_name || student.student_class}
                          </p>
                        </div>
                        <Badge className={isSelected ? "bg-primary text-white" : "bg-accent/20 text-primary"}>
                          {isSelected ? "Selected" : "Select"}
                        </Badge>
                      </button>
                    );
                  })
                )}
              </div>
            </section>
          </div>
          <DialogFooter className="border-t bg-accent/20 p-6">
            <Button onClick={handleCreateParentAccount} disabled={isParentWorkflowRunning || createUserMutation.isPending} className="h-14 w-full gap-3 rounded-2xl font-black uppercase tracking-widest text-xs">
              {isParentWorkflowRunning || createUserMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <UserPlus className="h-5 w-5" />}
              Create Parent Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={canManageStudentAdmissions && !!linkingParent}
        onOpenChange={(open) => {
          if (!open) {
            setLinkingParent(null);
            resetExistingParentLinkForm();
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-[2rem] border-none p-0 shadow-2xl sm:max-w-3xl">
          <DialogHeader className="bg-primary p-8 text-white">
            <DialogTitle className="text-2xl font-black uppercase">Link Parent To Students</DialogTitle>
            <DialogDescription className="text-white/70">
              Search the student registry in this school and connect the parent account to one or more children.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 p-8">
            <div className="rounded-2xl border bg-accent/10 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Parent Account</p>
              <p className="mt-2 text-lg font-black text-primary">{linkingParent?.name}</p>
              <p className="text-xs text-muted-foreground">{linkingParent?.matricule || "Pending matricule"} · {linkingParent?.email || "No email"}</p>
            </div>

            <div className="grid gap-4 md:grid-cols-[1fr,220px]">
              <div className="flex items-center gap-4 rounded-2xl border bg-white p-4 shadow-sm">
                <Search className="ml-1 h-4 w-4 text-muted-foreground" />
                <Input
                  value={existingParentStudentSearchTerm}
                  onChange={(event) => setExistingParentStudentSearchTerm(event.target.value)}
                  placeholder="Search students in this school..."
                  className="border-none bg-transparent focus-visible:ring-0"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-1">
                <div className="space-y-2">
                  <Label>Relationship</Label>
                  <Select value={existingParentLinkData.relationship} onValueChange={(value) => setExistingParentLinkData((current) => ({ ...current, relationship: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{RELATIONSHIP_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between rounded-2xl border bg-accent/10 px-4 py-3">
                  <div>
                    <Label className="text-xs font-black uppercase tracking-widest text-primary">Primary Parent</Label>
                    <p className="text-xs text-muted-foreground">Apply as the primary contact for the first selected child.</p>
                  </div>
                  <Switch checked={!!existingParentLinkData.is_primary} onCheckedChange={(checked) => setExistingParentLinkData((current) => ({ ...current, is_primary: checked }))} />
                </div>
              </div>
            </div>

            <div className="max-h-80 space-y-3 overflow-y-auto rounded-2xl border bg-accent/5 p-3">
              {schoolStudentsForExistingParentSearch.length === 0 ? (
                <div className="flex h-28 items-center justify-center text-sm text-muted-foreground">
                  Every matching student is already linked to this parent, or the search is empty.
                </div>
              ) : (
                schoolStudentsForExistingParentSearch.map((student) => {
                  const isSelected = selectedExistingParentStudentIds.includes(student.id);
                  return (
                    <button
                      key={student.id}
                      type="button"
                      onClick={() => toggleExistingParentStudentSelection(student.id)}
                      className={`flex w-full items-start justify-between rounded-2xl border px-4 py-3 text-left transition ${isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-transparent bg-white hover:border-primary/10"}`}
                    >
                      <div>
                        <p className="font-bold text-primary">{student.user?.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {student.user?.matricule || "Pending matricule"} · {student.school_class_name || student.student_class}
                        </p>
                      </div>
                      <Badge className={isSelected ? "bg-primary text-white" : "bg-accent/20 text-primary"}>
                        {isSelected ? "Selected" : "Select"}
                      </Badge>
                    </button>
                  );
                })
              )}
            </div>
          </div>
          <DialogFooter className="border-t bg-accent/20 p-6">
            <Button onClick={handleLinkExistingParent} disabled={isParentWorkflowRunning || !selectedExistingParentStudentIds.length} className="h-14 w-full gap-3 rounded-2xl font-black uppercase tracking-widest text-xs">
              {isParentWorkflowRunning ? <Loader2 className="h-5 w-5 animate-spin" /> : <Link2 className="h-5 w-5" />}
              Save Parent Links
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!createdParentResult} onOpenChange={() => setCreatedParentResult(null)}>
        <DialogContent className="rounded-[2rem] border-none p-8 shadow-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase text-primary">Parent Account Ready</DialogTitle>
            <DialogDescription>Share this matricule so the parent can activate and log in.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Card className="border border-primary/10 shadow-none">
              <CardContent className="p-5">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Parent Matricule</p>
                <p className="mt-2 text-3xl font-black text-primary">{createdParentResult?.matricule || "Pending"}</p>
                <p className="mt-3 text-sm text-muted-foreground">{createdParentResult?.name}</p>
              </CardContent>
            </Card>
            {createdParentResult?.linkedStudentNames?.length ? (
              <Card className="border border-primary/10 shadow-none">
                <CardContent className="p-5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Linked Students</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {createdParentResult.linkedStudentNames.map((studentName, index) => (
                      <Badge key={`${studentName}-${index}`} variant="outline" className="border-primary/10 px-3 py-1 text-[10px] font-bold uppercase text-primary">
                        {studentName}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null}
            {createdParentResult?.failedStudentNames?.length ? (
              <Card className="border border-amber-200 shadow-none">
                <CardContent className="p-5 text-sm text-amber-700">
                  Some student links still need attention: {createdParentResult.failedStudentNames.join(", ")}.
                </CardContent>
              </Card>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!createdResult} onOpenChange={() => setCreatedResult(null)}>
        <DialogContent className="rounded-[2rem] border-none p-8 shadow-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase text-primary">Admission Complete</DialogTitle>
            <DialogDescription>Share these matricules so the new accounts can activate and log in.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Card className="border border-primary/10 shadow-none">
              <CardContent className="p-5">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Student Matricule</p>
                <p className="mt-2 text-3xl font-black text-primary">{createdResult?.student_matricule || "Pending"}</p>
                {createdResult?.id && (
                  <Button variant="outline" className="mt-4 rounded-xl border-primary/10 font-bold text-primary" onClick={() => downloadAdmissionForm(createdResult.id, createdResult?.user?.name || "student")}>
                    Download Admission Form
                  </Button>
                )}
              </CardContent>
            </Card>
            {createdResult?.parent_matricule && (
              <Card className="border border-primary/10 shadow-none">
                <CardContent className="p-5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Parent Matricule</p>
                  <p className="mt-2 text-3xl font-black text-primary">{createdResult.parent_matricule}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
