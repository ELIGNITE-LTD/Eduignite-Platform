"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Eye, EyeOff, Loader2, Lock, ShieldAlert, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api/errors";
import { proprietorService, readApiError, type ManagedAdmin } from "@/lib/api/services/proprietor.service";
import { cn } from "@/lib/utils";
import { useTr } from "./common";

/**
 * Secure dialog: the proprietor sets new login details for one school administrator.
 * He proves who he is with HIS OWN matricule and password (never prefilled, never stored).
 * Identical in the website, mobile and desktop apps.
 */

export function passwordStrength(value: string) {
  let score = 0;
  if (value.length >= 8) score++;
  if (value.length >= 12) score++;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
  if (/\d/.test(value)) score++;
  if (/[^A-Za-z0-9]/.test(value)) score++;
  return Math.min(4, score);
}

type Props = {
  schoolId: string;
  schoolName: string;
  admin: ManagedAdmin | null;
  onClose: () => void;
  onDone: () => void;
};

export function AdminCredentialsDialog({ schoolId, schoolName, admin, onClose, onDone }: Props) {
  const tr = useTr();
  const { toast } = useToast();
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [active, setActive] = useState(true);
  const [requireChange, setRequireChange] = useState(true);
  const [ownMatricule, setOwnMatricule] = useState("");
  const [ownPassword, setOwnPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [done, setDone] = useState(false);

  // Fresh, empty form for every admin: nothing from a previous attempt survives.
  useEffect(() => {
    setNewPassword("");
    setShowPassword(false);
    setEmail(admin?.email || "");
    setPhone(admin?.phone || "");
    setActive(admin?.is_active ?? true);
    setRequireChange(true);
    setOwnMatricule("");
    setOwnPassword("");
    setErrors({});
    setFormError("");
    setLockedUntil(null);
    setDone(false);
  }, [admin?.id]);

  useEffect(() => {
    if (!lockedUntil) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= lockedUntil) setLockedUntil(null);
    }, 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

  const remaining = lockedUntil ? Math.max(0, Math.ceil((lockedUntil - now) / 1000)) : 0;
  const strength = passwordStrength(newPassword);
  const strengthLabel = [tr("Too weak", "Trop faible"), tr("Weak", "Faible"), tr("Fair", "Moyen"), tr("Good", "Bon"), tr("Strong", "Fort")][newPassword ? strength : 0];
  const strengthColor = ["bg-red-500", "bg-red-500", "bg-amber-500", "bg-lime-500", "bg-green-600"][newPassword ? strength : 0];

  if (!admin) return null;

  const emailChanged = email.trim() !== (admin.email || "");
  const phoneChanged = phone.trim() !== (admin.phone || "");
  const activeChanged = active !== admin.is_active;
  const summary: string[] = [
    tr("The password is replaced by the one you typed.", "Le mot de passe est remplacé par celui que vous avez saisi."),
    ...(emailChanged ? [tr(`Email: ${admin.email || "-"} becomes ${email.trim() || "-"}`, `E-mail : ${admin.email || "-"} devient ${email.trim() || "-"}`)] : []),
    ...(phoneChanged ? [tr(`Phone: ${admin.phone || "-"} becomes ${phone.trim() || "-"}`, `Téléphone : ${admin.phone || "-"} devient ${phone.trim() || "-"}`)] : []),
    ...(activeChanged ? [active ? tr("The account is unblocked.", "Le compte est débloqué.") : tr("The account is blocked.", "Le compte est bloqué.")] : []),
    requireChange
      ? tr("He must choose his own password at his next sign-in.", "Il devra choisir son propre mot de passe à sa prochaine connexion.")
      : tr("He can keep the password you set.", "Il pourra garder le mot de passe que vous avez défini."),
  ];

  const canSubmit = newPassword.length >= 8 && ownMatricule.trim() && ownPassword && !busy && remaining === 0;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setErrors({});
    setFormError("");
    try {
      const body: Parameters<typeof proprietorService.changeAdminCredentials>[2] = {
        matricule: ownMatricule.trim(),
        password: ownPassword,
        new_password: newPassword,
        require_password_change: requireChange,
      };
      if (emailChanged) body.email = email.trim();
      if (phoneChanged) body.phone = phone.trim();
      if (activeChanged) body.is_active = active;
      await proprietorService.changeAdminCredentials(schoolId, admin.id, body);
      // Secrets leave memory as soon as they are used.
      setNewPassword("");
      setOwnPassword("");
      setOwnMatricule("");
      setDone(true);
      onDone();
      toast({
        title: tr("Login details updated", "Identifiants mis à jour"),
        description: tr(
          `${admin.name}'s old sessions were ended and he was notified by email. Hand the new password to him yourself, in person or through a secure channel.`,
          `Les anciennes sessions de ${admin.name} ont été fermées et il a été prévenu par e-mail. Remettez-lui vous-même le nouveau mot de passe, en main propre ou par un canal sécurisé.`,
        ),
      });
    } catch (error: any) {
      const info = readApiError(error);
      setOwnPassword("");
      if (info.code === "reauth_failed") {
        setFormError(tr("We could not verify your identity. Check your matricule and password.", "Nous n'avons pas pu vérifier votre identité. Vérifiez votre matricule et votre mot de passe."));
      } else if (info.status === 429) {
        const header = Number(error?.response?.headers?.["retry-after"]);
        const seconds = Number.isFinite(header) && header > 0 ? header : info.code === "reauth_locked" ? 15 * 60 : 60;
        setNow(Date.now());
        setLockedUntil(Date.now() + seconds * 1000);
        setFormError(
          info.code === "reauth_locked"
            ? tr("Too many failed identity checks. This action is locked for a while, even with the right password.", "Trop de vérifications d'identité échouées. Cette action est verrouillée pour un moment, même avec le bon mot de passe.")
            : tr("Too many requests. Please wait a moment.", "Trop de requêtes. Veuillez patienter un instant."),
        );
      } else if (info.status === 400 && Object.keys(info.errors).length) {
        const mapped: Record<string, string> = {};
        Object.entries(info.errors).forEach(([field, messages]) => (mapped[field] = messages.join(" ")));
        setErrors(mapped);
        if (mapped.matricule || mapped.password) setFormError(tr("Enter your own matricule and password.", "Saisissez votre propre matricule et mot de passe."));
      } else {
        setFormError(getApiErrorMessage(error, tr("The login details could not be changed.", "Les identifiants n'ont pas pu être modifiés.")));
      }
    } finally {
      setBusy(false);
    }
  };

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  return (
    <Dialog open onOpenChange={(value) => !value && !busy && onClose()}>
      <DialogContent className="flex max-h-[94dvh] flex-col gap-0 overflow-hidden rounded-3xl p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 bg-primary p-5 text-left text-white sm:p-6">
          <DialogTitle className="flex items-center gap-2 text-lg font-black text-white sm:text-xl">
            <Lock className="h-5 w-5 text-secondary" /> {tr("Change login details", "Modifier les identifiants")}
          </DialogTitle>
          <DialogDescription className="text-white/75">
            {admin.name} - {admin.display_role} - {schoolName}
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="space-y-4 overflow-y-auto p-5 sm:p-6" role="status">
            <div className="flex gap-3 rounded-2xl border border-green-300 bg-green-50 p-4 text-green-900">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="space-y-1 text-sm">
                <p className="font-black">{tr("Login details updated.", "Identifiants mis à jour.")}</p>
                <p>{tr("The administrator's old sessions were ended and he was emailed. The email never contains the password.", "Les anciennes sessions de l'administrateur ont été fermées et il a reçu un e-mail. L'e-mail ne contient jamais le mot de passe.")}</p>
              </div>
            </div>
            <p className="rounded-xl bg-amber-50 p-3 text-sm font-medium text-amber-900">
              {tr("Now give him the new password yourself, in person or through a secure channel. It cannot be shown again.", "Remettez-lui maintenant le nouveau mot de passe vous-même, en main propre ou par un canal sécurisé. Il ne peut plus être affiché.")}
            </p>
            <Button className="h-12 w-full rounded-xl font-black" onClick={onClose}>{tr("Close", "Fermer")}</Button>
          </div>
        ) : (
          <form onSubmit={submit} autoComplete="off" noValidate className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
            <section className="space-y-4" aria-label={tr("New login details", "Nouveaux identifiants")}>
              <div className="space-y-1.5">
                <Label htmlFor="cd-new" className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">{tr("New password", "Nouveau mot de passe")}</Label>
                <div className="relative">
                  <Input
                    id="cd-new"
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    className="h-12 rounded-xl pr-12"
                    aria-invalid={Boolean(errors.new_password)}
                    aria-describedby="cd-new-help"
                  />
                  <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1 h-10 w-10" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? tr("Hide password", "Masquer le mot de passe") : tr("Show password", "Afficher le mot de passe")}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <div className="flex items-center gap-2" id="cd-new-help">
                  <div className="flex flex-1 gap-1" aria-hidden>
                    {[0, 1, 2, 3].map((i) => (
                      <span key={i} className={cn("h-1.5 flex-1 rounded-full", newPassword && i < strength ? strengthColor : "bg-accent")} />
                    ))}
                  </div>
                  <span className="w-16 text-right text-[11px] font-bold text-muted-foreground" aria-live="polite">{newPassword ? strengthLabel : ""}</span>
                </div>
                <p className="text-xs text-muted-foreground">{tr("At least 8 characters. Mix letters, digits and a symbol. No old password is needed.", "Au moins 8 caractères. Mélangez lettres, chiffres et un symbole. Aucun ancien mot de passe n'est nécessaire.")}</p>
                {errors.new_password ? <p role="alert" className="text-xs font-semibold text-destructive">{errors.new_password}</p> : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="cd-email" className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">{tr("Email (optional)", "E-mail (facultatif)")}</Label>
                  <Input id="cd-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" className="h-11 rounded-xl" aria-invalid={Boolean(errors.email)} />
                  {errors.email ? <p role="alert" className="text-xs font-semibold text-destructive">{errors.email}</p> : null}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cd-phone" className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">{tr("Phone (optional)", "Téléphone (facultatif)")}</Label>
                  <Input id="cd-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" className="h-11 rounded-xl" aria-invalid={Boolean(errors.phone)} />
                  {errors.phone ? <p role="alert" className="text-xs font-semibold text-destructive">{errors.phone}</p> : null}
                </div>
              </div>

              <div className="space-y-3 rounded-xl border p-3">
                <label className="flex items-center justify-between gap-3 text-sm font-semibold text-primary">
                  <span>{tr("Account active", "Compte actif")}<span className="block text-xs font-normal text-muted-foreground">{tr("Turn off to block this administrator.", "Désactivez pour bloquer cet administrateur.")}</span></span>
                  <Switch checked={active} onCheckedChange={setActive} aria-label={tr("Account active", "Compte actif")} />
                </label>
                <label className="flex items-center justify-between gap-3 text-sm font-semibold text-primary">
                  <span>{tr("Ask him to choose his own password", "Lui faire choisir son mot de passe")}<span className="block text-xs font-normal text-muted-foreground">{tr("Recommended.", "Recommandé.")}</span></span>
                  <Switch checked={requireChange} onCheckedChange={setRequireChange} aria-label={tr("Require password change", "Exiger le changement de mot de passe")} />
                </label>
              </div>
            </section>

            <section className="space-y-3 rounded-2xl border-2 border-primary/30 bg-primary/5 p-4" aria-label={tr("Confirm it is you", "Confirmez que c'est vous")}>
              <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-primary">
                <ShieldCheck className="h-4 w-4" /> {tr("Confirm it is you", "Confirmez que c'est vous")}
              </h3>
              <p className="text-xs text-muted-foreground">{tr("Enter YOUR OWN matricule and password, not the administrator's.", "Saisissez VOTRE matricule et VOTRE mot de passe, pas ceux de l'administrateur.")}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="cd-own-matricule" className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">{tr("Your matricule", "Votre matricule")}</Label>
                  <Input id="cd-own-matricule" name="reauth-matricule" value={ownMatricule} onChange={(e) => setOwnMatricule(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} className="h-11 rounded-xl bg-white font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cd-own-password" className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">{tr("Your password", "Votre mot de passe")}</Label>
                  <Input id="cd-own-password" name="reauth-password" type="password" value={ownPassword} onChange={(e) => setOwnPassword(e.target.value)} autoComplete="off" className="h-11 rounded-xl bg-white" />
                </div>
              </div>
            </section>

            <section className="rounded-2xl bg-accent/30 p-4" aria-label={tr("What will change", "Ce qui va changer")}>
              <h3 className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">{tr("What will change", "Ce qui va changer")}</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-primary">
                {summary.map((line) => <li key={line}>{line}</li>)}
              </ul>
            </section>

            <div className="flex gap-3 rounded-2xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
              <p>{tr("All of this administrator's open sessions will be signed out immediately, and he will be notified by email (without the password).", "Toutes les sessions ouvertes de cet administrateur seront fermées immédiatement et il sera prévenu par e-mail (sans le mot de passe).")}</p>
            </div>

            {formError ? (
              <div role="alert" className="flex gap-2 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p>{formError}</p>
                  {remaining > 0 ? <p className="mt-1 font-black tabular-nums">{tr("Try again in", "Réessayez dans")} {mm}:{ss}</p> : null}
                </div>
              </div>
            ) : null}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>{tr("Cancel", "Annuler")}</Button>
              <Button type="submit" disabled={!canSubmit} className="h-12 gap-2 rounded-xl px-6 font-black">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                {remaining > 0 ? `${mm}:${ss}` : tr("Change login details", "Modifier les identifiants")}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
