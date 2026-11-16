"use client";

import { Wallet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useHigherMyFees } from "@/lib/hooks/useHigherEd";
import { formatXaf } from "@/lib/api/services/higher-ed.service";
import { LoadFailed, Loading, useHigherText } from "./higher-shared";

export function MyFeesView() {
  const tr = useHigherText();
  const query = useHigherMyFees();
  const list = query.data ?? [];
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <header className="space-y-2 rounded-3xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5 sm:p-7">
        <h1 className="font-headline text-2xl font-black tracking-tight text-primary sm:text-3xl">{tr("My fees", "Mes frais")}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">{tr("What you owe each academic year, what you have paid, and your receipts.", "Ce que vous devez chaque année académique, ce que vous avez payé et vos reçus.")}</p>
      </header>
      {query.isLoading ? <Loading /> : query.isError ? <LoadFailed /> : list.length === 0 ? (
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
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
