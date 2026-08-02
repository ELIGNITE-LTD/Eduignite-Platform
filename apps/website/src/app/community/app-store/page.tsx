"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, ExternalLink, Search, Star } from "lucide-react";
import { appStoreService } from "@/lib/api/services/app-store.service";
import { resolveMediaUrl } from "@/lib/media";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CommunityHeader } from "@/components/layout/community-header";

interface PublicApp {
  id: string;
  title?: string;
  name?: string;
  category?: string;
  short_description?: string;
  description?: string;
  icon_url?: string;
  thumbnail_url?: string;
  download_link?: string;
  download_url?: string;
  apk_file_url?: string;
  rating?: string | number;
  version?: string;
}

export default function CommunityAppStorePage() {
  const [apps, setApps] = useState<PublicApp[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    appStoreService
      .listItems({ published: true })
      .then((response) => setApps(response?.results ?? response ?? []))
      .finally(() => setIsLoading(false));
  }, []);

  const filteredApps = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return apps;
    return apps.filter((app) =>
      [app.title, app.name, app.short_description, app.description, app.category]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized))
    );
  }, [apps, query]);

  return (
    <div className="min-h-screen bg-[#F0F2F5]">
      <CommunityHeader />

      <main className="mx-auto max-w-7xl space-y-10 px-4 py-12">
        <section className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl space-y-3">
            <Badge className="border-none bg-secondary text-primary">PUBLISHED EDUCATION APPS</Badge>
            <h1 className="font-headline text-4xl font-black uppercase tracking-tighter text-primary md:text-6xl">
              EduIgnite App Store
            </h1>
            <p className="text-muted-foreground">
              Download official EduIgnite mobile and desktop tools approved for Cameroon secondary schools.
            </p>
          </div>
          <div className="relative w-full md:w-80">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search apps" className="h-12 rounded-2xl border-none bg-white pl-11 shadow-sm" />
          </div>
        </section>

        {isLoading ? (
          <div className="rounded-[2rem] bg-white p-10 text-center font-bold text-muted-foreground shadow-sm">Loading published apps...</div>
        ) : filteredApps.length === 0 ? (
          <div className="rounded-[2rem] bg-white p-10 text-center font-bold text-muted-foreground shadow-sm">No published apps match this search.</div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredApps.map((app) => {
              const title = app.title || app.name || "EduIgnite App";
              const icon = resolveMediaUrl(app.icon_url || app.thumbnail_url || "");
              const downloadUrl = app.download_url || app.download_link || app.apk_file_url || "";
              return (
                <Card key={app.id} className="flex flex-col overflow-hidden rounded-[2rem] border-none bg-white shadow-xl">
                  <CardHeader className="flex-row items-start gap-4 space-y-0 p-6">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-primary/5">
                      {icon ? <img src={icon} alt={title} className="h-full w-full object-cover" /> : <Download className="h-7 w-7 text-primary/30" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="line-clamp-2 text-xl font-black leading-tight text-primary">{title}</h2>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="rounded-full px-3 text-[10px] font-black uppercase">{app.category || "education"}</Badge>
                        <span className="flex items-center gap-1 text-xs font-bold text-amber-500">
                          <Star className="h-3.5 w-3.5 fill-amber-400" />
                          {Number(app.rating || 0).toFixed(1)}
                        </span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 px-6 pb-6">
                    <p className="line-clamp-4 text-sm font-medium leading-6 text-muted-foreground">
                      {app.short_description || app.description || "Official EduIgnite application for school operations."}
                    </p>
                    {app.version && <p className="mt-4 text-[10px] font-black uppercase tracking-widest text-primary/40">Version {app.version}</p>}
                  </CardContent>
                  <CardFooter className="mt-auto p-6 pt-0">
                    <Button asChild disabled={!downloadUrl} className="h-12 w-full rounded-xl font-black uppercase tracking-widest text-xs">
                      <a href={downloadUrl || "#"} target="_blank" rel="noreferrer">
                        Download <ExternalLink className="ml-2 h-4 w-4" />
                      </a>
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
