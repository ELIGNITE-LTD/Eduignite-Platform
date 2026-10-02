"use client";

import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Quote,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Star,
  Clock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api/errors";
import { approveTestimonial, listTestimonials, rejectTestimonial, type CourseTestimonialItem } from "../_lib/api";

export default function TestimonialVerificationPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [actingId, setActingId] = useState<number | null>(null);

  const { data: pending = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["academy-admin", "testimonials", "pending"],
    queryFn: () => listTestimonials("pending"),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["academy-admin", "testimonials"] });

  const approveMutation = useMutation({
    mutationFn: (id: number) => approveTestimonial(id),
    onMutate: (id) => setActingId(id),
    onSuccess: () => {
      invalidate();
      toast({ title: "Testimonial Approved", description: "It is now visible on the course's public page." });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Approval Failed",
        description: getApiErrorMessage(error, "You need the ACM_WRITE Academy scope to moderate testimonials."),
      });
    },
    onSettled: () => setActingId(null),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: number) => rejectTestimonial(id),
    onMutate: (id) => setActingId(id),
    onSuccess: () => {
      invalidate();
      toast({ variant: "destructive", title: "Testimonial Rejected" });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Rejection Failed",
        description: getApiErrorMessage(error, "You need the ACM_WRITE Academy scope to moderate testimonials."),
      });
    },
    onSettled: () => setActingId(null),
  });

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-primary flex items-center gap-3">
            <div className="p-2 bg-primary rounded-xl shadow-lg text-white">
              <Quote className="w-5 h-5 text-secondary" />
            </div>
            Testimonial Verification Hub
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Approve or reject learner testimonials before they appear on public course pages.
          </p>
        </div>
        <Badge variant="outline" className="h-10 px-4 rounded-xl border-primary/20 text-primary font-black uppercase tracking-widest w-fit">
          {pending.length} Pending
        </Badge>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="font-bold text-sm">Loading testimonial queue…</span>
        </div>
      )}

      {isError && !isLoading && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 bg-white/50 rounded-[2rem] border-2 border-dashed border-destructive/20">
          <AlertCircle className="w-12 h-12 text-destructive/30" />
          <p className="text-muted-foreground font-bold">Failed to load the testimonial queue.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Retry
          </Button>
        </div>
      )}

      {!isLoading && !isError && (
        <div className="grid grid-cols-1 gap-6">
          {pending.map((testimonial: CourseTestimonialItem) => {
            const isActing = actingId === testimonial.id && (approveMutation.isPending || rejectMutation.isPending);
            return (
              <Card key={testimonial.id} className="border-none shadow-xl overflow-hidden">
                <div className="flex flex-col md:flex-row">
                  <div className="w-full md:w-64 bg-accent/20 border-r p-6 flex flex-col justify-between shrink-0 gap-4">
                    <div>
                      <Badge className="bg-amber-100 text-amber-700 border-none text-[9px] uppercase font-black mb-3">
                        <Clock className="w-3 h-3 mr-1" /> Pending
                      </Badge>
                      <p className="text-xs font-black text-primary">{testimonial.user.name}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">{testimonial.course}</p>
                    </div>
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`w-4 h-4 ${i < testimonial.rating ? "fill-secondary text-secondary" : "text-muted-foreground/20"}`}
                        />
                      ))}
                    </div>
                  </div>

                  <CardContent className="flex-1 p-6 md:p-8 flex flex-col">
                    <p className="text-sm text-muted-foreground leading-relaxed flex-1 italic">&ldquo;{testimonial.message}&rdquo;</p>

                    <div className="mt-6 pt-6 border-t flex flex-col sm:flex-row justify-end gap-3">
                      <Button
                        variant="ghost"
                        className="text-destructive hover:bg-red-50 gap-2 h-11 px-6 rounded-xl"
                        onClick={() => rejectMutation.mutate(testimonial.id)}
                        disabled={isActing}
                      >
                        {rejectMutation.isPending && actingId === testimonial.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <XCircle className="w-4 h-4" />
                        )}
                        Reject
                      </Button>
                      <Button
                        className="gap-2 h-11 px-8 rounded-xl shadow-lg"
                        onClick={() => approveMutation.mutate(testimonial.id)}
                        disabled={isActing}
                      >
                        {approveMutation.isPending && actingId === testimonial.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4" />
                        )}
                        Approve
                      </Button>
                    </div>
                  </CardContent>
                </div>
              </Card>
            );
          })}

          {pending.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 bg-white/50 rounded-[2rem] border-2 border-dashed border-primary/10">
              <Quote className="w-16 h-16 text-primary/10" />
              <p className="text-muted-foreground font-medium max-w-md">
                No testimonials are pending review. If you don't hold the ACM_READ scope, this list will always be
                empty. Testimonials are only shown to moderators.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
