"use client";

import { useEffect, useMemo, useState } from "react";
import { Award, Download, Eye, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api/errors";
import { downloadHtmlPagesPdf } from "@/lib/browser-download";
import { useEducationCategory } from "@/lib/hooks/useEducationCategory";
import { useMyTeachingClasses } from "@/lib/hooks/useAttendance";
import { useHierarchyClasses } from "@/lib/hooks/useSchools";
import { useCertificates, useDeleteCertificate, useIssueCertificate, usePupils } from "@/lib/hooks/useSchoolLife";
import { buildPupilCertificateHtml, certificateTitle } from "@/lib/school-life-certificate";
import type { CertificateKind, PupilCertificate } from "@/lib/api/services/school-life.service";

const KINDS: CertificateKind[] = ["merit", "attendance", "conduct", "completion", "enrolment"];

/** Certificates (merit, attendance, conduct, completion, enrolment) for basic-school pupils. */
export default function CertificatesPage() {
  const { user } = useAuth();
  const { language } = useI18n();
  const { toast } = useToast();
  const fr = language === "fr";
  const t = (en: string, frText: string) => (fr ? frText : en);
  const isBasic = useEducationCategory() === "basic";
  const role = user?.role;
  const isTeacher = role === "TEACHER";
  const isAdmin = role === "SCHOOL_ADMIN" || role === "SUB_ADMIN";
  const isParent = role === "PARENT";
  const allowed = isBasic && (isTeacher || isAdmin || isParent);
  const canEdit = isTeacher || isAdmin;
  const schoolId = typeof user?.school?.id === "string" ? user.school.id : "";

  const mine = useMyTeachingClasses(allowed && isTeacher);
  const all = useHierarchyClasses({ school_id: schoolId }, allowed && isAdmin && Boolean(schoolId));
  const classes = useMemo(
    () => (isTeacher ? mine.data ?? [] : isAdmin ? all.data ?? [] : []).map((c: any) => ({ id: String(c.id), name: String(c.name) })),
    [isTeacher, isAdmin, mine.data, all.data],
  );
  const [classId, setClassId] = useState("");
  useEffect(() => {
    if (!isParent) setClassId((cur) => (cur && classes.some((c) => c.id === cur) ? cur : classes[0]?.id ?? ""));
  }, [classes, isParent]);

  const certs = useCertificates(classId, allowed && (isParent || Boolean(classId)));
  const remove = useDeleteCertificate();
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<PupilCertificate | null>(null);

  const html = (c: PupilCertificate) => buildPupilCertificateHtml(c, user?.school, { fr });
  const download = async (c: PupilCertificate) => {
    try {
      await downloadHtmlPagesPdf([html(c)], `${certificateTitle(c.kind)} - ${c.student_name} - ${c.number}`.replace(/[^\w\- ]+/g, ""), { landscape: true });
    } catch (e) {
      toast({ variant: "destructive", title: t("Could not create the PDF", "Échec de création du PDF"), description: getApiErrorMessage(e) });
    }
  };

  if (!user) {
    return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary/30" /></div>;
  }
  if (!allowed) {
    return (
      <p className="mx-auto max-w-3xl p-6 text-sm text-muted-foreground">
        {t("Certificates are available in Basic Education schools.", "Les certificats sont disponibles dans les écoles de base.")}
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-24">
      <div>
        <h1 className="flex items-center gap-3 text-3xl font-bold text-primary font-headline">
          <div className="rounded-xl bg-primary p-2 text-secondary shadow-lg"><Award className="h-6 w-6" /></div>
          {t("Certificates", "Certificats")}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {canEdit
            ? t("Give a pupil a merit, attendance, conduct, completion or enrolment certificate, then print it.",
                "Remettez un certificat de mérite, d'assiduité, de conduite, de fin d'études ou de scolarité, puis imprimez-le.")
            : t("Certificates awarded to your child.", "Certificats remis à votre enfant.")}
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        {!isParent && (
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger className="h-12 sm:w-64"><SelectValue placeholder={t("Choose a class", "Choisir une classe")} /></SelectTrigger>
            <SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        )}
        {canEdit && (
          <Button className="h-12 flex-1 text-base sm:flex-none" onClick={() => setCreating(true)} disabled={!classId}>
            <Plus className="mr-2 h-5 w-5" /> {t("New certificate", "Nouveau certificat")}
          </Button>
        )}
      </div>

      {certs.isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-7 w-7 animate-spin text-primary/40" /></div>
      ) : (certs.data ?? []).length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">{t("No certificates yet.", "Aucun certificat pour le moment.")}</p>
      ) : (
        <ul className="space-y-2">
          {(certs.data ?? []).map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 shadow-sm">
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold">{c.student_name}</p>
                <p className="truncate text-sm text-muted-foreground">{certificateTitle(c.kind, fr)} · {c.class_name} · {c.issued_on} · {c.number}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" size="icon" className="h-11 w-11" aria-label="view" onClick={() => setViewing(c)}><Eye className="h-4 w-4" /></Button>
                <Button variant="outline" size="icon" className="h-11 w-11" aria-label="download" onClick={() => download(c)}><Download className="h-4 w-4" /></Button>
                {canEdit && (
                  <Button
                    variant="ghost" size="icon" className="h-11 w-11" aria-label="delete"
                    onClick={() => { if (window.confirm(t("Delete this certificate?", "Supprimer ce certificat ?"))) remove.mutate(c.id); }}
                  ><Trash2 className="h-4 w-4 text-red-600" /></Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={Boolean(viewing)} onOpenChange={(v) => !v && setViewing(null)}>
        <DialogContent className="max-h-[92vh] max-w-[1200px] overflow-auto">
          <DialogHeader><DialogTitle>{viewing ? certificateTitle(viewing.kind, fr) : ""}</DialogTitle></DialogHeader>
          {viewing && (
            <>
              <div dangerouslySetInnerHTML={{ __html: html(viewing) }} />
              <Button className="h-12" onClick={() => download(viewing)}><Download className="mr-2 h-4 w-4" /> {t("Download PDF to print", "Télécharger le PDF à imprimer")}</Button>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle>{t("New certificate", "Nouveau certificat")}</DialogTitle></DialogHeader>
          {creating && (
            <NewCertificate
              classId={classId}
              t={t}
              fr={fr}
              onDone={(c) => { setCreating(false); setViewing(c); }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NewCertificate({ classId, t, fr, onDone }: { classId: string; t: (en: string, fr: string) => string; fr: boolean; onDone: (c: PupilCertificate) => void }) {
  const { toast } = useToast();
  const pupils = usePupils(classId);
  const issue = useIssueCertificate();
  const [student, setStudent] = useState("");
  const [kind, setKind] = useState<CertificateKind>("merit");
  const [remark, setRemark] = useState("");
  const [year, setYear] = useState("");

  const submit = async () => {
    if (!student) return;
    try {
      const created = await issue.mutateAsync({ student, kind, remark: remark.trim(), academic_year: year.trim() });
      toast({ title: t("Certificate created", "Certificat créé"), description: created.number });
      onDone(created);
    } catch (e) {
      toast({ variant: "destructive", title: t("Could not create", "Échec de la création"), description: getApiErrorMessage(e) });
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>{t("Pupil", "Élève")}</Label>
        <Select value={student} onValueChange={setStudent}>
          <SelectTrigger className="h-12"><SelectValue placeholder={pupils.isLoading ? "..." : t("Choose a pupil", "Choisir un élève")} /></SelectTrigger>
          <SelectContent>{(pupils.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div>
        <Label>{t("Certificate", "Certificat")}</Label>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {KINDS.map((k) => (
            <Button key={k} type="button" variant={kind === k ? "default" : "outline"} className="h-auto min-h-12 whitespace-normal py-2" onClick={() => setKind(k)}>
              {certificateTitle(k, fr).replace(/^(Certificate of|Certificat (de|d'))\s*/i, "")}
            </Button>
          ))}
        </div>
      </div>
      <div>
        <Label>{t("Academic year (optional)", "Année scolaire (facultatif)")}</Label>
        <input className="h-11 w-full rounded-md border bg-background px-3 text-sm" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2026-2027" maxLength={20} />
      </div>
      <div>
        <Label>{t("Message (optional)", "Message (facultatif)")}</Label>
        <Textarea rows={3} value={remark} onChange={(e) => setRemark(e.target.value)} placeholder={t("e.g. For outstanding progress in reading", "ex. Pour ses progrès remarquables en lecture")} />
      </div>
      <Button className="h-12 w-full text-base" onClick={submit} disabled={!student || issue.isPending}>
        {issue.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {t("Create certificate", "Créer le certificat")}
      </Button>
    </div>
  );
}
