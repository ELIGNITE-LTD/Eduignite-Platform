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
import { ArrowDown, ArrowUp, Eye, EyeOff, Loader2, Plus, Save, Trash2, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { Field, Section, useTr, type TabProps } from "./shared";

const KEYS = {
  leaders: ["school-site", "leadership"] as const,
  candidates: ["school-site", "leadership", "candidates"] as const,
};

function useRoleOptions() {
  const tr = useTr();
  return [
    ["principal", tr("Principal", "Directeur / Principal")],
    ["vice_principal", tr("Vice Principal", "Directeur adjoint")],
    ["head_of_studies", tr("Head of Studies", "Directeur des etudes")],
    ["discipline_master", tr("Discipline Master", "Surveillant general")],
    ["bursar", tr("Bursar", "Econome / Intendant")],
    ["other", tr("Other", "Autre")],
  ] as Array<[LeaderRole, string]>;
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
        <Section title={tr("Add from your staff", "Ajouter depuis votre personnel")} description={tr("Only people who already have an account at your school are listed. No one is duplicated.", "Seules les personnes ayant deja un compte dans votre ecole sont listees. Personne n'est duplique.")}>
          {candidates.isLoading ? <Skeleton className="h-16 w-full" /> : candidates.isError ? (
            <LoadError message={tr("Could not load your staff.", "Impossible de charger votre personnel.")} onRetry={() => candidates.refetch()} retrying={candidates.isFetching} />
          ) : available.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tr("Everyone on your staff is already in the list.", "Tout votre personnel est deja dans la liste.")}</p>
          ) : (
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
  });
  const dirty = (Object.keys(form) as Array<keyof typeof form>).some((k) => form[k] !== leader[k]);

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
          <div className="flex items-start gap-3 rounded-xl border p-3">
            <Switch id={`${id}-photo`} checked={leader.show_photo} disabled={readOnly || !leader.has_photo || patch.isPending} onCheckedChange={(v) => patch.mutate({ show_photo: v })} />
            <label htmlFor={`${id}-photo`} className="text-sm">
              <span className="font-medium">{tr("Show this person's photo", "Afficher la photo de cette personne")}</span>
              <span className="block text-xs text-muted-foreground">
                {leader.has_photo
                  ? tr("Uses the photo of their account. Only turn it on with their agreement.", "Utilise la photo de leur compte. Activez-la uniquement avec leur accord.")
                  : tr("This person has no photo on their account, so initials are shown.", "Cette personne n'a pas de photo sur son compte : ses initiales sont affichees.")}
              </span>
            </label>
          </div>
          {!readOnly ? (
            <Button className="gap-2" disabled={!dirty || patch.isPending} onClick={() => patch.mutate(form)}>
              {patch.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{tr("Save", "Enregistrer")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
