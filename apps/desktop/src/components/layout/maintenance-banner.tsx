"use client";

/**
 * Shown to every signed-in user while the founders have put the platform into
 * maintenance mode. It sits at the head of the screen and, once per session,
 * also raises a toast so the user is actively notified on arrival. The founders
 * themselves keep full access so they can finish the maintenance and switch it
 * back off (see MaintenanceCard on the Founders page).
 */

import { useEffect, useRef } from "react";
import { Wrench } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";

export const MAINTENANCE_TEXT = "The system is under maintenance.";

export function MaintenanceBanner() {
  const { platformSettings } = useAuth();
  const { toast } = useToast();
  const mode = Boolean((platformSettings as any)?.maintenanceMode);
  const scope = ((platformSettings as any)?.maintenanceScope as string) || "both";
  // This banner lives in the signed-in apps, so it shows when the founders
  // targeted "accounts" or "both" (not "public" only).
  const on = mode && scope !== "public";
  const notified = useRef(false);

  useEffect(() => {
    if (!on) {
      // Reset so the next time maintenance is turned on, users are notified again.
      notified.current = false;
      try {
        sessionStorage.removeItem("maintenance-notified");
      } catch {
        /* sessionStorage may be unavailable */
      }
      return;
    }
    try {
      if (!notified.current && !sessionStorage.getItem("maintenance-notified")) {
        notified.current = true;
        sessionStorage.setItem("maintenance-notified", "1");
        toast({
          title: "System maintenance",
          description: `${MAINTENANCE_TEXT} Some features may be unavailable for a short while.`,
        });
      }
    } catch {
      /* sessionStorage may be unavailable (private mode, etc.) */
    }
  }, [on, toast]);

  if (!on) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-amber-950"
    >
      <Wrench className="h-4 w-4 shrink-0" aria-hidden />
      <span>{MAINTENANCE_TEXT} We&rsquo;re working to improve your experience.</span>
    </div>
  );
}
