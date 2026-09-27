"use client";

import { ReferralProgramme } from "@/components/dashboard/referral-programme";

/**
 * Refer & Earn.
 *
 * Its own page rather than a card at the bottom of the dashboard: the scheme
 * pays real money, and the rules about when it pays have to be somewhere a
 * person can be sent to and read properly.
 */
export default function ReferralsPage() {
  return (
    <div className="space-y-8 pb-20">
      <div>
        <h1 className="text-3xl font-bold text-primary font-headline">Refer &amp; Earn</h1>
        <p className="mt-1 text-muted-foreground">
          Introduce a school to EduIgnite and earn for every one that joins.
        </p>
      </div>

      <ReferralProgramme />
    </div>
  );
}
