"use client";

import { compressImage } from "@/lib/image-compress";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth, type SchoolInfo } from "@/lib/auth-context";
import { usePublicSiteProfile, PUBLIC_SITE_KEYS } from "@/lib/hooks/usePublicSite";
import { useHigherSetupStatus } from "@/lib/hooks/useHigherEd";
import { publicSiteService, extractFieldErrors, type PublicSiteProfile } from "@/lib/api/services/public-site.service";
import { schoolsService } from "@/lib/api/services/schools.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import { resolveMediaUrl } from "@/lib/media";
import { getUploadErrorMessage, validateImageFile } from "@/lib/upload-validation";
import { useToast } from "@/hooks/use-toast";
import {
  THEME_PRESETS, buildChecklist, contrastReport, isPlausibleEmail, matchPreset, missingCount, normalizeHex,
  type WizardStep,
} from "@/lib/school-site-quick-setup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadError } from "@/components/ui/load-error";
import { cn } from "@/lib/utils";
import {
  AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, Circle, ExternalLink, Eye, GraduationCap, Loader2,
  PartyPopper, RefreshCw, Settings2, Upload,
} from "lucide-react";
import { Field, publicSiteUrl, previewUrl, useTr } from "./shared";
import { SchoolWebsiteManager } from "./manager";
import { BlockBanner } from "./block-banner";

type SaveState = "idle" | "saving" | "saved" | "error";

/** Saves `value` shortly after it stops changing, when it differs from the last saved copy and is valid. */
/** One status for two autosaves: an error wins, then saving, then saved. */
function combineSave(a: SaveState, b: SaveState): SaveState {
  for (const s of ["error", "saving", "saved"] as SaveState[]) if (a === s || b === s) return s;
  return "idle";
}

function useAutosave<T>(value: T, saved: T, valid: boolean, save: (value: T) => Promise<void>, enabled: boolean) {
  const [state, setState] = useState<SaveState>("idle");
  const last = useRef(JSON.stringify(saved));
  const saveRef = useRef(save);
  saveRef.current = save;
  const key = JSON.stringify(value);

  const run = useCallback(async (v: T, k: string) => {
    setState("saving");
    try {
      await saveRef.current(v);
      last.current = k;
      setState("saved");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    if (!enabled || !valid || key === last.current) return;
    const timer = setTimeout(() => void run(value, key), 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, valid, enabled, run]);

  return { state, retry: () => void run(value, key) };
}

function SaveStatus({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  const tr = useTr();
  if (state === "idle") return <span className="text-xs text-muted-foreground">{tr("Changes save automatically.", "Les modifications s'enregistrent automatiquement.")}</span>;
  if (state === "saving") return <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />{tr("Saving...", "Enregistrement...")}</span>;
  if (state === "saved") return <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700"><Check className="h-3.5 w-3.5" />{tr("Saved", "Enregistre")}</span>;
  return (
    <span className="flex items-center gap-2 text-xs font-medium text-destructive" role="alert">
      <AlertTriangle className="h-3.5 w-3.5" />{tr("Could not save.", "Enregistrement impossible.")}
      <button type="button" onClick={onRetry} className="underline underline-offset-2">{tr("Try again", "Reessayer")}</button>
    </span>
  );
}

function StepDots({ step, onGo }: { step: WizardStep; onGo: (s: WizardStep) => void }) {
  const tr = useTr();
  const labels = [tr("Basics", "L'essentiel"), tr("Look", "Apparence"), tr("Publish", "Publier")];
  return (
    <ol className="flex items-center justify-center gap-2 sm:gap-3" aria-label={tr("Progress", "Progression")}>
      {labels.map((label, i) => (
        <li key={label} className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => onGo(i as WizardStep)}
            aria-current={i === step ? "step" : undefined}
            className="flex flex-col items-center gap-1.5 rounded-lg px-1 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-bold transition-colors",
              i === step ? "border-primary bg-primary text-primary-foreground" : i < step ? "border-primary bg-primary/10 text-primary" : "border-muted-foreground/30 text-muted-foreground",
            )}>
              {i < step ? <Check className="h-4 w-4" /> : i + 1}
            </span>
            <span className={cn("text-xs font-medium", i === step ? "text-primary" : "text-muted-foreground")}>{label}</span>
          </button>
          {i < labels.length - 1 ? <span className={cn("mb-5 h-0.5 w-8 rounded sm:w-16", i < step ? "bg-primary" : "bg-muted")} /> : null}
        </li>
      ))}
    </ol>
  );
}

function StepCard({ title, lead, children }: { title: string; lead: string; children: React.ReactNode }) {
  return (
    <section className="space-y-5 rounded-3xl border bg-card p-5 shadow-sm sm:p-8">
      <div className="space-y-1">
        <h2 className="font-headline text-xl font-bold text-primary sm:text-2xl">{title}</h2>
        <p className="text-sm text-muted-foreground sm:text-base">{lead}</p>
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------- Step 1

function BasicsStep({ profile, readOnly }: { profile: PublicSiteProfile; readOnly: boolean }) {
  const tr = useTr();
  const { toast } = useToast();
  const { user, updateSchool } = useAuth();
  const queryClient = useQueryClient();
  const [description, setDescription] = useState(profile.school.description || "");
  const [email, setEmail] = useState(profile.school.email || "");
  const [phone, setPhone] = useState(profile.school.phone || "");
  const [whatsapp, setWhatsapp] = useState(profile.whatsapp_number || "");
  const [uploading, setUploading] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);

  const emailOk = isPlausibleEmail(email);
  const form = { description: description.trim(), email: email.trim(), phone: phone.trim() };
  const savedForm = { description: (profile.school.description || "").trim(), email: (profile.school.email || "").trim(), phone: (profile.school.phone || "").trim() };
  const autosave = useAutosave(form, savedForm, emailOk, async (v) => {
    await updateSchool(v as Partial<SchoolInfo>);
    await queryClient.invalidateQueries({ queryKey: PUBLIC_SITE_KEYS.profile });
  }, !readOnly);
  // WhatsApp lives on the website profile (not the school record), so it saves through its own call.
  const waAutosave = useAutosave(whatsapp.trim(), (profile.whatsapp_number || "").trim(), true, async (value) => {
    await publicSiteService.updateProfile({ whatsapp_number: value });
    await queryClient.invalidateQueries({ queryKey: PUBLIC_SITE_KEYS.profile });
  }, !readOnly);

  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const schoolId = user?.school?.id;
    if (!file || !schoolId) return;
    const fileError = validateImageFile(file, "school logo", true);
    if (fileError) {
      toast({ variant: "destructive", title: tr("Upload blocked", "Televersement bloque"), description: fileError });
      event.target.value = "";
      return;
    }
    setUploading(true);
    try {
      const result = await schoolsService.uploadLogo(schoolId, await compressImage(file));
      const url = resolveMediaUrl((result as any).logo_url || (result as any).logo);
      await updateSchool({ logo: url } as Partial<SchoolInfo>);
      await queryClient.invalidateQueries({ queryKey: PUBLIC_SITE_KEYS.profile });
      toast({ title: tr("Logo saved", "Logo enregistre") });
    } catch (error: any) {
      toast({ variant: "destructive", title: tr("Upload failed", "Echec du televersement"), description: getUploadErrorMessage(error, "logo") });
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const logo = resolveMediaUrl(user?.school?.logo);

  return (
    <StepCard
      title={tr("Tell visitors who you are", "Presentez-vous aux visiteurs")}
      lead={tr("Just three things. We already filled in what we know.", "Seulement trois choses. Nous avons deja rempli ce que nous savons.")}
    >
      <Field label={tr("Institution name", "Nom de l'etablissement")} htmlFor="qs-name" hint={tr("Changed in school settings.", "Se modifie dans les parametres de l'ecole.")}>
        <Input id="qs-name" value={profile.school.name} readOnly disabled className="h-12 text-base" />
      </Field>

      <Field label={tr("Short description", "Courte description")} htmlFor="qs-desc" count={description.length} max={1000}
        hint={tr("Two or three sentences: what you teach and who you welcome.", "Deux ou trois phrases : ce que vous enseignez et qui vous accueillez.")}>
        <Textarea id="qs-desc" rows={4} maxLength={1000} value={description} disabled={readOnly} className="text-base"
          onChange={(e) => setDescription(e.target.value)} />
      </Field>

      <div className="space-y-1.5">
        <p className="text-sm font-medium">{tr("Logo", "Logo")}</p>
        <div className="flex items-center gap-4">
          <button
            type="button"
            disabled={readOnly || uploading}
            onClick={() => logoRef.current?.click()}
            aria-label={tr("Upload logo", "Televerser le logo")}
            className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed bg-muted/30 hover:border-primary disabled:cursor-not-allowed"
          >
            {uploading ? <Loader2 className="h-6 w-6 animate-spin" /> : logo ? <img src={logo} alt="" className="h-full w-full object-contain" /> : <Upload className="h-6 w-6 text-muted-foreground" />}
          </button>
          <div className="space-y-1">
            <Button type="button" variant="outline" disabled={readOnly || uploading} onClick={() => logoRef.current?.click()}>
              {logo ? tr("Change logo", "Changer le logo") : tr("Add your logo", "Ajouter votre logo")}
            </Button>
            <p className="text-xs text-muted-foreground">{tr("A square picture works best.", "Une image carree convient le mieux.")}</p>
          </div>
          <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={upload} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={tr("Contact email", "Email de contact")} htmlFor="qs-email" error={!emailOk ? tr("This email looks incomplete.", "Cet email semble incomplet.") : undefined}>
          <Input id="qs-email" type="email" inputMode="email" autoComplete="email" value={email} disabled={readOnly} className="h-12 text-base"
            onChange={(e) => setEmail(e.target.value)} placeholder="admissions@school.cm" />
        </Field>
        <Field label={tr("Contact phone", "Telephone de contact")} htmlFor="qs-phone">
          <Input id="qs-phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} disabled={readOnly} className="h-12 text-base"
            onChange={(e) => setPhone(e.target.value)} placeholder="+237 6 00 00 00 00" />
        </Field>
        <Field label={tr("WhatsApp number (visitors can chat with you)", "Numero WhatsApp (les visiteurs peuvent vous ecrire)")} htmlFor="qs-whatsapp">
          <Input id="qs-whatsapp" type="tel" inputMode="tel" value={whatsapp} disabled={readOnly} className="h-12 text-base"
            onChange={(e) => setWhatsapp(e.target.value)} placeholder="+237 6 00 00 00 00" />
        </Field>
      </div>

      {!readOnly ? <SaveStatus state={combineSave(autosave.state, waAutosave.state)} onRetry={() => { if (autosave.state === "error") autosave.retry(); if (waAutosave.state === "error") waAutosave.retry(); }} /> : null}
    </StepCard>
  );
}

// ---------------------------------------------------------------- Step 2

function HeroPreview({ accent, name, description, logo }: { accent: string; name: string; description: string; logo: string }) {
  const tr = useTr();
  const report = contrastReport(accent || THEME_PRESETS[0].hex);
  const p = report.palette ?? contrastReport(THEME_PRESETS[0].hex).palette!;
  return (
    <div aria-label={tr("Live preview", "Apercu en direct")} className="overflow-hidden rounded-2xl border shadow-md">
      <div className="flex items-center gap-2 bg-white px-4 py-2 text-xs text-slate-500">
        <span className="h-2 w-2 rounded-full bg-red-400" /><span className="h-2 w-2 rounded-full bg-amber-400" /><span className="h-2 w-2 rounded-full bg-emerald-400" />
        <span className="ml-2 truncate">eduignite.online/schools/...</span>
      </div>
      <div className="space-y-4 px-5 py-8 text-white sm:px-8 sm:py-10" style={{ backgroundColor: p.from }}>
        <div className="flex items-center gap-3">
          {logo ? <img src={logo} alt="" className="h-12 w-12 rounded-xl bg-white/95 object-contain p-1" /> : <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15"><GraduationCap className="h-6 w-6" /></span>}
          <p className="text-xs font-semibold uppercase tracking-widest opacity-90">{tr("Higher education", "Enseignement superieur")}</p>
        </div>
        <h3 className="font-headline text-2xl font-bold leading-tight sm:text-3xl">{name}</h3>
        <p className="line-clamp-3 max-w-xl text-sm opacity-90 sm:text-base">{description || tr("Your short description appears here.", "Votre courte description apparait ici.")}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <span className="rounded-full px-5 py-2 text-sm font-bold" style={{ background: p.bright, color: p.ink }}>{tr("Apply now", "S'inscrire")}</span>
          <span className="rounded-full border border-white/60 px-5 py-2 text-sm font-semibold">{tr("Programmes", "Programmes")}</span>
        </div>
      </div>
    </div>
  );
}

function LookStep({ profile, readOnly }: { profile: PublicSiteProfile; readOnly: boolean }) {
  const tr = useTr();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [accent, setAccent] = useState(normalizeHex(profile.theme_accent || "") ?? "");
  const [hexText, setHexText] = useState(accent);
  const valid = accent === "" || normalizeHex(accent) !== null;
  const saved = normalizeHex(profile.theme_accent || "") ?? "";

  const autosave = useAutosave(accent, saved, valid && accent !== "", async (value) => {
    const fresh = await publicSiteService.updateProfile({ theme_accent: value });
    queryClient.setQueryData(PUBLIC_SITE_KEYS.profile, fresh);
  }, !readOnly);

  const choose = (hex: string) => {
    setAccent(hex);
    setHexText(hex);
  };
  const report = contrastReport(accent || THEME_PRESETS[0].hex);
  const preset = matchPreset(accent);
  const typedBad = hexText.trim() !== "" && normalizeHex(hexText) === null;

  return (
    <StepCard
      title={tr("Pick your colours", "Choisissez vos couleurs")}
      lead={tr("Tap a theme. You can see your website change below.", "Touchez un theme. Votre site change juste en dessous.")}
    >
      <div role="radiogroup" aria-label={tr("Theme", "Theme")} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {THEME_PRESETS.map((p) => {
          const active = preset?.key === p.key;
          const pal = contrastReport(p.hex).palette!;
          return (
            <button
              key={p.key}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={readOnly}
              onClick={() => choose(p.hex)}
              className={cn("group relative overflow-hidden rounded-2xl border-2 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
                active ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/60")}
            >
              <span className="block h-20" style={{ backgroundColor: pal.from }}>
                <span className="m-3 inline-block h-3 w-10 rounded-full" style={{ background: pal.bright }} />
              </span>
              <span className="flex items-center justify-between gap-1 px-3 py-2 text-sm font-semibold">
                {tr(p.en, p.fr)}
                {active ? <CheckCircle2 className="h-4 w-4 text-primary" /> : null}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-end">
        <div className="space-y-1.5">
          <label htmlFor="qs-color" className="text-sm font-medium">{tr("Or choose your own colour", "Ou choisissez votre couleur")}</label>
          <div className="flex items-center gap-3">
            <input id="qs-color" type="color" disabled={readOnly} value={accent || THEME_PRESETS[0].hex} onChange={(e) => choose(e.target.value)}
              className="h-12 w-16 cursor-pointer rounded-lg border bg-transparent p-1 disabled:cursor-not-allowed" />
            <Input aria-label={tr("Colour code", "Code couleur")} value={hexText} disabled={readOnly} maxLength={7} placeholder="#1e3a8a" className="h-12 w-32 font-mono"
              onChange={(e) => {
                setHexText(e.target.value);
                const n = normalizeHex(e.target.value);
                if (n) setAccent(n);
              }} />
          </div>
          {typedBad ? <p role="alert" className="text-xs text-destructive">{tr("Use a code like #1e3a8a.", "Utilisez un code comme #1e3a8a.")}</p> : null}
        </div>
        <p className={cn("flex items-start gap-2 rounded-xl border px-3 py-2 text-sm", report.level === "stock" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900")} aria-live="polite">
          {report.level === "stock" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>
            {report.level === "great" && tr("Easy to read: white text stands out clearly on this colour.", "Facile a lire : le texte blanc ressort bien sur cette couleur.")}
            {report.level === "adjusted" && tr("Good. We will make it a little darker on your site so the text stays easy to read.", "Bien. Nous l'assombrirons legerement sur votre site pour que le texte reste lisible.")}
            {report.level === "stock" && tr("This colour is too light to read text on. Your site will keep the standard navy and brass.", "Cette couleur est trop claire pour lire du texte. Votre site gardera le bleu marine et laiton standard.")}
            {report.level === "invalid" && tr("Choose a colour to see the check.", "Choisissez une couleur pour voir la verification.")}
          </span>
        </p>
      </div>

      <HeroPreview accent={accent} name={profile.school.name} description={profile.school.description} logo={resolveMediaUrl(user?.school?.logo)} />

      {!readOnly ? <SaveStatus state={autosave.state} onRetry={autosave.retry} /> : null}
    </StepCard>
  );
}

// ---------------------------------------------------------------- Step 3

function PublishStep({ profile, readOnly, goStep }: { profile: PublicSiteProfile; readOnly: boolean; goStep: (s: WizardStep) => void }) {
  const tr = useTr();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const setup = useHigherSetupStatus();
  const [justPublished, setJustPublished] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});

  const items = buildChecklist({ ...(profile.publish_blockers || {}), ...serverErrors });
  const missing = missingCount(items);
  const live = publicSiteUrl(profile.school.slug);
  const isPublished = profile.publication_status === "published";
  const link = previewUrl(profile.school.slug, profile.preview_token);
  const programmeCount = setup.data?.status.steps.find((s) => s.key === "programmes")?.count;
  const canPublish = !readOnly && !profile.locked_by_founder && missing === 0;

  const publish = useMutation({
    mutationFn: publicSiteService.publish,
    onSuccess: (fresh) => {
      setServerErrors({});
      queryClient.setQueryData(PUBLIC_SITE_KEYS.profile, fresh);
      queryClient.invalidateQueries({ queryKey: PUBLIC_SITE_KEYS.mine });
      queryClient.invalidateQueries({ queryKey: ["public-site", "audit"] });
      setJustPublished(true);
    },
    onError: (error) => {
      setServerErrors(extractFieldErrors(error));
      toast({ variant: "destructive", title: tr("Cannot publish yet", "Publication impossible pour le moment"),
        description: getApiErrorMessage(error, tr("Some required information is missing.", "Des informations obligatoires manquent.")) });
    },
  });

  const makePreview = useMutation({
    mutationFn: publicSiteService.rotatePreviewToken,
    onSuccess: ({ preview_token }) => {
      queryClient.setQueryData(PUBLIC_SITE_KEYS.profile, { ...profile, preview_token });
      toast({ title: tr("Preview ready", "Apercu pret"), description: tr("Press Preview again to open it.", "Appuyez de nouveau sur Apercu pour l'ouvrir.") });
    },
    onError: (error) => toast({ variant: "destructive", title: tr("Could not create the preview", "Creation de l'apercu impossible"), description: getApiErrorMessage(error, "") }),
  });

  if (justPublished && isPublished) {
    return (
      <StepCard title={tr("Your website is live!", "Votre site est en ligne !")} lead={tr("Anyone can now visit it. Share the link with students and parents.", "Tout le monde peut maintenant le visiter. Partagez le lien avec les etudiants et les parents.")}>
        <div className="flex flex-col items-center gap-4 rounded-2xl bg-emerald-50 p-6 text-center text-emerald-900">
          <PartyPopper className="h-12 w-12" />
          <a href={live} target="_blank" rel="noopener noreferrer" className="break-all text-lg font-bold underline underline-offset-4">{live}</a>
          <Button size="lg" asChild className="gap-2"><a href={live} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-5 w-5" />{tr("Open my website", "Ouvrir mon site")}</a></Button>
        </div>
        <Button variant="ghost" onClick={() => setJustPublished(false)}>{tr("Back to checklist", "Retour a la liste")}</Button>
      </StepCard>
    );
  }

  return (
    <StepCard title={tr("Ready to go live?", "Pret a publier ?")} lead={tr("Here is what your website needs before everyone can see it.", "Voici ce dont votre site a besoin avant d'etre visible par tous.")}>
      {isPublished ? (
        <p className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <CheckCircle2 className="h-4 w-4" />{tr("Your website is live at", "Votre site est en ligne a")}
          <a href={live} target="_blank" rel="noopener noreferrer" className="break-all font-semibold underline">{live}</a>
        </p>
      ) : null}
      {profile.locked_by_founder ? (
        <p className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          {tr("Publishing is locked by EduIgnite. Please contact EduIgnite support.", "La publication est verrouillee par EduIgnite. Contactez le support EduIgnite.")}
        </p>
      ) : null}

      <ul className="divide-y rounded-2xl border">
        {items.map((item) => (
          <li key={item.key} className="flex items-center gap-3 px-4 py-3">
            {item.done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /> : <Circle className="h-5 w-5 shrink-0 text-amber-500" />}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{tr(item.en, item.fr)}</p>
              {!item.done && item.message ? <p className="text-xs text-muted-foreground">{item.message}</p> : null}
            </div>
            {!item.done && item.fixStep !== null && !readOnly ? (
              <Button size="sm" variant="outline" onClick={() => goStep(item.fixStep as WizardStep)}>{tr("Fix", "Corriger")}</Button>
            ) : null}
            {!item.done && item.fixStep === null ? <span className="text-xs text-muted-foreground">{tr("Contact support", "Contactez le support")}</span> : null}
          </li>
        ))}
        <li className="flex items-center gap-3 px-4 py-3">
          <GraduationCap className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{tr("Programmes", "Programmes")}</p>
            <p className="text-xs text-muted-foreground">
              {typeof programmeCount === "number"
                ? programmeCount > 0
                  ? tr(`${programmeCount} programme${programmeCount === 1 ? "" : "s"} shown on your website`, `${programmeCount} programme${programmeCount === 1 ? "" : "s"} affiche${programmeCount === 1 ? "" : "s"} sur votre site`)
                  : tr("None yet. Visitors will see an empty programmes page.", "Aucun pour l'instant. Les visiteurs verront une page vide.")
                : tr("Optional but recommended.", "Facultatif mais recommande.")}
            </p>
          </div>
          <Button size="sm" variant="outline" asChild><Link href="/dashboard/higher/programmes">{tr("Manage", "Gerer")}</Link></Button>
        </li>
      </ul>

      <div className="flex flex-col gap-3 sm:flex-row">
        {link ? (
          <Button size="lg" variant="outline" className="gap-2" asChild>
            <a href={link} target="_blank" rel="noopener noreferrer"><Eye className="h-5 w-5" />{tr("Preview", "Apercu")}</a>
          </Button>
        ) : (
          <Button size="lg" variant="outline" className="gap-2" disabled={readOnly || makePreview.isPending || !profile.school.slug} onClick={() => makePreview.mutate()}>
            {makePreview.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Eye className="h-5 w-5" />}{tr("Preview", "Apercu")}
          </Button>
        )}
        {!readOnly ? (
          <Button size="lg" className="h-14 flex-1 gap-2 text-base font-bold" disabled={!canPublish || publish.isPending} onClick={() => publish.mutate()}>
            {publish.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <RefreshCw className={cn("h-5 w-5", isPublished ? "" : "hidden")} />}
            {isPublished ? tr("Publish my latest changes", "Publier mes dernieres modifications") : tr("Publish my website", "Publier mon site")}
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">{tr("Only the school administrator can publish.", "Seul l'administrateur de l'ecole peut publier.")}</p>
        )}
      </div>
      {!canPublish && !readOnly && missing > 0 ? (
        <p className="text-xs text-muted-foreground">{tr(`${missing} item${missing === 1 ? "" : "s"} left before you can publish.`, `Encore ${missing} point${missing === 1 ? "" : "s"} avant de pouvoir publier.`)}</p>
      ) : null}
    </StepCard>
  );
}

// ---------------------------------------------------------------- Wizard

/**
 * Three-step guided setup of a higher-education institution's public website.
 * Advanced settings open the full 11-tab manager unchanged.
 */
export function HigherQuickSetup() {
  const tr = useTr();
  const { user } = useAuth();
  const query = usePublicSiteProfile();
  const [step, setStep] = useState<WizardStep>(0);
  const [advanced, setAdvanced] = useState(false);
  const readOnly = user?.role === "SUB_ADMIN" || Boolean(query.data?.locked_by_founder);

  if (advanced) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" className="gap-2" onClick={() => setAdvanced(false)}>
          <ArrowLeft className="h-4 w-4" />{tr("Back to Quick setup", "Retour a la configuration rapide")}
        </Button>
        <SchoolWebsiteManager />
      </div>
    );
  }

  if (query.isLoading) {
    return <div className="mx-auto max-w-3xl space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-72 w-full" /></div>;
  }
  if (query.isError || !query.data) {
    return <LoadError message={tr("Could not load your website settings.", "Impossible de charger les parametres de votre site.")} onRetry={() => query.refetch()} retrying={query.isFetching} />;
  }
  const profile = query.data;

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-headline text-2xl font-bold text-primary sm:text-3xl">{tr("Set up your website", "Configurez votre site")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{tr("Three easy steps. It takes about five minutes.", "Trois etapes simples. Environ cinq minutes.")}</p>
        </div>
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={() => setAdvanced(true)}>
          <Settings2 className="h-4 w-4" />{tr("Advanced settings", "Parametres avances")}
        </Button>
      </div>

      <BlockBanner />
      <StepDots step={step} onGo={setStep} />

      {/* key remounts a step so its fields re-read the latest saved profile */}
      {step === 0 ? <BasicsStep key="basics" profile={profile} readOnly={readOnly} /> : null}
      {step === 1 ? <LookStep key="look" profile={profile} readOnly={readOnly} /> : null}
      {step === 2 ? <PublishStep key="publish" profile={profile} readOnly={readOnly} goStep={setStep} /> : null}

      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" size="lg" className="gap-2" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1) as WizardStep)}>
          <ArrowLeft className="h-4 w-4" />{tr("Back", "Retour")}
        </Button>
        {step < 2 ? (
          <Button size="lg" className="gap-2" onClick={() => setStep((s) => Math.min(2, s + 1) as WizardStep)}>
            {tr("Next", "Suivant")}<ArrowRight className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
