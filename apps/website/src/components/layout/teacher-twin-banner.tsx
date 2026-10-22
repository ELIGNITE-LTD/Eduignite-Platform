"use client";

/**
 * Shown while a principal is signed into their teacher account. Makes it
 * obvious they are in the teacher workspace and lets them return to admin.
 */

import { useEffect, useState } from "react";
import { ArrowLeft, GraduationCap } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { backToAdmin, isActingAsTeacher } from "@/lib/teacher-workspace";

export function TeacherTwinBanner() {
  const { user } = useAuth();
  const [acting, setActing] = useState(false);

  useEffect(() => {
    setActing(isActingAsTeacher());
  }, []);

  const isTwin = Boolean((user as any)?.is_teacher_twin) || acting;
  if (!isTwin) return null;

  return (
    <div className="flex items-center justify-between gap-3 bg-primary px-4 py-2 text-primary-foreground">
      <span className="flex items-center gap-2 text-sm font-semibold">
        <GraduationCap className="h-4 w-4" /> You are in your Teacher account
      </span>
      <button
        onClick={backToAdmin}
        className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-sm font-semibold hover:bg-white/25"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Admin
      </button>
    </div>
  );
}
