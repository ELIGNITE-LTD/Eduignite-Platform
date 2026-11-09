"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarClock,
  ChevronLeft,
  Copy,
  ExternalLink,
  Loader2,
  Lock,
  RefreshCw,
  UserCheck,
  UserCog,
} from "lucide-react";
import { useI18n } from "@/lib/i18n-context";
import {
  careErrorCode,
  careErrorDetail,
  customerCareService,
  type CareExecutive,
  type CareMessage,
  type ConversationStatus,
  type StaffConversationDetail,
  type WhatsappOutcome,
} from "@/lib/api/services/customer-care.service";
import {
  EVENT_LABELS,
  OUTCOME_LABELS,
  STATUS_LABELS,
  STATUS_TONE,
  formatDateTime,
  pick,
} from "@/lib/customer-care-labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadError } from "@/components/ui/load-error";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { MessageBubble } from "./message-bubble";
import { StaffComposer } from "./staff-composer";
import { useMessageThread } from "./use-message-thread";

const CHANGEABLE: ConversationStatus[] = ["open", "in_progress", "awaiting_customer", "awaiting_internal", "resolved", "closed"];

type DialogKind = null | "resolve" | "close" | "reassign" | "follow";

function toLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function StaffDetail({
  conversationId,
  isFounder,
  meId,
  executives,
  onBack,
  onChanged,
}: {
  conversationId: string;
  isFounder: boolean;
  meId?: string;
  executives: CareExecutive[] | null;
  onBack: () => void;
  onChanged: () => void;
}) {
  const { language } = useI18n();
  const { toast } = useToast();
  const qc = useQueryClient();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [waUrls, setWaUrls] = useState<Record<number, string>>({});
  const scroller = useRef<HTMLDivElement>(null);

  const detailKey = ["care", "conversation", conversationId] as const;
  const detail = useQuery<StaffConversationDetail>({
    queryKey: detailKey,
    queryFn: () => customerCareService.conversation(conversationId),
  });
  const thread = useMessageThread(conversationId, customerCareService.messages, {
    onNew: () => {
      void customerCareService.markRead(conversationId).catch(() => undefined);
      void qc.invalidateQueries({ queryKey: detailKey });
      onChanged();
    },
  });

  // Opening a conversation clears its unread badge.
  useEffect(() => {
    customerCareService
      .markRead(conversationId)
      .then(() => onChanged())
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread.messages.length]);

  const refreshAll = () => {
    void qc.invalidateQueries({ queryKey: detailKey });
    void thread.refresh();
    onChanged();
  };

  const fail = (error: any, fallback: string) =>
    toast({ variant: "destructive", title: t("Action failed", "Action échouée"), description: careErrorDetail(error, fallback) });

  const statusMutation = useMutation({
    mutationFn: (payload: { status: ConversationStatus; resolution_summary?: string }) =>
      customerCareService.setStatus(conversationId, payload),
    onSuccess: () => { refreshAll(); toast({ title: t("Status updated", "Statut mis à jour") }); },
    onError: (e) => fail(e, t("Could not change the status.", "Impossible de changer le statut.")),
  });
  const resolveMutation = useMutation({
    mutationFn: (summary: string) => customerCareService.resolve(conversationId, summary),
    onSuccess: () => { setDialog(null); refreshAll(); toast({ title: t("Conversation resolved", "Conversation résolue") }); },
    onError: (e) => fail(e, t("Could not resolve.", "Impossible de résoudre.")),
  });
  const reopenMutation = useMutation({
    mutationFn: () => customerCareService.reopen(conversationId),
    onSuccess: () => { refreshAll(); toast({ title: t("Conversation reopened", "Conversation rouverte") }); },
    onError: (e) => fail(e, t("Could not reopen.", "Impossible de rouvrir.")),
  });
  const claimMutation = useMutation({
    mutationFn: () => customerCareService.claim(conversationId),
    onSuccess: () => { refreshAll(); toast({ title: t("Assigned to you", "Assignée à vous") }); },
    onError: (e) => fail(e, t("Could not take this conversation.", "Impossible de prendre cette conversation.")),
  });

  const c = detail.data;
  const finished = c ? c.status === "resolved" || c.status === "closed" : false;
  const closed = c?.status === "closed";

  const onSelectStatus = (value: string) => {
    if (!c || value === c.status) return;
    if (value === "resolved") setDialog("resolve");
    else if (value === "closed") setDialog("close");
    else statusMutation.mutate({ status: value as ConversationStatus });
  };

  if (detail.isLoading) {
    return (
      <div className="space-y-3 p-4" aria-busy="true">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (detail.isError || !c) {
    return (
      <div className="space-y-3 p-4">
        <Button variant="ghost" size="sm" className="gap-1 lg:hidden" onClick={onBack}>
          <ChevronLeft className="h-4 w-4" /> {t("Back", "Retour")}
        </Button>
        <LoadError
          message={t("Could not load this conversation (it may not be visible to you).", "Impossible de charger cette conversation.")}
          onRetry={() => detail.refetch()}
          retrying={detail.isFetching}
        />
      </div>
    );
  }

  const canClaim = !isFounder && !c.assigned_to;
  const assignedToMe = Boolean(meId && c.assigned_to?.id === meId);

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      {/* Header */}
      <div className="space-y-2 border-b border-slate-200 p-3 sm:p-4">
        <div className="flex items-start gap-2">
          <Button variant="ghost" size="icon" className="-ml-2 h-9 w-9 shrink-0 lg:hidden" onClick={onBack} aria-label={t("Back to conversations", "Retour aux conversations")}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h2 className="break-words text-base font-bold leading-snug text-[#12314d] sm:text-lg">{c.subject}</h2>
            <p className="truncate text-xs text-slate-600">
              {c.customer.name} - {c.customer.role_label}
              {c.school ? ` - ${c.school.name}` : ""}
            </p>
          </div>
          <Badge variant="outline" className={cn("shrink-0", STATUS_TONE[c.status])}>
            {pick(language, STATUS_LABELS[c.status] as any)}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1">
            <UserCheck className="h-3.5 w-3.5" aria-hidden />
            {c.assigned_to ? c.assigned_to.name : t("Unassigned", "Non assignée")}
          </span>
          {c.follow_up_at && (
            <span className={cn("inline-flex items-center gap-1", c.is_follow_up_overdue && "font-semibold text-red-700")}>
              <CalendarClock className="h-3.5 w-3.5" aria-hidden />
              {t("Follow-up", "Suivi")}: {formatDateTime(c.follow_up_at, language)}
              {c.is_follow_up_overdue ? ` (${t("overdue", "en retard")})` : ""}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={c.status === "new" ? "" : c.status} onValueChange={onSelectStatus} disabled={statusMutation.isPending}>
            <SelectTrigger className="h-9 w-[180px]" aria-label={t("Change status", "Changer le statut")}>
              <SelectValue placeholder={pick(language, STATUS_LABELS[c.status] as any)} />
            </SelectTrigger>
            <SelectContent>
              {CHANGEABLE.map((s) => (
                <SelectItem key={s} value={s}>{pick(language, STATUS_LABELS[s] as any)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {finished ? (
            <Button size="sm" variant="outline" onClick={() => reopenMutation.mutate()} disabled={reopenMutation.isPending} className="gap-1">
              {reopenMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {t("Reopen", "Rouvrir")}
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setDialog("resolve")}>{t("Resolve", "Résoudre")}</Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setDialog("follow")} className="gap-1">
            <CalendarClock className="h-3.5 w-3.5" /> {t("Follow-up", "Suivi")}
          </Button>
          {isFounder && (
            <Button size="sm" variant="outline" onClick={() => setDialog("reassign")} className="gap-1">
              <UserCog className="h-3.5 w-3.5" /> {c.assigned_to ? t("Reassign", "Réassigner") : t("Assign", "Assigner")}
            </Button>
          )}
          {canClaim && (
            <Button size="sm" onClick={() => claimMutation.mutate()} disabled={claimMutation.isPending} className="gap-1">
              <UserCheck className="h-3.5 w-3.5" /> {t("Take this conversation", "Prendre en charge")}
            </Button>
          )}
        </div>
        {!isFounder && c.assigned_to && !assignedToMe && (
          <p className="text-[11px] text-slate-500">{t("Assigned to", "Assignée à")} {c.assigned_to.name}.</p>
        )}
      </div>

      <Tabs defaultValue="messages" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-3 mt-2 grid w-auto grid-cols-4 sm:mx-4">
          <TabsTrigger value="messages">{t("Messages", "Messages")}</TabsTrigger>
          <TabsTrigger value="details">{t("Details", "Détails")}</TabsTrigger>
          <TabsTrigger value="notes" className="gap-1"><Lock className="h-3 w-3" aria-hidden />{t("Notes", "Notes")}</TabsTrigger>
          <TabsTrigger value="activity">{t("Activity", "Activité")}</TabsTrigger>
        </TabsList>

        <TabsContent value="messages" className="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
          <div ref={scroller} className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-slate-50 p-3 sm:p-4" aria-live="polite">
            {thread.loading && !thread.messages.length ? (
              <div className="space-y-3" aria-busy="true"><Skeleton className="h-16 w-2/3" /><Skeleton className="ml-auto h-16 w-2/3" /></div>
            ) : thread.error ? (
              <LoadError message={t("Could not load the messages.", "Impossible de charger les messages.")} onRetry={thread.reload} />
            ) : thread.messages.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">{t("No messages yet.", "Aucun message pour l'instant.")}</p>
            ) : (
              thread.messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  language={language}
                  perspective="staff"
                  actions={
                    m.direction === "outbound" && m.channel === "email" && (m.delivery_status === "failed") ? (
                      <RetryEmail conversationId={c.id} message={m} onUpdated={(u) => { thread.upsert(u); onChanged(); }} language={language} />
                    ) : m.direction === "outbound" && m.channel === "whatsapp" ? (
                      <WhatsappActions
                        conversationId={c.id}
                        message={m}
                        url={waUrls[m.id]}
                        language={language}
                        onUpdated={(u) => { thread.upsert(u); onChanged(); }}
                      />
                    ) : null
                  }
                />
              ))
            )}
          </div>
          {closed ? (
            <p className="border-t border-slate-200 bg-slate-100 p-3 text-center text-xs text-slate-600">
              {t("This conversation is closed. Reopen it to reply.", "Cette conversation est close. Rouvrez-la pour répondre.")}
            </p>
          ) : (
            <StaffComposer
              conversation={c}
              onSent={(m) => { thread.upsert(m); refreshAll(); }}
              onWhatsappPrepared={(m, url) => { setWaUrls((prev) => ({ ...prev, [m.id]: url })); thread.upsert(m); }}
            />
          )}
        </TabsContent>

        <TabsContent value="details" className="mt-0 min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 data-[state=inactive]:hidden">
          <DetailsTab c={c} language={language} />
        </TabsContent>

        <TabsContent value="notes" className="mt-0 min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 data-[state=inactive]:hidden">
          <NotesTab conversation={c} language={language} onAdded={() => qc.invalidateQueries({ queryKey: detailKey })} />
        </TabsContent>

        <TabsContent value="activity" className="mt-0 min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 data-[state=inactive]:hidden">
          <ActivityTab c={c} language={language} />
        </TabsContent>
      </Tabs>

      <ResolveDialog
        open={dialog === "resolve"}
        onOpenChange={(o) => !o && setDialog(null)}
        busy={resolveMutation.isPending}
        language={language}
        initial={c.resolution_summary}
        onConfirm={(summary) => resolveMutation.mutate(summary)}
      />
      <CloseDialog
        open={dialog === "close"}
        onOpenChange={(o) => !o && setDialog(null)}
        busy={statusMutation.isPending}
        language={language}
        onConfirm={() => statusMutation.mutate({ status: "closed", resolution_summary: c.resolution_summary }, { onSuccess: () => setDialog(null) })}
      />
      <FollowUpDialog
        open={dialog === "follow"}
        onOpenChange={(o) => !o && setDialog(null)}
        language={language}
        conversation={c}
        onSaved={() => { setDialog(null); refreshAll(); }}
      />
      {isFounder && (
        <ReassignDialog
          open={dialog === "reassign"}
          onOpenChange={(o) => !o && setDialog(null)}
          language={language}
          conversation={c}
          executives={executives}
          onSaved={() => { setDialog(null); refreshAll(); }}
        />
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- tabs */

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-2 border-b border-slate-100 py-2 text-sm last:border-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words text-slate-900">{children || <span className="text-slate-400">-</span>}</dd>
    </div>
  );
}

function DetailsTab({ c, language }: { c: StaffConversationDetail; language: string }) {
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  return (
    <dl>
      <Row label={t("Customer", "Client")}>{c.customer.name}</Row>
      <Row label={t("Role", "Rôle")}>{c.customer.role_label}</Row>
      <Row label="Email">{c.customer.email}</Row>
      <Row label={t("Phone", "Téléphone")}>{c.customer.phone}</Row>
      <Row label="WhatsApp">{c.customer.whatsapp}</Row>
      <Row label={t("School", "École")}>{c.school?.name}</Row>
      <Row label={t("Group", "Groupe")}>{c.group?.name}</Row>
      <Row label={t("Assigned to", "Assignée à")}>{c.assigned_to ? `${c.assigned_to.name} (${c.assigned_to.role_label})` : t("Unassigned", "Non assignée")}</Row>
      <Row label={t("Status", "Statut")}>{pick(language, STATUS_LABELS[c.status] as any)}</Row>
      <Row label={t("Started", "Début")}>{formatDateTime(c.created_at, language)}</Row>
      <Row label={t("Follow-up", "Suivi")}>
        {c.follow_up_at ? `${formatDateTime(c.follow_up_at, language)}${c.follow_up_note ? ` - ${c.follow_up_note}` : ""}` : ""}
      </Row>
      <Row label={t("Resolution", "Résolution")}>{c.resolution_summary}</Row>
    </dl>
  );
}

function NotesTab({ conversation, language, onAdded }: { conversation: StaffConversationDetail; language: string; onAdded: () => void }) {
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const { toast } = useToast();
  const [body, setBody] = useState("");
  const add = useMutation({
    mutationFn: () => customerCareService.addNote(conversation.id, body.trim()),
    onSuccess: () => { setBody(""); onAdded(); },
    onError: (e) => toast({ variant: "destructive", title: t("Could not save the note", "Note non enregistrée"), description: careErrorDetail(e) }),
  });
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
        <Lock className="h-4 w-4 shrink-0" aria-hidden />
        {t("Internal - customers cannot see this", "Interne - les clients ne peuvent pas voir ceci")}
      </p>
      <div className="space-y-2">
        <Label htmlFor="care-note" className="text-xs">{t("Add an internal note", "Ajouter une note interne")}</Label>
        <Textarea id="care-note" rows={3} value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} />
        <div className="flex justify-end">
          <Button size="sm" onClick={() => add.mutate()} disabled={!body.trim() || add.isPending}>
            {add.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} {t("Save note", "Enregistrer")}
          </Button>
        </div>
      </div>
      <ul className="space-y-2">
        {conversation.notes.length === 0 && <li className="text-sm text-slate-500">{t("No notes yet.", "Aucune note.")}</li>}
        {conversation.notes.map((n) => (
          <li key={n.id} className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-sm">
            <p className="whitespace-pre-wrap break-words">{n.body}</p>
            <p className="mt-1 text-[11px] text-slate-500">
              {n.author?.name || ""} - {formatDateTime(n.created_at, language)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function describeEvent(kind: string, data: Record<string, any>, language: string): string {
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const status = (s?: string) => (s && STATUS_LABELS[s] ? pick(language, STATUS_LABELS[s] as any) : s || "");
  if (kind === "status_changed") return `${status(data.old)} -> ${status(data.new)}`;
  if (kind === "whatsapp_outcome") return OUTCOME_LABELS[data.outcome] ? pick(language, OUTCOME_LABELS[data.outcome] as any) : "";
  if (kind === "reply" || kind === "whatsapp_prepared") return data.channel ? String(data.channel).replace("_", "-") : "";
  if (kind === "follow_up_set") return data.at ? formatDateTime(data.at, language) : t("cleared", "supprimé");
  if (kind === "assigned") return data.reason ? String(data.reason) : "";
  return "";
}

function ActivityTab({ c, language }: { c: StaffConversationDetail; language: string }) {
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const events = useMemo(() => [...c.timeline].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)), [c.timeline]);
  if (!events.length) return <p className="text-sm text-slate-500">{t("No activity yet.", "Aucune activité.")}</p>;
  return (
    <ol className="relative space-y-4 border-l border-slate-200 pl-4">
      {events.map((e) => {
        const detail = describeEvent(e.kind, e.data || {}, language);
        return (
          <li key={e.id} className="relative">
            <span className="absolute -left-[1.3rem] top-1.5 h-2.5 w-2.5 rounded-full bg-[#264D73]" aria-hidden />
            <p className="text-sm font-medium text-slate-900">{EVENT_LABELS[e.kind] ? pick(language, EVENT_LABELS[e.kind] as any) : e.kind.replace(/_/g, " ")}</p>
            {detail && <p className="text-xs text-slate-600">{detail}</p>}
            <p className="text-[11px] text-slate-500">
              {e.actor?.name ? `${e.actor.name} - ` : ""}
              {formatDateTime(e.created_at, language)}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------- message actions */

function RetryEmail({ conversationId, message, onUpdated, language }: { conversationId: string; message: CareMessage; onUpdated: (m: CareMessage) => void; language: string }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          onUpdated(await customerCareService.retryEmail(conversationId, message.id));
        } catch (e: any) {
          toast({
            variant: "destructive",
            title: careErrorCode(e) === "email_not_configured" ? t("Email is not configured", "E-mail non configuré") : t("Retry failed", "Nouvel essai échoué"),
            description: careErrorDetail(e),
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />} {t("Retry email", "Renvoyer l'e-mail")}
    </Button>
  );
}

const OUTCOMES: Array<{ outcome: WhatsappOutcome; label: readonly [string, string] }> = [
  { outcome: "sent_manually", label: ["Sent manually", "Envoyé manuellement"] },
  { outcome: "not_sent", label: ["Not sent", "Non envoyé"] },
  { outcome: "follow_up_required", label: ["Follow-up required", "Suivi requis"] },
];

function WhatsappActions({
  conversationId,
  message,
  url,
  onUpdated,
  language,
}: {
  conversationId: string;
  message: CareMessage;
  url?: string;
  onUpdated: (m: CareMessage) => void;
  language: string;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const status = message.delivery_status || "";
  // Once recorded as sent / not sent there is nothing more to do here.
  if (status === "sent_manually" || status === "not_sent") return null;

  const record = async (outcome: WhatsappOutcome) => {
    setBusy(outcome);
    try {
      onUpdated(await customerCareService.whatsappOutcome(conversationId, message.id, { outcome }));
      toast({ title: t("Recorded manually", "Enregistré manuellement") });
    } catch (e: any) {
      toast({ variant: "destructive", title: t("Could not record", "Enregistrement impossible"), description: careErrorDetail(e) });
    } finally {
      setBusy(null);
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.body);
      toast({ title: t("Message copied", "Message copié") });
    } catch {
      toast({ variant: "destructive", title: t("Could not copy", "Copie impossible"), description: t("Select the text and copy it manually.", "Sélectionnez le texte et copiez-le.") });
    }
  };

  return (
    <div className="w-full space-y-2 rounded-lg border border-sky-200 bg-sky-50 p-2.5 text-left" data-testid="whatsapp-actions">
      <p className="text-[11px] font-semibold text-sky-900">
        {t("Click-to-chat: you send this yourself. Record what happened (labelled 'Recorded manually').", "Click-to-chat : vous l'envoyez vous-même. Enregistrez le résultat (« Enregistré manuellement »).")}
      </p>
      <div className="flex flex-wrap gap-2">
        {url && (
          <Button asChild size="sm" variant="outline" className="gap-1">
            <a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /> {t("Open WhatsApp", "Ouvrir WhatsApp")}</a>
          </Button>
        )}
        <Button size="sm" variant="outline" className="gap-1" onClick={copy}><Copy className="h-3.5 w-3.5" /> {t("Copy message", "Copier le message")}</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {OUTCOMES.map((o) => (
          <Button key={o.outcome} size="sm" variant="secondary" disabled={busy !== null} onClick={() => record(o.outcome)}>
            {busy === o.outcome && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            {pick(language, o.label as any)}
          </Button>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- dialogs */

function ResolveDialog({ open, onOpenChange, busy, language, initial, onConfirm }: { open: boolean; onOpenChange: (o: boolean) => void; busy: boolean; language: string; initial: string; onConfirm: (summary: string) => void }) {
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const [summary, setSummary] = useState(initial || "");
  useEffect(() => { if (open) setSummary(initial || ""); }, [open, initial]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Resolve this conversation", "Résoudre cette conversation")}</DialogTitle>
          <DialogDescription>{t("A short summary of how it was resolved is required. The customer can see it.", "Un bref résumé de la résolution est obligatoire. Le client peut le voir.")}</DialogDescription>
        </DialogHeader>
        <Label htmlFor="care-resolution" className="text-xs">{t("Resolution summary", "Résumé de la résolution")}</Label>
        <Textarea id="care-resolution" rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={2000} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("Cancel", "Annuler")}</Button>
          <Button disabled={!summary.trim() || busy} onClick={() => onConfirm(summary.trim())}>
            {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} {t("Mark resolved", "Marquer résolue")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CloseDialog({ open, onOpenChange, busy, language, onConfirm }: { open: boolean; onOpenChange: (o: boolean) => void; busy: boolean; language: string; onConfirm: () => void }) {
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Close this conversation?", "Clore cette conversation ?")}</DialogTitle>
          <DialogDescription>{t("A closed conversation no longer accepts messages from the customer. You can reopen it later.", "Une conversation close n'accepte plus de messages du client. Vous pourrez la rouvrir.")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("Cancel", "Annuler")}</Button>
          <Button variant="destructive" disabled={busy} onClick={onConfirm}>
            {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} {t("Close conversation", "Clore")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FollowUpDialog({ open, onOpenChange, language, conversation, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; language: string; conversation: StaffConversationDetail; onSaved: () => void }) {
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const { toast } = useToast();
  const [when, setWhen] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => {
    if (open) { setWhen(toLocalInput(conversation.follow_up_at)); setNote(conversation.follow_up_note || ""); }
  }, [open, conversation.follow_up_at, conversation.follow_up_note]);
  const save = useMutation({
    mutationFn: (clear: boolean) =>
      customerCareService.followUp(conversation.id, { follow_up_at: clear || !when ? null : new Date(when).toISOString(), note: clear ? "" : note }),
    onSuccess: () => { toast({ title: t("Follow-up saved", "Suivi enregistré") }); onSaved(); },
    onError: (e) => toast({ variant: "destructive", title: t("Could not save", "Enregistrement impossible"), description: careErrorDetail(e) }),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Follow-up date", "Date de suivi")}</DialogTitle>
          <DialogDescription>{t("You and the founders are notified once when it is due.", "Vous et les fondateurs êtes notifiés une fois à l'échéance.")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="care-follow-at" className="text-xs">{t("Date and time", "Date et heure")}</Label>
            <Input id="care-follow-at" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="care-follow-note" className="text-xs">{t("Note (optional)", "Note (facultatif)")}</Label>
            <Input id="care-follow-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          {conversation.follow_up_at && (
            <Button variant="ghost" onClick={() => save.mutate(true)} disabled={save.isPending}>{t("Clear", "Effacer")}</Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("Cancel", "Annuler")}</Button>
          <Button onClick={() => save.mutate(false)} disabled={!when || save.isPending}>
            {save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} {t("Save", "Enregistrer")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReassignDialog({ open, onOpenChange, language, conversation, executives, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; language: string; conversation: StaffConversationDetail; executives: CareExecutive[] | null; onSaved: () => void }) {
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const { toast } = useToast();
  const [target, setTarget] = useState<string>("none");
  const [reason, setReason] = useState("");
  useEffect(() => { if (open) { setTarget(conversation.assigned_to?.id || "none"); setReason(""); } }, [open, conversation.assigned_to?.id]);
  const assign = useMutation({
    mutationFn: () => customerCareService.assign(conversation.id, { executive_id: target === "none" ? null : target, reason: reason.trim() }),
    onSuccess: () => { toast({ title: t("Assignment updated", "Assignation mise à jour") }); onSaved(); },
    onError: (e) => toast({ variant: "destructive", title: t("Could not assign", "Assignation impossible"), description: careErrorDetail(e) }),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{conversation.assigned_to ? t("Reassign conversation", "Réassigner la conversation") : t("Assign conversation", "Assigner la conversation")}</DialogTitle>
          <DialogDescription>{t("Only executives with Customer Care access can be selected.", "Seuls les exécutifs ayant accès au Service Client peuvent être choisis.")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("Executive", "Exécutif")}</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("Unassigned", "Non assignée")}</SelectItem>
                {(executives || []).map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name} ({e.role_label}) - {e.open_conversations} {t("open", "ouvertes")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {executives && executives.length === 0 && (
              <p className="flex items-center gap-1 text-xs text-amber-800"><AlertTriangle className="h-3.5 w-3.5" /> {t("No executive has Customer Care access yet. Grant it in Founders.", "Aucun exécutif n'a l'accès Service Client. Accordez-le dans Fondateurs.")}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="care-assign-reason" className="text-xs">{t("Reason (optional)", "Motif (facultatif)")}</Label>
            <Input id="care-assign-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("Cancel", "Annuler")}</Button>
          <Button onClick={() => assign.mutate()} disabled={assign.isPending || target === (conversation.assigned_to?.id || "none")}>
            {assign.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} {t("Confirm", "Confirmer")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
