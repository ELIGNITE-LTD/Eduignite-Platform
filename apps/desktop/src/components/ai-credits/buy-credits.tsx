"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Minus, Plus, Send, Smartphone, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { getApiErrorMessage } from "@/lib/api/errors";
import { aiCreditsService } from "@/lib/api/services/ai-credits.service";
import {
  announceCreditsChanged,
  formatCredits,
  formatFcfa,
  type CreditPurchase,
  type CreditQuote,
} from "@/lib/ai-credits";
import { useSetAiCreditBalance } from "@/lib/hooks/useAiCredits";

const SUGGESTIONS = [100, 200, 350, 500, 750, 1000, 2500, 5000, 10000];
const STEP = 50;
const POLL_EVERY_MS = 3000;
const POLL_FOR_MS = 4 * 60_000;

/**
 * Buy exactly the number of credits you want.
 *
 * The price shown is the server's, fetched for the number chosen: this page
 * never multiplies anything itself. After paying on the phone, the credits
 * appear only once the server has confirmed the payment with the gateway.
 */
export function BuyCredits({ onDone }: { onDone?: () => void }) {
  const { toast } = useToast();
  const setBalance = useSetAiCreditBalance();
  const [limits, setLimits] = useState<CreditQuote | null>(null);
  const [credits, setCredits] = useState(500);
  const [typed, setTyped] = useState("500");
  const [quote, setQuote] = useState<CreditQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [operator, setOperator] = useState<"mtn" | "orange">("mtn");
  const [phone, setPhone] = useState("");
  const [starting, setStarting] = useState(false);
  const [purchase, setPurchase] = useState<CreditPurchase | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (poll.current) clearInterval(poll.current);
    poll.current = null;
  };
  useEffect(() => stopPolling, []);

  useEffect(() => {
    aiCreditsService
      .getQuote()
      .then(setLimits)
      .catch(() => setLimits(null));
  }, []);

  const min = limits?.min_purchase_credits ?? 100;
  const max = limits?.max_purchase_credits ?? 100000;

  // The price, from the server, for whatever number is chosen.
  useEffect(() => {
    if (!limits?.purchases_enabled) return;
    let cancelled = false;
    setQuoting(true);
    const timer = window.setTimeout(() => {
      aiCreditsService
        .getQuote(credits)
        .then((value) => !cancelled && setQuote(value))
        .catch(() => !cancelled && setQuote(null))
        .finally(() => !cancelled && setQuoting(false));
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [credits, limits?.purchases_enabled]);

  const choose = (value: number) => {
    const next = Math.max(min, Math.min(max, Math.round(value)));
    setCredits(next);
    setTyped(String(next));
  };

  const onTyped = (value: string) => {
    const digits = value.replace(/[^0-9]/g, "");
    setTyped(digits);
    const number = Number(digits);
    if (digits && Number.isFinite(number)) setCredits(number);
  };

  // Follow the payment until the server knows how it ended.
  useEffect(() => {
    stopPolling();
    if (!purchase || purchase.status !== "PENDING") return;
    const started = Date.now();
    const tick = async () => {
      try {
        const updated = await aiCreditsService.getPurchase(purchase.transaction_id);
        if (updated.status === "SUCCESS" && updated.processed) {
          stopPolling();
          setPurchase(updated);
          setBalance(updated.balance);
          announceCreditsChanged();
          toast({ title: "Credits added", description: `${formatCredits(updated.credits)} AI credits are ready to use.` });
          return;
        }
        if (updated.status === "FAILED" || updated.status === "CANCELLED") {
          stopPolling();
          setPurchase(updated);
          return;
        }
      } catch {
        /* keep waiting: a dropped connection is not a failed payment */
      }
      if (Date.now() - started > POLL_FOR_MS) stopPolling();
    };
    poll.current = setInterval(tick, POLL_EVERY_MS);
    void tick();
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchase?.transaction_id, purchase?.status]);

  const pay = async () => {
    if (!phone.trim()) {
      toast({ variant: "destructive", title: "Mobile money number needed", description: "Enter the number to pay from." });
      return;
    }
    setStarting(true);
    try {
      const started = await aiCreditsService.startPurchase({
        credits,
        phone: phone.trim(),
        operator: operator === "orange" ? "orange_money" : "mtn_momo",
      });
      setPurchase(started);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "The payment could not start",
        description: getApiErrorMessage(error, "Please try again in a moment."),
      });
    } finally {
      setStarting(false);
    }
  };

  if (limits && !limits.purchases_enabled) {
    return (
      <div className="rounded-3xl border border-primary/10 bg-white p-8 text-center">
        <p className="text-sm font-black text-primary">Buying credits opens soon</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          {limits.message || "Your 100 free AI credits still refresh every day."}
        </p>
      </div>
    );
  }

  if (purchase) {
    const pending = purchase.status === "PENDING";
    const success = purchase.status === "SUCCESS";
    return (
      <div className="rounded-3xl border border-primary/10 bg-white p-8 text-center">
        <div
          className={cn(
            "mx-auto flex h-14 w-14 items-center justify-center rounded-2xl",
            success ? "bg-green-100 text-green-700" : pending ? "bg-primary/10 text-primary" : "bg-red-100 text-red-700",
          )}
        >
          {success ? (
            <CheckCircle2 className="h-7 w-7" />
          ) : pending ? (
            <Smartphone className="h-7 w-7" />
          ) : (
            <XCircle className="h-7 w-7" />
          )}
        </div>
        <p className="mt-4 text-lg font-black text-primary">
          {success ? "Credits added" : pending ? "Approve the payment on your phone" : "The payment did not go through"}
        </p>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          {success
            ? `${formatCredits(purchase.credits)} AI credits are now in your account. They do not expire at midnight.`
            : pending
              ? `A mobile money prompt for ${formatFcfa(purchase.amount)} has been sent. Your ${formatCredits(purchase.credits)} credits appear here as soon as the payment is confirmed.`
              : "Nothing was charged and no credits were added. You can try again."}
        </p>
        {pending ? <Loader2 className="mx-auto mt-5 h-5 w-5 animate-spin text-primary/60" /> : null}
        <p className="mt-4 font-mono text-[10px] text-muted-foreground">Ref {purchase.transaction_id}</p>
        {!pending ? (
          <div className="mt-5 flex justify-center gap-2">
            <Button variant="outline" className="rounded-xl" onClick={() => setPurchase(null)}>
              {success ? "Buy more" : "Try again"}
            </Button>
            {success && onDone ? (
              <Button className="rounded-xl font-bold" onClick={onDone}>
                Done
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  const outOfRange = credits < min || credits > max;

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-5 rounded-3xl border border-primary/10 bg-white p-6 lg:col-span-3">
        <div>
          <h3 className="text-base font-black text-primary">How many credits do you want?</h3>
          <p className="text-xs text-muted-foreground">
            Any amount from {formatCredits(min)} to {formatCredits(max)}. No fixed packages.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            className="h-12 w-12 shrink-0 rounded-2xl"
            onClick={() => choose(credits - STEP)}
            disabled={credits <= min}
            aria-label="Fewer credits"
          >
            <Minus className="h-4 w-4" />
          </Button>
          <Input
            inputMode="numeric"
            value={typed}
            onChange={(event) => onTyped(event.target.value)}
            onBlur={() => choose(credits)}
            className="h-12 rounded-2xl border-primary/15 text-center text-2xl font-black text-primary"
            aria-label="Number of credits"
          />
          <Button
            variant="outline"
            size="icon"
            className="h-12 w-12 shrink-0 rounded-2xl"
            onClick={() => choose(credits + STEP)}
            disabled={credits >= max}
            aria-label="More credits"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.filter((value) => value >= min && value <= max).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => choose(value)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-bold transition-colors",
                credits === value ? "border-primary bg-primary text-white" : "border-primary/15 text-primary hover:bg-primary/5",
              )}
            >
              {formatCredits(value)}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Pay with</Label>
          <div className="grid grid-cols-2 gap-2">
            {(["mtn", "orange"] as const).map((value) => (
              <Button
                key={value}
                variant={operator === value ? "default" : "outline"}
                className="h-11 rounded-2xl font-bold"
                onClick={() => setOperator(value)}
              >
                {value === "mtn" ? "MTN MoMo" : "Orange Money"}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="credit-phone" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Mobile money number
          </Label>
          <Input
            id="credit-phone"
            inputMode="tel"
            placeholder="6XX XX XX XX"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className="h-12 rounded-2xl border-primary/15 font-bold"
          />
        </div>
      </div>

      <div className="flex flex-col justify-between gap-4 rounded-3xl bg-primary p-6 text-white lg:col-span-2">
        <div className="space-y-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/50">You get</p>
          <p className="text-3xl font-black">{formatCredits(credits)} credits</p>
          <div className="h-px bg-white/10" />
          <p className="text-[10px] font-black uppercase tracking-widest text-white/50">Price</p>
          <p className="min-h-[2.5rem] text-3xl font-black text-secondary">
            {quoting ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : quote?.price != null && !outOfRange ? (
              formatFcfa(quote.price)
            ) : (
              "-"
            )}
          </p>
          {quote?.message && !quoting ? <p className="text-xs text-amber-200">{quote.message}</p> : null}
          {quote && quote.payable === false && !quoting ? (
            <p className="text-xs text-amber-200">
              Mobile money payments start at {formatFcfa(quote.minimum_payment)}. Choose more credits.
            </p>
          ) : null}
          <p className="text-[11px] leading-relaxed text-white/60">
            Bought credits are kept until you use them. Each day&apos;s free credits are always used first.
          </p>
        </div>
        <Button
          variant="secondary"
          className="h-12 rounded-2xl font-black uppercase tracking-widest"
          onClick={() => void pay()}
          disabled={starting || quoting || outOfRange || !quote?.price || quote.payable === false}
        >
          {starting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          Continue to payment
        </Button>
      </div>
    </div>
  );
}
