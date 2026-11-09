"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n-context";
import {
  careErrorDetail,
  customerCareService,
  type ContactItem,
  type ContactKind,
  type DisplayMode,
} from "@/lib/api/services/customer-care.service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadError } from "@/components/ui/load-error";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ContactGrid, ContactIcon } from "./contact-grid";
import { OFFICIAL_LOGO_SRC } from "@/lib/customer-care-labels";

const KINDS: Array<{ kind: ContactKind; label: readonly [string, string]; hint: readonly [string, string] }> = [
  { kind: "email", label: ["Email", "E-mail"], hint: ["name@example.com", "nom@exemple.com"] },
  { kind: "phone", label: ["Phone", "Téléphone"], hint: ["+237 6XX XXX XXX", "+237 6XX XXX XXX"] },
  { kind: "whatsapp", label: ["WhatsApp", "WhatsApp"], hint: ["+237 6XX XXX XXX (number with country code)", "+237 6XX XXX XXX (numéro avec indicatif)"] },
  { kind: "address", label: ["Address", "Adresse"], hint: ["Bamenda, Cameroon", "Bamenda, Cameroun"] },
  { kind: "website", label: ["Website", "Site web"], hint: ["https://...", "https://..."] },
  { kind: "facebook", label: ["Facebook", "Facebook"], hint: ["https://www.facebook.com/...", "https://www.facebook.com/..."] },
  { kind: "instagram", label: ["Instagram", "Instagram"], hint: ["https://www.instagram.com/...", "https://www.instagram.com/..."] },
  { kind: "linkedin", label: ["LinkedIn", "LinkedIn"], hint: ["https://www.linkedin.com/...", "https://www.linkedin.com/..."] },
  { kind: "youtube", label: ["YouTube", "YouTube"], hint: ["https://www.youtube.com/...", "https://www.youtube.com/..."] },
  { kind: "other", label: ["Other link", "Autre lien"], hint: ["https://...", "https://..."] },
];

type Draft = { id?: string | number; kind: ContactKind; label: string; value: string; display_mode: DisplayMode; is_active: boolean };
const key = ["care", "contact-items"] as const;

/** Founders only (CEO/CTO): manage what the public Contact page and footer show. */
export function ContactManager() {
  const { language } = useI18n();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const { toast } = useToast();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: key, queryFn: customerCareService.contactItems });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ContactItem | null>(null);

  const items = useMemo(
    () => [...(list.data || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.id).localeCompare(String(b.id))),
    [list.data],
  );
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const onError = (e: any) => toast({ variant: "destructive", title: t("Could not save", "Enregistrement impossible"), description: careErrorDetail(e) });

  const save = useMutation({
    mutationFn: (d: Draft) => {
      const payload = { kind: d.kind, label: d.label.trim(), value: d.value.trim(), display_mode: d.display_mode, is_active: d.is_active };
      return d.id !== undefined
        ? customerCareService.updateContact(d.id, payload)
        : customerCareService.createContact({ ...payload, sort_order: (items[items.length - 1]?.sort_order ?? 0) + 10 });
    },
    onSuccess: () => { setDraft(null); setFormError(null); void refresh(); toast({ title: t("Saved - the public page updates within a couple of minutes", "Enregistré - la page publique se met à jour sous quelques minutes") }); },
    onError: (e) => setFormError(careErrorDetail(e, t("The value is not valid.", "La valeur n'est pas valide."))),
  });
  const toggle = useMutation({
    mutationFn: (item: ContactItem) => customerCareService.updateContact(item.id, { is_active: !item.is_active }),
    onSuccess: () => void refresh(),
    onError,
  });
  const remove = useMutation({
    mutationFn: (item: ContactItem) => customerCareService.deleteContact(item.id),
    onSuccess: () => { setDeleting(null); void refresh(); toast({ title: t("Deleted", "Supprimé") }); },
    onError,
  });
  const move = useMutation({
    mutationFn: async ({ index, delta }: { index: number; delta: -1 | 1 }) => {
      const a = items[index];
      const b = items[index + delta];
      if (!a || !b) return;
      // Give both a distinct order, then swap them.
      const ao = a.sort_order ?? index * 10;
      const bo = b.sort_order ?? (index + delta) * 10;
      const [first, second] = ao === bo ? [ao, ao + delta] : [ao, bo];
      await customerCareService.updateContact(a.id, { sort_order: second });
      await customerCareService.updateContact(b.id, { sort_order: first });
    },
    onSuccess: () => void refresh(),
    onError,
  });

  const activeItems = items.filter((i) => i.is_active);
  const hint = draft ? KINDS.find((k) => k.kind === draft.kind)?.hint : null;

  return (
    <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-slate-600">{t("These items appear on the public Contact page and the website footer. Only active items are shown.", "Ces éléments apparaissent sur la page Contact publique et le pied de page. Seuls les éléments actifs sont affichés.")}</p>
          <Button size="sm" className="shrink-0 gap-1" onClick={() => { setFormError(null); setDraft({ kind: "email", label: "", value: "", display_mode: "icon_text", is_active: true }); }}><Plus className="h-4 w-4" />{t("Add", "Ajouter")}</Button>
        </div>

        {list.isLoading ? <Skeleton className="h-48 w-full" /> : list.isError ? (
          <LoadError message={t("Could not load the contact items.", "Impossible de charger les contacts.")} onRetry={() => list.refetch()} />
        ) : items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">{t("No contact items yet. Add the email, phone, WhatsApp and social links people can reach you on.", "Aucun contact. Ajoutez e-mail, téléphone, WhatsApp et réseaux sociaux.")}</p>
        ) : (
          <ul className="space-y-2">
            {items.map((item, index) => (
              <li key={item.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[#264D73]"><ContactIcon kind={item.kind} className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{item.label || item.kind}</p>
                  <p className="truncate text-xs text-slate-600">{item.value}</p>
                </div>
                <Badge variant="outline" className="text-[10px]">{item.display_mode === "icon_only" ? t("Icon only", "Icône seule") : t("Icon + text", "Icône + texte")}</Badge>
                <div className="flex items-center gap-1">
                  <Switch checked={Boolean(item.is_active)} onCheckedChange={() => toggle.mutate(item)} aria-label={item.is_active ? t("Deactivate", "Désactiver") : t("Activate", "Activer")} disabled={toggle.isPending} />
                  <Button size="icon" variant="ghost" className="h-8 w-8" disabled={index === 0 || move.isPending} onClick={() => move.mutate({ index, delta: -1 })} aria-label={t("Move up", "Monter")}><ArrowUp className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" disabled={index === items.length - 1 || move.isPending} onClick={() => move.mutate({ index, delta: 1 })} aria-label={t("Move down", "Descendre")}><ArrowDown className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setFormError(null); setDraft({ id: item.id, kind: item.kind, label: item.label, value: item.value, display_mode: item.display_mode, is_active: Boolean(item.is_active) }); }} aria-label={t("Edit", "Modifier")}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-red-700" onClick={() => setDeleting(item)} aria-label={t("Delete", "Supprimer")}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">{t("Live preview of the public section", "Aperçu de la section publique")}</p>
        <div className="rounded-2xl bg-[#12314d] p-5 text-white" data-testid="contact-preview">
          <div className="mb-4 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={OFFICIAL_LOGO_SRC} alt="EduIgnite logo" className="h-10 w-10 rounded-lg bg-white p-1" />
            <span className="text-lg font-black tracking-tight">EduIgnite</span>
          </div>
          {activeItems.length === 0 ? <p className="text-sm text-white/60">{t("Nothing to show yet.", "Rien à afficher.")}</p> : <ContactGrid items={activeItems} tone="dark" />}
        </div>
      </div>

      <Dialog open={Boolean(draft)} onOpenChange={(o) => { if (!o) { setDraft(null); setFormError(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.id !== undefined ? t("Edit contact item", "Modifier le contact") : t("Add contact item", "Ajouter un contact")}</DialogTitle>
            <DialogDescription>{t("Links must be https. The server checks the format of each type.", "Les liens doivent être en https. Le serveur vérifie le format de chaque type.")}</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("Type", "Type")}</Label>
                <Select value={draft.kind} onValueChange={(v) => setDraft({ ...draft, kind: v as ContactKind })} disabled={draft.id !== undefined}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{KINDS.map((k) => <SelectItem key={k.kind} value={k.kind}>{language === "fr" ? k.label[1] : k.label[0]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label htmlFor="ci-label" className="text-xs">{t("Label shown to visitors", "Libellé affiché")}</Label><Input id="ci-label" value={draft.label} maxLength={80} onChange={(e) => setDraft({ ...draft, label: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="ci-value" className="text-xs">{t("Value", "Valeur")}</Label><Input id="ci-value" value={draft.value} placeholder={hint ? (language === "fr" ? hint[1] : hint[0]) : ""} onChange={(e) => setDraft({ ...draft, value: e.target.value })} /></div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("Display", "Affichage")}</Label>
                <Select value={draft.display_mode} onValueChange={(v) => setDraft({ ...draft, display_mode: v as DisplayMode })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="icon_text">{t("Icon and text", "Icône et texte")}</SelectItem>
                    <SelectItem value="icon_only">{t("Icon only", "Icône seule")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} />{t("Active (visible on the public site)", "Actif (visible sur le site public)")}</label>
              {formError && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">{formError}</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>{t("Cancel", "Annuler")}</Button>
            <Button disabled={!draft || !draft.value.trim() || save.isPending} onClick={() => draft && save.mutate(draft)}>
              {save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} {t("Save", "Enregistrer")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Delete this contact item?", "Supprimer ce contact ?")}</DialogTitle>
            <DialogDescription>{deleting ? `${deleting.label || deleting.kind}: ${deleting.value}. ${t("It disappears from the public site. To hide it temporarily, deactivate it instead.", "Il disparaît du site public. Pour le masquer temporairement, désactivez-le plutôt.")}` : ""}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>{t("Cancel", "Annuler")}</Button>
            <Button variant="destructive" disabled={remove.isPending} onClick={() => deleting && remove.mutate(deleting)}>
              {remove.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} {t("Delete", "Supprimer")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
