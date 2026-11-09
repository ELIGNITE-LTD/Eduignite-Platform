"use client";

import Link from "next/link";
import { CheckCircle2, Circle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useHigherAcademicYears, useHigherSetupStatus } from "@/lib/hooks/useHigherEd";

export interface HigherSetupStepDef {
  key: string;
  title: string;
  help: string;
  href: string;
  action: string;
}

/** The order an institution is set up in. Plain words, one job per step. */
export const HIGHER_SETUP_STEPS: HigherSetupStepDef[] = [
  { key: "departments", title: "Add your departments", help: "For example Computer Science or Law.", href: "/dashboard/higher/departments", action: "Add departments" },
  { key: "programmes", title: "Add your programmes", help: "The degrees and diplomas you award, with their length in years.", href: "/dashboard/higher/programmes", action: "Add programmes" },
  { key: "calendar", title: "Set the academic calendar", help: "Add the academic year and its semesters.", href: "/dashboard/higher/calendar", action: "Set the calendar" },
  { key: "course_units", title: "Add course units", help: "Each course unit has a number of credits and a semester.", href: "/dashboard/higher/course-units", action: "Add course units" },
  { key: "lecturers", title: "Add lecturers", help: "Invite the lecturers who will teach and enter results.", href: "/dashboard/higher/lecturers", action: "Add lecturers" },
  { key: "students", title: "Add students", help: "Enrol students in a programme and year.", href: "/dashboard/higher/students", action: "Add students" },
  { key: "grading", title: "Choose how results are graded", help: "Pick a grading scale for your institution.", href: "/dashboard/higher/grading", action: "Choose grading" },
];

export function HigherSetupChecklist() {
  const { data, isLoading, isError } = useHigherSetupStatus();
  const years = useHigherAcademicYears();
  const byKey = new Map((data?.status.steps ?? []).map((s) => [s.key, s]));
  // The backend does not report the calendar step, so it comes from the academic years list.
  if (years.data) byKey.set("calendar", { key: "calendar", done: years.data.length > 0, count: years.data.length });
  const next = HIGHER_SETUP_STEPS.find((s) => !byKey.get(s.key)?.done);
  const doneCount = HIGHER_SETUP_STEPS.filter((s) => byKey.get(s.key)?.done).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Set up your institution</CardTitle>
        <CardDescription>
          {isLoading
            ? "Checking your progress..."
            : isError
              ? "We could not load your progress. Please try again in a moment."
              : data && !data.available
                ? "We could not check your progress yet. You can still follow these steps in order."
                : `${doneCount} of ${HIGHER_SETUP_STEPS.length} steps done.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ol className="space-y-2">
          {HIGHER_SETUP_STEPS.map((step) => {
            const state = byKey.get(step.key);
            const done = Boolean(state?.done);
            return (
              <li key={step.key} className="flex items-start gap-3 rounded-lg border p-3">
                {done ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" aria-label="Done" />
                ) : (
                  <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-label="Not done yet" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {step.title}
                    {typeof state?.count === "number" ? (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">({state.count})</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">{step.help}</p>
                </div>
              </li>
            );
          })}
        </ol>
        {next ? (
          <Button asChild className="w-full sm:w-auto">
            <Link href={next.href}>
              {next.action}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        ) : (
          <p className="text-sm font-medium text-green-700">Your institution is set up.</p>
        )}
      </CardContent>
    </Card>
  );
}
