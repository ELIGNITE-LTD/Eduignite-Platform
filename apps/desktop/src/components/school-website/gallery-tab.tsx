"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Eye, EyeOff, ImagePlus, Images, Loader2, Pencil, Plus, Star, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
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
  ALBUM_CATEGORIES, CONTENT_KEYS, imageProblem, publicSiteContentService, type AlbumCategory, type SiteAlbum, type SiteMedia,
} from "@/lib/api/services/public-site-content.service";
import { useI18n } from "@/lib/i18n-context";
import { cn } from "@/lib/utils";
import { Field, Section, useTr, type TabProps } from "./shared";
import { imageProblemText } from "./image-picker";
import { useCategoryLabel } from "./events-tab";

function errorText(error: unknown) {
  return Object.values(extractFieldErrors(error))[0] || getApiErrorMessage(error, "");
}

export function GalleryTab({ readOnly }: TabProps) {
  const [open, setOpen] = useState<SiteAlbum | null>(null);
  if (open) return <AlbumPhotos albumId={open.id} readOnly={readOnly} onBack={() => setOpen(null)} />;
  return <AlbumList readOnly={readOnly} onOpen={setOpen} />;
}

function AlbumList({ readOnly, onOpen }: { readOnly: boolean; onOpen: (album: SiteAlbum) => void }) {
  const tr = useTr();
  const { language } = useI18n();
  const categoryLabel = useCategoryLabel();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<SiteAlbum | "new" | null>(null);
  const [deleting, setDeleting] = useState<SiteAlbum | null>(null);

  const query = useQuery({ queryKey: CONTENT_KEYS.albums, queryFn: publicSiteContentService.listAlbums });
  const refresh = () => queryClient.invalidateQueries({ queryKey: CONTENT_KEYS.albums });

  const toggle = useMutation({
    mutationFn: (album: SiteAlbum) => publicSiteContentService.setAlbumPublished(album.id, album.status !== "published"),
    onSuccess: (album) => {
      refresh();
      toast({ title: album.status === "published" ? tr("Album published", "Album publie") : tr("Album unpublished", "Album retire du site") });
    },
    onError: (error) => toast({ variant: "destructive", title: tr("Could not change publication", "Changement impossible"), description: errorText(error) }),
  });
  const reorder = useMutation({
    mutationFn: (ids: string[]) => publicSiteContentService.reorderAlbums(ids),
    onSuccess: refresh,
    onError: (error) => toast({ variant: "destructive", title: tr("Could not reorder", "Reorganisation impossible"), description: errorText(error) }),
  });
  const remove = useMutation({
    mutationFn: (album: SiteAlbum) => publicSiteContentService.deleteAlbum(album.id),
    onSuccess: () => {
      refresh();
      setDeleting(null);
      toast({ title: tr("Album deleted", "Album supprime") });
    },
    onError: (error) => toast({ variant: "destructive", title: tr("Could not delete", "Suppression impossible"), description: errorText(error) }),
  });

  if (query.isLoading) return <Skeleton className="h-48 w-full" />;
  if (query.isError || !query.data) {
    return <LoadError message={tr("Could not load the gallery.", "Impossible de charger la galerie.")} onRetry={() => query.refetch()} retrying={query.isFetching} />;
  }
  const albums = query.data.results;
  const titleOf = (a: SiteAlbum) => (language === "fr" ? a.title_fr || a.title_en : a.title_en || a.title_fr);
  const move = (index: number, delta: number) => {
    const ids = albums.map((a) => a.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorder.mutate(ids);
  };

  return (
    <div className="space-y-6">
      <Section
        title={tr("Photo gallery", "Galerie photo")}
        description={tr(
          "Albums shown on your website under Gallery. Only published albums are visible. Do not publish photos of pupils without their parents' permission.",
          "Albums affiches sur votre site, rubrique Galerie. Seuls les albums publies sont visibles. Ne publiez pas de photos d'eleves sans l'accord de leurs parents.",
        )}
      >
        {!readOnly ? (
          <Button onClick={() => setEditing("new")} className="gap-2">
            <Plus className="h-4 w-4" aria-hidden /> {tr("New album", "Nouvel album")}
          </Button>
        ) : null}
        {albums.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center">
            <Images className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="font-semibold">{tr("No albums yet", "Aucun album pour le moment")}</p>
            <p className="max-w-md text-sm text-muted-foreground">
              {tr("Create an album, add photos, then publish it.", "Creez un album, ajoutez des photos, puis publiez-le.")}
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {albums.map((album, index) => (
              <li key={album.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-3">
                <div className="h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {album.cover_thumb_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={album.cover_thumb_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{titleOf(album)}</p>
                  <p className="text-sm text-muted-foreground">
                    {categoryLabel(album.category)} · {album.media_count} {tr("photos", "photos")}
                  </p>
                  <span className={cn("mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold uppercase", album.status === "published" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700")}>
                    {album.status === "published" ? tr("Published", "Publie") : tr("Draft", "Brouillon")}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => onOpen(album)}>
                    <ImagePlus className="mr-1.5 h-4 w-4" aria-hidden /> {readOnly ? tr("View photos", "Voir les photos") : tr("Photos", "Photos")}
                  </Button>
                  {!readOnly ? (
                    <>
                      <Button size="icon" variant="outline" disabled={index === 0 || reorder.isPending} onClick={() => move(index, -1)} aria-label={`${tr("Move up", "Monter")}: ${titleOf(album)}`}>
                        <ArrowUp className="h-4 w-4" aria-hidden />
                      </Button>
                      <Button size="icon" variant="outline" disabled={index === albums.length - 1 || reorder.isPending} onClick={() => move(index, 1)} aria-label={`${tr("Move down", "Descendre")}: ${titleOf(album)}`}>
                        <ArrowDown className="h-4 w-4" aria-hidden />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditing(album)}>
                        <Pencil className="mr-1.5 h-4 w-4" aria-hidden /> {tr("Edit", "Modifier")}
                      </Button>
                      <Button size="sm" variant="outline" disabled={toggle.isPending} onClick={() => toggle.mutate(album)}>
                        {album.status === "published" ? <EyeOff className="mr-1.5 h-4 w-4" aria-hidden /> : <Eye className="mr-1.5 h-4 w-4" aria-hidden />}
                        {album.status === "published" ? tr("Unpublish", "Retirer") : tr("Publish", "Publier")}
                      </Button>
                      <Button size="icon" variant="outline" className="text-destructive" onClick={() => setDeleting(album)} aria-label={`${tr("Delete", "Supprimer")}: ${titleOf(album)}`}>
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          {tr(`Images used: ${query.data.quota.used} of ${query.data.quota.limit} for events and gallery together.`, `Images utilisees : ${query.data.quota.used} sur ${query.data.quota.limit} pour les evenements et la galerie.`)}
        </p>
      </Section>

      {editing ? (
        <AlbumDialog
          album={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            refresh();
            setEditing(null);
          }}
        />
      ) : null}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr("Delete this album?", "Supprimer cet album ?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {tr("The album and all its photos will be permanently deleted from your website.", "L'album et toutes ses photos seront definitivement supprimes de votre site.")}
              {deleting ? ` (${titleOf(deleting)}, ${deleting.media_count} ${tr("photos", "photos")})` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("Cancel", "Annuler")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && remove.mutate(deleting)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {tr("Delete album", "Supprimer l'album")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AlbumDialog({ album, onClose, onSaved }: { album: SiteAlbum | null; onClose: () => void; onSaved: () => void }) {
  const tr = useTr();
  const categoryLabel = useCategoryLabel();
  const { toast } = useToast();
  const [titleEn, setTitleEn] = useState(album?.title_en ?? "");
  const [titleFr, setTitleFr] = useState(album?.title_fr ?? "");
  const [category, setCategory] = useState<AlbumCategory>(album?.category ?? "campus");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: () => {
      const payload = { title_en: titleEn.trim(), title_fr: titleFr.trim(), category };
      return album ? publicSiteContentService.updateAlbum(album.id, payload) : publicSiteContentService.createAlbum(payload);
    },
    onSuccess: () => {
      toast({ title: tr("Album saved", "Album enregistre") });
      onSaved();
    },
    onError: (error) => {
      setErrors(extractFieldErrors(error));
      toast({ variant: "destructive", title: tr("Could not save", "Enregistrement impossible"), description: errorText(error) });
    },
  });
  const submit = () => {
    if (!titleEn.trim() && !titleFr.trim()) {
      setErrors({ title_en: tr("Enter a title in English or French.", "Saisissez un titre en anglais ou en francais.") });
      return;
    }
    setErrors({});
    save.mutate();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{album ? tr("Edit album", "Modifier l'album") : tr("New album", "Nouvel album")}</DialogTitle>
          <DialogDescription>{tr("Visitors can filter the gallery by category.", "Les visiteurs peuvent filtrer la galerie par categorie.")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label={tr("Title (English)", "Titre (anglais)")} htmlFor="al-title-en" error={errors.title_en} count={titleEn.length} max={200}>
            <Input id="al-title-en" value={titleEn} maxLength={200} onChange={(e) => setTitleEn(e.target.value)} />
          </Field>
          <Field label={tr("Title (French)", "Titre (francais)")} htmlFor="al-title-fr" error={errors.title_fr} count={titleFr.length} max={200}>
            <Input id="al-title-fr" value={titleFr} maxLength={200} onChange={(e) => setTitleFr(e.target.value)} />
          </Field>
          <Field label={tr("Category", "Categorie")} htmlFor="al-category" error={errors.category}>
            <Select value={category} onValueChange={(v) => setCategory(v as AlbumCategory)}>
              <SelectTrigger id="al-category"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ALBUM_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{categoryLabel(c)}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>{tr("Cancel", "Annuler")}</Button>
          <Button onClick={submit} disabled={save.isPending} className="gap-2">
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {tr("Save album", "Enregistrer")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Upload = { key: string; name: string; progress: number; error?: string; done?: boolean };

function AlbumPhotos({ albumId, readOnly, onBack }: { albumId: string; readOnly: boolean; onBack: () => void }) {
  const tr = useTr();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState<SiteMedia | null>(null);
  const [deleting, setDeleting] = useState<SiteMedia | null>(null);

  const albums = useQuery({ queryKey: CONTENT_KEYS.albums, queryFn: publicSiteContentService.listAlbums });
  const media = useQuery({ queryKey: CONTENT_KEYS.media(albumId), queryFn: () => publicSiteContentService.listMedia(albumId) });
  const album = albums.data?.results.find((a) => a.id === albumId);
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: CONTENT_KEYS.media(albumId) });
    queryClient.invalidateQueries({ queryKey: CONTENT_KEYS.albums });
  };

  const cover = useMutation({
    mutationFn: (id: string) => publicSiteContentService.setAlbumCover(albumId, id),
    onSuccess: () => { refresh(); toast({ title: tr("Cover updated", "Couverture mise a jour") }); },
    onError: (error) => toast({ variant: "destructive", title: tr("Could not set cover", "Couverture impossible"), description: errorText(error) }),
  });
  const reorder = useMutation({
    mutationFn: (ids: string[]) => publicSiteContentService.reorderMedia(albumId, ids),
    onSuccess: refresh,
    onError: (error) => toast({ variant: "destructive", title: tr("Could not reorder", "Reorganisation impossible"), description: errorText(error) }),
  });
  const remove = useMutation({
    mutationFn: (item: SiteMedia) => publicSiteContentService.deleteMedia(item.id),
    onSuccess: () => { refresh(); setDeleting(null); toast({ title: tr("Photo deleted", "Photo supprimee") }); },
    onError: (error) => toast({ variant: "destructive", title: tr("Could not delete", "Suppression impossible"), description: errorText(error) }),
  });

  const upload = async (files: File[]) => {
    const queue: Upload[] = files.map((f, i) => ({ key: `${Date.now()}-${i}`, name: f.name, progress: 0 }));
    setUploads(queue);
    setUploading(true);
    for (let i = 0; i < files.length; i += 1) {
      const key = queue[i].key;
      const patch = (p: Partial<Upload>) => setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, ...p } : u)));
      const problem = imageProblem(files[i]);
      if (problem) {
        patch({ error: imageProblemText(tr, problem) });
        continue;
      }
      try {
        await publicSiteContentService.uploadMedia(albumId, files[i], {}, (percent) => patch({ progress: percent }));
        patch({ progress: 100, done: true });
      } catch (error) {
        patch({ error: errorText(error) || tr("Upload failed.", "Echec du televersement.") });
      }
    }
    setUploading(false);
    refresh();
  };

  if (media.isLoading || albums.isLoading) return <Skeleton className="h-48 w-full" />;
  if (media.isError || !media.data) {
    return <LoadError message={tr("Could not load the photos.", "Impossible de charger les photos.")} onRetry={() => media.refetch()} retrying={media.isFetching} />;
  }
  const items = media.data.results;
  const move = (index: number, delta: number) => {
    const ids = items.map((m) => m.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorder.mutate(ids);
  };
  const title = album ? album.title_en || album.title_fr : "";

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={onBack} className="gap-2">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {tr("Back to albums", "Retour aux albums")}
      </Button>
      <Section title={`${tr("Photos", "Photos")}: ${title}`} description={tr("The first photo is the cover unless you choose another one. Photos appear in this order on your website.", "La premiere photo sert de couverture sauf si vous en choisissez une autre. Les photos apparaissent dans cet ordre sur votre site.")}>
        {!readOnly ? (
          <div>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              id="album-upload"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                if (files.length) void upload(files);
              }}
            />
            <Button onClick={() => fileInput.current?.click()} disabled={uploading} className="gap-2">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ImagePlus className="h-4 w-4" aria-hidden />}
              {tr("Add photos", "Ajouter des photos")}
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              {tr("JPEG, PNG or WEBP, up to 5 MB each. Location data is removed automatically.", "JPEG, PNG ou WEBP, 5 Mo maximum chacune. Les donnees de localisation sont supprimees automatiquement.")}
            </p>
          </div>
        ) : null}

        {uploads.length > 0 ? (
          <ul className="space-y-2" aria-live="polite">
            {uploads.map((u) => (
              <li key={u.key} className="rounded-lg border p-2 text-sm">
                <div className="flex justify-between gap-2"><span className="truncate">{u.name}</span><span>{u.error ? "" : `${u.progress}%`}</span></div>
                {u.error ? <p role="alert" className="text-xs text-destructive">{u.error}</p> : <Progress value={u.progress} className="mt-1 h-1.5" aria-label={u.name} />}
              </li>
            ))}
          </ul>
        ) : null}

        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center">
            <Images className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="font-semibold">{tr("This album has no photos yet", "Cet album n'a pas encore de photos")}</p>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((item, index) => {
              const isCover = album?.cover_url === item.url;
              return (
                <li key={item.id} className="overflow-hidden rounded-xl border">
                  <div className="relative aspect-square bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.thumb_url} alt={item.alt_en || item.caption_en || ""} loading="lazy" className="h-full w-full object-cover" />
                    {isCover ? (
                      <span className="absolute left-1.5 top-1.5 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-950">{tr("Cover", "Couverture")}</span>
                    ) : null}
                  </div>
                  {item.caption_en || item.caption_fr ? <p className="truncate px-2 pt-1 text-xs text-muted-foreground">{item.caption_en || item.caption_fr}</p> : null}
                  {!readOnly ? (
                    <div className="flex flex-wrap gap-1 p-2">
                      <Button size="icon" variant="outline" className="h-8 w-8" disabled={index === 0 || reorder.isPending} onClick={() => move(index, -1)} aria-label={tr("Move earlier", "Deplacer avant")}>
                        <ArrowLeft className="h-4 w-4" aria-hidden />
                      </Button>
                      <Button size="icon" variant="outline" className="h-8 w-8" disabled={index === items.length - 1 || reorder.isPending} onClick={() => move(index, 1)} aria-label={tr("Move later", "Deplacer apres")}>
                        <ArrowRight className="h-4 w-4" aria-hidden />
                      </Button>
                      <Button size="icon" variant="outline" className="h-8 w-8" disabled={isCover || cover.isPending} onClick={() => cover.mutate(item.id)} aria-label={tr("Use as cover", "Utiliser comme couverture")}>
                        <Star className="h-4 w-4" aria-hidden />
                      </Button>
                      <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setEditing(item)} aria-label={tr("Edit caption", "Modifier la legende")}>
                        <Pencil className="h-4 w-4" aria-hidden />
                      </Button>
                      <Button size="icon" variant="outline" className="h-8 w-8 text-destructive" onClick={() => setDeleting(item)} aria-label={tr("Delete photo", "Supprimer la photo")}>
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {editing ? <CaptionDialog item={editing} onClose={() => setEditing(null)} onSaved={() => { refresh(); setEditing(null); }} /> : null}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr("Delete this photo?", "Supprimer cette photo ?")}</AlertDialogTitle>
            <AlertDialogDescription>{tr("It will be removed from your website and cannot be recovered.", "Elle sera retiree de votre site et ne pourra pas etre recuperee.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("Cancel", "Annuler")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && remove.mutate(deleting)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {tr("Delete photo", "Supprimer la photo")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CaptionDialog({ item, onClose, onSaved }: { item: SiteMedia; onClose: () => void; onSaved: () => void }) {
  const tr = useTr();
  const { toast } = useToast();
  const [values, setValues] = useState({ caption_en: item.caption_en, caption_fr: item.caption_fr, alt_en: item.alt_en, alt_fr: item.alt_fr });
  const set = (key: keyof typeof values, value: string) => setValues((prev) => ({ ...prev, [key]: value }));
  const save = useMutation({
    mutationFn: () => publicSiteContentService.updateMedia(item.id, values),
    onSuccess: () => { toast({ title: tr("Saved", "Enregistre") }); onSaved(); },
    onError: (error) => toast({ variant: "destructive", title: tr("Could not save", "Enregistrement impossible"), description: errorText(error) }),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{tr("Caption and description", "Legende et description")}</DialogTitle>
          <DialogDescription>{tr("The description helps people who use screen readers and search engines.", "La description aide les personnes qui utilisent un lecteur d'ecran et les moteurs de recherche.")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label={tr("Caption (English)", "Legende (anglais)")} htmlFor="md-cap-en" count={values.caption_en.length} max={300}>
            <Input id="md-cap-en" value={values.caption_en} maxLength={300} onChange={(e) => set("caption_en", e.target.value)} />
          </Field>
          <Field label={tr("Caption (French)", "Legende (francais)")} htmlFor="md-cap-fr" count={values.caption_fr.length} max={300}>
            <Input id="md-cap-fr" value={values.caption_fr} maxLength={300} onChange={(e) => set("caption_fr", e.target.value)} />
          </Field>
          <Field label={tr("Description of the image (English)", "Description de l'image (anglais)")} htmlFor="md-alt-en" count={values.alt_en.length} max={200}>
            <Input id="md-alt-en" value={values.alt_en} maxLength={200} onChange={(e) => set("alt_en", e.target.value)} />
          </Field>
          <Field label={tr("Description of the image (French)", "Description de l'image (francais)")} htmlFor="md-alt-fr" count={values.alt_fr.length} max={200}>
            <Input id="md-alt-fr" value={values.alt_fr} maxLength={200} onChange={(e) => set("alt_fr", e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>{tr("Cancel", "Annuler")}</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-2">
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {tr("Save", "Enregistrer")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
