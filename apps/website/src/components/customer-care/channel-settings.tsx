"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleAlert, CircleSlash, KeyRound, Loader2, Save } from "lucide-react";
import { useI18n } from "@/lib/i18n-context";
import { careErrorDetail, customerCareService } from "@/lib/api/services/customer-care.service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadError } from "@/components/ui/load-error";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/**
 * Founders: honest status of each outbound channel. Nothing here shows a
 * secret. WhatsApp click-to-chat is always manual; the official API is only
 * "configured" once the founders have saved its credentials and verified it.
 */
export function ChannelSettings() {
  const { language } = useI18n();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const status = useQuery({ queryKey: ["care", "config-status"], queryFn: customerCareService.configStatus });

  if (status.isLoading) return <Skeleton className="h-64 w-full" />;
  if (status.isError || !status.data) return <LoadError message={t("Could not load the channel status.", "Impossible de charger l'état des canaux.")} onRetry={() => status.refetch()} />;
  const { email, whatsapp } = status.data;

  const emailTone = email.configured ? "ok" : "bad";
  const waState = whatsapp.official_api.state;
  const waTone = waState === "official_api_configured_verified" ? "ok" : waState === "official_api_requires_attention" ? "warn" : "off";

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between gap-2 text-base">Email <StateBadge tone={emailTone} label={email.configured ? t("Configured", "Configuré") : t("Not configured", "Non configuré")} /></CardTitle>
            <CardDescription>{t("Replies by email go through the email provider (Brevo).", "Les réponses par e-mail passent par le fournisseur (Brevo).")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <KV k={t("State", "État")} v={String(email.state).replace(/_/g, " ")} />
            <KV k={t("Provider key", "Clé du fournisseur")} v={email.api_key_set ? t("Set", "Définie") : t("Not set", "Non définie")} />
            <KV k={t("Sender address", "Adresse d'envoi")} v={email.sender_address} />
            <KV k={t("Logo in emails", "Logo dans les e-mails")} v={email.logo_url ? t("Available", "Disponible") : t("Missing", "Manquant")} />
            <KV k={t("Delivery tracking", "Suivi de livraison")} v={typeof email.delivery_tracking === "boolean" ? (email.delivery_tracking ? t("On", "Actif") : t("Off", "Inactif")) : String(email.delivery_tracking || "-")} />
            {email.problems?.length > 0 && (
              <ul className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
                {email.problems.map((p) => <li key={p}>{p}</li>)}
              </ul>
            )}
            {!email.configured && (
              <p className="text-xs text-slate-600">{t("Until it is configured, email replies are refused and nothing is shown as sent. Save the Brevo key in 'Integration Keys' on the Founders page.", "Tant qu'il n'est pas configuré, les e-mails sont refusés et rien n'est affiché comme envoyé. Enregistrez la clé Brevo dans « Clés d'intégration » (page Fondateurs).")}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between gap-2 text-base">WhatsApp</CardTitle>
            <CardDescription>{t("Two separate modes. Click-to-chat is manual; the official API is optional.", "Deux modes distincts. Click-to-chat est manuel ; l'API officielle est facultative.")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2"><span className="font-semibold">Click-to-chat</span>
                <StateBadge tone={whatsapp.click_to_chat.available ? "ok" : "off"} label={whatsapp.click_to_chat.available ? t("Click-to-Chat available", "Click-to-Chat disponible") : t("Unavailable", "Indisponible")} />
              </div>
              <p className="text-xs text-slate-600">{whatsapp.click_to_chat.note}</p>
              <p className="text-xs text-slate-600">{t("Opens WhatsApp with the message prepared; the executive sends it manually. Delivery is never confirmed, so it is never shown as delivered or read.", "Ouvre WhatsApp avec le message prêt ; l'exécutif l'envoie manuellement. La livraison n'est jamais confirmée, donc jamais affichée comme livrée ou lue.")}</p>
            </div>
            <div className="space-y-1.5 border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between gap-2"><span className="font-semibold">{t("Official WhatsApp API", "API WhatsApp officielle")}</span>
                <StateBadge tone={waTone} label={waLabel(waState, language)} />
              </div>
              <p className="text-xs text-slate-600">{whatsapp.official_api.note}</p>
              {whatsapp.official_api.webhook_path && (
                <p className="break-all text-xs text-slate-600">{t("Webhook path", "Chemin du webhook")}: <code className="rounded bg-slate-100 px-1">{whatsapp.official_api.webhook_path}</code></p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <WhatsappSetup />
    </div>
  );
}

function waLabel(state: string, language: string): string {
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  switch (state) {
    case "official_api_configured_verified": return t("Official API configured and verified", "API officielle configurée et vérifiée");
    case "official_api_requires_attention": return t("Official API requires attention", "API officielle : action requise");
    default: return t("Official API not configured", "API officielle non configurée");
  }
}

function StateBadge({ tone, label }: { tone: "ok" | "warn" | "bad" | "off"; label: string }) {
  const Icon = tone === "ok" ? CheckCircle2 : tone === "off" ? CircleSlash : CircleAlert;
  return (
    <Badge variant="outline" className={cn("gap-1 font-semibold", tone === "ok" && "border-emerald-300 bg-emerald-50 text-emerald-800", tone === "warn" && "border-amber-300 bg-amber-50 text-amber-900", tone === "bad" && "border-red-300 bg-red-50 text-red-800", tone === "off" && "border-slate-300 bg-slate-50 text-slate-700")}>
      <Icon className="h-3 w-3" aria-hidden /> {label}
    </Badge>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-1.5 last:border-0">
      <span className="text-xs text-slate-500">{k}</span>
      <span className="min-w-0 break-words text-right text-sm font-medium">{v || "-"}</span>
    </div>
  );
}

/**
 * Write-only entry of the official WhatsApp API credentials through the
 * existing founders endpoint. Saved values are never read back: only "set"
 * flags are shown, and the inputs are cleared after saving.
 */
function WhatsappSetup() {
  const { language } = useI18n();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const { toast } = useToast();
  const qc = useQueryClient();
  const secrets = useQuery({ queryKey: ["care", "integration-secrets"], queryFn: customerCareService.integrationStatus });
  const [token, setToken] = useState("");
  const [phoneId, setPhoneId] = useState("");
  const [webhook, setWebhook] = useState("");
  const [verified, setVerified] = useState<boolean | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const payload: Record<string, any> = {};
      if (token.trim()) payload.whatsapp_api_token = token.trim();
      if (phoneId.trim()) payload.whatsapp_phone_number_id = phoneId.trim();
      if (webhook.trim()) payload.whatsapp_webhook_secret = webhook.trim();
      if (verified !== null) payload.whatsapp_api_verified = verified;
      return customerCareService.saveIntegrationSecrets(payload);
    },
    onSuccess: () => {
      setToken(""); setPhoneId(""); setWebhook(""); setVerified(null);
      void qc.invalidateQueries({ queryKey: ["care", "integration-secrets"] });
      void qc.invalidateQueries({ queryKey: ["care", "config-status"] });
      toast({ title: t("Saved", "Enregistré") });
    },
    onError: (e) => toast({ variant: "destructive", title: t("Could not save", "Enregistrement impossible"), description: careErrorDetail(e) }),
  });

  const s = secrets.data || {};
  const flag = (set: boolean) => <Badge variant="outline" className={set ? "border-emerald-300 bg-emerald-50 text-emerald-800" : ""}>{set ? t("Set", "Défini") : t("Not set", "Non défini")}</Badge>;
  const dirty = Boolean(token.trim() || phoneId.trim() || webhook.trim() || verified !== null);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4" /> {t("Official WhatsApp API setup (optional)", "Configuration de l'API WhatsApp officielle (facultatif)")}</CardTitle>
        <CardDescription>
          {t("Click-to-chat works without this. To use the official WhatsApp Business API: create a WhatsApp Business app in Meta, copy the permanent access token and Phone Number ID, set the webhook to the path above with a secret of your choice, then paste the values here. Values are write-only: they are never shown again.", "Click-to-chat fonctionne sans ceci. Pour l'API WhatsApp Business officielle : créez une app WhatsApp Business chez Meta, copiez le jeton permanent et l'ID du numéro, configurez le webhook avec le chemin ci-dessus et un secret, puis collez les valeurs ici. Elles sont en écriture seule : jamais réaffichées.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {secrets.isError ? (
          <LoadError message={t("Could not load the credential status.", "Impossible de charger l'état des identifiants.")} onRetry={() => secrets.refetch()} />
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between"><Label htmlFor="wa-token" className="text-xs">{t("Access token", "Jeton d'accès")}</Label>{flag(Boolean(s.whatsapp_api_token_set))}</div>
              <Input id="wa-token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder={t("Paste to set or replace", "Coller pour définir ou remplacer")} />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between"><Label htmlFor="wa-phone" className="text-xs">{t("Phone Number ID", "ID du numéro")}</Label>{flag(Boolean(s.whatsapp_phone_number_id_set))}</div>
              <Input id="wa-phone" type="password" autoComplete="off" value={phoneId} onChange={(e) => setPhoneId(e.target.value)} placeholder={t("Paste to set or replace", "Coller pour définir ou remplacer")} />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between"><Label htmlFor="wa-hook" className="text-xs">{t("Webhook secret", "Secret du webhook")}</Label>{flag(Boolean(s.whatsapp_webhook_secret_set))}</div>
              <Input id="wa-hook" type="password" autoComplete="off" value={webhook} onChange={(e) => setWebhook(e.target.value)} placeholder={t("Paste to set or replace", "Coller pour définir ou remplacer")} />
            </div>
          </div>
        )}
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={verified ?? Boolean(s.whatsapp_api_verified)}
            onChange={(e) => setVerified(e.target.checked)}
            disabled={!(s.whatsapp_api_token_set && s.whatsapp_phone_number_id_set && s.whatsapp_webhook_secret_set)}
          />
          <span>{t("I have verified the webhook and a test message with Meta. (Only tick this once it really works; until then the status stays 'not configured'.)", "J'ai vérifié le webhook et un message de test chez Meta. (À cocher seulement une fois que cela fonctionne.)")}</span>
        </label>
        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending} className="gap-2">
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {t("Save", "Enregistrer")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
