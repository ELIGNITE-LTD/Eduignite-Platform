import { cn } from "@/lib/utils";

type BadgeTone = "neutral" | "primary" | "success" | "warning" | "danger";

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-gray-100 text-gray-600",
  primary: "bg-primary/10 text-primary",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-destructive/10 text-destructive",
};

/**
 * The one small pill used for license/announcement/feedback status
 * everywhere ("New", "Active", "Expired", "Pending", priority levels, etc).
 * Callers map their own status string to a tone; this component only owns
 * the visual treatment.
 */
export function StatusBadge({ tone = "neutral", children }: { tone?: BadgeTone; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold", TONE_CLASSES[tone])}>
      {children}
    </span>
  );
}
