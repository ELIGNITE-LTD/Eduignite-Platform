"use client";

import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, BarChart3, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api/errors";
import { getAcademyProfile, updateProfileConfig } from "../_lib/api";

interface OverrideForm {
  courses_count_override: string;
  learners_count_override: string;
  certificates_count_override: string;
}

const EMPTY: OverrideForm = { courses_count_override: "", learners_count_override: "", certificates_count_override: "" };

const toOverride = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
};

export default function AcademyStatisticsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<OverrideForm>(EMPTY);

  const { data, isLoading } = useQuery({
    queryKey: ["academy-admin", "profile-stats"],
    queryFn: getAcademyProfile,
  });

  // The public payload only exposes computed stats, not the raw override
  // fields — this page writes overrides "blind" (empty = "no override, use
  // live counts") and shows the currently-computed number as context.

  const saveMutation = useMutation({
    mutationFn: () =>
      updateProfileConfig({
        courses_count_override: toOverride(form.courses_count_override),
        learners_count_override: toOverride(form.learners_count_override),
        certificates_count_override: toOverride(form.certificates_count_override),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["academy-admin", "profile-stats"] });
      queryClient.invalidateQueries({ queryKey: ["academy-admin", "profile-overview"] });
      toast({ title: "Statistics Saved", description: "Public stat overrides have been updated." });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Save Failed",
        description: getApiErrorMessage(error, "Failed to update statistics overrides. Confirm you hold the PROFILE_EDIT scope."),
      });
    },
  });

  const fields: Array<{ key: keyof OverrideForm; label: string; live?: number }> = [
    { key: "courses_count_override", label: "Courses Count", live: data?.stats.courses_count },
    { key: "learners_count_override", label: "Learners Count", live: data?.stats.learners_count },
    { key: "certificates_count_override", label: "Certificates Count", live: data?.stats.certificates_count },
  ];

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-40">
        <Loader2 className="w-8 h-8 animate-spin text-primary/30" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-primary flex items-center gap-3">
            <div className="p-2 bg-primary rounded-xl shadow-lg text-white">
              <BarChart3 className="w-5 h-5 text-secondary" />
            </div>
            Statistics Configuration
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Override the public stats block. Leave a field blank to use the real, live database count instead.
          </p>
        </div>
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="h-12 px-8 rounded-xl font-black uppercase tracking-widest text-xs gap-2"
        >
          {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Overrides
        </Button>
      </div>

      <Card className="border-none shadow-xl rounded-3xl overflow-hidden">
        <CardHeader className="bg-primary/5 border-b p-8">
          <CardTitle className="text-lg font-black text-primary">Stat Overrides</CardTitle>
          <CardDescription>Requires the PROFILE_EDIT Academy scope. Enforced server-side.</CardDescription>
        </CardHeader>
        <CardContent className="p-8 space-y-6">
          {fields.map((field) => (
            <div key={field.key} className="space-y-2">
              <div className="flex items-baseline justify-between">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{field.label}</Label>
                <span className="text-[10px] text-muted-foreground">
                  Currently live: <span className="font-bold text-primary">{field.live ?? "—"}</span>
                </span>
              </div>
              <Input
                type="number"
                min={0}
                value={form[field.key]}
                onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                placeholder="Leave blank to compute from the database"
                className="h-12 rounded-xl"
              />
            </div>
          ))}

          <div className="bg-primary/5 p-4 rounded-xl border border-primary/10 flex items-start gap-3">
            <Info className="w-5 h-5 text-primary opacity-40 shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground italic">
              Stats are never hardcoded. When an override is left empty here, the public API computes the real
              count from published courses, enrollments, and issued certificates.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
