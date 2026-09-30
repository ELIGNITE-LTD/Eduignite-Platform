"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Coins, Sparkles, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCredits, onCreditPrompt, type CreditPrompt } from "@/lib/ai-credits";

/**
 * The one place the app asks about AI credits.
 *
 * Mounted once in the dashboard. Any AI request anywhere - the assistant, an
 * exam, a report - that is heavy enough to ask first, or that cannot be
 * afforded, arrives here through the API client, so every feature asks the
 * same way without any page knowing how.
 */
export function CreditPromptHost() {
  const [prompt, setPrompt] = useState<CreditPrompt | null>(null);
  const pending = useRef<CreditPrompt | null>(null);

  useEffect(
    () =>
      onCreditPrompt((next) => {
        // A second heavy request while one is being asked about is declined
        // rather than stacked: one decision on screen at a time.
        if (pending.current?.type === "confirm" && next.type === "confirm") {
          next.resolve(false);
          return;
        }
        pending.current = next;
        setPrompt(next);
      }),
    [],
  );

  const close = (proceed: boolean) => {
    const current = pending.current;
    pending.current = null;
    setPrompt(null);
    if (current?.type === "confirm") current.resolve(proceed);
  };

  if (!prompt) return null;

  if (prompt.type === "confirm") {
    const { estimate, balance } = prompt;
    return (
      <Dialog open onOpenChange={(open) => !open && close(false)}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader>
            <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <DialogTitle className="text-lg font-black text-primary">AI credit estimate</DialogTitle>
            <DialogDescription>This is a bigger piece of work, so here is what it will cost first.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 rounded-2xl bg-accent/30 p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Approximately</span>
              <span className="text-2xl font-black text-primary">{formatCredits(estimate.credits)} credits</span>
            </div>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">Your balance</span>
              <span className="font-bold">{formatCredits(balance.total_available)} credits</span>
            </div>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            You are charged for the work actually done, which can be a little less or a little more. If the request
            fails, nothing is charged.
          </p>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" className="rounded-xl" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button className="rounded-xl font-bold" onClick={() => close(true)} autoFocus>
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && close(false)}>
      <DialogContent className="max-w-sm rounded-3xl">
        <DialogHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <Zap className="h-5 w-5" />
          </div>
          <DialogTitle className="text-lg font-black text-primary">Not enough AI credits</DialogTitle>
          <DialogDescription>
            This request needs about {formatCredits(prompt.required)} credits. You have{" "}
            {formatCredits(prompt.available)}.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Your 100 free credits refresh every day. You can also buy exactly the number of credits you need and carry on
          now.
        </p>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="rounded-xl" onClick={() => close(false)}>
            Cancel
          </Button>
          {prompt.balance?.purchases_enabled === false ? null : (
            <Button asChild className="rounded-xl font-bold" onClick={() => close(false)}>
              <Link href="/dashboard/ai-credits?tab=buy">
                <Coins className="mr-2 h-4 w-4" />
                Buy credits
              </Link>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
