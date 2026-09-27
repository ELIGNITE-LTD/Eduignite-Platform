"use client";

/**
 * Refer a school, and what you get for it.
 *
 * Written to be read by someone who has never seen a referral scheme: what to
 * do, what it pays, when the money comes, and what does not count. The rules
 * are stated plainly rather than buried, because the one thing worse than no
 * reward scheme is one whose rules people learn about only when they are told
 * they have not earned.
 */

import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  BadgeCheck,
  Check,
  Copy,
  Loader2,
  MessageCircle,
  Send,
  Share2,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { ordersService } from "@/lib/api/services/orders.service";
import { cn } from "@/lib/utils";

const money = (value: number, currency = "XAF") =>
  `${Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })} ${currency}`;

export function ReferralProgramme() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  const isStudent = String(user?.role || "").toUpperCase() === "STUDENT";

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const referral = useQuery({
    queryKey: ["my-referral"],
    queryFn: () => ordersService.getMyReferral(),
    staleTime: 1000 * 60 * 5,
    retry: 1,
    enabled: !isStudent,
  });

  const data = referral.data;
  const link = data?.link ?? "";
  const reward = data?.reward_per_school ?? 20000;
  const currency = data?.currency ?? "XAF";

  const message = link
    ? `Hello. I use EduIgnite to run our school - student records, attendance, marks, report cards and fees, and it keeps working when the internet does not.\n\nIf you would like it for your school, request an account here: ${link}`
    : "";

  if (isStudent) {
    return (
      <Card className="rounded-3xl border-none shadow-sm">
        <CardContent className="flex items-start gap-3 p-6">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <p className="text-sm font-semibold text-muted-foreground">
            The referral programme is open to staff and parents. Student accounts do not take part.
          </p>
        </CardContent>
      </Card>
    );
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      toast({
        variant: "destructive",
        title: "Could not copy automatically",
        description: "Select the link on screen and copy it by hand.",
      });
    }
  }

  async function shareLink() {
    if (!link) return;
    try {
      await navigator.share({ title: "EduIgnite for your school", text: message, url: link });
    } catch {
      /* the share sheet was closed; nothing to report */
    }
  }

  return (
    <div className="space-y-6">
      {/* ---- What this is ------------------------------------------------ */}
      <Card className="overflow-hidden rounded-3xl border-none shadow-sm">
        <CardHeader className="bg-primary p-7 text-white">
          <CardTitle className="text-2xl font-black uppercase tracking-tight">
            Introduce a school, earn {money(reward, currency)}
          </CardTitle>
          <CardDescription className="text-white/80">
            EduIgnite reaches new schools mostly because someone already using it said so. If a
            school joins because of you, you are paid for it.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-5 p-7 sm:grid-cols-3">
          <Step
            number={1}
            title="Send your link"
            body="Every account has its own link. Send it to a school that needs EduIgnite - by WhatsApp, or any way you like."
          />
          <Step
            number={2}
            title="They request an account"
            body="Your link opens the school account request form with you already recorded as the person who sent them. They do not have to type a code."
          />
          <Step
            number={3}
            title="You earn when they are set up"
            body={`Once our team has contacted that school and set them up on EduIgnite, ${money(reward, currency)} is yours.`}
          />
        </CardContent>
      </Card>

      {/* ---- The money --------------------------------------------------- */}
      <Card className="rounded-3xl border-none shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg font-black uppercase tracking-tight text-primary">
            <Wallet className="h-5 w-5 text-secondary" />
            What you have earned
          </CardTitle>
          <CardDescription>
            {money(reward, currency)} for every school that is set up through your link. There is no
            limit on how many schools you may introduce.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          {referral.isLoading ? (
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading your figures…
            </div>
          ) : referral.isError ? (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold text-amber-900">
              <span>Your figures could not be loaded. They will be here when the connection is back.</span>
              <Button size="sm" variant="secondary" onClick={() => void referral.refetch()}>
                Try again
              </Button>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Figure
                  label="Earned so far"
                  value={money(data?.earned ?? 0, currency)}
                  hint={`${data?.qualifying ?? 0} school(s) set up through your link`}
                  highlight
                />
                <Figure
                  label="Still being processed"
                  value={money(data?.in_progress_value ?? 0, currency)}
                  hint={`${data?.in_progress ?? 0} school(s) requested but not yet set up`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Tally label="Schools referred" value={data?.total ?? 0} />
                <Tally label="Awaiting contact" value={data?.pending ?? 0} />
                <Tally label="Contacted" value={data?.contacted ?? 0} />
                <Tally label="Set up" value={data?.processed ?? 0} accent />
              </div>

              <div className="rounded-2xl border border-border bg-muted/40 p-5">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  When you are paid
                </p>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-foreground">
                  Earnings are paid once a year, after {data?.paid_after ?? "31 December"}. Everything
                  credited to you during {data?.year ?? new Date().getFullYear()} is paid together,
                  so there is nothing to claim and nothing to chase - the count on this page is the
                  record.
                </p>
                <ul className="mt-3 space-y-1.5 text-xs font-medium text-muted-foreground">
                  <li>
                    <b className="text-foreground">A school counts when it is set up</b>, not when it
                    fills in the form. A request alone is not money: anyone could type a school name
                    into a public page.
                  </li>
                  <li>
                    A school that requests and is then <b className="text-foreground">not</b> set up
                    earns nothing, and you will see it sitting under Awaiting contact rather than
                    disappearing.
                  </li>
                  <li>Student accounts do not take part in the programme.</li>
                </ul>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ---- The link ---------------------------------------------------- */}
      <Card className="rounded-3xl border-none shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg font-black uppercase tracking-tight text-primary">
            <Share2 className="h-5 w-5 text-secondary" />
            Your link
          </CardTitle>
          <CardDescription>
            This link belongs to your account. Share it as often as you like.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {link ? (
            <>
              <div className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/40 p-4 sm:flex-row sm:items-center">
                <code className="min-w-0 flex-1 break-all font-mono text-xs font-semibold text-foreground">
                  {link}
                </code>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button size="sm" onClick={copyLink} className="gap-1.5">
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                  {canShare && (
                    <Button size="sm" variant="secondary" onClick={shareLink} className="gap-1.5">
                      <Send className="h-3.5 w-3.5" /> Share
                    </Button>
                  )}
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(message)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      "inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#25D366] px-3 text-xs font-black text-white",
                      "transition-colors hover:bg-[#1eb85a]",
                    )}
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                  </a>
                </div>
              </div>

              <div className="rounded-2xl border border-border p-5">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  What each button does
                </p>
                <dl className="mt-3 space-y-2.5 text-xs">
                  <Explain term="Copy">
                    Puts the link on your clipboard. Paste it into a message, an email, or a group
                    yourself.
                  </Explain>
                  <Explain term="WhatsApp">
                    Opens WhatsApp with the message already written and your link at the end of it.
                    You choose who to send it to; nothing is sent until you press send in WhatsApp.
                    On a phone it opens the app, on a computer it opens WhatsApp Web.
                  </Explain>
                  {canShare && (
                    <Explain term="Share">
                      Opens your phone&apos;s own share sheet, so you can send the link through any
                      app on the device.
                    </Explain>
                  )}
                </dl>
              </div>

              <p className="text-[11px] font-medium leading-relaxed text-muted-foreground">
                The link carries a code of its own and never your matricule, so it is safe to post in
                a group. Your matricule is half of how you sign in and should never be shared.
              </p>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function Step({ number, title, body }: { number: number; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-border p-5">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-black text-primary">
        {number}
      </span>
      <p className="mt-3 text-sm font-black text-foreground">{title}</p>
      <p className="mt-1.5 text-xs font-medium leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

function Figure({
  label,
  value,
  hint,
  highlight,
}: {
  label: string;
  value: string;
  hint: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border p-5",
        highlight ? "bg-primary/5" : "bg-card",
      )}
    >
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-3xl font-black tabular-nums",
          highlight ? "text-primary" : "text-foreground",
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-[11px] font-medium text-muted-foreground">{hint}</p>
    </div>
  );
}

function Tally({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 flex items-center gap-1.5 text-2xl font-black tabular-nums",
          accent ? "text-primary" : "text-foreground",
        )}
      >
        {accent && value > 0 ? <BadgeCheck className="h-5 w-5" /> : null}
        {value}
      </p>
    </div>
  );
}

function Explain({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="w-24 shrink-0 font-black text-foreground">{term}</dt>
      <dd className="font-medium leading-relaxed text-muted-foreground">{children}</dd>
    </div>
  );
}
