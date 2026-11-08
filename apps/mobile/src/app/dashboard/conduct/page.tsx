"use client";

import { useEffect, useMemo, useState } from "react";
import { Award, Clock, Loader2, MessageSquareWarning, StickyNote, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getApiErrorMessage } from "@/lib/api/errors";
import type { ConductKind } from "@/lib/api/services/conduct.service";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { useEducationCategory } from "@/lib/hooks/useEducationCategory";
import { useMyTeachingClasses, useDailyRoster } from "@/lib/hooks/useAttendance";
import { useHierarchyClasses } from "@/lib/hooks/useSchools";
import { useAddConduct, useConductCounts, useConductEntries, useDeleteConduct, useLateToday } from "@/lib/hooks/useConduct";

function todayISO() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const KIND_STYLE: Record<ConductKind, string> = {
  warning: "bg-red-50 text-red-700 border-red-200",
  praise: "bg-emerald-50 text-emerald-700 border-emerald-200",
  note: "bg-slate-100 text-slate-700 border-slate-200",
  late: "bg-amber-50 text-amber-700 border-amber-200",
};

/** Class-teacher conduct log for basic schools: warning, praise, note, late today. */
export default function ConductPage() {
  const { user } = useAuth();
  const { language } = useI18n();
  const fr = language !== "en";
  const isBasic = useEducationCategory() === "basic";
  const isTeacher = user?.role === "TEACHER";
  const isStaffAdmin = user?.role === "SCHOOL_ADMIN" || user?.role === "SUB_ADMIN";
  const schoolId = typeof user?.school?.id === "string" ? user.school.id : "";

  const mine = useMyTeachingClasses(isBasic && isTeacher);
  const all = useHierarchyClasses({ school_id: schoolId }, isBasic && isStaffAdmin && Boolean(schoolId));
  const classes = useMemo(() => {
    const rows = isTeacher ? mine.data ?? [] : all.data ?? [];
    return rows.map((c) => ({ id: String(c.id), name: c.name }));
  }, [isTeacher, mine.data, all.data]);

  const [classId, setClassId] = useState("");
  const [pupilId, setPupilId] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setClassId((cur) => (cur && classes.some((c) => c.id === cur) ? cur : classes[0]?.id ?? ""));
  }, [classes]);
  useEffect(() => {
    setPupilId("");
    setNote("");
    setMessage(null);
  }, [classId]);

  const enabled = isBasic && (isTeacher || isStaffAdmin);
  const roster = useDailyRoster(classId, todayISO());
  const learners = roster.data?.learners ?? [];
  const counts = useConductCounts(classId, enabled);
  const entries = useConductEntries({ student: pupilId }, enabled && Boolean(pupilId));
  const add = useAddConduct();
  const late = useLateToday();
  const remove = useDeleteConduct();

  const pupil = learners.find((l) => l.student === pupilId);

  const L = {
    title: fr ? "Conduite" : "Conduct",
    intro: fr ? "Notez un avertissement, une félicitation ou un retard. Le total du trimestre apparaît sur le bulletin." : "Record a warning, praise or lateness. The term total appears on the report card.",
    cls: fr ? "Classe" : "Class",
    pick: fr ? "Choisissez un élève" : "Pick a pupil",
    warning: fr ? "Avertissement" : "Warning",
    praise: fr ? "Félicitation" : "Praise",
    noteBtn: fr ? "Note" : "Note",
    late: fr ? "En retard aujourd'hui" : "Late today",
    notePh: fr ? "Écrivez la note (obligatoire pour une note)" : "Write the note (required for a note)",
    recent: fr ? "Dernières entrées" : "Recent entries",
    none: fr ? "Aucune entrée pour cet élève." : "No entries for this pupil yet.",
    noPupils: fr ? "Aucun élève dans cette classe." : "No pupils in this class yet.",
    del: fr ? "Supprimer" : "Delete",
    saved: fr ? "Enregistré" : "Saved",
    kindLabel: { warning: fr ? "Avertissement" : "Warning", praise: fr ? "Félicitation" : "Praise", note: "Note", late: fr ? "Retard" : "Late" } as Record<ConductKind, string>,
  };

  const record = async (kind: ConductKind) => {
    if (!pupilId) return;
    setMessage(null);
    try {
      if (kind === "late") await late.mutateAsync(pupilId);
      else await add.mutateAsync({ student: pupilId, kind, note: note.trim() || undefined });
      setNote("");
      setMessage({ ok: true, text: L.saved });
    } catch (error) {
      setMessage({ ok: false, text: getApiErrorMessage(error) });
    }
  };

  const removeEntry = async (id: string) => {
    setMessage(null);
    try {
      await remove.mutateAsync(id);
    } catch (error) {
      setMessage({ ok: false, text: getApiErrorMessage(error) });
    }
  };

  if (!user) {
    return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary/30" /></div>;
  }
  if (!enabled) {
    return <p className="mx-auto max-w-3xl p-6 text-sm text-muted-foreground">{fr ? "La conduite est réservée au personnel des écoles de l'éducation de base." : "Conduct is available to staff of Basic Education schools."}</p>;
  }

  const busy = add.isPending || late.isPending;
  const buttons: { kind: ConductKind; label: string; icon: typeof Clock }[] = [
    { kind: "warning", label: L.warning, icon: MessageSquareWarning },
    { kind: "praise", label: L.praise, icon: Award },
    { kind: "note", label: L.noteBtn, icon: StickyNote },
    { kind: "late", label: L.late, icon: Clock },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-24">
      <div>
        <h1 className="text-3xl font-bold text-primary font-headline">{L.title}</h1>
        <p className="mt-1 text-muted-foreground">{L.intro}</p>
      </div>

      <div className="space-y-2 rounded-3xl border bg-white p-4 shadow-sm sm:p-6">
        <Label className="text-xs font-bold uppercase">{L.cls}</Label>
        <Select value={classId} onValueChange={setClassId} disabled={!classes.length}>
          <SelectTrigger className="h-12"><SelectValue placeholder={L.cls} /></SelectTrigger>
          <SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {roster.isLoading ? (
        <div className="flex min-h-[20vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary/30" /></div>
      ) : !learners.length ? (
        <p className="rounded-3xl border bg-white p-6 text-sm text-muted-foreground">{L.noPupils}</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {learners.map((l) => {
            const c = counts.data?.[l.student];
            return (
              <button
                key={l.student}
                type="button"
                onClick={() => { setPupilId(l.student); setMessage(null); }}
                className={`flex min-h-14 flex-col items-start justify-center rounded-2xl border bg-white p-3 text-left shadow-sm transition ${pupilId === l.student ? "border-primary ring-2 ring-primary/30" : "hover:border-primary/40"}`}
              >
                <span className="text-sm font-bold">{l.name}</span>
                {c && (c.late + c.warning + c.praise + c.note > 0) && (
                  <span className="mt-1 flex flex-wrap gap-1 text-xs">
                    {(["late", "warning", "praise", "note"] as ConductKind[]).filter((k) => c[k] > 0).map((k) => (
                      <span key={k} className={`rounded-full border px-2 py-0.5 ${KIND_STYLE[k]}`}>{c[k]} {L.kindLabel[k].toLowerCase()}</span>
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {pupil && (
        <div className="space-y-4 rounded-3xl border bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-xl font-bold">{pupil.name}</h2>
          <Textarea rows={2} maxLength={200} placeholder={L.notePh} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {buttons.map(({ kind, label, icon: Icon }) => (
              <Button
                key={kind}
                type="button"
                variant="outline"
                disabled={busy || (kind === "note" && !note.trim())}
                onClick={() => record(kind)}
                className={`h-16 flex-col gap-1 rounded-2xl border text-sm font-bold ${KIND_STYLE[kind]}`}
              >
                <Icon className="h-5 w-5" />
                {label}
              </Button>
            ))}
          </div>
          {message && <p className={`text-sm ${message.ok ? "text-emerald-700" : "text-destructive"}`}>{message.text}</p>}

          <div>
            <h3 className="mb-2 text-sm font-bold uppercase text-muted-foreground">{L.recent}</h3>
            {entries.isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-primary/30" />
            ) : !(entries.data ?? []).length ? (
              <p className="text-sm text-muted-foreground">{L.none}</p>
            ) : (
              <ul className="divide-y rounded-2xl border">
                {(entries.data ?? []).slice(0, 15).map((e) => (
                  <li key={e.id} className="flex items-center gap-3 p-3">
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${KIND_STYLE[e.kind]}`}>{L.kindLabel[e.kind]}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{e.note || "-"}</p>
                      <p className="text-xs text-muted-foreground">{e.date}{e.recorded_by_name ? ` · ${e.recorded_by_name}` : ""}</p>
                    </div>
                    {(e.is_mine || isStaffAdmin) && (
                      <Button type="button" variant="ghost" size="icon" aria-label={L.del} title={L.del} disabled={remove.isPending} onClick={() => removeEntry(e.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
