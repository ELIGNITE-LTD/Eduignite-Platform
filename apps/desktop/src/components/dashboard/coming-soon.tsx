"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

/** Tiny placeholder for a basic-school page that is still being built. */
export function ComingSoon({ title }: { title: string }) {
  return (
    <Card className="rounded-[2rem] border-none bg-white shadow-xl">
      <CardContent className="space-y-3 p-8 text-center">
        <h1 className="text-2xl font-bold text-primary">{title}</h1>
        <p className="text-muted-foreground">Coming soon / Bientot disponible</p>
        <Link href="/dashboard" className="text-sm font-semibold text-primary underline">Back / Retour</Link>
      </CardContent>
    </Card>
  );
}
