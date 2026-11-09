"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiClient, BASE_URL, getAccessToken } from "@/lib/api/client";
import { getApiErrorMessage } from "@/lib/api/errors";
import { RELATIONSHIP_LABELS, STATUS_LABELS } from "@/lib/admissions";
import { downloadBlob } from "@/lib/browser-download";
import { downloadServerFile, isNativeApp } from "@/lib/native-download";

/**
 * Shared admissions panels, used by /dashboard/admissions and by the
 * Enrollment tab of the school website manager. Only the school administration
 * reaches them (the server enforces it). Applications are children's records:
 * nothing is cached locally.
 */

type Summary = {
  id: string; reference: string; status: string; student_full_name: string; class_applied_name: string;
  guardian_name: string; guardian_phone: string; guardian_email: string; created_at: string; documents_count: number | null;
};
type Detail = Summary & {
  student_dob: string | null; student_gender: string; previous_school: string; guardian_relationship: string;
  guardian_address: string; message: string; language: string; internal_notes: string; handled_by: string;
  enrolled_student_id: string | null; intake_year: string;
  documents: { id: string; doc_type: string; name: string; size: number }[];
  audit: { action: string; from_status: string; to_status: string; actor: string; at: string }[];
  possible_duplicates: { id: string; name: string; class_name: string }[];
};
type Settings = {
  opens_on: string | null; closes_on: string | null; intake_year: string; classes_offered: string[];
  field_config: Record<string, "required" | "optional" | "hidden">; allowed_document_types: string[];
  max_document_mb: number; max_documents: number; consent_text_en: string; consent_text_fr: string;
  notification_email: string; auto_reply_en: string; auto_reply_fr: string; enrollment_enabled: boolean;
  publication_status: string; window_state: string; slug: string;
  available_classes: { id: string; name: string; group: string; level?: string }[];
};

const STATUSES = ["new", "under_review", "accepted", "waitlisted", "rejected"];
const FIELD_LABELS: Record<string, [string, string]> = {
  student_dob: ["Date of birth", "Date de naissance"], student_gender: ["Gender", "Sexe"],
  previous_school: ["Previous school", "École précédente"], class_applied: ["Class applied for", "Classe demandée"],
  guardian_relationship: ["Relationship", "Lien de parenté"], guardian_phone: ["Guardian phone", "Téléphone du tuteur"],
  guardian_email: ["Guardian email", "Email du tuteur"], guardian_address: ["Address", "Adresse"],
  message: ["Additional message", "Message complémentaire"],
};
const SELECT = "h-10 rounded-md border border-input bg-background px-3 text-sm";

export function ApplicationsPanel({ fr }: { fr: boolean }) {
  const L = (en: string, frText: string) => (fr ? frText : en);
  const { toast } = useToast();
  const [rows, setRows] = useState<Summary[]>([]);
  const [count, setCount] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ status: "", q: "", date_from: "", date_to: "" });
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const pageSize = 25;

  const params = useCallback(() => {
    const p: Record<string, string | number> = { page, page_size: pageSize };
    for (const [k, v] of Object.entries(filters)) if (v) p[k] = v;
    return p;
  }, [page, filters]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get("/schools/admissions/applications/", { params: params() });
      setRows(data.results ?? []);
      setCount(data.count ?? 0);
      setCounts(data.status_counts ?? {});
    } catch (e) {
      toast({ title: L("Could not load applications", "Impossible de charger les demandes"), description: getApiErrorMessage(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  useEffect(() => { void load(); }, [load]);

  async function exportCsv() {
    try {
      const { page: _p, page_size: _s, ...rest } = params();
      const { data } = await apiClient.get("/schools/admissions/export/", { params: rest, responseType: "blob" });
      downloadBlob(data, "admission-applications.csv");
    } catch (e) {
      toast({ title: L("Export failed", "Échec de l'export"), description: getApiErrorMessage(e), variant: "destructive" });
    }
  }

  const set = (k: string, v: string) => { setPage(1); setFilters((f) => ({ ...f, [k]: v })); };
  const pages = Math.max(1, Math.ceil(count / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xs">
        {STATUSES.concat("enrolled").map((s) => (
          <button key={s} onClick={() => set("status", filters.status === s ? "" : s)}
            className={`rounded-full border px-3 py-1 ${filters.status === s ? "bg-primary text-primary-foreground" : ""}`}>
            {STATUS_LABELS[s][fr ? "fr" : "en"]}: {counts[s] ?? 0}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div><Label htmlFor="adm-q">{L("Search", "Rechercher")}</Label>
          <Input id="adm-q" value={filters.q} onChange={(e) => set("q", e.target.value)} placeholder={L("Name, reference, phone", "Nom, référence, téléphone")} /></div>
        <div><Label htmlFor="adm-from">{L("From", "Du")}</Label><Input id="adm-from" type="date" value={filters.date_from} onChange={(e) => set("date_from", e.target.value)} /></div>
        <div><Label htmlFor="adm-to">{L("To", "Au")}</Label><Input id="adm-to" type="date" value={filters.date_to} onChange={(e) => set("date_to", e.target.value)} /></div>
        <Button variant="outline" onClick={exportCsv}>{L("Export CSV", "Exporter en CSV")}</Button>
      </div>

      {loading ? <Loader2 className="h-5 w-5 animate-spin" aria-label="loading" /> : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{L("No applications yet.", "Aucune demande pour le moment.")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left"><tr>
              <th className="p-3">{L("Reference", "Référence")}</th><th className="p-3">{L("Student", "Élève")}</th>
              <th className="p-3">{L("Class", "Classe")}</th><th className="p-3">{L("Guardian", "Tuteur")}</th>
              <th className="p-3">{L("Status", "Statut")}</th><th className="p-3">{L("Date", "Date")}</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="cursor-pointer border-t hover:bg-muted/30" onClick={() => setOpenId(r.id)}>
                  <td className="p-3 font-mono text-xs">
                    <button className="underline-offset-2 hover:underline" onClick={() => setOpenId(r.id)}>{r.reference}</button></td>
                  <td className="p-3">{r.student_full_name}</td><td className="p-3">{r.class_applied_name}</td>
                  <td className="p-3">{r.guardian_name}<div className="text-xs text-muted-foreground">{r.guardian_phone}</div></td>
                  <td className="p-3">{STATUS_LABELS[r.status]?.[fr ? "fr" : "en"] ?? r.status}</td>
                  <td className="p-3">{new Date(r.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center justify-between text-sm">
        <span>{count} {L("applications", "demandes")}</span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>{L("Previous", "Précédent")}</Button>
          <span>{page} / {pages}</span>
          <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>{L("Next", "Suivant")}</Button>
        </div>
      </div>
      <DetailDialog id={openId} fr={fr} onClose={() => setOpenId(null)} onChanged={load} />
    </div>
  );
}

function DetailDialog({ id, fr, onClose, onChanged }: { id: string | null; fr: boolean; onClose: () => void; onChanged: () => void }) {
  const L = (en: string, frText: string) => (fr ? frText : en);
  const { toast } = useToast();
  const [d, setD] = useState<Detail | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [dupes, setDupes] = useState<{ id: string; name: string; class_name: string }[] | null>(null);

  useEffect(() => {
    setD(null); setDupes(null);
    if (!id) return;
    apiClient.get(`/schools/admissions/applications/${id}/`).then(({ data }) => { setD(data); setNotes(data.internal_notes ?? ""); })
      .catch((e) => toast({ title: L("Could not open the application", "Impossible d'ouvrir la demande"), description: getApiErrorMessage(e), variant: "destructive" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function patch(body: Record<string, string>) {
    if (!id) return;
    setBusy(true);
    try {
      const { data } = await apiClient.patch(`/schools/admissions/applications/${id}/`, body);
      setD(data); onChanged();
      toast({ title: L("Saved", "Enregistré") });
    } catch (e) {
      toast({ title: L("Could not save", "Échec de l'enregistrement"), description: getApiErrorMessage(e), variant: "destructive" });
    } finally { setBusy(false); }
  }

  async function openDocument(docId: string) {
    try {
      const { data: link } = await apiClient.post(`/schools/admissions/applications/${id}/documents/${docId}/link/`);
      const path = String(link.url).replace(/^\/api\/v1/, "");
      // Mobile: a blob URL cannot be opened inside the WebView and CapacitorHttp
      // cannot return binary, so the native downloader saves the file into the
      // eduignite folder instead.
      if (isNativeApp()) {
        const name = String(link.filename || link.name || `admission-document-${docId}`);
        await downloadServerFile({ url: `${BASE_URL}${path}`, fileName: name, token: getAccessToken() });
        toast({ title: L("Saved", "Enregistré"), description: L("The document is in your eduignite folder.", "Le document est dans votre dossier eduignite.") });
        return;
      }
      const { data } = await apiClient.get(path, { responseType: "blob" });
      window.open(URL.createObjectURL(data), "_blank", "noopener");
    } catch (e) {
      toast({ title: L("Could not open the document", "Impossible d'ouvrir le document"), description: getApiErrorMessage(e), variant: "destructive" });
    }
  }

  async function enrol(confirm: boolean) {
    setBusy(true);
    try {
      await apiClient.post(`/schools/admissions/applications/${id}/enrol/`, { confirm_duplicate: confirm });
      toast({ title: L("Pupil enrolled", "Élève inscrit") });
      const { data } = await apiClient.get(`/schools/admissions/applications/${id}/`);
      setD(data); setDupes(null); onChanged();
    } catch (e: any) {
      if (e?.response?.status === 409 && e.response.data?.code === "possible_duplicate") setDupes(e.response.data.duplicates ?? []);
      else toast({ title: L("Could not enrol", "Inscription impossible"), description: getApiErrorMessage(e), variant: "destructive" });
    } finally { setBusy(false); }
  }

  const row = (label: string, value?: string | null) => value ? <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-sm">{value}</dd></div> : null;

  return (
    <Dialog open={Boolean(id)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{d ? `${d.reference} - ${d.student_full_name}` : L("Application", "Demande")}</DialogTitle>
          <DialogDescription>{L("Confidential: this concerns a child.", "Confidentiel : cela concerne un enfant.")}</DialogDescription>
        </DialogHeader>
        {!d ? <Loader2 className="h-5 w-5 animate-spin" aria-label="loading" /> : (
          <div className="space-y-5">
            <dl className="grid gap-3 sm:grid-cols-2">
              {row(L("Date of birth", "Date de naissance"), d.student_dob)}
              {row(L("Gender", "Sexe"), d.student_gender)}
              {row(L("Class applied for", "Classe demandée"), d.class_applied_name)}
              {row(L("Intake", "Rentrée"), d.intake_year)}
              {row(L("Previous school", "École précédente"), d.previous_school)}
              {row(L("Guardian", "Tuteur"), d.guardian_name)}
              {row(L("Relationship", "Lien"), RELATIONSHIP_LABELS[d.guardian_relationship]?.[fr ? "fr" : "en"] ?? d.guardian_relationship)}
              {row(L("Phone", "Téléphone"), d.guardian_phone)}
              {row(L("Email", "Email"), d.guardian_email)}
              {row(L("Address", "Adresse"), d.guardian_address)}
              {row(L("Message", "Message"), d.message)}
            </dl>

            {d.documents.length > 0 && (
              <div><h3 className="text-sm font-semibold">{L("Documents", "Documents")}</h3>
                <ul className="mt-1 space-y-1">{d.documents.map((doc) => (
                  <li key={doc.id}><Button variant="link" className="h-auto p-0" onClick={() => openDocument(doc.id)}>
                    {doc.name || doc.doc_type.toUpperCase()} ({Math.max(1, Math.round(doc.size / 1024))} KB)</Button></li>))}
                </ul>
                <p className="text-xs text-muted-foreground">{L("Links expire after 5 minutes.", "Les liens expirent après 5 minutes.")}</p></div>
            )}

            <div className="flex flex-wrap items-end gap-3">
              <div><Label htmlFor="adm-status">{L("Status", "Statut")}</Label>
                <select id="adm-status" className={`${SELECT} block`} disabled={busy || d.status === "enrolled"}
                  value={d.status === "enrolled" ? "enrolled" : d.status} onChange={(e) => patch({ status: e.target.value })}>
                  {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s][fr ? "fr" : "en"]}</option>)}
                  {d.status === "enrolled" ? <option value="enrolled">{STATUS_LABELS.enrolled[fr ? "fr" : "en"]}</option> : null}
                </select></div>
              {d.status === "accepted" && <Button disabled={busy} onClick={() => enrol(false)}>{L("Enrol as pupil", "Inscrire comme élève")}</Button>}
            </div>

            {dupes && (
              <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
                <p className="font-semibold">{L("A pupil with the same details may already exist:", "Un élève avec les mêmes informations existe peut-être déjà :")}</p>
                <ul className="list-disc pl-5">{dupes.map((x) => <li key={x.id}>{x.name} ({x.class_name})</li>)}</ul>
                <Button className="mt-2" variant="outline" disabled={busy} onClick={() => enrol(true)}>{L("Enrol anyway", "Inscrire quand même")}</Button>
              </div>
            )}

            <div><Label htmlFor="adm-notes">{L("Internal notes (not shared)", "Notes internes (non partagées)")}</Label>
              <Textarea id="adm-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
              <Button className="mt-2" size="sm" variant="outline" disabled={busy || notes === d.internal_notes} onClick={() => patch({ internal_notes: notes })}>{L("Save notes", "Enregistrer les notes")}</Button></div>

            <div><h3 className="text-sm font-semibold">{L("History", "Historique")}</h3>
              <ul className="mt-1 space-y-1 text-xs text-muted-foreground">{d.audit.map((a, i) => (
                <li key={i}>{new Date(a.at).toLocaleString()} - {a.actor}: {a.action.replace(/_/g, " ")}{a.to_status ? ` (${a.from_status || "-"} → ${a.to_status})` : ""}</li>))}</ul></div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function AdmissionSettingsForm({ fr, embedded = false }: { fr: boolean; embedded?: boolean }) {
  const L = (en: string, frText: string) => (fr ? frText : en);
  const { toast } = useToast();
  const [s, setS] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiClient.get("/schools/admissions/settings/").then(({ data }) => setS(data))
      .catch((e) => toast({ title: L("Could not load settings", "Impossible de charger les paramètres"), description: getApiErrorMessage(e), variant: "destructive" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!s) return <Loader2 className="h-5 w-5 animate-spin" aria-label="loading" />;
  const up = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v });

  async function save() {
    if (!s) return;
    setSaving(true);
    try {
      const { data } = await apiClient.patch("/schools/admissions/settings/", {
        opens_on: s.opens_on || null, closes_on: s.closes_on || null, intake_year: s.intake_year,
        classes_offered: s.classes_offered, field_config: s.field_config, allowed_document_types: s.allowed_document_types,
        max_document_mb: s.max_document_mb, max_documents: s.max_documents, consent_text_en: s.consent_text_en,
        consent_text_fr: s.consent_text_fr, notification_email: s.notification_email, auto_reply_en: s.auto_reply_en,
        auto_reply_fr: s.auto_reply_fr,
      });
      setS(data);
      toast({ title: L("Settings saved", "Paramètres enregistrés") });
    } catch (e) {
      toast({ title: L("Could not save", "Échec de l'enregistrement"), description: getApiErrorMessage(e), variant: "destructive" });
    } finally { setSaving(false); }
  }

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <div className="space-y-6">
      <p className="rounded-lg border bg-muted/40 p-3 text-sm">
        {s.enrollment_enabled && s.publication_status === "published"
          ? L(`The admission form is live at /schools/${s.slug}/enrollment (window: ${s.window_state.replace(/_/g, " ")}).`, `Le formulaire est en ligne sur /schools/${s.slug}/enrollment (période : ${s.window_state.replace(/_/g, " ")}).`)
          : embedded
            ? L("The form is not public yet: switch on online enrollment above and publish your website.", "Le formulaire n'est pas encore public : activez les inscriptions en ligne ci-dessus et publiez votre site.")
            : L("The form is not public yet: publish your website and enable enrolment in the Public Website settings.", "Le formulaire n'est pas encore public : publiez votre site et activez les inscriptions dans les paramètres du site public.")}
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <div><Label htmlFor="s-open">{L("Opens on", "Ouverture")}</Label><Input id="s-open" type="date" value={s.opens_on ?? ""} onChange={(e) => up("opens_on", e.target.value || null)} /></div>
        <div><Label htmlFor="s-close">{L("Closes on", "Clôture")}</Label><Input id="s-close" type="date" value={s.closes_on ?? ""} onChange={(e) => up("closes_on", e.target.value || null)} /></div>
        <div><Label htmlFor="s-year">{L("Intake year (e.g. 2026-2027)", "Rentrée (ex. 2026-2027)")}</Label><Input id="s-year" value={s.intake_year} onChange={(e) => up("intake_year", e.target.value)} /></div>
      </div>

      <fieldset><legend className="text-sm font-semibold">{L("Classes offered (none ticked = all classes)", "Classes proposées (aucune cochée = toutes)")}</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">{s.available_classes.map((c) => (
          <label key={c.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.classes_offered.includes(c.id)} onChange={() => up("classes_offered", toggle(s.classes_offered, c.id))} />{c.name} <span className="text-xs text-muted-foreground">({[c.level, c.group].filter(Boolean).join(" · ")})</span></label>))}</div></fieldset>

      <fieldset><legend className="text-sm font-semibold">{L("Form fields (student and guardian names are always required)", "Champs du formulaire (les noms de l'élève et du tuteur sont toujours obligatoires)")}</legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">{Object.entries(FIELD_LABELS).map(([k, [en, frl]]) => (
          <div key={k} className="flex items-center justify-between gap-3"><Label htmlFor={`fc-${k}`}>{fr ? frl : en}</Label>
            <select id={`fc-${k}`} className={SELECT} value={s.field_config[k] ?? "optional"} onChange={(e) => up("field_config", { ...s.field_config, [k]: e.target.value as "required" | "optional" | "hidden" })}>
              <option value="required">{L("Required", "Obligatoire")}</option><option value="optional">{L("Optional", "Facultatif")}</option><option value="hidden">{L("Hidden", "Masqué")}</option></select></div>))}</div></fieldset>

      <fieldset><legend className="text-sm font-semibold">{L("Documents", "Documents")}</legend>
        <div className="mt-2 flex flex-wrap items-end gap-4">
          {["pdf", "jpg", "png"].map((t) => (<label key={t} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.allowed_document_types.includes(t)} onChange={() => up("allowed_document_types", toggle(s.allowed_document_types, t))} />{t.toUpperCase()}</label>))}
          <div><Label htmlFor="s-mb">{L("Max size (MB)", "Taille max (Mo)")}</Label><Input id="s-mb" type="number" min={1} max={10} value={s.max_document_mb} onChange={(e) => up("max_document_mb", Number(e.target.value))} /></div>
          <div><Label htmlFor="s-n">{L("Max files (0 = none)", "Fichiers max (0 = aucun)")}</Label><Input id="s-n" type="number" min={0} max={10} value={s.max_documents} onChange={(e) => up("max_documents", Number(e.target.value))} /></div></div></fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div><Label htmlFor="s-ce">{L("Consent text (English)", "Texte de consentement (anglais)")}</Label><Textarea id="s-ce" rows={3} value={s.consent_text_en} onChange={(e) => up("consent_text_en", e.target.value)} /></div>
        <div><Label htmlFor="s-cf">{L("Consent text (French)", "Texte de consentement (français)")}</Label><Textarea id="s-cf" rows={3} value={s.consent_text_fr} onChange={(e) => up("consent_text_fr", e.target.value)} /></div>
        <div><Label htmlFor="s-ae">{L("Auto-reply (English)", "Réponse automatique (anglais)")}</Label><Textarea id="s-ae" rows={3} value={s.auto_reply_en} onChange={(e) => up("auto_reply_en", e.target.value)} /></div>
        <div><Label htmlFor="s-af">{L("Auto-reply (French)", "Réponse automatique (français)")}</Label><Textarea id="s-af" rows={3} value={s.auto_reply_fr} onChange={(e) => up("auto_reply_fr", e.target.value)} /></div>
      </div>
      <div className="max-w-md"><Label htmlFor="s-mail">{L("Notification email (defaults to the school email)", "Email de notification (par défaut : email de l'école)")}</Label><Input id="s-mail" type="email" value={s.notification_email} onChange={(e) => up("notification_email", e.target.value)} /></div>
      <Button onClick={save} disabled={saving}>{saving ? L("Saving...", "Enregistrement...") : L("Save settings", "Enregistrer")}</Button>
    </div>
  );
}
