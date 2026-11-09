"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";

import { AdmissionSettingsForm, ApplicationsPanel } from "@/components/admissions/admissions-panels";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { apiClient } from "@/lib/api/client";
import { publicSiteUrl, SaveBar, Section, useProfileForm, useTr, type TabProps } from "./shared";

const ENROLLMENT_KEYS = ["enrollment_enabled"] as const;

type Sub = "settings" | "applications" | "preview";

type PreviewSettings = {
  window_state: string;
  intake_year: string;
  opens_on: string | null;
  closes_on: string | null;
  classes_offered: string[];
  field_config: Record<string, "required" | "optional" | "hidden">;
  available_classes: { id: string; name: string; group: string; level?: string }[];
  education_category?: string;
};

/**
 * Enrollment tab of the school website manager. Settings and Applications reuse
 * the panels of /dashboard/admissions; the on/off switch is the website
 * profile's own `enrollment_enabled` flag.
 */
export function EnrollmentTab({ profile, readOnly }: TabProps) {
  const tr = useTr();
  const [sub, setSub] = useState<Sub>("settings");
  const fr = tr("en", "fr") === "fr";
  const form = useProfileForm(profile, ENROLLMENT_KEYS);
  const subs: [Sub, string][] = [
    ["settings", tr("Settings", "Parametres")],
    ["applications", tr("Applications", "Demandes")],
    ["preview", tr("Preview", "Apercu")],
  ];

  return (
    <div className="space-y-6">
      <div role="tablist" className="flex gap-2 overflow-x-auto border-b">
        {subs.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={sub === key}
            onClick={() => setSub(key)}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-semibold ${sub === key ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {sub === "settings" ? (
        <div className="space-y-6">
          <Section
            title={tr("Online enrollment", "Inscription en ligne")}
            description={tr(
              "When on, parents can apply for admission from your public website.",
              "Quand c'est active, les parents peuvent demander une admission depuis votre site public.",
            )}
          >
            <div className="flex items-center justify-between gap-4 rounded-xl border p-4">
              <label htmlFor="sw-enrollment" className="text-sm font-medium">
                {tr("Accept online applications", "Accepter les demandes en ligne")}
              </label>
              <Switch
                id="sw-enrollment"
                checked={Boolean(form.values.enrollment_enabled)}
                disabled={readOnly}
                onCheckedChange={(checked) => form.set("enrollment_enabled", checked)}
              />
            </div>
          </Section>
          <SaveBar dirty={form.dirty} saving={form.saving} onSave={form.save} readOnly={readOnly} />
          <Section
            title={tr("Admission form", "Formulaire d'admission")}
            description={tr(
              "Window, classes offered, form fields, documents, consent and notifications.",
              "Periode, classes proposees, champs, documents, consentement et notifications.",
            )}
          >
            <AdmissionSettingsForm fr={fr} embedded />
          </Section>
        </div>
      ) : null}

      {sub === "applications" ? <ApplicationsPanel fr={fr} /> : null}
      {sub === "preview" ? <PreviewPanel profile={profile} fr={fr} /> : null}
    </div>
  );
}

const FIELD_NAMES: Record<string, [string, string]> = {
  student_dob: ["Date of birth", "Date de naissance"],
  student_gender: ["Gender", "Sexe"],
  previous_school: ["Previous school", "Ecole precedente"],
  class_applied: ["Class applied for", "Classe demandee"],
  guardian_relationship: ["Relationship", "Lien de parente"],
  guardian_phone: ["Guardian phone", "Telephone du tuteur"],
  guardian_email: ["Guardian email", "Email du tuteur"],
  guardian_address: ["Address", "Adresse"],
  message: ["Additional message", "Message complementaire"],
};

function PreviewPanel({ profile, fr }: { profile: TabProps["profile"]; fr: boolean }) {
  const tr = useTr();
  const [s, setS] = useState<PreviewSettings | null>(null);
  const [failed, setFailed] = useState(false);
  const url = publicSiteUrl(profile.school.slug);
  const formUrl = url ? `${url}/enrollment` : "";
  const live = profile.is_live && profile.enrollment_enabled;

  useEffect(() => {
    apiClient.get("/schools/admissions/settings/").then(({ data }) => setS(data)).catch(() => setFailed(true));
  }, []);

  const basic = s?.education_category === "basic";
  const mode = (v: string) => (v === "required" ? tr("Required", "Obligatoire") : v === "hidden" ? tr("Hidden", "Masque") : tr("Optional", "Facultatif"));
  const offered = s ? (s.classes_offered.length ? s.available_classes.filter((c) => s.classes_offered.includes(c.id)) : s.available_classes) : [];

  return (
    <Section
      title={tr("Preview", "Apercu")}
      description={tr("This is what parents will see. It is read-only here.", "Voici ce que verront les parents. Lecture seule ici.")}
    >
      {formUrl ? (
        live ? (
          <Button variant="outline" className="gap-2" asChild>
            <a href={formUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" />{tr("Open the public form", "Ouvrir le formulaire public")}</a>
          </Button>
        ) : (
          <p className="rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground">
            {tr(
              "The public form is not reachable yet: publish your website and switch on online enrollment (Settings).",
              "Le formulaire public n'est pas encore accessible : publiez votre site et activez l'inscription en ligne (Parametres).",
            )}
          </p>
        )
      ) : null}
      {failed ? <p className="text-sm text-destructive">{tr("Could not load the form settings.", "Impossible de charger les parametres du formulaire.")}</p> : null}
      {s ? (
        <div className="space-y-4 rounded-xl border p-4 text-sm">
          <p><strong>{tr("Status", "Etat")}:</strong> {s.window_state.replace(/_/g, " ")}{s.intake_year ? ` - ${tr("Intake", "Rentree")} ${s.intake_year}` : ""}</p>
          <div>
            <p className="font-semibold">{basic ? tr("Pupil information", "Informations sur l'eleve") : tr("Student information", "Informations sur l'eleve")}</p>
            <ul className="mt-1 list-disc pl-5 text-muted-foreground">
              <li>{basic ? tr("Pupil full name", "Nom complet de l'eleve") : tr("Student full name", "Nom complet de l'eleve")} ({tr("Required", "Obligatoire")})</li>
              {Object.entries(FIELD_NAMES).filter(([k]) => (s.field_config[k] ?? "optional") !== "hidden").map(([k, [en, frl]]) => (
                <li key={k}>{fr ? frl : en} ({mode(s.field_config[k] ?? "optional")})</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-semibold">{basic ? tr("Class levels offered", "Niveaux proposes") : tr("Classes offered", "Classes proposees")}</p>
            <p className="mt-1 text-muted-foreground">
              {offered.length ? offered.map((c) => c.name).join(", ") : tr("No class created yet.", "Aucune classe creee pour le moment.")}
            </p>
          </div>
        </div>
      ) : null}
    </Section>
  );
}
