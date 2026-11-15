"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Ban, Loader2, Send, TestTube2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api/errors";
import { outreachService, type OutreachSendResult } from "@/lib/api/services/outreach.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTr } from "@/components/school-website/shared";

export function MessageBox({
  subject,
  body,
  onSubject,
  onBody,
  selectedIds,
  resend,
  dailyCap,
  waiting,
  onChanged,
  onSent,
}: {
  subject: string;
  body: string;
  onSubject: (v: string) => void;
  onBody: (v: string) => void;
  selectedIds: string[];
  resend: boolean;
  dailyCap: number;
  waiting: number;
  onChanged: () => void;
  onSent: () => void;
}) {
  const tr = useTr();
  const { toast } = useToast();
  const [confirmSend, setConfirmSend] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [result, setResult] = useState<OutreachSendResult | null>(null);
  const n = selectedIds.length;
  const ready = subject.trim() !== "" && body.trim() !== "";

  const test = useMutation({
    mutationFn: () => outreachService.sendTest({ subject, body }),
    onSuccess: (r) => toast({ title: tr("Test sent", "Test envoye"), description: tr(`Check the inbox of ${r.sent_to}.`, `Verifiez la boite de ${r.sent_to}.`) }),
    onError: (e) => toast({ variant: "destructive", title: tr("Test not sent", "Test non envoye"), description: getApiErrorMessage(e) }),
  });

  const send = useMutation({
    mutationFn: () => outreachService.send({ subject, body, contact_ids: selectedIds, resend }),
    onSuccess: (r) => {
      setResult(r);
      setConfirmSend(false);
      onSent();
      onChanged();
    },
    onError: (e) => {
      setConfirmSend(false);
      toast({ variant: "destructive", title: tr("Not sent", "Non envoye"), description: getApiErrorMessage(e) });
    },
  });

  const stop = useMutation({
    mutationFn: () => outreachService.cancelWaiting(),
    onSuccess: (r) => {
      setConfirmStop(false);
      toast({ title: tr("Stopped", "Arrete"), description: tr(`${r.cancelled} waiting emails cancelled.`, `${r.cancelled} emails en attente annules.`) });
      onChanged();
    },
    onError: (e) => {
      setConfirmStop(false);
      toast({ variant: "destructive", title: tr("Could not stop", "Impossible d'arreter"), description: getApiErrorMessage(e) });
    },
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-1.5">
        <Label htmlFor="om-subject">{tr("Subject", "Objet")}</Label>
        <Input id="om-subject" value={subject} maxLength={200} onChange={(e) => onSubject(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="om-body">{tr("Message", "Message")}</Label>
        <Textarea id="om-body" rows={9} value={body} maxLength={8000} onChange={(e) => onBody(e.target.value)} />
        <p className="text-xs text-muted-foreground">
          {tr(
            "Tip: write {school_name} and {town} and they are replaced with each school's own name and town.",
            "Astuce : ecrivez {school_name} et {town}, ils sont remplaces par le nom et la ville de chaque ecole.",
          )}
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button variant="outline" disabled={!ready || test.isPending} onClick={() => test.mutate()}>
          {test.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TestTube2 className="mr-2 h-4 w-4" />}
          {tr("Send test to me", "M'envoyer un test")}
        </Button>
        <Button disabled={!ready || n === 0 || send.isPending} onClick={() => setConfirmSend(true)}>
          <Send className="mr-2 h-4 w-4" />
          {resend
            ? tr(`Send again to ${n} selected schools`, `Renvoyer a ${n} ecoles selectionnees`)
            : tr(`Send to ${n} selected schools`, `Envoyer a ${n} ecoles selectionnees`)}
        </Button>
        <Button variant="ghost" className="text-destructive hover:text-destructive sm:ml-auto" disabled={waiting === 0 || stop.isPending} onClick={() => setConfirmStop(true)}>
          <Ban className="mr-2 h-4 w-4" />
          {tr("Stop all waiting emails", "Arreter tous les envois en attente")}
          {waiting ? ` (${waiting})` : ""}
        </Button>
      </div>
      {!ready ? <p className="text-xs text-muted-foreground">{tr("Write a subject and a message to enable sending.", "Ecrivez un objet et un message pour activer l'envoi.")}</p> : null}

      {result ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900" aria-live="polite">
          <p className="font-medium">
            {tr(`${result.queued} emails queued`, `${result.queued} emails mis en file`)}
            {result.sent_now ? tr(` (${result.sent_now} already sent)`, ` (${result.sent_now} deja envoyes)`) : ""}
          </p>
          <p className="mt-1 text-emerald-800">
            {tr(
              `${result.already_contacted} skipped (already contacted), ${result.unsubscribed} skipped (opted out).`,
              `${result.already_contacted} ignorees (deja contactees), ${result.unsubscribed} ignorees (desinscrites).`,
            )}
            {result.bounced || result.already_queued
              ? " " + tr(`${result.bounced} invalid address, ${result.already_queued} already waiting.`, `${result.bounced} adresses invalides, ${result.already_queued} deja en attente.`)
              : ""}
          </p>
        </div>
      ) : null}

      <AlertDialog open={confirmSend} onOpenChange={setConfirmSend}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr(`Send to ${n} schools?`, `Envoyer a ${n} ecoles ?`)}</AlertDialogTitle>
            <AlertDialogDescription>
              {tr(
                `Up to ${dailyCap} emails are sent per day. The rest continue automatically on the following days. You can stop the waiting emails at any time.`,
                `Jusqu'a ${dailyCap} emails sont envoyes par jour. Les autres continuent automatiquement les jours suivants. Vous pouvez arreter les envois en attente a tout moment.`,
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("Cancel", "Annuler")}</AlertDialogCancel>
            <AlertDialogAction disabled={send.isPending} onClick={(e) => { e.preventDefault(); send.mutate(); }}>
              {send.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {tr("Yes, send", "Oui, envoyer")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmStop} onOpenChange={setConfirmStop}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr("Stop all waiting emails?", "Arreter tous les envois en attente ?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {tr(
                "Emails not yet sent will be cancelled. Emails already sent cannot be taken back.",
                "Les emails non encore envoyes seront annules. Ceux deja envoyes ne peuvent pas etre rappeles.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("Keep them", "Les garder")}</AlertDialogCancel>
            <AlertDialogAction disabled={stop.isPending} onClick={(e) => { e.preventDefault(); stop.mutate(); }}>
              {tr("Yes, stop", "Oui, arreter")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
