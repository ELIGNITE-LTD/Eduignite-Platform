"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MessageSquare, Send, Clock, CheckCircle2, MessageCircle,
  ShieldCheck, AlertCircle, Lightbulb, Heart, Settings2,
  HelpCircle, Loader2, RefreshCw, User,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { feedbackService } from "@/lib/api/services/feedback.service";
import { useI18n } from "@/lib/i18n-context";
import { getApiErrorMessage } from "@/lib/api/errors";

const normalizeList = (payload: any) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
};

const SUBJECT_OPTIONS = [
  { value: "Technical Error", label: "Error / Bug Report", icon: AlertCircle, color: "text-red-500" },
  { value: "Feature Suggestion", label: "Feature Suggestion", icon: Lightbulb, color: "text-amber-500" },
  { value: "General Appreciation", label: "General Appreciation", icon: Heart, color: "text-rose-500" },
  { value: "Billing & Subscription", label: "Billing & Subscription", icon: Settings2, color: "text-blue-500" },
  { value: "Administrative Request", label: "Administrative Request", icon: ShieldCheck, color: "text-green-500" },
  { value: "Other", label: "Other Support Request", icon: HelpCircle, color: "text-muted-foreground" },
];

const STATUS_STYLE: Record<string, string> = {
  Resolved: "bg-green-100 text-green-700",
  Pending: "bg-amber-100 text-amber-700",
  "In Progress": "bg-blue-100 text-blue-700",
};

export default function FeedbackPage() {
  const { user } = useAuth();
  const { translateText } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [newFeedback, setNewFeedback] = useState({ subject: "", category: "general", message: "", priority: "medium" });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const isSuperAdmin = ["SUPER_ADMIN", "CEO", "CTO", "COO", "INV"].includes(user?.role || "");

  // All feedbacks (for admins)
  const {
    data: feedbacks = [],
    isLoading: loadingAll,
    isError: errorAll,
    refetch: refetchAll,
  } = useQuery({
    queryKey: ["all-feedbacks"],
    queryFn: async () => normalizeList(await feedbackService.getFeedbacks()),
    enabled: isSuperAdmin,
    retry: 2,
  });

  // My feedbacks (for regular users)
  const {
    data: myFeedbacks = [],
    isLoading: loadingMine,
  } = useQuery({
    queryKey: ["my-feedbacks"],
    queryFn: async () => normalizeList(await feedbackService.getMyFeedbacks()),
    enabled: !isSuperAdmin,
    retry: 2,
  });

  // Create feedback
  const createMutation = useMutation({
    mutationFn: (data: { subject: string; category: string; message: string; priority: string }) =>
      feedbackService.createFeedback(data as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-feedbacks"] });
      setFieldErrors({});
      toast({ title: translateText("Feedback Sent"), description: translateText("Your feedback has been submitted. The EduIgnite team will review it.") });
      setNewFeedback({ subject: "", category: "general", message: "", priority: "medium" });
    },
    onError: (error: any) => {
      const data = error?.response?.data;
      if (data && typeof data === "object") {
        const nextErrors: Record<string, string> = {};
        Object.entries(data).forEach(([key, value]) => {
          nextErrors[key] = Array.isArray(value) ? value.join(", ") : String(value);
        });
        setFieldErrors(nextErrors);
      }
      toast({ variant: "destructive", title: translateText("Error"), description: getApiErrorMessage(error, "Failed to send feedback.") });
    },
  });

  // Resolve feedback
  const resolveMutation = useMutation({
    mutationFn: (id: string) => feedbackService.resolveFeedback(id, "Resolved by admin."),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-feedbacks"] });
      toast({ title: translateText("Feedback Resolved"), description: translateText("Ticket has been marked as resolved.") });
    },
    onError: () => toast({ variant: "destructive", title: translateText("Error"), description: translateText("Failed to resolve feedback.") }),
  });

  // --- Admin view ---
  if (isSuperAdmin) {
    return (
      <div className="space-y-8 pb-20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-primary font-headline flex items-center gap-3">
              <div className="p-2 bg-primary rounded-xl shadow-lg text-white">
                <MessageCircle className="w-6 h-6 text-secondary" />
              </div>
              Platform Feedback
            </h1>
            <p className="text-muted-foreground mt-1">
              Review issues, suggestions, and support requests from institutional admins.
            </p>
          </div>
          <Badge variant="outline" className="h-10 px-4 rounded-xl border-primary/20 text-primary font-black uppercase tracking-widest">
            {feedbacks.length} Active Tickets
          </Badge>
        </div>

        {loadingAll && (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary/40" />
          </div>
        )}

        {errorAll && !loadingAll && (
          <div className="flex flex-col items-center py-12 gap-3">
            <AlertCircle className="w-8 h-8 text-destructive/40" />
            <p className="text-muted-foreground">Failed to load feedback tickets.</p>
            <Button variant="outline" size="sm" onClick={() => refetchAll()} className="gap-2">
              <RefreshCw className="w-4 h-4" /> Retry
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6">
          {feedbacks.map((fb: any) => (
            <Card key={fb.id} className="border-none shadow-xl overflow-hidden group hover:shadow-2xl transition-all duration-300">
              <div className="flex flex-col md:flex-row">
                <div className="w-full md:w-64 bg-accent/20 border-r p-6 flex flex-col items-center text-center space-y-4 shrink-0">
                  <Avatar className="h-20 w-20 border-4 border-white shadow-xl">
                    <AvatarImage src={fb.sender_avatar || ""} />
                    <AvatarFallback className="bg-primary text-white text-2xl font-bold">
                      {fb.sender_name?.charAt(0) || <User className="w-8 h-8" />}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="font-black text-primary text-sm uppercase leading-tight">{fb.sender_name}</h3>
                    {fb.sender_role && (
                      <p className="text-[10px] text-muted-foreground uppercase font-bold mt-1">{fb.sender_role}</p>
                    )}
                  </div>
                  <div className="pt-4 border-t border-accent/50 w-full">
                    <Badge className={cn("w-full justify-center py-1 font-black uppercase text-[9px]", STATUS_STYLE[fb.status] || "bg-amber-100 text-amber-700")}>
                      {translateText(fb.status || "Pending")}
                    </Badge>
                  </div>
                </div>

                <div className="flex-1 p-6 md:p-8 flex flex-col">
                  <div className="flex items-center gap-2 mb-4">
                    <Badge variant="secondary" className="bg-primary/5 text-primary border-primary/10 font-bold uppercase text-[10px]">
                      {translateText(fb.subject)}
                    </Badge>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1 ml-auto">
                      <Clock className="w-3 h-3" />
                      {fb.created_at ? new Date(fb.created_at).toLocaleString() : ""}
                    </p>
                  </div>

                  <div className="bg-white/50 border border-accent rounded-2xl p-6 italic text-muted-foreground leading-relaxed flex-1">
                    "{translateText(fb.message)}"
                  </div>

                  <div className="mt-6 pt-4 border-t flex justify-end">
                    <Button
                      className="gap-2 shadow-lg"
                      onClick={() => resolveMutation.mutate(String(fb.id))}
                      disabled={fb.status === "Resolved" || resolveMutation.isPending}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      {fb.status === "Resolved" ? translateText("Resolved") : "Resolve Ticket"}
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
          {!loadingAll && !errorAll && feedbacks.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 bg-white/50 rounded-3xl border-2 border-dashed">
              <MessageSquare className="w-16 h-16 text-primary/10" />
              <p className="text-muted-foreground">No platform feedback found in the queue.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- Regular user view ---
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold text-primary font-headline">Contact Support</h1>

      <Card className="border-none shadow-xl rounded-[2rem] overflow-hidden">
        <CardHeader className="bg-primary p-8 text-white">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/10 rounded-2xl">
              <MessageSquare className="w-8 h-8 text-secondary" />
            </div>
            <div>
              <CardTitle className="text-2xl font-black">Submit Feedback</CardTitle>
              <CardDescription className="text-white/60">
                Your suggestions help improve the platform for everyone.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-8 space-y-6">
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Subject / Category</Label>
            <Select value={newFeedback.subject} onValueChange={(v) => setNewFeedback({ ...newFeedback, subject: v })}>
              <SelectTrigger className="h-12 bg-accent/30 border-none rounded-xl">
                <SelectValue placeholder="Select category..." />
              </SelectTrigger>
              <SelectContent>
                {SUBJECT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div className="flex items-center gap-2">
                      <opt.icon className={cn("w-4 h-4", opt.color)} />
                      <span>{translateText(opt.value) || opt.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldErrors.subject && <p className="text-xs font-bold text-destructive">{fieldErrors.subject}</p>}
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Category</Label>
            <Input
              value={newFeedback.category}
              onChange={(e) => setNewFeedback({ ...newFeedback, category: e.target.value })}
              className="h-12 bg-accent/30 border-none rounded-xl"
              placeholder="technical, billing, academic, general"
            />
            {fieldErrors.category && <p className="text-xs font-bold text-destructive">{fieldErrors.category}</p>}
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Priority</Label>
            <Select value={newFeedback.priority} onValueChange={(v) => setNewFeedback({ ...newFeedback, priority: v })}>
              <SelectTrigger className="h-12 bg-accent/30 border-none rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
            {fieldErrors.priority && <p className="text-xs font-bold text-destructive">{fieldErrors.priority}</p>}
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Message Body</Label>
            <Textarea
              placeholder="Describe your issue or suggestion..."
              className="min-h-[200px] bg-accent/30 border-none rounded-xl focus-visible:ring-primary"
              value={newFeedback.message}
              onChange={(e) => setNewFeedback({ ...newFeedback, message: e.target.value })}
            />
            {fieldErrors.message && <p className="text-xs font-bold text-destructive">{fieldErrors.message}</p>}
          </div>
        </CardContent>
        <CardFooter className="bg-accent/20 p-6 border-t border-accent">
          <Button
            className="w-full h-14 rounded-2xl shadow-xl font-black uppercase text-xs gap-3"
            onClick={() => createMutation.mutate(newFeedback)}
            disabled={createMutation.isPending || !newFeedback.message.trim() || !newFeedback.subject}
          >
            {createMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            Send Official Feedback
          </Button>
        </CardFooter>
      </Card>

      {/* My submitted feedbacks */}
      {(myFeedbacks.length > 0 || loadingMine) && (
        <div className="space-y-4">
          <h2 className="text-lg font-black text-primary uppercase tracking-tight">My Submissions</h2>
          {loadingMine && (
            <div className="flex justify-center py-6">
              <Loader2 className="w-6 h-6 animate-spin text-primary/40" />
            </div>
          )}
          {myFeedbacks.map((fb: any) => (
            <Card key={fb.id} className="border-none shadow-sm rounded-2xl bg-white">
              <CardContent className="p-5 space-y-2">
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="bg-primary/5 text-primary border-none font-bold uppercase text-[10px]">
                    {translateText(fb.subject)}
                  </Badge>
                  <Badge className={cn("text-[9px] font-black uppercase border-none", STATUS_STYLE[fb.status] || "bg-amber-100 text-amber-700")}>
                    {translateText(fb.status || "Pending")}
                  </Badge>
                </div>
                {fb.message && (
                  <p className="text-sm text-muted-foreground leading-relaxed">{translateText(fb.message)}</p>
                )}
                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {fb.created_at ? new Date(fb.created_at).toLocaleString() : ""}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
