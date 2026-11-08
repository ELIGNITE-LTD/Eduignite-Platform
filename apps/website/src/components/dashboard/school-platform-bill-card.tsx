"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Send } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { platformService } from "@/lib/api/services/platform.service";
import { schoolsService } from "@/lib/api/services/schools.service";
import { feesService } from "@/lib/api/services/fees.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

const money = (value: unknown, currency = "XAF") => `${Number(value || 0).toLocaleString()} ${currency}`;

/**
 * The school's platform bill: pupils x the founders' rate, minus payments.
 * Everything shown (and the amount charged) comes from the server. The school
 * admin pays through the existing Fapshi mobile-money flow; a sub-admin only
 * sees the bill.
 */
export function SchoolPlatformBillCard() {
  const { user } = useAuth();
  const { language } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const en = language === "en";
  const isAdmin = user?.role === "SCHOOL_ADMIN" || user?.role === "SUB_ADMIN";

  const billQuery = useQuery({
    queryKey: ["platform-bill", user?.school?.id],
    queryFn: () => platformService.getMyPlatformBill(),
    enabled: Boolean(user?.id) && isAdmin,
  });
  const historyQuery = useQuery({
    queryKey: ["platform-bill-history", user?.school?.id],
    queryFn: () => platformService.getMyPlatformBillHistory(),
    enabled: Boolean(user?.id) && isAdmin,
  });

  const [method, setMethod] = useState<"mtn" | "orange">("mtn");
  const [phone, setPhone] = useState("");
  const [part, setPart] = useState("");
  const [busy, setBusy] = useState(false);
  const [txnId, setTxnId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };
  useEffect(() => stopPolling, []);

  useEffect(() => {
    stopPolling();
    if (!txnId) return;
    let tries = 0;
    const tick = async () => {
      tries += 1;
      try {
        const updated = await feesService.fapshiStatus(txnId);
        if (updated.status === "SUCCESS") {
          stopPolling();
          setTxnId(null);
          setBusy(false);
          setPart("");
          await queryClient.invalidateQueries({ queryKey: ["platform-bill"] });
          await queryClient.invalidateQueries({ queryKey: ["platform-bill-history"] });
          toast({ title: en ? "Payment received" : "Paiement recu", description: en ? "Your receipt is listed below." : "Votre recu est affiche ci-dessous." });
        } else if (updated.status === "FAILED" || updated.status === "CANCELLED") {
          stopPolling();
          setTxnId(null);
          setBusy(false);
          toast({ variant: "destructive", title: en ? "Payment not completed" : "Paiement non termine", description: en ? "You were not charged. Please try again." : "Vous n'avez pas ete debite. Veuillez reessayer." });
        }
      } catch {
        /* keep polling */
      }
      if (tries >= 80) {
        stopPolling();
        setBusy(false);
      }
    };
    void tick();
    pollRef.current = setInterval(tick, 2500);
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txnId]);

  if (!isAdmin) return null;
  const bill = billQuery.data;
  if (billQuery.isLoading || !bill) return null;
  if (!bill.configured) return null; // the founders have not set a fee per student yet

  const currency = bill.currency || "XAF";
  const statusLabel: Record<string, string> = {
    paid: en ? "Paid" : "Paye",
    due: en ? "Due" : "A payer",
    overdue: en ? "Overdue" : "En retard",
    no_charge: en ? "Nothing to pay" : "Rien a payer",
  };
  const canPay = Boolean(bill.can_pay) && bill.balance > 0 && (bill.status === "due" || bill.status === "overdue");

  const pay = async () => {
    if (!phone.trim()) {
      toast({ variant: "destructive", title: en ? "Missing number" : "Numero manquant", description: en ? "Enter your mobile money number." : "Entrez votre numero mobile money." });
      return;
    }
    const partAmount = part.trim() ? Number(part) : undefined;
    setBusy(true);
    try {
      const created = await schoolsService.paySchoolSubscription(phone.replace(/\s/g, ""), method === "orange" ? "orange_money" : "mtn_momo", partAmount);
      setTxnId(created.transaction_id);
      toast({ title: en ? "Approve on your phone" : "Approuvez sur votre telephone", description: en ? "A mobile money prompt was sent." : "Une invite mobile money a ete envoyee." });
    } catch (error: any) {
      const pending = error?.response?.data?.transaction_id;
      if (error?.response?.status === 409 && pending) {
        setTxnId(pending); // a prompt is already in flight: follow it instead of charging twice
        return;
      }
      setBusy(false);
      toast({ variant: "destructive", title: en ? "Payment failed" : "Paiement echoue", description: getApiErrorMessage(error, en ? "We could not start the payment." : "Impossible de demarrer le paiement.") });
    }
  };

  const history: any[] = historyQuery.data ?? [];

  return (
    <Card className="border-none shadow-xl rounded-[2rem] overflow-hidden" data-testid="platform-bill-card">
      <CardHeader className="bg-primary/5 border-b p-8">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="text-xl font-black text-primary">{en ? "EduIgnite platform fee" : "Frais de plateforme EduIgnite"}</CardTitle>
            <CardDescription>
              {en ? `${bill.pupil_count} pupils x ${money(bill.rate, currency)} per pupil` : `${bill.pupil_count} eleves x ${money(bill.rate, currency)} par eleve`}
            </CardDescription>
          </div>
          <Badge className={cn("uppercase", bill.status === "overdue" ? "bg-red-600 text-white" : bill.status === "paid" ? "bg-green-600 text-white" : "")}>
            {statusLabel[bill.status] ?? bill.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-8 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div><p className="text-[10px] font-black uppercase text-muted-foreground">{en ? "Total" : "Total"}</p><p className="font-black text-primary">{money(bill.total, currency)}</p></div>
          <div><p className="text-[10px] font-black uppercase text-muted-foreground">{en ? "Paid" : "Paye"}</p><p className="font-black text-primary">{money(bill.paid, currency)}</p></div>
          <div><p className="text-[10px] font-black uppercase text-muted-foreground">{en ? "Balance" : "Solde"}</p><p className="font-black text-primary">{money(bill.balance, currency)}</p></div>
          <div><p className="text-[10px] font-black uppercase text-muted-foreground">{en ? "Deadline" : "Echeance"}</p><p className="font-black text-primary">{bill.deadline ? new Date(bill.deadline).toLocaleDateString(en ? "en-US" : "fr-FR") : "-"}</p></div>
        </div>

        {bill.status === "overdue" && (
          <p className="text-sm font-bold text-red-600">
            {en ? "The deadline has passed. Staff, students and teachers cannot sign in until the balance is paid." : "L'echeance est depassee. Le personnel, les enseignants et les eleves ne peuvent pas se connecter tant que le solde n'est pas paye."}
          </p>
        )}

        {canPay ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Button type="button" variant={method === "mtn" ? "default" : "outline"} className="h-12 rounded-2xl font-bold" onClick={() => setMethod("mtn")}>MTN MoMo</Button>
              <Button type="button" variant={method === "orange" ? "default" : "outline"} className="h-12 rounded-2xl font-bold" onClick={() => setMethod("orange")}>Orange Money</Button>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-muted-foreground">{en ? "Mobile number" : "Numero mobile"}</Label>
              <Input placeholder="6XX XX XX XX" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-12 rounded-2xl" />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-muted-foreground">{en ? "Amount (leave empty to pay the full balance)" : "Montant (vide = payer tout le solde)"}</Label>
              <Input type="number" min={100} max={bill.balance} value={part} onChange={(e) => setPart(e.target.value)} placeholder={String(bill.balance)} className="h-12 rounded-2xl" />
            </div>
            <Button className="w-full h-14 rounded-2xl font-black uppercase tracking-widest text-xs gap-3" onClick={() => void pay()} disabled={busy}>
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              {en ? "Pay" : "Payer"} {money(part.trim() ? Number(part) : bill.balance, currency)}
            </Button>
          </div>
        ) : !bill.can_pay && bill.balance > 0 ? (
          <p className="text-xs text-muted-foreground">{en ? "Only the school administrator can pay this bill." : "Seul l'administrateur de l'ecole peut payer cette facture."}</p>
        ) : null}

        {history.some((h) => h.payments?.length) && (
          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase text-muted-foreground">{en ? "Payments and receipts" : "Paiements et recus"}</p>
            {history.flatMap((h) => (h.payments ?? []).map((p: any) => (
              <div key={p.transaction_id} className="flex items-center justify-between text-sm border-b py-2">
                <span>{p.paid_at ? new Date(p.paid_at).toLocaleDateString(en ? "en-US" : "fr-FR") : ""} - {en ? "Receipt" : "Recu"} {p.receipt_number || p.reference_number || p.transaction_id}</span>
                <span className="font-black text-primary">{money(p.amount, p.currency)}</span>
              </div>
            )))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
