"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CheckCircle2, Clock3, Loader2, Mail, MessageCircle, Search, Send, TestTube2, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api/errors";
import { outreachService, type OutreachChannel, type OutreachContact, type OutreachSendResult } from "@/lib/api/services/outreach.service";
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

const PHONE = /\+?\d[\d\s().-]{7,}\d/g;

/** Count the distinct numbers pasted (one per line or separated by commas/semicolons). */
function countPhones(text: string): number {
  return new Set(text.split(/[\n,;]+/).map((c) => (c.match(PHONE)?.[0] ?? "").replace(/\D/g, "")).filter((d) => d.length >= 9 && d.length <= 15)).size;
}

function statusOf(c: OutreachContact, tr: (en: string, fr: string) => string, channel: OutreachChannel = "email") {
  if (channel === "whatsapp") {
    if (c.status === "unsubscribed") return { label: tr("Unsubscribed", "Desinscrit"), icon: Ban, cls: "bg-slate-100 text-slate-700" };
    if (c.whatsapp_sent_count > 0) return { label: tr("Sent", "Envoye"), icon: CheckCircle2, cls: "bg-emerald-100 text-emerald-800" };
    if (c.last_error && c.sent_count === 0) return { label: tr("Failed", "Echec"), icon: XCircle, cls: "bg-red-100 text-red-700" };
    return { label: tr("Not sent", "Non envoye"), icon: MessageCircle, cls: "bg-slate-100 text-slate-700" };
  }
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
  const [channel, setChannel] = useState<OutreachChannel>("email");
  const [emails, setEmails] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [resend, setResend] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [result, setResult] = useState<OutreachSendResult | null>(null);
  const [search, setSearch] = useState("");

  const wa = channel === "whatsapp";
  const count = useMemo(() => (wa ? countPhones(emails) : countEmails(emails)), [emails, wa]);
  const ready = count > 0 && (wa || subject.trim() !== "") && body.trim() !== "";

  const summary = useQuery({ queryKey: ["outreach", "summary"], queryFn: () => outreachService.summary(), refetchInterval: 30000 });
  const list = useQuery({
    queryKey: ["outreach", "contacts", search],
    queryFn: () => outreachService.contacts({ q: search.trim() || undefined, page_size: 100 }),
    refetchInterval: 30000,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["outreach"] });

  const test = useMutation({
    mutationFn: () => outreachService.sendTest({ subject, body, channel }),
    onSuccess: (r) => toast({ title: tr("Test sent", "Test envoye"), description: wa ? tr(`Check WhatsApp on ${r.sent_to}.`, `Verifiez WhatsApp sur ${r.sent_to}.`) : tr(`Check the inbox of ${r.sent_to}.`, `Verifiez la boite de ${r.sent_to}.`) }),
    onError: (e) => toast({ variant: "destructive", title: tr("Test not sent", "Test non envoye"), description: getApiErrorMessage(e) }),
  });

  const send = useMutation({
    mutationFn: () => outreachService.send({ ...(wa ? { phones: emails } : { emails }), subject, body, resend, channel }),
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
    mutationFn: () => outreachService.cancelWaiting(channel),
    onSuccess: (r) => {
      setConfirmStop(false);
      toast({ title: tr("Stopped", "Arrete"), description: tr(`${r.cancelled} waiting messages cancelled.`, `${r.cancelled} messages en attente annules.`) });
      refresh();
    },
    onError: (e) => {
      setConfirmStop(false);
      toast({ variant: "destructive", title: tr("Could not stop", "Impossible d'arreter"), description: getApiErrorMessage(e) });
    },
  });

  const waSummary = summary.data?.whatsapp;
  const cap = (wa ? waSummary?.daily_cap : summary.data?.daily_cap) ?? 25;
  const waiting = (wa ? waSummary?.queued : summary.data?.queued) ?? 0;
  const rows = (list.data?.results ?? []).filter((c) => (wa ? !!c.phone : !!c.email));

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 pb-16">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{tr("Reach schools", "Contacter les ecoles")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {wa
            ? tr("Type or paste WhatsApp numbers, write your message and send. Replies come to the EduIgnite WhatsApp number.",
              "Saisissez ou collez les numeros WhatsApp, ecrivez votre message et envoyez. Les reponses arrivent sur le numero WhatsApp d'EduIgnite.")
            : tr("Type or paste the email addresses, write your message and send. Replies come to info@eduignite.online.",
              "Saisissez ou collez les adresses email, ecrivez votre message et envoyez. Les reponses arrivent sur info@eduignite.online.")}
        </p>
        <div role="tablist" className="mt-4 inline-flex rounded-xl bg-muted p-1">
          {([["email", Mail, tr("Email", "Email")], ["whatsapp", MessageCircle, "WhatsApp"]] as const).map(([key, Icon, label]) => (
            <button key={key} role="tab" aria-selected={channel === key} onClick={() => { setChannel(key); setEmails(""); setResult(null); }}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold ${channel === key ? "bg-white text-primary shadow-sm" : "text-muted-foreground"}`}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </div>
        {wa && waSummary && !waSummary.configured && (
          <p role="alert" className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            {tr("WhatsApp is not connected yet. Add the WhatsApp access token and phone number id on the Integrations page, then messages can be sent.",
              "WhatsApp n'est pas encore connecte. Ajoutez le jeton d'acces WhatsApp et l'identifiant du numero sur la page Integrations.")}
          </p>
        )}
        {wa && waSummary?.configured && !waSummary.uses_template && (
          <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            {tr("WhatsApp only delivers plain messages to people who wrote to you in the last 24 hours. To contact new schools, an approved WhatsApp message template must be set up (OUTREACH_WHATSAPP_TEMPLATE).",
              "WhatsApp ne livre les messages simples qu'aux personnes qui vous ont ecrit ces dernieres 24 heures. Pour contacter de nouvelles ecoles, un modele de message WhatsApp approuve est necessaire (OUTREACH_WHATSAPP_TEMPLATE).")}
          </p>
        )}
      </header>

      <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
        <div className="space-y-2">
          <div className="flex items-end justify-between">
            <Label htmlFor="to" className="text-sm font-semibold">{tr("To", "A")}</Label>
            <span className="text-xs text-muted-foreground">
              {count === 0 ? (wa ? tr("No number yet", "Aucun numero") : tr("No address yet", "Aucune adresse"))
                : wa ? tr(`${count} number${count > 1 ? "s" : ""}`, `${count} numero${count > 1 ? "s" : ""}`)
                : tr(`${count} address${count > 1 ? "es" : ""}`, `${count} adresse${count > 1 ? "s" : ""}`)}
            </span>
          </div>
          <Textarea
            id="to"
            rows={4}
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            placeholder={wa
              ? tr("677 12 34 56, 699 00 11 22\nOne per line or separated by commas. Numbers without a country code are read as Cameroon (+237).",
                "677 12 34 56, 699 00 11 22\nUn par ligne ou separes par des virgules. Sans indicatif pays, le Cameroun (+237) est utilise.")
              : tr("info@school1.cm, admissions@school2.cm\nOne per line or separated by commas",
                "info@ecole1.cm, admissions@ecole2.cm\nUne par ligne ou separees par des virgules")}
          />
        </div>
        {!wa && <div className="space-y-2">
          <Label htmlFor="subject" className="text-sm font-semibold">{tr("Subject", "Objet")}</Label>
          <Input id="subject" value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)}
            placeholder={tr("Manage your school with EduIgnite", "Gerez votre ecole avec EduIgnite")} />
        </div>}
        <div className="space-y-2">
          <Label htmlFor="body" className="text-sm font-semibold">{tr("Message", "Message")}</Label>
          <Textarea id="body" rows={9} value={body} maxLength={8000} onChange={(e) => setBody(e.target.value)}
            placeholder={tr("Hello,\n\nWe are EduIgnite, ...", "Bonjour,\n\nNous sommes EduIgnite, ...")} />
          <p className="text-xs text-muted-foreground">
            {wa ? tr("Use {school_name} to put each school's name in the message. An opt-out link and the EduIgnite Team signature are added automatically.",
              "Utilisez {school_name} pour inserer le nom de chaque ecole. Un lien de desinscription et la signature d'EduIgnite sont ajoutes automatiquement.")
              : tr("An unsubscribe link and the EduIgnite Team signature are added automatically.",
              "Un lien de desinscription et la signature de l'equipe EduIgnite sont ajoutes automatiquement.")}
          </p>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox checked={resend} onCheckedChange={(v) => setResend(v === true)} />
          {wa ? tr("Also send to numbers I already messaged", "Envoyer aussi aux numeros deja contactes") : tr("Also send to addresses I already emailed", "Envoyer aussi aux adresses deja contactees")}
        </label>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button disabled={!ready || send.isPending} onClick={() => setConfirmSend(true)} className="gap-2">
            {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {count > 0 ? tr(`Send to ${count}`, `Envoyer a ${count}`) : tr("Send", "Envoyer")}
          </Button>
          <Button variant="outline" disabled={(!wa && subject.trim() === "") || body.trim() === "" || test.isPending} onClick={() => test.mutate()} className="gap-2">
            {test.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube2 className="h-4 w-4" />}
            {tr("Send a test to me", "M'envoyer un test")}
          </Button>
        </div>
      </section>

      {result && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900" role="status">
          <p className="font-semibold">
            {result.queued > 0
              ? tr(`${result.queued} ${wa ? "message" : "email"}${result.queued > 1 ? "s" : ""} on the way.`, `${result.queued} ${wa ? "message" : "email"}${result.queued > 1 ? "s" : ""} en route.`)
              : tr("Nothing was sent.", "Rien n'a ete envoye.")}
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {result.sent_now > 0 && <li>{tr(`${result.sent_now} sent now.`, `${result.sent_now} envoye(s) maintenant.`)}</li>}
            {result.queued > result.sent_now && (
              <li>{tr(`The rest go out automatically, up to ${result.daily_cap} per day, so your emails are not marked as spam.`,
                `Le reste part automatiquement, jusqu'a ${result.daily_cap} par jour, pour eviter le courrier indesirable.`)}</li>
            )}
            {(result.no_address ?? 0) > 0 && <li>{tr(`${result.no_address} skipped: no ${wa ? "valid WhatsApp number" : "email address"}.`, `${result.no_address} ignore(s) : ${wa ? "pas de numero WhatsApp valide" : "pas d'adresse email"}.`)}</li>}
            {result.already_contacted > 0 && <li>{tr(`${result.already_contacted} skipped: already emailed.`, `${result.already_contacted} ignore(s) : deja contacte(s).`)}</li>}
            {result.unsubscribed > 0 && <li>{tr(`${result.unsubscribed} skipped: unsubscribed.`, `${result.unsubscribed} ignore(s) : desinscrit(s).`)}</li>}
            {result.bounced > 0 && <li>{tr(`${result.bounced} skipped: address did not work before.`, `${result.bounced} ignore(s) : adresse invalide.`)}</li>}
            {result.invalid.length > 0 && <li>{tr(`Not valid addresses: ${result.invalid.slice(0, 5).join(", ")}`, `Adresses invalides : ${result.invalid.slice(0, 5).join(", ")}`)}</li>}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{wa ? tr("Messages sent", "Messages envoyes") : tr("Emails sent", "Emails envoyes")}</h2>
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
            {tr(`${wa ? waSummary?.sent_today ?? 0 : summary.data.sent_today} of ${cap} sent today · ${wa ? waSummary?.contacted ?? 0 : summary.data.totals.contacted} ${wa ? "numbers" : "addresses"} contacted in total`,
              `${wa ? waSummary?.sent_today ?? 0 : summary.data.sent_today} sur ${cap} envoyes aujourd'hui · ${wa ? waSummary?.contacted ?? 0 : summary.data.totals.contacted} ${wa ? "numeros" : "adresses"} contactes au total`)}
          </p>
        )}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={wa ? tr("Search a school or number", "Rechercher une ecole ou un numero") : tr("Search an address", "Rechercher une adresse")} />
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
              const st = statusOf(c, tr, channel);
              const Icon = st.icon;
              return (
                <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{wa ? c.phone : c.email}{wa && c.school_name && c.school_name !== c.phone ? <span className="ml-2 text-xs font-normal text-muted-foreground">{c.school_name}</span> : null}</p>
                    <p className="text-xs text-muted-foreground">
                      {(wa ? c.last_whatsapp_at : c.last_sent_at)
                        ? tr(`Last sent ${new Date((wa ? c.last_whatsapp_at : c.last_sent_at) as string).toLocaleString()}`, `Dernier envoi ${new Date((wa ? c.last_whatsapp_at : c.last_sent_at) as string).toLocaleString()}`)
                        : c.last_error || tr("Not sent yet", "Pas encore envoye")}
                      {(wa ? c.whatsapp_sent_count : c.sent_count) > 1 ? ` · ${wa ? c.whatsapp_sent_count : c.sent_count}×` : ""}
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
            <AlertDialogTitle>{tr(`Send to ${count} ${wa ? "number" : "address"}${count > 1 ? (wa ? "s" : "es") : ""}?`, `Envoyer a ${count} ${wa ? "numero" : "adresse"}${count > 1 ? "s" : ""} ?`)}</AlertDialogTitle>
            <AlertDialogDescription>
              {tr(`Up to ${cap} ${wa ? "messages" : "emails"} go out per day; the rest follow automatically on the next days. Anyone who unsubscribed is skipped.`,
                `Jusqu'a ${cap} ${wa ? "messages" : "emails"} partent par jour ; le reste suit automatiquement les jours suivants. Les personnes desinscrites sont ignorees.`)}
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
            <AlertDialogTitle>{wa ? tr("Stop all waiting WhatsApp messages?", "Arreter tous les messages WhatsApp en attente ?") : tr("Stop all waiting emails?", "Arreter tous les emails en attente ?")}</AlertDialogTitle>
            <AlertDialogDescription>{tr("Messages already sent are not affected.", "Les messages deja envoyes ne sont pas concernes.")}</AlertDialogDescription>
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
