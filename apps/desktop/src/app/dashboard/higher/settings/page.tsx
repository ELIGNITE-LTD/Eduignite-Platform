"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useHigherText } from "@/components/higher/higher-shared";

export default function HigherSettingsPage() {
  const tr = useHigherText();
  const items = [
    { href: "/dashboard/higher/calendar", title: tr("Academic calendar", "Calendrier académique"), help: tr("Academic years and semesters.", "Années académiques et semestres.") },
    { href: "/dashboard/higher/grading", title: tr("Grading", "Notation"), help: tr("How results are graded.", "Comment les résultats sont notés.") },
    { href: "/dashboard/settings", title: tr("Institution profile", "Profil de l'établissement"), help: tr("Name, logo and contact details.", "Nom, logo et coordonnées.") },
  ];
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <div>
        <h1 className="font-headline text-2xl font-bold tracking-tight">{tr("Settings", "Paramètres")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{tr("Choose what you want to change.", "Choisissez ce que vous voulez modifier.")}</p>
      </div>
      <div className="grid gap-3">
        {items.map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="transition hover:bg-muted/50">
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">{item.title}</CardTitle>
                  <CardDescription>{item.help}</CardDescription>
                </div>
                <ArrowRight className="h-4 w-4" />
              </CardHeader>
              <CardContent className="hidden" />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
