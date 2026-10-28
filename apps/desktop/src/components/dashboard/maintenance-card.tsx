"use client";

/**
 * Founders-only control (rendered on the Founders page, which is CEO/CTO only)
 * to put the platform into maintenance mode and choose where the notice shows:
 * the signed-in apps ("accounts"), the public marketing site ("public"), or
 * both. While it is on, the chosen audience is notified and keeps a "The system
 * is under maintenance." banner at the head of their screen (see
 * MaintenanceBanner for accounts and the public PublicMaintenanceBanner). The
 * founders keep full access so they can finish and switch it back off.
 */

import { useState } from "react";
import { Wrench } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Scope = "accounts" | "public" | "both";

const SCOPES: { value: Scope; label: string; hint: string }[] = [
  { value: "accounts", label: "Accounts only", hint: "Signed-in users (web, mobile & desktop)" },
  { value: "public", label: "Public site only", hint: "Visitors on the public website" },
  { value: "both", label: "Both", hint: "Everyone, everywhere" },
];

export function MaintenanceCard() {
  const { platformSettings, updatePlatformSettings } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const on = Boolean((platformSettings as any)?.maintenanceMode);
  const scope = (((platformSettings as any)?.maintenanceScope as Scope) || "both");

  const save = async (updates: Record<string, unknown>, title: string, description: string) => {
    setSaving(true);
    try {
      await updatePlatformSettings(updates as any);
      toast({ title, description });
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Could not update maintenance mode",
        description: e?.response?.data?.detail || e?.message || "Please try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  const toggle = (next: boolean) =>
    save(
      { maintenanceMode: next },
      next ? "Maintenance mode is ON" : "Maintenance mode is OFF",
      next
        ? "Users in the selected area now see the maintenance notice."
        : "The maintenance notice has been removed for everyone.",
    );

  const pickScope = (next: Scope) =>
    save(
      { maintenanceScope: next },
      "Maintenance notice updated",
      `Now showing on: ${SCOPES.find((s) => s.value === next)?.label.toLowerCase()}.`,
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wrench className="h-5 w-5" /> Maintenance mode
        </CardTitle>
        <CardDescription>
          Turn this on during serious maintenance. The audience you choose below is notified and keeps a
          &ldquo;The system is under maintenance.&rdquo; banner at the head of their screen. You and the other
          founders keep full access, so you can finish your changes and switch it back off.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex h-2.5 w-2.5 rounded-full ${on ? "bg-amber-500" : "bg-muted-foreground/40"}`}
              aria-hidden
            />
            <p className="text-sm font-semibold">
              {on ? "On — the notice is live" : "Off — the platform is running normally"}
            </p>
          </div>
          <Switch
            checked={on}
            disabled={saving}
            onCheckedChange={toggle}
            aria-label="Toggle platform maintenance mode"
          />
        </div>

        {on && (
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Where to show it
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {SCOPES.map((s) => {
                const active = scope === s.value;
                return (
                  <button
                    key={s.value}
                    type="button"
                    disabled={saving}
                    onClick={() => !active && pickScope(s.value)}
                    aria-pressed={active}
                    className={`rounded-xl border p-3 text-left transition-colors disabled:opacity-60 ${
                      active
                        ? "border-amber-500 bg-amber-50 ring-1 ring-amber-500"
                        : "border-border hover:border-amber-300"
                    }`}
                  >
                    <span className="block text-sm font-bold">{s.label}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{s.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
