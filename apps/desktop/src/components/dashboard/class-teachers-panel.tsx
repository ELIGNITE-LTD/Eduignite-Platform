"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, Trash2, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api/errors";
import type { HierarchyClass, User } from "@/lib/api/types";
import {
  useAssignClassTeacher,
  useClassTeachers,
  useUnassignClassTeacher,
} from "@/lib/hooks/useClassTeachers";

interface ClassTeachersPanelProps {
  classes: HierarchyClass[];
  teachers: User[];
}

/** Lets a basic school's admin assign teachers to whole classes. */
export function ClassTeachersPanel({ classes, teachers }: ClassTeachersPanelProps) {
  const { toast } = useToast();
  const { data: assignments = [], isLoading } = useClassTeachers();
  const assign = useAssignClassTeacher();
  const unassign = useUnassignClassTeacher();
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [moveAsk, setMoveAsk] = useState<{ classId: string; className: string; teacher: string; teacherName: string; held: string[] } | null>(null);

  const teacherList = teachers.filter((t) => t?.role === "TEACHER");

  // One class per teacher: every class each teacher is already class teacher of.
  const heldBy = new Map<string, Map<string, string>>();
  const hold = (teacherId: string | null | undefined, cls: HierarchyClass | undefined) => {
    if (!teacherId || !cls) return;
    heldBy.set(teacherId, (heldBy.get(teacherId) ?? new Map()).set(cls.id, cls.name));
  };
  assignments.forEach((a) => hold(a.teacher, classes.find((c) => c.id === a.school_class)));
  classes.forEach((c) => hold(c.class_master, c));
  const otherClasses = (teacherId: string, classId: string) =>
    Array.from(heldBy.get(teacherId)?.entries() ?? []).filter(([id]) => id !== classId).map(([, name]) => name);
  const overloaded = teacherList.filter((t) => (heldBy.get(t.id)?.size ?? 0) > 1);

  const add = async (classId: string, reassign = false) => {
    const teacher = picked[classId];
    if (!teacher) return;
    const held = otherClasses(teacher, classId);
    if (held.length > 0 && !reassign) {
      setMoveAsk({ classId, className: classes.find((c) => c.id === classId)?.name ?? "", teacher, teacherName: teacherList.find((t) => t.id === teacher)?.name ?? "", held });
      return;
    }
    try {
      const isFirst = !assignments.some((a) => a.school_class === classId);
      await assign.mutateAsync({ school_class: classId, teacher, is_lead: isFirst, ...(reassign ? { reassign: true } : {}) });
      setPicked((prev) => ({ ...prev, [classId]: "" }));
      toast({ title: reassign ? "Teacher moved" : "Teacher assigned" });
    } catch (error) {
      toast({ variant: "destructive", title: "Could not assign teacher", description: getApiErrorMessage(error) });
    }
  };

  const remove = async (id: string) => {
    try {
      await unassign.mutateAsync(id);
      toast({ title: "Teacher removed from class" });
    } catch (error) {
      toast({ variant: "destructive", title: "Could not remove teacher", description: getApiErrorMessage(error) });
    }
  };

  return (
    <Card className="rounded-3xl border-none shadow-sm">
      <CardHeader>
        <CardTitle>Class teachers</CardTitle>
        <CardDescription>Assign the teachers who teach each class as a whole. The first teacher added becomes the lead.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {overloaded.length > 0 ? (
          <div className="flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              {overloaded.map((t) => `${t.name} (${Array.from(heldBy.get(t.id)?.values() ?? []).join(", ")})`).join("; ")}
              {" "}teach more than one class. In a nursery or primary school a teacher teaches one class: remove them from the extra classes.
            </p>
          </div>
        ) : null}
        {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : null}
        {!isLoading && classes.length === 0 ? <p className="text-sm text-muted-foreground">No classes yet.</p> : null}
        {classes.map((cls) => {
          const rows = assignments.filter((a) => a.school_class === cls.id);
          const taken = new Set(rows.map((a) => a.teacher));
          return (
            <div key={cls.id} className="rounded-2xl bg-accent/30 p-4">
              <p className="font-bold text-primary">{cls.name}</p>
              <div className="mt-2 space-y-2">
                {rows.map((row) => (
                  <div key={row.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2">
                      {row.teacher_name || row.teacher}
                      {row.is_lead ? <Badge variant="secondary" className="text-[10px] uppercase">Lead</Badge> : null}
                      {(heldBy.get(row.teacher)?.size ?? 0) > 1 ? <Badge variant="destructive" className="text-[10px] uppercase">Several classes</Badge> : null}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${row.teacher_name || "teacher"}`}
                      disabled={unassign.isPending}
                      onClick={() => remove(row.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {rows.length === 0 ? <p className="text-sm text-muted-foreground">No teachers assigned.</p> : null}
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Select value={picked[cls.id] ?? ""} onValueChange={(v) => setPicked((prev) => ({ ...prev, [cls.id]: v }))}>
                  <SelectTrigger className="h-10 rounded-xl sm:w-72"><SelectValue placeholder="Select a teacher" /></SelectTrigger>
                  <SelectContent>
                    {teacherList.filter((t) => !taken.has(t.id)).map((t) => {
                      const held = otherClasses(t.id, cls.id);
                      return (
                        <SelectItem key={t.id} value={t.id}>
                          {held.length > 0 ? `${t.name} - ${held.join(", ")} (move here)` : `${t.name} (free)`}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <Button onClick={() => add(cls.id)} disabled={!picked[cls.id] || assign.isPending} className="rounded-xl">
                  <UserPlus className="mr-2 h-4 w-4" />
                  Add
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
      <AlertDialog open={Boolean(moveAsk)} onOpenChange={(o) => !o && setMoveAsk(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move {moveAsk?.teacherName} to {moveAsk?.className}?</AlertDialogTitle>
            <AlertDialogDescription>
              {moveAsk?.teacherName} already teaches {moveAsk?.held.join(", ")}. A teacher teaches one class only, so they will be removed from it and become a teacher of {moveAsk?.className}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { const a = moveAsk; setMoveAsk(null); if (a) void add(a.classId, true); }}>Move here</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
