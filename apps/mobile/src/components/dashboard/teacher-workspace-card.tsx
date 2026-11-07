"use client";

/**
 * On the principal's profile: switch to their teacher account. First time it
 * asks them to set up what they teach (class-subjects) and which classes they
 * are class master of; after that the switch is instant, no password.
 */

import { useState } from "react";
import { GraduationCap, Loader2 } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  getTeacherWorkspace,
  setupTeacherWorkspace,
  switchToTeacher,
  type TeacherWorkspaceState,
} from "@/lib/teacher-workspace";

export function TeacherWorkspaceCard() {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [state, setState] = useState<TeacherWorkspaceState | null>(null);
  const [subjectIds, setSubjectIds] = useState<Set<string>>(new Set());
  const [masterIds, setMasterIds] = useState<Set<string>>(new Set());

  const openSetup = async () => {
    setBusy(true);
    try {
      const data = await getTeacherWorkspace();
      setState(data);
      const chosen = new Set<string>();
      const masters = new Set<string>();
      data.classes.forEach((c) => {
        if (c.is_class_master) masters.add(c.id);
        c.subjects.forEach((s) => s.mine && chosen.add(s.class_subject_id));
      });
      setSubjectIds(chosen);
      setMasterIds(masters);
      setSetupOpen(true);
    } catch {
      toast({ variant: "destructive", title: "Could not load your classes. Please try again." });
    } finally {
      setBusy(false);
    }
  };

  const handleSwitch = async () => {
    setBusy(true);
    try {
      await switchToTeacher();
    } catch (error: any) {
      setBusy(false);
      if (error?.response?.data?.needs_setup) {
        openSetup();
        return;
      }
      toast({ variant: "destructive", title: "Could not switch", description: error?.response?.data?.detail || "Please try again." });
    }
  };

  const onPrimary = async () => {
    // If a teacher account already exists, switch straight in; otherwise set up.
    setBusy(true);
    try {
      const data = await getTeacherWorkspace();
      setBusy(false);
      if (data.enabled) {
        handleSwitch();
      } else {
        setState(data);
        setSubjectIds(new Set());
        setMasterIds(new Set());
        setSetupOpen(true);
      }
    } catch {
      setBusy(false);
      toast({ variant: "destructive", title: "Could not open the teacher workspace." });
    }
  };

  const toggle = (set: Set<string>, id: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    setter(next);
  };

  const saveSetup = async () => {
    setBusy(true);
    try {
      await setupTeacherWorkspace({
        class_subject_ids: Array.from(subjectIds),
        class_master_ids: Array.from(masterIds),
      });
      toast({ title: "Teacher account ready", description: "Switching you in now." });
      setSetupOpen(false);
      await switchToTeacher();
    } catch (error: any) {
      setBusy(false);
      toast({ variant: "destructive", title: "Setup failed", description: error?.response?.data?.detail || "Please try again." });
    }
  };

  return (
    <>
      <Card className="border-none shadow-sm bg-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-primary">
            <GraduationCap className="h-5 w-5" /> Teacher Account
          </CardTitle>
          <CardDescription>
            Switch to your own teacher account to teach classes, enter marks and run lessons. It is kept
            separate from your admin account, so nothing is mixed. You can switch back anytime.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={onPrimary} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GraduationCap className="mr-2 h-4 w-4" />}
            Switch to Teacher account
          </Button>
        </CardContent>
      </Card>

      <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Set up your teacher account</DialogTitle>
            <DialogDescription>
              Choose the subjects you teach and the classes you are class master of. You can change this
              later from your profile.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {state?.classes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No classes or subjects have been set up for your school yet. Create them first under
                Hierarchy &amp; Sections, then come back here.
              </p>
            ) : (
              state?.classes.map((c) => (
                <div key={c.id} className="rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-foreground">{c.name}</p>
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={masterIds.has(c.id)}
                        onChange={() => toggle(masterIds, c.id, setMasterIds)}
                      />
                      Class master
                    </label>
                  </div>
                  {c.subjects.length > 0 ? (
                    <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                      {c.subjects.map((s) => (
                        <label key={s.class_subject_id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={subjectIds.has(s.class_subject_id)}
                            onChange={() => toggle(subjectIds, s.class_subject_id, setSubjectIds)}
                          />
                          <span>
                            {s.subject_name}
                            {s.teacher_name && !s.mine ? (
                              <span className="ml-1 text-[11px] text-muted-foreground">(now: {s.teacher_name})</span>
                            ) : null}
                          </span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">No subjects in this class yet.</p>
                  )}
                </div>
              ))
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSetupOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={saveSetup} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save &amp; switch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
