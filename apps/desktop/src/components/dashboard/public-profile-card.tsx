"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Facebook, Github, Globe, Instagram, Linkedin, Loader2, Plus, Save, Trash2, Twitter, Youtube, Globe2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { usersService, type PublicLink } from "@/lib/api/services/users.service";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  linkedin: Linkedin,
  x: Twitter,
  github: Github,
  facebook: Facebook,
  instagram: Instagram,
  youtube: Youtube,
  website: Globe,
};

const PLACEHOLDERS: Record<string, string> = {
  linkedin: "linkedin.com/in/your-name",
  x: "x.com/your-handle",
  github: "github.com/your-name",
  facebook: "facebook.com/your-name",
  instagram: "instagram.com/your-handle",
  youtube: "youtube.com/@your-channel",
  website: "your-website.com",
};

function errorText(err: any): string {
  const data = err?.response?.data;
  if (!data) return "Could not save. Check your connection and try again.";
  if (typeof data === "string") return data;
  const first = data.bio?.[0] ?? data.links?.[0] ?? data.detail;
  return typeof first === "string" ? first : "Could not save. Please check what you entered.";
}

/**
 * The short bio and professional links a founder or executive shows on their public card.
 * Shown only to people who appear on the public leadership list; everyone else gets nothing.
 */
export function PublicProfileCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["founder-public-profile"],
    queryFn: () => usersService.getFounderPublicProfile(),
    retry: false, // a 403 just means "not a founder or executive"
  });

  const [bio, setBio] = useState("");
  const [links, setLinks] = useState<PublicLink[]>([]);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    if (data) {
      setBio(data.bio || "");
      setLinks(data.links || []);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () => usersService.updateFounderPublicProfile({ bio, links: links.filter((l) => l.url.trim()) }),
    onSuccess: (saved) => {
      setProblem("");
      setBio(saved.bio);
      setLinks(saved.links);
      queryClient.setQueryData(["founder-public-profile"], saved);
      toast({ title: "Public profile saved", description: "Your card on the About page is updated." });
    },
    onError: (err: any) => setProblem(errorText(err)),
  });

  const maxBio = data?.max_bio_length ?? 280;
  const maxLinks = data?.max_links ?? 6;
  const labelOf = useMemo(
    () => Object.fromEntries((data?.link_types ?? []).map((t) => [t.type, t.label])) as Record<string, string>,
    [data],
  );
  const unusedTypes = (current: string) =>
    (data?.link_types ?? []).filter((t) => t.type === current || !links.some((l) => l.type === t.type));

  const dirty =
    !!data &&
    (bio !== (data.bio || "") ||
      JSON.stringify(links.filter((l) => l.url.trim())) !== JSON.stringify(data.links || []));

  if (isLoading || isError || !data) return null;

  return (
    <Card className="border-none shadow-sm bg-white">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl font-black text-primary uppercase tracking-tight">
          <Globe2 className="w-5 h-5 text-secondary" />
          Public Profile
        </CardTitle>
        <CardDescription className="text-xs font-medium">
          This appears on your card on the EduIgnite About page. Write it as you would for a professional
          introduction. Your phone number and email are never shown.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <div className="flex items-end justify-between">
            <Label htmlFor="public-bio" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">
              Short bio
            </Label>
            <span className={`text-[11px] font-bold ${bio.length > maxBio ? "text-destructive" : "text-muted-foreground"}`}>
              {bio.length}/{maxBio}
            </span>
          </div>
          <Textarea
            id="public-bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={4}
            placeholder="Two or three sentences: your role, your experience and what you focus on at EduIgnite."
            className="bg-accent/30 border-none rounded-xl focus-visible:ring-primary font-medium resize-none"
          />
        </div>

        <div className="space-y-3">
          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">
            Professional links <span className="font-medium normal-case tracking-normal">(optional, up to {maxLinks})</span>
          </Label>
          {links.map((link, index) => {
            const Icon = ICONS[link.type] ?? Globe;
            return (
              <div key={index} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Select
                  value={link.type}
                  onValueChange={(value) => setLinks(links.map((l, i) => (i === index ? { ...l, type: value } : l)))}
                >
                  <SelectTrigger className="h-12 sm:w-48 bg-accent/30 border-none rounded-xl font-bold" aria-label="Link type">
                    <span className="flex items-center gap-2">
                      <Icon className="w-4 h-4 text-primary" />
                      <SelectValue />
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {unusedTypes(link.type).map((t) => (
                      <SelectItem key={t.type} value={t.type}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={link.url}
                  onChange={(e) => setLinks(links.map((l, i) => (i === index ? { ...l, url: e.target.value } : l)))}
                  placeholder={PLACEHOLDERS[link.type] ?? "https://"}
                  inputMode="url"
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-label={`${labelOf[link.type] ?? "Link"} address`}
                  className="h-12 flex-1 bg-accent/30 border-none rounded-xl focus-visible:ring-primary font-medium"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-12 w-12 rounded-xl text-muted-foreground hover:text-destructive"
                  onClick={() => setLinks(links.filter((_, i) => i !== index))}
                  aria-label={`Remove ${labelOf[link.type] ?? "link"}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            );
          })}
          {links.length < maxLinks && unusedTypes("").length > 0 && (
            <Button
              type="button"
              variant="outline"
              className="gap-2 rounded-xl font-bold"
              onClick={() => setLinks([...links, { type: unusedTypes("")[0].type, url: "" }])}
            >
              <Plus className="w-4 h-4" /> Add a link
            </Button>
          )}
          <p className="text-[11px] text-muted-foreground ml-1">
            Links open in a new tab. Each must be https and belong to the platform you choose.
          </p>
        </div>

        {problem && (
          <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
            {problem}
          </p>
        )}
      </CardContent>
      <CardFooter className="border-t bg-accent/5 pt-6">
        <Button
          onClick={() => save.mutate()}
          disabled={save.isPending || !dirty || bio.length > maxBio}
          className="gap-2 ml-auto h-12 px-8 rounded-xl shadow-lg font-bold"
        >
          {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save public profile
        </Button>
      </CardFooter>
    </Card>
  );
}
