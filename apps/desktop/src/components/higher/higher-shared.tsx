"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { higherEdErrorMessage } from "@/lib/api/services/higher-ed.service";

/** Pick the English or French sentence (same pattern as the sidebar labels). */
export function useHigherText() {
  const { language } = useI18n();
  return (en: string, fr: string) => (language === "fr" ? fr : en);
}

/** What the signed-in person may change: the administrator edits the structure; the administration also admits students. */
export function useHigherRole() {
  const { user } = useAuth();
  const role = String(user?.role || "").toUpperCase();
  return { isOwner: role === "SCHOOL_ADMIN", isAdmin: role === "SCHOOL_ADMIN" || role === "SUB_ADMIN", role };
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

/** Title band with one sentence of help, in the same look as the other dashboards. */
export function HigherPageHeader({ title, help, children }: { title: string; help: string; children?: ReactNode }) {
  const tr = useHigherText();
  const { user } = useAuth();
  const isAdmin = user?.role === "SCHOOL_ADMIN" || user?.role === "SUB_ADMIN";
  return (
    <header className="space-y-3 rounded-3xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5 sm:p-7">
      {isAdmin ? (
        <Link href="/dashboard/higher/setup" className="inline-flex items-center text-xs font-medium text-muted-foreground hover:underline">
          <ArrowLeft className="mr-1 h-3 w-3" />
          {tr("Setup steps", "Étapes de configuration")}
        </Link>
      ) : null}
      <h1 className="font-headline text-2xl font-black tracking-tight text-primary sm:text-3xl">{title}</h1>
      <p className="max-w-2xl text-sm text-muted-foreground">{help}</p>
      {children}
    </header>
  );
}

/**
 * A form that stays out of the way: a button first, and the form only after it is clicked. `children` is the form;
 * pass `onOpenChange` or use the render-prop form to close it after a save.
 */
export function AddToggle({ label, title, children, defaultOpen = false }: { label: string; title?: string; children: ReactNode | ((close: () => void) => ReactNode); defaultOpen?: boolean }) {
  const tr = useHigherText();
  const [open, setOpen] = useState(defaultOpen);
  const close = () => setOpen(false);
  return (
    <div className="space-y-3">
      <Button type="button" variant={open ? "outline" : "default"} onClick={() => setOpen((v) => !v)}>
        {open ? `× ${tr("Close", "Fermer")}` : `+ ${label}`}
      </Button>
      {open ? (
        <div className="rounded-2xl bg-muted/40 p-4">
          {title ? <p className="mb-3 text-sm font-semibold">{title}</p> : null}
          {typeof children === "function" ? children(close) : children}
        </div>
      ) : null}
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
