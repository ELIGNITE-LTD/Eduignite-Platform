import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The one header treatment for every "focused" sub-screen reached from a
 * Workspace card (Announcements, Feedback, Testimony, Surveys, Activate,
 * Device Replacement, a chat thread) — back link, title, optional subtitle,
 * optional right-side action (refresh, etc). Keeps every one of those
 * screens visually identical instead of each hand-rolling its own header.
 */
export function AppHeader({
  title,
  subtitle,
  backHref,
  backLabel = "Back",
  action,
}: {
  title: string;
  subtitle?: string;
  backHref: string;
  backLabel?: string;
  action?: ReactNode;
}) {
  return (
    <div>
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-xs font-bold text-gray-500 transition hover:text-primary"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {backLabel}
      </Link>
      <div className="mt-2 flex items-start justify-between gap-3">
        <h1 className="text-2xl font-black text-primary-dark">{title}</h1>
        {action}
      </div>
      {subtitle ? <p className="mt-2 text-sm text-gray-500">{subtitle}</p> : null}
    </div>
  );
}
