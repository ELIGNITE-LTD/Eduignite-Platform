"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api/errors";
import { useSchoolSettings, useUpdateSchoolSettings } from "@/lib/hooks/useSchools";
import type { AssessmentConfig } from "@/lib/api/types";

type Preset = "" | "primary_numeric" | "nursery_descriptive";
type ToggleKey =
  | "use_coefficients" | "show_rank" | "show_average" | "show_coefficients" | "show_subject_position"
  | "show_class_average" | "show_attendance" | "show_conduct" | "show_promotion";
type LabelRow = { label: string; label_fr: string };

// Numeric fields are held as text while typing so the inputs can be emptied.
interface Draft {
  preset: Preset;
  max_score: string;
  pass_mark: string;
  bands: Array<{ letter: string; min_score: string; label_fr: string }>;
  toggles: Record<ToggleKey, boolean>;
  evaluations_per_term: number;
  eval_labels: LabelRow[]; // always evaluations_per_term rows
  scale: LabelRow[];
}

const TOGGLES: Array<{ key: ToggleKey; label: string }> = [
  { key: "use_coefficients", label: "Use subject coefficients" },
  { key: "show_coefficients", label: "Show coefficients on the report card" },
  { key: "show_average", label: "Show the average" },
  { key: "show_rank", label: "Show the pupil's rank" },
  { key: "show_subject_position", label: "Show position per subject" },
  { key: "show_class_average", label: "Show the class average" },
  { key: "show_attendance", label: "Show attendance" },
  { key: "show_conduct", label: "Show conduct" },
  { key: "show_promotion", label: "Show promotion decision" },
];

const DEFAULT_SCALE: LabelRow[] = [
  { label: "Beginning", label_fr: "Débutant" },
  { label: "Developing", label_fr: "En progrès" },
  { label: "Secure", label_fr: "Acquis" },
  { label: "Excelling", label_fr: "Excellent" },
];

// Percent-of-max cutoffs of the primary preset (18/16/14/12/10/0 on a /20 scale).
const PRIMARY_BANDS: Array<[string, string, number]> = [
  ["Excellent", "Excellent", 90], ["Very Good", "Très bien", 80], ["Good", "Bien", 70],
  ["Fairly Good", "Assez bien", 60], ["Pass", "Passable", 50], ["Fail", "Insuffisant", 0],
];

const ALL_ON: Record<ToggleKey, boolean> = {
  use_coefficients: true, show_rank: true, show_average: true, show_coefficients: true, show_subject_position: true,
  show_class_average: true, show_attendance: true, show_conduct: true, show_promotion: true,
};

const num = (v: number) => String(Math.round(v * 100) / 100);
const blankRows = (n: number, rows: LabelRow[] = []) =>
  Array.from({ length: n }, (_, i) => rows[i] ?? { label: "", label_fr: "" });

function presetDraft(preset: Preset, current: Draft): Draft {
  if (preset === "primary_numeric") {
    return {
      ...current, preset, max_score: "20", pass_mark: "10", evaluations_per_term: 2,
      bands: PRIMARY_BANDS.map(([letter, label_fr, pct]) => ({ letter, label_fr, min_score: num((pct * 20) / 100) })),
      eval_labels: [{ label: "Test", label_fr: "Devoir" }, { label: "Exam", label_fr: "Examen" }],
      toggles: { ...ALL_ON, show_subject_position: false },
    };
  }
  if (preset === "nursery_descriptive") {
    return {
      ...current, preset, evaluations_per_term: 1, eval_labels: blankRows(1), scale: DEFAULT_SCALE.map((s) => ({ ...s })),
      toggles: {
        ...ALL_ON, show_rank: false, show_average: false, use_coefficients: false, show_coefficients: false,
        show_class_average: false, show_subject_position: false,
      },
    };
  }
  return { ...current, preset };
}

function toDraft(cfg?: Partial<AssessmentConfig>): Draft {
  const max = Number(cfg?.max_score ?? 20);
  const bands = cfg?.grade_bands?.length
    ? cfg.grade_bands.map((b) => ({ letter: b.letter, min_score: num(Number(b.min_score)), label_fr: b.label_fr ?? "" }))
    : [["A", 80], ["B", 70], ["C", 60], ["D", 50], ["F", 0]].map(([letter, pct]) => ({
        letter: String(letter), min_score: num((Number(pct) * max) / 100), label_fr: "",
      }));
  const toggles = { ...ALL_ON };
  (Object.keys(toggles) as ToggleKey[]).forEach((k) => {
    const value = cfg?.[k];
    if (typeof value === "boolean") toggles[k] = value;
  });
  const perTerm = cfg?.evaluations_per_term ?? 2;
  return {
    preset: (cfg?.preset as Preset) || "",
    max_score: num(max),
    pass_mark: num(Number(cfg?.pass_mark ?? max / 2)),
    bands,
    toggles,
    evaluations_per_term: perTerm,
    eval_labels: blankRows(perTerm, (cfg?.evaluation_labels ?? []).map((l) => ({ label: l.label, label_fr: l.label_fr ?? "" }))),
    scale: (cfg?.nursery_scale?.length ? cfg.nursery_scale : DEFAULT_SCALE).map((l) => ({ label: l.label, label_fr: l.label_fr ?? "" })),
  };
}

function labelItems(rows: LabelRow[]) {
  return rows.map((r) => ({ label: r.label.trim(), ...(r.label_fr.trim() ? { label_fr: r.label_fr.trim() } : {}) }));
}

function toPayload(d: Draft): AssessmentConfig {
  // Evaluation labels are positional: send them only when every evaluation is named.
  const named = d.eval_labels.every((r) => r.label.trim());
  return {
    preset: d.preset,
    max_score: Number(d.max_score),
    pass_mark: Number(d.pass_mark),
    grade_bands: d.bands.map((b) => ({
      letter: b.letter.trim(), min_score: Number(b.min_score), ...(b.label_fr.trim() ? { label_fr: b.label_fr.trim() } : {}),
    })),
    ...d.toggles,
    evaluations_per_term: d.evaluations_per_term,
    evaluation_labels: named ? labelItems(d.eval_labels) : [],
    nursery_scale: labelItems(d.scale),
  };
}

const rowInput = "h-10 rounded-xl";

/** Assessment scale, grade bands, report-card options and nursery scale of a basic school. */
export function AssessmentSettings({ schoolId }: { schoolId: string }) {
  const { toast } = useToast();
  const { data: settings } = useSchoolSettings(schoolId);
  const updateSettings = useUpdateSchoolSettings();
  const [draft, setDraft] = useState<Draft>(() => toDraft());
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (settings && !dirty) setDraft(toDraft(settings.assessment_config));
  }, [settings, dirty]);

  const edit = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };

  const save = async () => {
    try {
      await updateSettings.mutateAsync({ id: schoolId, data: { assessment_config: toPayload(draft) } });
      setDirty(false);
      toast({ title: "Assessment settings saved" });
    } catch (error) {
      toast({ variant: "destructive", title: "Could not save assessment settings", description: getApiErrorMessage(error) });
    }
  };

  const setBand = (i: number, patch: Partial<Draft["bands"][number]>) =>
    edit({ bands: draft.bands.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const setRow = (key: "eval_labels" | "scale", i: number, patch: Partial<LabelRow>) =>
    edit({ [key]: draft[key].map((r, j) => (j === i ? { ...r, ...patch } : r)) } as Partial<Draft>);

  return (
    <Card className="rounded-3xl border-none shadow-sm">
      <CardHeader>
        <CardTitle>Assessment settings</CardTitle>
        <CardDescription>Scale, grade bands and what appears on report cards for this school.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase">Preset</Label>
            <Select
              value={draft.preset || "custom"}
              onValueChange={(v) => { setDraft((d) => presetDraft(v === "custom" ? "" : (v as Preset), d)); setDirty(true); }}
            >
              <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="primary_numeric">Primary (marks out of 20)</SelectItem>
                <SelectItem value="nursery_descriptive">Nursery (descriptive)</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase">Maximum score</Label>
            <Input type="number" inputMode="decimal" min={1} max={100} className="h-11 rounded-xl" value={draft.max_score}
              onChange={(e) => edit({ max_score: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase">Pass mark</Label>
            <Input type="number" inputMode="decimal" min={0} className="h-11 rounded-xl" value={draft.pass_mark}
              onChange={(e) => edit({ pass_mark: e.target.value })} />
          </div>
        </div>
        <p className="-mt-4 text-xs text-muted-foreground">
          Choosing a preset fills in the fields below. Change anything you like, then save.
        </p>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold">Grade bands</h3>
            <Button type="button" size="sm" variant="outline" className="rounded-xl"
              onClick={() => edit({ bands: [...draft.bands, { letter: "", min_score: "", label_fr: "" }] })}>
              <Plus className="mr-1 h-4 w-4" />Add band
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Highest first. Each band needs a lower minimum than the one above, and the last must start at 0.
          </p>
          {draft.bands.map((b, i) => (
            <div key={i} className="grid grid-cols-[1fr_5.5rem_1fr_auto] items-center gap-2">
              <Input aria-label="Grade label" placeholder="Label (e.g. Good)" className={rowInput} value={b.letter}
                onChange={(e) => setBand(i, { letter: e.target.value })} />
              <Input aria-label="Minimum score" type="number" inputMode="decimal" placeholder="Min" className={rowInput}
                value={b.min_score} onChange={(e) => setBand(i, { min_score: e.target.value })} />
              <Input aria-label="French label" placeholder="Français" className={rowInput} value={b.label_fr}
                onChange={(e) => setBand(i, { label_fr: e.target.value })} />
              <Button type="button" size="icon" variant="ghost" aria-label="Remove band" disabled={draft.bands.length <= 1}
                onClick={() => edit({ bands: draft.bands.filter((_, j) => j !== i) })}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-bold">Report card options</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {TOGGLES.map((t) => (
              <label key={t.key} className="flex items-center justify-between gap-3 rounded-2xl bg-accent/30 px-4 py-3 text-sm">
                <span>{t.label}</span>
                <Switch checked={draft.toggles[t.key]}
                  onCheckedChange={(v) => edit({ toggles: { ...draft.toggles, [t.key]: v } })} />
              </label>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-bold">Evaluations per term</h3>
            <Select
              value={String(draft.evaluations_per_term)}
              onValueChange={(v) => edit({ evaluations_per_term: Number(v), eval_labels: blankRows(Number(v), draft.eval_labels) })}
            >
              <SelectTrigger className="h-10 w-28 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>{[1, 2, 3].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">Optional names for each evaluation (e.g. Test, Exam). Name all of them or none.</p>
          {draft.eval_labels.map((row, i) => (
            <div key={i} className="grid grid-cols-2 gap-2">
              <Input aria-label={`Evaluation ${i + 1} label`} placeholder={`Evaluation ${i + 1}`} className={rowInput}
                maxLength={24} value={row.label} onChange={(e) => setRow("eval_labels", i, { label: e.target.value })} />
              <Input aria-label={`Evaluation ${i + 1} French label`} placeholder="Français" className={rowInput}
                maxLength={24} value={row.label_fr} onChange={(e) => setRow("eval_labels", i, { label_fr: e.target.value })} />
            </div>
          ))}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold">Nursery rating scale</h3>
            <Button type="button" size="sm" variant="outline" className="rounded-xl" disabled={draft.scale.length >= 6}
              onClick={() => edit({ scale: [...draft.scale, { label: "", label_fr: "" }] })}>
              <Plus className="mr-1 h-4 w-4" />Add level
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">2 to 6 levels, lowest first.</p>
          {draft.scale.map((row, i) => (
            <div key={i} className="grid grid-cols-[1.5rem_1fr_1fr_auto] items-center gap-2">
              <span className="text-center text-xs font-bold text-muted-foreground">{i + 1}</span>
              <Input aria-label={`Level ${i + 1} label`} placeholder="English" className={rowInput} maxLength={24}
                value={row.label} onChange={(e) => setRow("scale", i, { label: e.target.value })} />
              <Input aria-label={`Level ${i + 1} French label`} placeholder="Français" className={rowInput} maxLength={24}
                value={row.label_fr} onChange={(e) => setRow("scale", i, { label_fr: e.target.value })} />
              <Button type="button" size="icon" variant="ghost" aria-label="Remove level" disabled={draft.scale.length <= 2}
                onClick={() => edit({ scale: draft.scale.filter((_, j) => j !== i) })}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </section>

        <div className="flex justify-end">
          <Button onClick={save} disabled={updateSettings.isPending} className="rounded-xl">
            {updateSettings.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save assessment settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
