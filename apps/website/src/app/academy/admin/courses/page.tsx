"use client";

import Link from "next/link";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Star, BookOpen, Clock, Layers, AlertCircle, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api/errors";
import { listCourses, updateCourse, type CourseListItem } from "../_lib/api";

export default function CourseSpotlightPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: courses = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["academy-admin", "courses", "published"],
    queryFn: () => listCourses(),
  });

  const toggleFeatured = useMutation({
    mutationFn: (course: CourseListItem) => updateCourse(course.slug, { is_featured: !course.is_featured }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["academy-admin", "courses", "published"] });
      toast({ title: "Course Spotlight Updated" });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: getApiErrorMessage(
          error,
          "You can only feature/unfeature a course you created, or if you hold the COURSE_APPROVE scope."
        ),
      });
    },
  });

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-primary flex items-center gap-3">
            <div className="p-2 bg-primary rounded-xl shadow-lg text-white">
              <Star className="w-5 h-5 text-secondary" />
            </div>
            Course Spotlight
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Feature or unfeature published courses on the public Academy landing page.
          </p>
        </div>
        <Button asChild variant="outline" className="rounded-xl font-bold">
          <Link href="/academy/admin/courses/mine">Go to My Courses</Link>
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="font-bold text-sm">Loading published courses…</span>
        </div>
      )}

      {isError && !isLoading && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 bg-white/50 rounded-[2rem] border-2 border-dashed border-destructive/20">
          <AlertCircle className="w-12 h-12 text-destructive/30" />
          <p className="text-muted-foreground font-bold">Failed to load courses.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Retry
          </Button>
        </div>
      )}

      {!isLoading && !isError && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {courses.map((course) => (
            <Card key={course.id} className="border-none shadow-md rounded-2xl overflow-hidden flex flex-col">
              <div className="aspect-video bg-accent/30 flex items-center justify-center overflow-hidden">
                {course.thumbnail_url ? (
                  <img src={course.thumbnail_url} alt={course.title} className="w-full h-full object-cover" />
                ) : (
                  <BookOpen className="w-10 h-10 text-primary/20" />
                )}
              </div>
              <CardContent className="p-5 flex-1 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-black text-primary text-sm leading-tight">{course.title}</h3>
                  {course.is_featured && (
                    <Badge className="bg-secondary/20 text-primary border-none text-[9px] uppercase font-black shrink-0">
                      <Star className="w-3 h-3 mr-1 fill-current" /> Featured
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 flex-1">{course.description}</p>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-bold uppercase">
                  <span className="flex items-center gap-1">
                    <Layers className="w-3 h-3" /> {course.module_count} modules
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {course.duration_minutes}m
                  </span>
                  <Badge variant="outline" className="text-[9px] border-primary/10">{course.role_pathway}</Badge>
                </div>
                <Button
                  variant={course.is_featured ? "outline" : "default"}
                  className="w-full h-10 rounded-xl font-bold text-xs gap-2 mt-2"
                  onClick={() => toggleFeatured.mutate(course)}
                  disabled={toggleFeatured.isPending}
                >
                  <Star className={course.is_featured ? "w-3.5 h-3.5" : "w-3.5 h-3.5 fill-current"} />
                  {course.is_featured ? "Remove from Spotlight" : "Feature on Landing Page"}
                </Button>
              </CardContent>
            </Card>
          ))}

          {courses.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-20 text-center space-y-4 bg-white/50 rounded-[2rem] border-2 border-dashed border-primary/10">
              <BookOpen className="w-16 h-16 text-primary/10" />
              <p className="text-muted-foreground font-medium">No published courses yet.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
