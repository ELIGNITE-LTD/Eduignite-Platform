"use client";

/**
 * "My schools" on the school admin's profile: the schools linked to this
 * person, a big Switch button for each, a simple form to add a primary school
 * and another to link an existing school login.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Building2, Check, Copy, KeyRound, Loader2, Plus, Repeat } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api/errors";
import { useI18n } from "@/lib/i18n-context";
import {
  LINKED_SCHOOLS_QUERY_KEY,
  UnsyncedWorkError,
  createPrimarySchool,
  getLinkedSchools,
  linkExistingSchool,
  switchToSchool,
  type CreatedSchool,
  type LinkedAccount,
} from "@/lib/linked-schools";

const EMPTY_SCHOOL = { name: "", location: "", phone: "", principal: "", email: "" };

export function LinkedSchoolsCard() {
  const { language } = useI18n();
  const tr = (en: string, fr: string) => (language === "fr" ? fr : en);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<"none" | "create" | "link">("none");
  const [school, setSchool] = useState(EMPTY_SCHOOL);
  const [linkForm, setLinkForm] = useState({ matricule: "", password: "" });
  const [created, setCreated] = useState<CreatedSchool | null>(null);
  const [copied, setCopied] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: LINKED_SCHOOLS_QUERY_KEY,
    queryFn: getLinkedSchools,
    retry: 1,
  });

  const createMutation = useMutation({
    mutationFn: createPrimarySchool,
    onSuccess: (result) => {
      setCreated(result);
      setSchool(EMPTY_SCHOOL);
      setMode("none");
      queryClient.invalidateQueries({ queryKey: LINKED_SCHOOLS_QUERY_KEY });
    },
    onError: (error) =>
      toast({
        variant: "destructive",
        title: tr("Could not create the school", "Impossible de créer l'école"),
        description: getApiErrorMessage(error),
      }),
  });

  const linkMutation = useMutation({
    mutationFn: () => linkExistingSchool(linkForm.matricule, linkForm.password),
    onSuccess: () => {
      setLinkForm({ matricule: "", password: "" });
      setMode("none");
      queryClient.invalidateQueries({ queryKey: LINKED_SCHOOLS_QUERY_KEY });
      toast({ title: tr("School linked", "École liée"), description: tr("You can now switch to it.", "Vous pouvez maintenant y basculer.") });
    },
    onError: (error) =>
      toast({
        variant: "destructive",
        title: tr("Could not link this school", "Impossible de lier cette école"),
        description: getApiErrorMessage(error),
      }),
  });

  const handleSwitch = async (account: LinkedAccount) => {
    setSwitchingId(account.account_id);
    try {
      await switchToSchool(account.account_id);
    } catch (error) {
      setSwitchingId(null);
      toast({
        variant: "destructive",
        title: tr("Could not switch", "Impossible de basculer"),
        description:
          error instanceof UnsyncedWorkError
            ? tr(
                "Some changes are still waiting to sync. Reconnect and wait for them to finish, then switch.",
                "Certaines modifications attendent encore d'être synchronisées. Reconnectez-vous puis réessayez.",
              )
            : getApiErrorMessage(error),
      });
    }
  };

  const canSubmitSchool =
    school.name.trim().length >= 3 && school.location.trim() && school.phone.trim() && school.principal.trim();

  const categoryLabel = (category: string) =>
    category === "basic"
      ? tr("Primary / Nursery", "Primaire / Maternelle")
      : category === "higher"
        ? tr("Higher", "Supérieur")
        : tr("Secondary", "Secondaire");

  const statusBadge = (account: LinkedAccount) => {
    if (account.is_current) return <Badge className="bg-primary text-white">{tr("Current", "Actuelle")}</Badge>;
    if (account.status === "pending_activation")
      return <Badge variant="secondary">{tr("Pending activation", "En attente d'activation")}</Badge>;
    if (account.status === "suspended") return <Badge variant="destructive">{tr("Suspended", "Suspendue")}</Badge>;
    if (account.status === "inactive") return <Badge variant="destructive">{tr("Inactive", "Inactive")}</Badge>;
    return null;
  };

  const copyCredentials = async () => {
    if (!created) return;
    const text = `${tr("Matricule", "Matricule")}: ${created.credentials.matricule}\n${tr("Temporary password", "Mot de passe temporaire")}: ${created.credentials.temporary_password}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ variant: "destructive", title: tr("Copy failed. Please write it down.", "Copie impossible. Notez-le.") });
    }
  };

  return (
    <Card className="border-none shadow-sm bg-white">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl font-black text-primary uppercase tracking-tight">
          <Building2 className="w-5 h-5 text-secondary" />
          {tr("My schools", "Mes écoles")}
        </CardTitle>
        <CardDescription className="text-xs font-medium">
          {tr(
            "Each school keeps its own admin account. Switch between them here without typing a password.",
            "Chaque école garde son propre compte administrateur. Basculez de l'une à l'autre ici, sans mot de passe.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-6 h-6 animate-spin text-primary/30" />
          </div>
        ) : isError || !data ? (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-destructive/10 p-4 text-sm">
            <span className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> {tr("Could not load your schools.", "Impossible de charger vos écoles.")}
            </span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              {tr("Retry", "Réessayer")}
            </Button>
          </div>
        ) : (
          <ul className="space-y-3">
            {data.accounts.map((account) => (
              <li
                key={account.account_id}
                className="flex flex-col gap-3 rounded-2xl border border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-base font-black text-primary">{account.school_name}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{categoryLabel(account.education_category)}</Badge>
                    {statusBadge(account)}
                  </div>
                  <p className="font-mono text-xs text-muted-foreground">{account.matricule}</p>
                </div>
                {!account.is_current ? (
                  <Button
                    className="h-12 gap-2 rounded-xl px-6 text-base font-bold"
                    disabled={!account.can_switch || switchingId !== null}
                    onClick={() => handleSwitch(account)}
                  >
                    {switchingId === account.account_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Repeat className="h-4 w-4" />}
                    {tr("Switch", "Basculer")}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            variant={mode === "create" ? "default" : "outline"}
            className="h-12 flex-1 gap-2 rounded-xl font-bold"
            onClick={() => setMode(mode === "create" ? "none" : "create")}
          >
            <Plus className="h-4 w-4" /> {tr("Add a primary school", "Ajouter une école primaire")}
          </Button>
          <Button
            variant={mode === "link" ? "default" : "outline"}
            className="h-12 flex-1 gap-2 rounded-xl font-bold"
            onClick={() => setMode(mode === "link" ? "none" : "link")}
          >
            <KeyRound className="h-4 w-4" /> {tr("Link an existing school", "Lier une école existante")}
          </Button>
        </div>

        {mode === "create" ? (
          <form
            className="space-y-4 rounded-2xl bg-accent/30 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (canSubmitSchool && !createMutation.isPending) createMutation.mutate(school);
            }}
          >
            <p className="text-xs text-muted-foreground">
              {tr(
                "The new school is created as a draft and goes live once EduIgnite activates it.",
                "La nouvelle école est créée en brouillon et devient active après activation par EduIgnite.",
              )}
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>{tr("School name", "Nom de l'école")}</Label>
                <Input value={school.name} onChange={(e) => setSchool({ ...school, name: e.target.value })} className="h-12" required />
              </div>
              <div className="space-y-2">
                <Label>{tr("Location", "Localisation")}</Label>
                <Input value={school.location} onChange={(e) => setSchool({ ...school, location: e.target.value })} className="h-12" required />
              </div>
              <div className="space-y-2">
                <Label>{tr("Phone", "Téléphone")}</Label>
                <Input value={school.phone} onChange={(e) => setSchool({ ...school, phone: e.target.value })} placeholder="+237 6XX XX XX XX" className="h-12" required />
              </div>
              <div className="space-y-2">
                <Label>{tr("Head teacher / principal", "Directeur / directrice")}</Label>
                <Input value={school.principal} onChange={(e) => setSchool({ ...school, principal: e.target.value })} className="h-12" required />
              </div>
              <div className="space-y-2">
                <Label>{tr("Email (optional)", "Email (facultatif)")}</Label>
                <Input type="email" value={school.email} onChange={(e) => setSchool({ ...school, email: e.target.value })} className="h-12" />
              </div>
            </div>
            <Button type="submit" className="h-12 w-full gap-2 rounded-xl font-bold" disabled={!canSubmitSchool || createMutation.isPending}>
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {tr("Create school", "Créer l'école")}
            </Button>
          </form>
        ) : null}

        {mode === "link" ? (
          <form
            className="space-y-4 rounded-2xl bg-accent/30 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (linkForm.matricule.trim() && linkForm.password && !linkMutation.isPending) linkMutation.mutate();
            }}
          >
            <p className="text-xs text-muted-foreground">
              {tr(
                "Enter the matricule and password of the other school's admin account. You only do this once.",
                "Saisissez le matricule et le mot de passe du compte administrateur de l'autre école. Une seule fois.",
              )}
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Matricule</Label>
                <Input value={linkForm.matricule} onChange={(e) => setLinkForm({ ...linkForm, matricule: e.target.value })} autoComplete="off" className="h-12" required />
              </div>
              <div className="space-y-2">
                <Label>{tr("Password", "Mot de passe")}</Label>
                <Input type="password" value={linkForm.password} onChange={(e) => setLinkForm({ ...linkForm, password: e.target.value })} autoComplete="off" className="h-12" required />
              </div>
            </div>
            <Button type="submit" className="h-12 w-full gap-2 rounded-xl font-bold" disabled={linkMutation.isPending}>
              {linkMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              {tr("Link school", "Lier l'école")}
            </Button>
          </form>
        ) : null}
      </CardContent>

      <Dialog open={Boolean(created)} onOpenChange={(open) => !open && setCreated(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr("School created", "École créée")}</DialogTitle>
            <DialogDescription>
              {tr(
                "Keep these login details now. The password is shown only once.",
                "Conservez ces identifiants maintenant. Le mot de passe n'est affiché qu'une seule fois.",
              )}
            </DialogDescription>
          </DialogHeader>
          {created ? (
            <div className="space-y-3">
              <p className="font-black text-primary">{created.school.name}</p>
              <div className="rounded-xl bg-accent/40 p-4 font-mono text-sm">
                <p>Matricule: {created.credentials.matricule}</p>
                <p>{tr("Temporary password", "Mot de passe temporaire")}: {created.credentials.temporary_password}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                {tr(
                  "The school is waiting for EduIgnite to activate it. After activation, switch to it from this page, or sign in with these details and choose a new password.",
                  "L'école attend l'activation par EduIgnite. Après activation, basculez-y depuis cette page, ou connectez-vous avec ces identifiants et choisissez un nouveau mot de passe.",
                )}
              </p>
            </div>
          ) : null}
          <DialogFooter className="gap-2">
            <Button variant="outline" className="gap-2" onClick={copyCredentials}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? tr("Copied", "Copié") : tr("Copy", "Copier")}
            </Button>
            <Button onClick={() => setCreated(null)}>{tr("I saved them", "Je les ai notés")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
