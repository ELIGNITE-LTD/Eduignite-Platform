"use client";

import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "destructive";
type ButtonSize = "md" | "lg" | "icon";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
}

/**
 * The one button component every screen should use — primary (filled navy),
 * secondary (accent-tinted), outline (bordered), ghost (text-only), and
 * destructive (confirmation dialogs). Consistent height/radius/weight so
 * "primary action" always looks the same across the app.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "lg", isLoading, disabled, children, ...props },
  ref
) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";

  const sizes: Record<ButtonSize, string> = {
    lg: "h-12 px-5 text-sm",
    md: "h-10 px-4 text-sm",
    icon: "h-10 w-10",
  };

  const variants: Record<ButtonVariant, string> = {
    primary: "bg-primary text-white shadow-md hover:bg-primary-dark",
    secondary: "bg-accent/15 text-primary-dark hover:bg-accent/25",
    outline: "border border-gray-300 text-gray-700 hover:bg-gray-50",
    ghost: "text-gray-600 hover:bg-gray-100",
    destructive: "bg-destructive text-white shadow-md hover:bg-destructive/90",
  };

  return (
    <button
      ref={ref}
      className={cn(base, sizes[size], variants[variant], className)}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
});
