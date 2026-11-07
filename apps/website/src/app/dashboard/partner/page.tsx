"use client";

/**
 * Partner workspace, inside the main dashboard.
 *
 * Part J (partner <-> learner): a learner, teacher or parent who activated the
 * partner programme on their own account does NOT get a second login. They
 * stay signed in as themselves and switch to this page to see their partner
 * numbers, the lifecycle of every school they introduced, and their referral
 * link. It reads /partners/me/ with the normal dashboard session.
 */

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Copy, MessageSquare, TrendingUp } from "lucide-react";
import { useState } from "react";

import { apiClient } from "@/lib/api/client";
import type { PortalData } from "@/lib/partner/client";

type FeedbackThread = {
  id: string; subject: string; message: string; status: string; created_at: string;
  resolution_note: string;
  responses: { message: string; responder: string; created_at: string }[];
};

export default function DashboardPartnerPage() {
  const [copied, setCopied] = useState(false);
  const portal = useQuery<PortalData | null>({
    queryKey: ["partner-me"],
    queryFn: async () => {
      try {
        const { data } = await apiClient.get("/partners/me/");
        return data as PortalData;
      } catch {
        return null;
      }
    },
  });

  if (portal.isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading your partner workspace…</p>;
  }

  if (!portal.data) {
    return (
      <div className="space-y-4 p-2">
        <h1 className="text-2xl font-bold text-primary">Partner workspace</h1>
        <p className="text-muted-foreground">
          You are not a partner yet. Activate the partner programme to get a referral link and
          track the schools you introduce.
        </p>
        <Link href="/dashboard/referrals" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">
          Become a Partner
        </Link>
      </div>
    );
  }

  const d = portal.data;
  const r = d.referral;
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(r.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be blocked; the link is shown in full anyway */
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary font-headline">Partner workspace</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {d.partner.display_name} · status {d.partner.status}
          </p>
        </div>
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3.5 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>
      </div>

      {/* Referral link */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your referral link</p>
        <div className="mt-2 flex items-center gap-2">
          <code className="flex-1 truncate rounded-lg bg-muted px-3 py-2 text-sm">{r.link}</code>
          <button onClick={copyLink} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-muted">
            <Copy className="h-4 w-4" /> {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Clicks" value={r.clicks} />
        <Stat label="Introductions" value={r.applications} />
        <Stat label="Onboarded" value={r.approved_schools} />
        <Stat label="Conversion" value={`${r.conversion_rate}%`} />
      </div>

      {/* Lifecycle pipeline */}
      {d.lifecycle && d.lifecycle.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-lg font-bold text-foreground">Where your schools are</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Every school you introduce moves through these stages. Only onboarded schools count towards your rewards.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {d.lifecycle.map((st) => (
              <div
                key={st.stage}
                title={st.blurb}
                className={`rounded-xl border p-3.5 ${st.stage === "processed" ? "border-green-300 bg-green-50 dark:bg-green-950/20" : "border-border bg-background"}`}
              >
                <div className="text-2xl font-bold text-foreground">{st.count}</div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{st.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Feedback to EduIgnite (Part K) */}
      <PartnerFeedback />

      {/* Referred schools */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-lg font-bold text-foreground">Referred schools</h2>
        {d.schools.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No schools yet. Share your link to get started.</p>
        ) : (
          <div className="mt-3 overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left">School</th>
                  <th className="px-4 py-2.5 text-left">Region</th>
                  <th className="px-4 py-2.5 text-left">Stage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {d.schools.map((s, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2.5 font-semibold text-foreground">{s.school_name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{s.region}</td>
                    <td className="px-4 py-2.5" title={s.stage_blurb}>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${s.stage === "processed" ? "bg-green-100 text-green-700" : s.stage === "rejected" ? "bg-rose-100 text-rose-600" : "bg-muted text-muted-foreground"}`}>
                        {s.stage_label || s.status}
                      </span>
                      {s.step && !s.is_final && (
                        <span className="ml-2 text-[10px] font-semibold text-muted-foreground">Step {s.step} of {s.total_steps}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function PartnerFeedback() {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const threads = useQuery<FeedbackThread[]>({
    queryKey: ["partner-feedback"],
    queryFn: async () => {
      try {
        const { data } = await apiClient.get("/partners/me/feedback/");
        return data as FeedbackThread[];
      } catch {
        return [];
      }
    },
  });

  const send = async () => {
    if (!subject.trim() || !message.trim()) {
      setError("A subject and a message are both required.");
      return;
    }
    setSending(true);
    setError("");
    try {
      await apiClient.post("/partners/me/feedback/", { subject, message });
      setSubject("");
      setMessage("");
      setSent(true);
      setTimeout(() => setSent(false), 2500);
      await threads.refetch();
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Could not send. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold text-foreground">Talk to EduIgnite</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Questions, ideas or problems with the partner programme go straight to the EduIgnite team.
        You will see their reply here.
      </p>

      <div className="mt-3 space-y-2">
        <input
          className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm"
          placeholder="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
        <textarea
          className="min-h-24 w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm"
          placeholder="Your message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex items-center gap-3">
          <button
            onClick={send}
            disabled={sending}
            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {sending ? "Sending…" : "Send feedback"}
          </button>
          {sent && <span className="text-sm font-semibold text-green-600">Sent. Thank you.</span>}
        </div>
      </div>

      {threads.data && threads.data.length > 0 && (
        <div className="mt-5 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your messages</p>
          {threads.data.map((t) => (
            <div key={t.id} className="rounded-xl border border-border p-3.5">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-foreground">{t.subject}</p>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${t.status === "Resolved" ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>{t.status}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{t.message}</p>
              {t.responses.map((r, i) => (
                <div key={i} className="mt-2 rounded-lg bg-muted p-2.5 text-sm">
                  <span className="font-semibold text-foreground">{r.responder}:</span> {r.message}
                </div>
              ))}
              {t.resolution_note && (
                <p className="mt-2 text-sm text-green-700">Resolved: {t.resolution_note}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <TrendingUp className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-foreground">{value}</div>
    </div>
  );
}
