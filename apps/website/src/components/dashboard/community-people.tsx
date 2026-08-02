"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Mail, Phone, IdCard, GraduationCap, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared "school directory" people cards for the Community / schools portal.
 *
 * Renders the photo-first ID-card layout used across web, desktop and mobile:
 *  - Students  -> info card (photo, name, "Student", matricule, class + status footer)
 *  - Staff     -> photo card with an "Active" line and a dark "View Details" button
 *
 * Everything is driven by the live student/staff records already loaded on the
 * page, so no extra API calls are required.
 */

type Person = Record<string, any>;

const ROLE_LABELS: Record<string, string> = {
  SCHOOL_ADMIN: "School Administrator",
  SUB_ADMIN: "Sub Administrator",
  TEACHER: "Teacher",
  BURSAR: "Bursar",
  LIBRARIAN: "Librarian",
  STUDENT: "Student",
  PARENT: "Parent",
};

const nameOf = (p: Person) => p?.name || p?.full_name || p?.user?.name || "Unnamed";
const avatarOf = (p: Person) => p?.avatar || p?.user?.avatar || p?.photo || "";
const matriculeOf = (p: Person) =>
  p?.matricule || p?.admission_number || p?.employee_id || p?.employeeId || "";
const isActive = (p: Person) => p?.is_active !== false && p?.status !== "inactive";
const classOf = (p: Person) =>
  p?.school_class_name || p?.student_class || p?.class_level || p?.studentClass || "";
const emailOf = (p: Person) => p?.email || p?.user?.email || "";
const phoneOf = (p: Person) => p?.phone || p?.whatsapp || p?.user?.phone || "";

const staffRoleLabel = (p: Person) => {
  const subject = p?.subject_specialization || p?.department || p?.subject || "";
  if (p?.role === "TEACHER" && subject) return `${subject} Teacher`;
  return ROLE_LABELS[p?.role || ""] || (p?.role || "Staff").replace(/_/g, " ");
};

function PhotoTop({ person }: { person: Person }) {
  const avatar = avatarOf(person);
  const initial = nameOf(person).charAt(0).toUpperCase();
  return (
    <div className="relative aspect-square w-full overflow-hidden bg-accent/40">
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatar}
          alt={nameOf(person)}
          className="h-full w-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-primary/10 text-4xl font-black text-primary">
          {initial}
        </div>
      )}
      {isActive(person) ? (
        <span
          className="absolute right-2 top-2 h-4 w-4 rounded-full bg-emerald-500 ring-2 ring-white"
          aria-label="Active"
        />
      ) : null}
    </div>
  );
}

function StudentCard({ person }: { person: Person }) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-white shadow-sm transition-shadow hover:shadow-md">
      <PhotoTop person={person} />
      <div className="px-3 py-3 text-center">
        <p className="truncate font-black leading-tight text-primary">{nameOf(person)}</p>
        <p className="text-xs text-muted-foreground">Student</p>
        {matriculeOf(person) ? (
          <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground/70">
            {matriculeOf(person)}
          </p>
        ) : null}
      </div>
      <div className="flex items-center justify-between border-t px-3 py-2 text-xs">
        <span className="truncate font-semibold text-muted-foreground">
          {classOf(person) || "Unplaced"}
        </span>
        <span className={cn(isActive(person) ? "text-emerald-600" : "text-muted-foreground")}>
          {isActive(person) ? "Active" : "Inactive"}
        </span>
      </div>
    </div>
  );
}

function StaffCard({ person, onView }: { person: Person; onView: (p: Person) => void }) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-white shadow-sm transition-shadow hover:shadow-md">
      <PhotoTop person={person} />
      <div className="px-3 py-3 text-center">
        <p className="truncate font-black leading-tight text-primary">{nameOf(person)}</p>
        <p className="truncate text-xs text-muted-foreground">{staffRoleLabel(person)}</p>
        {matriculeOf(person) ? (
          <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground/70">
            {matriculeOf(person)}
          </p>
        ) : null}
      </div>
      <div className="border-t px-3 py-2 text-center text-xs">
        <span className={cn(isActive(person) ? "text-emerald-600" : "text-muted-foreground")}>
          {isActive(person) ? "Active" : "Inactive"}
        </span>
      </div>
      <div className="px-3 pb-3">
        <Button
          type="button"
          onClick={() => onView(person)}
          className="h-10 w-full rounded-xl bg-neutral-900 text-xs font-black uppercase tracking-widest text-white hover:bg-neutral-800"
        >
          View Details
        </Button>
      </div>
    </div>
  );
}

export function CommunityPeople({
  students = [],
  staff = [],
  studentLimit = 60,
  staffLimit = 60,
}: {
  students?: Person[];
  staff?: Person[];
  studentLimit?: number;
  staffLimit?: number;
}) {
  const [viewing, setViewing] = useState<Person | null>(null);

  const staffList = useMemo(() => staff.slice(0, staffLimit), [staff, staffLimit]);
  const studentList = useMemo(() => students.slice(0, studentLimit), [students, studentLimit]);

  if (staffList.length === 0 && studentList.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Staff and students will appear here once the school registry has been populated.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {staffList.length > 0 ? (
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-primary">
            <ShieldCheck className="h-4 w-4 text-secondary" /> Staff
          </h3>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {staffList.map((member) => (
              <StaffCard key={member.id || matriculeOf(member)} person={member} onView={setViewing} />
            ))}
          </div>
        </section>
      ) : null}

      {studentList.length > 0 ? (
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-primary">
            <GraduationCap className="h-4 w-4 text-secondary" /> Students
          </h3>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {studentList.map((student) => (
              <StudentCard key={student.id || matriculeOf(student)} person={student} />
            ))}
          </div>
        </section>
      ) : null}

      <Dialog open={!!viewing} onOpenChange={(open) => { if (!open) setViewing(null); }}>
        <DialogContent className="max-w-md">
          {viewing ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-primary">{nameOf(viewing)}</DialogTitle>
                <DialogDescription>{staffRoleLabel(viewing)}</DialogDescription>
              </DialogHeader>
              <div className="flex items-center gap-4">
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border">
                  <PhotoTop person={viewing} />
                </div>
                <div className="space-y-2 text-sm">
                  {matriculeOf(viewing) ? (
                    <p className="flex items-center gap-2 text-muted-foreground">
                      <IdCard className="h-4 w-4" /> {matriculeOf(viewing)}
                    </p>
                  ) : null}
                  {emailOf(viewing) ? (
                    <p className="flex items-center gap-2 break-all text-muted-foreground">
                      <Mail className="h-4 w-4 shrink-0" /> {emailOf(viewing)}
                    </p>
                  ) : null}
                  {phoneOf(viewing) ? (
                    <p className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-4 w-4" /> {phoneOf(viewing)}
                    </p>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default CommunityPeople;
