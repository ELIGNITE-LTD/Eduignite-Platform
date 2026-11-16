"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n-context";
import { higherEdErrorMessage } from "@/lib/api/services/higher-ed.service";

/** Pick the English or French sentence (same pattern as the sidebar labels). */
export function useHigherText() {
  const { language } = useI18n();
  return (en: string, fr: string) => (language === "fr" ? fr : en);
}

/** Run a write, show a plain success or error message, and report if it worked. */
export function useHigherRunner() {
  const { toast } = useToast();
  const tr = useHigherText();
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<unknown>, done: string): Promise<boolean> {
    setBusy(true);
    try {
      await action();
      toast({ title: done });
      return true;
    } catch (error) {
      toast({
        variant: "destructive",
        title: tr("That did not work", "Cela n'a pas fonctionné"),
        description: higherEdErrorMessage(error, tr("Please check what you typed and try again.", "Vérifiez votre saisie et réessayez.")),
      });
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { run, busy };
}

/** Title, one sentence of help, and a link back to the setup steps. */
export function HigherPageHeader({ title, help, children }: { title: string; help: string; children?: ReactNode }) {
  const tr = useHigherText();
  return (
    <div className="space-y-2">
      <Link href="/dashboard/higher/setup" className="inline-flex items-center text-xs text-muted-foreground hover:underline">
        <ArrowLeft className="mr-1 h-3 w-3" />
        {tr("Back to setup steps", "Retour aux étapes de configuration")}
      </Link>
      <h1 className="font-headline text-2xl font-bold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">{help}</p>
      {children}
    </div>
  );
}

/** Shown once the step has content: the single way forward. */
export function HigherNextStep({ href, label, show }: { href: string; label: string; show: boolean }) {
  if (!show) return null;
  return (
    <Button asChild variant="outline" className="w-full sm:w-auto">
      <Link href={href}>
        {label}
        <ArrowRight className="ml-2 h-4 w-4" />
      </Link>
    </Button>
  );
}

export const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function Loading() {
  const tr = useHigherText();
  return <p className="text-sm text-muted-foreground">{tr("Loading...", "Chargement...")}</p>;
}

export function LoadFailed() {
  const tr = useHigherText();
  return (
    <p className="text-sm text-destructive">
      {tr("We could not load this. Please refresh the page.", "Impossible de charger cette page. Veuillez l'actualiser.")}
    </p>
  );
}
