"use client";

// The first thing a teacher sees on "Enter Marks": one card for every class and
// subject they are assigned to. Tapping a card opens the marks table for it.
// Replaces the old Class and Subject dropdowns.

import { ArrowRight, BookOpen, Loader2, School, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type MarksCardSubject = {
  id: string;
  class_id: string;
  class_name: string;
  sub_school_name?: string;
  subject_id: string;
  subject_name: string;
  subject_code?: string;
  coefficient: number | string;
  type?: "mandatory" | "optional";
};

export type MarksCardClass = {
  id: string;
  name: string;
  sub_school_name?: string;
  subjects: MarksCardSubject[];
};

type Props = {
  classes: MarksCardClass[];
  loading: boolean;
  error?: string;
  onSelect: (cls: MarksCardClass, subject: MarksCardSubject) => void;
};

const ACCENTS = [
  "from-indigo-500 to-violet-500",
  "from-emerald-500 to-teal-500",
  "from-sky-500 to-blue-600",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-pink-500",
  "from-cyan-500 to-sky-500",
];

function accentFor(key: string) {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return ACCENTS[hash % ACCENTS.length];
}

export function MarksClassCards({ classes, loading, error, onSelect }: Props) {
  const assignments = classes.flatMap((cls) => cls.subjects.map((subject) => ({ cls, subject })));

  if (loading && assignments.length === 0) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading your classes">
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your classes...
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44 rounded-3xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error && assignments.length === 0) {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="p-6 text-sm font-semibold text-destructive">{error}</CardContent>
      </Card>
    );
  }

  if (assignments.length === 0) {
    return (
      <Card className="border-dashed bg-white shadow-sm">
        <CardContent className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <School className="h-7 w-7" />
          </div>
          <h3 className="text-lg font-black text-primary">No classes assigned yet</h3>
          <p className="max-w-md text-sm text-muted-foreground">
            You will see a card here for every class and subject you teach once the school administrator assigns them
            to your account.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black text-primary">Choose a class</h2>
        <p className="text-sm text-muted-foreground">
          Tap the class and subject you want to enter marks for.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {assignments.map(({ cls, subject }) => (
          <button
            key={subject.id}
            type="button"
            onClick={() => onSelect(cls, subject)}
            className={cn(
              "group relative overflow-hidden rounded-3xl border bg-white text-left shadow-sm transition-all",
              "hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              "active:scale-[0.99]"
            )}
          >
            <div className={cn("h-2 w-full bg-gradient-to-r", accentFor(cls.id))} />
            <div className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Class</p>
                  <h3 className="truncate text-2xl font-black text-primary">{cls.name}</h3>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Users className="h-3.5 w-3.5" /> {cls.sub_school_name || "Main School"}
                  </p>
                </div>
                <div
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow",
                    accentFor(cls.id)
                  )}
                >
                  <BookOpen className="h-5 w-5" />
                </div>
              </div>

              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="truncate text-sm font-bold text-slate-800">{subject.subject_name}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                  {subject.subject_code ? (
                    <span className="rounded-md bg-white px-1.5 py-0.5 ring-1 ring-slate-200">{subject.subject_code}</span>
                  ) : null}
                  <span className="rounded-md bg-white px-1.5 py-0.5 ring-1 ring-slate-200">Coef. {subject.coefficient}</span>
                  {subject.type === "optional" ? (
                    <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-amber-700 ring-1 ring-amber-200">Optional</span>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center justify-between text-sm font-black text-primary">
                <span>Enter marks</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
