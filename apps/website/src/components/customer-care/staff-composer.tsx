"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Loader2, Mail, MessageCircle, MessagesSquare, Send } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { useRoleLabel } from "@/lib/role-labels";
import {
  careErrorCode,
  careErrorDetail,
  customerCareService,
  newClientMessageId,
  type CareMessage,
  type Channel,
  type StaffConversation,
} from "@/lib/api/services/customer-care.service";
import { CHANNEL_LABELS, pick, usableEmail, usablePhone } from "@/lib/customer-care-labels";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { MessageHeader } from "./message-header";

const CHANNELS: Array<{ id: Channel; icon: typeof Mail }> = [
  { id: "in_app", icon: MessagesSquare },
  { id: "email", icon: Mail },
  { id: "whatsapp", icon: MessageCircle },
];

/**
 * Reply composer. The channel is always explicit and the customer's identity
 * and the recipient address/number are shown before sending. Nothing is faked:
 * an unconfigured email provider is an error, and a WhatsApp message is only
 * ever PREPARED (click-to-chat) - the executive sends it manually.
 */
export function StaffComposer({
  conversation,
  disabled,
  onSent,
  onWhatsappPrepared,
}: {
  conversation: StaffConversation;
  disabled?: boolean;
  onSent: (message: CareMessage) => void;
  onWhatsappPrepared: (message: CareMessage, url: string) => void;
}) {
  const { user } = useAuth();
  const { language } = useI18n();
  const { label: roleName } = useRoleLabel();
  const { toast } = useToast();
  const [channel, setChannel] = useState<Channel>("in_app");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [clientId, setClientId] = useState(newClientMessageId());
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);

  const customer = conversation.customer;
  const whatsappNumber = customer.whatsapp || customer.phone;
  const recipient = channel === "email" ? customer.email : channel === "whatsapp" ? whatsappNumber : "";
  const recipientOk = channel === "in_app" || (channel === "email" ? usableEmail(customer.email) : usablePhone(whatsappNumber));
  const recipientMissing =
    channel === "email"
      ? t("This customer has no valid email address on file.", "Ce client n'a pas d'adresse e-mail valide.")
      : channel === "whatsapp"
        ? t("This customer has no valid phone/WhatsApp number on file.", "Ce client n'a pas de numéro WhatsApp valide.")
        : "";

  const sender = useMemo(
    () => ({
      name: user?.name || "",
      roleLabel: user ? roleName(user.role, user) : "",
      avatar: user?.avatar,
    }),
    [user, roleName],
  );

  const send = async () => {
    const text = body.trim();
    if (!text || !recipientOk || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      if (channel === "whatsapp") {
        const res = await customerCareService.whatsappPrepare(conversation.id, { body: text, client_message_id: clientId });
        onWhatsappPrepared(res.message, res.whatsapp_url);
        let opened: Window | null = null;
        try {
          opened = window.open(res.whatsapp_url, "_blank");
          if (opened) opened.opener = null;
        } catch {
          opened = null;
        }
        if (opened) {
          try {
            const updated = await customerCareService.whatsappOutcome(conversation.id, res.message.id, {
              outcome: "opened_delivery_unconfirmed",
            });
            onSent(updated);
          } catch {
            onSent(res.message);
          }
          toast({
            title: t("WhatsApp opened - delivery unconfirmed", "WhatsApp ouvert - livraison non confirmée"),
            description: t("Send the message in WhatsApp, then record the outcome.", "Envoyez le message dans WhatsApp, puis enregistrez le résultat."),
          });
        } else {
          onSent(res.message);
          toast({
            title: t("Prepared - awaiting manual send", "Préparé - en attente d'envoi manuel"),
            description: t(
              "The browser blocked the new tab. Use 'Open WhatsApp' or 'Copy message' under the message.",
              "Le navigateur a bloqué l'onglet. Utilisez « Ouvrir WhatsApp » ou « Copier le message ».",
            ),
          });
        }
      } else {
        const message = await customerCareService.reply(conversation.id, {
          body: text,
          channel: channel as "in_app" | "email",
          client_message_id: clientId,
        });
        onSent(message);
        if (channel === "email") {
          toast({
            title:
              message.delivery_status === "failed"
                ? t("Email failed", "Échec de l'e-mail")
                : message.delivery_status === "sent_to_provider"
                  ? t("Email accepted by the email provider", "E-mail accepté par le fournisseur")
                  : t("Email queued", "E-mail en file d'attente"),
            description: t("Delivery is not confirmed until the provider reports it.", "La livraison n'est confirmée que lorsque le fournisseur la signale."),
          });
        }
      }
      setBody("");
      setClientId(newClientMessageId());
    } catch (error: any) {
      const code = careErrorCode(error);
      if (code === "email_not_configured") {
        setProblem(
          t(
            "Email is not set up yet, so nothing was sent. Ask a founder to configure the email provider (Channels tab).",
            "L'e-mail n'est pas encore configuré : rien n'a été envoyé. Demandez à un fondateur de configurer le fournisseur (onglet Canaux).",
          ),
        );
      } else if (code === "invalid_recipient" || code === "invalid_phone") {
        setProblem(careErrorDetail(error, recipientMissing || t("The recipient is not valid.", "Le destinataire n'est pas valide.")));
      } else if (code === "conversation_closed") {
        setProblem(t("This conversation is closed. Reopen it to reply.", "Cette conversation est close. Rouvrez-la pour répondre."));
      } else if (error?.response?.status === 429) {
        setProblem(t("Too many messages. Please wait a moment.", "Trop de messages. Patientez un instant."));
      } else {
        setProblem(careErrorDetail(error, t("The message could not be sent. Nothing was recorded as sent.", "Le message n'a pas pu être envoyé.")));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 border-t border-slate-200 bg-slate-50/60 p-3 sm:p-4">
      <div role="radiogroup" aria-label={t("Channel", "Canal")} className="grid grid-cols-3 gap-2">
        {CHANNELS.map(({ id, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={channel === id}
            onClick={() => {
              setChannel(id);
              setProblem(null);
            }}
            className={cn(
              "flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-semibold transition-colors sm:text-sm",
              channel === id ? "border-[#264D73] bg-[#264D73] text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{pick(language, CHANNEL_LABELS[id] as any)}</span>
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700" data-testid="composer-target">
        <p>
          <span className="font-semibold">{t("To", "À")}:</span> {customer.name}{" "}
          <span className="text-slate-500">({customer.role_label})</span>
        </p>
        <p>
          <span className="font-semibold">{t("Channel", "Canal")}:</span> {pick(language, CHANNEL_LABELS[channel] as any)}
          {recipient ? <span> - {recipient}</span> : null}
        </p>
        {channel === "email" && (
          <p>
            <span className="font-semibold">{t("Subject", "Objet")}:</span> Re: {conversation.subject}
          </p>
        )}
      </div>

      {!recipientOk && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {recipientMissing}
        </p>
      )}
      {channel === "whatsapp" && recipientOk && (
        <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
          {t(
            "WhatsApp opens on your device with the message ready. You press Send there yourself; EduIgnite cannot confirm delivery.",
            "WhatsApp s'ouvre avec le message prêt. Vous appuyez vous-même sur Envoyer ; EduIgnite ne peut pas confirmer la livraison.",
          )}
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="care-composer-body" className="text-xs font-semibold">
          {t("Message", "Message")}
        </Label>
        <Textarea
          id="care-composer-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          maxLength={5000}
          disabled={disabled || busy}
          placeholder={t("Write your reply...", "Écrivez votre réponse...")}
        />
      </div>

      {body.trim() && (
        <div className="space-y-1.5" aria-label={t("Preview", "Aperçu")}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {channel === "email" ? t("Email preview", "Aperçu de l'e-mail") : t("Preview", "Aperçu")}
          </p>
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-2.5">
            <MessageHeader sender={sender} variant={channel === "email" ? "email" : "bubble"} />
            {channel === "email" && (
              <p className="mt-2 text-xs text-slate-600">
                {t("Dear", "Bonjour")} {customer.name},
              </p>
            )}
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-900">{body}</p>
          </div>
        </div>
      )}

      {problem && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">
          {problem}
        </p>
      )}

      <div className="flex justify-end">
        <Button onClick={send} disabled={disabled || busy || !body.trim() || !recipientOk} className="min-h-[44px] gap-2">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {channel === "whatsapp"
            ? t("Prepare & open WhatsApp", "Préparer et ouvrir WhatsApp")
            : channel === "email"
              ? t("Send email", "Envoyer l'e-mail")
              : t("Send message", "Envoyer le message")}
        </Button>
      </div>
    </div>
  );
}
