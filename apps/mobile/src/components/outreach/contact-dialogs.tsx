"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api/errors";
import {
  outreachService,
  type OutreachContact,
  type OutreachContactInput,
  type OutreachImportResult,
  type OutreachLevel,
  type OutreachRegion,
} from "@/lib/api/services/outreach.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/lib/i18n-context";
import { useTr } from "@/components/school-website/shared";
import { LEVELS, REGION_FR, REGION_VALUES } from "./shared";

const EMPTY: OutreachContactInput = {
  school_name: "", email: "", level: "secondary", region: "unknown", town: "", phone: "", website: "",
};

/** Add a school, or edit one when `contact` is given. */
export function ContactDialog({
  open,
  contact,
  onClose,
  onSaved,
}: {
  open: boolean;
  contact: OutreachContact | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const tr = useTr();
  const { language } = useI18n();
  const { toast } = useToast();
  const [form, setForm] = useState<OutreachContactInput>(EMPTY);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setForm(
      contact
        ? {
            school_name: contact.school_name, email: contact.email, level: contact.level, region: contact.region,
            town: contact.town, phone: contact.phone, website: contact.website,
          }
        : EMPTY,
    );
  }, [open, contact]);

  const save = useMutation({
    mutationFn: () => (contact ? outreachService.updateContact(contact.id, form) : outreachService.createContact(form)),
    onSuccess: () => {
      toast({ title: tr("Saved", "Enregistre") });
      onSaved();
      onClose();
    },
    onError: (e) => setError(getApiErrorMessage(e, tr("Could not save this school.", "Impossible d'enregistrer cette ecole."))),
  });

  const set = (patch: Partial<OutreachContactInput>) => setForm((f) => ({ ...f, ...patch }));
  const valid = form.school_name.trim() !== "" && form.email.trim() !== "";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{contact ? tr("Edit school", "Modifier l'ecole") : tr("Add a school", "Ajouter une ecole")}</DialogTitle>
          <DialogDescription>{tr("Only the name and the email are required.", "Seuls le nom et l'email sont obligatoires.")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="oc-name">{tr("School name", "Nom de l'ecole")}</Label>
            <Input id="oc-name" value={form.school_name} onChange={(e) => set({ school_name: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="oc-email">Email</Label>
            <Input id="oc-email" type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>{tr("Level", "Niveau")}</Label>
              <Select value={form.level} onValueChange={(v) => set({ level: v as OutreachLevel })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEVELS.map((l) => (
                    <SelectItem key={l.value} value={l.value}>{tr(l.en, l.fr)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>{tr("Region", "Region")}</Label>
              <Select value={form.region} onValueChange={(v) => set({ region: v as OutreachRegion })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REGION_VALUES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {language === "fr" ? REGION_FR[r] : r.replace("_", "-").replace(/^./, (c) => c.toUpperCase())}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="oc-town">{tr("Town", "Ville")}</Label>
              <Input id="oc-town" value={form.town} onChange={(e) => set({ town: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="oc-phone">{tr("Phone", "Telephone")}</Label>
              <Input id="oc-phone" value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="oc-web">{tr("Website", "Site web")}</Label>
            <Input id="oc-web" value={form.website} onChange={(e) => set({ website: e.target.value })} />
          </div>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={onClose}>{tr("Cancel", "Annuler")}</Button>
          <Button disabled={!valid || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {tr("Save", "Enregistrer")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Upload a CSV of schools and show what happened. */
export function ImportDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const tr = useTr();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<OutreachImportResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setFile(null);
      setResult(null);
      setError("");
    }
  }, [open]);

  const upload = useMutation({
    mutationFn: () => outreachService.importCsv(file as File),
    onSuccess: (r) => {
      setResult(r);
      onDone();
    },
    onError: (e) => setError(getApiErrorMessage(e, tr("The import failed.", "L'import a echoue."))),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{tr("Import schools from a CSV file", "Importer des ecoles depuis un fichier CSV")}</DialogTitle>
          <DialogDescription>
            {tr("Columns:", "Colonnes :")} school_name, email, level, region, town, phone, website, source_url.{" "}
            {tr("Schools already in the list are updated, not duplicated.", "Les ecoles deja presentes sont mises a jour, pas dupliquees.")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center text-sm text-muted-foreground transition hover:bg-muted/40">
            <Upload className="h-6 w-6" />
            <span>{file ? file.name : tr("Choose a CSV file", "Choisir un fichier CSV")}</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setResult(null);
                setError("");
              }}
            />
          </label>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          {result ? (
            <div className="space-y-2 rounded-xl bg-muted/50 p-4 text-sm" aria-live="polite">
              <p className="font-medium">
                {tr(
                  `${result.created} added, ${result.updated} updated, ${result.skipped} skipped.`,
                  `${result.created} ajoutees, ${result.updated} mises a jour, ${result.skipped} ignorees.`,
                )}
              </p>
              {result.errors?.length ? (
                <ul className="space-y-1 text-muted-foreground">
                  {result.errors.slice(0, 5).map((er, i) => (
                    <li key={i}>{tr("Row", "Ligne")} {er.row}: {er.reason}</li>
                  ))}
                  {result.errors.length > 5 ? <li>{tr("And more...", "Et d'autres...")}</li> : null}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={onClose}>{result ? tr("Close", "Fermer") : tr("Cancel", "Annuler")}</Button>
          {!result ? (
            <Button disabled={!file || upload.isPending} onClick={() => upload.mutate()}>
              {upload.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {tr("Import", "Importer")}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
