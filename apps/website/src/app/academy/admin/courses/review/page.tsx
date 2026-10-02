"use client";

import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ClipboardCheck, CheckCircle2, XCircle, AlertCircle, RefreshCw, Layers, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api/errors";
import { approveCourse, listCourses, rejectCourse, type CourseListItem } from "../../_lib/api";

export default function CourseReviewQueuePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [actingSlug, setActingSlug] = useState<string | null>(null);

  const { data: pending = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["academy-admin", "courses", "pending-review"],
    queryFn: () => listCourses({ status: "PENDING_REVIEW" }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["academy-admin", "courses"] });

  const approveMutation = useMutation({
    mutationFn: (slug: string) => approveCourse(slug),
    onMutate: (slug) => setActingSlug(slug),
    onSuccess: () => {
      invalidate();
      toast({ title: "Course Approved", description: "The course is now published on the public catalog." });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Approval Failed",
        description: getApiErrorMessage(error, "You need the COURSE_APPROVE Academy scope (CEO or CTO) to approve courses."),
      });
    },
    onSettled: () => setActingSlug(null),
  });

  const rejectMutation = useMutation({
    mutationFn: (slug: string) => rejectCourse(slug),
    onMutate: (slug) => setActingSlug(slug),
    onSuccess: () => {
      invalidate();
      toast({ variant: "destructive", title: "Course Sent Back to Draft" });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Rejection Failed",
        description: getApiErrorMessage(error, "You need the COURSE_APPROVE Academy scope (CEO or CTO) to reject courses."),
      });
    },
    onSettled: () => setActingSlug(null),
  });

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-primary flex items-center gap-3">
            <div className="p-2 bg-primary rounded-xl shadow-lg text-white">
              <ClipboardCheck className="w-5 h-5 text-secondary" />
            </div>
            Course Governance Review Queue
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Approve or reject courses submitted for review. Approving is the only way a course is published.
            CEO and CTO hold identical approval authority.
          </p>
        </div>
        <Badge variant="outline" className="h-10 px-4 rounded-xl border-primary/20 text-primary font-black uppercase tracking-widest w-fit">
          {pending.length} Pending Review
        </Badge>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="font-bold text-sm">Loading review queue…</span>
        </div>
      )}

      {isError && !isLoading && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 bg-white/50 rounded-[2rem] border-2 border-dashed border-destructive/20">
          <AlertCircle className="w-12 h-12 text-destructive/30" />
          <p className="text-muted-foreground font-bold">Failed to load the review queue.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Retry
          </Button>
        </div>
      )}

      {!isLoading && !isError && (
        <div className="grid grid-cols-1 gap-6">
          {pending.map((course: CourseListItem) => {
            const isActing = actingSlug === course.slug && (approveMutation.isPending || rejectMutation.isPending);
            return (
              <Card key={course.id} className="border-none shadow-xl overflow-hidden">
                <div className="flex flex-col md:flex-row">
                  <div className="w-full md:w-64 bg-accent/20 border-r p-6 flex flex-col justify-between shrink-0 gap-4">
                    <div>
                      <Badge className="bg-amber-100 text-amber-700 border-none text-[9px] uppercase font-black mb-3">
                        <Clock className="w-3 h-3 mr-1" /> Pending Review
                      </Badge>
                      <Badge variant="outline" className="text-[9px] border-primary/10">{course.role_pathway}</Badge>
                    </div>
                    <div className="text-[10px] text-muted-foreground font-bold uppercase space-y-1">
                      <p className="flex items-center gap-1">
                        <Layers className="w-3 h-3" /> {course.module_count} modules
                      </p>
                      <p className="flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {course.duration_minutes} minutes
                      </p>
                    </div>
                  </div>

                  <CardContent className="flex-1 p-6 md:p-8 flex flex-col">
                    <h3 className="font-black text-primary text-lg mb-2">{course.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed flex-1">{course.description}</p>

                    <div className="mt-6 pt-6 border-t flex flex-col sm:flex-row justify-end gap-3">
                      <Button
                        variant="ghost"
                        className="text-destructive hover:bg-red-50 gap-2 h-11 px-6 rounded-xl"
                        onClick={() => rejectMutation.mutate(course.slug)}
                        disabled={isActing}
                      >
                        {rejectMutation.isPending && actingSlug === course.slug ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <XCircle className="w-4 h-4" />
                        )}
                        Reject to Draft
                      </Button>
                      <Button
                        className="gap-2 h-11 px-8 rounded-xl shadow-lg"
                        onClick={() => approveMutation.mutate(course.slug)}
                        disabled={isActing}
                      >
                        {approveMutation.isPending && actingSlug === course.slug ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4" />
                        )}
                        Approve &amp; Publish
                      </Button>
                    </div>
                  </CardContent>
                </div>
              </Card>
            );
          })}

          {pending.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 bg-white/50 rounded-[2rem] border-2 border-dashed border-primary/10">
              <ClipboardCheck className="w-16 h-16 text-primary/10" />
              <p className="text-muted-foreground font-medium max-w-md">
                No courses are pending review. If you don't hold the COURSE_APPROVE scope, this list will always be
                empty. Pending courses are only shown to approvers.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
