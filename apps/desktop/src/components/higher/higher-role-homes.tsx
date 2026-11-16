"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, Award, Coins, Receipt, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";
import { formatXaf } from "@/lib/api/services/higher-ed.service";
import { useHigherBalanceSummary, useHigherMyFees } from "@/lib/hooks/useHigherEd";

const money = (value: number | string | undefined) => `XAF ${Number(value || 0).toLocaleString()}`;

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <div>
        <h1 className="font-headline text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function LinkCard({ icon: Icon, title, text, href, action }: { icon: typeof BookOpen; title: string; text: string; href: string; action: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><Icon className="h-4 w-4 text-primary" /> {title}</CardTitle>
        <CardDescription>{text}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline" className="w-full sm:w-auto">
          <Link href={href}>{action}<ArrowRight className="ml-2 h-4 w-4" /></Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function FeeSummaryCard({ href }: { href: string }) {
  const query = useHigherMyFees();
  const list = query.data ?? [];
  const current = list[0];
  let text = "Your tuition and other fees, and what you have paid.";
  if (query.isLoading) text = "Checking your fees...";
  else if (query.isError) text = "We could not load your fees right now.";
  else if (!current || current.status === "no_fees") text = "No fees have been set for your level yet.";
  else text = `Paid ${formatXaf(current.paid)} of ${formatXaf(current.billed)}.`;
  return <LinkCard icon={Coins} title="Fees" text={text} href={href} action="Open fees" />;
}

export function HigherStudentHome() {
  const { user } = useAuth();
  const first = (user?.name || "").trim().split(/\s+/)[0] || "student";
  return (
    <Shell title={`Welcome, ${first}`} subtitle="Your courses, results and fees in one place.">
      <div className="grid gap-4 sm:grid-cols-2">
        <LinkCard icon={BookOpen} title="My courses" text="The course units you are registered for this semester." href="/dashboard/higher/my-courses" action="Open my courses" />
        <LinkCard icon={Award} title="My results" text="Your results by course unit and semester." href="/dashboard/higher/my-results" action="Open my results" />
        <FeeSummaryCard href="/dashboard/higher/my-fees" />
        <LinkCard icon={UserIcon} title="Profile" text="Your details and password." href="/dashboard/profile" action="Open profile" />
      </div>
    </Shell>
  );
}

export function HigherBursarHome() {
  const { data, isLoading, isError } = useHigherBalanceSummary();
  return (
    <Shell title="Overview" subtitle="Fees collected and who still owes.">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Collected</CardDescription></CardHeader>
          <CardContent className="text-2xl font-bold">{isLoading ? "..." : isError || !data ? "-" : formatXaf(data.summary.collected)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Still to collect</CardDescription></CardHeader>
          <CardContent className="text-2xl font-bold">{isLoading ? "..." : isError || !data ? "-" : formatXaf(data.summary.outstanding)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Students owing</CardDescription></CardHeader>
          <CardContent className="text-2xl font-bold">{isLoading ? "..." : isError || !data ? "-" : data.summary.defaulters}</CardContent>
        </Card>
      </div>
      <LinkCard icon={Receipt} title="Finance" text="Set fees per programme level, record payments, print receipts and see who still owes." href="/dashboard/higher/finance" action="Open finance" />
    </Shell>
  );
}

export function HigherParentHome() {
  return (
    <Shell title="Overview" subtitle="Follow the fees of the student you are linked to.">
      <div className="grid gap-4 sm:grid-cols-2">
        <LinkCard icon={Coins} title="Fees" text="Your tuition and other fees, and what has been paid." href="/dashboard/fees" action="Open fees" />
        <LinkCard icon={UserIcon} title="Profile" text="Your details and password." href="/dashboard/profile" action="Open profile" />
      </div>
    </Shell>
  );
}
