"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2,
  Plus,
  Trash2,
  Send,
  Pencil,
  BookOpen,
  AlertCircle,
  RefreshCw,
  Info,
  ArrowLeft,
  Layers,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api/errors";
import {
  createCourse,
  deleteCourse,
  getCourse,
  listCourses,
  submitCourseForReview,
  updateCourse,
  type CourseListItem,
  type CourseWritePayload,
  type LessonItem,
  type ModuleItem,
  type RolePathway,
  type VideoProvider,
} from "../../_lib/api";

const ROLE_PATHWAYS: RolePathway[] = ["PRINCIPAL", "TEACHER", "ACCOUNTANT", "LIBRARIAN", "GENERAL"];
const VIDEO_PROVIDERS: VideoProvider[] = ["youtube", "vimeo", "self_hosted"];

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  PENDING_REVIEW: "bg-amber-100 text-amber-700",
  PUBLISHED: "bg-emerald-100 text-emerald-700",
};

interface CourseFormState {
  title: string;
  slug: string;
  description: string;
  role_pathway: RolePathway;
  thumbnail_url: string;
  assigned_by: string;
  modules: ModuleItem[];
}

const emptyForm = (): CourseFormState => ({
  title: "",
  slug: "",
  description: "",
  role_pathway: "GENERAL",
  thumbnail_url: "",
  assigned_by: "",
  modules: [],
});

function ModuleBuilder({
  modules,
  onChange,
}: {
  modules: ModuleItem[];
  onChange: (modules: ModuleItem[]) => void;
}) {
  const addModule = () => onChange([...modules, { title: "", order: modules.length + 1, lessons: [] }]);
  const removeModule = (idx: number) => onChange(modules.filter((_, i) => i !== idx));
  const updateModule = (idx: number, patch: Partial<ModuleItem>) =>
    onChange(modules.map((m, i) => (i === idx ? { ...m, ...patch } : m)));

  const addLesson = (moduleIdx: number) => {
    const lessons: LessonItem[] = modules[moduleIdx].lessons ?? [];
    const nextLesson: LessonItem = {
      title: "",
      order: lessons.length + 1,
      duration_minutes: 5,
      video_provider: "youtube",
      video_url: "",
      description: "",
    };
    updateModule(moduleIdx, { lessons: [...lessons, nextLesson] });
  };
  const removeLesson = (moduleIdx: number, lessonIdx: number) => {
    const lessons = (modules[moduleIdx].lessons ?? []).filter((_, i) => i !== lessonIdx);
    updateModule(moduleIdx, { lessons });
  };
  const updateLesson = (moduleIdx: number, lessonIdx: number, patch: Partial<LessonItem>) => {
    const lessons = (modules[moduleIdx].lessons ?? []).map((l, i) => (i === lessonIdx ? { ...l, ...patch } : l));
    updateModule(moduleIdx, { lessons });
  };

  return (
    <div className="space-y-4">
      {modules.map((module, mIdx) => (
        <Card key={mIdx} className="border border-accent shadow-none rounded-2xl">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-3">
              <Layers className="w-4 h-4 text-primary shrink-0" />
              <Input
                value={module.title}
                onChange={(e) => updateModule(mIdx, { title: e.target.value })}
                placeholder={`Module ${mIdx + 1} title`}
                className="h-10 rounded-lg font-bold"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-destructive shrink-0"
                onClick={() => removeModule(mIdx)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>

            <div className="pl-6 space-y-3 border-l-2 border-accent">
              {(module.lessons ?? []).map((lesson, lIdx) => (
                <div key={lIdx} className="bg-accent/20 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Input
                      value={lesson.title}
                      onChange={(e) => updateLesson(mIdx, lIdx, { title: e.target.value })}
                      placeholder={`Lesson ${lIdx + 1} title`}
                      className="h-9 rounded-lg bg-white text-sm"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive shrink-0 h-9 w-9"
                      onClick={() => removeLesson(mIdx, lIdx)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Input
                      type="number"
                      min={1}
                      value={lesson.duration_minutes}
                      onChange={(e) => updateLesson(mIdx, lIdx, { duration_minutes: Number(e.target.value) || 0 })}
                      placeholder="Minutes"
                      className="h-9 rounded-lg bg-white text-xs"
                    />
                    <Select
                      value={lesson.video_provider}
                      onValueChange={(v: VideoProvider) => updateLesson(mIdx, lIdx, { video_provider: v })}
                    >
                      <SelectTrigger className="h-9 rounded-lg bg-white text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VIDEO_PROVIDERS.map((p) => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={lesson.video_url}
                      onChange={(e) => updateLesson(mIdx, lIdx, { video_url: e.target.value })}
                      placeholder="Video URL"
                      className="h-9 rounded-lg bg-white text-xs col-span-2"
                    />
                  </div>
                  <Textarea
                    value={lesson.description}
                    onChange={(e) => updateLesson(mIdx, lIdx, { description: e.target.value })}
                    placeholder="Lesson description"
                    className="min-h-[60px] rounded-lg bg-white text-xs"
                  />
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2 rounded-lg font-bold text-[10px] uppercase"
                onClick={() => addLesson(mIdx)}
              >
                <Plus className="w-3.5 h-3.5" /> Add Lesson
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      <Button type="button" variant="outline" className="gap-2 rounded-xl font-bold" onClick={addModule}>
        <Plus className="w-4 h-4" /> Add Module
      </Button>
    </div>
  );
}

function CourseEditorForm({
  initial,
  isEditing,
  onCancel,
  onSaved,
}: {
  initial: CourseFormState;
  isEditing: boolean;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<CourseFormState>(initial);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: CourseWritePayload = {
        title: form.title,
        description: form.description,
        role_pathway: form.role_pathway,
        thumbnail_url: form.thumbnail_url || null,
        modules: form.modules,
      };
      if (form.slug) payload.slug = form.slug;
      if (!isEditing) payload.assigned_by = form.assigned_by;
      return isEditing ? updateCourse(initial.slug, payload) : createCourse(payload);
    },
    onSuccess: () => {
      toast({
        title: isEditing ? "Course Updated" : "Course Created",
        description: isEditing ? "Your changes were saved." : "The draft course was created.",
      });
      onSaved();
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: isEditing ? "Update Failed" : "Creation Failed",
        // Surface the REAL error from the API rather than guessing — e.g. a
        // missing/invalid `assigned_by` grant produces a specific message.
        description: getApiErrorMessage(error, "The Academy API rejected this course. See details above."),
      });
    },
  });

  return (
    <Card className="border-none shadow-xl rounded-3xl overflow-hidden">
      <CardHeader className="bg-primary/5 border-b p-8 flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="text-lg font-black text-primary">
            {isEditing ? `Edit: ${initial.title || initial.slug}` : "Create New Course"}
          </CardTitle>
          <CardDescription>Requires the COURSE_CREATE Academy scope, plus a real COURSE_ASSIGN grant behind it.</CardDescription>
        </div>
        <Button variant="ghost" size="sm" className="gap-2" onClick={onCancel}>
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
      </CardHeader>
      <CardContent className="p-8 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Title</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. EduIgnite for Teachers"
              className="h-11 rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Role Pathway</Label>
            <Select value={form.role_pathway} onValueChange={(v: RolePathway) => setForm((f) => ({ ...f, role_pathway: v }))}>
              <SelectTrigger className="h-11 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_PATHWAYS.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Description</Label>
          <Textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="min-h-[100px] rounded-xl"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Thumbnail URL</Label>
            <Input
              value={form.thumbnail_url}
              onChange={(e) => setForm((f) => ({ ...f, thumbnail_url: e.target.value }))}
              placeholder="https://..."
              className="h-11 rounded-xl"
            />
          </div>
          {!isEditing && (
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Assigned By — User ID
              </Label>
              <Input
                value={form.assigned_by}
                onChange={(e) => setForm((f) => ({ ...f, assigned_by: e.target.value }))}
                placeholder="ID of the CEO/CTO who authorized this course"
                className="h-11 rounded-xl"
              />
            </div>
          )}
        </div>

        {!isEditing && (
          <div className="bg-primary/5 p-4 rounded-xl border border-primary/10 flex items-start gap-3">
            <Info className="w-5 h-5 text-primary opacity-40 shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground italic">
              A course can only be created if "Assigned By" currently holds the COURSE_ASSIGN scope — CEO and CTO
              hold it identically. Ask them for their user ID, or paste it here after they grant you COURSE_CREATE.
              If this is wrong, the API's real rejection message will be shown.
            </p>
          </div>
        )}

        <div>
          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3 block">
            Modules &amp; Lessons
          </Label>
          <ModuleBuilder modules={form.modules} onChange={(modules) => setForm((f) => ({ ...f, modules }))} />
        </div>

        <div className="flex justify-end pt-4 border-t">
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !form.title}
            className="h-12 px-8 rounded-xl font-black uppercase tracking-widest text-xs gap-2"
          >
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {isEditing ? "Save Changes" : "Create Draft Course"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function MyCoursesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"list" | "create" | "edit">("list");
  const [editSlug, setEditSlug] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<CourseFormState | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);

  const { data: courses = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["academy-admin", "courses", "mine"],
    queryFn: () => listCourses({ mine: "true" }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["academy-admin", "courses"] });

  const submitMutation = useMutation({
    mutationFn: (slug: string) => submitCourseForReview(slug),
    onSuccess: (course) => {
      invalidate();
      // React to what the API actually returned rather than guessing
      // client-side whether the caller holds COURSE_APPROVE (there's no
      // "list my scopes" endpoint — see ../../_lib/permissions.ts). A
      // COURSE_APPROVE holder (CEO/CTO tier) submitting their own course is
      // auto-published by the backend; everyone else still lands in the
      // review queue exactly as before.
      if (course.status === "PUBLISHED") {
        toast({ title: "Published!", description: "Your course is live on the Academy catalog." });
      } else {
        toast({ title: "Submitted for Review", description: "A founder (CEO or CTO) can now approve or reject it." });
      }
    },
    onError: (error) => {
      toast({ variant: "destructive", title: "Submit Failed", description: getApiErrorMessage(error) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (slug: string) => deleteCourse(slug),
    onSuccess: () => {
      invalidate();
      toast({ title: "Draft Deleted" });
    },
    onError: (error) => {
      toast({ variant: "destructive", title: "Delete Failed", description: getApiErrorMessage(error) });
    },
  });

  const startEdit = async (course: CourseListItem) => {
    setLoadingEdit(true);
    setEditSlug(course.slug);
    try {
      const detail = await getCourse(course.slug);
      setEditForm({
        title: detail.title,
        slug: detail.slug,
        description: detail.description,
        role_pathway: detail.role_pathway,
        thumbnail_url: detail.thumbnail_url ?? "",
        assigned_by: "",
        modules: detail.modules ?? [],
      });
      setMode("edit");
    } catch (error) {
      toast({ variant: "destructive", title: "Failed to Load Course", description: getApiErrorMessage(error) });
      setEditSlug(null);
    } finally {
      setLoadingEdit(false);
    }
  };

  useEffect(() => {
    if (mode === "list") {
      setEditSlug(null);
      setEditForm(null);
    }
  }, [mode]);

  if (mode === "create") {
    return (
      <div className="max-w-4xl space-y-6 pb-20">
        <CourseEditorForm
          initial={emptyForm() as CourseFormState & { slug: string }}
          isEditing={false}
          onCancel={() => setMode("list")}
          onSaved={() => {
            invalidate();
            setMode("list");
          }}
        />
      </div>
    );
  }

  if (mode === "edit" && editSlug) {
    if (loadingEdit || !editForm) {
      return (
        <div className="flex justify-center items-center h-40">
          <Loader2 className="w-8 h-8 animate-spin text-primary/30" />
        </div>
      );
    }
    return (
      <div className="max-w-4xl space-y-6 pb-20">
        <CourseEditorForm
          initial={{ ...editForm, slug: editSlug }}
          isEditing
          onCancel={() => setMode("list")}
          onSaved={() => {
            invalidate();
            setMode("list");
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-primary flex items-center gap-3">
            <div className="p-2 bg-primary rounded-xl shadow-lg text-white">
              <BookOpen className="w-5 h-5 text-secondary" />
            </div>
            My Courses
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Build modules, record lessons, and submit your drafts for governance review.
          </p>
        </div>
        <Button onClick={() => setMode("create")} className="h-12 px-6 rounded-xl font-black uppercase tracking-widest text-xs gap-2">
          <Plus className="w-4 h-4" /> New Course
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="font-bold text-sm">Loading your courses…</span>
        </div>
      )}

      {isError && !isLoading && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 bg-white/50 rounded-[2rem] border-2 border-dashed border-destructive/20">
          <AlertCircle className="w-12 h-12 text-destructive/30" />
          <p className="text-muted-foreground font-bold">Failed to load your courses.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Retry
          </Button>
        </div>
      )}

      {!isLoading && !isError && (
        <div className="grid grid-cols-1 gap-4">
          {courses.map((course) => (
            <Card key={course.id} className="border-none shadow-md rounded-2xl">
              <CardContent className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-black text-primary truncate">{course.title}</h3>
                    <Badge className={`${STATUS_STYLES[course.status] ?? ""} border-none text-[9px] uppercase font-black shrink-0`}>
                      {course.status.replace("_", " ")}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-1">{course.description}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="outline" size="sm" className="gap-2 rounded-xl font-bold" onClick={() => startEdit(course)}>
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </Button>
                  {course.status === "DRAFT" && (
                    <>
                      <Button
                        size="sm"
                        className="gap-2 rounded-xl font-bold"
                        onClick={() => submitMutation.mutate(course.slug)}
                        disabled={submitMutation.isPending}
                      >
                        <Send className="w-3.5 h-3.5" /> Submit for Review
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive gap-2 rounded-xl"
                        onClick={() => deleteMutation.mutate(course.slug)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}

          {courses.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 bg-white/50 rounded-[2rem] border-2 border-dashed border-primary/10">
              <BookOpen className="w-16 h-16 text-primary/10" />
              <p className="text-muted-foreground font-medium max-w-md">
                You have no courses yet. A course can only be created once a founder (CEO or CTO) has both granted
                you COURSE_CREATE and is set as its "Assigned By".
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
