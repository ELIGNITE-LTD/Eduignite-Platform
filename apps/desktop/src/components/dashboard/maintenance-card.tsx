"use client";

/**
 * Founders-only control (rendered on the Founders page, which is CEO/CTO only)
 * to put the whole platform into maintenance mode. While it is on, every user
 * who visits is notified and keeps a "The system is under maintenance." banner
 * at the head of their screen (see MaintenanceBanner). The founders keep full
 * access so they can finish the work and switch it back off.
 */

import { useState } from "react";
import { Wrench } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function MaintenanceCard() {
  const { platformSettings, updatePlatformSettings } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const on = Boolean((platformSettings as any)?.maintenanceMode);

  const toggle = async (next: boolean) => {
    setSaving(true);
    try {
      await updatePlatformSettings({ maintenanceMode: next } as any);
      toast({
        title: next ? "Maintenance mode is ON" : "Maintenance mode is OFF",
        description: next
          ? "Every user now sees the maintenance notice at the top of their screen."
          : "The maintenance notice has been removed for everyone.",
      });
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wrench className="h-5 w-5" /> Maintenance mode
        </CardTitle>
        <CardDescription>
          Turn this on during serious maintenance. Every user who visits is notified and keeps a
          &ldquo;The system is under maintenance.&rdquo; banner at the head of their screen. You and the
          other founders keep full access, so you can finish your changes and switch it back off.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex h-2.5 w-2.5 rounded-full ${on ? "bg-amber-500" : "bg-muted-foreground/40"}`}
            aria-hidden
          />
          <p className="text-sm font-semibold">
            {on ? "On — every user is being notified" : "Off — the platform is running normally"}
          </p>
        </div>
        <Switch
          checked={on}
          disabled={saving}
          onCheckedChange={toggle}
          aria-label="Toggle platform maintenance mode"
        />
      </CardContent>
    </Card>
  );
}
