"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api/errors";
import {
  schoolSiteContentService,
  type Leader,
  type LeaderCandidate,
  type LeaderInput,
  type LeaderRole,
} from "@/lib/api/services/school-site-content.service";
import { resolveMediaUrl } from "@/lib/media";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { LoadError } from "@/components/ui/load-error";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDown, ArrowUp, Eye, EyeOff, ImagePlus, Loader2, Plus, Save, Trash2, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { Field, Section, useTr, type TabProps } from "./shared";
import { compressImage } from "@/lib/image-compress";
import { useEducationCategory } from "@/lib/hooks/useEducationCategory";

const KEYS = {
  leaders: ["school-site", "leadership"] as const,
  candidates: ["school-site", "leadership", "candidates"] as const,
};

function useRoleOptions() {
  const tr = useTr();
  const higher = useEducationCategory() === "higher";
  const common = [
    ["bursar", tr("Bursar", "Econome / Intendant")],
    ["other", tr("Other", "Autre")],
  ] as Array<[LeaderRole, string]>;
  if (higher) {
    return [
      ["founder", tr("Founder", "Fondateur")],
      ["chancellor", tr("Chancellor", "Chancelier")],
      ["rector", tr("Rector / President", "Recteur / President")],
      ["vice_chancellor", tr("Vice-Chancellor", "Vice-recteur")],
      ["dean", tr("Dean", "Doyen")],
      ["registrar", tr("Registrar", "Registraire")],
      ["head_of_department", tr("Head of Department", "Chef de departement")],
      ["lecturer", tr("Lecturer", "Enseignant")],
      ["board_member", tr("Board member", "Membre du conseil")],
      ...common,
    ] as Array<[LeaderRole, string]>;
  }
  return [
    ["principal", tr("Principal", "Directeur / Principal")],
    ["vice_principal", tr("Vice Principal", "Directeur adjoint")],
    ["head_of_studies", tr("Head of Studies", "Directeur des etudes")],
    ["discipline_master", tr("Discipline Master", "Surveillant general")],
    ["founder", tr("Founder", "Fondateur")],
    ["board_member", tr("Board member", "Membre du conseil")],
    ...common,
  ] as Array<[LeaderRole, string]>;
}

/** A small square-ish picture as a data URL, so people without an account can have a photo. */
async function pictureToDataUrl(file: File): Promise<string> {
  const small = await compressImage(file, 480, 0.8);
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("unreadable"));
    reader.readAsDataURL(small);
  });
}

function PhotoPicker({ value, onChange, name }: { value: string | null; onChange: (dataUrl: string) => void; name: string }) {
  const tr = useTr();
  const { toast } = useToast();
  return (
    <div className="flex items-center gap-3">
      <Avatar photo={value} name={name || "?"} size={64} />
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
        <ImagePlus className="h-4 w-4" />{value ? tr("Change photo", "Changer la photo") : tr("Add a photo", "Ajouter une photo")}
        <input type="file" accept="image/*" className="sr-only" onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          try { onChange(await pictureToDataUrl(file)); } catch { toast({ variant: "destructive", title: tr("That picture could not be read", "Cette image n'a pas pu etre lue") }); }
        }} />
      </label>
    </div>
  );
}

function AddPersonForm({ roleOptions, onSaved }: { roleOptions: Array<[LeaderRole, string]>; onSaved: () => void }) {
  const tr = useTr();
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", title_en: "", title_fr: "", role: roleOptions[0]?.[0] ?? "founder", bio_en: "", photo: "" });
  const create = useMutation({
    mutationFn: () => schoolSiteContentService.addLeader({
      name: form.name.trim(), public_title_en: form.title_en.trim(), public_title_fr: form.title_fr.trim(),
      role_category: form.role as LeaderRole, bio_en: form.bio_en.trim(), photo: form.photo || undefined,
    }),
    onSuccess: () => { setForm({ ...form, name: "", title_en: "", title_fr: "", bio_en: "", photo: "" }); onSaved(); toast({ title: tr("Added to your website.", "Ajoute a votre site.") }); },
    onError: (error) => toast({ variant: "destructive", title: tr("Could not save", "Enregistrement impossible"), description: getApiErrorMessage(error, "") }),
  });
  return (
    <div className="space-y-4 rounded-2xl bg-muted/40 p-4">
      <p className="text-sm text-muted-foreground">{tr("For founders, the chancellor, board members and anyone without an account. Only what you type here is public.", "Pour les fondateurs, le chancelier, les membres du conseil et toute personne sans compte. Seul ce que vous saisissez ici est public.")}</p>
      <PhotoPicker value={form.photo || null} name={form.name} onChange={(photo) => setForm({ ...form, photo })} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={tr("Full name", "Nom complet")} htmlFor="np-name"><Input id="np-name" value={form.name} maxLength={120} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label={tr("Position", "Fonction")} htmlFor="np-role">
          <select id="np-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as LeaderRole })} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            {roleOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
        <Field label={tr("Public title (English)", "Titre public (anglais)")} htmlFor="np-te"><Input id="np-te" value={form.title_en} maxLength={120} placeholder={tr("Founder and Chairman", "Fondateur et President")} onChange={(e) => setForm({ ...form, title_en: e.target.value })} /></Field>
        <Field label={tr("Public title (French)", "Titre public (francais)")} htmlFor="np-tf"><Input id="np-tf" value={form.title_fr} maxLength={120} onChange={(e) => setForm({ ...form, title_fr: e.target.value })} /></Field>
      </div>
      <Field label={tr("Short biography (optional)", "Courte biographie (facultatif)")} htmlFor="np-bio" count={form.bio_en.length} max={1500}>
        <Textarea id="np-bio" rows={3} value={form.bio_en} maxLength={1500} onChange={(e) => setForm({ ...form, bio_en: e.target.value })} />
      </Field>
      <Button className="gap-2" disabled={create.isPending || !form.name.trim()} onClick={() => create.mutate()}>
        {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{tr("Add to my website", "Ajouter a mon site")}
      </Button>
    </div>
  );
}

function Avatar({ photo, name, size = 64 }: { photo: string | null; name: string; size?: number }) {
  const src = resolveMediaUrl(photo);
  return (
    <span className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-50 ring-2 ring-blue-100" style={{ width: size, height: size }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="text-lg font-black text-blue-800" aria-hidden>{name.slice(0, 1).toUpperCase() || <UserRound className="h-5 w-5" />}</span>
      )}
    </span>
  );
}

export function LeadershipTab({ readOnly }: TabProps) {
  const tr = useTr();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const leaders = useQuery({ queryKey: KEYS.leaders, queryFn: schoolSiteContentService.listLeaders });
  const candidates = useQuery({ queryKey: KEYS.candidates, queryFn: schoolSiteContentService.leaderCandidates });
  const [removing, setRemoving] = useState<Leader | null>(null);
  const [showAddPerson, setShowAddPerson] = useState(false);
  const roleOptions = useRoleOptions();

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: KEYS.leaders });
    queryClient.invalidateQueries({ queryKey: ["public-site", "audit"] });
  };
  const fail = (error: unknown) =>
    toast({ variant: "destructive", title: tr("Could not save", "Enregistrement impossible"), description: getApiErrorMessage(error, "") });

  const add = useMutation({
    mutationFn: (candidate: LeaderCandidate) =>
      schoolSiteContentService.addLeader({ user: candidate.user, role_category: candidate.suggested_role_category }),
    onSuccess: refresh,
    onError: fail,
  });
  const addAll = useMutation({
    mutationFn: async (people: LeaderCandidate[]) => {
      for (const person of people) await schoolSiteContentService.addLeader({ user: person.user, role_category: person.suggested_role_category });
    },
    onSuccess: refresh,
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: (id: string) => schoolSiteContentService.removeLeader(id),
    onSuccess: () => { setRemoving(null); refresh(); },
    onError: fail,
  });
  const reorder = useMutation({
    mutationFn: (ids: string[]) => schoolSiteContentService.reorderLeaders(ids),
    onSuccess: (fresh) => { queryClient.setQueryData(KEYS.leaders, fresh); refresh(); },
    onError: fail,
  });

  if (leaders.isLoading) return <Skeleton className="h-64 w-full" />;
  if (leaders.isError) return <LoadError message={tr("Could not load the leadership team.", "Impossible de charger l'equipe de direction.")} onRetry={() => leaders.refetch()} retrying={leaders.isFetching} />;

  const list = leaders.data ?? [];
  const available = (candidates.data ?? []).filter((c) => !c.already_added);
  const move = (index: number, delta: number) => {
    const ids = list.map((l) => l.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorder.mutate(ids);
  };

  const visible = list.filter((l) => l.is_visible);

  return (
    <div className="space-y-6">
      <Section
        title={tr("Leadership team", "Equipe de direction")}
        description={tr(
          "Choose which members of your existing staff are presented on your website, in the order you want. Only the name, title, optional photo and short biography are public. Email and phone numbers are never shown.",
          "Choisissez quels membres de votre personnel existant sont presentes sur votre site, dans l'ordre voulu. Seuls le nom, le titre, la photo (facultative) et une courte biographie sont publics. Les emails et telephones ne sont jamais affiches.",
        )}
      >
        {list.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            {tr("No leader selected yet. Until you add some, your website shows its principal and the staff who chose to appear in the staff directory.", "Aucun responsable choisi. Tant que vous n'en ajoutez pas, votre site affiche le directeur et les membres du personnel ayant choisi d'apparaitre dans l'annuaire.")}
          </div>
        ) : (
          <ol className="space-y-3">
            {list.map((leader, index) => (
              <LeaderRow
                key={leader.id}
                leader={leader}
                readOnly={readOnly}
                roleOptions={roleOptions}
                first={index === 0}
                last={index === list.length - 1}
                moving={reorder.isPending}
                onMove={(delta) => move(index, delta)}
                onRemove={() => setRemoving(leader)}
                onSaved={refresh}
              />
            ))}
          </ol>
        )}
      </Section>

      {!readOnly ? (
        <Section title={tr("Add a person who is not on your staff", "Ajouter une personne hors du personnel")} description={tr("Founders, chancellor, board members.", "Fondateurs, chancelier, membres du conseil.")}>
          <Button type="button" variant={showAddPerson ? "outline" : "default"} className="mb-3" onClick={() => setShowAddPerson((v) => !v)}>
            {showAddPerson ? tr("Close", "Fermer") : `+ ${tr("Add a person", "Ajouter une personne")}`}
          </Button>
          {showAddPerson ? <AddPersonForm roleOptions={roleOptions} onSaved={refresh} /> : null}
        </Section>
      ) : null}

      {!readOnly ? (
        <Section title={tr("Add from your staff", "Ajouter depuis votre personnel")} description={tr("Only people who already have an account at your school are listed. No one is duplicated.", "Seules les personnes ayant deja un compte dans votre ecole sont listees. Personne n'est duplique.")}>
          {candidates.isLoading ? <Skeleton className="h-16 w-full" /> : candidates.isError ? (
            <LoadError message={tr("Could not load your staff.", "Impossible de charger votre personnel.")} onRetry={() => candidates.refetch()} retrying={candidates.isFetching} />
          ) : available.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tr("Everyone on your staff is already in the list.", "Tout votre personnel est deja dans la liste.")}</p>
          ) : (
            <>
            <Button type="button" variant="outline" size="sm" className="mb-3 gap-2" disabled={addAll.isPending} onClick={() => addAll.mutate(available)}>
              {addAll.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{tr(`Add everyone (${available.length})`, `Ajouter tout le monde (${available.length})`)}
            </Button>
            <ul className="grid gap-2 sm:grid-cols-2">
              {available.map((c) => (
                <li key={c.user} className="flex items-center gap-3 rounded-xl border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{c.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{c.directory_title || c.role_label}</p>
                  </div>
                  <Button size="sm" className="gap-2" disabled={add.isPending} onClick={() => add.mutate(c)} aria-label={tr("Add", "Ajouter") + " " + c.name}>
                    {add.isPending && add.variables?.user === c.user ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{tr("Add", "Ajouter")}
                  </Button>
                </li>
              ))}
            </ul>
            </>
          )}
        </Section>
      ) : null}

      <Section title={tr("Preview", "Apercu")} description={tr("How the leadership appears on your website.", "Comment la direction apparait sur votre site.")}>
        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tr("Nothing to show yet.", "Rien a afficher pour l'instant.")}</p>
        ) : (
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="mx-auto max-w-[16rem]"><PreviewCard leader={visible[0]} large /></div>
            {visible.length > 1 ? (
              <ul className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                {visible.slice(1).map((l) => <li key={l.id}><PreviewCard leader={l} /></li>)}
              </ul>
            ) : null}
          </div>
        )}
      </Section>

      <AlertDialog open={!!removing} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr("Remove from the leadership list?", "Retirer de la liste de direction ?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {tr("The person is only removed from the website list. Their account and staff record are not touched.", "La personne est seulement retiree de la liste du site. Son compte et sa fiche de personnel ne sont pas modifies.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("Cancel", "Annuler")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => removing && remove.mutate(removing.id)}>{tr("Remove", "Retirer")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PreviewCard({ leader, large }: { leader: Leader; large?: boolean }) {
  const tr = useTr();
  const title = tr(leader.public_title_en || leader.public_title_fr, leader.public_title_fr || leader.public_title_en) || leader.role_label;
  return (
    <div className="rounded-2xl border bg-white p-4 text-center shadow-sm">
      <div className="mx-auto w-fit"><Avatar photo={leader.photo} name={leader.name} size={large ? 88 : 64} /></div>
      <p className="mt-2 font-bold text-blue-950">{leader.name}</p>
      <p className="text-sm font-medium text-green-800">{title}</p>
    </div>
  );
}

function LeaderRow({
  leader, readOnly, roleOptions, first, last, moving, onMove, onRemove, onSaved,
}: {
  leader: Leader; readOnly: boolean; roleOptions: Array<[LeaderRole, string]>;
  first: boolean; last: boolean; moving: boolean;
  onMove: (delta: number) => void; onRemove: () => void; onSaved: () => void;
}) {
  const tr = useTr();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    public_title_en: leader.public_title_en, public_title_fr: leader.public_title_fr,
    role_category: leader.role_category, bio_en: leader.bio_en, bio_fr: leader.bio_fr,
    name: leader.name,
  });
  const [photo, setPhoto] = useState<string | null>(null);
  const dirty = photo !== null || (Object.keys(form) as Array<keyof typeof form>).some((k) => form[k] !== leader[k]);

  const patch = useMutation({
    mutationFn: (input: LeaderInput) => schoolSiteContentService.updateLeader(leader.id, input),
    onSuccess: onSaved,
    onError: (error) => toast({ variant: "destructive", title: tr("Could not save", "Enregistrement impossible"), description: getApiErrorMessage(error, "") }),
  });
  const id = `leader-${leader.id}`;

  return (
    <li className={cn("rounded-xl border p-3", !leader.is_visible && "bg-muted/30")}>
      <div className="flex flex-wrap items-center gap-3">
        <Avatar photo={leader.photo} name={leader.name} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{leader.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {tr(leader.public_title_en || leader.public_title_fr, leader.public_title_fr || leader.public_title_en) || leader.role_label}
            {!leader.is_visible ? ` · ${tr("Hidden", "Masque")}` : ""}
          </p>
        </div>
        {!readOnly ? (
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="h-8 w-8" disabled={first || moving} onClick={() => onMove(-1)} aria-label={tr("Move up", "Monter") + ": " + leader.name}><ArrowUp className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" disabled={last || moving} onClick={() => onMove(1)} aria-label={tr("Move down", "Descendre") + ": " + leader.name}><ArrowDown className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" disabled={patch.isPending} onClick={() => patch.mutate({ is_visible: !leader.is_visible })} aria-label={(leader.is_visible ? tr("Hide", "Masquer") : tr("Show", "Afficher")) + ": " + leader.name}>
              {leader.is_visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={onRemove} aria-label={tr("Remove", "Retirer") + ": " + leader.name}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ) : null}
        <Button size="sm" variant="outline" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>{open ? tr("Close", "Fermer") : readOnly ? tr("Details", "Details") : tr("Edit", "Modifier")}</Button>
      </div>

      {open ? (
        <div id={id} className="mt-4 space-y-4 border-t pt-4">
          {leader.external ? (
            <div className="space-y-3">
              <PhotoPicker value={photo ?? leader.photo} name={form.name} onChange={setPhoto} />
              <Field label={tr("Full name", "Nom complet")} htmlFor={`${id}-name`}>
                <Input id={`${id}-name`} value={form.name} maxLength={120} disabled={readOnly} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={tr("Public title (English)", "Titre public (anglais)")} htmlFor={`${id}-te`} count={form.public_title_en.length} max={120}>
              <Input id={`${id}-te`} value={form.public_title_en} maxLength={120} disabled={readOnly} placeholder={leader.role_label} onChange={(e) => setForm({ ...form, public_title_en: e.target.value })} />
            </Field>
            <Field label={tr("Public title (French)", "Titre public (francais)")} htmlFor={`${id}-tf`} count={form.public_title_fr.length} max={120}>
              <Input id={`${id}-tf`} value={form.public_title_fr} maxLength={120} disabled={readOnly} onChange={(e) => setForm({ ...form, public_title_fr: e.target.value })} />
            </Field>
          </div>
          <Field label={tr("Position", "Fonction")} htmlFor={`${id}-role`}>
            <select id={`${id}-role`} value={form.role_category} disabled={readOnly} onChange={(e) => setForm({ ...form, role_category: e.target.value as LeaderRole })} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm sm:max-w-xs">
              {roleOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={tr("Short biography (English)", "Courte biographie (anglais)")} htmlFor={`${id}-be`} count={form.bio_en.length} max={1500}>
              <Textarea id={`${id}-be`} rows={3} value={form.bio_en} maxLength={1500} disabled={readOnly} onChange={(e) => setForm({ ...form, bio_en: e.target.value })} />
            </Field>
            <Field label={tr("Short biography (French)", "Courte biographie (francais)")} htmlFor={`${id}-bf`} count={form.bio_fr.length} max={1500}>
              <Textarea id={`${id}-bf`} rows={3} value={form.bio_fr} maxLength={1500} disabled={readOnly} onChange={(e) => setForm({ ...form, bio_fr: e.target.value })} />
            </Field>
          </div>
          {!leader.external ? <div className="flex items-start gap-3 rounded-xl border p-3">
            <Switch id={`${id}-photo`} checked={leader.show_photo} disabled={readOnly || !leader.has_photo || patch.isPending} onCheckedChange={(v) => patch.mutate({ show_photo: v })} />
            <label htmlFor={`${id}-photo`} className="text-sm">
              <span className="font-medium">{tr("Show this person's photo", "Afficher la photo de cette personne")}</span>
              <span className="block text-xs text-muted-foreground">
                {leader.has_photo
                  ? tr("Uses the photo of their account. Only turn it on with their agreement.", "Utilise la photo de leur compte. Activez-la uniquement avec leur accord.")
                  : tr("This person has no photo on their account, so initials are shown.", "Cette personne n'a pas de photo sur son compte : ses initiales sont affichees.")}
              </span>
            </label>
          </div> : null}
          {!readOnly ? (
            <Button className="gap-2" disabled={!dirty || patch.isPending} onClick={() => patch.mutate({ ...form, ...(leader.external ? {} : { name: undefined }), ...(photo !== null ? { photo } : {}) }, { onSuccess: () => setPhoto(null) })}>
              {patch.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{tr("Save", "Enregistrer")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
