"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n-context";

/**
 * Shown instead of a page an executive account has not been given. The
 * founders assign each executive's activities; the server refuses the same
 * calls regardless, this page only explains it kindly.
 */
export function ExecutiveNotAssigned({ none = false }: { none?: boolean }) {
  const { language } = useI18n();
  const en = language === "en";
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-3xl border border-dashed bg-white p-8 text-center">
      <div className="rounded-full bg-primary/5 p-4">
        <Lock className="h-8 w-8 text-primary/60" />
      </div>
      <h2 className="text-xl font-black text-primary">
        {en ? "Not assigned to your account" : "Non attribue a votre compte"}
      </h2>
      <p className="text-sm text-muted-foreground">
        {none
          ? en
            ? "The founders have not assigned any activity to your account yet. Ask them (CEO or CTO) to give you the activities you should carry out."
            : "Les fondateurs ne vous ont pas encore attribue d'activite. Demandez-leur (PDG ou DTO) de vous donner les activites a mener."
          : en
            ? "This activity has not been assigned to your account. The founders (CEO or CTO) decide which activities each executive carries out. Ask them if you need it."
            : "Cette activite n'est pas attribuee a votre compte. Les fondateurs (PDG ou DTO) decident des activites de chaque dirigeant. Demandez-leur si vous en avez besoin."}
      </p>
      <Button asChild variant="outline" className="rounded-2xl">
        <Link href="/dashboard">{en ? "Back to overview" : "Retour a l'accueil"}</Link>
      </Button>
    </div>
  );
}
