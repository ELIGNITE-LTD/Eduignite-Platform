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

type Tab = "balances" | "fees" | "payments";

function printReceipt(p: HigherPayment) {
  const w = window.open("", "_blank", "width=480,height=640");
  if (!w) return;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
  w.document.write(`<!doctype html><title>${esc(p.receipt_number)}</title><body style="font-family:sans-serif;padding:24px">
<h2>Receipt / Reçu</h2><p><b>${esc(p.receipt_number)}</b></p>
<p>${esc(p.student_name)} (${esc(p.matricule)})<br>${esc(p.programme)}, level ${p.level}, ${esc(p.academic_year)}</p>
<p style="font-size:22px"><b>${esc(formatXaf(p.amount))}</b></p>
<p>${esc(p.method_label)}${p.reference ? " · " + esc(p.reference) : ""}<br>${esc(p.paid_on)}</p>
<p>Received by: ${esc(p.received_by || "-")}</p>${p.is_void ? "<p><b>CANCELLED</b></p>" : ""}</body>`);
  w.document.close();
  w.focus();
  w.print();
}

function PayForm({ row, onDone, onCancel }: { row: HigherBalanceRow; onDone: () => void; onCancel: () => void }) {
  const tr = useHigherText();
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
      if (receipt) printReceipt(receipt);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
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
  const [q, setQ] = useState("");
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
      <div className="flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder={tr("Search name or matricule", "Rechercher nom ou matricule")} value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={`${selectClass} max-w-[12rem]`} value={status} onChange={(e) => setStatus(e.target.value)} aria-label={tr("Filter", "Filtrer")}>
          <option value="">{tr("All students", "Tous")}</option>
          <option value="unpaid">{tr("Unpaid", "Impayé")}</option>
          <option value="partial">{tr("Part paid", "Partiel")}</option>
          <option value="paid">{tr("Paid", "Soldé")}</option>
        </select>
      </div>
      {data.rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{tr("No students for this academic year yet.", "Aucun étudiant pour cette année académique.")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs"><tr>
              <th className="p-2">{tr("Student", "Étudiant")}</th><th className="p-2">{tr("Programme", "Filière")}</th>
              <th className="p-2">{tr("Fees", "Frais")}</th><th className="p-2">{tr("Paid", "Payé")}</th><th className="p-2">{tr("Balance", "Solde")}</th><th className="p-2" />
            </tr></thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.enrolment} className="border-t align-top">
                  <td className="p-2"><span className="font-medium">{r.student_name}</span><span className="block text-xs text-muted-foreground">{r.matricule}</span></td>
                  <td className="p-2">{r.programme}<span className="block text-xs text-muted-foreground">{tr("Level", "Niveau")} {r.level}</span></td>
                  <td className="p-2">{formatXaf(r.billed)}</td><td className="p-2">{formatXaf(r.paid)}</td>
                  <td className="p-2"><span className="font-medium">{formatXaf(r.balance)}</span><span className="block text-xs text-muted-foreground">{label[r.status]}</span></td>
                  <td className="p-2 text-right"><Button type="button" size="sm" variant="outline" onClick={() => setPaying(paying === r.enrolment ? null : r.enrolment)}>{tr("Record payment", "Encaisser")}</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
      <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-4">
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
        <div className="overflow-x-auto rounded-lg border">
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
  const tr = useHigherText();
  const { run, busy } = useHigherRunner();
  const [list, setList] = useState<HigherPayment[] | null>(null);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const load = useCallback(() => { api.payments({ academic_year: yearId || undefined }).then(setList).catch(() => setList([])); }, [yearId]);
  useEffect(() => { load(); }, [load, version]);
  if (!list) return <Loading />;
  if (list.length === 0) return <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{tr("No payments recorded yet.", "Aucun paiement enregistré.")}</p>;
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs"><tr><th className="p-2">{tr("Receipt", "Reçu")}</th><th className="p-2">{tr("Student", "Étudiant")}</th><th className="p-2">{tr("Amount", "Montant")}</th><th className="p-2">{tr("Method", "Mode")}</th><th className="p-2">{tr("Date", "Date")}</th><th className="p-2" /></tr></thead>
          <tbody>{list.map((p) => (
            <tr key={p.id} className={`border-t ${p.is_void ? "text-muted-foreground line-through" : ""}`}>
              <td className="p-2">{p.receipt_number}</td>
              <td className="p-2">{p.student_name}<span className="block text-xs">{p.matricule}</span></td>
              <td className="p-2">{formatXaf(p.amount)}</td>
              <td className="p-2">{p.method_label}{p.reference ? <span className="block text-xs">{p.reference}</span> : null}</td>
              <td className="p-2">{p.paid_on}</td>
              <td className="space-x-1 p-2 text-right no-underline">
                <Button type="button" size="sm" variant="outline" onClick={() => printReceipt(p)}>{tr("Receipt", "Reçu")}</Button>
                {!p.is_void ? <Button type="button" size="sm" variant="ghost" onClick={() => { setVoiding(voiding === p.id ? null : p.id); setReason(""); }}>{tr("Cancel payment", "Annuler")}</Button> : null}
              </td>
            </tr>))}</tbody>
        </table>
      </div>
      {voiding ? (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/30 p-3">
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
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div className="space-y-1">
        <h1 className="font-headline text-2xl font-bold tracking-tight">{tr("Finance", "Finance")}</h1>
        <p className="text-sm text-muted-foreground">{tr("Set the fees for each programme level, record what students pay (cash, MTN Mobile Money, Orange Money or bank) and see who still owes.", "Fixez les frais de chaque niveau, enregistrez les paiements (espèces, MTN Mobile Money, Orange Money ou banque) et voyez qui doit encore.")}</p>
      </div>
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
