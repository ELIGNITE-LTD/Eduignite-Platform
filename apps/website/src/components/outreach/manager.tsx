"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CheckCircle2, Clock3, Loader2, Mail, Search, Send, TestTube2, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api/errors";
import { outreachService, type OutreachContact, type OutreachSendResult } from "@/lib/api/services/outreach.service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTr } from "@/components/school-website/shared";

const EMAIL = /[^\s,;<>"'()[\]]+@[^\s,;<>"'()[\]]+\.[^\s,;<>"'()[\]]+/g;

/** Count the distinct addresses in whatever was pasted (commas, spaces, new lines, "Name <a@b.cm>"). */
function countEmails(text: string): number {
  return new Set((text.match(EMAIL) ?? []).map((e) => e.toLowerCase())).size;
}

function statusOf(c: OutreachContact, tr: (en: string, fr: string) => string) {
  if (c.status === "unsubscribed") return { label: tr("Unsubscribed", "Desinscrit"), icon: Ban, cls: "bg-slate-100 text-slate-700" };
  if (c.status === "bounced") return { label: tr("Bounced", "Rejete"), icon: XCircle, cls: "bg-red-100 text-red-700" };
  if (c.status === "failed") return { label: tr("Failed", "Echec"), icon: XCircle, cls: "bg-red-100 text-red-700" };
  if (c.status === "queued") return { label: tr("Waiting", "En attente"), icon: Clock3, cls: "bg-amber-100 text-amber-800" };
  if (c.sent_count > 0) return { label: tr("Sent", "Envoye"), icon: CheckCircle2, cls: "bg-emerald-100 text-emerald-800" };
  return { label: tr("Not sent", "Non envoye"), icon: Mail, cls: "bg-slate-100 text-slate-700" };
}

export function OutreachManager() {
  const tr = useTr();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [emails, setEmails] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [resend, setResend] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [result, setResult] = useState<OutreachSendResult | null>(null);
  const [search, setSearch] = useState("");

  const count = useMemo(() => countEmails(emails), [emails]);
  const ready = count > 0 && subject.trim() !== "" && body.trim() !== "";

  const summary = useQuery({ queryKey: ["outreach", "summary"], queryFn: () => outreachService.summary(), refetchInterval: 30000 });
  const list = useQuery({
    queryKey: ["outreach", "contacts", search],
    queryFn: () => outreachService.contacts({ q: search.trim() || undefined, page_size: 100 }),
    refetchInterval: 30000,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["outreach"] });

  const test = useMutation({
    mutationFn: () => outreachService.sendTest({ subject, body }),
    onSuccess: (r) => toast({ title: tr("Test sent", "Test envoye"), description: tr(`Check the inbox of ${r.sent_to}.`, `Verifiez la boite de ${r.sent_to}.`) }),
    onError: (e) => toast({ variant: "destructive", title: tr("Test not sent", "Test non envoye"), description: getApiErrorMessage(e) }),
  });

  const send = useMutation({
    mutationFn: () => outreachService.send({ emails, subject, body, resend }),
    onSuccess: (r) => {
      setResult(r);
      setConfirmSend(false);
      if (r.queued > 0) setEmails("");
      refresh();
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
      refresh();
    },
    onError: (e) => {
      setConfirmStop(false);
      toast({ variant: "destructive", title: tr("Could not stop", "Impossible d'arreter"), description: getApiErrorMessage(e) });
    },
  });

  const cap = summary.data?.daily_cap ?? 25;
  const waiting = summary.data?.queued ?? 0;
  const rows = list.data?.results ?? [];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 pb-16">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{tr("Email schools", "Ecrire aux ecoles")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {tr("Type or paste the email addresses, write your message and send. Replies come to info@eduignite.online.",
            "Saisissez ou collez les adresses email, ecrivez votre message et envoyez. Les reponses arrivent sur info@eduignite.online.")}
        </p>
      </header>

      <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
        <div className="space-y-2">
          <div className="flex items-end justify-between">
            <Label htmlFor="to" className="text-sm font-semibold">{tr("To", "A")}</Label>
            <span className="text-xs text-muted-foreground">
              {count === 0 ? tr("No address yet", "Aucune adresse") : tr(`${count} address${count > 1 ? "es" : ""}`, `${count} adresse${count > 1 ? "s" : ""}`)}
            </span>
          </div>
          <Textarea
            id="to"
            rows={4}
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            placeholder={tr("info@school1.cm, admissions@school2.cm\nOne per line or separated by commas",
              "info@ecole1.cm, admissions@ecole2.cm\nUne par ligne ou separees par des virgules")}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="subject" className="text-sm font-semibold">{tr("Subject", "Objet")}</Label>
          <Input id="subject" value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)}
            placeholder={tr("Manage your school with EduIgnite", "Gerez votre ecole avec EduIgnite")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="body" className="text-sm font-semibold">{tr("Message", "Message")}</Label>
          <Textarea id="body" rows={9} value={body} maxLength={8000} onChange={(e) => setBody(e.target.value)}
            placeholder={tr("Hello,\n\nWe are EduIgnite, ...", "Bonjour,\n\nNous sommes EduIgnite, ...")} />
          <p className="text-xs text-muted-foreground">
            {tr("An unsubscribe link and the EduIgnite Team signature are added automatically.",
              "Un lien de desinscription et la signature de l'equipe EduIgnite sont ajoutes automatiquement.")}
          </p>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox checked={resend} onCheckedChange={(v) => setResend(v === true)} />
          {tr("Also send to addresses I already emailed", "Envoyer aussi aux adresses deja contactees")}
        </label>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button disabled={!ready || send.isPending} onClick={() => setConfirmSend(true)} className="gap-2">
            {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {count > 0 ? tr(`Send to ${count}`, `Envoyer a ${count}`) : tr("Send", "Envoyer")}
          </Button>
          <Button variant="outline" disabled={subject.trim() === "" || body.trim() === "" || test.isPending} onClick={() => test.mutate()} className="gap-2">
            {test.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube2 className="h-4 w-4" />}
            {tr("Send a test to me", "M'envoyer un test")}
          </Button>
        </div>
      </section>

      {result && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900" role="status">
          <p className="font-semibold">
            {result.queued > 0
              ? tr(`${result.queued} email${result.queued > 1 ? "s" : ""} on the way.`, `${result.queued} email${result.queued > 1 ? "s" : ""} en route.`)
              : tr("Nothing was sent.", "Rien n'a ete envoye.")}
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {result.sent_now > 0 && <li>{tr(`${result.sent_now} sent now.`, `${result.sent_now} envoye(s) maintenant.`)}</li>}
            {result.queued > result.sent_now && (
              <li>{tr(`The rest go out automatically, up to ${result.daily_cap} per day, so your emails are not marked as spam.`,
                `Le reste part automatiquement, jusqu'a ${result.daily_cap} par jour, pour eviter le courrier indesirable.`)}</li>
            )}
            {result.already_contacted > 0 && <li>{tr(`${result.already_contacted} skipped: already emailed.`, `${result.already_contacted} ignore(s) : deja contacte(s).`)}</li>}
            {result.unsubscribed > 0 && <li>{tr(`${result.unsubscribed} skipped: unsubscribed.`, `${result.unsubscribed} ignore(s) : desinscrit(s).`)}</li>}
            {result.bounced > 0 && <li>{tr(`${result.bounced} skipped: address did not work before.`, `${result.bounced} ignore(s) : adresse invalide.`)}</li>}
            {result.invalid.length > 0 && <li>{tr(`Not valid addresses: ${result.invalid.slice(0, 5).join(", ")}`, `Adresses invalides : ${result.invalid.slice(0, 5).join(", ")}`)}</li>}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{tr("Emails sent", "Emails envoyes")}</h2>
          <div className="flex items-center gap-2">
            {waiting > 0 && (
              <Button variant="outline" size="sm" onClick={() => setConfirmStop(true)} className="gap-1.5 text-destructive">
                <Ban className="h-3.5 w-3.5" />
                {tr(`Stop ${waiting} waiting`, `Arreter ${waiting} en attente`)}
              </Button>
            )}
          </div>
        </div>
        {summary.data && (
          <p className="text-xs text-muted-foreground">
            {tr(`${summary.data.sent_today} of ${cap} sent today · ${summary.data.totals.contacted} addresses contacted in total`,
              `${summary.data.sent_today} sur ${cap} envoyes aujourd'hui · ${summary.data.totals.contacted} adresses contactees au total`)}
          </p>
        )}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tr("Search an address", "Rechercher une adresse")} />
        </div>
        {list.isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : list.isError ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-destructive">{getApiErrorMessage(list.error)}</p>
        ) : rows.length === 0 ? (
          <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            {tr("Nothing here yet. Addresses appear after you send.", "Rien pour l'instant. Les adresses apparaissent apres un envoi.")}
          </p>
        ) : (
          <ul className="divide-y rounded-2xl border bg-card">
            {rows.map((c) => {
              const st = statusOf(c, tr);
              const Icon = st.icon;
              return (
                <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.last_sent_at
                        ? tr(`Last sent ${new Date(c.last_sent_at).toLocaleString()}`, `Dernier envoi ${new Date(c.last_sent_at).toLocaleString()}`)
                        : c.last_error || tr("Not sent yet", "Pas encore envoye")}
                      {c.sent_count > 1 ? ` · ${c.sent_count}×` : ""}
                    </p>
                  </div>
                  <Badge variant="secondary" className={`shrink-0 gap-1 ${st.cls}`}>
                    <Icon className="h-3 w-3" />
                    {st.label}
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <AlertDialog open={confirmSend} onOpenChange={setConfirmSend}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr(`Send to ${count} address${count > 1 ? "es" : ""}?`, `Envoyer a ${count} adresse${count > 1 ? "s" : ""} ?`)}</AlertDialogTitle>
            <AlertDialogDescription>
              {tr(`Up to ${cap} emails go out per day; the rest follow automatically on the next days. Anyone who unsubscribed is skipped.`,
                `Jusqu'a ${cap} emails partent par jour ; le reste suit automatiquement les jours suivants. Les personnes desinscrites sont ignorees.`)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("Cancel", "Annuler")}</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); send.mutate(); }}>
              {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : tr("Send", "Envoyer")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmStop} onOpenChange={setConfirmStop}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr("Stop all waiting emails?", "Arreter tous les emails en attente ?")}</AlertDialogTitle>
            <AlertDialogDescription>{tr("Emails already sent are not affected.", "Les emails deja envoyes ne sont pas concernes.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("Keep sending", "Continuer")}</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); stop.mutate(); }}>{tr("Stop them", "Les arreter")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
