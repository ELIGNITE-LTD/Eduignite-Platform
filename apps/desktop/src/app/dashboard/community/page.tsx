"use client";

import { useMemo, useState } from "react";
import { isCEOCTO, isRestrictedRole, useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { useBlogs, useCreateBlog, usePublishBlog, useUpdateBlog, useDeleteBlog, useCreateBlogComment, usePendingTestimonies, useApproveTestimony, useRejectTestimony } from "@/lib/hooks";
import { useStudents } from "@/lib/hooks/useStudents";
import { useUsersBySchool } from "@/lib/hooks/useUsers";
import { useMySchool, useSchoolSettings } from "@/lib/hooks/useSchools";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  MessageCircle,
  Send,
  BookOpen,
  Eye,
  Loader2,
  Plus,
  X,
  Heart,
  Search,
  Clock,
  CheckCircle2,
  Trash2,
  FileText,
  Pencil,
  Building2,
  GraduationCap,
  Network,
  ShieldCheck,
  UserSquare2,
  Users,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { fileToDataUrl, getApiErrorMessage } from "@/lib/api/errors";
import { SchoolHierarchyManager } from "@/components/dashboard/school-hierarchy-manager";
import { normalizeList } from "@/lib/dashboard-adapters";
import { MediaRenderer } from "@/components/shared/MediaRenderer";

const SECTION_LABELS: Record<string, string> = {
  general: "General",
  science: "Science",
  arts: "Arts",
  commercial: "Commercial",
  technical: "Technical",
  bilingual: "Bilingual",
  "french section": "French Section",
  "english section": "English Section",
};

const ROLE_LABELS: Record<string, string> = {
  SCHOOL_ADMIN: "School Admin",
  SUB_ADMIN: "Sub Admin",
  TEACHER: "Teacher",
  BURSAR: "Bursar",
  LIBRARIAN: "Librarian",
};

const toNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatRole = (role?: string) => ROLE_LABELS[role || ""] || role || "Staff";
const formatSection = (section?: string) => SECTION_LABELS[(section || "").toLowerCase()] || section || "Unassigned";

function ClassMasterPermissionBanner({ schoolId, enabled }: { schoolId: string; enabled: boolean }) {
  const { toast } = useToast();
  const [isOn, setIsOn] = useState(enabled);
  const [saving, setSaving] = useState(false);

  const toggle = async () => {
    setSaving(true);
    try {
      const { schoolsService } = await import("@/lib/api/services/schools.service");
      const next = !isOn;
      await schoolsService.updateSchoolSettings(schoolId, { class_masters_can_edit_students: next } as any);
      setIsOn(next);
      toast({
        title: next ? "Permission granted" : "Permission withdrawn",
        description: next
          ? "Class masters now have a Student Management tab where they can edit the students of their own class."
          : "Class masters can no longer see or edit their class students.",
      });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Could not update permission", description: error?.response?.data?.detail || "Please try again." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-none bg-primary text-white shadow-xl rounded-[2rem] overflow-hidden">
      <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-lg font-black uppercase tracking-tight">
            <ShieldCheck className="h-5 w-5 text-secondary" /> Class Master Permissions
          </p>
          <p className="mt-1 max-w-2xl text-sm text-white/70">
            Give permissions to class masters to edit their student informations. When on, every class master gets a
            Student Management tab limited strictly to the students of their own class — no payments, only information and photos.
          </p>
        </div>
        <Button
          onClick={() => void toggle()}
          disabled={saving}
          className={cn(
            "h-12 shrink-0 gap-2 rounded-xl px-6 font-black uppercase tracking-widest text-xs",
            isOn ? "bg-green-500 text-white hover:bg-green-600" : "bg-white text-primary hover:bg-white/90",
          )}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          {isOn ? "Permission ON — click to turn off" : "Give Permission to Class Masters"}
        </Button>
      </CardContent>
    </Card>
  );
}

function SchoolAdminHierarchyOverview({ schoolId, schoolName }: { schoolId: string; schoolName?: string }) {
  const { user } = useAuth();
  const { data: schoolProfile } = useMySchool();
  const { data: schoolSettings, isLoading: settingsLoading } = useSchoolSettings(schoolId);
  const { data: studentsResp, isLoading: studentsLoading } = useStudents({ page_size: 500 });
  const { data: schoolUsersResp, isLoading: staffLoading } = useUsersBySchool(schoolId, {
    role: "SCHOOL_ADMIN,SUB_ADMIN,TEACHER,BURSAR,LIBRARIAN",
    page_size: 500,
  });

  const students = normalizeList(studentsResp);
  const staff = normalizeList(schoolUsersResp).filter((member: any) =>
    ["SCHOOL_ADMIN", "SUB_ADMIN", "TEACHER", "BURSAR", "LIBRARIAN"].includes(member.role)
  );
  const enrolledStudentCount = Math.max(
    studentsResp?.count ?? 0,
    students.length,
    toNumber(schoolProfile?.student_count)
  );

  const pageData = useMemo(() => {
    const admins = staff.filter((member: any) => ["SCHOOL_ADMIN", "SUB_ADMIN"].includes(member.role));
    const teachers = staff.filter((member: any) => member.role === "TEACHER");
    const supportStaff = staff.filter((member: any) => ["BURSAR", "LIBRARIAN"].includes(member.role));

    const sectionMap = new Map<
      string,
      {
        key: string;
        name: string;
        students: number;
        classes: Set<string>;
        honourRoll: number;
      }
    >();

    const classMap = new Map<
      string,
      {
        name: string;
        level: string;
        section: string;
        students: number;
        averageTotal: number;
        averageCount: number;
      }
    >();

    students.forEach((student: any) => {
      const sectionKey = String(student.section || "unassigned");
      const sectionEntry = sectionMap.get(sectionKey) ?? {
        key: sectionKey,
        name: formatSection(sectionKey),
        students: 0,
        classes: new Set<string>(),
        honourRoll: 0,
      };

      sectionEntry.students += 1;
      sectionEntry.classes.add(student.student_class || "Unknown");
      sectionEntry.honourRoll += student.is_on_honour_roll ? 1 : 0;
      sectionMap.set(sectionKey, sectionEntry);

      const classKey = student.student_class || "Unknown";
      const classEntry = classMap.get(classKey) ?? {
        name: classKey,
        level: student.class_level || "Unknown",
        section: formatSection(student.section),
        students: 0,
        averageTotal: 0,
        averageCount: 0,
      };

      classEntry.students += 1;
      if (student.annual_average != null) {
        classEntry.averageTotal += toNumber(student.annual_average);
        classEntry.averageCount += 1;
      }
      classMap.set(classKey, classEntry);
    });

    const sections = Array.from(sectionMap.values())
      .map((section) => ({
        ...section,
        classCount: section.classes.size,
      }))
      .sort((left, right) => right.students - left.students);

    const classes = Array.from(classMap.values())
      .map((classroom) => ({
        ...classroom,
        average:
          classroom.averageCount > 0
            ? Number((classroom.averageTotal / classroom.averageCount).toFixed(2))
            : 0,
      }))
      .sort((left, right) => right.students - left.students);

    return {
      admins,
      teachers,
      supportStaff,
      students,
      sections,
      classes,
      uniqueClasses: classes.length,
    };
  }, [staff, students]);

  const isLoading = studentsLoading || staffLoading || settingsLoading;
  const resolvedSchoolName = schoolProfile?.name || schoolName || "Your school";
  const leadershipCount = pageData.admins.length + (schoolProfile?.principal || user?.school?.principal ? 1 : 0);

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-headline flex items-center gap-3 text-3xl font-bold uppercase tracking-tighter text-primary">
            <div className="rounded-xl bg-primary p-2 shadow-lg">
              <Network className="h-6 w-6 text-secondary" />
            </div>
            Hierarchy & Sections
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live overview of school leadership, staffing structure, sections, and class streams.
          </p>
        </div>
        <Badge className="w-fit border-none bg-secondary px-3 py-2 text-[10px] font-black uppercase tracking-widest text-primary">
          {schoolSettings?.academic_year || "Academic year pending"}
        </Badge>
      </div>

      {!settingsLoading ? (
        <ClassMasterPermissionBanner
          key={String((schoolSettings as any)?.class_masters_can_edit_students ?? false)}
          schoolId={schoolId}
          enabled={Boolean((schoolSettings as any)?.class_masters_can_edit_students)}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          {
            label: "Leadership Roles",
            value: leadershipCount,
            icon: ShieldCheck,
            color: "text-primary",
            bg: "bg-primary/5",
          },
          {
            label: "Teaching Staff",
            value: pageData.teachers.length,
            icon: Users,
            color: "text-blue-600",
            bg: "bg-blue-50",
          },
          {
            label: "Support Staff",
            value: pageData.supportStaff.length,
            icon: UserSquare2,
            color: "text-amber-600",
            bg: "bg-amber-50",
          },
          {
            label: "Class Streams",
            value: pageData.uniqueClasses,
            icon: BookOpen,
            color: "text-emerald-600",
            bg: "bg-emerald-50",
          },
          {
            label: "Enrolled Students",
            value: enrolledStudentCount,
            icon: GraduationCap,
            color: "text-purple-600",
            bg: "bg-purple-50",
          },
        ].map((stat) => (
          <Card key={stat.label} className="border-none shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                {stat.label}
              </CardTitle>
              <div className={cn("rounded-lg p-2", stat.bg)}>
                <stat.icon className={cn("h-4 w-4", stat.color)} />
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-8 w-16 animate-pulse rounded bg-gray-200" />
              ) : (
                <div className="text-2xl font-black text-primary">{stat.value}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <SchoolHierarchyManager schoolId={schoolId} schoolName={resolvedSchoolName} />
    </div>
  );
}

export default function CommunityPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { language } = useI18n();
  const { toast } = useToast();

  const { data: blogsResponse, isLoading: blogsLoading } = useBlogs();
  const blogs = blogsResponse?.results ?? [];

  const { data: pendingResponse } = usePendingTestimonies();
  const pendingTestimonies = pendingResponse?.results ?? [];

  const createBlogMutation = useCreateBlog();
  const publishBlogMutation = usePublishBlog();
  const updateBlogMutation = useUpdateBlog();
  const deleteBlogMutation = useDeleteBlog();
  const createCommentMutation = useCreateBlogComment();
  const approveTestimonyMutation = useApproveTestimony();
  const rejectTestimonyMutation = useRejectTestimony();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBlog, setSelectedBlog] = useState<any>(null);
  const [isCreatingBlog, setIsCreatingBlog] = useState(false);
  const [editingBlog, setEditingBlog] = useState<any>(null);
  const [isReadingImage, setIsReadingImage] = useState(false);
  const [commentText, setCommentText] = useState("");

  const [newBlogData, setNewBlogData] = useState({
    title: "",
    paragraphs: [""],
    image: "",
    video_url: ""
  });

  const isExecutive = ["CEO", "CTO", "COO", "INV", "DESIGNER", "SUPER_ADMIN"].includes(user?.role || "");
  const canManageAnyPost = isCEOCTO(user?.role) && !isRestrictedRole(user?.role);
  const canManagePost = (blog: any) => {
    const authorId = blog?.author?.id ?? blog?.author_id;
    return Boolean(user?.id && String(authorId) === String(user.id)) || canManageAnyPost;
  };
  const isSchoolAdmin = user?.role === "SCHOOL_ADMIN" || user?.role === "SUB_ADMIN";
  const publishedBlogs = blogs.filter(blog => blog.is_published);
  const unpublishedBlogs = blogs.filter(blog => !blog.is_published);
  const filteredBlogs = publishedBlogs.filter(blog =>
    blog.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    blog.author?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const resetBlogForm = () => {
    setNewBlogData({ title: "", paragraphs: [""], image: "", video_url: "" });
    setEditingBlog(null);
  };

  const openEditBlog = (blog: any) => {
    setEditingBlog(blog);
    setNewBlogData({
      title: blog.title || "",
      paragraphs: Array.isArray(blog.paragraphs) && blog.paragraphs.length ? blog.paragraphs : [""],
      image: blog.image || "",
      video_url: blog.video_url || "",
    });
    setIsCreatingBlog(true);
  };

  const handleImageFileChange = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ variant: "destructive", title: "Invalid Image", description: "Please select a valid image file." });
      return;
    }
    setIsReadingImage(true);
    try {
      const imageDataUrl = await fileToDataUrl(file);
      setNewBlogData((prev) => ({ ...prev, image: imageDataUrl }));
    } catch (error) {
      toast({ variant: "destructive", title: "Image Upload Failed", description: getApiErrorMessage(error, "Could not read that image file.") });
    } finally {
      setIsReadingImage(false);
    }
  };

  const handleCreateBlog = () => {
    if (!newBlogData.title.trim() || newBlogData.paragraphs.some(p => !p.trim())) {
      toast({ variant: "destructive", title: "Missing Information", description: "Title and all paragraphs are required." });
      return;
    }

    const payload = {
      title: newBlogData.title,
      paragraphs: newBlogData.paragraphs.filter(p => p.trim()),
      image: newBlogData.image || undefined,
      video_url: newBlogData.video_url || undefined
    };
    const options = {
        onSuccess: () => {
          toast({
            title: editingBlog ? "Strategic Log Updated" : "Strategic Log Created",
            description: editingBlog ? "Your log changes are now saved." : "Your post has been saved and published when permitted.",
          });
          resetBlogForm();
          setIsCreatingBlog(false);
        },
        onError: (error: any) => {
          toast({
            title: "Error",
            description: getApiErrorMessage(error, editingBlog ? "Failed to update strategic log." : "Failed to create strategic log."),
            variant: "destructive"
          });
        }
      };

    if (editingBlog) {
      updateBlogMutation.mutate({ id: editingBlog.id, data: payload }, options);
    } else {
      createBlogMutation.mutate(payload, options);
    }
  };

  const handlePublishBlog = (blogId: string) => {
    publishBlogMutation.mutate(blogId, {
      onSuccess: () => {
        toast({ title: "Blog Published", description: "Your post is now visible to the community." });
      },
      onError: (error: any) => {
        toast({
          title: "Error",
          description: getApiErrorMessage(error, "Failed to publish blog"),
          variant: "destructive"
        });
      }
    });
  };

  const handleAddComment = () => {
    if (!commentText.trim() || !selectedBlog) return;

    createCommentMutation.mutate(
      { blogId: selectedBlog.id, content: commentText },
      {
        onSuccess: () => {
          toast({ title: "Comment Added", description: "Your feedback has been posted." });
          setCommentText("");
        },
        onError: (error: any) => {
          toast({
            title: "Error",
            description: getApiErrorMessage(error, "Failed to add comment"),
            variant: "destructive"
          });
        }
      }
    );
  };

  const handleApproveTestimony = (testimonyId: string) => {
    approveTestimonyMutation.mutate(testimonyId, {
      onSuccess: () => {
        toast({ title: "Approved", description: "Testimony published to community." });
      },
      onError: (error: any) => {
        toast({
          title: "Error",
            description: getApiErrorMessage(error, "Failed to approve testimony"),
          variant: "destructive"
        });
      }
    });
  };

  const handleRejectTestimony = (testimonyId: string) => {
    rejectTestimonyMutation.mutate(testimonyId, {
      onSuccess: () => {
        toast({ title: "Rejected", description: "Testimony has been declined." });
      },
      onError: (error: any) => {
        toast({
          title: "Error",
            description: getApiErrorMessage(error, "Failed to reject testimony"),
          variant: "destructive"
        });
      }
    });
  };

  const handleAddParagraph = () => {
    setNewBlogData(prev => ({ ...prev, paragraphs: [...prev.paragraphs, ""] }));
  };

  const handleRemoveParagraph = (index: number) => {
    if (newBlogData.paragraphs.length === 1) return;
    setNewBlogData(prev => ({
      ...prev,
      paragraphs: prev.paragraphs.filter((_, i) => i !== index)
    }));
  };

  const handleParagraphChange = (index: number, value: string) => {
    setNewBlogData(prev => {
      const updated = [...prev.paragraphs];
      updated[index] = value;
      return { ...prev, paragraphs: updated };
    });
  };

  const handleDeleteBlog = (blog: any) => {
    if (!window.confirm(`Delete "${blog.title}" permanently? This action cannot be undone.`)) return;
    deleteBlogMutation.mutate(blog.id, {
      onSuccess: () => toast({ title: "Strategic Log Deleted", description: "The log has been removed from the community archive." }),
      onError: (error: any) => toast({ variant: "destructive", title: "Delete Failed", description: getApiErrorMessage(error, "Could not delete this strategic log.") }),
    });
  };

  // "Hierarchy & Sections" is served on this route for school admins. While the
  // account is still hydrating, show a loader rather than briefly falling
  // through to the community content — that flash was sticking and showing the
  // wrong tab content until the user logged out and back in.
  if (isSchoolAdmin) {
    if (authLoading || !user?.school?.id) {
      return (
        <div className="flex justify-center items-center h-40">
          <Loader2 className="w-8 h-8 animate-spin text-primary/30" />
        </div>
      );
    }
    return <SchoolAdminHierarchyOverview schoolId={user.school.id} schoolName={user.school.name} />;
  }

  if (blogsLoading) {
    return (
      <div className="flex justify-center items-center h-40">
        <Loader2 className="w-8 h-8 animate-spin text-primary/30" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary font-headline flex items-center gap-3">
            <div className="p-2 bg-primary rounded-xl shadow-lg">
              <MessageCircle className="w-6 h-6 text-secondary" />
            </div>
            {language === 'en' ? "Community Portal" : "Portail Communautaire"}
          </h1>
          <p className="text-muted-foreground mt-1">Share insights, stories, and updates with the EduIgnite community.</p>
        </div>
        {isExecutive && (
          <Dialog open={isCreatingBlog} onOpenChange={(open) => { setIsCreatingBlog(open); if (!open) resetBlogForm(); }}>
            <DialogTrigger asChild>
              <Button className="gap-2 rounded-xl h-11 px-6 shadow-lg bg-secondary text-primary hover:bg-secondary/90 font-bold">
                <Plus className="w-4 h-4" /> New Blog Post
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
              <DialogHeader className="bg-primary p-8 text-white">
                <DialogTitle className="text-2xl font-black">{editingBlog ? "Edit Strategic Log" : "Create Blog Post"}</DialogTitle>
                <DialogDescription className="text-white/60">Share your thoughts and updates with the community.</DialogDescription>
              </DialogHeader>
              <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Title</Label>
                  <Input
                    value={newBlogData.title}
                    onChange={(e) => setNewBlogData({ ...newBlogData, title: e.target.value })}
                    placeholder="Blog title..."
                    className="h-12 bg-accent/30 border-none rounded-xl"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Feature Image (Optional)</Label>
                  <div className="grid gap-3">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageFileChange(e.target.files?.[0])}
                      disabled={isReadingImage}
                      className="h-12 bg-accent/30 border-none rounded-xl file:mr-4 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:text-xs file:font-bold file:text-white"
                    />
                    <Input
                      value={newBlogData.image}
                      onChange={(e) => setNewBlogData({ ...newBlogData, image: e.target.value })}
                      placeholder="Or paste https://... / data:image..."
                      className="h-12 bg-accent/30 border-none rounded-xl"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Video URL (Optional)</Label>
                  <Input
                    value={newBlogData.video_url}
                    onChange={(e) => setNewBlogData({ ...newBlogData, video_url: e.target.value })}
                    placeholder="YouTube, Vimeo, or direct MP4 URL"
                    className="h-12 bg-accent/30 border-none rounded-xl"
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Content</Label>
                    <Button variant="ghost" size="sm" className="h-7 gap-1 text-[10px] font-black uppercase" onClick={handleAddParagraph}>
                      <Plus className="w-3 h-3" /> Add Paragraph
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {newBlogData.paragraphs.map((para, idx) => (
                      <div key={idx} className="group relative">
                        <Textarea
                          value={para}
                          onChange={(e) => handleParagraphChange(idx, e.target.value)}
                          placeholder={`Paragraph ${idx + 1}...`}
                          className="min-h-[100px] bg-accent/30 border-none rounded-xl p-4 resize-none focus-visible:ring-primary"
                        />
                        {newBlogData.paragraphs.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute top-2 right-2 h-8 w-8 rounded-full bg-white shadow-sm opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                            onClick={() => handleRemoveParagraph(idx)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter className="bg-accent/20 p-6 border-t border-accent">
                <Button
                  onClick={handleCreateBlog}
                  disabled={createBlogMutation.isPending || updateBlogMutation.isPending || isReadingImage}
                  className="w-full h-12 rounded-xl bg-primary text-white font-bold gap-2"
                >
                  {createBlogMutation.isPending || updateBlogMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {editingBlog ? "Save Strategic Log" : "Create Blog Post"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Tabs defaultValue="feed" className="w-full">
        <TabsList className={cn(
          "grid w-full mb-8 bg-white shadow-sm border h-auto p-1.5 rounded-3xl",
          isExecutive ? "grid-cols-3 md:w-[600px]" : "grid-cols-1 md:w-[200px]"
        )}>
          <TabsTrigger value="feed" className="gap-2 py-3 rounded-2xl transition-all font-bold">
            <BookOpen className="w-4 h-4" /> Community Feed
          </TabsTrigger>
          {isExecutive && (
            <>
              <TabsTrigger value="drafts" className="gap-2 py-3 rounded-2xl transition-all font-bold">
                <FileText className="w-4 h-4" /> My Drafts
              </TabsTrigger>
              <TabsTrigger value="testimonies" className="gap-2 py-3 rounded-2xl transition-all font-bold">
                <Heart className="w-4 h-4" /> Testimonies
              </TabsTrigger>
            </>
          )}
        </TabsList>

        <TabsContent value="feed" className="space-y-6 animate-in fade-in">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="Search blogs by title or author..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-12 h-12 bg-white border-none rounded-xl shadow-sm"
            />
          </div>

          <div className="space-y-6">
            {filteredBlogs.length === 0 ? (
              <Card className="border-none shadow-sm bg-accent/20 p-8">
                <div className="text-center space-y-2">
                  <BookOpen className="w-8 h-8 text-muted-foreground/40 mx-auto" />
                  <p className="text-muted-foreground font-bold">No published blogs yet</p>
                  <p className="text-sm text-muted-foreground/60">Check back soon for community stories.</p>
                </div>
              </Card>
            ) : (
              filteredBlogs.map((blog) => (
                <Card key={blog.id} className="border-none shadow-sm hover:shadow-md transition-all overflow-hidden bg-white">
                  {(blog.image || blog.video_url) && (
                    <div className="aspect-video bg-slate-200 overflow-hidden">
                      <MediaRenderer imageUrl={blog.image} videoUrl={blog.video_url} alt={blog.title} />
                    </div>
                  )}
                  <CardHeader>
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <CardTitle className="text-2xl font-black text-primary">{blog.title}</CardTitle>
                        <div className="flex items-center gap-2 mt-2">
                          <Avatar className="h-8 w-8 border border-primary/10">
                            <AvatarImage src={blog.author?.avatar} />
                            <AvatarFallback>{blog.author?.name?.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <div className="text-xs">
                            <p className="font-bold text-primary">{blog.author?.name}</p>
                            <p className="text-muted-foreground flex items-center gap-1">
                               <Clock className="w-3 h-3" /> {new Date(blog.created_at ?? Date.now()).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[10px] font-bold border-primary/10 text-primary flex items-center gap-1">
                        <Eye className="w-3 h-3" /> {blog.view_count}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {blog.paragraphs.slice(0, 2).map((para, idx) => (
                      <p key={idx} className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
                        {para}
                      </p>
                    ))}
                  </CardContent>
                  <CardFooter className="bg-accent/10 p-4 border-t flex flex-wrap gap-2">
                    <Dialog open={selectedBlog?.id === blog.id} onOpenChange={(open) => {
                      if (open) setSelectedBlog(blog);
                      else setSelectedBlog(null);
                    }}>
                      <DialogTrigger asChild>
                        <Button variant="ghost" className="flex-1 text-primary font-bold h-10 gap-2">
                          <MessageCircle className="w-4 h-4" /> Read & Comment
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-2xl rounded-3xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader className="mb-4">
                          <DialogTitle className="text-2xl font-black text-primary">{selectedBlog?.title}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          {(selectedBlog?.image || selectedBlog?.video_url) && (
                            <MediaRenderer imageUrl={selectedBlog.image} videoUrl={selectedBlog.video_url} alt={selectedBlog.title} />
                          )}
                          <div className="flex items-center gap-2 pb-4 border-b">
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={selectedBlog?.author?.avatar} />
                              <AvatarFallback>{selectedBlog?.author?.name?.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div className="text-xs">
                              <p className="font-bold text-primary">{selectedBlog?.author?.name}</p>
                              <p className="text-muted-foreground">{new Date(selectedBlog?.created_at ?? Date.now()).toLocaleDateString()}</p>
                            </div>
                          </div>
                          {selectedBlog?.paragraphs.map((para, idx) => (
                            <p key={idx} className="text-sm text-muted-foreground leading-relaxed">
                              {para}
                            </p>
                          ))}
                          <div className="border-t pt-4 mt-6">
                            <h4 className="font-bold text-primary mb-4 flex items-center gap-2">
                              <MessageCircle className="w-4 h-4" /> Comments
                            </h4>
                            <div className="space-y-3">
                              <div className="flex gap-3">
                                <Avatar className="h-8 w-8">
                                  <AvatarImage src={user?.avatar} />
                                  <AvatarFallback>{user?.name?.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <div className="flex-1 space-y-2">
                                  <Textarea
                                    value={commentText}
                                    onChange={(e) => setCommentText(e.target.value)}
                                    placeholder="Share your thoughts..."
                                    className="min-h-[80px] bg-accent/30 border-none rounded-xl p-3 resize-none text-sm"
                                  />
                                  <Button
                                    size="sm"
                                    onClick={handleAddComment}
                                    disabled={createCommentMutation.isPending || !commentText.trim()}
                                    className="bg-primary text-white font-bold gap-2"
                                  >
                                    {createCommentMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                                    Post Comment
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                    <Button variant="ghost" size="icon" className="h-10 w-10 text-primary/40 hover:text-primary">
                      <Heart className="w-4 h-4" />
                    </Button>
                    {canManagePost(blog) && (
                      <>
                        <Button variant="outline" size="sm" className="h-10 rounded-xl font-bold text-primary" onClick={() => openEditBlog(blog)}>
                          <Pencil className="w-4 h-4 mr-2" /> Edit
                        </Button>
                        <Button variant="outline" size="sm" className="h-10 rounded-xl font-bold text-destructive" onClick={() => handleDeleteBlog(blog)} disabled={deleteBlogMutation.isPending}>
                          <Trash2 className="w-4 h-4 mr-2" /> Delete
                        </Button>
                      </>
                    )}
                  </CardFooter>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {isExecutive && (
          <TabsContent value="drafts" className="space-y-6 animate-in fade-in">
            <div className="space-y-4">
              {unpublishedBlogs.length === 0 ? (
                <Card className="border-none shadow-sm bg-accent/20 p-8">
                  <div className="text-center space-y-2">
                    <FileText className="w-8 h-8 text-muted-foreground/40 mx-auto" />
                    <p className="text-muted-foreground font-bold">No unpublished drafts</p>
                    <p className="text-sm text-muted-foreground/60">Create a new post to get started.</p>
                  </div>
                </Card>
              ) : (
                unpublishedBlogs.map((blog) => (
                  <Card key={blog.id} className="border-none shadow-sm bg-white">
                    <CardHeader>
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <CardTitle className="text-lg font-black text-primary">{blog.title}</CardTitle>
                          <Badge variant="outline" className="mt-2 text-[10px] font-bold border-amber-500/20 bg-amber-50 text-amber-700">
                            DRAFT
                          </Badge>
                        </div>
                        {canManagePost(blog) && <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            onClick={() => openEditBlog(blog)}
                            className="font-bold gap-2"
                          >
                            <Pencil className="w-4 h-4" />
                            Edit
                          </Button>
                          <Button
                            onClick={() => handlePublishBlog(blog.id)}
                            disabled={publishBlogMutation.isPending}
                            className="bg-primary text-white font-bold gap-2"
                          >
                            {publishBlogMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                            Publish
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => handleDeleteBlog(blog)}
                            disabled={deleteBlogMutation.isPending}
                            className="font-bold gap-2 text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete
                          </Button>
                        </div>}
                      </div>
                    </CardHeader>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        )}

        {isExecutive && (
          <TabsContent value="testimonies" className="space-y-6 animate-in fade-in">
            <div className="space-y-4">
              {pendingTestimonies.length === 0 ? (
                <Card className="border-none shadow-sm bg-accent/20 p-8">
                  <div className="text-center space-y-2">
                    <Heart className="w-8 h-8 text-muted-foreground/40 mx-auto" />
                    <p className="text-muted-foreground font-bold">No pending testimonies</p>
                    <p className="text-sm text-muted-foreground/60">Community feedback will appear here.</p>
                  </div>
                </Card>
              ) : (
                pendingTestimonies.map((testimony) => (
                  <Card key={testimony.id} className="border-none shadow-sm bg-white">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={testimony.author?.avatar} />
                              <AvatarFallback>{testimony.author?.name?.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <p className="font-bold text-primary text-sm">{testimony.author?.name}</p>
                          </div>
                          <p className="text-sm text-muted-foreground">{testimony.content}</p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardFooter className="bg-accent/10 p-4 border-t flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1 border-green-500/20 text-green-700 hover:bg-green-50 font-bold"
                        onClick={() => handleApproveTestimony(testimony.id)}
                        disabled={approveTestimonyMutation.isPending}
                      >
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        {approveTestimonyMutation.isPending ? "Approving..." : "Approve"}
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1 border-red-500/20 text-red-700 hover:bg-red-50 font-bold"
                        onClick={() => handleRejectTestimony(testimony.id)}
                        disabled={rejectTestimonyMutation.isPending}
                      >
                        <X className="w-4 h-4 mr-2" />
                        {rejectTestimonyMutation.isPending ? "Rejecting..." : "Reject"}
                      </Button>
                    </CardFooter>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
