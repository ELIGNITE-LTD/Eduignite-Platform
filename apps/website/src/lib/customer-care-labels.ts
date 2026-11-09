import type { ConversationStatus } from "@/lib/api/services/customer-care.service";

/** The real EduIgnite logo (served from /public in every app). */
export const OFFICIAL_LOGO_SRC = "/eduignite-logo.svg";

/** Label pairs are [English, French]. */
type Pair = readonly [string, string];
export const pick = (language: string, pair: Pair) => (language === "fr" ? pair[1] : pair[0]);

export const STATUS_LABELS: Record<string, Pair> = {
  new: ["New", "Nouveau"],
  open: ["Open", "Ouvert"],
  in_progress: ["In progress", "En cours"],
  awaiting_customer: ["Awaiting customer", "En attente du client"],
  awaiting_internal: ["Awaiting internal", "En attente interne"],
  resolved: ["Resolved", "Résolu"],
  closed: ["Closed", "Clos"],
};

/** What a customer sees (simpler words, no internal states). */
export const CUSTOMER_STATUS_LABELS: Record<string, Pair> = {
  new: ["Received", "Reçu"],
  open: ["In progress", "En cours"],
  in_progress: ["In progress", "En cours"],
  awaiting_customer: ["Waiting for your reply", "En attente de votre réponse"],
  awaiting_internal: ["In progress", "En cours"],
  resolved: ["Resolved", "Résolu"],
  closed: ["Closed", "Clos"],
};

export const STATUS_ORDER: ConversationStatus[] = [
  "new",
  "open",
  "in_progress",
  "awaiting_customer",
  "awaiting_internal",
  "resolved",
  "closed",
];

export const STATUS_TONE: Record<string, string> = {
  new: "bg-sky-100 text-sky-800 border-sky-200",
  open: "bg-emerald-100 text-emerald-800 border-emerald-200",
  in_progress: "bg-indigo-100 text-indigo-800 border-indigo-200",
  awaiting_customer: "bg-amber-100 text-amber-900 border-amber-200",
  awaiting_internal: "bg-orange-100 text-orange-900 border-orange-200",
  resolved: "bg-slate-100 text-slate-700 border-slate-200",
  closed: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

export const CHANNEL_LABELS: Record<string, Pair> = {
  in_app: ["In-app chat", "Chat dans l'application"],
  email: ["Email", "E-mail"],
  whatsapp: ["WhatsApp", "WhatsApp"],
};

/** Customer groups (slug -> label). The names come from the API; these are fallbacks for the filter. */
export const GROUP_FALLBACK: Record<string, Pair> = {
  A: ["A - Schools & school users", "A - Écoles et utilisateurs d'école"],
  B: ["B - Learners & students", "B - Apprenants et élèves"],
  C: ["C - Partners", "C - Partenaires"],
};

export const CATEGORY_OPTIONS: Array<{ value: string; label: Pair }> = [
  { value: "general", label: ["General question", "Question générale"] },
  { value: "account", label: ["My account / login", "Mon compte / connexion"] },
  { value: "billing", label: ["Fees & billing", "Frais et facturation"] },
  { value: "technical", label: ["Something is not working", "Un problème technique"] },
  { value: "partnership", label: ["Partnership", "Partenariat"] },
];

/**
 * Honest delivery wording. Click-to-chat WhatsApp is never "sent / delivered /
 * read" unless an executive recorded it manually (and then it says so).
 */
export const DELIVERY_LABELS: Record<string, { label: Pair; tone: string }> = {
  stored: { label: ["Saved", "Enregistré"], tone: "bg-slate-100 text-slate-700" },
  draft: { label: ["Draft", "Brouillon"], tone: "bg-slate-100 text-slate-700" },
  queued: { label: ["Queued", "En file d'attente"], tone: "bg-amber-100 text-amber-900" },
  sent_to_provider: { label: ["Accepted by email provider", "Accepté par le fournisseur e-mail"], tone: "bg-sky-100 text-sky-800" },
  delivered: { label: ["Delivered (provider confirmed)", "Livré (confirmé par le fournisseur)"], tone: "bg-emerald-100 text-emerald-800" },
  failed: { label: ["Failed", "Échec"], tone: "bg-red-100 text-red-800" },
  bounced: { label: ["Bounced", "Rejeté"], tone: "bg-red-100 text-red-800" },
  prepared_awaiting_manual_send: { label: ["Prepared - awaiting manual send", "Préparé - en attente d'envoi manuel"], tone: "bg-amber-100 text-amber-900" },
  opened_delivery_unconfirmed: { label: ["WhatsApp opened - delivery unconfirmed", "WhatsApp ouvert - livraison non confirmée"], tone: "bg-sky-100 text-sky-800" },
  sent_manually: { label: ["Sent manually", "Envoyé manuellement"], tone: "bg-emerald-100 text-emerald-800" },
  not_sent: { label: ["Not sent", "Non envoyé"], tone: "bg-zinc-100 text-zinc-700" },
  follow_up_required: { label: ["Follow-up required", "Suivi requis"], tone: "bg-orange-100 text-orange-900" },
  sent: { label: ["Sent", "Envoyé"], tone: "bg-emerald-100 text-emerald-800" },
  read: { label: ["Read", "Lu"], tone: "bg-emerald-100 text-emerald-800" },
};

export function deliveryLabel(language: string, status?: string): { text: string; tone: string } | null {
  if (!status) return null;
  const entry = DELIVERY_LABELS[status];
  if (!entry) return { text: status.replace(/_/g, " "), tone: "bg-slate-100 text-slate-700" };
  return { text: pick(language, entry.label), tone: entry.tone };
}

export const EVENT_LABELS: Record<string, Pair> = {
  created: ["Conversation started", "Conversation démarrée"],
  customer_replied: ["Customer replied", "Le client a répondu"],
  reply: ["Reply sent", "Réponse envoyée"],
  whatsapp_prepared: ["WhatsApp message prepared", "Message WhatsApp préparé"],
  whatsapp_outcome: ["WhatsApp outcome recorded manually", "Résultat WhatsApp enregistré manuellement"],
  status_changed: ["Status changed", "Statut modifié"],
  assigned: ["Assignment changed", "Assignation modifiée"],
  follow_up_set: ["Follow-up date set", "Date de suivi définie"],
  note_added: ["Internal note added", "Note interne ajoutée"],
};

export const OUTCOME_LABELS: Record<string, Pair> = {
  opened_delivery_unconfirmed: ["WhatsApp opened - delivery unconfirmed", "WhatsApp ouvert - livraison non confirmée"],
  sent_manually: ["Sent manually", "Envoyé manuellement"],
  not_sent: ["Not sent", "Non envoyé"],
  follow_up_required: ["Follow-up required", "Suivi requis"],
};

export function formatDateTime(value?: string | null, language = "en"): string {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat(language === "fr" ? "fr-FR" : "en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Africa/Douala",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function initials(name?: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Normalises a phone for a quick "is a number available" check (digits, optional +). */
export function usablePhone(value?: string | null): boolean {
  const digits = (value || "").replace(/[^\d]/g, "");
  return digits.length >= 8 && digits.length <= 15;
}

export function usableEmail(value?: string | null): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((value || "").trim());
}
