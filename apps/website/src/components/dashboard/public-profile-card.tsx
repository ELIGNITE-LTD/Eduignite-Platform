"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api/client";
import { PersonCard } from "@/components/public/founders";
import { LinkIcon } from "@/components/public/social-icons";
import { resolveMediaUrl } from "@/lib/media";

type Kind = { kind: string; label: string; hint: string };
type Row = { kind: string; url: string };
type Profile = {
  name: string; title: string; role: string; avatar: string; is_cofounder: boolean; bio: string;
  links: Array<{ kind: string; label: string; url: string }>;
  limits: { bio: number; links: number }; link_kinds: Kind[];
};

const HOSTS: Record<string, string[] | null> = {
  linkedin: ["linkedin.com"], website: null, x: ["x.com", "twitter.com"], github: ["github.com"],
  facebook: ["facebook.com", "fb.com"], instagram: ["instagram.com"], youtube: ["youtube.com", "youtu.be"],
};

/** The same rules the server applies, so a mistake is explained next to the box before saving. */
function problem(row: Row, label: string): string {
  const url = row.url.trim();
  if (!url) return "";
  let parsed: URL;
  try { parsed = new URL(url); } catch { return "Paste the full address, starting with https://"; }
  if (parsed.protocol !== "https:") return "The address must start with https://";
  const host = parsed.hostname.toLowerCase();
  const allowed = HOSTS[row.kind];
  if (allowed && !allowed.some((d) => host === d || host.endsWith(`.${d}`))) return `That is not a ${label} address.`;
  return "";
}

/**
 * Founders and executive staff write the short bio and professional links shown on their public card. Hidden for
 * everyone else (the server answers 403 for people without a public profile).
 */
export function PublicProfileCard() {
  const { toast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [bio, setBio] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiClient.get("/users/public-profile/").then(({ data }) => {
      if (cancelled) return;
      setProfile(data); setBio(data.bio || ""); setRows((data.links || []).map((l: Row) => ({ kind: l.kind, url: l.url })));
    }).catch(() => { /* not a board member: nothing to show */ });
    return () => { cancelled = true; };
  }, []);

  const labelOf = (kind: string) => profile?.link_kinds.find((k) => k.kind === kind)?.label ?? kind;
  const hintOf = (kind: string) => profile?.link_kinds.find((k) => k.kind === kind)?.hint ?? "https://";
  const used = new Set(rows.map((r) => r.kind));
  const free = (profile?.link_kinds ?? []).filter((k) => !used.has(k.kind));
  const errors = rows.map((r) => problem(r, labelOf(r.kind)));
  const hasErrors = errors.some(Boolean);
  const dirty = profile ? bio.trim() !== (profile.bio || "") || JSON.stringify(rows.filter((r) => r.url.trim())) !== JSON.stringify(profile.links.map((l) => ({ kind: l.kind, url: l.url }))) : false;

  const preview = useMemo(() => profile ? ({
    name: profile.name, title: profile.title, role: profile.role, avatar: resolveMediaUrl(profile.avatar) || "", is_primary: false,
    is_cofounder: profile.is_cofounder, bio: bio.trim(),
    links: rows.filter((r, i) => r.url.trim() && !errors[i]).map((r) => ({ kind: r.kind, label: labelOf(r.kind), url: r.url.trim() })),
  }) : null, [profile, bio, rows]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!profile || !preview) return null;

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await apiClient.put("/users/public-profile/", { bio: bio.trim(), links: rows.filter((r) => r.url.trim()) });
      setProfile(data); setBio(data.bio || ""); setRows((data.links || []).map((l: Row) => ({ kind: l.kind, url: l.url })));
      toast({ title: "Your public profile is updated", description: "It now shows on the EduIgnite website." });
    } catch (e: any) {
      const detail = e?.response?.data?.errors?.links || e?.response?.data?.errors?.bio || e?.response?.data?.detail;
      toast({ variant: "destructive", title: "Could not save", description: Array.isArray(detail) ? detail[0] : (detail || "Check what you typed and try again.") });
    }
    setSaving(false);
  };

  return (
    <Card className="border-none bg-white shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl font-black uppercase tracking-tight text-primary">Public profile</CardTitle>
        <CardDescription>The short bio and links shown on your card on the EduIgnite website. Keep it professional: this is public.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          <div>
            <label htmlFor="public-bio" className="text-xs font-black uppercase tracking-widest text-muted-foreground">Short bio</label>
            <Textarea id="public-bio" value={bio} maxLength={profile.limits.bio} onChange={(e) => setBio(e.target.value)} className="mt-1.5 min-h-[120px]"
              placeholder="Two or three sentences: what you do, your experience, and what you are building." />
            <p className={`mt-1 text-right text-[11px] font-semibold ${bio.length > profile.limits.bio - 40 ? "text-amber-600" : "text-muted-foreground"}`}>{bio.length} / {profile.limits.bio}</p>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Links (up to {profile.limits.links})</p>
            {rows.map((r, i) => (
              <div key={r.kind}>
                <div className="flex items-center gap-2">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-slate-50 text-[#264D73]" title={labelOf(r.kind)}><LinkIcon kind={r.kind} className="h-4 w-4" /></span>
                  <Input aria-label={`${labelOf(r.kind)} address`} inputMode="url" value={r.url} placeholder={hintOf(r.kind)} maxLength={200}
                    onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, url: e.target.value } : x)))} className={errors[i] ? "border-red-400" : ""} />
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${labelOf(r.kind)}`} onClick={() => setRows(rows.filter((_, k) => k !== i))}><Trash2 className="h-4 w-4" /></Button>
                </div>
                {errors[i] ? <p className="ml-12 mt-1 text-xs font-semibold text-red-600">{errors[i]}</p> : null}
              </div>
            ))}
            {rows.length < profile.limits.links && free.length > 0 ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {free.map((k) => (
                  <Button key={k.kind} type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => setRows([...rows, { kind: k.kind, url: "" }])}>
                    <Plus className="h-3.5 w-3.5" /><LinkIcon kind={k.kind} className="h-3.5 w-3.5" />{k.label}
                  </Button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-black uppercase tracking-widest text-muted-foreground">How it looks</p>
          <PersonCard f={preview} lead={profile.is_cofounder} />
        </div>
      </CardContent>
      <CardFooter className="justify-end">
        <Button onClick={save} disabled={saving || !dirty || hasErrors} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save public profile
        </Button>
      </CardFooter>
    </Card>
  );
}
