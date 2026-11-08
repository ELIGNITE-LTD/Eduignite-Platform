"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Field, SaveBar, Section, publicSiteUrl, useProfileForm, useTr, type TabProps } from "./shared";

const CONTACT_KEYS = ["show_principal", "show_email", "show_phone"] as const;

export function ContactTab({ profile, readOnly }: TabProps) {
  const tr = useTr();
  const form = useProfileForm(profile, CONTACT_KEYS);
  const { values, set } = form;

  const rows: Array<{ key: (typeof CONTACT_KEYS)[number]; en: string; fr: string; hintEn: string; hintFr: string; value: string }> = [
    { key: "show_principal", en: "Show the head of school's name", fr: "Afficher le nom du chef d'etablissement", hintEn: "A personal name.", hintFr: "Un nom de personne.", value: "" },
    { key: "show_email", en: "Show the school email", fr: "Afficher l'email de l'ecole", hintEn: "", hintFr: "", value: profile.school.email },
    { key: "show_phone", en: "Show the school phone", fr: "Afficher le telephone de l'ecole", hintEn: "", hintFr: "", value: profile.school.phone },
  ];

  return (
    <div className="space-y-6">
      <Section
        title={tr("What visitors can see", "Ce que les visiteurs peuvent voir")}
        description={tr(
          "Your public website is open to anyone on the internet. Everything you switch on below can be read, copied and collected by anyone, including automated programs. Leave a detail off if you would rather parents contact the school another way. These settings change only the public website, never your school records.",
          "Votre site public est ouvert a tout le monde sur internet. Tout ce que vous activez ci-dessous peut etre lu, copie et collecte par n'importe qui, y compris par des programmes automatiques. Laissez un element desactive si vous preferez que les parents contactent l'ecole autrement. Ces reglages ne changent que le site public, jamais vos dossiers.",
        )}
      >
        {rows.map((row) => {
          const missing = row.key !== "show_principal" && !row.value;
          return (
            <div key={row.key} className="flex items-start justify-between gap-4 rounded-xl border p-4">
              <div className="min-w-0">
                <label htmlFor={`sw-${row.key}`} className="text-sm font-medium">{tr(row.en, row.fr)}</label>
                {row.value ? <p className="break-all text-xs text-muted-foreground">{row.value}</p> : null}
                {missing ? (
                  <p className="text-xs text-amber-700">{tr("Nothing to show yet: add it in school settings.", "Rien a afficher : ajoutez-le dans les parametres de l'ecole.")}</p>
                ) : null}
                {row.hintEn ? <p className="text-xs text-muted-foreground">{tr(row.hintEn, row.hintFr)}</p> : null}
              </div>
              <Switch
                id={`sw-${row.key}`}
                checked={Boolean(values[row.key])}
                disabled={readOnly}
                onCheckedChange={(checked) => set(row.key, checked as never)}
              />
            </div>
          );
        })}
        <p className="text-xs text-muted-foreground">
          {tr(
            "Staff names and photos only appear if each person agreed and the staff list is enabled for your school.",
            "Les noms et photos du personnel n'apparaissent que si chaque personne a donne son accord et que la liste du personnel est activee pour votre ecole.",
          )}
        </p>
      </Section>
      <SaveBar dirty={form.dirty} saving={form.saving} onSave={form.save} readOnly={readOnly} />
    </div>
  );
}

type Lang = "en" | "fr";
const SEO_KEYS = ["meta_title_en", "meta_title_fr", "meta_description_en", "meta_description_fr", "og_image", "social_links"] as const;
const SOCIALS: Array<[string, string]> = [
  ["facebook", "Facebook"], ["instagram", "Instagram"], ["x", "X (Twitter)"], ["youtube", "YouTube"],
  ["linkedin", "LinkedIn"], ["tiktok", "TikTok"], ["whatsapp", "WhatsApp"], ["website", "Website"],
];
const TITLE_MAX = 60;
const DESC_MAX = 160;

export function SeoTab({ profile, readOnly }: TabProps) {
  const tr = useTr();
  const form = useProfileForm(profile, SEO_KEYS);
  const [lang, setLang] = useState<Lang>("en");
  const { values, set, errors } = form;
  const title = (values as any)[`meta_title_${lang}`] as string;
  const description = (values as any)[`meta_description_${lang}`] as string;
  const links = values.social_links || {};
  const fallbackTitle = profile.school.name;
  const fallbackDesc = profile.school.description;
  const shownTitle = (title || fallbackTitle || "").slice(0, 70);
  const shownDesc = (description || fallbackDesc || "").slice(0, 170);
  const address = publicSiteUrl(profile.school.slug) || "eduignite.online/schools/your-school";
  const imageBad = Boolean(values.og_image) && !/^https:\/\//i.test(values.og_image);

  return (
    <div className="space-y-6">
      <Section
        title={tr("Search engine appearance", "Apparence dans les moteurs de recherche")}
        description={tr("How your school appears in Google results. Leave blank to use the school name and description.", "Comment votre ecole apparait dans Google. Laissez vide pour utiliser le nom et la description de l'ecole.")}
      >
        <Tabs value={lang} onValueChange={(next) => setLang(next as Lang)}>
          <TabsList className="grid w-full grid-cols-2 sm:w-80">
            <TabsTrigger value="en">English</TabsTrigger>
            <TabsTrigger value="fr">Francais</TabsTrigger>
          </TabsList>
        </Tabs>
        <Field label={tr("Page title", "Titre de la page")} htmlFor="sw-meta-title" count={title.length} max={TITLE_MAX} error={errors[`meta_title_${lang}`]}
          hint={tr(`Around ${TITLE_MAX} characters is best.`, `Environ ${TITLE_MAX} caracteres, c'est l'ideal.`)}>
          <Input id="sw-meta-title" value={title} disabled={readOnly} onChange={(e) => set(`meta_title_${lang}` as (typeof SEO_KEYS)[number], e.target.value as never)} />
        </Field>
        <Field label={tr("Page description", "Description de la page")} htmlFor="sw-meta-desc" count={description.length} max={DESC_MAX} error={errors[`meta_description_${lang}`]}
          hint={tr(`Around ${DESC_MAX} characters is best.`, `Environ ${DESC_MAX} caracteres, c'est l'ideal.`)}>
          <Textarea id="sw-meta-desc" rows={3} value={description} disabled={readOnly} onChange={(e) => set(`meta_description_${lang}` as (typeof SEO_KEYS)[number], e.target.value as never)} />
        </Field>

        <div className="rounded-xl border bg-white p-4 text-left shadow-sm" aria-label={tr("Search result preview", "Apercu du resultat de recherche")}>
          <p className="truncate text-xs text-emerald-700">{address}</p>
          <p className="mt-0.5 truncate text-lg text-[#1a0dab]">{shownTitle || tr("Your school name", "Le nom de votre ecole")}</p>
          <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">{shownDesc || tr("Your description will appear here.", "Votre description apparaitra ici.")}</p>
        </div>
      </Section>

      <Section title={tr("Sharing and social media", "Partage et reseaux sociaux")}>
        <Field label={tr("Social sharing image address", "Adresse de l'image de partage")} htmlFor="sw-og" error={errors.og_image || (imageBad ? tr("The address must start with https://", "L'adresse doit commencer par https://") : undefined)}
          hint={tr("Shown when your website is shared on WhatsApp or Facebook. Leave blank to use your banner.", "Affichee quand votre site est partage sur WhatsApp ou Facebook. Laissez vide pour utiliser votre banniere.")}>
          <Input id="sw-og" inputMode="url" placeholder="https://" value={values.og_image} disabled={readOnly} onChange={(e) => set("og_image", e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          {SOCIALS.map(([key, label]) => {
            const value = links[key] || "";
            const bad = Boolean(value) && !/^https?:\/\//i.test(value);
            return (
              <Field key={key} label={label} htmlFor={`sw-soc-${key}`} error={bad ? tr("Must start with http:// or https://", "Doit commencer par http:// ou https://") : undefined}>
                <Input id={`sw-soc-${key}`} inputMode="url" placeholder="https://" value={value} disabled={readOnly}
                  onChange={(e) => set("social_links", { ...links, [key]: e.target.value })} />
              </Field>
            );
          })}
        </div>
        {errors.social_links ? <p role="alert" className="text-xs text-destructive">{errors.social_links}</p> : null}
      </Section>
      <SaveBar dirty={form.dirty && !imageBad} saving={form.saving} onSave={form.save} readOnly={readOnly} />
    </div>
  );
}
