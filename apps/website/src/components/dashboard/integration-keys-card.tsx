"use client";

/**
 * CEO/CTO only: rotate the AI (Gemini) and email (Brevo) keys live from the
 * dashboard. Values override the server env at runtime (see backend
 * runtime_config), so changes take effect within seconds, no redeploy. The
 * current keys are only ever shown masked.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, Loader2, Save } from "lucide-react";

import { apiClient } from "@/lib/api/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

type SecretsState = {
  gemini_api_key_set: boolean;
  gemini_api_key_masked: string;
  gemini_model: string;
  gemini_model_effective: string;
  brevo_api_key_set: boolean;
  brevo_api_key_masked: string;
  updated_at: string | null;
  updated_by: string;
};

export function IntegrationKeysCard() {
  const { toast } = useToast();
  const [geminiKey, setGeminiKey] = useState("");
  const [geminiModel, setGeminiModel] = useState("");
  const [brevoKey, setBrevoKey] = useState("");
  const [saving, setSaving] = useState(false);

  const q = useQuery<SecretsState>({
    queryKey: ["integration-secrets"],
    queryFn: async () => {
      const { data } = await apiClient.get("/platform/integration-secrets/");
      return data as SecretsState;
    },
  });

  const save = async () => {
    const payload: Record<string, string> = {};
    if (geminiKey.trim()) payload.gemini_api_key = geminiKey.trim();
    if (geminiModel.trim()) payload.gemini_model = geminiModel.trim();
    if (brevoKey.trim()) payload.brevo_api_key = brevoKey.trim();
    if (Object.keys(payload).length === 0) {
      toast({ variant: "destructive", title: "Nothing to update", description: "Enter a new key or model first." });
      return;
    }
    setSaving(true);
    try {
      await apiClient.patch("/platform/integration-secrets/", payload);
      toast({ title: "Integration keys updated", description: "Takes effect within a few seconds." });
      setGeminiKey("");
      setGeminiModel("");
      setBrevoKey("");
      await q.refetch();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Could not save", description: e?.response?.data?.detail || "Please try again." });
    } finally {
      setSaving(false);
    }
  };

  const s = q.data;

  return (
    <Card className="rounded-[2rem] border-none bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl font-black uppercase text-primary">
          <KeyRound className="h-5 w-5 text-secondary" /> Integration Keys
        </CardTitle>
        <CardDescription>
          Rotate the AI (Gemini) and email (Brevo) keys here — they take effect immediately, no redeploy.
          Current keys are shown masked and never revealed in full. CEO/CTO only.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Gemini */}
        <div className="space-y-3 rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-black uppercase tracking-wide text-primary">Gemini (AI)</p>
            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase ${s?.gemini_api_key_set ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
              {s?.gemini_api_key_set ? `set · ${s.gemini_api_key_masked}` : "not set (using server default)"}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="gemini-key">New Gemini API key</Label>
              <Input id="gemini-key" type="password" placeholder="Paste new key to change" value={geminiKey} onChange={(e) => setGeminiKey(e.target.value)} autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gemini-model">Model (optional)</Label>
              <Input id="gemini-model" placeholder={s?.gemini_model_effective || "gemini-2.5-flash"} value={geminiModel} onChange={(e) => setGeminiModel(e.target.value)} />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">Currently using model: <span className="font-semibold">{s?.gemini_model_effective || "—"}</span></p>
        </div>

        {/* Brevo */}
        <div className="space-y-3 rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-black uppercase tracking-wide text-primary">Brevo (Email)</p>
            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase ${s?.brevo_api_key_set ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
              {s?.brevo_api_key_set ? `set · ${s.brevo_api_key_masked}` : "not set (using server default)"}
            </span>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="brevo-key">New Brevo API key</Label>
            <Input id="brevo-key" type="password" placeholder="Paste new key to change" value={brevoKey} onChange={(e) => setBrevoKey(e.target.value)} autoComplete="off" />
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <p className="text-[11px] text-muted-foreground">
            {s?.updated_at ? `Last changed ${new Date(s.updated_at).toLocaleString()}${s.updated_by ? ` by ${s.updated_by}` : ""}` : ""}
          </p>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save keys
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
