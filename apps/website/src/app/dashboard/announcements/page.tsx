"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Megaphone, Send, Globe, Building2, Clock, Trash2, User, Users,
  GraduationCap, ShieldCheck, Loader2, Crown, Briefcase, Heart,
  ShieldAlert, Zap, Star, AlertCircle, RefreshCw, Pencil, KeyRound,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { apiClient } from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import { getApiErrorMessage } from "@/lib/api/errors";
import {
  announcementsService,
  type AnnouncementAudienceGrant,
  type AnnouncementAudiences,
} from "@/lib/api/services/announcements.service";

const normalizeList = (payload: any) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
};

const ALL_SCHOOLS = "__all__";

const GRANTABLE_AUDIENCES = [
  { value: "ALL_SCHOOL_USERS", label: "All School Users" },
  { value: "ALL_EDUIGNITE_USERS", label: "All EduIgnite Users" },
  { value: "PRINCIPAL", label: "Principal" },
  { value: "PARENT", label: "Parent" },
];

const TARGET_LABELS: Record<string, string> = {
  EXECUTIVE: "Executives",
  ALL_SCHOOL_USERS: "All School Users",
  ALL_EDUIGNITE_USERS: "All EduIgnite Users",
  PRINCIPAL: "Principals",
  ALL: "All School Members",
  SCHOOL_ALL: "All School Members",
  STUDENT: "Students",
  TEACHER: "Teachers",
  PARENT: "Parents",
  BURSAR: "Bursar",
  LIBRARIAN: "Librarian",
  PERSONAL: "Personal",
};

/**
 * Announcements. Who may send to whom is decided by the server
 * (/announcements/announcements/audiences/): the CEO chooses among every
 * platform audience, other executives always send to executives only (no
 * picker is shown), and school staff address their own school. The feed is
 * filtered on the server too, so it only ever holds what this person may see.
 */
export default function AnnouncementsPage() {
  const { user } = useAuth();
  const { t, language } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({ title: "", content: "", target: "", target_school: ALL_SCHOOLS });
  const [editing, setEditing] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ title: "", content: "" });
  const [grantForm, setGrantForm] = useState({ user: "", audience: "ALL_SCHOOL_USERS" });

  const { data: audienceInfo } = useQuery<AnnouncementAudiences>({
    queryKey: ["announcement-audiences", user?.id],
    queryFn: () => announcementsService.getAudiences(),
    enabled: Boolean(user),
    staleTime: 5 * 60 * 1000,
  });
  const canPost = Boolean(audienceInfo?.can_publish);
  const isPlatformScope = audienceInfo?.scope === "platform";
  const showPicker = Boolean(audienceInfo?.show_audience_picker);
  const canChooseSchool = Boolean(audienceInfo?.can_choose_target_school);
  const isCEO = user?.role === "CEO";
  const target = formData.target || audienceInfo?.default_target || "";

  useEffect(() => {
    if (audienceInfo?.default_target && !formData.target) {
      setFormData((current) => ({ ...current, target: audienceInfo.default_target || "" }));
    }
  }, [audienceInfo?.default_target, formData.target]);

  const {
    data: rawAnnouncements = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["announcements-feed", user?.id],
    queryFn: async () => normalizeList(await announcementsService.getMyAnnouncementFeed()),
    enabled: Boolean(user),
    retry: 2,
  });

  const { data: schoolOptions = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["announcement-school-options"],
    queryFn: async () => {
      const { data } = await apiClient.get(API.SCHOOLS.BASE, { params: { page_size: 500 } });
      return normalizeList(data);
    },
    enabled: canChooseSchool && target === "PARENT",
    staleTime: 10 * 60 * 1000,
  });

  const { data: grants = [] } = useQuery<AnnouncementAudienceGrant[]>({
    queryKey: ["announcement-audience-grants"],
    queryFn: () => announcementsService.getAudienceGrants(),
    enabled: isCEO,
  });

  const { data: executives = [] } = useQuery<{ id: string; name: string; role: string }[]>({
    queryKey: ["announcement-grant-executives"],
    queryFn: async () => {
      const { data } = await apiClient.get("/users/", {
        params: { role: "CTO,COO,INV,DESIGNER,SUPER_ADMIN,SYSTEM_DEV", page_size: 100 },
      });
      return normalizeList(data);
    },
    enabled: isCEO,
    staleTime: 10 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      announcementsService.createAnnouncement({
        title: formData.title,
        content: formData.content,
        target,
        target_school:
          target === "PARENT" && canChooseSchool && formData.target_school !== ALL_SCHOOLS
            ? formData.target_school
            : null,
      } as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements-feed"] });
      toast({ title: "Announcement published" });
      setFormData({ title: "", content: "", target: audienceInfo?.default_target || "", target_school: ALL_SCHOOLS });
    },
    onError: (error) =>
      toast({
        variant: "destructive",
        title: "Could not send",
        description: getApiErrorMessage(error, "Failed to send announcement."),
      }),
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => announcementsService.markRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["announcements-feed"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => announcementsService.deleteAnnouncement(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements-feed"] });
      toast({ title: "Announcement removed." });
    },
    onError: (error) =>
      toast({ variant: "destructive", title: "Could not delete", description: getApiErrorMessage(error) }),
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: string; title: string; content: string }) =>
      announcementsService.updateAnnouncement(data.id, { title: data.title, content: data.content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements-feed"] });
      toast({ title: "Announcement updated", description: "Your changes have been saved." });
      setEditing(null);
    },
    onError: (error) =>
      toast({ variant: "destructive", title: "Could not update", description: getApiErrorMessage(error) }),
  });

  const grantMutation = useMutation({
    mutationFn: () => announcementsService.grantAudience(grantForm.user, grantForm.audience),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcement-audience-grants"] });
      setGrantForm((current) => ({ ...current, user: "" }));
      toast({ title: "Audience granted" });
    },
    onError: (error) =>
      toast({ variant: "destructive", title: "Could not grant", description: getApiErrorMessage(error) }),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: number) => announcementsService.revokeAudienceGrant(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["announcement-audience-grants"] }),
    onError: (error) =>
      toast({ variant: "destructive", title: "Could not revoke", description: getApiErrorMessage(error) }),
  });

  const openEdit = (ann: any) => {
    setEditing(ann);
    setEditForm({ title: ann.title || "", content: ann.content || "" });
  };

  const submitEdit = () => {
    if (!editing || !editForm.title.trim() || !editForm.content.trim()) return;
    updateMutation.mutate({ id: String(editing.id), title: editForm.title, content: editForm.content });
  };

  const handleSend = () => {
    if (!formData.title.trim() || !formData.content.trim() || !target) return;
    createMutation.mutate();
  };

  const unreadCount = rawAnnouncements.filter((a: any) => !a.is_read).length;

  const getTargetIcon = (value: string) => {
    const icons: Record<string, React.ReactNode> = {
      EXECUTIVE: <Crown className="w-3 h-3" />,
      ALL_EDUIGNITE_USERS: <Globe className="w-3 h-3" />,
      ALL_SCHOOL_USERS: <Building2 className="w-3 h-3" />,
      PRINCIPAL: <ShieldCheck className="w-3 h-3" />,
      ALL: <Building2 className="w-3 h-3" />,
      SCHOOL_ALL: <Building2 className="w-3 h-3" />,
      STUDENT: <GraduationCap className="w-3 h-3" />,
      TEACHER: <Users className="w-3 h-3" />,
      PARENT: <Heart className="w-3 h-3" />,
      BURSAR: <Briefcase className="w-3 h-3" />,
      PERSONAL: <Star className="w-3 h-3 text-secondary" />,
    };
    return icons[value] ?? <Globe className="w-3 h-3" />;
  };

  const audienceBadge = (ann: any) => {
    const label = TARGET_LABELS[ann.target] || ann.target_display || ann.target;
    return ann.target_school_name ? `${label} · ${ann.target_school_name}` : label;
  };

  const AnnouncementCard = ({ ann }: { ann: any }) => {
    const canManage = Boolean(ann.can_manage);
    const isPersonal = ann.target === "PERSONAL";
    const canEdit = canManage && !isPersonal;
    return (
      <Card
        className="border-none shadow-sm relative overflow-hidden group hover:shadow-md transition-all bg-white rounded-2xl cursor-pointer"
        onClick={() => !ann.is_read && markReadMutation.mutate(String(ann.id))}
      >
        {!ann.is_read && (
          <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-secondary animate-pulse" />
        )}
        <div
          className={cn(
            "absolute top-0 left-0 w-1.5 h-full",
            isPersonal ? "bg-secondary"
              : ann.scope === "platform" ? "bg-primary"
              : "bg-blue-500"
          )}
        />
        <CardHeader className="pb-3">
          <div className="flex justify-between items-start gap-4">
            <div className="flex gap-3">
              <Avatar className="h-10 w-10 border border-primary/10 shadow-sm">
                <AvatarImage src={ann.sender_avatar || ""} alt={ann.sender_name} />
                <AvatarFallback className="bg-primary/5 text-primary">
                  <User className="h-5 w-5" />
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-primary">{ann.sender_name || "Unknown"}</span>
                  {ann.sender_role && (
                    <Badge variant="secondary" className="text-[9px] h-4 py-0 font-black uppercase tracking-wider bg-secondary/20 text-primary border-none">
                      {ann.sender_role}
                    </Badge>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {ann.created_at ? new Date(ann.created_at).toLocaleString() : ""}
                </p>
              </div>
            </div>
            <Badge
              variant="outline"
              className={cn(
                "text-[9px] gap-1 shrink-0 uppercase border-primary/10 font-black",
                isPersonal ? "border-secondary text-primary bg-secondary/10" : "text-primary"
              )}
            >
              {getTargetIcon(ann.target)}
              {audienceBadge(ann)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <CardTitle className="text-lg font-black text-primary leading-tight">{ann.title}</CardTitle>
          {ann.content && (
            <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{ann.content}</div>
          )}
        </CardContent>
        {isPersonal && (
          <CardFooter className="bg-accent/10 py-2 border-t flex justify-center">
            <div className="flex items-center gap-2 text-muted-foreground">
              <ShieldCheck className="w-3 h-3 text-secondary" />
              <span className="text-[8px] font-black uppercase tracking-widest italic opacity-60">
                Official platform record. Replies are not possible.
              </span>
            </div>
          </CardFooter>
        )}
        {canManage && (
          <CardFooter className="pt-0 justify-end gap-1">
            {canEdit && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-primary gap-2 text-[10px] font-black uppercase h-8"
                onClick={(e) => { e.stopPropagation(); openEdit(ann); }}
              >
                <Pencil className="w-3.5 h-3.5" /> {language === "en" ? "Edit" : "Modifier"}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive gap-2 text-[10px] font-black uppercase h-8"
              onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(String(ann.id)); }}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="w-3.5 h-3.5" /> {language === "en" ? "Remove" : "Supprimer"}
            </Button>
          </CardFooter>
        )}
      </Card>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {canPost && (
        <div className="lg:col-span-4 space-y-6">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold text-primary font-headline">Broadcast</h1>
            <p className="text-muted-foreground text-sm">
              {isPlatformScope ? "Announcements from EduIgnite leadership." : "Announcements for your school."}
            </p>
          </div>

          <Card className="border-none shadow-xl bg-primary text-white rounded-[2rem] overflow-hidden">
            <CardHeader className="bg-white/10 p-8 border-b border-white/5">
              <CardTitle className="text-white uppercase tracking-tighter flex items-center gap-3">
                <Megaphone className="w-6 h-6 text-secondary" />
                New announcement
              </CardTitle>
              <CardDescription className="text-white/60">
                {showPicker
                  ? "Choose who receives it. Only that audience will see it."
                  : isPlatformScope
                    ? "Visible to EduIgnite executives only."
                    : "Choose who in your school receives it."}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-8 space-y-6">
              {showPicker ? (
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-white/60">Audience</Label>
                  <Select
                    value={target}
                    onValueChange={(v) => setFormData({ ...formData, target: v, target_school: ALL_SCHOOLS })}
                  >
                    <SelectTrigger className="bg-white/10 border-white/20 text-white h-12 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {(audienceInfo?.targets || []).map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {TARGET_LABELS[option.value] || option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : isPlatformScope ? (
                <div className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-xs font-bold text-white/80">
                  <Crown className="h-4 w-4 text-secondary" /> Audience: Executives
                </div>
              ) : null}

              {target === "PARENT" && canChooseSchool && (
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-white/60">School</Label>
                  <Select
                    value={formData.target_school}
                    onValueChange={(v) => setFormData({ ...formData, target_school: v })}
                  >
                    <SelectTrigger className="bg-white/10 border-white/20 text-white h-12 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value={ALL_SCHOOLS}>Parents at every school</SelectItem>
                      {schoolOptions.map((school) => (
                        <SelectItem key={school.id} value={String(school.id)}>{school.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-white/60">Title</Label>
                <Input
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/30 h-12 rounded-xl font-bold"
                  placeholder="e.g. System update or fee notice"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-white/60">Content</Label>
                <Textarea
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/30 min-h-[150px] rounded-xl leading-relaxed"
                  placeholder="Message body"
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                />
              </div>
            </CardContent>
            <CardFooter className="p-8 pt-0">
              <Button
                variant="secondary"
                className="w-full h-14 gap-3 shadow-lg font-black uppercase tracking-widest text-xs rounded-2xl bg-secondary text-primary hover:bg-secondary/90"
                onClick={handleSend}
                disabled={createMutation.isPending || !formData.title.trim() || !formData.content.trim() || !target}
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {t("sendAnnouncement")}
              </Button>
            </CardFooter>
          </Card>

          {isCEO && (
            <Card className="border-none shadow-md rounded-[2rem]">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base font-black text-primary">
                  <KeyRound className="h-4 w-4" /> Audience permissions
                </CardTitle>
                <CardDescription>
                  Other executives reach executives only. Grant one of them a wider audience here.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Select value={grantForm.user} onValueChange={(v) => setGrantForm({ ...grantForm, user: v })}>
                    <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Choose an executive" /></SelectTrigger>
                    <SelectContent>
                      {executives.map((person) => (
                        <SelectItem key={person.id} value={String(person.id)}>
                          {person.name} ({person.role})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={grantForm.audience} onValueChange={(v) => setGrantForm({ ...grantForm, audience: v })}>
                    <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {GRANTABLE_AUDIENCES.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    className="h-11 rounded-xl"
                    onClick={() => grantMutation.mutate()}
                    disabled={!grantForm.user || grantMutation.isPending}
                  >
                    Grant audience
                  </Button>
                </div>
                {grants.length > 0 && (
                  <ul className="divide-y rounded-2xl border">
                    {grants.map((grant) => (
                      <li key={grant.id} className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-primary">{grant.user_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {grant.user_role} · {TARGET_LABELS[grant.audience] || grant.audience}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => revokeMutation.mutate(grant.id)}
                          disabled={revokeMutation.isPending}
                        >
                          Revoke
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div className={cn("space-y-6", canPost ? "lg:col-span-8" : "lg:col-span-12")}>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="text-xl font-black text-primary uppercase tracking-tighter flex items-center gap-3">
              <ShieldAlert className="w-6 h-6 text-secondary" />
              Announcements
            </h2>
            <p className="text-xs text-muted-foreground">
              Only announcements addressed to you appear here.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {unreadCount > 0 && (
              <Badge variant="destructive" className="h-8 px-3 rounded-full font-black text-xs">
                {unreadCount} Unread
              </Badge>
            )}
            {isPlatformScope && (
              <Badge variant="outline" className="h-8 px-4 rounded-xl border-primary/10 text-primary font-black uppercase tracking-widest flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-secondary" /> Leadership feed
              </Badge>
            )}
          </div>
        </div>

        {isLoading && (
          <div className="grid grid-cols-1 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-40 bg-gray-200 rounded-2xl animate-pulse" />
            ))}
          </div>
        )}

        {isError && !isLoading && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 bg-white/50 rounded-[2rem] border-2 border-dashed border-destructive/20">
            <AlertCircle className="w-12 h-12 text-destructive/30" />
            <p className="text-muted-foreground font-bold">Failed to load announcements.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
              <RefreshCw className="w-4 h-4" /> Retry
            </Button>
          </div>
        )}

        {!isLoading && !isError && rawAnnouncements.length > 0 && (
          <div className="grid grid-cols-1 gap-4">
            {rawAnnouncements.map((ann: any) => (
              <AnnouncementCard key={ann.id} ann={ann} />
            ))}
          </div>
        )}

        {!isLoading && !isError && rawAnnouncements.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center space-y-4 bg-white/50 rounded-[2.5rem] border-2 border-dashed border-primary/10">
            <Megaphone className="w-16 h-16 text-primary/10" />
            <p className="text-muted-foreground font-black uppercase tracking-widest text-xs">
              No announcements yet.
            </p>
          </div>
        )}
      </div>

      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{language === "en" ? "Edit Announcement" : "Modifier l'annonce"}</DialogTitle>
            <DialogDescription>
              {language === "en"
                ? "Update the title and content of your announcement. Its audience stays the same."
                : "Mettez à jour le titre et le contenu de votre annonce. Son audience reste la même."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                {language === "en" ? "Title" : "Titre"}
              </Label>
              <Input
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                className="h-12 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                {language === "en" ? "Content" : "Contenu"}
              </Label>
              <Textarea
                value={editForm.content}
                onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                className="min-h-[150px] rounded-xl"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              {language === "en" ? "Cancel" : "Annuler"}
            </Button>
            <Button
              onClick={submitEdit}
              disabled={updateMutation.isPending || !editForm.title.trim() || !editForm.content.trim()}
              className="gap-2"
            >
              {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}
              {language === "en" ? "Save Changes" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
