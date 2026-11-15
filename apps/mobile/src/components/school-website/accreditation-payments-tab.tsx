"use client";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ACCREDITATION_LABELS, MINESUP_URL, type AccreditationLevel } from "@/lib/school-site-extras";
import { Field, SaveBar, Section, formatDateTime, useProfileForm, useTr, type TabProps } from "./shared";

const KEYS = [
  "whatsapp_number", "momo_number", "orange_money_number", "payment_note",
  "accreditation_level", "accreditation_reference", "accreditation_date",
] as const;
const LEVELS: AccreditationLevel[] = ["none", "authorized", "approved", "homologated"];

/** WhatsApp, Mobile Money (display only) and MINESUP accreditation details for the public site. */
export function AccreditationPaymentsTab({ profile, readOnly }: TabProps) {
  const tr = useTr();
  const form = useProfileForm(profile, KEYS);
  const { values, set, errors } = form;
  const accreditationEdited =
    values.accreditation_level !== profile.accreditation_level ||
    values.accreditation_reference !== profile.accreditation_reference ||
    (values.accreditation_date || null) !== (profile.accreditation_date || null);
  const numberHint = tr("With the country code, for example 237670000000.", "Avec l'indicatif du pays, par exemple 237670000000.");

  return (
    <div className="space-y-6">
      <Section
        title={tr("WhatsApp", "WhatsApp")}
        description={tr(
          "Visitors get a Chat on WhatsApp button with a ready-made message. The number is shown publicly.",
          "Les visiteurs voient un bouton Discuter sur WhatsApp avec un message pret. Le numero est affiche publiquement.",
        )}
      >
        <Field label={tr("WhatsApp number", "Numero WhatsApp")} htmlFor="sw-wa" error={errors.whatsapp_number} hint={numberHint}>
          <Input id="sw-wa" inputMode="tel" placeholder="237670000000" value={values.whatsapp_number} disabled={readOnly} onChange={(e) => set("whatsapp_number", e.target.value)} />
        </Field>
      </Section>

      <Section
        title={tr("Pay the application fee", "Payer les frais de dossier")}
        description={tr(
          "Shown on the admissions page as payment instructions. Display only: EduIgnite does not process or receive these payments.",
          "Affiche sur la page d'admission comme instructions de paiement. Affichage seulement : EduIgnite ne traite ni ne recoit ces paiements.",
        )}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="MTN Mobile Money" htmlFor="sw-momo" error={errors.momo_number} hint={numberHint}>
            <Input id="sw-momo" inputMode="tel" placeholder="237670000000" value={values.momo_number} disabled={readOnly} onChange={(e) => set("momo_number", e.target.value)} />
          </Field>
          <Field label="Orange Money" htmlFor="sw-om" error={errors.orange_money_number} hint={numberHint}>
            <Input id="sw-om" inputMode="tel" placeholder="237690000000" value={values.orange_money_number} disabled={readOnly} onChange={(e) => set("orange_money_number", e.target.value)} />
          </Field>
        </div>
        <Field label={tr("Payment note", "Note de paiement")} htmlFor="sw-paynote" count={values.payment_note.length} max={200} error={errors.payment_note}
          hint={tr("For example the account name and what to write as the reason.", "Par exemple le nom du titulaire et le motif a indiquer.")}>
          <Input id="sw-paynote" maxLength={200} value={values.payment_note} disabled={readOnly} onChange={(e) => set("payment_note", e.target.value)} />
        </Field>
      </Section>

      <Section
        title={tr("MINESUP accreditation", "Accreditation MINESUP")}
        description={tr(
          "Declare your accreditation. Visitors see it as declared by the institution until an EduIgnite administrator checks the document and verifies it. Changing these fields removes any earlier verification.",
          "Declarez votre accreditation. Les visiteurs la voient comme declaree par l'etablissement jusqu'a ce qu'un administrateur EduIgnite verifie le document. Modifier ces champs retire toute verification precedente.",
        )}
      >
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {profile.accreditation_verified ? (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
              {tr("Verified by EduIgnite", "Verifiee par EduIgnite")} {profile.accreditation_verified_at ? `(${formatDateTime(profile.accreditation_verified_at)})` : ""}
            </span>
          ) : (
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              {tr("Not verified", "Non verifiee")}
            </span>
          )}
          <a href={MINESUP_URL} target="_blank" rel="noopener noreferrer" className="text-xs underline underline-offset-4">MINESUP</a>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={tr("Level", "Niveau")} htmlFor="sw-acc-level" error={errors.accreditation_level}>
            <Select value={values.accreditation_level} disabled={readOnly} onValueChange={(next) => set("accreditation_level", next as AccreditationLevel)}>
              <SelectTrigger id="sw-acc-level"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LEVELS.map((level) => (
                  <SelectItem key={level} value={level}>{tr(ACCREDITATION_LABELS[level].en, ACCREDITATION_LABELS[level].fr)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={tr("Order or decision number", "Numero de l'arrete ou decision")} htmlFor="sw-acc-ref" count={values.accreditation_reference.length} max={120} error={errors.accreditation_reference}>
            <Input id="sw-acc-ref" maxLength={120} value={values.accreditation_reference} disabled={readOnly || values.accreditation_level === "none"} onChange={(e) => set("accreditation_reference", e.target.value)} />
          </Field>
          <Field label={tr("Date", "Date")} htmlFor="sw-acc-date" error={errors.accreditation_date}>
            <Input id="sw-acc-date" type="date" value={values.accreditation_date ?? ""} disabled={readOnly || values.accreditation_level === "none"} onChange={(e) => set("accreditation_date", e.target.value || null)} />
          </Field>
        </div>
        {profile.accreditation_verified && accreditationEdited ? (
          <p role="status" className="text-xs text-amber-700">
            {tr("Saving this change will remove the verification.", "Enregistrer ce changement retirera la verification.")}
          </p>
        ) : null}
      </Section>
      <SaveBar dirty={form.dirty} saving={form.saving} onSave={form.save} readOnly={readOnly} />
    </div>
  );
}
