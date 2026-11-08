"use client";

import { useState } from "react";
import { KeyRound, Mail, Phone } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ManagedAdmin } from "@/lib/api/services/proprietor.service";
import { AdminCredentialsDialog } from "./admin-credentials-dialog";
import { EmptyState, formatDateTime, useLocale, useTr } from "./common";

export type AdminRow = ManagedAdmin & { schoolId: string; schoolName: string };

/** Admin accounts with the "Change login details" action. Cards on a phone, a table on a wide screen. */
export function AdminList({ rows, showSchool, onChanged }: { rows: AdminRow[]; showSchool?: boolean; onChanged: () => void }) {
  const tr = useTr();
  const locale = useLocale();
  const [target, setTarget] = useState<AdminRow | null>(null);

  if (rows.length === 0) {
    return <EmptyState title={tr("No administrator account", "Aucun compte administrateur")} text={tr("These schools have no administrator account yet.", "Ces écoles n'ont pas encore de compte administrateur.")} />;
  }

  const status = (a: ManagedAdmin) =>
    !a.is_active ? (
      <Badge className="border-none bg-red-100 px-2 text-[10px] font-bold uppercase text-red-700">{tr("Blocked", "Bloqué")}</Badge>
    ) : a.must_change_password ? (
      <Badge className="border-none bg-amber-100 px-2 text-[10px] font-bold uppercase text-amber-800">{tr("Must change password", "Doit changer le mot de passe")}</Badge>
    ) : (
      <Badge className="border-none bg-green-100 px-2 text-[10px] font-bold uppercase text-green-700">{tr("Active", "Actif")}</Badge>
    );

  return (
    <>
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={`${row.schoolId}-${row.id}`} className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-base font-black text-primary">{row.name}</p>
                  <Badge variant="secondary" className="px-2 text-[10px] font-bold">{row.display_role}</Badge>
                  {status(row)}
                </div>
                {showSchool ? <p className="truncate text-sm font-semibold text-muted-foreground">{row.schoolName}</p> : null}
                <p className="font-mono text-xs font-bold tracking-wider text-primary/60">{row.matricule}</p>
                <div className="flex flex-col gap-0.5 text-xs text-muted-foreground sm:flex-row sm:gap-4">
                  <span className="flex min-w-0 items-center gap-1.5"><Mail className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{row.email || "-"}</span></span>
                  <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 shrink-0" />{row.phone || "-"}</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {row.last_login ? tr(`Last sign-in ${formatDateTime(row.last_login, locale)}`, `Dernière connexion ${formatDateTime(row.last_login, locale)}`) : tr("Never signed in", "Jamais connecté")}
                </p>
              </div>
              <Button type="button" className="h-11 w-full shrink-0 gap-2 rounded-xl font-bold md:w-auto" onClick={() => setTarget(row)}>
                <KeyRound className="h-4 w-4" /> {tr("Change login details", "Modifier les identifiants")}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {target ? (
        <AdminCredentialsDialog
          schoolId={target.schoolId}
          schoolName={target.schoolName}
          admin={target}
          onClose={() => setTarget(null)}
          onDone={onChanged}
        />
      ) : null}
    </>
  );
}
