"use client";

import { useEffect } from "react";
import { trackReferralClick } from "@/lib/partner/client";

/**
 * Captures a partner referral code from a `?ref=CODE` visit anywhere on the
 * public site: records the click (deduped server-side) and stores the code for
 * up to 30 days so a school that signs up later is still attributed to the
 * partner, even if they arrive at the form without the query parameter.
 */
export function ReferralCapture() {
  useEffect(() => {
    const ref = (new URLSearchParams(window.location.search).get("ref") || "").trim().toUpperCase();
    if (!ref) return;
    try { localStorage.setItem("eduignite_ref", ref); } catch { /* ignore */ }
    try { document.cookie = `eduignite_ref=${ref};path=/;max-age=${60 * 60 * 24 * 30};samesite=lax`; } catch { /* ignore */ }
    trackReferralClick(ref, window.location.pathname);
  }, []);
  return null;
}
