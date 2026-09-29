"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Loader2, Search } from "lucide-react";

import { apiClient } from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ClassOption = { id: string | null; name: string; student_count: number };
type StudentOption = { id: string; full_name: string; admission_number: string; class_name: string };

/** A class is keyed by its id, or by its name for students with no registered class. */
const classKey = (option: ClassOption) => option.id ?? `name:${option.name}`;

/**
 * Students are known by name. The admission number only appears when two
 * students in the list share a name, to tell them apart.
 */
export function studentLabels(students: StudentOption[]) {
  const counts = new Map<string, number>();
  for (const student of students) {
    const key = student.full_name.trim().toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Map(
    students.map((student) => {
      const name = student.full_name.trim() || student.admission_number;
      const shared = (counts.get(student.full_name.trim().toLowerCase()) ?? 0) > 1;
      return [student.id, shared && student.admission_number ? `${name} — ${student.admission_number}` : name];
    }),
  );
}

type Props = {
  value: string;
  onChange: (studentId: string) => void;
  /** Parents choose among their own children, so no class step is needed. */
  skipClass?: boolean;
  className?: string;
};

/**
 * Class -> Student selection for staff tools (Skill Gap Analysis, Academic
 * Roadmap). Classes come from the caller's own scope on the server, and only
 * the chosen class's students are fetched.
 */
export function ClassStudentPicker({ value, onChange, skipClass = false, className }: Props) {
  const [classValue, setClassValue] = useState("");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const classesQuery = useQuery({
    queryKey: ["student-picker-classes"],
    enabled: !skipClass,
    queryFn: async () => (await apiClient.get<ClassOption[]>(API.STUDENTS.CLASS_OPTIONS)).data ?? [],
  });
  const classes = classesQuery.data ?? [];
  const selectedClass = classes.find((option) => classKey(option) === classValue);

  // One class only? Choose it, so a class master goes straight to their students.
  useEffect(() => {
    if (!classValue && classes.length === 1) setClassValue(classKey(classes[0]));
  }, [classValue, classes]);

  const studentsQuery = useQuery({
    queryKey: ["student-picker-students", skipClass ? "own" : classValue],
    enabled: skipClass || Boolean(selectedClass),
    queryFn: async () => {
      const params = skipClass
        ? {}
        : selectedClass?.id
          ? { school_class: selectedClass.id }
          : { class_name: selectedClass?.name };
      return (await apiClient.get<StudentOption[]>(API.STUDENTS.PICKER, { params })).data ?? [];
    },
  });
  const students = useMemo(() => studentsQuery.data ?? [], [studentsQuery.data]);
  const labels = useMemo(() => studentLabels(students), [students]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return students;
    return students.filter(
      (student) =>
        student.full_name.toLowerCase().includes(term) || student.admission_number.toLowerCase().includes(term),
    );
  }, [students, search]);

  const handleClassChange = (next: string) => {
    setClassValue(next);
    setSearch("");
    onChange("");
  };

  const studentPlaceholder = skipClass
    ? studentsQuery.isLoading ? "Loading..." : "Select student"
    : !selectedClass
      ? "Select a class first"
      : studentsQuery.isLoading
        ? "Loading students..."
        : "Select student";

  return (
    <div className={cn("grid gap-4 sm:grid-cols-2", className)}>
      {!skipClass ? (
        <div className="space-y-2">
          <Label>Class</Label>
          <Select value={classValue || undefined} onValueChange={handleClassChange}>
            <SelectTrigger aria-label="Class">
              <SelectValue placeholder={classesQuery.isLoading ? "Loading classes..." : "Select class"} />
            </SelectTrigger>
            <SelectContent>
              {classes.map((option) => (
                <SelectItem key={classKey(option)} value={classKey(option)}>
                  {option.name} ({option.student_count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!classesQuery.isLoading && classes.length === 0 ? (
            <p className="text-xs text-muted-foreground">No classes with students are available to you.</p>
          ) : null}
        </div>
      ) : null}

      <div className={cn("space-y-2", skipClass && "sm:col-span-2")}>
        <Label>Student</Label>
        <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setSearch(""); }}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              aria-label="Student"
              disabled={!skipClass && !selectedClass}
              className="w-full justify-between font-normal"
            >
              <span className={cn("truncate", !value && "text-muted-foreground")}>
                {value ? labels.get(value) ?? "Selected student" : studentPlaceholder}
              </span>
              {studentsQuery.isFetching ? (
                <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin opacity-60" />
              ) : (
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[16rem] p-0" align="start">
            <div className="flex items-center gap-2 border-b px-3">
              <Search className="h-4 w-4 shrink-0 opacity-50" />
              <Input
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name or admission number"
                className="h-10 border-0 px-0 shadow-none focus-visible:ring-0"
              />
            </div>
            <div role="listbox" className="max-h-64 overflow-y-auto p-1">
              {filtered.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {studentsQuery.isLoading ? "Loading students..." : "No student found."}
                </p>
              ) : (
                filtered.map((student) => (
                  <button
                    key={student.id}
                    type="button"
                    role="option"
                    aria-selected={student.id === value}
                    onClick={() => {
                      onChange(student.id);
                      setOpen(false);
                      setSearch("");
                    }}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none"
                  >
                    <Check className={cn("h-4 w-4 shrink-0", student.id === value ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{labels.get(student.id)}</span>
                  </button>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
