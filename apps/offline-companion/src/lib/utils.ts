/**
 * Tiny className joiner — this app deliberately has no clsx/tailwind-merge
 * dependency (see tailwind.config.ts's comment on keeping the tree light).
 * Falsy values are dropped; later duplicate classes are not de-duped, same
 * as plain string concatenation, which is fine at this app's UI scale.
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
