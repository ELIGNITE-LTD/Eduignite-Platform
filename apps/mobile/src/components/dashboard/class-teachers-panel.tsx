"use client";

import { useState } from "react";
import { Loader2, Trash2, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

  const teacherList = teachers.filter((t) => t?.role === "TEACHER");

  const add = async (classId: string) => {
    const teacher = picked[classId];
    if (!teacher) return;
    try {
      const isFirst = !assignments.some((a) => a.school_class === classId);
      await assign.mutateAsync({ school_class: classId, teacher, is_lead: isFirst });
      setPicked((prev) => ({ ...prev, [classId]: "" }));
      toast({ title: "Teacher assigned" });
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
                    {teacherList.filter((t) => !taken.has(t.id)).map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
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
    </Card>
  );
}
