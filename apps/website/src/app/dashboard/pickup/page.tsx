"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageCircle, Pencil, Phone, Plus, Search, ShieldCheck, Trash2, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api/errors";
import { useEducationCategory } from "@/lib/hooks/useEducationCategory";
import { useMyTeachingClasses } from "@/lib/hooks/useAttendance";
import { useHierarchyClasses } from "@/lib/hooks/useSchools";
import { useHealthRows } from "@/lib/hooks/useSchoolLife";
import { pickupService, type Pickup, type PickupInput } from "@/lib/api/services/pickup.service";
import { telHref, whatsappHref } from "@/lib/pickup-links";

const EMPTY: PickupInput = { full_name: "", relationship: "", phone: "", id_note: "" };

/** Authorised pick-up: who may collect each child. Staff only (admins and the class teacher). */
export default function PickupPage() {
  const { user } = useAuth();
  const { language } = useI18n();
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);
  const { toast } = useToast();
  const qc = useQueryClient();
  const isBasic = useEducationCategory() === "basic";
  const role = user?.role;
  const isTeacher = role === "TEACHER";
  const isAdmin = role === "SCHOOL_ADMIN" || role === "SUB_ADMIN";
  const allowed = isBasic && (isTeacher || isAdmin);
  const schoolId = typeof user?.school?.id === "string" ? user.school.id : "";

  const mine = useMyTeachingClasses(allowed && isTeacher);
  const all = useHierarchyClasses({ school_id: schoolId }, allowed && isAdmin && Boolean(schoolId));
  const classes = useMemo(
    () => (isTeacher ? mine.data ?? [] : all.data ?? []).map((c: any) => ({ id: String(c.id), name: String(c.name) })),
    [isTeacher, mine.data, all.data],
  );
  const [classId, setClassId] = useState("");
  useEffect(() => {
    setClassId((cur) => (cur && classes.some((c) => c.id === cur) ? cur : classes[0]?.id ?? ""));
  }, [classes]);

  const children = useHealthRows(classId, allowed && Boolean(classId));
  const [search, setSearch] = useState("");
  const rows = useMemo(
    () => (children.data ?? []).filter((r) => r.student_name.toLowerCase().includes(search.trim().toLowerCase())),
    [children.data, search],
  );

  const [openId, setOpenId] = useState("");
  const child = (children.data ?? []).find((r) => r.student === openId) ?? null;
  const people = useQuery({ queryKey: ["pickups", openId], queryFn: () => pickupService.list(openId), enabled: allowed && Boolean(openId) });

  const [editing, setEditing] = useState<Pickup | "new" | null>(null);
  const [form, setForm] = useState<PickupInput>(EMPTY);
  const startEdit = (p: Pickup | "new") => {
    setEditing(p);
    setForm(p === "new" ? EMPTY : { full_name: p.full_name, relationship: p.relationship, phone: p.phone, id_note: p.id_note });
  };
  const done = () => { setEditing(null); setForm(EMPTY); qc.invalidateQueries({ queryKey: ["pickups", openId] }); };
  const fail = (e: unknown) => toast({ variant: "destructive", title: t("Not saved", "Non enregistre"), description: getApiErrorMessage(e) });

  const save = useMutation({
    mutationFn: () => (editing && editing !== "new" ? pickupService.update(editing.id, form) : pickupService.create(openId, form)),
    onSuccess: done,
    onError: fail,
  });
  const remove = useMutation({ mutationFn: (id: string) => pickupService.remove(id), onSuccess: done, onError: fail });

  if (!user) return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary/30" /></div>;
  if (!allowed) {
    return (
      <p className="mx-auto max-w-3xl p-6 text-sm text-muted-foreground">
        {t("Authorised pick-up is available to the school administration and class teachers of nursery and primary schools.",
          "Les personnes autorisees sont reservees a l'administration et aux enseignants des ecoles maternelles et primaires.")}
      </p>
    );
  }

  const canSave = form.full_name.trim() !== "" && form.phone.trim() !== "";

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-24">
      <div>
        <h1 className="flex items-center gap-3 text-3xl font-bold text-primary font-headline">
          <div className="rounded-xl bg-primary p-2 text-secondary shadow-lg"><ShieldCheck className="h-6 w-6" /></div>
          {t("Authorised pick-up", "Personnes autorisees")}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {t("Who may collect each child. Check the name and phone before handing a child over.",
            "Qui peut recuperer chaque enfant. Verifiez le nom et le telephone avant de remettre l'enfant.")}
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Select value={classId} onValueChange={setClassId}>
          <SelectTrigger className="h-12 sm:w-64"><SelectValue placeholder={t("Choose a class", "Choisir une classe")} /></SelectTrigger>
          <SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
        </Select>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-12 pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("Search a child", "Rechercher un enfant")} />
        </div>
      </div>

      {children.isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t("No children in this class yet.", "Aucun enfant dans cette classe.")}</p>
      ) : (
        <ul className="divide-y rounded-2xl border bg-card">
          {rows.map((r) => (
            <li key={r.student}>
              <button type="button" onClick={() => { setOpenId(r.student); setEditing(null); }} className="flex min-h-[56px] w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-accent/40">
                <span>
                  <span className="block font-semibold">{r.student_name}</span>
                  <span className="block text-xs text-muted-foreground">{r.class_name}</span>
                </span>
                <UserCheck className="h-5 w-5 text-primary/50" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={Boolean(openId)} onOpenChange={(o) => { if (!o) { setOpenId(""); setEditing(null); } }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{child?.student_name ?? ""}</DialogTitle></DialogHeader>
          <p className="-mt-2 text-sm text-muted-foreground">{t("People allowed to collect this child", "Personnes autorisees a recuperer cet enfant")}</p>

          {people.isLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (people.data ?? []).length === 0 && editing === null ? (
            <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">{t("Nobody added yet.", "Personne n'a encore ete ajoute.")}</p>
          ) : (
            <ul className="space-y-2">
              {(people.data ?? []).map((p) => (
                <li key={p.id} className="rounded-xl border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">{p.full_name}</p>
                      <p className="text-xs text-muted-foreground">{[p.relationship, p.id_note].filter(Boolean).join(" · ")}</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button size="icon" variant="ghost" aria-label={t("Edit", "Modifier")} onClick={() => startEdit(p)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" aria-label={t("Remove", "Retirer")} className="text-destructive" disabled={remove.isPending} onClick={() => remove.mutate(p.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline" className="h-10 gap-1.5"><a href={telHref(p.phone)}><Phone className="h-4 w-4" />+{p.phone}</a></Button>
                    {whatsappHref(p.phone) ? (
                      <Button asChild size="sm" variant="outline" className="h-10 gap-1.5"><a href={whatsappHref(p.phone)} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-4 w-4" />WhatsApp</a></Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {editing === null ? (
            <Button className="h-12 w-full gap-2" onClick={() => startEdit("new")}><Plus className="h-4 w-4" />{t("Add a person", "Ajouter une personne")}</Button>
          ) : (
            <div className="space-y-3 rounded-xl bg-accent/40 p-4">
              <div className="space-y-1.5">
                <Label htmlFor="pk-name">{t("Full name", "Nom complet")} *</Label>
                <Input id="pk-name" className="h-12" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pk-rel">{t("Relationship", "Lien")}</Label>
                  <Input id="pk-rel" className="h-12" value={form.relationship} placeholder={t("e.g. uncle", "ex. oncle")} onChange={(e) => setForm({ ...form, relationship: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pk-phone">{t("Phone", "Telephone")} *</Label>
                  <Input id="pk-phone" className="h-12" type="tel" inputMode="tel" value={form.phone} placeholder="+237 6XX XXX XXX" onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pk-id">{t("ID or pick-up code (optional)", "Piece d'identite ou code (facultatif)")}</Label>
                <Input id="pk-id" className="h-12" maxLength={60} value={form.id_note} onChange={(e) => setForm({ ...form, id_note: e.target.value })} />
              </div>
              <div className="flex gap-2">
                <Button className="h-12 flex-1" disabled={!canSave || save.isPending} onClick={() => save.mutate()}>
                  {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("Save", "Enregistrer")}
                </Button>
                <Button className="h-12" variant="outline" onClick={() => setEditing(null)}>{t("Cancel", "Annuler")}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
