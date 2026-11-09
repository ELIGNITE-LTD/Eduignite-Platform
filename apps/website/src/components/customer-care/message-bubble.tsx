"use client";

import type { ReactNode } from "react";
import { Mail, MessageCircle, MessagesSquare } from "lucide-react";
import type { CareMessage } from "@/lib/api/services/customer-care.service";
import { CHANNEL_LABELS, deliveryLabel, formatDateTime, pick } from "@/lib/customer-care-labels";
import { cn } from "@/lib/utils";
import { MessageHeader } from "./message-header";

const CHANNEL_ICON: Record<string, typeof Mail> = { in_app: MessagesSquare, email: Mail, whatsapp: MessageCircle };

/**
 * One message in a thread. `perspective` decides which side is "mine":
 * staff see their replies on the right; customers see their own messages on
 * the right and the official Customer Care replies (with the identity header)
 * on the left. Delivery details are staff-only and always honest: click-to-chat
 * WhatsApp is never shown as sent/delivered/read unless recorded manually.
 */
export function MessageBubble({
  message,
  language,
  perspective,
  actions,
}: {
  message: CareMessage;
  language: string;
  perspective: "staff" | "customer";
  actions?: ReactNode;
}) {
  const fromCustomer = message.direction === "inbound";
  const mine = perspective === "staff" ? !fromCustomer : fromCustomer;
  const staffView = perspective === "staff";
  const Icon = CHANNEL_ICON[message.channel] || MessagesSquare;
  const channelName = CHANNEL_LABELS[message.channel] ? pick(language, CHANNEL_LABELS[message.channel] as any) : message.channel;
  const delivery = staffView && !fromCustomer ? deliveryLabel(language, message.delivery_status) : null;
  const manual = staffView && (message.delivery_source === "manual" || message.is_manual_status);

  let deliveryText = delivery?.text || "";
  if (delivery && message.delivery_status === "sent_manually") {
    deliveryText =
      language === "fr"
        ? `Envoyé manuellement (enregistré par ${message.sender.name})`
        : `Sent manually (recorded by ${message.sender.name})`;
  }

  return (
    <div className={cn("flex w-full", mine ? "justify-end" : "justify-start")}>
      <div className={cn("w-full max-w-[min(34rem,92%)] space-y-1.5", mine ? "items-end" : "items-start")}>
        {!fromCustomer && (
          <MessageHeader
            sender={{
              name: message.sender.name,
              roleLabel: message.sender.role_label,
              avatar: message.sender.avatar,
              officialLabel: message.sender.official_label,
            }}
          />
        )}
        {fromCustomer && (
          <p className={cn("px-1 text-xs font-semibold text-slate-600", mine && "text-right")}>
            {perspective === "customer" ? (language === "fr" ? "Vous" : "You") : message.sender.name}
            {perspective === "staff" && message.sender.role_label ? (
              <span className="font-normal text-slate-500"> - {message.sender.role_label}</span>
            ) : null}
          </p>
        )}
        <div
          className={cn(
            "whitespace-pre-wrap break-words rounded-xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm",
            mine ? "bg-[#264D73] text-white" : "border border-slate-200 bg-white text-slate-900",
          )}
        >
          {message.body}
        </div>
        <div className={cn("flex flex-wrap items-center gap-1.5 px-1 text-[11px] text-slate-500", mine && "justify-end")}>
          {staffView && (
            <span className="inline-flex items-center gap-1">
              <Icon className="h-3 w-3" aria-hidden /> {channelName}
            </span>
          )}
          <time dateTime={message.created_at}>{formatDateTime(message.created_at, language)}</time>
          {delivery && (
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", delivery.tone)}>{deliveryText}</span>
          )}
          {manual && (
            <span className="rounded-full border border-slate-300 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
              {language === "fr" ? "Enregistré manuellement" : "Recorded manually"}
            </span>
          )}
        </div>
        {staffView && !fromCustomer && (message.recipient || message.error_code) && (
          <p className={cn("px-1 text-[11px] text-slate-500", mine && "text-right")}>
            {message.recipient ? <span>{language === "fr" ? "Destinataire" : "Recipient"}: {message.recipient}</span> : null}
            {message.error_code ? (
              <span className="ml-2 font-medium text-red-700">
                {language === "fr" ? "Erreur" : "Error"}: {message.error_code.replace(/_/g, " ")}
              </span>
            ) : null}
          </p>
        )}
        {actions ? <div className={cn("flex flex-wrap gap-2 px-1", mine && "justify-end")}>{actions}</div> : null}
      </div>
    </div>
  );
}
