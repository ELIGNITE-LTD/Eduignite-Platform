"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Eye, EyeOff, Loader2, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadError } from "@/components/ui/load-error";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api/errors";
import { extractFieldErrors } from "@/lib/api/services/public-site.service";
import {
  CONTENT_KEYS, EVENT_CATEGORIES, publicSiteContentService, type EventCategory, type SiteEvent,
} from "@/lib/api/services/public-site-content.service";
import { useI18n } from "@/lib/i18n-context";
import { cn } from "@/lib/utils";
import { Field, Section, useTr, type TabProps } from "./shared";
import { ImagePicker } from "./image-picker";

const TZ = "Africa/Douala";

/** ISO instant -> "YYYY-MM-DDTHH:mm" in Cameroon time, for a datetime-local input. */
function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** The typed time is Cameroon time (UTC+1, no daylight saving). */
function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(`${value}:00+01:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

type FormState = {
  title_en: string; title_fr: string; description_en: string; description_fr: string;
  start: string; end: string; location: string; category: EventCategory;
};
const EMPTY: FormState = {
  title_en: "", title_fr: "", description_en: "", description_fr: "", start: "", end: "", location: "", category: "other",
};

export function useCategoryLabel() {
  const tr = useTr();
  const labels: Record<string, [string, string]> = {
    academic: ["Academic", "Academique"], cultural: ["Cultural", "Culturel"], sports: ["Sports", "Sport"],
    ceremony: ["Ceremony", "Ceremonie"], meeting: ["Meeting", "Reunion"], holiday: ["Holiday", "Vacances"],
    other: ["Other", "Autre"], campus: ["Campus", "Campus"], classrooms: ["Classrooms", "Salles de classe"],
    labs: ["Labs", "Laboratoires"], events: ["Events", "Evenements"],
  };
  return (key: string) => (labels[key] ? tr(...labels[key]) : key);
}

export function EventsTab({ readOnly }: TabProps) {
  const tr = useTr();
  const { language } = useI18n();
  const categoryLabel = useCategoryLabel();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<SiteEvent | "new" | null>(null);
  const [deleting, setDeleting] = useState<SiteEvent | null>(null);

  const query = useQuery({ queryKey: CONTENT_KEYS.events, queryFn: publicSiteContentService.listEvents });
  const refresh = () => queryClient.invalidateQueries({ queryKey: CONTENT_KEYS.events });

  const toggle = useMutation({
    mutationFn: (event: SiteEvent) => publicSiteContentService.setEventPublished(event.id, event.status !== "published"),
    onSuccess: (event) => {
      refresh();
      toast({
        title: event.status === "published" ? tr("Event published", "Evenement publie") : tr("Event unpublished", "Evenement retire du site"),
      });
    },
    onError: (error) =>
      toast({
        variant: "destructive", title: tr("Could not change publication", "Changement impossible"),
        description: Object.values(extractFieldErrors(error))[0] || getApiErrorMessage(error, ""),
      }),
  });
  const remove = useMutation({
    mutationFn: (event: SiteEvent) => publicSiteContentService.deleteEvent(event.id),
    onSuccess: () => {
      refresh();
      setDeleting(null);
      toast({ title: tr("Event deleted", "Evenement supprime") });
    },
    onError: (error) => toast({ variant: "destructive", title: tr("Could not delete", "Suppression impossible"), description: getApiErrorMessage(error, "") }),
  });

  if (query.isLoading) return <Skeleton className="h-48 w-full" />;
  if (query.isError || !query.data) {
    return <LoadError message={tr("Could not load events.", "Impossible de charger les evenements.")} onRetry={() => query.refetch()} retrying={query.isFetching} />;
  }
  const events = query.data.results;
  const titleOf = (e: SiteEvent) => (language === "fr" ? e.title_fr || e.title_en : e.title_en || e.title_fr);
  const when = (iso: string) => new Date(iso).toLocaleString(language === "fr" ? "fr-CM" : "en-CM", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" });
  const bucketLabel = { upcoming: tr("Upcoming", "A venir"), ongoing: tr("Ongoing", "En cours"), past: tr("Past", "Passe") };

  return (
    <div className="space-y-6">
      <Section
        title={tr("Public events", "Evenements publics")}
        description={tr(
          "Events shown on your website under Events. They are separate from internal school events: publishing here never notifies parents, students or staff. Times are Cameroon time.",
          "Evenements affiches sur votre site, rubrique Evenements. Ils sont distincts des evenements internes : publier ici n'envoie aucune notification aux parents, eleves ou personnel. Les heures sont celles du Cameroun.",
        )}
      >
        {!readOnly ? (
          <Button onClick={() => setEditing("new")} className="gap-2">
            <Plus className="h-4 w-4" aria-hidden /> {tr("New event", "Nouvel evenement")}
          </Button>
        ) : null}

        {events.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center">
            <CalendarDays className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="font-semibold">{tr("No public events yet", "Aucun evenement public pour le moment")}</p>
            <p className="max-w-md text-sm text-muted-foreground">
              {tr("Create an event, then publish it so visitors can see it on your website.", "Creez un evenement puis publiez-le pour que les visiteurs le voient sur votre site.")}
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {events.map((event) => (
              <li key={event.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-3">
                <div className="h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {event.cover_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={event.cover_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{titleOf(event)}</p>
                  <p className="text-sm text-muted-foreground">{when(event.start_at)}</p>
                  {event.location ? (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" aria-hidden /> {event.location}</p>
                  ) : null}
                  <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] font-bold uppercase">
                    <span className={cn("rounded-full px-2 py-0.5", event.status === "published" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700")}>
                      {event.status === "published" ? tr("Published", "Publie") : tr("Draft", "Brouillon")}
                    </span>
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-800">{bucketLabel[event.bucket]}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5">{categoryLabel(event.category)}</span>
                  </div>
                </div>
                {!readOnly ? (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing(event)}>
                      <Pencil className="mr-1.5 h-4 w-4" aria-hidden /> {tr("Edit", "Modifier")}
                    </Button>
                    <Button size="sm" variant="outline" disabled={toggle.isPending} onClick={() => toggle.mutate(event)}>
                      {event.status === "published" ? <EyeOff className="mr-1.5 h-4 w-4" aria-hidden /> : <Eye className="mr-1.5 h-4 w-4" aria-hidden />}
                      {event.status === "published" ? tr("Unpublish", "Retirer") : tr("Publish", "Publier")}
                    </Button>
                    <Button size="sm" variant="outline" className="text-destructive" onClick={() => setDeleting(event)} aria-label={`${tr("Delete", "Supprimer")}: ${titleOf(event)}`}>
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          {tr(`Images used: ${query.data.quota.used} of ${query.data.quota.limit} for events and gallery together.`, `Images utilisees : ${query.data.quota.used} sur ${query.data.quota.limit} pour les evenements et la galerie.`)}
        </p>
      </Section>

      {editing ? (
        <EventDialog
          event={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            refresh();
            setEditing(null);
          }}
        />
      ) : null}

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr("Delete this event?", "Supprimer cet evenement ?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {tr("It will disappear from your website and cannot be recovered.", "Il disparaitra de votre site et ne pourra pas etre recupere.")}
              {deleting ? ` (${titleOf(deleting)})` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("Cancel", "Annuler")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && remove.mutate(deleting)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {tr("Delete", "Supprimer")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EventDialog({ event, onClose, onSaved }: { event: SiteEvent | null; onClose: () => void; onSaved: () => void }) {
  const tr = useTr();
  const categoryLabel = useCategoryLabel();
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(
    event
      ? {
          title_en: event.title_en, title_fr: event.title_fr, description_en: event.description_en, description_fr: event.description_fr,
          start: toLocalInput(event.start_at), end: toLocalInput(event.end_at), location: event.location, category: event.category,
        }
      : EMPTY,
  );
  const [file, setFile] = useState<File | null>(null);
  const [cover, setCover] = useState<string | null>(event?.cover_url ?? null);
  const [progress, setProgress] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: "" }));
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        title_en: form.title_en.trim(), title_fr: form.title_fr.trim(),
        description_en: form.description_en.trim(), description_fr: form.description_fr.trim(),
        start_at: fromLocalInput(form.start) ?? undefined, end_at: fromLocalInput(form.end),
        location: form.location.trim(), category: form.category,
      };
      const saved = event
        ? await publicSiteContentService.updateEvent(event.id, payload)
        : await publicSiteContentService.createEvent(payload);
      if (file) {
        try {
          await publicSiteContentService.uploadEventCover(saved.id, file, setProgress);
        } catch (error) {
          toast({
            variant: "destructive",
            title: tr("Event saved, but the image was not uploaded", "Evenement enregistre, mais l'image n'a pas ete envoyee"),
            description: Object.values(extractFieldErrors(error))[0] || getApiErrorMessage(error, ""),
          });
        }
      }
      return saved;
    },
    onSuccess: () => {
      toast({ title: tr("Event saved", "Evenement enregistre") });
      onSaved();
    },
    onError: (error) => {
      setProgress(null);
      const fields = extractFieldErrors(error);
      if (fields.start_at) fields.start = fields.start_at;
      if (fields.end_at) fields.end = fields.end_at;
      setErrors(fields);
      toast({ variant: "destructive", title: tr("Could not save", "Enregistrement impossible"), description: getApiErrorMessage(error, tr("Please check the highlighted fields.", "Veuillez verifier les champs en rouge.")) });
    },
  });

  const removeCover = useMutation({
    mutationFn: () => publicSiteContentService.removeEventCover(event!.id),
    onSuccess: () => {
      setCover(null);
      toast({ title: tr("Image removed", "Image retiree") });
    },
  });

  const submit = () => {
    const found: Record<string, string> = {};
    if (!form.title_en.trim() && !form.title_fr.trim()) found.title_en = tr("Enter a title in English or French.", "Saisissez un titre en anglais ou en francais.");
    if (!form.start) found.start = tr("Choose the start date and time.", "Choisissez la date et l'heure de debut.");
    if (form.start && form.end && form.end < form.start) found.end = tr("The end must not be before the start.", "La fin ne peut pas preceder le debut.");
    setErrors(found);
    if (Object.keys(found).length === 0) save.mutate();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{event ? tr("Edit event", "Modifier l'evenement") : tr("New event", "Nouvel evenement")}</DialogTitle>
          <DialogDescription>{tr("English and French titles are both optional, but at least one is needed.", "Les titres anglais et francais sont facultatifs, mais un au moins est requis.")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={tr("Title (English)", "Titre (anglais)")} htmlFor="ev-title-en" error={errors.title_en} count={form.title_en.length} max={200}>
            <Input id="ev-title-en" value={form.title_en} maxLength={200} onChange={(e) => set("title_en", e.target.value)} />
          </Field>
          <Field label={tr("Title (French)", "Titre (francais)")} htmlFor="ev-title-fr" error={errors.title_fr} count={form.title_fr.length} max={200}>
            <Input id="ev-title-fr" value={form.title_fr} maxLength={200} onChange={(e) => set("title_fr", e.target.value)} />
          </Field>
          <Field label={tr("Starts (Cameroon time)", "Debut (heure du Cameroun)")} htmlFor="ev-start" error={errors.start}>
            <Input id="ev-start" type="datetime-local" value={form.start} onChange={(e) => set("start", e.target.value)} aria-invalid={!!errors.start} />
          </Field>
          <Field label={tr("Ends (optional)", "Fin (facultatif)")} htmlFor="ev-end" error={errors.end} hint={tr("Leave empty for a one-day event.", "Laissez vide pour un evenement d'une journee.")}>
            <Input id="ev-end" type="datetime-local" value={form.end} min={form.start || undefined} onChange={(e) => set("end", e.target.value)} aria-invalid={!!errors.end} />
          </Field>
          <Field label={tr("Location", "Lieu")} htmlFor="ev-location" error={errors.location}>
            <Input id="ev-location" value={form.location} maxLength={200} onChange={(e) => set("location", e.target.value)} />
          </Field>
          <Field label={tr("Category", "Categorie")} htmlFor="ev-category" error={errors.category}>
            <Select value={form.category} onValueChange={(value) => set("category", value as EventCategory)}>
              <SelectTrigger id="ev-category"><SelectValue /></SelectTrigger>
              <SelectContent>
                {EVENT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{categoryLabel(c)}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <div className="sm:col-span-2 grid gap-4 sm:grid-cols-2">
            <Field label={tr("Description (English)", "Description (anglais)")} htmlFor="ev-desc-en" error={errors.description_en} count={form.description_en.length} max={5000}>
              <Textarea id="ev-desc-en" rows={5} value={form.description_en} onChange={(e) => set("description_en", e.target.value)} />
            </Field>
            <Field label={tr("Description (French)", "Description (francais)")} htmlFor="ev-desc-fr" error={errors.description_fr} count={form.description_fr.length} max={5000}>
              <Textarea id="ev-desc-fr" rows={5} value={form.description_fr} onChange={(e) => set("description_fr", e.target.value)} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <p className="mb-1.5 text-sm font-medium">{tr("Cover image (optional)", "Image de couverture (facultatif)")}</p>
            <ImagePicker
              id="ev-cover"
              file={file}
              onFile={setFile}
              currentUrl={cover}
              onRemoveCurrent={event ? () => removeCover.mutate() : undefined}
              progress={save.isPending && file ? progress ?? 0 : null}
              disabled={save.isPending}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>{tr("Cancel", "Annuler")}</Button>
          <Button onClick={submit} disabled={save.isPending} className="gap-2">
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {tr("Save event", "Enregistrer")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
