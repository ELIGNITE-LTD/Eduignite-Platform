"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useHigherSetupStatus } from "@/lib/hooks/useHigherEd";
import { HIGHER_SETUP_STEPS } from "./higher-setup-checklist";

interface HigherSectionPageProps {
  /** Setup step this page belongs to (see HIGHER_SETUP_STEPS), if any. */
  stepKey?: string;
  title: string;
  description: string;
  /** The one thing to do from this page. */
  primaryAction: { label: string; href: string };
}

/**
 * Shared frame for the higher-education pages: a plain title, one sentence on
 * what the page is for, how far this part of the setup is, and one clear
 * button.
 */
export function HigherSectionPage({ stepKey, title, description, primaryAction }: HigherSectionPageProps) {
  const { data, isLoading } = useHigherSetupStatus();
  const step = stepKey ? data?.status.steps.find((s) => s.key === stepKey) : undefined;
  const def = stepKey ? HIGHER_SETUP_STEPS.find((s) => s.key === stepKey) : undefined;

  let status = "";
  if (def) {
    if (isLoading) status = "Checking...";
    else if (!data?.available) status = "We could not check this yet.";
    else if (step?.done) status = typeof step.count === "number" ? `${step.count} added. This step is done.` : "This step is done.";
    else status = "Nothing added yet.";
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <div>
        <h1 className="font-headline text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{def ? def.title : title}</CardTitle>
          <CardDescription>{def ? def.help : description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {status ? <p className="text-sm">{status}</p> : null}
          <Button asChild className="w-full sm:w-auto">
            <Link href={primaryAction.href}>
              {primaryAction.label}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
