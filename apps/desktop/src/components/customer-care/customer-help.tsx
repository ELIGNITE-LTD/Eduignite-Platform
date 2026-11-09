"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Inbox, LifeBuoy, Loader2, Plus, Send } from "lucide-react";
import { useI18n } from "@/lib/i18n-context";
import { useEducationCategory } from "@/lib/hooks/useEducationCategory";
import {
  careErrorCode,
  careErrorDetail,
  customerCareService,
  newClientMessageId,
  type CustomerConversation,
} from "@/lib/api/services/customer-care.service";
import { CATEGORY_OPTIONS, CUSTOMER_STATUS_LABELS, STATUS_TONE, formatDateTime, pick } from "@/lib/customer-care-labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadError } from "@/components/ui/load-error";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { MessageBubble } from "./message-bubble";
import { useMessageThread } from "./use-message-thread";

const listKey = ["care", "my", "list"] as const;
const POLL_MS = 12000;

/**
 * /dashboard/help: the customer side. Any signed-in user (school staff and
 * administrators, students, parents, partners) can ask EduIgnite for help and
 * read the answers. Customers never see internal notes or who handles it; they
 * see Customer Care replies with the official identity header.
 */
export function CustomerHelp() {
  const { language } = useI18n();
  const category = useEducationCategory();
  const qc = useQueryClient();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const simple = category === "basic";
  const [selected, setSelected] = useState<string | "new" | null>(null);

  const list = useQuery({
    queryKey: listKey,
    queryFn: () => customerCareService.myConversations(),
    refetchInterval: POLL_MS,
  });
  const refreshList = () => void qc.invalidateQueries({ queryKey: listKey });
  const rows = list.data ?? [];

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#264D73] text-white"><LifeBuoy className="h-5 w-5" aria-hidden /></span>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-[#12314d]">{simple ? t("Help", "Aide") : t("Help / Customer Care", "Aide / Service Client")}</h1>
            <p className="text-xs text-slate-600">{t("Write to the EduIgnite team. We answer here.", "Écrivez à l'équipe EduIgnite. Nous répondons ici.")}</p>
          </div>
        </div>
        <Button className="min-h-[44px] gap-1.5" onClick={() => setSelected("new")}>
          <Plus className="h-4 w-4" /> {simple ? t("Ask for help", "Demander de l'aide") : t("New conversation", "Nouvelle conversation")}
        </Button>
      </header>

      <div className="grid min-h-[30rem] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:h-[calc(100dvh-14rem)] md:grid-cols-[20rem_minmax(0,1fr)]">
        <section className={cn("min-h-0 flex-col border-r border-slate-200", selected ? "hidden md:flex" : "flex")} aria-label={t("My conversations", "Mes conversations")}>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {list.isLoading ? (
              <div className="space-y-2 p-3" aria-busy="true">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
            ) : list.isError ? (
              <div className="p-3"><LoadError message={t("Could not load your conversations.", "Impossible de charger vos conversations.")} onRetry={() => list.refetch()} retrying={list.isFetching} /></div>
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-10 text-center text-sm text-slate-500">
                <Inbox className="h-8 w-8 text-slate-300" aria-hidden />
                {t("You have not written to us yet.", "Vous ne nous avez pas encore écrit.")}
              </div>
            ) : (
              <ul>
                {rows.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => setSelected(c.id)} aria-current={selected === c.id ? "true" : undefined} className={cn("w-full border-b border-slate-100 px-3 py-3 text-left hover:bg-slate-50", selected === c.id && "bg-sky-50")}>
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn("min-w-0 truncate text-sm", c.unread_count ? "font-bold" : "font-medium")}>{c.subject}</p>
                        {c.unread_count > 0 && <span className="shrink-0 rounded-full bg-[#264D73] px-1.5 text-[10px] font-bold text-white" aria-label={`${c.unread_count} ${t("unread", "non lus")}`}>{c.unread_count}</span>}
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <Badge variant="outline" className={cn("px-1.5 py-0 text-[10px]", STATUS_TONE[c.status])}>{pick(language, CUSTOMER_STATUS_LABELS[c.status] as any)}</Badge>
                        <span className="text-[10px] text-slate-500">{formatDateTime(c.last_activity_at, language)}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className={cn("min-h-0 min-w-0 flex-col", selected ? "flex" : "hidden md:flex")} aria-label={t("Conversation", "Conversation")}>
          {selected === "new" ? (
            <NewConversation
              language={language}
              onBack={() => setSelected(null)}
              onCreated={(c) => { refreshList(); setSelected(c.id); }}
            />
          ) : selected ? (
            <MyConversation key={selected} id={selected} language={language} onBack={() => setSelected(null)} onChanged={refreshList} />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center text-sm text-slate-500">
              <LifeBuoy className="h-10 w-10 text-slate-300" aria-hidden />
              {t("Choose a conversation, or start a new one.", "Choisissez une conversation ou commencez-en une.")}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function NewConversation({ language, onBack, onCreated }: { language: string; onBack: () => void; onCreated: (c: CustomerConversation) => void }) {
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("general");
  const [body, setBody] = useState("");
  const [clientId] = useState(newClientMessageId());
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => customerCareService.myStart({ subject: subject.trim(), body: body.trim(), category, client_message_id: clientId }),
    onSuccess: onCreated,
    onError: (e: any) =>
      setError(
        e?.response?.status === 429
          ? t("You have sent several messages in a short time. Please wait a minute and try again.", "Vous avez envoyé plusieurs messages en peu de temps. Patientez une minute.")
          : careErrorDetail(e, t("Your message could not be sent. Please try again.", "Votre message n'a pas pu être envoyé. Réessayez.")),
      ),
  });
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex items-center gap-2 border-b border-slate-200 p-3">
        <Button variant="ghost" size="icon" className="h-9 w-9 md:hidden" onClick={onBack} aria-label={t("Back", "Retour")}><ChevronLeft className="h-5 w-5" /></Button>
        <h2 className="text-base font-bold text-[#12314d]">{t("New conversation", "Nouvelle conversation")}</h2>
      </div>
      <form className="space-y-4 p-4" onSubmit={(e) => { e.preventDefault(); setError(null); create.mutate(); }}>
        <div className="space-y-1.5">
          <Label className="text-xs">{t("What is it about?", "De quoi s'agit-il ?")}</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{CATEGORY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{pick(language, o.label as any)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="help-subject" className="text-xs">{t("Subject", "Objet")}</Label>
          <Input id="help-subject" value={subject} maxLength={160} onChange={(e) => setSubject(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="help-body" className="text-xs">{t("Your message", "Votre message")}</Label>
          <Textarea id="help-body" rows={6} value={body} maxLength={5000} onChange={(e) => setBody(e.target.value)} required />
        </div>
        {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">{error}</p>}
        <Button type="submit" className="min-h-[44px] w-full gap-2 sm:w-auto" disabled={!subject.trim() || !body.trim() || create.isPending}>
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {t("Send", "Envoyer")}
        </Button>
      </form>
    </div>
  );
}

function MyConversation({ id, language, onBack, onChanged }: { id: string; language: string; onBack: () => void; onChanged: () => void }) {
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const qc = useQueryClient();
  const convo = useQuery({ queryKey: ["care", "my", "conversation", id], queryFn: () => customerCareService.myConversation(id), refetchInterval: POLL_MS });
  const thread = useMessageThread(id, customerCareService.myMessages, {
    intervalMs: POLL_MS,
    onNew: () => {
      void customerCareService.myRead(id).catch(() => undefined);
      void qc.invalidateQueries({ queryKey: ["care", "my", "conversation", id] });
      onChanged();
    },
  });
  const [body, setBody] = useState("");
  const [clientId, setClientId] = useState(newClientMessageId());
  const [sendError, setSendError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    customerCareService.myRead(id).then(() => onChanged()).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread.messages.length]);

  const send = useMutation({
    mutationFn: () => customerCareService.mySend(id, { body: body.trim(), client_message_id: clientId }),
    onSuccess: (m) => {
      thread.upsert(m);
      setBody("");
      setClientId(newClientMessageId());
      setSendError(null);
      void qc.invalidateQueries({ queryKey: ["care", "my", "conversation", id] });
      onChanged();
    },
    onError: (e: any) => {
      const code = careErrorCode(e);
      setSendError(
        code === "conversation_closed"
          ? t("This conversation is closed. Please start a new one.", "Cette conversation est close. Commencez-en une nouvelle.")
          : e?.response?.status === 429
            ? t("Too many messages. Please wait a minute.", "Trop de messages. Patientez une minute.")
            : careErrorDetail(e, t("Your message was not sent. Please try again.", "Votre message n'a pas été envoyé. Réessayez.")),
      );
    },
  });

  const c = convo.data;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start gap-2 border-b border-slate-200 p-3">
        <Button variant="ghost" size="icon" className="-ml-1 h-9 w-9 shrink-0 md:hidden" onClick={onBack} aria-label={t("Back to my conversations", "Retour à mes conversations")}><ChevronLeft className="h-5 w-5" /></Button>
        <div className="min-w-0 flex-1">
          <h2 className="break-words text-base font-bold text-[#12314d]">{c?.subject ?? <Skeleton className="h-5 w-48" />}</h2>
          {c && <Badge variant="outline" className={cn("mt-1 px-1.5 py-0 text-[10px]", STATUS_TONE[c.status])}>{pick(language, CUSTOMER_STATUS_LABELS[c.status] as any)}</Badge>}
        </div>
      </div>

      {c?.resolution_summary && (
        <p className="border-b border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          <span className="font-semibold">{t("Resolution", "Résolution")}:</span> {c.resolution_summary}
        </p>
      )}

      <div ref={scroller} className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-slate-50 p-3 sm:p-4" aria-live="polite">
        {thread.loading && !thread.messages.length ? (
          <div className="space-y-3" aria-busy="true"><Skeleton className="h-16 w-2/3" /><Skeleton className="ml-auto h-16 w-2/3" /></div>
        ) : thread.error ? (
          <LoadError message={t("Could not load the messages.", "Impossible de charger les messages.")} onRetry={thread.reload} />
        ) : thread.messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">{t("No messages yet.", "Aucun message.")}</p>
        ) : (
          thread.messages.map((m) => <MessageBubble key={m.id} message={m} language={language} perspective="customer" />)
        )}
      </div>

      {c?.is_closed ? (
        <p className="border-t border-slate-200 bg-slate-100 p-3 text-center text-xs text-slate-600">{t("This conversation is closed. You can start a new one.", "Cette conversation est close. Vous pouvez en commencer une nouvelle.")}</p>
      ) : (
        <form className="space-y-2 border-t border-slate-200 p-3" onSubmit={(e) => { e.preventDefault(); if (body.trim()) send.mutate(); }}>
          {c?.status === "resolved" && <p className="text-[11px] text-slate-600">{t("This was marked resolved. Sending a message will reopen it.", "Cette demande est résolue. Un nouveau message la rouvrira.")}</p>}
          <Label htmlFor="help-reply" className="sr-only">{t("Your reply", "Votre réponse")}</Label>
          <Textarea id="help-reply" rows={3} value={body} maxLength={5000} onChange={(e) => setBody(e.target.value)} placeholder={t("Write your message...", "Écrivez votre message...")} />
          {sendError && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">{sendError}</p>}
          <div className="flex justify-end">
            <Button type="submit" className="min-h-[44px] gap-2" disabled={!body.trim() || send.isPending}>
              {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {t("Send", "Envoyer")}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
