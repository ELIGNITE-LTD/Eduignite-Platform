"use client";

/**
 * Controls and staff list for the Basic Education ID card template, used by
 * the ID cards page. Kept out of the page so the secondary-school page stays
 * as it was.
 */

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { BasicIdCardOptions } from "@/components/basic-education-id-card";

export type CardTemplateChoice = "basic" | "classic";
export type CardListMode = "students" | "staff";

export interface StaffCardRow {
  id: string;
  name: string;
  matricule: string;
  role: string;
  phone: string;
  avatar: string;
}

export function BasicCardControls({
  template,
  onTemplateChange,
  mode,
  onModeChange,
  options,
  onOptionsChange,
  fr,
}: {
  template: CardTemplateChoice;
  onTemplateChange: (value: CardTemplateChoice) => void;
  mode: CardListMode;
  onModeChange: (value: CardListMode) => void;
  options: BasicIdCardOptions;
  onOptionsChange: (patch: Partial<BasicIdCardOptions>) => void;
  fr: boolean;
}) {
  const t = (en: string, french: string) => (fr ? french : en);
  return (
    <Card className="border-none shadow-xl rounded-3xl">
      <CardContent className="p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-[10px] font-black uppercase tracking-widest">{t("Card template", "Modèle de carte")}</Label>
            <Select value={template} onValueChange={(v) => onTemplateChange(v as CardTemplateChoice)}>
              <SelectTrigger className="h-11 bg-accent/20 border-none rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="basic">{t("Basic Education (nursery and primary)", "Éducation de base (maternelle et primaire)")}</SelectItem>
                <SelectItem value="classic">{t("Classic secondary-school card", "Carte classique du secondaire")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {template === "basic" && (
            <>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest">{t("Cards for", "Cartes pour")}</Label>
                <div className="inline-flex rounded-xl bg-accent/20 p-1" role="tablist">
                  {(["students", "staff"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="tab"
                      aria-selected={mode === m}
                      onClick={() => onModeChange(m)}
                      className={cn(
                        "rounded-lg px-5 py-2 text-sm font-semibold transition",
                        mode === m ? "bg-white text-primary shadow-sm" : "text-muted-foreground hover:text-primary",
                      )}
                    >
                      {m === "students" ? t("Pupils", "Élèves") : t("Staff", "Personnel")}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest">{t("Accent colour", "Couleur d'accent")}</Label>
                <div className="flex items-center gap-2">
                  <Select value={options.accent} onValueChange={(v) => onOptionsChange({ accent: v as BasicIdCardOptions["accent"] })}>
                    <SelectTrigger className="h-11 flex-1 bg-accent/20 border-none rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">{t("Default (navy and blue)", "Par défaut (bleu marine)")}</SelectItem>
                      <SelectItem value="school">{t("School colour", "Couleur de l'école")}</SelectItem>
                    </SelectContent>
                  </Select>
                  {options.accent === "school" && (
                    <input
                      type="color"
                      aria-label={t("School colour", "Couleur de l'école")}
                      value={/^#[0-9a-fA-F]{6}$/.test(options.schoolColor) ? options.schoolColor : "#0F766E"}
                      onChange={(e) => onOptionsChange({ schoolColor: e.target.value })}
                      className="h-11 w-12 cursor-pointer rounded-xl border-none bg-transparent p-0"
                    />
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {template === "basic" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="md:col-span-2 space-y-1.5">
              <Label className="text-[10px] font-black uppercase tracking-widest">
                {t("Return note on the back (empty = standard wording)", "Note de retour au verso (vide = texte standard)")}
              </Label>
              <Input
                maxLength={200}
                value={options.returnNote}
                onChange={(e) => onOptionsChange({ returnNote: e.target.value })}
                placeholder={t("If found, please return to the school.", "En cas de perte, prière de ramener la carte à l'école.")}
                className="h-11 bg-accent/20 border-none rounded-xl"
              />
            </div>
            <div className="flex flex-wrap gap-6 pb-2">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <Checkbox checked={options.showQr} onCheckedChange={(v) => onOptionsChange({ showQr: v === true })} />
                {t("QR code", "Code QR")}
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold">
                <Checkbox checked={options.flag} onCheckedChange={(v) => onOptionsChange({ flag: v === true })} />
                {t("Cameroon flag", "Drapeau du Cameroun")}
              </label>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function BasicStaffTable({
  rows,
  selected,
  onToggle,
  onToggleAll,
  search,
  onSearchChange,
  fr,
  loading,
}: {
  rows: StaffCardRow[];
  selected: string[];
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  search: string;
  onSearchChange: (value: string) => void;
  fr: boolean;
  loading: boolean;
}) {
  const t = (en: string, french: string) => (fr ? french : en);
  return (
    <Card className="border-none shadow-xl overflow-hidden rounded-3xl">
      <CardHeader className="bg-white border-b p-6">
        <Input
          placeholder={t("Find staff by name or matricule...", "Rechercher par nom ou matricule...")}
          className="h-11 bg-accent/20 border-none rounded-xl"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-accent/10 border-b border-accent/20">
              <TableHead className="w-[50px] pl-8">
                <Checkbox checked={rows.length > 0 && selected.length === rows.length} onCheckedChange={onToggleAll} />
              </TableHead>
              <TableHead className="font-black uppercase text-[10px] tracking-widest py-4">Matricule</TableHead>
              <TableHead className="font-black uppercase text-[10px] tracking-widest">{t("Staff member", "Membre du personnel")}</TableHead>
              <TableHead className="font-black uppercase text-[10px] tracking-widest">{t("Position", "Fonction")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                  {loading ? t("Loading staff...", "Chargement du personnel...") : t("No staff found.", "Aucun membre du personnel.")}
                </TableCell>
              </TableRow>
            )}
            {rows.map((u) => (
              <TableRow key={u.id} className={cn("hover:bg-accent/5 border-b border-accent/10", selected.includes(u.id) && "bg-primary/5")}>
                <TableCell className="pl-8">
                  <Checkbox checked={selected.includes(u.id)} onCheckedChange={() => onToggle(u.id)} />
                </TableCell>
                <TableCell className="font-mono text-xs font-bold text-primary">{u.matricule || "-"}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 border-2 border-white shadow-sm ring-1 ring-accent">
                      <AvatarImage src={u.avatar} />
                      <AvatarFallback className="bg-primary/5 text-primary text-xs">{u.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <span className="font-bold text-sm text-primary">{u.name}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px] border-primary/20 text-primary font-bold">{u.role}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
