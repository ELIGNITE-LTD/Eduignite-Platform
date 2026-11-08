"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { BasicClassesPanel } from "@/components/dashboard/basic-classes-panel";
import { ClassTeachersPanel } from "@/components/dashboard/class-teachers-panel";
import { LoadError } from "@/components/ui/load-error";
import { useAuth } from "@/lib/auth-context";
import { useEducationCategory, useBasicSections } from "@/lib/hooks/useEducationCategory";
import { schoolsService } from "@/lib/api/services/schools.service";
import type { HierarchyClass, HierarchySubSchool, User } from "@/lib/api/types";

const list = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

/** Top-level "Classes" tab for the head of a nursery/primary school. */
export function BasicClassesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const category = useEducationCategory();
  const sections = useBasicSections();
  const schoolId = user?.school?.id || "";
  const isAdmin = user?.role === "SCHOOL_ADMIN" || user?.role === "SUB_ADMIN";
  const allowed = isAdmin && category === "basic";

  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [classes, setClasses] = useState<HierarchyClass[]>([]);
  const [subSchools, setSubSchools] = useState<HierarchySubSchool[]>([]);
  const [staff, setStaff] = useState<User[]>([]);

  const refresh = useCallback(async () => {
    if (!schoolId) return;
    setFailed(false);
    try {
      const [classData, subSchoolData, staffData] = await Promise.all([
        schoolsService.getHierarchyClasses({ school_id: schoolId }),
        schoolsService.getSubSchools(schoolId),
        schoolsService.getHierarchyStaff(schoolId),
      ]);
      setClasses(list<HierarchyClass>(classData));
      setSubSchools(list<HierarchySubSchool>(subSchoolData));
      setStaff(list<User>(staffData));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    if (user && !allowed) router.replace(user.role === "SCHOOL_ADMIN" ? "/dashboard/institution" : "/dashboard");
  }, [user, allowed, router]);

  useEffect(() => {
    if (allowed) void refresh();
  }, [allowed, refresh]);

  if (!allowed || loading) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary/30" /></div>;
  }

  const teachers = staff.filter((member) => member && ["TEACHER", "SUB_ADMIN", "SCHOOL_ADMIN"].includes(member.role));

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-20">
      {failed ? <LoadError message="Some data could not be loaded. The list below may be incomplete." onRetry={() => void refresh()} /> : null}
      <BasicClassesPanel
        schoolId={schoolId}
        classes={classes}
        subSchools={subSchools}
        teachers={teachers}
        sections={sections}
        onChanged={refresh}
      />
      {classes.length > 0 ? <ClassTeachersPanel classes={classes} teachers={teachers} /> : null}
    </div>
  );
}
