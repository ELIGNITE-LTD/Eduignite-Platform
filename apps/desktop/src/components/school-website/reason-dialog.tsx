"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { Field, useTr } from "./shared";

export const REASON_MIN = 10;
export const REASON_MAX = 1000;

export type OversightDialogKind = "block" | "unblock" | "resolution" | "publish" | "unpublish";

/**
 * Every staff action on a school website goes through this dialog: a reason
 * (10 to 1000 characters) is required, and blocking also requires what the
 * school must do to resolve it. The server validates the same rules.
 */
export function ReasonDialog({
  open,
  kind,
  schoolName,
  initialSteps = "",
  pending,
  serverErrors,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  kind: OversightDialogKind;
  schoolName: string;
  initialSteps?: string;
  pending: boolean;
  serverErrors?: Record<string, string>;
  onCancel: () => void;
  onSubmit: (reason: string, steps: string) => void;
}) {
  const tr = useTr();
  const [reason, setReason] = useState("");
  const [steps, setSteps] = useState(initialSteps);
  const needsSteps = kind === "block" || kind === "resolution";

  useEffect(() => {
    if (open) {
      setReason("");
      setSteps(initialSteps);
    }
  }, [open, kind, initialSteps]);

  const reasonLen = reason.trim().length;
  const stepsLen = steps.trim().length;
  const reasonOk = reasonLen >= REASON_MIN && reasonLen <= REASON_MAX;
  const stepsOk = !needsSteps || (stepsLen >= REASON_MIN && stepsLen <= REASON_MAX);
  const valid = reasonOk && stepsOk;

  const copy = {
    block: {
      title: tr("Block this website", "Bloquer ce site"),
      desc: tr(
        `${schoolName} goes offline now and cannot publish or edit until you unblock it. Its administrators receive an email and a notification with your reason and the steps below.`,
        `${schoolName} passe hors ligne et ne peut ni publier ni modifier tant que vous ne le debloquez pas. Ses administrateurs recoivent un email et une notification avec votre motif et les etapes ci-dessous.`,
      ),
      reasonLabel: tr("Reason for blocking", "Motif du blocage"),
      confirm: tr("Block website", "Bloquer le site"),
      destructive: true,
    },
    unblock: {
      title: tr("Unblock this website", "Debloquer ce site"),
      desc: tr(
        `${schoolName} goes back to the state it had before it was blocked (a published site goes live again). Its administrators are told.`,
        `${schoolName} retrouve l'etat qu'il avait avant le blocage (un site publie est de nouveau en ligne). Ses administrateurs sont prevenus.`,
      ),
      reasonLabel: tr("Reason for unblocking", "Motif du deblocage"),
      confirm: tr("Unblock website", "Debloquer le site"),
      destructive: false,
    },
    resolution: {
      title: tr("Update what the school must do", "Mettre a jour ce que l'ecole doit faire"),
      desc: tr(
        "The school administrators are notified again by email and in the app with the new steps.",
        "Les administrateurs de l'ecole sont prevenus de nouveau par email et dans l'application avec les nouvelles etapes.",
      ),
      reasonLabel: tr("Why are you updating the steps?", "Pourquoi mettez-vous les etapes a jour ?"),
      confirm: tr("Send update", "Envoyer la mise a jour"),
      destructive: false,
    },
    publish: {
      title: tr("Publish this website", "Publier ce site"),
      desc: tr(`You publish ${schoolName}'s website on its behalf. Its administrators are told.`, `Vous publiez le site de ${schoolName} en son nom. Ses administrateurs sont prevenus.`),
      reasonLabel: tr("Reason for publishing", "Motif de la publication"),
      confirm: tr("Publish", "Publier"),
      destructive: false,
    },
    unpublish: {
      title: tr("Take this website offline", "Mettre ce site hors ligne"),
      desc: tr(`${schoolName}'s website goes offline but the school may publish it again. Its administrators are told.`, `Le site de ${schoolName} passe hors ligne mais l'ecole peut le republier. Ses administrateurs sont prevenus.`),
      reasonLabel: tr("Reason for taking it offline", "Motif de la mise hors ligne"),
      confirm: tr("Unpublish", "Depublier"),
      destructive: true,
    },
  }[kind];

  const counter = (len: number) =>
    len > 0 && len < REASON_MIN ? tr(`At least ${REASON_MIN} characters.`, `Au moins ${REASON_MIN} caracteres.`) : undefined;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !pending && onCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.desc}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field
            label={`${copy.reasonLabel} *`}
            htmlFor="oversight-reason"
            count={reason.length}
            max={REASON_MAX}
            error={serverErrors?.reason ?? (reason.length > REASON_MAX ? tr("Too long.", "Trop long.") : counter(reasonLen))}
            hint={tr("Required. The school sees this text.", "Obligatoire. L'ecole voit ce texte.")}
          >
            <Textarea
              id="oversight-reason"
              rows={4}
              value={reason}
              maxLength={REASON_MAX + 200}
              aria-required="true"
              aria-invalid={Boolean(serverErrors?.reason) || (reasonLen > 0 && !reasonOk)}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          {needsSteps ? (
            <Field
              label={`${tr("What the school must do to resolve this", "Ce que l'ecole doit faire pour resoudre cela")} *`}
              htmlFor="oversight-steps"
              count={steps.length}
              max={REASON_MAX}
              error={serverErrors?.resolution_steps ?? (steps.length > REASON_MAX ? tr("Too long.", "Trop long.") : counter(stepsLen))}
              hint={tr("Required. Clear, numbered steps help the school act fast.", "Obligatoire. Des etapes claires et numerotees aident l'ecole a agir vite.")}
            >
              <Textarea
                id="oversight-steps"
                rows={4}
                value={steps}
                maxLength={REASON_MAX + 200}
                aria-required="true"
                aria-invalid={Boolean(serverErrors?.resolution_steps) || (stepsLen > 0 && !stepsOk)}
                onChange={(e) => setSteps(e.target.value)}
              />
            </Field>
          ) : null}
          {serverErrors?.detail ? <p role="alert" className="text-sm text-destructive">{serverErrors.detail}</p> : null}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onCancel} disabled={pending}>{tr("Cancel", "Annuler")}</Button>
          <Button
            variant={copy.destructive ? "destructive" : "default"}
            disabled={!valid || pending}
            onClick={() => onSubmit(reason.trim(), steps.trim())}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : copy.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
