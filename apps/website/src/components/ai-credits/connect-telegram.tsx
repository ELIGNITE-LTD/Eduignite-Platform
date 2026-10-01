"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ExternalLink, Loader2, Send, Unlink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api/errors";
import { aiCreditsService } from "@/lib/api/services/ai-credits.service";

/**
 * EduIgnite AI on Telegram, from the account's side.
 *
 * Linking a chat makes the bot answer as this account: its credits, its
 * daily allowance and, for a student, their own marks. Shown only once the
 * bot is live.
 */
export function ConnectTelegram() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [code, setCode] = useState<{ code: string; url: string; expires_at: string } | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [copied, setCopied] = useState(false);
  const { data } = useQuery({
    queryKey: ["ai-credits", "telegram"],
    queryFn: () => aiCreditsService.getTelegram(),
    refetchInterval: code ? 5000 : false,
    retry: false,
  });

  if (!data?.available) return null;
  const connections = data.connections || [];

  const issue = async () => {
    setIssuing(true);
    try {
      setCode(await aiCreditsService.telegramLinkCode());
    } catch (error) {
      toast({ variant: "destructive", title: "Could not connect", description: getApiErrorMessage(error, "Please try again.") });
    } finally {
      setIssuing(false);
    }
  };

  const disconnect = async (id: number) => {
    try {
      await aiCreditsService.telegramUnlink(id);
      await queryClient.invalidateQueries({ queryKey: ["ai-credits", "telegram"] });
      toast({ title: "Disconnected", description: "That Telegram chat no longer uses this account." });
    } catch (error) {
      toast({ variant: "destructive", title: "Not disconnected", description: getApiErrorMessage(error, "Please try again.") });
    }
  };

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(`/link ${code.code}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* the code is on screen to type */
    }
  };

  return (
    <div className="rounded-3xl border border-primary/10 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-[#229ED9]/10 p-2.5 text-[#229ED9]">
            <Send className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-black text-primary">EduIgnite AI on Telegram</h3>
            <p className="mt-0.5 max-w-md text-xs leading-relaxed text-muted-foreground">
              Ask questions, send photos of homework and download answers from Telegram. Connect it to use this
              account&apos;s credits and your own school data there.
            </p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm" className="rounded-xl">
          <a href={data.bot_url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-1.5 h-4 w-4" /> @{data.bot_username}
          </a>
        </Button>
      </div>

      {connections.length ? (
        <ul className="mt-4 divide-y divide-primary/5 rounded-2xl border border-primary/10">
          {connections.map((connection: any) => (
            <li key={connection.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="font-bold">
                {connection.display_name || "Telegram"}
                {connection.username ? <span className="ml-1 font-medium text-muted-foreground">@{connection.username}</span> : null}
              </span>
              <Button variant="ghost" size="sm" className="rounded-xl text-muted-foreground" onClick={() => void disconnect(connection.id)}>
                <Unlink className="mr-1.5 h-4 w-4" /> Disconnect
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {code ? (
        <div className="mt-4 space-y-3 rounded-2xl bg-accent/30 p-4">
          <Button asChild className="w-full rounded-xl font-bold">
            <a href={code.url} target="_blank" rel="noopener noreferrer">
              <Send className="mr-2 h-4 w-4" /> Open Telegram and connect
            </a>
          </Button>
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>
              Or send <code className="rounded bg-white px-1.5 py-0.5 font-mono font-bold text-primary">/link {code.code}</code> to
              the bot. The code works once, for 15 minutes.
            </span>
            <Button variant="ghost" size="sm" className="shrink-0 rounded-xl" onClick={() => void copy()}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      ) : (
        <Button className="mt-4 rounded-xl font-bold" onClick={() => void issue()} disabled={issuing}>
          {issuing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          {connections.length ? "Connect another chat" : "Connect Telegram"}
        </Button>
      )}
    </div>
  );
}
