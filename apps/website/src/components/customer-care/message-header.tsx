"use client";

import { resolveMediaUrl } from "@/lib/media";
import { OFFICIAL_LOGO_SRC, initials } from "@/lib/customer-care-labels";
import { cn } from "@/lib/utils";

/**
 * The official identity header of an EduIgnite Customer Care message: the real
 * EduIgnite logo, "EduIgnite / Official Customer Care", then the sender's real
 * full name, role and "Official EduIgnite Representative".
 *
 * Reused by chat bubbles, the composer preview and the email preview. The
 * sender comes from the API (or the authenticated user for a preview), never
 * from anything typed into a form.
 */
export type HeaderSender = {
  name: string;
  roleLabel: string;
  avatar?: string | null;
  officialLabel?: string | null;
};

export function MessageHeader({
  sender,
  variant = "bubble",
  className,
}: {
  sender: HeaderSender;
  /** "email" renders the larger branded banner used at the top of an email. */
  variant?: "bubble" | "email";
  className?: string;
}) {
  const avatar = resolveMediaUrl(sender.avatar || "");
  const official = sender.officialLabel || "Official EduIgnite Representative";
  const email = variant === "email";
  return (
    <div
      className={cn(
        "rounded-lg border border-slate-200 bg-white text-slate-900",
        email ? "p-4" : "p-2.5",
        className,
      )}
      data-testid="message-header"
    >
      <div className="flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={OFFICIAL_LOGO_SRC} alt="EduIgnite logo" className={email ? "h-11 w-11" : "h-8 w-8"} />
        <div className="min-w-0 leading-tight">
          <p className={cn("font-extrabold tracking-tight text-[#12314d]", email ? "text-base" : "text-sm")}>EduIgnite</p>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#264D73]">Official Customer Care</p>
        </div>
      </div>
      <div className={cn("flex items-center gap-2.5 border-t border-slate-100", email ? "mt-3 pt-3" : "mt-2 pt-2")}>
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
        ) : (
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#264D73] text-[11px] font-bold text-white"
          >
            {initials(sender.name)}
          </span>
        )}
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold">{sender.name}</p>
          <p className="truncate text-xs text-slate-600">
            {sender.roleLabel}
            {sender.roleLabel ? " - " : ""}
            <span className="font-medium text-[#264D73]">{official}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
