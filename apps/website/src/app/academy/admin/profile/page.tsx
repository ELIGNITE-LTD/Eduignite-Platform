"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save, Settings2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api/errors";
import { getAcademyProfile, updateProfileConfig, type ProfileConfigPayload } from "../_lib/api";

const EMPTY_FORM: ProfileConfigPayload = {
  tagline: "",
  mission: "",
  vision: "",
  description: "",
  logo_url: "",
  courses_count_override: null,
  learners_count_override: null,
  certificates_count_override: null,
};

export default function AcademyProfileSettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ProfileConfigPayload>(EMPTY_FORM);

  const { data, isLoading } = useQuery({
    queryKey: ["academy-admin", "profile"],
    queryFn: getAcademyProfile,
  });

  useEffect(() => {
    if (!data) return;
    setForm((prev) => ({
      ...prev,
      tagline: data.tagline ?? "",
      mission: data.mission ?? "",
      vision: data.vision ?? "",
      description: data.description ?? "",
      logo_url: data.logo_url ?? "",
    }));
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateProfileConfig({
        tagline: form.tagline,
        mission: form.mission,
        vision: form.vision,
        description: form.description,
        logo_url: form.logo_url || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["academy-admin", "profile"] });
      toast({ title: "Profile Updated", description: "The public Academy profile has been saved." });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Save Failed",
        description: getApiErrorMessage(error, "Failed to update the Academy profile. Confirm you hold the PROFILE_EDIT scope."),
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-40">
        <Loader2 className="w-8 h-8 animate-spin text-primary/30" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-primary flex items-center gap-3">
            <div className="p-2 bg-primary rounded-xl shadow-lg text-white">
              <Settings2 className="w-5 h-5 text-secondary" />
            </div>
            Profile Settings
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Tagline, mission, vision, description, and logo shown on the public Academy landing page.
          </p>
        </div>
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="h-12 px-8 rounded-xl font-black uppercase tracking-widest text-xs gap-2"
        >
          {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Profile
        </Button>
      </div>

      <Card className="border-none shadow-xl rounded-3xl overflow-hidden">
        <CardHeader className="bg-primary/5 border-b p-8">
          <CardTitle className="text-lg font-black text-primary">Brand Identity</CardTitle>
          <CardDescription>Requires the PROFILE_EDIT Academy scope. Enforced server-side.</CardDescription>
        </CardHeader>
        <CardContent className="p-8 space-y-6">
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Tagline</Label>
            <Input
              value={form.tagline}
              onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))}
              placeholder="e.g. Learn the systems that run your school."
              className="h-12 rounded-xl"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Logo URL</Label>
            <Input
              value={form.logo_url ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, logo_url: e.target.value }))}
              placeholder="https://..."
              className="h-12 rounded-xl"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Mission</Label>
              <Textarea
                value={form.mission}
                onChange={(e) => setForm((f) => ({ ...f, mission: e.target.value }))}
                className="min-h-[120px] rounded-xl"
                placeholder="What the Academy exists to do."
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Vision</Label>
              <Textarea
                value={form.vision}
                onChange={(e) => setForm((f) => ({ ...f, vision: e.target.value }))}
                className="min-h-[120px] rounded-xl"
                placeholder="Where the Academy is headed."
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="min-h-[160px] rounded-xl"
              placeholder="Longer-form description shown on the public landing page."
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
