"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Eye, EyeOff, Loader2, Plus, Store, Trash2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { isCEOCTO, useAuth } from "@/lib/auth-context";
import { appStoreService } from "@/lib/api/services/app-store.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import { resolveMediaUrl } from "@/lib/media";

const normalizeList = (payload: unknown) =>
  Array.isArray(payload) ? payload : Array.isArray((payload as { results?: unknown[] })?.results) ? (payload as { results: unknown[] }).results : [];

const categories = ["android", "iphone", "windows", "mac"] as const;

const initialForm = {
  title: "",
  category: "android",
  short_description: "",
  full_description: "",
  download_link: "",
  youtube_video_link: "",
  version: "1.0.0",
  is_published: false,
};

export default function AppStorePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(initialForm);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [apkFile, setApkFile] = useState<File | null>(null);
  const [screenshots, setScreenshots] = useState<File[]>([]);
  const canManage = isCEOCTO(user?.role);

  const queryParams = useMemo(
    () => ({
      category: category === "all" ? undefined : category,
      search: search || undefined,
      published: canManage ? undefined : true,
    }),
    [canManage, category, search]
  );

  const { data: apps = [], isLoading } = useQuery({
    queryKey: ["app-store", queryParams],
    queryFn: async () => normalizeList(await appStoreService.listItems(queryParams)),
  });

  const createApp = useMutation({
    mutationFn: () => {
      const payload = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        // Skip empty optional text fields so the backend URL validators do not
        // reject blank strings (e.g. an empty download link when an APK is attached).
        if (typeof value === "string" && value.trim() === "") return;
        payload.append(key, typeof value === "boolean" ? String(value) : String(value));
      });
      if (iconFile) payload.append("icon", iconFile);
      if (apkFile) payload.append("apk_file", apkFile);
      screenshots.forEach((file) => payload.append("screenshots", file));
      return appStoreService.createItem(payload);
    },
    onSuccess: () => {
      setForm(initialForm);
      setIconFile(null);
      setApkFile(null);
      setScreenshots([]);
      queryClient.invalidateQueries({ queryKey: ["app-store"] });
      toast({ title: "App uploaded", description: "The app is now in the management list." });
    },
    onError: (error) => {
      toast({ variant: "destructive", title: "Upload failed", description: getApiErrorMessage(error, "Check the app fields and try again.") });
    },
  });

  const publishApp = useMutation({
    mutationFn: ({ id, published }: { id: string; published: boolean }) => appStoreService.publishItem(id, published),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["app-store"] }),
  });

  const deleteApp = useMutation({
    mutationFn: (id: string) => appStoreService.deleteItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["app-store"] });
      toast({ title: "App deleted", description: "The app store record has been removed." });
    },
  });

  const canSubmit = form.title.trim() && form.short_description.trim() && (form.download_link.trim() || apkFile);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-headline text-3xl font-bold text-primary">EduIgnite App Store</h1>
          <p className="text-sm text-muted-foreground">Upload, publish, and manage official application releases.</p>
        </div>
        <div className="flex gap-2">
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search apps" className="w-48" />
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {categories.map((cat) => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {canManage && (
          <Card className="border-none shadow-sm lg:col-span-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-secondary" /> Upload App</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2"><Label>App Name</Label><Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(value) => setForm({ ...form, category: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{categories.map((cat) => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Short Description</Label><Textarea value={form.short_description} onChange={(event) => setForm({ ...form, short_description: event.target.value })} /></div>
              <div className="space-y-2"><Label>Full Description</Label><Textarea value={form.full_description} onChange={(event) => setForm({ ...form, full_description: event.target.value })} className="min-h-28" /></div>
              <div className="space-y-2"><Label>Download URL</Label><Input value={form.download_link} onChange={(event) => setForm({ ...form, download_link: event.target.value })} placeholder="https://..." /></div>
              <div className="space-y-2"><Label>Version</Label><Input value={form.version} onChange={(event) => setForm({ ...form, version: event.target.value })} /></div>
              <div className="space-y-2"><Label>YouTube/Vimeo Link</Label><Input value={form.youtube_video_link} onChange={(event) => setForm({ ...form, youtube_video_link: event.target.value })} /></div>
              <div className="space-y-2"><Label>Icon</Label><Input type="file" accept="image/*" onChange={(event) => setIconFile(event.target.files?.[0] ?? null)} /></div>
              <div className="space-y-2"><Label>Screenshots</Label><Input type="file" accept="image/*" multiple onChange={(event) => setScreenshots(Array.from(event.target.files ?? []))} /></div>
              <div className="space-y-2"><Label>APK / Package Upload</Label><Input type="file" accept=".apk,.aab,.zip,.exe,.dmg,.pkg" onChange={(event) => setApkFile(event.target.files?.[0] ?? null)} /></div>
              <Button className="w-full" disabled={!canSubmit || createApp.isPending} onClick={() => createApp.mutate()}>
                {createApp.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                Upload App
              </Button>
            </CardContent>
          </Card>
        )}

        <div className={canManage ? "lg:col-span-8" : "lg:col-span-12"}>
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading marketplace...</div>
          ) : apps.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">No applications match the current filters.</CardContent></Card>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {apps.map((app: any) => {
                const icon = resolveMediaUrl(app.icon_url || app.thumbnail_url || "");
                const downloadUrl = app.download_url || app.download_link || app.apk_file_url || "";
                const published = Boolean(app.is_published ?? app.active);
                return (
                  <Card key={app.id} className="flex flex-col border-none shadow-sm">
                    <CardHeader>
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-primary/10 text-primary">
                          {icon ? <img src={icon} alt={app.title} className="h-full w-full object-cover" /> : <Store className="h-6 w-6" />}
                        </div>
                        <div className="flex flex-wrap justify-end gap-2">
                          <Badge variant="outline">{app.category}</Badge>
                          <Badge className={published ? "bg-emerald-600" : "bg-muted text-muted-foreground"}>{published ? "Published" : "Draft"}</Badge>
                        </div>
                      </div>
                      <CardTitle>{app.title || app.name}</CardTitle>
                      <p className="text-sm text-muted-foreground">{app.short_description || app.description}</p>
                    </CardHeader>
                    <CardContent className="flex-1">
                      <p className="line-clamp-4 text-sm text-muted-foreground">{app.full_description || app.short_description}</p>
                      <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-primary/40">Version {app.version || "1.0.0"}</p>
                    </CardContent>
                    <CardFooter className="flex flex-wrap gap-2">
                      {downloadUrl && <Button asChild size="sm"><a href={downloadUrl} target="_blank" rel="noreferrer"><Download className="mr-2 h-4 w-4" /> Download</a></Button>}
                      {canManage && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => publishApp.mutate({ id: String(app.id), published: !published })}>
                            {published ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                            {published ? "Unpublish" : "Publish"}
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteApp.mutate(String(app.id))}>
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                          </Button>
                        </>
                      )}
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
