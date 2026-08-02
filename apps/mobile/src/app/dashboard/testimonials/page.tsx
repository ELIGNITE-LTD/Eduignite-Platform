
"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Quote,
  CheckCircle2,
  Trash2,
  Clock,
  Building2,
  Loader2,
  ShieldCheck,
  Search,
  MessageSquare,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { communityService } from "@/lib/api/services/community.service";

const normalizeList = (payload: any) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
};

const usePendingTestimonies = () =>
  useQuery({
    queryKey: ["pending-testimonies-page"],
    queryFn: async () => normalizeList(await communityService.getPendingTestimonies()),
    retry: 2,
  });

const useApproveTestimony = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => communityService.approveTestimony(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-testimonies-page"] });
      queryClient.invalidateQueries({ queryKey: ["testimonies"] });
    },
  });
};

const useRejectTestimony = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => communityService.rejectTestimony(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-testimonies-page"] });
    },
  });
};

export default function TestimonyManagementPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");

  const isSuperAdmin = user?.role && ["SUPER_ADMIN", "CEO", "CTO", "INV", "COO"].includes(user.role);

  const {
    data: pendingTestimonies = [],
    isLoading,
    isError,
    refetch,
  } = usePendingTestimonies();

  const approveMutation = useApproveTestimony();
  const rejectMutation = useRejectTestimony();

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
        <div className="p-6 bg-red-50 rounded-full border-2 border-dashed border-red-200">
          <AlertCircle className="w-16 h-16 text-red-400" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-black text-primary uppercase">Unauthorized Access</h1>
          <p className="text-muted-foreground max-w-md">
            Only platform executives are authorized to moderate community testimonies.
          </p>
        </div>
        <Button asChild className="rounded-xl px-10">
          <Link href="/dashboard">Return to Dashboard</Link>
        </Button>
      </div>
    );
  }

  // Each testimony now has: id, author{name,avatar,role}, school_name, role_display, message, content, status, created_at
  const filteredPending = pendingTestimonies.filter((e: any) => {
    const term = searchTerm.toLowerCase();
    return (
      e.author?.name?.toLowerCase().includes(term) ||
      e.school_name?.toLowerCase().includes(term) ||
      e.message?.toLowerCase().includes(term)
    );
  });

  const handleApprove = async (id: string) => {
    try {
      await approveMutation.mutateAsync(id);
      toast({ title: "Testimony Approved", description: "Now live on the public community portal." });
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to approve testimony." });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await rejectMutation.mutateAsync(id);
      toast({ variant: "destructive", title: "Testimony Rejected" });
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to reject testimony." });
    }
  };

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary font-headline flex items-center gap-3">
            <div className="p-2 bg-primary rounded-xl shadow-lg text-white">
              <Quote className="w-6 h-6 text-secondary" />
            </div>
            Testimony Moderation
          </h1>
          <p className="text-muted-foreground mt-1">
            Review and approve user stories for the public community portal.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 items-center">
          <Badge
            variant="outline"
            className="h-10 px-4 rounded-xl border-primary/20 text-primary font-black uppercase tracking-widest"
          >
            {filteredPending.length} Pending Submissions
          </Badge>
          <Button asChild variant="outline" className="h-10 px-6 rounded-xl font-bold border-primary/20">
            <Link href="/dashboard/testimonials/all">View All Testimonials</Link>
          </Button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Filter by name, school, or message..."
          className="pl-10 h-12 bg-white border-none rounded-xl shadow-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="font-bold text-sm">Loading testimonies…</span>
        </div>
      )}

      {isError && !isLoading && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 bg-white/50 rounded-[2rem] border-2 border-dashed border-destructive/20">
          <AlertCircle className="w-12 h-12 text-destructive/30" />
          <p className="text-muted-foreground font-bold">Failed to load testimonies.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Retry
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6">
        {filteredPending.map((entry: any) => (
          <Card
            key={entry.id}
            className="border-none shadow-xl overflow-hidden hover:shadow-2xl transition-all duration-300"
          >
            <div className="flex flex-col md:flex-row">
              {/* Author sidebar */}
              <div className="w-full md:w-72 bg-accent/20 border-r p-6 flex flex-col items-center text-center space-y-4 shrink-0">
                <Avatar className="h-24 w-24 border-4 border-white shadow-2xl">
                  <AvatarImage src={entry.author?.avatar} />
                  <AvatarFallback className="bg-primary text-white text-2xl font-bold">
                    {entry.author?.name?.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="space-y-1">
                  <h3 className="font-black text-primary text-sm uppercase leading-tight">
                    {entry.author?.name}
                  </h3>
                  <Badge
                    variant="secondary"
                    className="bg-secondary/20 text-primary border-none text-[8px] h-4 uppercase px-2"
                  >
                    {entry.role_display || entry.author?.role}
                  </Badge>
                </div>
                <div className="pt-4 border-t border-accent/50 w-full space-y-2">
                  {entry.school_name && (
                    <div className="flex items-center justify-center gap-2 text-primary/60">
                      <Building2 className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-bold truncate">{entry.school_name}</span>
                    </div>
                  )}
                  <Badge className="w-full justify-center py-1 font-black uppercase text-[9px] bg-amber-100 text-amber-700 border-none">
                    <Clock className="w-3 h-3 mr-1" /> PENDING REVIEW
                  </Badge>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 p-6 md:p-8 flex flex-col">
                <div className="flex-1 space-y-6">
                  <div className="flex items-center gap-2 border-b border-accent pb-4">
                    <MessageSquare className="w-4 h-4 text-primary/40" />
                    <h4 className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">
                      Shared Testimony
                    </h4>
                  </div>
                  <div className="bg-white/50 border border-accent rounded-2xl p-6 italic text-lg text-primary/80 leading-relaxed font-medium">
                    "{entry.message || entry.content}"
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t flex flex-col sm:flex-row justify-between items-center gap-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-primary opacity-40" />
                    <span className="text-[10px] font-black text-muted-foreground tracking-widest italic">
                      Verified Account Record
                    </span>
                  </div>
                  <div className="flex gap-2 w-full sm:w-auto">
                    <Button
                      variant="ghost"
                      className="flex-1 sm:flex-none text-destructive hover:bg-red-50 gap-2 h-11 px-6 rounded-xl"
                      onClick={() => handleDelete(String(entry.id))}
                      disabled={rejectMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4" /> Reject
                    </Button>
                    <Button
                      className="flex-1 sm:flex-none gap-2 h-11 px-8 rounded-xl shadow-lg"
                      onClick={() => handleApprove(String(entry.id))}
                      disabled={approveMutation.isPending}
                    >
                      <CheckCircle2 className="w-4 h-4" /> Approve for Public
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        ))}

        {!isLoading && !isError && filteredPending.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 bg-white/50 rounded-[2rem] border-2 border-dashed border-primary/10">
            <Quote className="w-16 h-16 text-primary/10" />
            <p className="text-muted-foreground font-medium">
              No pending testimonies require moderation.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
