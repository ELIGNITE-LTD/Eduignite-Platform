"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api/errors";
import { leadershipService, type LeadershipEntry, type LeadershipInput } from "@/lib/api/services/leadership.service";
import { dateToMonth, describePeriod, monthToEndDate, monthToStartDate } from "@/lib/leadership-dates";

interface Form { person_name: string; title: string; department: string; status: "current" | "former"; start: string; end: string; note: string }
const EMPTY: Form = { person_name: "", title: "", department: "", status: "current", start: "", end: "", note: "" };

const toForm = (e: LeadershipEntry): Form => ({
  person_name: e.person_name, title: e.title, department: e.department, status: e.is_current ? "current" : "former",
  start: dateToMonth(e.start_date), end: dateToMonth(e.end_date), note: e.note,
});

const toInput = (f: Form): LeadershipInput => ({
  person_name: f.person_name.trim(), title: f.title.trim(), department: f.department.trim(), note: f.note.trim(),
  is_current: f.status === "current", start_date: monthToStartDate(f.start),
  end_date: f.status === "former" ? monthToEndDate(f.end) : null,
});

/** The CEO and CTO keep EduIgnite's leadership here. The EduIgnite AI answers questions about it from this list only. */
export function LeadershipMemoryCard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["leadership"], queryFn: () => leadershipService.list() });
  const [editing, setEditing] = useState<LeadershipEntry | "new" | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [deleting, setDeleting] = useState<LeadershipEntry | null>(null);

  const open = (entry: LeadershipEntry | "new") => { setEditing(entry); setForm(entry === "new" ? EMPTY : toForm(entry)); };
  const refresh = () => qc.invalidateQueries({ queryKey: ["leadership"] });
  const fail = (title: string) => (e: unknown) => toast({ variant: "destructive", title, description: getApiErrorMessage(e) });

  const save = useMutation({
    mutationFn: () => (editing && editing !== "new" ? leadershipService.update(editing.id, toInput(form)) : leadershipService.create(toInput(form))),
    onSuccess: () => { setEditing(null); refresh(); toast({ title: "Saved", description: "The EduIgnite AI now knows this." }); },
    onError: fail("Not saved"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => leadershipService.remove(id),
    onSuccess: () => { setDeleting(null); refresh(); toast({ title: "Deleted", description: "The EduIgnite AI no longer knows this." }); },
    onError: fail("Not deleted"),
  });

  const rows = list.data ?? [];
  const current = rows.filter((r) => r.is_current);
  const former = rows.filter((r) => !r.is_current);
  const canSave = form.person_name.trim() !== "" && form.title.trim() !== "";

  const Row = ({ e }: { e: LeadershipEntry }) => (
    <li className="flex items-start justify-between gap-3 rounded-xl border bg-background p-3">
      <div className="min-w-0">
        <p className="font-semibold">{e.person_name}</p>
        <p className="text-sm text-muted-foreground">{[e.title, e.department].filter(Boolean).join(" · ")}</p>
        <p className="text-xs text-muted-foreground">{describePeriod(e)}{e.note ? ` · ${e.note}` : ""}</p>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button size="icon" variant="ghost" aria-label="Edit" onClick={() => open(e)}><Pencil className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" aria-label="Delete" className="text-destructive" onClick={() => setDeleting(e)}><Trash2 className="h-4 w-4" /></Button>
      </div>
    </li>
  );

  return (
    <Card className="border-none shadow-sm">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><Bot className="h-5 w-5 text-secondary" />EduIgnite leadership (what the AI knows)</CardTitle>
          <CardDescription className="mt-1 max-w-2xl">
            The EduIgnite AI answers questions about who leads EduIgnite, who left and who was promoted from this list only.
            Add each position a person held, current or past. Delete anything wrong and the AI forgets it. For a promotion,
            add the new position as current and mark the old one as former with its end month.
          </CardDescription>
        </div>
        <Button onClick={() => open("new")} className="gap-2"><Plus className="h-4 w-4" />Add</Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {list.isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : list.isError ? (
          <p className="text-sm text-destructive">{getApiErrorMessage(list.error)}</p>
        ) : rows.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nothing recorded yet, so the AI says it has no record of EduIgnite's leadership. Press Add to start.
          </p>
        ) : (
          <>
            <section className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-primary/70">Current <Badge variant="secondary">{current.length}</Badge></h3>
              {current.length ? <ul className="space-y-2">{current.map((e) => <Row key={e.id} e={e} />)}</ul> : <p className="text-sm text-muted-foreground">Nobody marked as current.</p>}
            </section>
            <section className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-primary/70">Former <Badge variant="secondary">{former.length}</Badge></h3>
              {former.length ? <ul className="space-y-2">{former.map((e) => <Row key={e.id} e={e} />)}</ul> : <p className="text-sm text-muted-foreground">No former leaders recorded.</p>}
            </section>
          </>
        )}
      </CardContent>

      <Dialog open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{editing === "new" ? "Add a leadership record" : "Edit record"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label htmlFor="lm-name">Full name *</Label>
              <Input id="lm-name" value={form.person_name} maxLength={200} onChange={(e) => setForm({ ...form, person_name: e.target.value })} /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="lm-title">Title *</Label>
                <Input id="lm-title" value={form.title} maxLength={160} placeholder="e.g. Director, CEO" onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="lm-dept">Department (optional)</Label>
                <Input id="lm-dept" value={form.department} maxLength={160} onChange={(e) => setForm({ ...form, department: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Form["status"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="current">Current: still in this position</SelectItem>
                  <SelectItem value="former">Former: no longer in this position</SelectItem>
                </SelectContent>
              </Select></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="lm-start">Started (month)</Label>
                <Input id="lm-start" type="month" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></div>
              {form.status === "former" ? (
                <div className="space-y-1.5"><Label htmlFor="lm-end">Ended (month)</Label>
                  <Input id="lm-end" type="month" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></div>
              ) : null}
            </div>
            <div className="space-y-1.5"><Label htmlFor="lm-note">Short note (optional)</Label>
              <Input id="lm-note" value={form.note} maxLength={300} placeholder="e.g. Promoted from Operations" onChange={(e) => setForm({ ...form, note: e.target.value })} />
              <p className="text-xs text-muted-foreground">The AI may repeat this note. Do not put contact details, shares or reasons for leaving here.</p></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button disabled={!canSave || save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleting !== null} onOpenChange={(o) => { if (!o) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this record?</AlertDialogTitle>
            <AlertDialogDescription>{deleting ? `${deleting.person_name}: ${deleting.title}. The EduIgnite AI will no longer know it.` : ""}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); if (deleting) remove.mutate(deleting.id); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
