"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useHigherAcademicYears, useHigherProgrammes } from "@/lib/hooks/useHigherEd";
import {
  formatXaf, higherEdFinanceService as api,
  type HigherBalances, type HigherBalanceRow, type HigherFee, type HigherPayment, type HigherPayMethod,
} from "@/lib/api/services/higher-ed.service";
import { LoadFailed, Loading, selectClass, useHigherRunner, useHigherText } from "./higher-shared";
import { useAuth } from "@/lib/auth-context";
import { generateReceiptPdf } from "@/lib/pdf-branded";
import { HigherTable, StatusBadge } from "./higher-table";

type Tab = "balances" | "fees" | "payments";

/** The receipt is a branded PDF that downloads straight away (a popup window opened after saving is blocked by browsers). */
function printReceipt(p: HigherPayment, schoolName: string) {
  generateReceiptPdf({
    schoolName: schoolName || "EduIgnite",
    title: p.is_void ? "PAYMENT RECEIPT / REÇU DE PAIEMENT (CANCELLED)" : "PAYMENT RECEIPT / REÇU DE PAIEMENT",
    lines: [
      ["Receipt no.", p.receipt_number],
      ["Student", `${p.student_name} (${p.matricule})`],
      ["Programme", `${p.programme}, level ${p.level}`],
      ["Academic year", p.academic_year],
      ["Amount paid", formatXaf(p.amount)],
      ["Paid by", p.method_label],
      ["Date", p.paid_on],
      ["Received by", p.received_by || "-"],
    ],
    reference: p.reference || undefined,
    fileName: `receipt_${p.receipt_number}`,
  });
}

function PayForm({ row, onDone, onCancel }: { row: HigherBalanceRow; onDone: () => void; onCancel: () => void }) {
  const tr = useHigherText();
  const { user } = useAuth();
  const { run, busy } = useHigherRunner();
  const [amount, setAmount] = useState(row.balance ? String(row.balance) : "");
  const [method, setMethod] = useState<HigherPayMethod>("cash");
  const [reference, setReference] = useState("");
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const needsRef = method !== "cash" && method !== "other";

  async function submit() {
    let receipt: HigherPayment | null = null;
    const ok = await run(async () => {
      receipt = await api.pay({ enrolment: row.enrolment, amount: Number(amount), method, paid_on: paidOn, reference });
    }, tr("Payment recorded.", "Paiement enregistré."));
    if (ok) {
      onDone();
      if (receipt) printReceipt(receipt, user?.school?.name || "");
    }
  }

  return (
    <div className="space-y-3 rounded-2xl bg-muted/40 p-3">
      <p className="text-sm font-medium">{tr("Record a payment for", "Enregistrer un paiement pour")} {row.student_name}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label htmlFor="pay-amount">{tr("Amount (XAF)", "Montant (XAF)")}</Label>
          <Input id="pay-amount" type="number" inputMode="numeric" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div><Label htmlFor="pay-method">{tr("How was it paid?", "Mode de paiement")}</Label>
          <select id="pay-method" className={selectClass} value={method} onChange={(e) => setMethod(e.target.value as HigherPayMethod)}>
            <option value="cash">{tr("Cash", "Espèces")}</option>
            <option value="mtn_momo">MTN Mobile Money</option>
            <option value="orange_money">Orange Money</option>
            <option value="bank">{tr("Bank transfer or deposit", "Virement ou versement bancaire")}</option>
            <option value="other">{tr("Other", "Autre")}</option>
          </select></div>
        <div><Label htmlFor="pay-ref">{needsRef ? tr("Transaction or deposit reference", "Référence de la transaction ou du versement") : tr("Reference (optional)", "Référence (facultatif)")}</Label>
          <Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} /></div>
        <div><Label htmlFor="pay-date">{tr("Date", "Date")}</Label>
          <Input id="pay-date" type="date" max={new Date().toISOString().slice(0, 10)} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} /></div>
      </div>
      <div className="flex gap-2">
        <Button type="button" disabled={busy || !amount || Number(amount) <= 0 || (needsRef && !reference.trim())} onClick={submit}>{tr("Save and print receipt", "Enregistrer et imprimer le reçu")}</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>{tr("Cancel", "Annuler")}</Button>
      </div>
    </div>
  );
}

function BalancesTab({ yearId, onChanged }: { yearId: string; onChanged: () => void }) {
  const tr = useHigherText();
  const [data, setData] = useState<HigherBalances | null>(null);
  const [failed, setFailed] = useState(false);
  const q = "";
  const [status, setStatus] = useState("");
  const [paying, setPaying] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    api.balances({ academic_year: yearId || undefined, q, status }).then((d) => { if (!cancelled) setData(d); }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [yearId, q, status, tick]);

  if (failed) return <LoadFailed />;
  if (!data) return <Loading />;
  const s = data.summary;
  const label: Record<string, string> = {
    paid: tr("Paid", "Soldé"), partial: tr("Part paid", "Partiel"), unpaid: tr("Unpaid", "Impayé"), no_fees: tr("No fees set", "Pas de frais"),
  };
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {[[tr("Expected", "Attendu"), formatXaf(s.billed)], [tr("Collected", "Encaissé"), formatXaf(s.collected)],
          [tr("Outstanding", "Reste à payer"), formatXaf(s.outstanding)], [tr("Students owing", "Étudiants débiteurs"), String(s.defaulters)]].map(([k, v]) => (
          <Card key={k}><CardHeader className="pb-1"><CardDescription>{k}</CardDescription></CardHeader><CardContent><p className="text-xl font-bold">{v}</p></CardContent></Card>
        ))}
      </div>
      <HigherTable<HigherBalanceRow>
        rows={data.rows}
        rowKey={(r) => r.enrolment}
        label={tr("students", "étudiants")}
        searchPlaceholder={tr("Search name or matricule", "Rechercher nom ou matricule")}
        empty={tr("No students for this academic year yet.", "Aucun étudiant pour cette année académique.")}
        exportConfig={{
          title: tr("Fee Balances", "État des soldes de scolarité"), fileName: "fee_balances",
          issuingOffice: tr("Finance Office", "Service financier"),
          chips: [{ label: tr("Academic year", "Année"), value: data.academic_year.name }, { label: tr("Collected", "Encaissé"), value: formatXaf(s.collected) }, { label: tr("Outstanding", "Reste"), value: formatXaf(s.outstanding) }],
        }}
        filters={(
          <select className={`${selectClass} max-w-[12rem]`} value={status} onChange={(e) => setStatus(e.target.value)} aria-label={tr("Filter", "Filtrer")}>
            <option value="">{tr("All students", "Tous")}</option>
            <option value="unpaid">{tr("Unpaid", "Impayé")}</option>
            <option value="partial">{tr("Part paid", "Partiel")}</option>
            <option value="paid">{tr("Paid", "Soldé")}</option>
          </select>
        )}
        columns={[
          { key: "matricule", header: tr("Matricule", "Matricule"), value: (r) => r.matricule, mono: true },
          { key: "name", header: tr("Student", "Étudiant"), value: (r) => r.student_name, render: (r) => <span className="font-medium">{r.student_name}</span> },
          { key: "programme", header: tr("Programme", "Filière"), value: (r) => `${r.programme} (L${r.level})` },
          { key: "billed", header: tr("Fees (XAF)", "Frais (XAF)"), value: (r) => r.billed, money: true, render: (r) => formatXaf(r.billed), align: "right" },
          { key: "paid", header: tr("Paid (XAF)", "Payé (XAF)"), value: (r) => r.paid, money: true, render: (r) => formatXaf(r.paid), align: "right" },
          { key: "balance", header: tr("Balance (XAF)", "Solde (XAF)"), value: (r) => r.balance, money: true, render: (r) => (r.overpaid > 0 ? <span className="font-semibold text-emerald-700" title={tr("Paid more than the fees: this is a credit.", "A payé plus que les frais : c'est un crédit.")}>{tr("Credit", "Crédit")} {formatXaf(r.overpaid)}</span> : <span className="font-semibold">{formatXaf(r.balance)}</span>), align: "right" },
          { key: "status", header: tr("Status", "Statut"), value: (r) => label[r.status],
            render: (r) => <StatusBadge tone={r.status === "paid" ? "green" : r.status === "partial" ? "amber" : r.status === "unpaid" ? "red" : "slate"}>{label[r.status]}</StatusBadge> },
          { key: "act", header: "", value: () => "", noExport: true, sortable: false, align: "right",
            render: (r) => <Button type="button" size="sm" variant="outline" onClick={() => setPaying(paying === r.enrolment ? null : r.enrolment)}>{tr("Record payment", "Encaisser")}</Button> },
        ]}
      />
      {paying ? (() => {
        const row = data.rows.find((r) => r.enrolment === paying);
        return row ? <PayForm row={row} onCancel={() => setPaying(null)} onDone={() => { setPaying(null); setTick((n) => n + 1); onChanged(); }} /> : null;
      })() : null}
    </div>
  );
}

function FeesTab({ yearId }: { yearId: string }) {
  const tr = useHigherText();
  const { run, busy } = useHigherRunner();
  const programmes = useHigherProgrammes();
  const [fees, setFees] = useState<HigherFee[] | null>(null);
  const [levelId, setLevelId] = useState("");
  const [name, setName] = useState("Tuition");
  const [amount, setAmount] = useState("");

  const load = useCallback(() => { api.fees(yearId || undefined).then(setFees).catch(() => setFees([])); }, [yearId]);
  useEffect(() => { load(); }, [load]);

  const levels = useMemo(() => (programmes.data ?? []).flatMap((p) => p.years.map((y) => ({ id: y.id, label: `${p.name} · ${y.label || `${tr("Level", "Niveau")} ${y.number}`}` }))), [programmes.data]);
  if (!fees) return <Loading />;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-2xl bg-muted/40 p-3 sm:grid-cols-4">
        <div className="sm:col-span-2"><Label htmlFor="fee-level">{tr("Programme and level", "Filière et niveau")}</Label>
          <select id="fee-level" className={selectClass} value={levelId} onChange={(e) => setLevelId(e.target.value)}>
            <option value="">{tr("Choose...", "Choisir...")}</option>
            {levels.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select></div>
        <div><Label htmlFor="fee-name">{tr("Fee name", "Nom du frais")}</Label><Input id="fee-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><Label htmlFor="fee-amount">{tr("Amount (XAF)", "Montant (XAF)")}</Label><Input id="fee-amount" type="number" inputMode="numeric" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div className="sm:col-span-4"><Button type="button" disabled={busy || !levelId || !amount || !yearId} onClick={async () => {
          if (await run(() => api.saveFee({ programme_year: levelId, academic_year: yearId, name, amount: Number(amount) }), tr("Fee saved.", "Frais enregistré."))) { setAmount(""); load(); }
        }}>{tr("Save fee", "Enregistrer")}</Button>
          <p className="mt-2 text-xs text-muted-foreground">{tr("Every student in that level owes the total of its fee lines (for example tuition plus registration). Saving the same name again changes its amount.", "Chaque étudiant de ce niveau doit le total de ses lignes de frais (par exemple scolarité plus inscription). Enregistrer le même nom modifie le montant.")}</p></div>
      </div>
      {fees.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{tr("No fees set for this academic year yet.", "Aucun frais défini pour cette année académique.")}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs"><tr><th className="p-2">{tr("Programme", "Filière")}</th><th className="p-2">{tr("Level", "Niveau")}</th><th className="p-2">{tr("Fee", "Frais")}</th><th className="p-2">{tr("Amount", "Montant")}</th><th className="p-2" /></tr></thead>
            <tbody>{fees.map((f) => (
              <tr key={f.id} className="border-t">
                <td className="p-2">{f.programme}</td><td className="p-2">{f.level}</td><td className="p-2">{f.name}</td><td className="p-2">{formatXaf(f.amount)}</td>
                <td className="p-2 text-right"><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={async () => { if (await run(() => api.deleteFee(f.id), tr("Fee removed.", "Frais supprimé."))) load(); }}>{tr("Remove", "Retirer")}</Button></td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PaymentsTab({ yearId, version }: { yearId: string; version: number }) {
  const { user } = useAuth();
  const tr = useHigherText();
  const { run, busy } = useHigherRunner();
  const [list, setList] = useState<HigherPayment[] | null>(null);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const load = useCallback(() => { api.payments({ academic_year: yearId || undefined }).then(setList).catch(() => setList([])); }, [yearId]);
  useEffect(() => { load(); }, [load, version]);
  if (!list) return <Loading />;
  return (
    <div className="space-y-3">
      <HigherTable<HigherPayment>
        rows={list}
        rowKey={(p) => p.id}
        label={tr("payments", "paiements")}
        searchPlaceholder={tr("Search receipt, student, reference", "Rechercher reçu, étudiant, référence")}
        empty={tr("No payments recorded yet.", "Aucun paiement enregistré.")}
        exportConfig={{ title: tr("Payments Register", "Registre des paiements"), fileName: "payments_register", issuingOffice: tr("Finance Office", "Service financier") }}
        rowClassName={(p) => (p.is_void ? "opacity-60" : undefined)}
        columns={[
          { key: "receipt", header: tr("Receipt", "Reçu"), value: (p) => p.receipt_number, mono: true },
          { key: "date", header: tr("Date", "Date"), value: (p) => p.paid_on },
          { key: "student", header: tr("Student", "Étudiant"), value: (p) => `${p.student_name} (${p.matricule})`, render: (p) => <span><span className="font-medium">{p.student_name}</span><span className="block text-xs text-muted-foreground">{p.matricule}</span></span> },
          { key: "amount", header: tr("Amount (XAF)", "Montant (XAF)"), value: (p) => p.amount, money: true, render: (p) => <span className={p.is_void ? "line-through" : "font-semibold"}>{formatXaf(p.amount)}</span>, align: "right" },
          { key: "method", header: tr("Method", "Mode"), value: (p) => `${p.method_label}${p.reference ? ` · ${p.reference}` : ""}` },
          { key: "by", header: tr("Received by", "Reçu par"), value: (p) => p.received_by },
          { key: "state", header: tr("Status", "Statut"), value: (p) => (p.is_void ? tr("Cancelled", "Annulé") : tr("Valid", "Valide")), render: (p) => <StatusBadge tone={p.is_void ? "red" : "green"}>{p.is_void ? tr("Cancelled", "Annulé") : tr("Valid", "Valide")}</StatusBadge> },
          { key: "act", header: "", value: () => "", noExport: true, sortable: false, align: "right",
            render: (p) => (<span className="whitespace-nowrap">
              <Button type="button" size="sm" variant="outline" onClick={() => printReceipt(p, user?.school?.name || "")}>{tr("Receipt", "Reçu")}</Button>
              {!p.is_void ? <Button type="button" size="sm" variant="ghost" onClick={() => { setVoiding(voiding === p.id ? null : p.id); setReason(""); }}>{tr("Cancel", "Annuler")}</Button> : null}
            </span>) },
        ]}
      />
      {voiding ? (
        <div className="flex flex-wrap items-end gap-2 rounded-2xl bg-muted/40 p-3">
          <div className="min-w-[16rem] flex-1"><Label htmlFor="void-reason">{tr("Why is this payment cancelled?", "Pourquoi annuler ce paiement ?")}</Label><Input id="void-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <Button type="button" variant="destructive" disabled={busy || !reason.trim()} onClick={async () => { if (await run(() => api.voidPayment(voiding, reason), tr("Payment cancelled.", "Paiement annulé."))) { setVoiding(null); load(); } }}>{tr("Cancel this payment", "Annuler ce paiement")}</Button>
        </div>
      ) : null}
    </div>
  );
}

export function FinanceManager() {
  const tr = useHigherText();
  const years = useHigherAcademicYears();
  const [tab, setTab] = useState<Tab>("balances");
  const [yearId, setYearId] = useState("");
  const [version, setVersion] = useState(0);
  const list = years.data ?? [];
  const effective = yearId || list.find((y) => y.is_current)?.id || list[0]?.id || "";

  const tabs: Array<[Tab, string]> = [["balances", tr("Balances", "Soldes")], ["fees", tr("Fees", "Frais")], ["payments", tr("Payments", "Paiements")]];
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <header className="space-y-2 rounded-3xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5 sm:p-7">
        <h1 className="font-headline text-2xl font-black tracking-tight text-primary sm:text-3xl">{tr("Finance", "Finance")}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">{tr("Set the fees for each programme level, record what students pay (cash, MTN Mobile Money, Orange Money or bank) and see who still owes.", "Fixez les frais de chaque niveau, enregistrez les paiements (espèces, MTN Mobile Money, Orange Money ou banque) et voyez qui doit encore.")}</p>
      </header>
      {years.isLoading ? <Loading /> : list.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{tr("Add an academic year in the setup steps first.", "Ajoutez d'abord une année académique dans les étapes de configuration.")}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 rounded-lg bg-muted p-1" role="tablist">
              {tabs.map(([key, text]) => (
                <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
                  className={`rounded-md px-3 py-1.5 text-sm ${tab === key ? "bg-background font-medium shadow-sm" : "text-muted-foreground"}`}>{text}</button>
              ))}
            </div>
            <select className={`${selectClass} ml-auto max-w-[12rem]`} value={effective} onChange={(e) => setYearId(e.target.value)} aria-label={tr("Academic year", "Année académique")}>
              {list.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
            </select>
          </div>
          {tab === "balances" ? <BalancesTab yearId={effective} onChanged={() => setVersion((n) => n + 1)} /> : null}
          {tab === "fees" ? <FeesTab yearId={effective} /> : null}
          {tab === "payments" ? <PaymentsTab yearId={effective} version={version} /> : null}
        </>
      )}
    </div>
  );
}
