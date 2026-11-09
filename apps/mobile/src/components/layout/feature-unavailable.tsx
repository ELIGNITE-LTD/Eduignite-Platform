"use client";

import Link from "next/link";
import { Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";

/**
 * Shown when a school opens a screen whose app it has not been given. It says
 * what to do next instead of ending in a dead end: a school administrator can
 * open the App Store to add the app; everyone can contact support or go home.
 * (The server refuses the app's API regardless; this is only the explanation.)
 */
export function FeatureUnavailable({ homeHref = "/dashboard" }: { homeHref?: string }) {
  const { user } = useAuth();
  const { language } = useI18n();
  const fr = language === "fr";
  const isAdmin = user?.role === "SCHOOL_ADMIN" || user?.role === "SUB_ADMIN";

  return (
    <Card className="mx-auto mt-6 max-w-lg rounded-3xl border-none shadow-xl">
      <CardContent className="space-y-4 p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <Lock className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-xl font-black text-primary">
          {fr ? "Cette fonction n'est pas encore activee pour votre ecole" : "This feature is not available for your school"}
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {isAdmin
            ? fr
              ? "Elle ne fait pas partie des applications activees pour votre ecole. Ouvrez la boutique d'applications pour l'ajouter, ou contactez le support EduIgnite pour la faire activer."
              : "It is not among the apps switched on for your school. Open the App Store to add it, or contact EduIgnite support to have it activated."
            : fr
              ? "Elle n'est pas activee pour votre ecole. Demandez a l'administrateur de votre ecole de l'activer."
              : "It is not switched on for your school. Ask your school administrator to activate it."}
        </p>
        <div className="flex flex-col items-center justify-center gap-2 sm:flex-row">
          {isAdmin ? (
            <Button asChild className="rounded-xl">
              <Link href="/dashboard/app-market">{fr ? "Ouvrir la boutique d'applications" : "Open the App Store"}</Link>
            </Button>
          ) : null}
          <Button asChild variant="outline" className="rounded-xl">
            <Link href="/dashboard/support">{fr ? "Contacter le support" : "Contact support"}</Link>
          </Button>
          <Button asChild variant="ghost" className="rounded-xl">
            <Link href={homeHref}>{fr ? "Retour a l'accueil" : "Back to dashboard"}</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
