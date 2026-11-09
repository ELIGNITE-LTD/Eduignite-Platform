"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api/errors";
import { extractFieldErrors } from "@/lib/api/services/public-site.service";
import {
  schoolSiteContentService,
  type BlogCategory,
  type BlogPost,
  type BlogPostInput,
  type PostStatus,
} from "@/lib/api/services/school-site-content.service";
import { resolveMediaUrl } from "@/lib/media";
import { SITE_URL } from "@/lib/public-origin";
import { getUploadErrorMessage, validateImageFile } from "@/lib/upload-validation";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LoadError } from "@/components/ui/load-error";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Copy, ExternalLink, Eye, ImagePlus, Loader2, Pencil, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { RichTextEditor } from "./rich-text-editor";
import { Field, Section, formatDateTime, useTr, type TabProps } from "./shared";

const KEYS = {
  posts: ["school-site", "blog", "posts"] as const,
  categories: ["school-site", "blog", "categories"] as const,
};

type Lang = "en" | "fr";

function PostStatusChip({ status }: { status: PostStatus }) {
  const tr = useTr();
  const map = {
    published: [tr("Published", "Publie"), "bg-emerald-100 text-emerald-800 border-emerald-200"],
    unpublished: [tr("Unpublished", "Depublie"), "bg-amber-100 text-amber-800 border-amber-200"],
    draft: [tr("Draft", "Brouillon"), "bg-slate-100 text-slate-700 border-slate-200"],
  } as const;
  const [label, cls] = map[status] ?? map.draft;
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide", cls)}>{label}</span>;
}

export function postTitle(post: Pick<BlogPost, "title_en" | "title_fr">, lang: Lang) {
  return (lang === "fr" ? post.title_fr || post.title_en : post.title_en || post.title_fr) || "";
}

function postPreviewUrl(slug: string | null, post: BlogPost, siteStatus: string, siteToken: string) {
  if (!slug || !post.preview_token) return "";
  const params = new URLSearchParams({ post_preview: post.preview_token });
  // While the website itself is not published, its own preview token is needed to open it.
  if (siteStatus !== "published" && siteToken) params.set("preview", siteToken);
  return `${SITE_URL}/schools/${slug}/blog/${post.slug}?${params.toString()}`;
}

export function BlogTab(props: TabProps) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  return editing ? (
    <PostEditor {...props} postId={editing === "new" ? null : editing} onClose={() => setEditing(null)} onCreated={(id) => setEditing(id)} />
  ) : (
    <PostList {...props} onEdit={(id) => setEditing(id)} />
  );
}

/* ------------------------------------------------------------------ list */

function PostList({ readOnly, onEdit }: TabProps & { onEdit: (id: string | "new") => void }) {
  const tr = useTr();
  const posts = useQuery({ queryKey: KEYS.posts, queryFn: schoolSiteContentService.listPosts });
  const categories = useQuery({ queryKey: KEYS.categories, queryFn: schoolSiteContentService.listCategories });
  const [filter, setFilter] = useState<"all" | PostStatus>("all");
  const lang: Lang = tr("en", "fr") as Lang;
  const catName = useMemo(() => {
    const map = new Map<string, string>();
    categories.data?.forEach((c) => map.set(c.id, (lang === "fr" ? c.name_fr || c.name_en : c.name_en || c.name_fr)));
    return map;
  }, [categories.data, lang]);

  if (posts.isLoading) return <Skeleton className="h-48 w-full" />;
  if (posts.isError) return <LoadError message={tr("Could not load the articles.", "Impossible de charger les articles.")} onRetry={() => posts.refetch()} retrying={posts.isFetching} />;

  const rows = (posts.data ?? []).filter((p) => filter === "all" || p.status === filter);
  const filters: Array<["all" | PostStatus, string]> = [
    ["all", tr("All", "Tous")], ["draft", tr("Drafts", "Brouillons")],
    ["published", tr("Published", "Publies")], ["unpublished", tr("Unpublished", "Depublies")],
  ];

  return (
    <div className="space-y-6">
      <Section
        title={tr("Blog articles", "Articles du blog")}
        description={tr(
          "News and stories shown on your website's Blog page. An article is only public once you publish it.",
          "Actualites et articles affiches sur la page Blog de votre site. Un article n'est public qu'une fois publie.",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1" role="group" aria-label={tr("Filter by status", "Filtrer par statut")}>
            {filters.map(([key, label]) => (
              <Button key={key} size="sm" variant={filter === key ? "default" : "outline"} onClick={() => setFilter(key)} aria-pressed={filter === key}>{label}</Button>
            ))}
          </div>
          {!readOnly ? (
            <Button className="gap-2" onClick={() => onEdit("new")}><Plus className="h-4 w-4" />{tr("New article", "Nouvel article")}</Button>
          ) : null}
        </div>

        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            {(posts.data ?? []).length === 0
              ? tr("No article yet. Write your first one to share news with parents and the community.", "Aucun article pour l'instant. Redigez le premier pour partager des nouvelles avec les parents et la communaute.")
              : tr("No article with this status.", "Aucun article avec ce statut.")}
          </div>
        ) : (
          <ul className="divide-y rounded-xl border">
            {rows.map((post) => (
              <li key={post.id} className="flex flex-wrap items-center gap-3 p-3">
                {post.cover_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={resolveMediaUrl(post.cover_url)} alt="" className="h-12 w-16 rounded-md object-cover" />
                ) : (
                  <div className="h-12 w-16 rounded-md bg-muted" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{postTitle(post, lang) || tr("(untitled)", "(sans titre)")}</p>
                  <p className="text-xs text-muted-foreground">
                    {post.category ? `${catName.get(post.category) ?? ""} · ` : ""}
                    {post.status === "published" && post.published_at
                      ? formatDateTime(post.published_at)
                      : tr("Edited", "Modifie") + " " + formatDateTime(post.updated_at)}
                  </p>
                </div>
                <PostStatusChip status={post.status} />
                <Button size="sm" variant="outline" className="gap-2" onClick={() => onEdit(post.id)}>
                  <Pencil className="h-4 w-4" />{readOnly ? tr("View", "Voir") : tr("Edit", "Modifier")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <CategoriesPanel readOnly={readOnly} />
    </div>
  );
}

/* ------------------------------------------------------------ categories */

function CategoriesPanel({ readOnly }: { readOnly: boolean }) {
  const tr = useTr();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: KEYS.categories, queryFn: schoolSiteContentService.listCategories });
  const [nameEn, setNameEn] = useState("");
  const [nameFr, setNameFr] = useState("");
  const [removing, setRemoving] = useState<BlogCategory | null>(null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: KEYS.categories });
    queryClient.invalidateQueries({ queryKey: KEYS.posts });
  };
  const fail = (error: unknown) =>
    toast({ variant: "destructive", title: tr("Could not save", "Enregistrement impossible"), description: getApiErrorMessage(error, "") });

  const add = useMutation({
    mutationFn: () => schoolSiteContentService.saveCategory({ name_en: nameEn, name_fr: nameFr }),
    onSuccess: () => { setNameEn(""); setNameFr(""); refresh(); },
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: (id: string) => schoolSiteContentService.deleteCategory(id),
    onSuccess: () => { setRemoving(null); refresh(); },
    onError: fail,
  });

  return (
    <Section title={tr("Categories", "Categories")} description={tr("Group articles so visitors can filter them.", "Regroupez les articles pour que les visiteurs puissent les filtrer.")}>
      {query.data && query.data.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {query.data.map((c) => (
            <li key={c.id} className="flex items-center gap-1 rounded-full border bg-muted/30 py-1 pl-3 pr-1 text-sm">
              <span>{tr(c.name_en || c.name_fr, c.name_fr || c.name_en)}</span>
              <span className="text-xs text-muted-foreground">({c.post_count})</span>
              {!readOnly ? (
                <Button type="button" variant="ghost" size="icon" className="h-6 w-6" aria-label={tr("Delete category", "Supprimer la categorie") + ": " + (c.name_en || c.name_fr)} onClick={() => setRemoving(c)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{tr("No category yet.", "Aucune categorie pour l'instant.")}</p>
      )}
      {!readOnly ? (
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => { e.preventDefault(); if (nameEn.trim() || nameFr.trim()) add.mutate(); }}
        >
          <Field label={tr("Name (English)", "Nom (anglais)")} htmlFor="cat-en"><Input id="cat-en" value={nameEn} maxLength={80} onChange={(e) => setNameEn(e.target.value)} /></Field>
          <Field label={tr("Name (French)", "Nom (francais)")} htmlFor="cat-fr"><Input id="cat-fr" value={nameFr} maxLength={80} onChange={(e) => setNameFr(e.target.value)} /></Field>
          <Button type="submit" disabled={add.isPending || !(nameEn.trim() || nameFr.trim())} className="gap-2">
            {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{tr("Add", "Ajouter")}
          </Button>
        </form>
      ) : null}

      <AlertDialog open={!!removing} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr("Delete this category?", "Supprimer cette categorie ?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {tr("Its articles are kept and simply become uncategorised.", "Ses articles sont conserves et n'ont simplement plus de categorie.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("Cancel", "Annuler")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => removing && remove.mutate(removing.id)}>{tr("Delete", "Supprimer")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Section>
  );
}

/* ---------------------------------------------------------------- editor */

type Draft = Required<Pick<BlogPostInput,
  "title_en" | "title_fr" | "excerpt_en" | "excerpt_fr" | "body_en" | "body_fr" |
  "seo_title_en" | "seo_title_fr" | "seo_description_en" | "seo_description_fr" | "slug">> & {
  category: string; cover_image: string; cover_url: string;
};

const EMPTY: Draft = {
  title_en: "", title_fr: "", excerpt_en: "", excerpt_fr: "", body_en: "", body_fr: "",
  seo_title_en: "", seo_title_fr: "", seo_description_en: "", seo_description_fr: "", slug: "",
  category: "", cover_image: "", cover_url: "",
};

function toDraft(post: BlogPost): Draft {
  return {
    title_en: post.title_en, title_fr: post.title_fr, excerpt_en: post.excerpt_en, excerpt_fr: post.excerpt_fr,
    body_en: post.body_en ?? "", body_fr: post.body_fr ?? "",
    seo_title_en: post.seo_title_en, seo_title_fr: post.seo_title_fr,
    seo_description_en: post.seo_description_en, seo_description_fr: post.seo_description_fr,
    slug: post.slug, category: post.category ?? "", cover_image: post.cover_image ?? "", cover_url: post.cover_url ?? "",
  };
}

function PostEditor({
  profile, readOnly, postId, onClose, onCreated,
}: TabProps & { postId: string | null; onClose: () => void; onCreated: (id: string) => void }) {
  const tr = useTr();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const categories = useQuery({ queryKey: KEYS.categories, queryFn: schoolSiteContentService.listCategories });
  const loaded = useQuery({
    queryKey: ["school-site", "blog", "post", postId],
    queryFn: () => schoolSiteContentService.getPost(postId as string),
    enabled: !!postId,
  });
  const [post, setPost] = useState<BlogPost | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saved, setSaved] = useState<Draft>(EMPTY);
  const [lang, setLang] = useState<Lang>("en");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  useEffect(() => {
    if (loaded.data) {
      setPost(loaded.data);
      const d = toDraft(loaded.data);
      setDraft(d);
      setSaved(d);
    }
  }, [loaded.data]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const locked = readOnly;
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => { if (!prev[key]) return prev; const { [key]: _x, ...rest } = prev; return rest; });
  };

  const remember = (fresh: BlogPost) => {
    setPost(fresh);
    const d = toDraft(fresh);
    setDraft(d);
    setSaved(d);
    queryClient.setQueryData(["school-site", "blog", "post", fresh.id], fresh);
    queryClient.invalidateQueries({ queryKey: KEYS.posts });
    queryClient.invalidateQueries({ queryKey: ["public-site", "audit"] });
  };
  const fail = (error: unknown) => {
    setErrors(extractFieldErrors(error));
    toast({ variant: "destructive", title: tr("Could not complete the action", "Action impossible"), description: getApiErrorMessage(error, tr("Please check the highlighted fields.", "Veuillez verifier les champs en rouge.")) });
  };

  const payload = (): BlogPostInput => {
    const { cover_url: _c, category, cover_image, ...rest } = draft;
    const body: BlogPostInput = { ...rest, category: category || null, cover_image: cover_image || null };
    if (!postId && !body.slug) delete body.slug;
    return body;
  };

  const save = useMutation({
    mutationFn: async () => (postId ? schoolSiteContentService.updatePost(postId, payload()) : schoolSiteContentService.createPost(payload())),
    onSuccess: (fresh) => {
      setErrors({});
      remember(fresh);
      toast({ title: tr("Saved", "Enregistre") });
      if (!postId) onCreated(fresh.id);
    },
    onError: fail,
  });
  const publish = useMutation({
    mutationFn: async () => {
      // Publish exactly what is on screen: save pending edits first.
      if (dirty || !postId) {
        const fresh = postId ? await schoolSiteContentService.updatePost(postId, payload()) : await schoolSiteContentService.createPost(payload());
        return schoolSiteContentService.publishPost(fresh.id);
      }
      return schoolSiteContentService.publishPost(postId);
    },
    onSuccess: (fresh) => { setErrors({}); remember(fresh); toast({ title: tr("Article published", "Article publie") }); if (!postId) onCreated(fresh.id); },
    onError: fail,
  });
  const unpublish = useMutation({
    mutationFn: () => schoolSiteContentService.unpublishPost(postId as string),
    onSuccess: (fresh) => { remember(fresh); toast({ title: tr("Article unpublished", "Article depublie") }); },
    onError: fail,
  });
  const rotate = useMutation({
    mutationFn: () => schoolSiteContentService.rotatePostPreview(postId as string),
    onSuccess: (fresh) => { setPost(fresh); queryClient.setQueryData(["school-site", "blog", "post", fresh.id], fresh); toast({ title: tr("New preview link created", "Nouveau lien d'apercu cree") }); },
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: () => schoolSiteContentService.deletePost(postId as string),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: KEYS.posts }); queryClient.invalidateQueries({ queryKey: KEYS.categories }); toast({ title: tr("Article deleted", "Article supprime") }); onClose(); },
    onError: fail,
  });

  const uploadImage = async (file: File) => {
    const problem = validateImageFile(file, "image");
    if (problem) {
      toast({ variant: "destructive", title: tr("Image not accepted", "Image refusee"), description: problem });
      throw new Error(problem);
    }
    try {
      return await schoolSiteContentService.uploadImage(file);
    } catch (error) {
      toast({ variant: "destructive", title: tr("Upload failed", "Echec du televersement"), description: getUploadErrorMessage(error) });
      throw error;
    }
  };
  const uploadCover = async (file: File | undefined) => {
    if (!file) return;
    setUploadingCover(true);
    try {
      const { id, url } = await uploadImage(file);
      setDraft((prev) => ({ ...prev, cover_image: id, cover_url: url }));
    } catch {
      /* already reported */
    } finally {
      setUploadingCover(false);
    }
  };

  if (postId && loaded.isLoading) return <Skeleton className="h-96 w-full" />;
  if (postId && (loaded.isError || !loaded.data) && !post) {
    return <LoadError message={tr("Could not load this article.", "Impossible de charger cet article.")} onRetry={() => loaded.refetch()} retrying={loaded.isFetching} />;
  }

  const status: PostStatus = post?.status ?? "draft";
  const busy = save.isPending || publish.isPending || unpublish.isPending || remove.isPending;
  const link = post ? postPreviewUrl(profile.school.slug, post, profile.publication_status, profile.preview_token) : "";
  const blockers = post?.publish_blockers ?? {};
  const l = lang;
  const titleKey = `title_${l}` as const, excerptKey = `excerpt_${l}` as const, bodyKey = `body_${l}` as const;
  const seoTitleKey = `seo_title_${l}` as const, seoDescKey = `seo_description_${l}` as const;

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); toast({ title: tr("Link copied", "Lien copie") }); }
    catch { toast({ variant: "destructive", title: tr("Copy failed", "Copie impossible") }); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" className="gap-2" onClick={onClose}><ArrowLeft className="h-4 w-4" />{tr("All articles", "Tous les articles")}</Button>
        <div className="flex items-center gap-2"><PostStatusChip status={status} /></div>
      </div>

      <Section title={postId ? tr("Edit article", "Modifier l'article") : tr("New article", "Nouvel article")}>
        <div className="inline-flex rounded-lg border p-1" role="tablist" aria-label={tr("Language of the text", "Langue du texte")}>
          {(["en", "fr"] as const).map((code) => (
            <button
              key={code}
              type="button"
              role="tab"
              aria-selected={lang === code}
              onClick={() => setLang(code)}
              className={cn("rounded-md px-4 py-1.5 text-sm font-semibold", lang === code ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
            >
              {code === "en" ? "English" : "Francais"}
              {(draft[`title_${code}` as const] || draft[`body_${code}` as const]) ? <span className="ml-1 text-xs opacity-70">•</span> : null}
            </button>
          ))}
        </div>

        <Field label={tr("Title", "Titre")} htmlFor="post-title" error={errors[titleKey]} count={draft[titleKey].length} max={200}>
          <Input id="post-title" value={draft[titleKey]} disabled={locked} maxLength={200} onChange={(e) => set(titleKey, e.target.value)} />
        </Field>
        <Field label={tr("Short summary (shown in the list)", "Resume court (affiche dans la liste)")} htmlFor="post-excerpt" error={errors[excerptKey]} count={draft[excerptKey].length} max={400}>
          <Textarea id="post-excerpt" rows={2} value={draft[excerptKey]} disabled={locked} maxLength={400} onChange={(e) => set(excerptKey, e.target.value)} />
        </Field>
        <div className="space-y-1.5">
          <p className="text-sm font-medium" id={`body-label-${l}`}>{tr("Article text", "Texte de l'article")}</p>
          <RichTextEditor
            resetKey={`${postId ?? "new"}-${l}-${loaded.dataUpdatedAt}`}
            value={draft[bodyKey]}
            onChange={(html) => set(bodyKey, html)}
            label={tr("Article text", "Texte de l'article")}
            disabled={locked}
            error={errors[bodyKey]}
            onUploadImage={locked ? undefined : async (file) => (await uploadImage(file)).url}
          />
          <p className="text-xs text-muted-foreground">
            {tr(
              "Allowed: headings, lists, bold, italic, quotes, links (https) and your own images. Anything else is removed when you save.",
              "Autorises : titres, listes, gras, italique, citations, liens (https) et vos propres images. Le reste est supprime a l'enregistrement.",
            )}
          </p>
        </div>
      </Section>

      <Section title={tr("Cover image and category", "Image de couverture et categorie")}>
        <div className="flex flex-wrap items-start gap-4">
          <div className="space-y-2">
            {draft.cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={resolveMediaUrl(draft.cover_url)} alt={tr("Cover image", "Image de couverture")} className="h-32 w-48 rounded-lg border object-cover" />
            ) : (
              <div className="flex h-32 w-48 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">{tr("No cover image", "Pas d'image de couverture")}</div>
            )}
            {!locked ? (
              <div className="flex gap-2">
                <Button asChild size="sm" variant="outline" className="gap-2" disabled={uploadingCover}>
                  <label className="cursor-pointer">
                    {uploadingCover ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                    {tr("Choose image", "Choisir une image")}
                    <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={(e) => { uploadCover(e.target.files?.[0]); e.target.value = ""; }} />
                  </label>
                </Button>
                {draft.cover_url ? <Button size="sm" variant="ghost" onClick={() => setDraft((p) => ({ ...p, cover_image: "", cover_url: "" }))}>{tr("Remove", "Retirer")}</Button> : null}
              </div>
            ) : null}
            {errors.cover_image ? <p role="alert" className="text-xs text-destructive">{errors.cover_image}</p> : null}
          </div>
          <div className="min-w-[14rem] flex-1">
            <Field label={tr("Category", "Categorie")} htmlFor="post-category" error={errors.category}>
              <select
                id="post-category"
                value={draft.category}
                disabled={locked}
                onChange={(e) => set("category", e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">{tr("No category", "Aucune categorie")}</option>
                {(categories.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{tr(c.name_en || c.name_fr, c.name_fr || c.name_en)}</option>
                ))}
              </select>
            </Field>
          </div>
        </div>
      </Section>

      <Section title={tr("Search engines (SEO)", "Moteurs de recherche (SEO)")} description={tr("Optional. Leave empty to use the title and summary.", "Facultatif. Laissez vide pour utiliser le titre et le resume.")}>
        <Field label={tr("SEO title", "Titre SEO")} htmlFor="post-seo-title" error={errors[seoTitleKey]} count={draft[seoTitleKey].length} max={120}>
          <Input id="post-seo-title" value={draft[seoTitleKey]} disabled={locked} maxLength={120} onChange={(e) => set(seoTitleKey, e.target.value)} />
        </Field>
        <Field label={tr("SEO description", "Description SEO")} htmlFor="post-seo-desc" error={errors[seoDescKey]} count={draft[seoDescKey].length} max={300}>
          <Textarea id="post-seo-desc" rows={2} value={draft[seoDescKey]} disabled={locked} maxLength={300} onChange={(e) => set(seoDescKey, e.target.value)} />
        </Field>
        {postId ? (
          <Field label={tr("Web address of the article", "Adresse web de l'article")} htmlFor="post-slug" error={errors.slug} hint={tr("Changing it breaks links already shared.", "La modifier casse les liens deja partages.")}>
            <Input id="post-slug" value={draft.slug} disabled={locked} maxLength={110} onChange={(e) => set("slug", e.target.value)} />
          </Field>
        ) : null}
      </Section>

      {post ? (
        <Section title={tr("Preview", "Apercu")} description={tr("A private link to read this article before (or without) publishing it. Anyone with the link can read it; create a new link and the old one stops working.", "Un lien prive pour lire cet article avant (ou sans) publication. Toute personne ayant le lien peut le lire ; creez-en un nouveau et l'ancien cesse de fonctionner.")}>
          {profile.publication_status !== "published" && !profile.preview_token ? (
            <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
              {tr("Your website is not published yet. Create the website preview link in the Preview & Publication tab first.", "Votre site n'est pas encore publie. Creez d'abord le lien d'apercu du site dans l'onglet Apercu et publication.")}
            </p>
          ) : link ? (
            <div className="space-y-2">
              <p className="break-all rounded-xl border bg-muted/30 p-3 text-xs">{link}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" asChild className="gap-2"><a href={link} target="_blank" rel="noopener noreferrer"><Eye className="h-4 w-4" />{tr("Open preview", "Ouvrir l'apercu")}</a></Button>
                <Button size="sm" variant="outline" className="gap-2" onClick={copy}><Copy className="h-4 w-4" />{tr("Copy link", "Copier le lien")}</Button>
                {!locked ? (
                  <Button size="sm" variant="outline" className="gap-2" disabled={rotate.isPending} onClick={() => rotate.mutate()}>
                    {rotate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{tr("New link", "Nouveau lien")}
                  </Button>
                ) : null}
              </div>
              {dirty ? <p className="text-xs text-amber-700">{tr("Save your changes to see them in the preview.", "Enregistrez vos modifications pour les voir dans l'apercu.")}</p> : null}
            </div>
          ) : null}
        </Section>
      ) : null}

      {status !== "published" && Object.keys(blockers).length > 0 && postId ? (
        <ul className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {Object.values(blockers).map((m) => <li key={m}>{m}</li>)}
        </ul>
      ) : null}

      {!locked ? (
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-background/95 px-4 py-3 shadow-lg backdrop-blur">
          <div className="flex items-center gap-2">
            {postId ? (
              <Button variant="ghost" className="gap-2 text-destructive" onClick={() => setConfirmDelete(true)} disabled={busy}><Trash2 className="h-4 w-4" />{tr("Delete", "Supprimer")}</Button>
            ) : null}
            <span className="text-sm text-muted-foreground">{dirty || !postId ? tr("Unsaved changes.", "Modifications non enregistrees.") : tr("All changes saved.", "Tout est enregistre.")}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-2" disabled={busy || (!dirty && !!postId)} onClick={() => save.mutate()}>
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{tr("Save draft", "Enregistrer")}
            </Button>
            {status === "published" ? (
              <Button variant="secondary" className="gap-2" disabled={busy} onClick={() => unpublish.mutate()}>
                {unpublish.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{tr("Unpublish", "Depublier")}
              </Button>
            ) : (
              <Button className="gap-2" disabled={busy} onClick={() => publish.mutate()}>
                {publish.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}{tr("Publish", "Publier")}
              </Button>
            )}
            {status === "published" && dirty ? (
              <Button className="gap-2" disabled={busy} onClick={() => save.mutate()}>{tr("Update published article", "Mettre a jour l'article publie")}</Button>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="rounded-xl border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">{tr("You can view this article. Only the school administrator can change it.", "Vous pouvez consulter cet article. Seul l'administrateur de l'ecole peut le modifier.")}</p>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr("Delete this article?", "Supprimer cet article ?")}</AlertDialogTitle>
            <AlertDialogDescription>{tr("This permanently removes the article and its web address. This cannot be undone. To hide it only, use Unpublish.", "Cela supprime definitivement l'article et son adresse. Cette action est irreversible. Pour le masquer seulement, utilisez Depublier.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("Cancel", "Annuler")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => remove.mutate()}>{tr("Delete permanently", "Supprimer definitivement")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
