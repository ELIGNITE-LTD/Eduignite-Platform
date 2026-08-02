"use client";

import Link from "next/link";
import { AlertTriangle, ArrowLeft, Home, LayoutDashboard, LifeBuoy, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

type ErrorAction =
  | { label: string; href: string; variant?: "default" | "outline"; icon?: "home" | "dashboard" | "support" }
  | { label: string; onClick: () => void; variant?: "default" | "outline"; icon?: "retry" | "back" };

interface EduIgniteErrorPageProps {
  code: string;
  title: string;
  description: string;
  actions?: ErrorAction[];
  children?: React.ReactNode;
}

const iconMap = {
  home: Home,
  dashboard: LayoutDashboard,
  support: LifeBuoy,
  retry: RefreshCw,
  back: ArrowLeft,
};

function ErrorActionButton({ action }: { action: ErrorAction }) {
  const Icon = action.icon ? iconMap[action.icon] : undefined;
  const content = (
    <>
      {Icon ? <Icon className="h-4 w-4" /> : null}
      {action.label}
    </>
  );

  if ("href" in action) {
    return (
      <Button
        asChild
        variant={action.variant || "default"}
        className="h-12 rounded-xl px-6 font-bold"
      >
        <Link href={action.href}>{content}</Link>
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant={action.variant || "default"}
      onClick={action.onClick}
      className="h-12 rounded-xl px-6 font-bold"
    >
      {content}
    </Button>
  );
}

export function EduIgniteErrorPage({
  code,
  title,
  description,
  actions,
  children,
}: EduIgniteErrorPageProps) {
  const pageActions =
    actions ??
    [
      { label: "Go to Dashboard", href: "/dashboard", icon: "dashboard" as const },
      { label: "Go Home", href: "/", variant: "outline" as const, icon: "home" as const },
    ];

  return (
    <main className="min-h-dvh bg-[radial-gradient(circle_at_top,#f8fafc_0,#ffffff_45%,#eef4fb_100%)] px-4 py-10 text-primary">
      <div className="mx-auto flex min-h-[calc(100dvh-5rem)] max-w-3xl flex-col items-center justify-center text-center">
        <img
          src="/icon.png"
          alt="EduIgnite"
          className="mb-8 h-24 w-24 object-contain"
        />
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/10 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.28em] text-primary/60 shadow-sm">
          <AlertTriangle className="h-4 w-4 text-secondary" />
          EduIgnite
        </div>
        <h1 className="font-headline text-7xl font-black leading-none text-primary sm:text-8xl">
          {code}
        </h1>
        <h2 className="mt-5 text-3xl font-black text-primary sm:text-4xl">{title}</h2>
        <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
          {description}
        </p>
        {children ? <div className="mt-6 w-full max-w-xl">{children}</div> : null}
        <div className="mt-8 flex w-full max-w-md flex-col justify-center gap-3 sm:flex-row">
          {pageActions.map((action) => (
            <ErrorActionButton key={action.label} action={action} />
          ))}
        </div>
      </div>
    </main>
  );
}

export function Error400() {
  return (
    <EduIgniteErrorPage
      code="400"
      title="Bad Request"
      description="The request could not be processed. Please check the submitted information and try again."
    />
  );
}

export function Error401() {
  return (
    <EduIgniteErrorPage
      code="401"
      title="Login Required"
      description="Please sign in before opening this EduIgnite workspace."
      actions={[
        { label: "Log In", href: "/login", icon: "dashboard" },
        { label: "Go Home", href: "/", variant: "outline", icon: "home" },
      ]}
    />
  );
}

export function Error403() {
  return (
    <EduIgniteErrorPage
      code="403"
      title="Access Denied"
      description="You don't have permission to view this page."
      actions={[{ label: "Back to Dashboard", href: "/dashboard", icon: "dashboard" }]}
    />
  );
}

export function Error404() {
  return (
    <EduIgniteErrorPage
      code="404"
      title="Page Not Found"
      description="The page you're looking for doesn't exist or has been moved."
    />
  );
}

export function Error500() {
  return (
    <EduIgniteErrorPage
      code="500"
      title="Something went wrong on our end."
      description="Please retry the action. If it keeps happening, send the EduIgnite team the issue details."
      actions={[
        { label: "Retry", onClick: () => window.location.reload(), icon: "retry" },
        { label: "Report Issue", href: "/dashboard/support", variant: "outline", icon: "support" },
      ]}
    />
  );
}

export function Error503() {
  return (
    <EduIgniteErrorPage
      code="503"
      title="Service Unavailable"
      description="EduIgnite is temporarily unavailable. Please try again shortly."
    />
  );
}
