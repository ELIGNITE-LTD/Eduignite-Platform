"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { schoolsService } from "@/lib/api/services/schools.service";
import { basicPromotionService, type MoveResult } from "@/lib/api/services/basic-promotion.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import type { HierarchyClass } from "@/lib/api/types";

/**
 * "Move pupils": pick a class, tick the pupils, choose the class they go to. Any class of the
 * school can be chosen; moving to a class of another level asks for one more confirmation.
 */
export function BasicMovePupils() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { language } = useI18n();
  const en = language === "en";
  const queryClient = useQueryClient();
  const schoolId = user?.school?.id || "";

  const [fromClass, setFromClass] = useState("");
  const [toClass, setToClass] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [warning, setWarning] = useState<MoveResult | null>(null);

  const classesQ = useQuery({ queryKey: ["school-classes", schoolId], enabled: Boolean(schoolId), queryFn: () => schoolsService.getSchoolClasses(schoolId) });
  const classes = useMemo(() => (Array.isArray(classesQ.data) ? (classesQ.data as HierarchyClass[]) : []), [classesQ.data]);
  const pupilsQ = useQuery({
    queryKey: ["student-picker-move", fromClass],
    enabled: Boolean(fromClass),
    queryFn: () => basicPromotionService.pupilsOfClass(fromClass),
  });
  const pupils = useMemo(() => pupilsQ.data ?? [], [pupilsQ.data]);

  useEffect(() => setPicked([]), [fromClass]);

  const allSelected = pupils.length > 0 && picked.length === pupils.length;
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const target = classes.find((c) => c.id === toClass);

  const submit = async (acknowledge: boolean) => {
    setBusy(true);
    try {
      const result = await basicPromotionService.movePupils(picked, toClass, acknowledge);
      if (result.requires_confirmation) {
        setWarning(result);
        return;
      }
      setWarning(null);
      toast({ title: en ? "Pupils moved" : "Eleves deplaces", description: en ? `${result.moved} pupil(s) moved to ${target?.name ?? ""}.` : `${result.moved} eleve(s) deplace(s) vers ${target?.name ?? ""}.` });
      setPicked([]);
      await queryClient.invalidateQueries({ queryKey: ["student-picker-move"] });
      await queryClient.invalidateQueries({ queryKey: ["school-classes"] });
    } catch (error) {
      toast({ variant: "destructive", title: en ? "Move failed" : "Deplacement impossible", description: getApiErrorMessage(error, "") });
    } finally {
      setBusy(false);
    }
  };

  const classSelect = (value: string, onChange: (v: string) => void, placeholder: string, exclude?: string) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {classes.filter((c) => c.id !== exclude).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-4">
      <Card className="rounded-3xl border-none shadow-sm">
        <CardContent className="space-y-4 p-5">
          <p className="text-sm text-muted-foreground">
            {en ? "Choose the class the pupils are in now, tick the pupils to move, then choose their new class. Matricules and marks history are kept." : "Choisissez la classe actuelle, cochez les eleves a deplacer, puis choisissez leur nouvelle classe. Les matricules et l'historique sont conserves."}
          </p>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
            <div className="space-y-2"><Label className="font-bold">{en ? "From class" : "Classe actuelle"}</Label>{classSelect(fromClass, setFromClass, en ? "Choose a class" : "Choisir une classe")}</div>
            <ArrowRight className="hidden h-5 w-5 self-center text-primary sm:block" />
            <div className="space-y-2"><Label className="font-bold">{en ? "To class" : "Nouvelle classe"}</Label>{classSelect(toClass, setToClass, en ? "Choose a class" : "Choisir une classe", fromClass)}</div>
          </div>
        </CardContent>
      </Card>

      {fromClass ? (
        <Card className="rounded-3xl border-none shadow-sm">
          <CardContent className="space-y-3 p-5">
            {pupilsQ.isLoading ? <Loader2 className="h-6 w-6 animate-spin text-primary/40" /> : null}
            {!pupilsQ.isLoading && pupils.length === 0 ? <p className="text-sm text-muted-foreground">{en ? "No pupil in this class." : "Aucun eleve dans cette classe."}</p> : null}
            {pupils.length > 0 ? (
              <>
                <label className="flex items-center gap-3 rounded-xl bg-primary/5 p-3 text-sm font-bold text-primary">
                  <Checkbox checked={allSelected} onCheckedChange={(v) => setPicked(v ? pupils.map((p) => p.id) : [])} />
                  {en ? "Select all" : "Tout selectionner"} ({pupils.length})
                </label>
                <ul className="divide-y divide-primary/5">
                  {pupils.map((p) => (
                    <li key={p.id}>
                      <label className="flex cursor-pointer items-center gap-3 py-2.5">
                        <Checkbox checked={picked.includes(p.id)} onCheckedChange={() => toggle(p.id)} />
                        <span className="font-semibold">{p.full_name}</span>
                        <span className="text-xs text-muted-foreground">{p.admission_number}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            <Button
              disabled={busy || picked.length === 0 || !toClass}
              onClick={() => void submit(false)}
              className="h-12 w-full gap-2 rounded-2xl text-base font-bold"
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Users className="h-5 w-5" />}
              {en ? `Move ${picked.length} pupil(s)` : `Deplacer ${picked.length} eleve(s)`}{target ? ` -> ${target.name}` : ""}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={Boolean(warning)} onOpenChange={(o) => !o && setWarning(null)}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-primary">{en ? "This changes the level" : "Cela change de niveau"}</DialogTitle>
            <DialogDescription>
              {en ? `${warning?.crossing?.length ?? 0} pupil(s) would go from another level into ${warning?.target_class?.name ?? ""}. Are you sure?` : `${warning?.crossing?.length ?? 0} eleve(s) passeraient d'un autre niveau a ${warning?.target_class?.name ?? ""}. Etes-vous sur ?`}
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-40 overflow-y-auto text-sm">{warning?.crossing?.map((c) => <li key={c.student}>{c.name} ({c.from_class})</li>)}</ul>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setWarning(null)}>{en ? "Cancel" : "Annuler"}</Button>
            <Button disabled={busy} className="flex-1 rounded-xl" onClick={() => void submit(true)}>{en ? "Yes, move them" : "Oui, deplacer"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
