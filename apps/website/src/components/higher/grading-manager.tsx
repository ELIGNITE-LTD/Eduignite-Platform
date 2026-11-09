"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useGradingPolicy, useGradingPresets } from "@/lib/hooks/useHigherEd";
import { higherEdStructureService as api, type GradingPreset, type GradingThresholds } from "@/lib/api/services/higher-ed.service";
import { HigherPageHeader, LoadFailed, Loading, useHigherRunner, useHigherText } from "./higher-shared";

type Key = "gpa_4" | "scale_20";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function GradingManager() {
  const tr = useHigherText();
  const { run, busy } = useHigherRunner();
  const presets = useGradingPresets();
  const policy = useGradingPolicy();
  const [chosen, setChosen] = useState<Key | null>(null);
  const [draft, setDraft] = useState<GradingThresholds | null>(null);

  const saved = policy.data ?? null;
  const active: Key | null = chosen ?? saved?.preset_key ?? null;

  // Load the thresholds to show: the saved ones when this is the saved preset, else the preset defaults.
  useEffect(() => {
    if (!active || !presets.data) return;
    if (saved && saved.preset_key === active) setDraft(clone(saved.thresholds));
    else {
      const preset = presets.data.find((p) => p.key === active);
      if (preset) setDraft(clone(preset));
    }
  }, [active, saved, presets.data]);

  const copy: Record<Key, { title: string; text: string }> = {
    gpa_4: {
      title: tr("GPA out of 4.0", "GPA sur 4,0"),
      text: tr(
        "Letter grades from A to F, each worth points up to 4.0. Final results show a degree class such as First Class. Used in English-speaking institutions.",
        "Notes en lettres de A à F, chacune valant des points jusqu'à 4,0. Le résultat final donne une classe de diplôme. Utilisé dans les établissements anglophones.",
      ),
    },
    scale_20: {
      title: tr("Marks out of 20", "Notes sur 20"),
      text: tr(
        "Each mark is out of 20 and 10 is a pass. Results get a mention such as Bien or Très Bien. Used in French-speaking institutions.",
        "Chaque note est sur 20 et 10 est la moyenne. Les résultats reçoivent une mention comme Bien ou Très Bien. Utilisé dans les établissements francophones.",
      ),
    },
  };

  function setPass(value: string) {
    setDraft((d) => (d ? { ...d, pass_mark: Number(value) } : d));
  }
  function setRowMin(list: "grades" | "mentions" | "classes", index: number, value: string) {
    setDraft((d) => {
      if (!d) return d;
      const rows = clone((d[list] as Array<{ min: number }>) ?? []);
      rows[index].min = Number(value);
      return { ...d, [list]: rows };
    });
  }

  async function save() {
    if (!active || !draft) return;
    const { key: _key, name: _name, kind: _kind, ...thresholds } = draft as GradingPreset;
    await run(() => api.saveGradingPolicy({ preset_key: active, thresholds: thresholds as GradingThresholds }), tr("Grading saved.", "Notation enregistrée."));
  }

  const unit = active === "scale_20" ? "/20" : "";
  const rows: Array<{ list: "grades" | "mentions"; label: string; extra?: string; min: number; index: number }> =
    active === "gpa_4"
      ? (draft?.grades ?? []).map((g, i) => ({ list: "grades" as const, label: g.letter, extra: `${g.points.toFixed(1)}`, min: g.min, index: i }))
      : (draft?.mentions ?? []).map((m, i) => ({ list: "mentions" as const, label: m.label, min: m.min, index: i }));

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <HigherPageHeader
        title={tr("Grading", "Notation")}
        help={tr("Choose how results are graded in your institution. You can adjust the numbers afterwards.", "Choisissez comment les résultats sont notés dans votre établissement. Vous pourrez ajuster les chiffres ensuite.")}
      />
      {presets.isLoading || policy.isLoading ? <Loading /> : presets.isError || policy.isError ? <LoadFailed /> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["gpa_4", "scale_20"] as Key[]).map((key) => {
              const selected = active === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setChosen(key)}
                  aria-pressed={selected}
                  className={`rounded-lg border p-4 text-left transition ${selected ? "border-primary ring-2 ring-primary" : "hover:bg-muted/50"}`}
                >
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    {copy[key].title}
                    {selected ? <Check className="h-4 w-4 text-primary" /> : null}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{copy[key].text}</p>
                </button>
              );
            })}
          </div>

          {active && draft ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{tr("Grade boundaries", "Seuils de notation")}</CardTitle>
                <CardDescription>
                  {tr("The lowest mark that earns each result. Change a number only if your institution uses different limits.", "La note minimale pour obtenir chaque résultat. Ne changez un chiffre que si votre établissement utilise d'autres limites.")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="max-w-xs space-y-1.5">
                  <Label htmlFor="pass-mark">{tr(`Pass mark (out of ${draft.max_score})`, `Moyenne de passage (sur ${draft.max_score})`)}</Label>
                  <Input id="pass-mark" type="number" inputMode="decimal" value={draft.pass_mark} onChange={(e) => setPass(e.target.value)} />
                </div>
                <ul className="space-y-2">
                  {rows.map((r) => (
                    <li key={r.label} className="flex items-center gap-3 text-sm">
                      <span className="w-28 shrink-0 font-medium">{r.label}</span>
                      {r.extra ? <span className="w-16 shrink-0 text-xs text-muted-foreground">{r.extra} {tr("points", "points")}</span> : null}
                      <Label htmlFor={`min-${r.label}`} className="sr-only">{tr("From", "À partir de")} {r.label}</Label>
                      <span className="text-xs text-muted-foreground">{tr("from", "dès")}</span>
                      <Input id={`min-${r.label}`} type="number" inputMode="decimal" className="h-9 w-24" value={r.min} disabled={r.min === 0 && r.index === rows.length - 1}
                        onChange={(e) => setRowMin(r.list, r.index, e.target.value)} />
                      <span className="text-xs text-muted-foreground">{unit || `/${draft.max_score}`}</span>
                    </li>
                  ))}
                </ul>
                {active === "gpa_4" && draft.classes ? (
                  <div>
                    <p className="mb-2 text-xs font-semibold">{tr("Degree classes (by GPA)", "Classes de diplôme (selon le GPA)")}</p>
                    <ul className="space-y-2">
                      {draft.classes.map((c, i) => (
                        <li key={c.label} className="flex items-center gap-3 text-sm">
                          <span className="w-44 shrink-0">{c.label}</span>
                          <span className="text-xs text-muted-foreground">{tr("from", "dès")}</span>
                          <Input type="number" step="0.1" inputMode="decimal" className="h-9 w-24" value={c.min} aria-label={c.label} onChange={(e) => setRowMin("classes", i, e.target.value)} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <Button onClick={save} disabled={busy} className="w-full sm:w-auto">
                  {saved?.preset_key === active ? tr("Save changes", "Enregistrer") : tr("Use this grading", "Utiliser cette notation")}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <p className="text-sm text-muted-foreground">{tr("Pick one of the two options above to continue.", "Choisissez l'une des deux options ci-dessus pour continuer.")}</p>
          )}

          {saved ? (
            <Button asChild variant="outline" className="w-full sm:w-auto">
              <Link href="/dashboard/higher/setup">{tr("Back to setup steps", "Retour aux étapes de configuration")}</Link>
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
