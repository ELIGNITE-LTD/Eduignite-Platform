import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * The one card surface every screen uses — white, rounded-2xl, a soft
 * shadow. `interactive` adds the hover/press lift used for tappable cards
 * (workspace tiles, announcement rows) without repeating the transition
 * classes on every page.
 */
export function Card({
  className,
  interactive,
  ...props
}: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.03]",
        interactive && "transition hover:-translate-y-0.5 hover:shadow-md active:translate-y-0",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pb-3", className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}
