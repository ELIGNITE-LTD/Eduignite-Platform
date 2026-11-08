"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth, type SchoolInfo } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { schoolsService } from "@/lib/api/services/schools.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import { resolveMediaUrl } from "@/lib/media";
import { getUploadErrorMessage, validateImageFile } from "@/lib/upload-validation";
import { PUBLIC_SITE_KEYS } from "@/lib/hooks/usePublicSite";
import type { CoreValue, PublicSiteProfile } from "@/lib/api/services/public-site.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Plus, Save, Trash2, Upload } from "lucide-react";
import { Field, SaveBar, Section, useProfileForm, useTr, type TabProps } from "./shared";

type Lang = "en" | "fr";

const LIMITS = { hero_title: 120, hero_subtitle: 240, vision: 5000, mission: 5000, history: 20000 } as const;
const BILINGUAL_KEYS = (["hero_title", "hero_subtitle", "vision", "mission", "history"] as const).flatMap(
  (f) => [`${f}_en`, `${f}_fr`] as const,
);
const KEYS = [...BILINGUAL_KEYS, "core_values", "theme_accent"] as const;
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Motto and description live on the school record itself (shared by both languages). */
function SchoolBasics({ profile, readOnly }: TabProps) {
  const tr = useTr();
  const { toast } = useToast();
  const { user, updateSchool } = useAuth();
  const queryClient = useQueryClient();
  const [motto, setMotto] = useState(profile.school.motto || "");
  const [description, setDescription] = useState(profile.school.description || "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"logo" | "banner" | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMotto(profile.school.motto || "");
    setDescription(profile.school.description || "");
  }, [profile.school.motto, profile.school.description]);

  const dirty = motto !== (profile.school.motto || "") || description !== (profile.school.description || "");

  const save = async () => {
    setSaving(true);
    try {
      await updateSchool({ motto: motto.trim(), description: description.trim() } as Partial<SchoolInfo>);
      await queryClient.invalidateQueries({ queryKey: PUBLIC_SITE_KEYS.profile });
      toast({ title: tr("Saved", "Enregistre") });
    } catch (error) {
      toast({ variant: "destructive", title: tr("Could not save", "Enregistrement impossible"), description: getApiErrorMessage(error, "") });
    } finally {
      setSaving(false);
    }
  };

  const upload = async (event: React.ChangeEvent<HTMLInputElement>, type: "logo" | "banner") => {
    const file = event.target.files?.[0];
    const schoolId = user?.school?.id;
    if (!file || !schoolId) return;
    const fileError = validateImageFile(file, type === "logo" ? "school logo" : "school banner", true);
    if (fileError) {
      toast({ variant: "destructive", title: tr("Upload blocked", "Televersement bloque"), description: fileError });
      event.target.value = "";
      return;
    }
    setUploading(type);
    try {
      const result = type === "logo" ? await schoolsService.uploadLogo(schoolId, file) : await schoolsService.uploadBanner(schoolId, file);
      const url = resolveMediaUrl((result as any)[`${type}_url`] || (result as any)[type]);
      await updateSchool({ [type]: url } as Partial<SchoolInfo>);
      await queryClient.invalidateQueries({ queryKey: PUBLIC_SITE_KEYS.profile });
      toast({ title: tr("Image saved", "Image enregistree") });
    } catch (error: any) {
      toast({ variant: "destructive", title: tr("Upload failed", "Echec du televersement"), description: getUploadErrorMessage(error, type) });
    } finally {
      setUploading(null);
      event.target.value = "";
    }
  };

  const logo = resolveMediaUrl(user?.school?.logo);
  const banner = resolveMediaUrl(user?.school?.banner);

  return (
    <Section
      title={tr("School identity", "Identite de l'ecole")}
      description={tr(
        "These come from your school record and are the same in English and French. The name is changed in school settings.",
        "Ces informations viennent du dossier de l'ecole et sont identiques en francais et en anglais. Le nom se modifie dans les parametres de l'ecole.",
      )}
    >
      <Field label={tr("School name", "Nom de l'ecole")} htmlFor="sw-name">
        <Input id="sw-name" value={profile.school.name} readOnly disabled />
      </Field>
      <Field label={tr("Motto", "Devise")} htmlFor="sw-motto" count={motto.length} max={160}>
        <Input id="sw-motto" value={motto} maxLength={160} disabled={readOnly} onChange={(e) => setMotto(e.target.value)} />
      </Field>
      <Field
        label={tr("Description", "Description")}
        htmlFor="sw-desc"
        count={description.length}
        max={2000}
        error={!description.trim() ? tr("Required before you can publish.", "Obligatoire avant de pouvoir publier.") : undefined}
      >
        <Textarea id="sw-desc" rows={5} value={description} maxLength={2000} disabled={readOnly} onChange={(e) => setDescription(e.target.value)} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        {([["logo", logo, logoRef], ["banner", banner, bannerRef]] as const).map(([type, src, ref]) => (
          <div key={type} className="space-y-1.5">
            <p className="text-sm font-medium">{type === "logo" ? tr("Logo", "Logo") : tr("Banner", "Banniere")}</p>
            <button
              type="button"
              disabled={readOnly || uploading !== null}
              onClick={() => ref.current?.click()}
              className="relative flex h-32 w-full items-center justify-center overflow-hidden rounded-xl border-2 border-dashed bg-muted/30 hover:border-primary disabled:cursor-not-allowed"
              aria-label={type === "logo" ? tr("Upload logo", "Televerser le logo") : tr("Upload banner", "Televerser la banniere")}
            >
              {uploading === type ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : src ? (
                <img src={src} alt="" className={type === "logo" ? "h-full w-full object-contain" : "h-full w-full object-cover"} />
              ) : (
                <span className="flex flex-col items-center gap-1 text-xs text-muted-foreground"><Upload className="h-5 w-5" />{tr("Upload an image", "Televerser une image")}</span>
              )}
            </button>
            <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => upload(e, type)} />
          </div>
        ))}
      </div>

      {!readOnly ? (
        <Button onClick={save} disabled={!dirty || saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {tr("Save identity", "Enregistrer l'identite")}
        </Button>
      ) : null}
    </Section>
  );
}

export function IdentityTab(props: TabProps) {
  const { profile, readOnly } = props;
  const tr = useTr();
  const form = useProfileForm(profile, KEYS);
  const [lang, setLang] = useState<Lang>("en");
  const { values, set, errors } = form;
  const v = values as unknown as Record<string, any>;
  const text = (name: string) => (v[`${name}_${lang}`] as string) ?? "";
  const setText = (name: string, value: string) => set(`${name}_${lang}` as (typeof KEYS)[number], value as never);
  const filled = (l: Lang) => ["hero_title", "vision", "mission"].filter((n) => ((v[`${n}_${l}`] as string) || "").trim()).length;

  const coreValues = values.core_values as CoreValue[];
  const accentOk = !values.theme_accent || HEX.test(values.theme_accent);

  const field = (name: keyof typeof LIMITS, label: string, rows: number) => {
    const key = `${name}_${lang}`;
    const value = text(name);
    const common = {
      id: `sw-${key}`,
      value,
      disabled: readOnly,
      onChange: (e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => setText(name, e.target.value),
    };
    return (
      <Field
        key={key}
        label={label}
        htmlFor={`sw-${key}`}
        count={value.length}
        max={LIMITS[name]}
        error={errors[key] || (value.length > LIMITS[name] ? tr("Too long.", "Trop long.") : undefined)}
      >
        {rows > 1 ? <Textarea rows={rows} {...common} /> : <Input {...common} />}
      </Field>
    );
  };

  return (
    <div className="space-y-6">
      <SchoolBasics {...props} />

      <Section
        title={tr("Content in English and French", "Contenu en anglais et en francais")}
        description={tr(
          "Switch language to write each version. Visitors see the language they choose; if one is empty, the other is shown.",
          "Changez de langue pour rediger chaque version. Les visiteurs voient la langue choisie ; si l'une est vide, l'autre s'affiche.",
        )}
      >
        <Tabs value={lang} onValueChange={(next) => setLang(next as Lang)}>
          <TabsList className="grid w-full grid-cols-2 sm:w-80">
            <TabsTrigger value="en">English ({filled("en")}/3)</TabsTrigger>
            <TabsTrigger value="fr">Francais ({filled("fr")}/3)</TabsTrigger>
          </TabsList>
        </Tabs>
        {field("hero_title", tr("Home page title", "Titre de la page d'accueil"), 1)}
        {field("hero_subtitle", tr("Home page subtitle", "Sous-titre de la page d'accueil"), 2)}
        {field("vision", tr("Vision", "Vision"), 4)}
        {field("mission", tr("Mission", "Mission"), 4)}
        {field("history", tr("History of the school", "Histoire de l'ecole"), 6)}
        <p className="text-xs text-muted-foreground">
          {tr("Plain text only. Formatting and links are removed for safety.", "Texte simple uniquement. La mise en forme et les liens sont supprimes par securite.")}
        </p>
      </Section>

      <Section
        title={tr("Core values", "Valeurs fondamentales")}
        description={tr("Up to 12 short values, each in English and French.", "Jusqu'a 12 valeurs courtes, chacune en anglais et en francais.")}
      >
        {coreValues.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            {tr("No values added yet.", "Aucune valeur ajoutee.")}
          </p>
        ) : null}
        {coreValues.map((item, index) => (
          <div key={index} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
            {(["en", "fr"] as const).map((l) => (
              <Input
                key={l}
                aria-label={`${tr("Value", "Valeur")} ${index + 1} (${l.toUpperCase()})`}
                placeholder={l === "en" ? "Integrity" : "Integrite"}
                value={item[l]}
                maxLength={120}
                disabled={readOnly}
                onChange={(e) => set("core_values", coreValues.map((c, i) => (i === index ? { ...c, [l]: e.target.value } : c)))}
              />
            ))}
            {!readOnly ? (
              <Button variant="ghost" size="icon" aria-label={tr("Remove value", "Retirer la valeur")} onClick={() => set("core_values", coreValues.filter((_, i) => i !== index))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        ))}
        {errors.core_values ? <p role="alert" className="text-xs text-destructive">{errors.core_values}</p> : null}
        {!readOnly && coreValues.length < 12 ? (
          <Button variant="outline" size="sm" className="gap-2" onClick={() => set("core_values", [...coreValues, { en: "", fr: "" }])}>
            <Plus className="h-4 w-4" />{tr("Add a value", "Ajouter une valeur")}
          </Button>
        ) : null}
      </Section>

      <Section title={tr("Accent colour", "Couleur d'accent")} description={tr("Used for highlights on your public website.", "Utilisee pour les elements mis en avant sur votre site public.")}>
        <div className="flex items-center gap-3">
          <input
            type="color"
            aria-label={tr("Pick a colour", "Choisir une couleur")}
            value={HEX.test(values.theme_accent) ? values.theme_accent : "#1a73e8"}
            disabled={readOnly}
            onChange={(e) => set("theme_accent", e.target.value)}
            className="h-10 w-14 cursor-pointer rounded border"
          />
          <Input
            aria-label="Hex"
            className="w-40"
            placeholder="#1a73e8"
            value={values.theme_accent}
            disabled={readOnly}
            onChange={(e) => set("theme_accent", e.target.value)}
          />
        </div>
        {!accentOk || errors.theme_accent ? (
          <p role="alert" className="text-xs text-destructive">{errors.theme_accent || tr("Use a hex colour such as #1a73e8.", "Utilisez une couleur hexadecimale comme #1a73e8.")}</p>
        ) : null}
      </Section>

      <SaveBar dirty={form.dirty && accentOk} saving={form.saving} onSave={form.save} readOnly={readOnly} />
    </div>
  );
}
