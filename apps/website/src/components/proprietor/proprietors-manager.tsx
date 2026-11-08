"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Mail,
  Phone,
  Plus,
  Power,
  Save,
  Search,
  ShieldCheck,
  UserCog,
} from "lucide-react";

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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api/errors";
import {
  proprietorService,
  readApiError,
  type Proprietor,
  type ProprietorCredentials,
} from "@/lib/api/services/proprietor.service";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorState, RowsSkeleton, formatDateTime, useLocale, useTr } from "./common";
import { LinkedBadge, SchoolLinker } from "./school-linker";

/**
 * The "Proprietors" section of the executive Schools tab (CEO / CTO only).
 * Identical in the website, mobile and desktop apps.
 */

const LIST_KEY = ["proprietors", "list"] as const;

function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export function ProprietorsManager() {
  const tr = useTr();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | "true" | "false">("");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const q = useDebounced(search.trim());

  const list = useQuery({
    queryKey: [...LIST_KEY, q, status],
    queryFn: () => proprietorService.list({ q: q || undefined, is_active: status }),
    placeholderData: (previous) => previous,
  });
  const rows = list.data?.results ?? [];
  const selected = rows.find((row) => row.id === selectedId) ?? null;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["proprietors"] });

  return (
    <section className="space-y-5" aria-label={tr("Proprietors", "Propriétaires")}>
      <div className="flex flex-col gap-4 rounded-2xl border bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-xl font-black text-primary">
            <UserCog className="h-5 w-5" /> {tr("Proprietors", "Propriétaires")}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {tr(
              "A proprietor owns one or more schools of any section. He sees their statistics and can change the login details of their administrators.",
              "Un propriétaire possède une ou plusieurs écoles de toute section. Il voit leurs statistiques et peut modifier les identifiants de leurs administrateurs.",
            )}
          </p>
        </div>
        <Button className="h-12 gap-2 rounded-xl px-6 font-black" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> {tr("Create proprietor", "Créer un propriétaire")}
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tr("Search by name, email or matricule", "Rechercher par nom, e-mail ou matricule")}
            className="h-11 rounded-xl bg-white pl-9"
            aria-label={tr("Search proprietors", "Rechercher des propriétaires")}
          />
        </div>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-accent/40 p-1" role="group" aria-label={tr("Status filter", "Filtre de statut")}>
          {(
            [
              ["", tr("All", "Tous")],
              ["true", tr("Active", "Actifs")],
              ["false", tr("Inactive", "Inactifs")],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={status === value ? "default" : "ghost"}
              aria-pressed={status === value}
              className="h-9 rounded-lg text-xs font-bold"
              onClick={() => setStatus(value)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {list.isLoading ? (
        <RowsSkeleton rows={4} />
      ) : list.isError ? (
        <ErrorState
          message={getApiErrorMessage(list.error, tr("The proprietors could not be loaded.", "Les propriétaires n'ont pas pu être chargés."))}
          onRetry={() => list.refetch()}
          retrying={list.isFetching}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title={q || status ? tr("No proprietor matches", "Aucun propriétaire ne correspond") : tr("No proprietor yet", "Aucun propriétaire pour le moment")}
          text={
            q || status
              ? tr("Change the search or the status filter.", "Modifiez la recherche ou le filtre de statut.")
              : tr("Create the first proprietor, then link his schools.", "Créez le premier propriétaire, puis liez ses écoles.")
          }
          action={
            !q && !status ? (
              <Button className="gap-2" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> {tr("Create proprietor", "Créer un propriétaire")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => setSelectedId(row.id)}
                className="group w-full rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                aria-label={tr(`Open ${row.name}`, `Ouvrir ${row.name}`)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-black text-primary">{row.name}</p>
                    <p className="font-mono text-xs font-bold tracking-wider text-primary/60">{row.matricule}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StatusChip proprietor={row} />
                    <LinkedBadge count={row.school_count} />
                  </div>
                </div>
                <p className="mt-2 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                  <Mail className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{row.email}</span>
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {row.schools.length === 0 ? (
                    <span className="text-xs font-semibold text-amber-700">{tr("No school linked yet", "Aucune école liée")}</span>
                  ) : (
                    <>
                      {row.schools.slice(0, 4).map((school) => (
                        <span key={school.id} className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">
                          {school.short_name || school.name}
                        </span>
                      ))}
                      {row.schools.length > 4 && (
                        <span className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold text-muted-foreground">+{row.schools.length - 4}</span>
                      )}
                    </>
                  )}
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground">
                  {row.last_login
                    ? tr(`Last sign-in ${formatDateTime(row.last_login, locale)}`, `Dernière connexion ${formatDateTime(row.last_login, locale)}`)
                    : tr("Never signed in", "Jamais connecté")}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      <CreateProprietorDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={refresh} />

      <ProprietorDrawer
        proprietor={selected}
        open={Boolean(selectedId)}
        onClose={() => setSelectedId(null)}
        onChanged={refresh}
      />
    </section>
  );
}

function StatusChip({ proprietor }: { proprietor: Proprietor }) {
  const tr = useTr();
  if (!proprietor.is_active) return <Badge className="border-none bg-red-100 px-2 text-[10px] font-bold uppercase text-red-700">{tr("Inactive", "Inactif")}</Badge>;
  if (proprietor.must_change_password)
    return <Badge className="border-none bg-amber-100 px-2 text-[10px] font-bold uppercase text-amber-800">{tr("Awaiting first sign-in", "En attente de connexion")}</Badge>;
  return <Badge className="border-none bg-green-100 px-2 text-[10px] font-bold uppercase text-green-700">{tr("Active", "Actif")}</Badge>;
}

/* ------------------------------------------------------------------ */
/* Credentials: shown once, never kept                                  */
/* ------------------------------------------------------------------ */

function CredentialsPanel({
  credentials,
  name,
  emailSent,
  onDone,
}: {
  credentials: ProprietorCredentials;
  name: string;
  emailSent?: boolean;
  onDone: () => void;
}) {
  const tr = useTr();
  const [visible, setVisible] = useState(true);
  const [copied, setCopied] = useState<string>("");
  const [saved, setSaved] = useState(false);

  const loginUrl = typeof window !== "undefined" ? `${window.location.origin}/login` : "";
  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((current) => (current === key ? "" : current)), 2500);
    } catch {
      setCopied("");
    }
  };
  const all = [
    `${tr("Name", "Nom")}: ${name}`,
    `${tr("Matricule", "Matricule")}: ${credentials.matricule}`,
    `${tr("Temporary password", "Mot de passe temporaire")}: ${credentials.temporary_password}`,
    loginUrl ? `${tr("Sign in at", "Connexion")}: ${loginUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="space-y-4" data-testid="proprietor-credentials">
      <div role="alert" className="flex gap-3 rounded-2xl border border-red-300 bg-red-50 p-4 text-red-800">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="space-y-1 text-sm">
          <p className="font-black">{tr("This password is shown only once.", "Ce mot de passe n'est affiché qu'une seule fois.")}</p>
          <p>
            {tr(
              "It will not be shown again and is not stored anywhere readable. Hand it to the proprietor yourself, in person or through a secure channel. He must choose his own password at his first sign-in.",
              "Il ne sera plus jamais affiché et n'est conservé nulle part de lisible. Remettez-le vous-même au propriétaire, en main propre ou par un canal sécurisé. Il devra choisir son propre mot de passe à sa première connexion.",
            )}
          </p>
        </div>
      </div>

      <dl className="space-y-3 rounded-2xl border bg-accent/20 p-4">
        <CopyRow label={tr("Matricule", "Matricule")} value={credentials.matricule} copied={copied === "m"} onCopy={() => copy("m", credentials.matricule)} />
        <CopyRow
          label={tr("Temporary password", "Mot de passe temporaire")}
          value={visible ? credentials.temporary_password : "•".repeat(Math.min(credentials.temporary_password.length, 16))}
          copied={copied === "p"}
          onCopy={() => copy("p", credentials.temporary_password)}
          extra={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => setVisible((v) => !v)}
              aria-label={visible ? tr("Hide password", "Masquer le mot de passe") : tr("Show password", "Afficher le mot de passe")}
            >
              {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          }
        />
      </dl>

      <Button type="button" variant="outline" className="h-11 w-full gap-2 rounded-xl" onClick={() => copy("all", all)}>
        {copied === "all" ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
        {copied === "all" ? tr("Copied", "Copié") : tr("Copy all details", "Copier tous les détails")}
      </Button>

      {typeof emailSent === "boolean" && (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {emailSent
            ? tr("An email with the matricule and the sign-in link was sent. It does not contain the password.", "Un e-mail avec le matricule et le lien de connexion a été envoyé. Il ne contient pas le mot de passe.")
            : tr("The email with the sign-in link could not be sent. Give him the matricule and the link yourself.", "L'e-mail avec le lien de connexion n'a pas pu être envoyé. Donnez-lui vous-même le matricule et le lien.")}
        </p>
      )}

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm">
        <input type="checkbox" className="mt-1 h-4 w-4 accent-[#264D73]" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        <span>{tr("I have copied these details and will hand them over securely.", "J'ai copié ces informations et je les remettrai de façon sécurisée.")}</span>
      </label>

      <Button type="button" className="h-12 w-full rounded-xl font-black" disabled={!saved} onClick={onDone}>
        {tr("Done", "Terminé")}
      </Button>
    </div>
  );
}

function CopyRow({ label, value, onCopy, copied, extra }: { label: string; value: string; onCopy: () => void; copied: boolean; extra?: React.ReactNode }) {
  const tr = useTr();
  return (
    <div>
      <dt className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</dt>
      <dd className="mt-1 flex items-center gap-1">
        <code className="min-w-0 flex-1 select-all break-all rounded-lg bg-white px-3 py-2.5 font-mono text-base font-black tracking-wide text-primary">{value}</code>
        {extra}
        <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={onCopy} aria-label={`${tr("Copy", "Copier")} ${label}`}>
          {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
        </Button>
      </dd>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Create                                                               */
/* ------------------------------------------------------------------ */

function CreateProprietorDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: () => void }) {
  const tr = useTr();
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  // Held in component state only (never in the query cache) and dropped when closed.
  const [created, setCreated] = useState<{ proprietor: Proprietor; credentials: ProprietorCredentials; email_sent: boolean } | null>(null);

  const close = () => {
    setCreated(null);
    setForm({ name: "", email: "", phone: "" });
    setErrors({});
    setFormError("");
    onOpenChange(false);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = tr("Enter the full name.", "Saisissez le nom complet.");
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) next.email = tr("Enter a valid email address.", "Saisissez une adresse e-mail valide.");
    setErrors(next);
    setFormError("");
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      const result = await proprietorService.create({ name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim() || undefined });
      setCreated(result);
      onCreated();
    } catch (error) {
      const info = readApiError(error);
      const mapped: Record<string, string> = {};
      Object.entries(info.errors).forEach(([field, messages]) => (mapped[field] = messages[0]));
      setErrors(mapped);
      if (!Object.keys(mapped).length) setFormError(getApiErrorMessage(error, tr("The proprietor could not be created.", "Le propriétaire n'a pas pu être créé.")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        // The one-time password must not vanish by a stray click outside.
        if (!value && created) return;
        if (!value) close();
        else onOpenChange(true);
      }}
    >
      <DialogContent className="flex max-h-[92dvh] flex-col overflow-hidden rounded-3xl p-0 sm:max-w-lg" onInteractOutside={(e) => created && e.preventDefault()} onEscapeKeyDown={(e) => created && e.preventDefault()}>
        <DialogHeader className="shrink-0 bg-primary p-6 text-left text-white">
          <DialogTitle className="flex items-center gap-2 text-xl font-black">
            <ShieldCheck className="h-5 w-5 text-secondary" />
            {created ? tr("Proprietor created", "Propriétaire créé") : tr("Create proprietor", "Créer un propriétaire")}
          </DialogTitle>
          <DialogDescription className="text-white/70">
            {created
              ? tr("Hand these sign-in details over now.", "Remettez ces identifiants maintenant.")
              : tr("He receives a matricule and a temporary password. You link his schools next.", "Il reçoit un matricule et un mot de passe temporaire. Vous liez ensuite ses écoles.")}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
          {created ? (
            <CredentialsPanel credentials={created.credentials} name={created.proprietor.name} emailSent={created.email_sent} onDone={close} />
          ) : (
            <form onSubmit={submit} className="space-y-4" noValidate>
              <Field id="po-name" label={tr("Full name", "Nom complet")} error={errors.name} required>
                <Input id="po-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-12 rounded-xl" autoComplete="off" aria-invalid={Boolean(errors.name)} />
              </Field>
              <Field id="po-email" label={tr("Email", "E-mail")} error={errors.email} required hint={tr("The sign-in link and matricule are sent here.", "Le lien de connexion et le matricule sont envoyés ici.")}>
                <Input id="po-email" type="email" inputMode="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-12 rounded-xl" autoComplete="off" aria-invalid={Boolean(errors.email)} />
              </Field>
              <Field id="po-phone" label={tr("Phone (optional)", "Téléphone (facultatif)")} error={errors.phone}>
                <Input id="po-phone" type="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-12 rounded-xl" placeholder="+237 6XX XX XX XX" autoComplete="off" aria-invalid={Boolean(errors.phone)} />
              </Field>
              {formError ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{formError}</p> : null}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="ghost" onClick={close} disabled={busy}>{tr("Cancel", "Annuler")}</Button>
                <Button type="submit" disabled={busy} className="h-12 gap-2 rounded-xl px-6 font-black">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} {tr("Create account", "Créer le compte")}
                </Button>
              </div>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ id, label, error, hint, required, children }: { id: string; label: string; error?: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
        {label} {required ? <span className="text-destructive">*</span> : null}
      </Label>
      {children}
      {error ? <p className="text-xs font-semibold text-destructive" role="alert">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Detail drawer                                                        */
/* ------------------------------------------------------------------ */

function ProprietorDrawer({ proprietor, open, onClose, onChanged }: { proprietor: Proprietor | null; open: boolean; onClose: () => void; onChanged: () => void }) {
  const tr = useTr();
  const [revealed, setRevealed] = useState<{ credentials: ProprietorCredentials; name: string } | null>(null);

  return (
    <>
      <Sheet open={open} onOpenChange={(value) => !value && onClose()}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
          {proprietor ? (
            <>
              <SheetHeader className="shrink-0 bg-primary p-5 text-left text-white">
                <SheetTitle className="pr-8 text-xl font-black text-white">{proprietor.name}</SheetTitle>
                <SheetDescription className="font-mono text-xs font-bold tracking-wider text-white/70">{proprietor.matricule}</SheetDescription>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <StatusChip proprietor={proprietor} />
                  <LinkedBadge count={proprietor.school_count} />
                </div>
              </SheetHeader>
              <Tabs defaultValue="schools" className="flex min-h-0 flex-1 flex-col">
                <TabsList className="mx-4 mt-4 grid shrink-0 grid-cols-2">
                  <TabsTrigger value="schools">{tr("Schools", "Écoles")}</TabsTrigger>
                  <TabsTrigger value="account">{tr("Account", "Compte")}</TabsTrigger>
                </TabsList>
                <TabsContent value="schools" className="mt-0 min-h-0 flex-1 overflow-y-auto p-4">
                  <SchoolLinker
                    proprietorId={proprietor.id}
                    proprietorName={proprietor.name}
                    linked={proprietor.schools}
                    onSaved={() => onChanged()}
                  />
                </TabsContent>
                <TabsContent value="account" className="mt-0 min-h-0 flex-1 overflow-y-auto p-4">
                  <AccountTab proprietor={proprietor} onChanged={onChanged} onCredentials={(credentials) => setRevealed({ credentials, name: proprietor.name })} />
                </TabsContent>
              </Tabs>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={Boolean(revealed)} onOpenChange={() => undefined}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-3xl sm:max-w-lg" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-black text-primary">
              <KeyRound className="h-5 w-5" /> {tr("New temporary password", "Nouveau mot de passe temporaire")}
            </DialogTitle>
            <DialogDescription>{tr("His old sessions were ended. He must choose his own password at the next sign-in.", "Ses anciennes sessions ont été fermées. Il devra choisir son mot de passe à la prochaine connexion.")}</DialogDescription>
          </DialogHeader>
          {revealed ? <CredentialsPanel credentials={revealed.credentials} name={revealed.name} onDone={() => setRevealed(null)} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function AccountTab({ proprietor, onChanged, onCredentials }: { proprietor: Proprietor; onChanged: () => void; onCredentials: (credentials: ProprietorCredentials) => void }) {
  const tr = useTr();
  const locale = useLocale();
  const { toast } = useToast();
  const [form, setForm] = useState({ name: proprietor.name, email: proprietor.email, phone: proprietor.phone || "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"" | "save" | "toggle" | "reset">("");
  const [confirm, setConfirm] = useState<"" | "toggle" | "reset">("");

  useEffect(() => {
    setForm({ name: proprietor.name, email: proprietor.email, phone: proprietor.phone || "" });
    setErrors({});
  }, [proprietor.id, proprietor.name, proprietor.email, proprietor.phone]);

  const dirty = form.name !== proprietor.name || form.email !== proprietor.email || form.phone !== (proprietor.phone || "");

  const fail = (error: unknown, fallback: string) =>
    toast({ variant: "destructive", title: tr("Not done", "Non effectué"), description: getApiErrorMessage(error, fallback) });

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy("save");
    setErrors({});
    try {
      await proprietorService.update(proprietor.id, { name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim() });
      onChanged();
      toast({ title: tr("Details saved", "Informations enregistrées") });
    } catch (error) {
      const info = readApiError(error);
      const mapped: Record<string, string> = {};
      Object.entries(info.errors).forEach(([field, messages]) => (mapped[field] = messages[0]));
      setErrors(mapped);
      if (!Object.keys(mapped).length) fail(error, tr("The details could not be saved.", "Les informations n'ont pas pu être enregistrées."));
    } finally {
      setBusy("");
    }
  };

  const toggle = async () => {
    setBusy("toggle");
    try {
      if (proprietor.is_active) await proprietorService.deactivate(proprietor.id);
      else await proprietorService.activate(proprietor.id);
      onChanged();
      setConfirm("");
      toast({ title: proprietor.is_active ? tr("Proprietor deactivated", "Propriétaire désactivé") : tr("Proprietor activated", "Propriétaire activé") });
    } catch (error) {
      fail(error, tr("The status could not be changed.", "Le statut n'a pas pu être modifié."));
    } finally {
      setBusy("");
    }
  };

  const reset = async () => {
    setBusy("reset");
    try {
      const result = await proprietorService.resetPassword(proprietor.id);
      onChanged();
      setConfirm("");
      onCredentials(result.credentials);
    } catch (error) {
      fail(error, tr("The password could not be reset.", "Le mot de passe n'a pas pu être réinitialisé."));
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={save} className="space-y-4" noValidate>
        <Field id="pe-name" label={tr("Full name", "Nom complet")} error={errors.name}>
          <Input id="pe-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-11 rounded-xl" />
        </Field>
        <Field id="pe-email" label={tr("Email", "E-mail")} error={errors.email}>
          <Input id="pe-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-11 rounded-xl" />
        </Field>
        <Field id="pe-phone" label={tr("Phone", "Téléphone")} error={errors.phone}>
          <Input id="pe-phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-11 rounded-xl" />
        </Field>
        <Button type="submit" disabled={!dirty || busy === "save" || !form.name.trim() || !form.email.trim()} className="h-11 w-full gap-2 rounded-xl font-black sm:w-auto">
          {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {tr("Save details", "Enregistrer")}
        </Button>
      </form>

      <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-accent/20 p-4 text-xs">
        <div>
          <dt className="font-black uppercase tracking-widest text-muted-foreground">{tr("Created", "Créé le")}</dt>
          <dd className="mt-0.5 font-semibold text-primary">{formatDateTime(proprietor.date_joined, locale) || "-"}</dd>
        </div>
        <div>
          <dt className="font-black uppercase tracking-widest text-muted-foreground">{tr("Last sign-in", "Dernière connexion")}</dt>
          <dd className="mt-0.5 font-semibold text-primary">{formatDateTime(proprietor.last_login, locale) || tr("Never", "Jamais")}</dd>
        </div>
        <div className="col-span-2 flex items-center gap-2 text-muted-foreground">
          <Phone className="h-3.5 w-3.5" /> {proprietor.phone || tr("No phone", "Pas de téléphone")}
        </div>
      </dl>

      <div className="space-y-3 rounded-2xl border p-4">
        <h3 className="text-sm font-black uppercase tracking-widest text-primary">{tr("Access", "Accès")}</h3>
        <Button type="button" variant="outline" className="h-11 w-full justify-start gap-2 rounded-xl" onClick={() => setConfirm("reset")}>
          <KeyRound className="h-4 w-4" /> {tr("Reset temporary password", "Réinitialiser le mot de passe temporaire")}
        </Button>
        <Button
          type="button"
          variant="outline"
          className={cn("h-11 w-full justify-start gap-2 rounded-xl", proprietor.is_active ? "border-red-200 text-red-700 hover:bg-red-50" : "border-green-200 text-green-700 hover:bg-green-50")}
          onClick={() => setConfirm("toggle")}
        >
          <Power className="h-4 w-4" /> {proprietor.is_active ? tr("Deactivate account", "Désactiver le compte") : tr("Activate account", "Activer le compte")}
        </Button>
      </div>

      <AlertDialog open={confirm !== ""} onOpenChange={(value) => !value && busy === "" && setConfirm("")}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "reset"
                ? tr("Reset the temporary password?", "Réinitialiser le mot de passe temporaire ?")
                : proprietor.is_active
                  ? tr("Deactivate this proprietor?", "Désactiver ce propriétaire ?")
                  : tr("Activate this proprietor?", "Activer ce propriétaire ?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "reset"
                ? tr(
                    `${proprietor.name} is signed out everywhere and must use the new temporary password, shown once.`,
                    `${proprietor.name} est déconnecté partout et devra utiliser le nouveau mot de passe temporaire, affiché une seule fois.`,
                  )
                : proprietor.is_active
                  ? tr(
                      `${proprietor.name} is signed out and cannot sign in until you activate the account again. His linked schools stay linked.`,
                      `${proprietor.name} est déconnecté et ne pourra plus se connecter tant que vous n'aurez pas réactivé le compte. Ses écoles restent liées.`,
                    )
                  : tr(`${proprietor.name} will be able to sign in again.`, `${proprietor.name} pourra de nouveau se connecter.`)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy !== ""}>{tr("Cancel", "Annuler")}</AlertDialogCancel>
            <Button variant={confirm === "toggle" && proprietor.is_active ? "destructive" : "default"} disabled={busy !== ""} onClick={confirm === "reset" ? reset : toggle} className="gap-2">
              {busy === "reset" || busy === "toggle" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {tr("Confirm", "Confirmer")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
