"use client";

/**
 * Activate the EduIgnite partner programme on the account the person is already
 * signed in with. No second account: the backend adds the partner capability
 * and a partner profile to this same identity (see /partners/activate/).
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export function BecomePartner() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [accepted, setAccepted] = useState(false);

  const me = useQuery({
    queryKey: ["partner-me"],
    queryFn: async () => {
      try {
        const { data } = await apiClient.get("/partners/me/");
        return data;
      } catch {
        return null;
      }
    },
  });

  const isPartner = Boolean(me.data?.partner);

  const activate = async () => {
    if (!accepted) {
      toast({ variant: "destructive", title: "Please accept the partner terms first." });
      return;
    }
    setLoading(true);
    try {
      await apiClient.post("/partners/activate/", { accept_terms: true });
      toast({
        title: "You are now an EduIgnite Partner",
        description: "Share your referral link below and earn for every school that joins.",
      });
      await me.refetch();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Could not activate partner",
        description: error?.response?.data?.detail || "Please try again in a moment.",
      });
    } finally {
      setLoading(false);
    }
  };

  if (me.isLoading) return null;

  if (isPartner) {
    return (
      <Card className="border-primary/20 bg-primary/[0.03]">
        <CardHeader>
          <CardTitle className="text-xl">You are an EduIgnite Partner</CardTitle>
          <CardDescription>
            Partner status: <span className="font-semibold">{me.data.partner.status}</span>. Use the
            referral tools below to introduce schools and follow each one as it is onboarded.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="text-xl">Become an EduIgnite Partner</CardTitle>
        <CardDescription>
          Activate the partner programme on this same account, with no new sign-up. You get a
          referral link, a partner dashboard, and credit for every school you bring on board.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="flex items-start gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
            className="mt-1"
          />
          <span>I accept the EduIgnite partner programme terms.</span>
        </label>
        <Button onClick={activate} disabled={loading || !accepted}>
          {loading ? "Activating…" : "Become a Partner"}
        </Button>
      </CardContent>
    </Card>
  );
}
