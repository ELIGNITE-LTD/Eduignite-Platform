"use client";

import { useMemo } from "react";
import { Loader2, MessageSquareText } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useEducationCategory } from "@/lib/hooks/useEducationCategory";
import { useMyTeachingClasses } from "@/lib/hooks/useAttendance";
import { useHierarchyClasses } from "@/lib/hooks/useSchools";
import { TermCommentsEntry } from "@/components/dashboard/term-comments-entry";

/** Class-teacher comments for the term report card (basic schools). */
export default function ReportCommentsPage() {
  const { user } = useAuth();
  const isBasic = useEducationCategory() === "basic";
  const isTeacher = user?.role === "TEACHER";
  const isStaffAdmin = user?.role === "SCHOOL_ADMIN" || user?.role === "SUB_ADMIN";
  const schoolId = typeof user?.school?.id === "string" ? user.school.id : "";

  const mine = useMyTeachingClasses(isBasic && isTeacher);
  const all = useHierarchyClasses({ school_id: schoolId }, isBasic && isStaffAdmin && Boolean(schoolId));

  const classes = useMemo(() => {
    if (isTeacher) return (mine.data ?? []).map((c) => ({ id: String(c.id), name: c.name }));
    return (all.data ?? []).map((c) => ({ id: String(c.id), name: c.name }));
  }, [isTeacher, mine.data, all.data]);

  if (!user) {
    return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary/30" /></div>;
  }

  if (!isBasic || !(isTeacher || isStaffAdmin)) {
    return <p className="mx-auto max-w-3xl p-6 text-sm text-muted-foreground">Report card comments are available to staff of Basic Education schools.</p>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-24">
      <div>
        <h1 className="flex items-center gap-3 text-3xl font-bold text-primary font-headline">
          <div className="rounded-xl bg-primary p-2 text-secondary shadow-lg"><MessageSquareText className="h-6 w-6" /></div>
          Report card comments
        </h1>
        <p className="mt-1 text-muted-foreground">Write a short comment for each pupil. It is printed on the term report card.</p>
      </div>
      <TermCommentsEntry classes={classes} />
    </div>
  );
}
