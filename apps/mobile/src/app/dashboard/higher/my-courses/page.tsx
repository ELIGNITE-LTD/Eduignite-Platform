"use client";

import { BookOpen } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function HigherMyCoursesPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <div>
        <h1 className="font-headline text-2xl font-bold tracking-tight">My courses</h1>
        <p className="mt-1 text-sm text-muted-foreground">The course units you are registered for this semester.</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
          <BookOpen className="h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="font-medium">No course units to show yet</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Your course units will appear here once your institution registers you for them. Ask your department if you expected to see some.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
