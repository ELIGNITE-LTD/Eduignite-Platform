"use client";

/**
 * Founder control panel for the public marketing website.
 *
 * The public pages cache for ten minutes so anonymous traffic cannot hit the
 * database on every visit. That is right for the site and wrong for whoever
 * just approved a testimony and wants to check it — hence "Publish now", which
 * clears that cache. Without it a founder would reasonably conclude their
 * change had failed.
 */

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Globe, Images, MessageSquareQuote, Newspaper, RefreshCw } from "lucide-react";
import { platformService, type PublicSiteStatus } from "@/lib/api/services/platform.service";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const PAGES = [
  { href: "/", label: "Home" },
  { href: "/testimonials", label: "Stories" },
  { href: "/blog", label: "Blog" },
  { href: "/gallery", label: "Gallery" },
];

export function PublicSitePanel() {
  const [status, setStatus] = useState<PublicSiteStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      setStatus(await platformService.getPublicSiteStatus());
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const publishNow = async () => {
    setPublishing(true);
    try {
      const res = await platformService.refreshPublicSite();
      toast({ title: "Public site updated", description: res.detail });
      await load();
    } catch {
      toast({
        title: "Could not update the public site",
        description: "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setPublishing(false);
    }
  };

  const tiles = [
    {
      icon: MessageSquareQuote,
      label: "Stories",
      live: status?.testimonials.live ?? 0,
      pending: status?.testimonials.awaiting_review ?? 0,
      pendingLabel: "awaiting your review",
      hint: "Approve a testimony and it appears on the public site.",
    },
    {
      icon: Newspaper,
      label: "Blog posts",
      live: status?.blog.live ?? 0,
      pending: status?.blog.drafts ?? 0,
      pendingLabel: "still drafts",
      hint: "Published community posts are listed on the public blog.",
    },
    {
      icon: Images,
      label: "Gallery",
      live: (status?.gallery.photos ?? 0) + (status?.gallery.videos ?? 0),
      pending: 0,
      pendingLabel: "",
      hint: `${status?.gallery.photos ?? 0} photo(s), ${status?.gallery.videos ?? 0} video(s) from Public Portfolio below.`,
    },
  ];

  return (
    <Card className="border-none shadow-xl rounded-[2.5rem] overflow-hidden">
      <CardHeader className="bg-primary p-10 text-white">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/10 rounded-2xl">
              <Globe className="w-8 h-8 text-secondary" />
            </div>
            <div>
              <CardTitle className="text-2xl font-black uppercase tracking-tighter">
                Public Website
              </CardTitle>
              <CardDescription className="text-white/60">
                What visitors see on eduignite.com right now.
              </CardDescription>
            </div>
          </div>
          <Button
            onClick={publishNow}
            disabled={publishing || loading}
            className="bg-white text-primary hover:bg-secondary font-black rounded-2xl"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${publishing ? "animate-spin" : ""}`} />
            {publishing ? "Publishing…" : "Publish now"}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-10 space-y-8">
        {loading ? (
          <p className="text-sm text-muted-foreground">Checking the public site…</p>
        ) : !status ? (
          <p className="text-sm text-muted-foreground">
            The public site status could not be loaded. Your content is unaffected.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {tiles.map((tile) => {
                const Icon = tile.icon;
                return (
                  <div key={tile.label} className="p-6 bg-accent/30 rounded-[2rem] border border-accent">
                    <div className="flex items-center justify-between">
                      <Icon className="w-6 h-6 text-primary" />
                      {tile.pending > 0 && (
                        <Badge variant="secondary" className="font-black">
                          {tile.pending} {tile.pendingLabel}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-4 text-3xl font-black text-primary">{tile.live}</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      {tile.label} live
                    </p>
                    <p className="mt-3 text-xs text-muted-foreground leading-relaxed">{tile.hint}</p>
                  </div>
                );
              })}
            </div>

            <div className="p-6 bg-accent/10 rounded-[2rem] border border-dashed">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Open a public page
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                {PAGES.map((page) => (
                  <a
                    key={page.href}
                    href={page.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl border bg-background px-4 py-2.5 text-xs font-black hover:bg-accent/40 transition-colors"
                  >
                    {page.label} <ExternalLink className="w-3.5 h-3.5 opacity-50" />
                  </a>
                ))}
              </div>
              <p className="mt-4 text-xs text-muted-foreground italic">
                The site refreshes itself every {Math.round((status.cache_seconds ?? 600) / 60)} minutes.
                Use “Publish now” if you want a change to appear immediately.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
