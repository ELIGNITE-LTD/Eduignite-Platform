"use client";

import { useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  SelectGroup, SelectLabel,
} from "@/components/ui/select";
import {
  Megaphone, Send, Globe, Building2, Clock, Trash2, User, Users,
  GraduationCap, ShieldCheck, Loader2, Crown, Briefcase, Heart,
  ShieldAlert, Zap, Star, AlertCircle, RefreshCw, Pencil,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { announcementsService } from "@/lib/api/services/announcements.service";

const normalizeList = (payload: any) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
};

export default function AnnouncementsPage() {
  const { user } = useAuth();
  const { t, language } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Only CEO and CTO can send platform-level announcements
  const isFounderOwner = ["CEO", "CTO"].includes(user?.role || "");
  const isSchoolAdmin = ["SCHOOL_ADMIN", "SUB_ADMIN"].includes(user?.role || "");
  const isTeacher = user?.role === "TEACHER";
  const isBursar = user?.role === "BURSAR";
  const canPost = isFounderOwner || isSchoolAdmin || isTeacher || isBursar;

  const initialTarget = isFounderOwner ? "EXECUTIVE_BOARD" : "SCHOOL_ALL";
  const [formData, setFormData] = useState({ title: "", content: "", target: initialTarget });
  const [editing, setEditing] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ title: "", content: "" });

  // Fetch announcements
  const {
    data: rawAnnouncements = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["announcements-feed"],
    queryFn: async () => normalizeList(await announcementsService.getMyAnnouncementFeed()),
    retry: 2,
  });

  // Create announcement
  const createMutation = useMutation({
    mutationFn: (data: { title: string; content: string; target: string }) =>
      announcementsService.createAnnouncement(data as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements-feed"] });
      toast({ title: "Announcement Published", description: "Successfully broadcasted." });
      setFormData({ title: "", content: "", target: initialTarget });
    },
    onError: () => toast({ variant: "destructive", title: "Error", description: "Failed to send announcement." }),
  });

  // Mark read
  const markReadMutation = useMutation({
    mutationFn: (id: string) => announcementsService.markRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["announcements-feed"] }),
  });

  // Delete announcement
  const deleteMutation = useMutation({
    mutationFn: (id: string) => announcementsService.deleteAnnouncement(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements-feed"] });
      toast({ title: "Announcement removed." });
    },
    onError: () => toast({ variant: "destructive", title: "Error", description: "Failed to delete." }),
  });

  // Edit announcement
  const updateMutation = useMutation({
    mutationFn: (data: { id: string; title: string; content: string }) =>
      announcementsService.updateAnnouncement(data.id, { title: data.title, content: data.content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["announcements-feed"] });
      toast({ title: "Announcement updated", description: "Your changes have been saved." });
      setEditing(null);
    },
    onError: () => toast({ variant: "destructive", title: "Error", description: "Failed to update announcement." }),
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
    if (!formData.title.trim() || !formData.content.trim()) return;
    createMutation.mutate(formData);
  };

  const unreadCount = rawAnnouncements.filter((a: any) => !a.is_read).length;

  const getTargetIcon = (target: string) => {
    const icons: Record<string, React.ReactNode> = {
      ALL: <Globe className="w-3 h-3" />,
      SCHOOL_ALL: <Building2 className="w-3 h-3" />,
      STUDENT: <GraduationCap className="w-3 h-3" />,
      TEACHER: <Users className="w-3 h-3" />,
      PARENT: <Heart className="w-3 h-3" />,
      BURSAR: <Briefcase className="w-3 h-3" />,
      PERSONAL: <Star className="w-3 h-3 text-secondary" />,
    };
    return icons[target] ?? <Globe className="w-3 h-3" />;
  };

  const getTargetLabel = (target: string) => {
    const labels: Record<string, string> = {
      ALL: "All Users",
      EXECUTIVE_BOARD: "Executive Board",
      STAFF: "Platform Staff",
      PARTNER: "Partners",
      SCHOOL_ALL: "All School Members",
      STUDENT: "Students",
      TEACHER: "Teachers",
      PARENT: "Parents",
      BURSAR: "Bursar",
      LIBRARIAN: "Librarian",
      PERSONAL: "Personal",
    };
    return labels[target] ?? target;
  };

  const AnnouncementCard = ({ ann }: { ann: any }) => {
    const isOwn = String(ann.sender) === String(user?.id);
    // Prefer the backend-provided `can_manage` flag; fall back to ownership / founder role.
    const canManage = Boolean(ann.can_manage) || isFounderOwner || isOwn;
    const isPersonal = ann.target === "PERSONAL";
    const canEdit = canManage && !isPersonal;
    const canDelete = canManage;
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
            ann.target === "PERSONAL" ? "bg-secondary"
              : ann.target === "ALL" ? "bg-primary"
              : ann.target === "SCHOOL_ALL" ? "bg-blue-500"
              : "bg-primary/50"
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
                ann.target === "PERSONAL" ? "border-secondary text-primary bg-secondary/10" : "text-primary"
              )}
            >
              {getTargetIcon(ann.target)}
              {ann.target_display || getTargetLabel(ann.target)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <CardTitle className="text-lg font-black text-primary leading-tight">{ann.title}</CardTitle>
          {ann.content && (
            <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{ann.content}</div>
          )}
        </CardContent>
        {ann.target === "PERSONAL" && (
          <CardFooter className="bg-accent/10 py-2 border-t flex justify-center">
            <div className="flex items-center gap-2 text-muted-foreground">
              <ShieldCheck className="w-3 h-3 text-secondary" />
              <span className="text-[8px] font-black uppercase tracking-widest italic opacity-60">
                Official platform record — not replyable.
              </span>
            </div>
          </CardFooter>
        )}
        {(canEdit || canDelete) && (
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
            {canDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive gap-2 text-[10px] font-black uppercase h-8"
                onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(String(ann.id)); }}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="w-3.5 h-3.5" /> {language === "en" ? "Remove" : "Supprimer"}
              </Button>
            )}
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
            <p className="text-muted-foreground text-sm">Strategic platform messaging suite.</p>
          </div>

          <Card className="border-none shadow-xl bg-primary text-white rounded-[2rem] overflow-hidden">
            <CardHeader className="bg-white/10 p-8 border-b border-white/5">
              <CardTitle className="text-white uppercase tracking-tighter flex items-center gap-3">
                <Megaphone className="w-6 h-6 text-secondary" />
                Dispatch Directive
              </CardTitle>
              <CardDescription className="text-white/60">
                Target your audience across the node network.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-8 space-y-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-white/60">Recipient Target</Label>
                <Select value={formData.target} onValueChange={(v) => setFormData({ ...formData, target: v })}>
                  <SelectTrigger className="bg-white/10 border-white/20 text-white h-12 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {isFounderOwner ? (
                      <SelectGroup>
                        <SelectLabel className="text-[10px] font-black uppercase opacity-40 px-3 py-2">Board Channels</SelectLabel>
                        <SelectItem value="EXECUTIVE_BOARD" className="font-bold">Executive Board</SelectItem>
                        <SelectItem value="STAFF">Platform Staff</SelectItem>
                        <SelectItem value="PARTNER">Partners &amp; Investors</SelectItem>
                      </SelectGroup>
                    ) : isSchoolAdmin ? (
                      <SelectGroup>
                        <SelectLabel className="text-[10px] font-black uppercase opacity-40 px-3 py-2">School Scope</SelectLabel>
                        <SelectItem value="ALL">All School Members</SelectItem>
                        <SelectItem value="TEACHER">All Teachers</SelectItem>
                        <SelectItem value="STUDENT">All Students</SelectItem>
                        <SelectItem value="PARENT">Parents</SelectItem>
                        <SelectItem value="BURSAR">Bursar</SelectItem>
                      </SelectGroup>
                    ) : (
                      <SelectGroup>
                        <SelectLabel className="text-[10px] font-black uppercase opacity-40 px-3 py-2">Scope</SelectLabel>
                        <SelectItem value="ALL">All (School-wide)</SelectItem>
                        <SelectItem value="STUDENT">Students</SelectItem>
                      </SelectGroup>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-white/60">Title</Label>
                <Input
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/30 h-12 rounded-xl font-bold"
                  placeholder="e.g. System Update or Fee Notice"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-white/60">Content</Label>
                <Textarea
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/30 min-h-[150px] rounded-xl leading-relaxed"
                  placeholder="Message body..."
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
                disabled={createMutation.isPending || !formData.title.trim() || !formData.content.trim()}
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {t("sendAnnouncement")}
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      <div className={cn("space-y-6", canPost ? "lg:col-span-8" : "lg:col-span-12")}>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="text-xl font-black text-primary uppercase tracking-tighter flex items-center gap-3">
              <ShieldAlert className="w-6 h-6 text-secondary" />
              Strategic Dispatch Ledger
            </h2>
            <p className="text-xs text-muted-foreground">
              Authorized platform communiqués and institutional alerts.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {unreadCount > 0 && (
              <Badge variant="destructive" className="h-8 px-3 rounded-full font-black text-xs">
                {unreadCount} Unread
              </Badge>
            )}
            {isFounderOwner && (
              <Badge variant="outline" className="h-8 px-4 rounded-xl border-primary/10 text-primary font-black uppercase tracking-widest flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-secondary" /> Board Feed
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
              No announcements in the registry.
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
                ? "Update the title and content of your announcement."
                : "Mettez à jour le titre et le contenu de votre annonce."}
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
