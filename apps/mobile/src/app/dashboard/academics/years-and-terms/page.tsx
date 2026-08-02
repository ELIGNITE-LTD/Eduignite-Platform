"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { gradesService } from "@/lib/api/services/grades.service";
import { schoolsService } from "@/lib/api/services/schools.service";
import type { Sequence } from "@/lib/api/types";
import { AlertCircle, Calendar, Check, Loader2, RefreshCw, Save } from "lucide-react";

type CalendarSequenceDraft = {
  id?: string;
  name: string;
  term: number;
  start_date: string;
  end_date: string;
  is_active: boolean;
};

const TERM_LABELS: Record<number, string> = {
  1: "First Term",
  2: "Second Term",
  3: "Third Term",
};

const TERM_SETTING_TO_NUMBER: Record<string, number> = {
  First: 1,
  Second: 2,
  Third: 3,
};

function defaultAcademicYear() {
  const today = new Date();
  const startYear = today.getMonth() >= 7 ? today.getFullYear() : today.getFullYear() - 1;
  return `${startYear}-${startYear + 1}`;
}

function parseStartYear(academicYear: string) {
  const match = academicYear.match(/\d{4}/);
  return match ? Number(match[0]) : Number(defaultAcademicYear().slice(0, 4));
}

function toDateInput(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function buildCameroonDefaults(academicYear: string, currentTerm = 1): CalendarSequenceDraft[] {
  const startYear = parseStartYear(academicYear);
  const nextYear = startYear + 1;
  return [
    { name: "Sequence 1", term: 1, start_date: toDateInput(startYear, 9, 1), end_date: toDateInput(startYear, 10, 31), is_active: currentTerm === 1 },
    { name: "Sequence 2", term: 1, start_date: toDateInput(startYear, 11, 1), end_date: toDateInput(startYear, 12, 20), is_active: false },
    { name: "Sequence 3", term: 2, start_date: toDateInput(nextYear, 1, 5), end_date: toDateInput(nextYear, 2, 15), is_active: currentTerm === 2 },
    { name: "Sequence 4", term: 2, start_date: toDateInput(nextYear, 2, 16), end_date: toDateInput(nextYear, 3, 31), is_active: false },
    { name: "Sequence 5", term: 3, start_date: toDateInput(nextYear, 4, 1), end_date: toDateInput(nextYear, 5, 15), is_active: currentTerm === 3 },
    { name: "Sequence 6", term: 3, start_date: toDateInput(nextYear, 5, 16), end_date: toDateInput(nextYear, 6, 30), is_active: false },
  ];
}

function sequenceToDraft(sequence: Sequence): CalendarSequenceDraft {
  return {
    id: sequence.id,
    name: sequence.name,
    term: Number(sequence.term),
    start_date: sequence.start_date,
    end_date: sequence.end_date,
    is_active: Boolean(sequence.is_active),
  };
}

function sortSequences<T extends { term: number; name: string }>(items: T[]) {
  return [...items].sort((a, b) => a.term - b.term || a.name.localeCompare(b.name, undefined, { numeric: true }));
}

type ApiErrorWithResponse = {
  response?: {
    data?: {
      detail?: string;
      [key: string]: string | string[] | undefined;
    };
  };
};

function getErrorMessage(error: unknown) {
  const responseData = (error as ApiErrorWithResponse)?.response?.data;
  if (!responseData) return error instanceof Error ? error.message : "The calendar could not be saved.";
  if (typeof responseData.detail === "string") return responseData.detail;
  const firstFieldError = Object.values(responseData).flat().find(Boolean);
  return typeof firstFieldError === "string" ? firstFieldError : "The calendar could not be saved.";
}

export default function YearsAndTermsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const rawUser = user as ({ school_id?: string | null } & Record<string, unknown>) | null;
  const schoolId = user?.school?.id || user?.schoolId || rawUser?.school_id || "";
  const isSchoolAdmin = user?.role && ["SCHOOL_ADMIN", "SUB_ADMIN"].includes(user.role);

  const [academicYear, setAcademicYear] = useState(defaultAcademicYear());
  const [currentTerm, setCurrentTerm] = useState(1);
  const [promotionAverage, setPromotionAverage] = useState("10");
  const [drafts, setDrafts] = useState<CalendarSequenceDraft[]>(() => buildCameroonDefaults(defaultAcademicYear(), 1));
  const [hasUserEdited, setHasUserEdited] = useState(false);

  const settingsQuery = useQuery({
    queryKey: ["school-settings", schoolId],
    queryFn: () => schoolsService.getSchoolSettings(schoolId),
    enabled: Boolean(schoolId),
  });

  const sequencesQuery = useQuery({
    queryKey: ["grade-sequences"],
    queryFn: async () => {
      const data = await gradesService.getSequences({ limit: 100 });
      return Array.isArray(data) ? data : data?.results ?? [];
    },
    enabled: Boolean(schoolId),
  });

  const existingSequencesForYear = useMemo(() => {
    return sortSequences((sequencesQuery.data ?? []).filter((sequence) => sequence.academic_year === academicYear).map(sequenceToDraft));
  }, [academicYear, sequencesQuery.data]);

  useEffect(() => {
    if (hasUserEdited) return;
    const settings = settingsQuery.data;
    const nextAcademicYear = settings?.academic_year || academicYear;
    const nextTerm = TERM_SETTING_TO_NUMBER[String(settings?.term || "First")] || 1;
    const nextPromotionAverage = Number(settings?.promotion_average ?? settings?.promotionAverage ?? 10);
    const yearSequences = sortSequences((sequencesQuery.data ?? []).filter((sequence) => sequence.academic_year === nextAcademicYear).map(sequenceToDraft));

    setAcademicYear(nextAcademicYear);
    setCurrentTerm(nextTerm);
    setPromotionAverage(Number.isFinite(nextPromotionAverage) ? String(nextPromotionAverage) : "10");
    setDrafts(yearSequences.length >= 6 ? yearSequences : buildCameroonDefaults(nextAcademicYear, nextTerm));
  }, [academicYear, hasUserEdited, sequencesQuery.data, settingsQuery.data]);

  const configureMutation = useMutation({
    mutationFn: async () => {
      const normalizedDrafts = drafts.map((draft) => ({
        name: draft.name,
        term: draft.term,
        start_date: draft.start_date,
        end_date: draft.end_date,
        is_active: draft.is_active,
      }));
      const parsedPromotionAverage = Number(promotionAverage);
      if (!Number.isFinite(parsedPromotionAverage) || parsedPromotionAverage < 0 || parsedPromotionAverage > 20) {
        throw new Error("Promotion average must be between 0 and 20.");
      }
      await schoolsService.updateSchoolSettings(schoolId, { promotion_average: parsedPromotionAverage });
      return gradesService.configureCameroonCalendar({
        school_id: schoolId,
        academic_year: academicYear.trim(),
        current_term: currentTerm,
        sequences: normalizedDrafts,
      });
    },
    onSuccess: async (data) => {
      toast({
        title: "Academic calendar saved",
        description: "The Cameroon secondary school terms and sequences are ready for teacher mark entry.",
      });
      setHasUserEdited(false);
      setDrafts(sortSequences(data.sequences.map(sequenceToDraft)));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["grade-sequences"] }),
        queryClient.invalidateQueries({ queryKey: ["school-settings", schoolId] }),
      ]);
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Calendar not saved",
        description: getErrorMessage(error),
      });
    },
  });

  const activeSequence = drafts.find((sequence) => sequence.is_active);
  const isLoading = settingsQuery.isLoading || sequencesQuery.isLoading;

  const updateDraft = (index: number, changes: Partial<CalendarSequenceDraft>) => {
    setHasUserEdited(true);
    setDrafts((current) => current.map((draft, itemIndex) => (itemIndex === index ? { ...draft, ...changes } : draft)));
  };

  const setActiveSequence = (index: number) => {
    setHasUserEdited(true);
    setDrafts((current) => current.map((draft, itemIndex) => ({ ...draft, is_active: itemIndex === index })));
    setCurrentTerm(drafts[index]?.term || currentTerm);
  };

  const regenerateDefaults = () => {
    setHasUserEdited(true);
    setDrafts(buildCameroonDefaults(academicYear, currentTerm));
  };

  const handleAcademicYearChange = (value: string) => {
    setHasUserEdited(true);
    setAcademicYear(value);
    const existing = sortSequences((sequencesQuery.data ?? []).filter((sequence) => sequence.academic_year === value).map(sequenceToDraft));
    setDrafts(existing.length >= 6 ? existing : buildCameroonDefaults(value, currentTerm));
  };

  const handleCurrentTermChange = (value: string) => {
    const nextTerm = Number(value);
    setHasUserEdited(true);
    setCurrentTerm(nextTerm);
    setDrafts((current) => {
      const alreadyActiveInTerm = current.some((sequence) => sequence.term === nextTerm && sequence.is_active);
      if (alreadyActiveInTerm) return current;
      let activated = false;
      return current.map((sequence) => {
        if (!activated && sequence.term === nextTerm) {
          activated = true;
          return { ...sequence, is_active: true };
        }
        return { ...sequence, is_active: false };
      });
    });
  };

  const canSave = Boolean(isSchoolAdmin && academicYear.trim() && drafts.length === 6 && activeSequence);

  if (!isSchoolAdmin) {
    return (
      <div className="mx-auto max-w-3xl py-20">
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex items-center gap-3 p-6 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <span className="text-sm font-semibold">Only school administrators and sub-admins can configure the academic calendar.</span>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-20">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold text-primary font-headline">
            <span className="rounded-xl bg-primary p-2 shadow-lg">
              <Calendar className="h-6 w-6 text-secondary" />
            </span>
            Academic Calendar
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure the official Cameroon secondary school year, terms, and sequences used by teacher mark entry.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="gap-2" onClick={regenerateDefaults}>
            <RefreshCw className="h-4 w-4" />
            Generate Standard Calendar
          </Button>
          <Button
            type="button"
            className="gap-2"
            disabled={!canSave || configureMutation.isPending}
            onClick={() => configureMutation.mutate()}
          >
            {configureMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Calendar
          </Button>
        </div>
      </div>

      <Card className="border-none bg-white shadow-sm">
        <CardHeader>
          <CardTitle>School Year Setup</CardTitle>
          <CardDescription>
            Use one academic year label for all six sequences. Example: 2026-2027.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase">Academic Year</Label>
            <Input
              value={academicYear}
              onChange={(event) => handleAcademicYearChange(event.target.value)}
              placeholder="2026-2027"
              className="h-11 rounded-lg"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase">Current Term</Label>
            <Select value={String(currentTerm)} onValueChange={handleCurrentTermChange}>
              <SelectTrigger className="h-11 rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">First Term</SelectItem>
                <SelectItem value="2">Second Term</SelectItem>
                <SelectItem value="3">Third Term</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-2xl bg-primary/5 p-4">
            <p className="text-xs font-bold uppercase text-muted-foreground">Active Mark Entry Sequence</p>
            <p className="mt-1 text-lg font-black text-primary">{activeSequence?.name || "Not selected"}</p>
            <p className="text-xs text-muted-foreground">{activeSequence ? TERM_LABELS[activeSequence.term] : "Select one active sequence below."}</p>
          </div>
          <div className="space-y-2 md:col-span-3">
            <Label className="text-xs font-bold uppercase">Promotion Average / 20</Label>
            <Input
              type="number"
              min="0"
              max="20"
              step="0.01"
              value={promotionAverage}
              onChange={(event) => {
                setHasUserEdited(true);
                setPromotionAverage(event.target.value);
              }}
              className="h-11 max-w-xs rounded-lg"
            />
            <p className="text-xs text-muted-foreground">
              Students with an annual average at or above this value are eligible for automatic promotion. The default Cameroon pass threshold is 10/20.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-none bg-white shadow-sm">
        <CardHeader>
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle>Cameroon Secondary Sequence Calendar</CardTitle>
              <CardDescription>
                Three terms, two sequences per term. Dates can be adjusted to match the official school calendar.
              </CardDescription>
            </div>
            {existingSequencesForYear.length >= 6 ? (
              <Badge className="w-fit bg-green-600">
                <Check className="mr-1 h-3 w-3" />
                Configured
              </Badge>
            ) : (
              <Badge variant="secondary" className="w-fit">Draft</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-12 text-center text-muted-foreground">
              <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" />
              Loading calendar...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Term</TableHead>
                    <TableHead>Sequence</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>End Date</TableHead>
                    <TableHead>Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drafts.map((sequence, index) => (
                    <TableRow key={`${sequence.term}-${sequence.name}`}>
                      <TableCell>
                        <Badge variant="outline">{TERM_LABELS[sequence.term]}</Badge>
                      </TableCell>
                      <TableCell className="min-w-[180px]">
                        <Input
                          value={sequence.name}
                          onChange={(event) => updateDraft(index, { name: event.target.value })}
                          className="h-10 rounded-lg font-semibold"
                        />
                      </TableCell>
                      <TableCell className="min-w-[160px]">
                        <Input
                          type="date"
                          value={sequence.start_date}
                          onChange={(event) => updateDraft(index, { start_date: event.target.value })}
                          className="h-10 rounded-lg"
                        />
                      </TableCell>
                      <TableCell className="min-w-[160px]">
                        <Input
                          type="date"
                          value={sequence.end_date}
                          onChange={(event) => updateDraft(index, { end_date: event.target.value })}
                          className="h-10 rounded-lg"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          size="sm"
                          variant={sequence.is_active ? "default" : "outline"}
                          className="gap-2"
                          onClick={() => setActiveSequence(index)}
                        >
                          {sequence.is_active ? <Check className="h-3 w-3" /> : null}
                          {sequence.is_active ? "Active" : "Set Active"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-primary/10 bg-primary/5">
        <CardContent className="p-5 text-sm text-primary">
          Once saved, teachers will immediately see terms and sequences in Enter Marks. The warning about missing academic terms will disappear after the backend deployment has this calendar configuration.
        </CardContent>
      </Card>
    </div>
  );
}
