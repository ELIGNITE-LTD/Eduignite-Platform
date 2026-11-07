"use client";

import Link from "next/link";
import { ClipboardCheck, ListChecks, School } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useEducationCategory } from "@/lib/hooks/useEducationCategory";
import { useMyClasses } from "@/lib/hooks/useClassTeachers";

/** Teacher dashboard card listing the whole classes a basic-school teacher teaches. */
export function MyClassesCard() {
  const isBasic = useEducationCategory() === "basic";
  const { data } = useMyClasses(isBasic);

  if (!isBasic || !data?.class_centred) return null;

  return (
    <Card className="rounded-[2rem] border-none bg-white shadow-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl font-black uppercase tracking-tighter text-primary">
          <School className="h-5 w-5 text-secondary" /> My classes
        </CardTitle>
        <CardDescription>The classes you teach and the subjects set up for each.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.classes.length === 0 ? (
          <p className="text-sm text-muted-foreground">You have not been assigned to a class yet.</p>
        ) : (
          data.classes.map((cls) => (
            <div key={cls.id} className="rounded-2xl bg-accent/30 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold text-primary">
                  {cls.name}
                  {cls.is_class_master ? <Badge variant="secondary" className="ml-2 text-[10px] uppercase">Class master</Badge> : null}
                </p>
                <div className="flex gap-2">
                  <Button asChild size="sm" variant="outline" className="rounded-xl">
                    <Link href="/dashboard/attendance"><ClipboardCheck className="mr-2 h-4 w-4" />Attendance</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline" className="rounded-xl">
                    <Link href="/dashboard/grades"><ListChecks className="mr-2 h-4 w-4" />Grades</Link>
                  </Button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {cls.subjects.length === 0 ? (
                  <span className="text-sm text-muted-foreground">No subjects configured.</span>
                ) : (
                  cls.subjects.map((s) => <Badge key={s.id} variant="outline">{s.subject_name}</Badge>)
                )}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
