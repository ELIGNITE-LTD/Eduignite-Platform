"use client";

import { Phone, School, ShieldCheck, UserRound } from "lucide-react";

import type { PrincipalContact } from "@/lib/api/services/auth.service";
import { resolveMediaUrl } from "@/lib/media";

/**
 * What a student sees after "Forgot password": students never get a reset
 * email, so this names the one person who can reset it — their own school's
 * principal — with the contact details the school shows publicly.
 *
 * This file is identical in the website, mobile and desktop apps.
 */
export function StudentPasswordHelp({ contact, message }: { contact?: PrincipalContact | null; message?: string }) {
  const avatar = resolveMediaUrl(contact?.principal_avatar || "");
  const phone = contact?.phone?.trim();

  return (
    <div className="space-y-5 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl border border-amber-100 bg-amber-50 text-amber-600">
        <ShieldCheck className="h-8 w-8" />
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-black tracking-tight text-primary">Contact your Principal</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {message || "Your password can only be reset by your school's Principal. Please contact your Principal for assistance."}
        </p>
      </div>

      {contact ? (
        <div className="rounded-2xl border border-primary/10 bg-accent/20 p-5 text-left">
          <div className="flex items-center gap-4">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt={contact.principal_name || "Principal"} className="h-16 w-16 shrink-0 rounded-full object-cover ring-2 ring-white" />
            ) : (
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <UserRound className="h-8 w-8" />
              </span>
            )}
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60">Principal</p>
              <p className="truncate text-base font-black text-primary">{contact.principal_name || "Your Principal"}</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <School className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{contact.school_name}</span>
              </p>
            </div>
          </div>
          {phone ? (
            <a
              href={`tel:${phone.replace(/\s+/g, "")}`}
              className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-primary shadow-sm hover:bg-white/80"
            >
              <Phone className="h-4 w-4" /> {phone}
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
