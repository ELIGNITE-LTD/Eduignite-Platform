"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Brain, Gift, Scale, Sparkles } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BuyCredits } from "@/components/ai-credits/buy-credits";
import { CreditHistory, CreditUsage } from "@/components/ai-credits/credit-activity";
import { CreditBalanceCard, LowCreditNotice, OutOfCreditsPanel } from "@/components/ai-credits/credit-summary";
import { ConnectTelegram } from "@/components/ai-credits/connect-telegram";
import { useAiCreditBalance } from "@/lib/hooks/useAiCredits";

type Tab = "overview" | "buy" | "usage" | "history";
const TABS: Tab[] = ["overview", "buy", "usage", "history"];

const HOW_IT_WORKS = [
  {
    icon: Gift,
    title: "100 free credits every day",
    text: "A fresh allowance each morning. Unused free credits do not carry over, so use them.",
  },
  {
    icon: Scale,
    title: "Simple work costs less",
    text: "A quick question uses a few credits. A worked problem, a long explanation or a generated exam uses more.",
  },
  {
    icon: Brain,
    title: "Buy any amount you need",
    text: "When today's free credits run out, buy exactly as many as you want. Bought credits never expire at midnight.",
  },
];

function AiCreditsContent() {
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get("tab") as Tab | null;
  const [tab, setTab] = useState<Tab>(requested && TABS.includes(requested) ? requested : "overview");
  const { data: balance } = useAiCreditBalance();

  useEffect(() => {
    if (requested && TABS.includes(requested)) setTab(requested);
  }, [requested]);

  const select = (next: Tab) => {
    setTab(next);
    router.replace(next === "overview" ? "/dashboard/ai-credits" : `/dashboard/ai-credits?tab=${next}`, { scroll: false });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary p-2 shadow-sm">
          <Sparkles className="h-5 w-5 text-secondary" />
        </div>
        <div>
          <h1 className="text-2xl font-black tracking-tight text-primary">AI Credits</h1>
          <p className="text-sm text-muted-foreground">What you have, what you&apos;ve used, and buying more.</p>
        </div>
      </div>

      <CreditBalanceCard balance={balance} onSelect={(next) => select(next)} />
      <LowCreditNotice balance={balance} />
      <OutOfCreditsPanel balance={balance} />
      <ConnectTelegram />

      <Tabs value={tab} onValueChange={(value) => select(value as Tab)}>
        <TabsList className="h-11 rounded-2xl">
          <TabsTrigger value="overview" className="rounded-xl font-bold">How it works</TabsTrigger>
          {balance?.unlimited ? null : (
            <TabsTrigger value="buy" className="rounded-xl font-bold">Buy</TabsTrigger>
          )}
          <TabsTrigger value="usage" className="rounded-xl font-bold">Usage</TabsTrigger>
          <TabsTrigger value="history" className="rounded-xl font-bold">History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-5">
          <div className="grid gap-4 md:grid-cols-3">
            {HOW_IT_WORKS.map((item) => (
              <div key={item.title} className="rounded-3xl border border-primary/10 bg-white p-6">
                <item.icon className="h-6 w-6 text-primary" />
                <h3 className="mt-3 text-sm font-black text-primary">{item.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.text}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            Free credits are always used before bought ones. For a bigger request you are shown the likely cost before
            it starts, and if a request fails you are not charged for it.
          </p>
        </TabsContent>

        <TabsContent value="buy" className="mt-5">
          <BuyCredits onDone={() => select("history")} />
        </TabsContent>

        <TabsContent value="usage" className="mt-5">
          <CreditUsage />
        </TabsContent>

        <TabsContent value="history" className="mt-5">
          <CreditHistory />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function AiCreditsPage() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-3xl bg-primary/5" />}>
      <AiCreditsContent />
    </Suspense>
  );
}
