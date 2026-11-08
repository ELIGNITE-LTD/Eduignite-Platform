"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Link2, Loader2, Plus, Save, Search, Trash2, X } from "lucide-react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api/errors";
import {
  proprietorService,
  readApiError,
  type PickerFilters,
  type PickerSchool,
  type ProprietorSchoolRow,
} from "@/lib/api/services/proprietor.service";
import { cn } from "@/lib/utils";
import { CategoryBadge, EmptyState, ErrorState, SoftBadge, categoryLabel, useTr } from "./common";

/**
 * Searchable multi-select that decides which schools a proprietor owns.
 *
 * - lists every school of every section / type (server picker endpoint);
 * - the type / level / subsystem filters are applied by the server;
 * - the chips above the list are the selection and survive filtering;
 * - Save replaces the whole linked set in one call, after a confirmation that
 *   names what is added and what is removed.
 */

const ALL = "__all__";
const SECTION_ORDER = ["basic", "secondary", "higher"];

type Props = {
  proprietorId: string;
  proprietorName: string;
  linked: ProprietorSchoolRow[];
  disabled?: boolean;
  onSaved: (schools: ProprietorSchoolRow[]) => void;
};

function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export function SchoolLinker({ proprietorId, proprietorName, linked, disabled, onSaved }: Props) {
  const tr = useTr();
  const { toast } = useToast();

  const [selected, setSelected] = useState<Map<string, ProprietorSchoolRow>>(() => new Map(linked.map((s) => [s.id, s])));
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(ALL);
  const [level, setLevel] = useState(ALL);
  const [schoolType, setSchoolType] = useState(ALL);
  const [subsystem, setSubsystem] = useState(ALL);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Start again from the server's set whenever it changes (after a save, or another proprietor opened).
  const linkedKey = linked.map((s) => s.id).sort().join("|");
  useEffect(() => {
    setSelected(new Map(linked.map((s) => [s.id, s])));
    setSaveError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proprietorId, linkedKey]);

  const debouncedSearch = useDebounced(search.trim());
  const filters: PickerFilters = {
    education_category: category === ALL ? undefined : category,
    level: level === ALL ? undefined : level,
    school_type: schoolType === ALL ? undefined : schoolType,
    subsystem: subsystem === ALL ? undefined : subsystem,
    q: debouncedSearch || undefined,
    proprietor: proprietorId,
  };
  const picker = useQuery({
    queryKey: ["proprietors", "picker", filters],
    queryFn: () => proprietorService.pickerSchools(filters),
    enabled: open,
    placeholderData: (previous) => previous,
    staleTime: 30_000,
  });

  const results = picker.data?.results ?? [];
  const groups = useMemo(() => {
    const by = new Map<string, PickerSchool[]>();
    results.forEach((row) => {
      const key = row.education_category || "other";
      by.set(key, [...(by.get(key) ?? []), row]);
    });
    return [...by.entries()].sort(([a], [b]) => {
      const ia = SECTION_ORDER.indexOf(a);
      const ib = SECTION_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }, [results]);

  const initialIds = useMemo(() => new Set(linked.map((s) => s.id)), [linked]);
  const added = [...selected.values()].filter((s) => !initialIds.has(s.id));
  const removed = linked.filter((s) => !selected.has(s.id));
  const dirty = added.length > 0 || removed.length > 0;

  const toggle = (row: ProprietorSchoolRow) =>
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(row.id)) next.delete(row.id);
      else next.set(row.id, row);
      return next;
    });

  const toggleGroup = (rows: PickerSchool[]) =>
    setSelected((current) => {
      const next = new Map(current);
      const allSelected = rows.every((row) => next.has(row.id));
      rows.forEach((row) => (allSelected ? next.delete(row.id) : next.set(row.id, row)));
      return next;
    });

  const filtersActive = category !== ALL || level !== ALL || schoolType !== ALL || subsystem !== ALL || Boolean(search);
  const clearFilters = () => {
    setSearch("");
    setCategory(ALL);
    setLevel(ALL);
    setSchoolType(ALL);
    setSubsystem(ALL);
  };

  const save = async () => {
    setSaving(true);
    setSaveError("");
    try {
      const result = await proprietorService.replaceSchools(proprietorId, [...selected.keys()]);
      onSaved(result.schools);
      setConfirming(false);
      toast({
        title: tr("Schools updated", "Écoles mises à jour"),
        description: tr(
          `${result.added.length} added, ${result.removed.length} removed for ${proprietorName}.`,
          `${result.added.length} ajoutée(s), ${result.removed.length} retirée(s) pour ${proprietorName}.`,
        ),
      });
    } catch (error) {
      const info = readApiError(error);
      setSaveError(info.errors.school_ids?.[0] || getApiErrorMessage(error, tr("The schools could not be saved. Nothing was changed.", "Les écoles n'ont pas pu être enregistrées. Rien n'a été modifié.")));
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  };

  const chips = [...selected.values()];

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-primary">
          <Link2 className="h-4 w-4" /> {tr("Linked schools", "Écoles liées")}
        </h3>
        <p className="text-xs text-muted-foreground">
          {tr(
            "Choose every school this proprietor owns, whatever its section. Saving replaces the whole list.",
            "Choisissez toutes les écoles de ce propriétaire, quelle que soit leur section. L'enregistrement remplace toute la liste.",
          )}
        </p>
      </div>

      <div className="min-h-[2.5rem] rounded-2xl border bg-accent/20 p-2" aria-live="polite">
        {chips.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">{tr("No school selected.", "Aucune école sélectionnée.")}</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {chips.map((school) => {
              const isNew = !initialIds.has(school.id);
              return (
                <li key={school.id}>
                  <span
                    className={cn(
                      "inline-flex max-w-full items-center gap-1 rounded-full border bg-white py-1 pl-3 pr-1 text-xs font-bold text-primary",
                      isNew && "border-green-400 bg-green-50",
                    )}
                  >
                    <span className="truncate">{school.short_name || school.name}</span>
                    {isNew ? <span className="text-[9px] font-black uppercase text-green-700">{tr("new", "nouveau")}</span> : null}
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => toggle(school)}
                      className="rounded-full p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                      aria-label={tr(`Remove ${school.name}`, `Retirer ${school.name}`)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Button
        type="button"
        variant="outline"
        className="h-11 w-full justify-between rounded-xl"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="school-linker-panel"
        disabled={disabled}
      >
        <span className="flex items-center gap-2 text-sm font-bold">
          <Plus className="h-4 w-4" /> {tr("Add or remove schools", "Ajouter ou retirer des écoles")}
        </span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </Button>

      {open && (
        <div id="school-linker-panel" className="space-y-3 rounded-2xl border bg-white p-3 shadow-sm">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tr("Search by school name, code or town", "Rechercher par nom, code ou ville")}
              className="h-11 rounded-xl pl-9"
              aria-label={tr("Search schools", "Rechercher des écoles")}
              autoComplete="off"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <FilterSelect
              label={tr("Section", "Section")}
              value={category}
              onChange={setCategory}
              options={[
                [ALL, tr("All sections", "Toutes")],
                ["basic", categoryLabel("basic", tr)],
                ["secondary", categoryLabel("secondary", tr)],
                ["higher", categoryLabel("higher", tr)],
              ]}
            />
            <FilterSelect
              label={tr("Level", "Niveau")}
              value={level}
              onChange={setLevel}
              options={[
                [ALL, tr("All levels", "Tous")],
                ["nursery", tr("Nursery", "Maternelle")],
                ["primary", tr("Primary", "Primaire")],
                ["secondary", tr("Secondary", "Secondaire")],
                ["higher", tr("Higher", "Supérieur")],
              ]}
            />
            <FilterSelect
              label={tr("Type", "Type")}
              value={schoolType}
              onChange={setSchoolType}
              options={[
                [ALL, tr("All types", "Tous")],
                ["general", tr("General", "Général")],
                ["technical", tr("Technical", "Technique")],
                ["mixed", tr("Mixed", "Mixte")],
              ]}
            />
            <FilterSelect
              label={tr("Subsystem", "Sous-système")}
              value={subsystem}
              onChange={setSubsystem}
              options={[
                [ALL, tr("All subsystems", "Tous")],
                ["anglophone", "Anglophone"],
                ["francophone", "Francophone"],
                ["bilingual", tr("Bilingual", "Bilingue")],
              ]}
            />
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {picker.isFetching && !picker.data
                ? tr("Loading schools...", "Chargement des écoles...")
                : tr(`${results.length} school(s) shown`, `${results.length} école(s) affichée(s)`)}
            </span>
            {filtersActive && (
              <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={clearFilters}>
                <X className="h-3 w-3" /> {tr("Clear filters", "Effacer les filtres")}
              </Button>
            )}
          </div>

          <div className="max-h-[22rem] space-y-4 overflow-y-auto rounded-xl border bg-accent/10 p-2" role="group" aria-label={tr("Schools", "Écoles")}>
            {picker.isLoading ? (
              <div className="space-y-2" aria-busy="true">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 rounded-xl" />
                ))}
              </div>
            ) : picker.isError ? (
              <ErrorState
                message={getApiErrorMessage(picker.error, tr("The school list could not be loaded.", "La liste des écoles n'a pas pu être chargée."))}
                onRetry={() => picker.refetch()}
                retrying={picker.isFetching}
              />
            ) : results.length === 0 ? (
              <EmptyState
                title={tr("No school matches", "Aucune école ne correspond")}
                text={tr("Try another word or clear the filters.", "Essayez un autre mot ou effacez les filtres.")}
              />
            ) : (
              groups.map(([section, rows]) => {
                const selectedHere = rows.filter((row) => selected.has(row.id)).length;
                const allHere = selectedHere === rows.length;
                return (
                  <section key={section} aria-label={categoryLabel(section, tr)} className="space-y-1.5">
                    <div className="sticky top-0 z-[1] flex items-center justify-between gap-2 rounded-lg bg-white/95 px-2 py-1.5 backdrop-blur">
                      <div className="flex items-center gap-2">
                        <CategoryBadge category={section} />
                        <span className="text-[11px] font-semibold text-muted-foreground">
                          {selectedHere}/{rows.length}
                        </span>
                      </div>
                      <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => toggleGroup(rows)}>
                        {allHere ? tr("Unselect all shown", "Tout désélectionner") : tr("Select all shown", "Tout sélectionner")}
                      </Button>
                    </div>
                    <ul className="space-y-1.5">
                      {rows.map((row) => {
                        const checked = selected.has(row.id);
                        const labelId = `linker-${row.id}`;
                        return (
                          <li key={row.id}>
                            <label
                              htmlFor={labelId}
                              className={cn(
                                "flex cursor-pointer items-start gap-3 rounded-xl border bg-white p-3 transition-colors hover:border-primary/40",
                                checked && "border-primary bg-primary/5",
                              )}
                            >
                              <Checkbox id={labelId} checked={checked} onCheckedChange={() => toggle(row)} className="mt-0.5" />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-bold text-primary">{row.name}</span>
                                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                                  {[row.short_name, row.location].filter(Boolean).join(" - ")}
                                </span>
                                <span className="mt-1.5 flex flex-wrap gap-1">
                                  {row.school_type ? <SoftBadge>{row.school_type}</SoftBadge> : null}
                                  {row.subsystem ? <SoftBadge>{row.subsystem}</SoftBadge> : null}
                                  {row.status && row.status.toLowerCase() !== "active" ? <SoftBadge className="border-amber-300 text-amber-700">{row.status}</SoftBadge> : null}
                                  {row.proprietor_count > 0 && !row.linked ? (
                                    <SoftBadge className="border-sky-300 text-sky-700">
                                      {tr(`${row.proprietor_count} other owner(s)`, `${row.proprietor_count} autre(s) propriétaire(s)`)}
                                    </SoftBadge>
                                  ) : null}
                                </span>
                              </span>
                              {checked ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden /> : null}
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })
            )}
          </div>
        </div>
      )}

      {saveError ? (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">
          {saveError}
        </p>
      ) : null}

      <div className="sticky bottom-0 -mx-1 flex flex-col gap-2 bg-gradient-to-t from-white via-white to-white/0 px-1 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {dirty
            ? tr(`${added.length} to add, ${removed.length} to remove`, `${added.length} à ajouter, ${removed.length} à retirer`)
            : tr("No unsaved change.", "Aucune modification non enregistrée.")}
        </p>
        <div className="flex gap-2">
          {dirty && (
            <Button type="button" variant="ghost" onClick={() => setSelected(new Map(linked.map((s) => [s.id, s])))} disabled={saving}>
              {tr("Reset", "Annuler")}
            </Button>
          )}
          <Button type="button" className="h-11 flex-1 gap-2 rounded-xl font-black sm:flex-none" disabled={!dirty || saving || disabled} onClick={() => setConfirming(true)}>
            <Save className="h-4 w-4" /> {tr("Save schools", "Enregistrer les écoles")}
          </Button>
        </div>
      </div>

      <AlertDialog open={confirming} onOpenChange={(value) => !saving && setConfirming(value)}>
        <AlertDialogContent className="max-h-[90dvh] overflow-y-auto rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{tr("Confirm the linked schools", "Confirmer les écoles liées")}</AlertDialogTitle>
            <AlertDialogDescription>
              {tr(
                `${proprietorName} will see the statistics of exactly ${selected.size} school(s) after this change.`,
                `${proprietorName} verra les statistiques d'exactement ${selected.size} école(s) après ce changement.`,
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 text-sm">
            <ChangeList tone="add" title={tr("Will be added", "Seront ajoutées")} items={added.map((s) => s.name)} empty={tr("None", "Aucune")} />
            <ChangeList tone="remove" title={tr("Will be removed", "Seront retirées")} items={removed.map((s) => s.name)} empty={tr("None", "Aucune")} />
            {removed.length > 0 && (
              <p className="rounded-xl bg-amber-50 p-3 text-xs font-medium text-amber-800">
                {tr(
                  "He immediately loses access to the removed schools and to their administrators' accounts.",
                  "Il perd immédiatement l'accès aux écoles retirées et aux comptes de leurs administrateurs.",
                )}
              </p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>{tr("Cancel", "Annuler")}</AlertDialogCancel>
            <Button onClick={save} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {tr("Confirm and save", "Confirmer et enregistrer")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: [string, string][] }) {
  return (
    <div className="min-w-0 space-y-1">
      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-10 rounded-xl text-xs" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([val, text]) => (
            <SelectItem key={val} value={val}>
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ChangeList({ tone, title, items, empty }: { tone: "add" | "remove"; title: string; items: string[]; empty: string }) {
  return (
    <div className={cn("rounded-xl border p-3", tone === "add" ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50")}>
      <p className={cn("flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest", tone === "add" ? "text-green-700" : "text-red-700")}>
        {tone === "add" ? <Plus className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />} {title} ({items.length})
      </p>
      {items.length ? (
        <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm font-semibold text-primary">
          {items.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

export function LinkedBadge({ count }: { count: number }) {
  const tr = useTr();
  return (
    <Badge variant="secondary" className="px-2 text-[10px] font-bold">
      {tr(`${count} school(s)`, `${count} école(s)`)}
    </Badge>
  );
}
