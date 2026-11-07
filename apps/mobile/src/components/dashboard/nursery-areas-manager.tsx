"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api/errors";
import {
  useAssessmentAreas,
  useCreateAssessmentArea,
  useDeleteAssessmentArea,
  useUpdateAssessmentArea,
} from "@/lib/hooks/useNursery";
import type { AssessmentArea } from "@/lib/api/types";

const DEFAULT_AREAS = [
  { name: "Language & Communication", name_fr: "Langage et communication" },
  { name: "Early Numeracy", name_fr: "Pré-numératie" },
  { name: "Social & Emotional", name_fr: "Développement social et émotionnel" },
  { name: "Motor Skills", name_fr: "Motricité" },
  { name: "Creative Arts", name_fr: "Arts créatifs" },
  { name: "Knowing the World", name_fr: "Découverte du monde" },
];

function AreaRow({
  area, index, count, busy, onSave, onMove, onDelete,
}: {
  area: AssessmentArea; index: number; count: number; busy: boolean;
  onSave: (patch: Partial<AssessmentArea>) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(area.name);
  const [nameFr, setNameFr] = useState(area.name_fr);
  const changed = name.trim() !== area.name || nameFr.trim() !== area.name_fr;

  return (
    <div className="grid grid-cols-1 items-center gap-2 rounded-2xl bg-accent/30 p-3 sm:grid-cols-[1fr_1fr_auto]">
      <Input aria-label="Area name" className="h-10 rounded-xl" value={name} onChange={(e) => setName(e.target.value)} />
      <Input aria-label="Area name in French" placeholder="Français" className="h-10 rounded-xl" value={nameFr}
        onChange={(e) => setNameFr(e.target.value)} />
      <div className="flex items-center gap-1 justify-self-end">
        {changed ? (
          <Button size="sm" className="rounded-xl" disabled={busy || !name.trim()}
            onClick={() => onSave({ name: name.trim(), name_fr: nameFr.trim() })}>Save</Button>
        ) : null}
        <Switch aria-label="Active" checked={area.active} disabled={busy} onCheckedChange={(v) => onSave({ active: v })} />
        <Button size="icon" variant="ghost" aria-label="Move up" disabled={busy || index === 0} onClick={() => onMove(-1)}>
          <ArrowUp className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" aria-label="Move down" disabled={busy || index === count - 1} onClick={() => onMove(1)}>
          <ArrowDown className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" aria-label="Delete area" disabled={busy} onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/** Admin manager for the nursery developmental areas pupils are rated on. */
export function NurseryAreasManager() {
  const { toast } = useToast();
  const { data: areas = [], isLoading } = useAssessmentAreas();
  const createArea = useCreateAssessmentArea();
  const updateArea = useUpdateAssessmentArea();
  const deleteArea = useDeleteAssessmentArea();
  const [name, setName] = useState("");
  const [nameFr, setNameFr] = useState("");
  const [seeding, setSeeding] = useState(false);
  const busy = createArea.isPending || updateArea.isPending || deleteArea.isPending || seeding;

  const fail = (title: string) => (error: unknown) =>
    toast({ variant: "destructive", title, description: getApiErrorMessage(error) });

  const add = async () => {
    if (!name.trim()) return;
    try {
      await createArea.mutateAsync({ name: name.trim(), name_fr: nameFr.trim(), order_index: areas.length, active: true });
      setName("");
      setNameFr("");
    } catch (error) {
      fail("Could not add the area")(error);
    }
  };

  const seed = async () => {
    const existing = new Set(areas.map((a) => a.name.toLowerCase()));
    const missing = DEFAULT_AREAS.filter((a) => !existing.has(a.name.toLowerCase()));
    if (!missing.length) {
      toast({ title: "Nothing to add", description: "All the default areas already exist." });
      return;
    }
    setSeeding(true);
    try {
      for (const [i, area] of missing.entries()) {
        await createArea.mutateAsync({ ...area, order_index: areas.length + i, active: true });
      }
      toast({ title: "Default areas added", description: `${missing.length} area(s) created.` });
    } catch (error) {
      fail("Could not add the default areas")(error);
    } finally {
      setSeeding(false);
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    const next = [...areas];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    try {
      for (const [position, area] of next.entries()) {
        if (area.order_index !== position) await updateArea.mutateAsync({ id: area.id, data: { order_index: position } });
      }
    } catch (error) {
      fail("Could not reorder the areas")(error);
    }
  };

  const remove = async (area: AssessmentArea) => {
    if (!window.confirm(`Delete "${area.name}"? Ratings given for this area will be deleted too. Deactivate it instead to keep them.`)) return;
    try {
      await deleteArea.mutateAsync(area.id);
    } catch (error) {
      fail("Could not delete the area")(error);
    }
  };

  return (
    <Card className="rounded-3xl border-none shadow-sm">
      <CardHeader>
        <CardTitle>Nursery developmental areas</CardTitle>
        <CardDescription>The areas teachers rate each nursery pupil on every term. Inactive areas are hidden from teachers.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-primary/30" /></div>
        ) : areas.length === 0 ? (
          <p className="text-sm text-muted-foreground">No areas yet. Add your own or start from the common defaults.</p>
        ) : (
          <div className="space-y-2">
            {areas.map((area, i) => (
              <AreaRow
                key={`${area.id}:${area.name}:${area.name_fr}`}
                area={area} index={i} count={areas.length} busy={busy}
                onSave={(patch) => updateArea.mutate({ id: area.id, data: patch }, { onError: fail("Could not save the area") })}
                onMove={(d) => move(i, d)}
                onDelete={() => remove(area)}
              />
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Input aria-label="New area name" placeholder="New area (English)" className="h-10 rounded-xl" value={name}
            onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <Input aria-label="New area name in French" placeholder="Français" className="h-10 rounded-xl" value={nameFr}
            onChange={(e) => setNameFr(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <Button className="rounded-xl" disabled={busy || !name.trim()} onClick={add}>
            <Plus className="mr-1 h-4 w-4" />Add
          </Button>
        </div>

        <Button variant="outline" className="rounded-xl" disabled={busy} onClick={seed}>
          {seeding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          Add default areas
        </Button>
      </CardContent>
    </Card>
  );
}
