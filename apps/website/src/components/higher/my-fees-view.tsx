"use client";

import { FileText, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { generateBrandedTablePdf } from "@/lib/pdf-branded";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useHigherMyFees } from "@/lib/hooks/useHigherEd";
import { formatXaf } from "@/lib/api/services/higher-ed.service";
import { LoadFailed, Loading, useHigherText } from "./higher-shared";
import { useChildPicker } from "./child-picker";

export function MyFeesView() {
  const tr = useHigherText();
  const { child, picker, hasChildren } = useChildPicker();
  const query = useHigherMyFees(child);
  const list = query.data ?? [];
  const { user } = useAuth();

  async function statementPdf(s: (typeof list)[number]) {
    await generateBrandedTablePdf({
      ministry: "higher",
      title: tr("Fee Statement", "Relevé de scolarité"), school: user?.school as never, schoolName: user?.school?.name || "EduIgnite",
      chips: [{ label: tr("Student", "Étudiant"), value: user?.name || "" }, { label: tr("Programme", "Filière"), value: `${s.programme} (${tr("Level", "Niveau")} ${s.level})` }, { label: tr("Academic year", "Année"), value: s.academic_year }, { label: tr("Balance", "Solde"), value: formatXaf(s.balance) }],
      issuingOffice: tr("Finance Office", "Service financier"),
      columns: [tr("Date", "Date"), tr("Description", "Description"), tr("Receipt", "Reçu"), tr("Amount (XAF)", "Montant (XAF)")],
      rows: [
        ...s.fees.map((f) => ["", f.name, "", f.amount]),
        ...s.payments.map((p) => [p.paid_on, `${tr("Payment", "Paiement")} - ${p.method_label}${p.reference ? ` (${p.reference})` : ""}`, p.receipt_number, -p.amount]),
      ],
      monoColumns: [2], centerColumns: [0], footnote: `${tr("Total fees", "Total des frais")}: ${formatXaf(s.billed)}  |  ${tr("Paid", "Payé")}: ${formatXaf(s.paid)}  |  ${tr("Balance", "Solde")}: ${formatXaf(s.balance)}`,
      fileName: `fee_statement_${s.academic_year}`.replace(/[^\w]+/g, "_"),
    });
  }
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <header className="space-y-2 rounded-3xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5 sm:p-7">
        <h1 className="font-headline text-2xl font-black tracking-tight text-primary sm:text-3xl">{tr("My fees", "Mes frais")}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">{tr("What you owe each academic year, what you have paid, and your receipts.", "Ce que vous devez chaque année académique, ce que vous avez payé et vos reçus.")}</p>
        {picker}
      </header>
      {!hasChildren ? <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">{tr("No student is linked to your account at this institution yet. Ask the administration to link your child.", "Aucun étudiant n'est lié à votre compte dans cet établissement. Demandez à l'administration de lier votre enfant.")}</p> : query.isLoading ? <Loading /> : query.isError ? <LoadFailed /> : list.length === 0 ? (
        <Card className="rounded-3xl border-none shadow-sm"><CardContent className="flex flex-col items-center gap-2 py-10 text-center">
          <Wallet className="h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="font-medium">{tr("No fees yet", "Aucun frais pour l'instant")}</p>
        </CardContent></Card>
      ) : list.map((s) => (
        <Card key={s.enrolment}>
          <CardHeader>
            <CardTitle className="text-base">{s.academic_year} · {s.programme} ({tr("Level", "Niveau")} {s.level})</CardTitle>
            <CardDescription>
              {s.status === "paid" ? tr("Fully paid", "Soldé") : s.status === "no_fees" ? tr("No fees set for your level yet", "Aucun frais défini pour votre niveau") : `${tr("Balance", "Reste à payer")}: ${formatXaf(s.balance)}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ul className="space-y-1">
              {s.fees.map((f) => <li key={f.name} className="flex justify-between"><span>{f.name}</span><span>{formatXaf(f.amount)}</span></li>)}
              <li className="flex justify-between border-t pt-1 font-medium"><span>{tr("Total", "Total")}</span><span>{formatXaf(s.billed)}</span></li>
              <li className="flex justify-between"><span>{tr("Paid", "Payé")}</span><span>{formatXaf(s.paid)}</span></li>
            </ul>
            {s.payments.length > 0 ? (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">{tr("Payments and receipts", "Paiements et reçus")}</p>
                <ul className="space-y-1">
                  {s.payments.map((p) => <li key={p.id} className="flex justify-between text-xs"><span>{p.receipt_number} · {p.method_label} · {p.paid_on}</span><span>{formatXaf(p.amount)}</span></li>)}
                </ul>
              </div>
            ) : null}
            <Button type="button" variant="outline" size="sm" onClick={() => statementPdf(s)}><FileText className="mr-1.5 h-4 w-4" />{tr("Download statement (PDF)", "Télécharger le relevé (PDF)")}</Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
