
"use client";

import { useState, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  Video,
  Calendar,
  Clock,
  Users,
  Plus,
  ArrowRight,
  XCircle,
  CheckCircle2,
  Play,
  Info,
  Loader2,
  BookOpen,
  User,
  ShieldCheck,
  Search,
  ArrowLeft,
  Pencil,
  Radio,
  Timer,
  AlertCircle,
  FileText,
  Activity,
  MessageCircle,
  Wifi,
  WifiOff,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSubjects } from "@/lib/hooks/useGrades";
import { useQuery } from "@tanstack/react-query";
import { gradesService } from "@/lib/api/services/grades.service";
import { useSchoolSettings } from "@/lib/hooks/useSchools";
import {
  useLiveClasses,
  useMyLiveClasses,
  useEnrolledClasses,
  useLiveNow,
  useLiveClassStats,
  useCreateLiveClass,
  useCancelLiveClass,
  useStartClass,
  useEndClass,
  useEnrollInClass,
  useUnenrollFromClass,
} from "@/lib/hooks/useLiveClasses";
import type { LiveClass, CreateLiveClassRequest } from "@/lib/api/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(mins: number) {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function formatDatetime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function statusColor(status: string) {
  if (status === 'live') return 'bg-red-500';
  if (status === 'upcoming') return 'bg-blue-500';
  if (status === 'ended') return 'bg-gray-400';
  return 'bg-orange-400'; // cancelled
}

function statusLabel(status: string) {
  if (status === 'live') return 'LIVE NOW';
  if (status === 'upcoming') return 'UPCOMING';
  if (status === 'ended') return 'ENDED';
  return 'CANCELLED';
}

function parseSubjectPlacement(level?: string) {
  const raw = (level || "").trim();
  if (!raw) return [];
  if (!raw.includes("||")) {
    return raw.split(",").map((item) => item.trim()).filter(Boolean);
  }
  const [, classes] = raw.split("||");
  return (classes || "").split(",").map((item) => item.trim()).filter(Boolean);
}

// ─── Session Card ─────────────────────────────────────────────────────────────
function ClassCard({
  lc,
  isTeacher,
  isAdmin,
  onDetails,
  onStart,
  onEnd,
  onCancel,
  onEnroll,
  onUnenroll,
}: {
  lc: LiveClass;
  isTeacher: boolean;
  isAdmin: boolean;
  onDetails: (lc: LiveClass) => void;
  onStart: (id: string) => void;
  onEnd: (id: string) => void;
  onCancel: (id: string) => void;
  onEnroll: (id: string) => void;
  onUnenroll: (id: string) => void;
}) {
  const isLive = lc.status === 'live';
  const isUpcoming = lc.status === 'upcoming';
  const isEnded = lc.status === 'ended';
  const isCancelled = lc.status === 'cancelled';

  return (
    <Card className={cn(
      "rounded-2xl border-none shadow-md transition-all duration-200 hover:shadow-xl overflow-hidden",
      isLive && "ring-2 ring-red-400 shadow-red-100"
    )}>
      {/* Live indicator strip */}
      {isLive && (
        <div className="h-1 w-full bg-gradient-to-r from-red-500 to-orange-400 animate-pulse" />
      )}
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <Avatar className="h-10 w-10 shrink-0 border-2 border-white shadow">
            <AvatarImage src={lc.teacher_avatar} />
            <AvatarFallback className="bg-primary/10 text-primary font-black text-xs">
              {lc.teacher_name?.charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <h3 className="font-black text-primary text-sm sm:text-base leading-tight truncate max-w-[220px] sm:max-w-none">
                {lc.title}
              </h3>
              <Badge className={cn(
                "text-[9px] font-black border-none shrink-0 gap-1 text-white",
                statusColor(lc.status)
              )}>
                {isLive && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse inline-block" />}
                {statusLabel(lc.status)}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 font-medium">{lc.teacher_name} • {lc.subject_display}</p>
          </div>
        </div>

        {/* Meta row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="w-3 h-3 shrink-0" />
            <span className="truncate">{formatDatetime(lc.start_time)}</span>
          </div>
          <div className="flex items-center gap-1">
            <Timer className="w-3 h-3 shrink-0" />
            {formatDuration(lc.duration_minutes)}
          </div>
          <div className="flex items-center gap-1">
            <Users className="w-3 h-3 shrink-0" />
            {lc.enrolled_count}/{lc.max_participants} joined
          </div>
        </div>

        {lc.description && (
          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{lc.description}</p>
        )}

        {/* Platform badge */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-[9px] font-bold capitalize">{lc.platform}</Badge>
          <span className="text-[10px] text-muted-foreground">• {lc.target_class}</span>
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-4 flex-wrap">
          <Button size="sm" variant="ghost" className="rounded-xl h-8 text-xs font-bold flex-1 sm:flex-none"
            onClick={() => onDetails(lc)}>
            <Info className="w-3 h-3 mr-1" /> Details
          </Button>

          {isLive && lc.meeting_url && (
            <Button size="sm"
              className="rounded-xl h-8 text-xs font-black bg-red-500 hover:bg-red-600 text-white gap-1 flex-1"
              onClick={() => window.open(lc.meeting_url!, '_blank')}>
              <Play className="w-3 h-3" />
              {isTeacher || isAdmin ? "Join / Manage" : "Enter Classroom"}
            </Button>
          )}

          {isUpcoming && !isTeacher && !isAdmin && (
            <Button size="sm" variant="outline"
              className="rounded-xl h-8 text-xs font-bold flex-1"
              onClick={() => onEnroll(lc.id)}>
              <CheckCircle2 className="w-3 h-3 mr-1" /> Enroll
            </Button>
          )}

          {isUpcoming && (isTeacher || isAdmin) && (
            <Button size="sm"
              className="rounded-xl h-8 text-xs font-black bg-blue-500 hover:bg-blue-600 text-white gap-1 flex-1"
              onClick={() => onStart(lc.id)}>
              <Radio className="w-3 h-3" /> Start Now
            </Button>
          )}

          {isLive && (isTeacher || isAdmin) && (
            <Button size="sm" variant="outline"
              className="rounded-xl h-8 text-xs font-bold border-red-200 text-red-600 hover:bg-red-50 flex-1"
              onClick={() => onEnd(lc.id)}>
              <XCircle className="w-3 h-3 mr-1" /> End Session
            </Button>
          )}

          {(isUpcoming || isLive) && (isTeacher || isAdmin) && (
            <Button size="sm" variant="ghost"
              className="rounded-xl h-8 text-xs font-bold text-muted-foreground hover:text-red-600"
              onClick={() => onCancel(lc.id)}>
              Cancel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Stats Strip ─────────────────────────────────────────────────────────────
function StatsStrip({ stats }: { stats?: { total: number; live_now: number; upcoming: number; ended_today: number; cancelled: number } }) {
  if (!stats) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[
        { label: "Live Now", value: stats.live_now, icon: <Radio className="w-4 h-4 text-red-500" />, color: "text-red-600" },
        { label: "Upcoming", value: stats.upcoming, icon: <Calendar className="w-4 h-4 text-blue-500" />, color: "text-blue-600" },
        { label: "Ended Today", value: stats.ended_today, icon: <CheckCircle2 className="w-4 h-4 text-green-500" />, color: "text-green-600" },
        { label: "Total", value: stats.total, icon: <Video className="w-4 h-4 text-primary" />, color: "text-primary" },
      ].map(s => (
        <Card key={s.label} className="rounded-2xl border-none shadow-md bg-white">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-accent/50 rounded-xl">{s.icon}</div>
            <div>
              <p className={cn("text-xl font-black", s.color)}>{s.value}</p>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">{s.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Schedule Form ────────────────────────────────────────────────────────────
function ScheduleDialog({
  open, onClose, subjects, classes, onSubmit, isPending
}: {
  open: boolean;
  onClose: () => void;
  subjects: Array<{ name: string; classes: string[] }>;
  classes: string[];
  onSubmit: (data: CreateLiveClassRequest) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState<CreateLiveClassRequest>({
    title: "",
    subject_name: "",
    target_class: "",
    meeting_url: "",
    platform: "jitsi",
    start_time: "",
    duration_minutes: 60,
    max_participants: 50,
    description: "",
  });

  const targetClassOptions = useMemo(() => {
    const selectedSubject = subjects.find((subject) => subject.name === form.subject_name);
    return selectedSubject?.classes?.length ? selectedSubject.classes : classes;
  }, [classes, form.subject_name, subjects]);

  const handleSubmit = () => {
    if (!form.title || !form.start_time || !form.target_class) return;
    onSubmit(form);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg rounded-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-black text-primary text-xl">Schedule Live Class</DialogTitle>
          <DialogDescription>Create a new virtual classroom session for your students.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Session Title *</Label>
            <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              placeholder="e.g. Quantum Mechanics — Chapter 3"
              className="h-11 rounded-xl bg-accent/30 border-none font-bold" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Subject</Label>
              <Select value={form.subject_name} onValueChange={v => setForm(p => ({ ...p, subject_name: v }))}>
                <SelectTrigger className="h-11 rounded-xl bg-accent/30 border-none font-bold">
                  <SelectValue placeholder="Select subject" />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((subject) => <SelectItem key={subject.name} value={subject.name}>{subject.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Target Class *</Label>
              <Select value={form.target_class} onValueChange={v => setForm(p => ({ ...p, target_class: v }))}>
                <SelectTrigger className="h-11 rounded-xl bg-accent/30 border-none font-bold">
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent>
                  {targetClassOptions.map((className) => <SelectItem key={className} value={className}>{className}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Platform</Label>
              <Select value={form.platform} onValueChange={v => setForm(p => ({ ...p, platform: v as any }))}>
                <SelectTrigger className="h-11 rounded-xl bg-accent/30 border-none font-bold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="jitsi">Jitsi Meet</SelectItem>
                  <SelectItem value="zoom">Zoom</SelectItem>
                  <SelectItem value="google_meet">Google Meet</SelectItem>
                  <SelectItem value="teams">MS Teams</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Duration (min)</Label>
              <Select value={String(form.duration_minutes)} onValueChange={v => setForm(p => ({ ...p, duration_minutes: parseInt(v) }))}>
                <SelectTrigger className="h-11 rounded-xl bg-accent/30 border-none font-bold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[30,45,60,90,120].map(d => <SelectItem key={d} value={String(d)}>{d} min</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Start Date & Time *</Label>
            <Input type="datetime-local" value={form.start_time}
              onChange={e => setForm(p => ({ ...p, start_time: e.target.value }))}
              className="h-11 rounded-xl bg-accent/30 border-none font-bold" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Meeting Link</Label>
            <Input value={form.meeting_url || ""} placeholder="https://meet.jit.si/your-room or Zoom link"
              onChange={e => setForm(p => ({ ...p, meeting_url: e.target.value }))}
              className="h-11 rounded-xl bg-accent/30 border-none font-bold" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Description</Label>
            <Textarea value={form.description || ""} placeholder="What will students learn in this session?"
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              className="rounded-xl bg-accent/30 border-none font-medium resize-none" rows={3} />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="ghost" className="rounded-xl" onClick={onClose}>Cancel</Button>
          <Button disabled={isPending || !form.title || !form.start_time || !form.target_class}
            className="rounded-xl font-black bg-primary text-white flex-1 sm:flex-none"
            onClick={handleSubmit}>
            {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Video className="w-4 h-4 mr-2" />}
            Schedule Session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function OnlineClassesPage() {
  const { user } = useAuth();
  const { language } = useI18n();
  const { toast } = useToast();
  const router = useRouter();

  const isTeacher = user?.role === "TEACHER";
  const isAdmin = user?.role === "SCHOOL_ADMIN" || user?.role === "SUB_ADMIN";
  const isStudent = user?.role === "STUDENT";
  const canManage = isTeacher || isAdmin;
  const { data: schoolSettings } = useSchoolSettings(user?.school?.id || "");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showSchedule, setShowSchedule] = useState(false);
  const [detailClass, setDetailClass] = useState<LiveClass | null>(null);

  // ── API queries ──
  const { data: allData, isLoading: allLoading, refetch } = useLiveClasses({
    search: search || undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
  });
  const { data: myData } = useMyLiveClasses();
  const { data: enrolledData } = useEnrolledClasses();
  const { data: liveNowData } = useLiveNow();
  const { data: statsData } = useLiveClassStats();
  const { data: subjectsData } = useSubjects();

  // ── Mutations ──
  const createMutation = useCreateLiveClass();
  const cancelMutation = useCancelLiveClass();
  const startMutation = useStartClass();
  const endMutation = useEndClass();
  const enrollMutation = useEnrollInClass();
  const unenrollMutation = useUnenrollFromClass();

  // A teacher's real classes/subjects come from their assignments (grade sheet),
  // not the admin-scoped global subject list — otherwise the dropdowns are blank.
  const teacherSheetQuery = useQuery({
    queryKey: ["live-class-teacher-sheet", user?.id],
    queryFn: () => gradesService.getTeacherGradeSheet(),
    enabled: !!isTeacher,
    staleTime: 60_000,
  });
  const teacherSheetClasses = useMemo(
    () => (Array.isArray(teacherSheetQuery.data?.classes) ? teacherSheetQuery.data.classes : []),
    [teacherSheetQuery.data],
  );
  const teacherSheetSubjectOptions = useMemo(() => {
    const map = new Map<string, Set<string>>();
    teacherSheetClasses.forEach((schoolClass: any) =>
      (schoolClass.subjects ?? []).forEach((subject: any) => {
        const name = subject.subject_name || subject.name;
        if (!name) return;
        if (!map.has(name)) map.set(name, new Set<string>());
        if (schoolClass.name) map.get(name)!.add(schoolClass.name);
      }),
    );
    return Array.from(map.entries()).map(([name, classes]) => ({ name, classes: Array.from(classes) }));
  }, [teacherSheetClasses]);

  const subjectOptions = useMemo(() => {
    if (isTeacher && teacherSheetSubjectOptions.length) return teacherSheetSubjectOptions;
    const list = subjectsData?.results || [];
    const scoped = isTeacher
      ? list.filter((subject: any) => subject.teacher === user?.id || subject.teacher === user?.uid)
      : list;
    return scoped.map((subject: any) => ({
      name: subject.name,
      classes: parseSubjectPlacement(subject.level),
    }));
  }, [isTeacher, teacherSheetSubjectOptions, subjectsData?.results, user?.id, user?.uid]);

  const availableClasses = useMemo(() => {
    if (isTeacher && teacherSheetClasses.length) {
      return Array.from(new Set(teacherSheetClasses.map((c: any) => c.name).filter(Boolean)));
    }
    const subjectClasses = subjectOptions.flatMap((subject) => subject.classes);
    const schoolClasses = schoolSettings?.class_levels || [];
    return Array.from(new Set([...subjectClasses, ...schoolClasses].filter(Boolean)));
  }, [isTeacher, teacherSheetClasses, schoolSettings?.class_levels, subjectOptions]);

  const allClasses = allData?.results || [];
  const liveNow = liveNowData?.results || [];
  const myClasses = myData?.results || [];
  const enrolledClasses = enrolledData?.results || [];

  const filteredAll = useMemo(() => allClasses.filter(lc => {
    if (statusFilter !== 'all' && lc.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return lc.title.toLowerCase().includes(q) ||
        lc.teacher_name.toLowerCase().includes(q) ||
        lc.subject_display.toLowerCase().includes(q) ||
        lc.target_class.toLowerCase().includes(q);
    }
    return true;
  }), [allClasses, statusFilter, search]);

  const handleCreate = async (data: CreateLiveClassRequest) => {
    // Convert datetime-local format to ISO
    const payload = { ...data, start_time: new Date(data.start_time).toISOString() };
    createMutation.mutate(payload, {
      onSuccess: () => {
        toast({ title: "Session Scheduled", description: "Your live class is now visible to students." });
        setShowSchedule(false);
      },
      onError: () => toast({ variant: "destructive", title: "Failed to schedule", description: "Please check the form and try again." }),
    });
  };

  const handleStart = (id: string) => {
    startMutation.mutate(id, {
      onSuccess: () => toast({ title: "Session Started!", description: "Students can now see it as LIVE." }),
    });
  };

  const handleEnd = (id: string) => {
    endMutation.mutate(id, {
      onSuccess: () => toast({ title: "Session Ended", description: "The session has been marked as completed." }),
    });
  };

  const handleCancel = (id: string) => {
    cancelMutation.mutate(id, {
      onSuccess: () => toast({ title: "Session Cancelled" }),
    });
  };

  const handleEnroll = (id: string) => {
    enrollMutation.mutate(id, {
      onSuccess: () => toast({ title: "Enrolled!", description: "You'll receive a notification when the session starts." }),
    });
  };

  const handleUnenroll = (id: string) => {
    unenrollMutation.mutate(id, {
      onSuccess: () => toast({ title: "Unenrolled" }),
    });
  };

  const cardProps = {
    isTeacher: canManage,
    isAdmin,
    onDetails: setDetailClass,
    onStart: handleStart,
    onEnd: handleEnd,
    onCancel: handleCancel,
    onEnroll: handleEnroll,
    onUnenroll: handleUnenroll,
  };

  return (
    <div className="space-y-6 pb-24">
      {/* ── Page Header ───────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}
            className="rounded-full shadow-sm hover:bg-white shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-primary flex items-center gap-2">
              <div className="p-2 bg-primary rounded-xl shadow">
                <Video className="w-5 h-5 text-secondary" />
              </div>
              {language === 'en' ? 'Live Classrooms' : 'Classes Virtuelles'}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {liveNow.length > 0
                ? `${liveNow.length} session${liveNow.length > 1 ? 's' : ''} live right now`
                : 'Virtual sessions for real-time learning'}
            </p>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="rounded-xl gap-1 h-9" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          {canManage && (
            <Button className="rounded-xl font-black text-xs gap-1.5 h-9 px-4 bg-primary text-white"
              onClick={() => setShowSchedule(true)}>
              <Plus className="w-4 h-4" /> Schedule Session
            </Button>
          )}
        </div>
      </div>

      {/* ── Live Now Alert ─────────────────────────── */}
      {liveNow.length > 0 && (
        <Card className="rounded-2xl border-none bg-red-500 text-white shadow-xl overflow-hidden">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-white animate-pulse shrink-0" />
                <div>
                  <p className="font-black text-sm sm:text-base">{liveNow[0].title}</p>
                  <p className="text-xs text-red-100">{liveNow[0].teacher_name} • {liveNow[0].target_class} • {liveNow[0].enrolled_count} joined</p>
                </div>
              </div>
              {liveNow[0].meeting_url ? (
                <Button size="sm" className="rounded-xl bg-white text-red-600 hover:bg-red-50 font-black text-xs gap-1"
                  onClick={() => window.open(liveNow[0].meeting_url!, '_blank')}>
                  <Play className="w-3 h-3" /> Join Now <ExternalLink className="w-3 h-3" />
                </Button>
              ) : (
                <Button size="sm" className="rounded-xl bg-white text-red-600 font-black text-xs"
                  onClick={() => setDetailClass(liveNow[0])}>
                  <Info className="w-3 h-3 mr-1" /> View Details
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Stats ──────────────────────────────────── */}
      {(isAdmin || isTeacher) && <StatsStrip stats={statsData} />}

      {/* ── Search + Filter ─────────────────────────── */}
      <div className="flex gap-2 flex-col sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by title, teacher, subject..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-10 rounded-xl bg-white border-none shadow-sm font-medium" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-10 rounded-xl bg-white border-none shadow-sm font-bold w-full sm:w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="live">Live Now</SelectItem>
            <SelectItem value="upcoming">Upcoming</SelectItem>
            <SelectItem value="ended">Ended</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── Tabs ───────────────────────────────────── */}
      <Tabs defaultValue="all">
        <TabsList className="bg-white shadow-sm rounded-xl p-1 h-auto flex-wrap gap-1 w-full sm:w-auto">
          <TabsTrigger value="all" className="rounded-lg data-[state=active]:shadow-sm text-xs font-black">
            All ({allData?.count ?? 0})
          </TabsTrigger>
          {canManage && (
            <TabsTrigger value="mine" className="rounded-lg data-[state=active]:shadow-sm text-xs font-black">
              My Classes ({myData?.count ?? 0})
            </TabsTrigger>
          )}
          {isStudent && (
            <TabsTrigger value="enrolled" className="rounded-lg data-[state=active]:shadow-sm text-xs font-black">
              Enrolled ({enrolledData?.count ?? 0})
            </TabsTrigger>
          )}
        </TabsList>

        {/* ALL CLASSES TAB */}
        <TabsContent value="all" className="mt-4">
          {allLoading ? (
            <div className="flex justify-center items-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-primary/30" />
            </div>
          ) : filteredAll.length === 0 ? (
            <Card className="rounded-2xl border-none shadow-md bg-white">
              <CardContent className="py-12 flex flex-col items-center text-center">
                <Video className="w-12 h-12 text-muted-foreground/30 mb-3" />
                <p className="font-black text-muted-foreground">No sessions found</p>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  {canManage ? "Schedule your first virtual class using the button above." : "No live classes scheduled yet."}
                </p>
                {canManage && (
                  <Button className="mt-4 rounded-xl font-black text-xs gap-1.5 bg-primary text-white"
                    onClick={() => setShowSchedule(true)}>
                    <Plus className="w-4 h-4" /> Schedule Now
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredAll.map(lc => (
                <ClassCard key={lc.id} lc={lc} {...cardProps} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* MY CLASSES TAB (teacher/admin) */}
        {canManage && (
          <TabsContent value="mine" className="mt-4">
            {myClasses.length === 0 ? (
              <Card className="rounded-2xl border-none shadow-md bg-white">
                <CardContent className="py-12 flex flex-col items-center text-center">
                  <BookOpen className="w-12 h-12 text-muted-foreground/30 mb-3" />
                  <p className="font-black text-muted-foreground">No classes yet</p>
                  <Button className="mt-4 rounded-xl font-black text-xs gap-1.5 bg-primary text-white"
                    onClick={() => setShowSchedule(true)}>
                    <Plus className="w-4 h-4" /> Schedule First Class
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {myClasses.map(lc => (
                  <ClassCard key={lc.id} lc={lc} {...cardProps} />
                ))}
              </div>
            )}
          </TabsContent>
        )}

        {/* ENROLLED TAB (student) */}
        {isStudent && (
          <TabsContent value="enrolled" className="mt-4">
            {enrolledClasses.length === 0 ? (
              <Card className="rounded-2xl border-none shadow-md bg-white">
                <CardContent className="py-12 flex flex-col items-center text-center">
                  <Users className="w-12 h-12 text-muted-foreground/30 mb-3" />
                  <p className="font-black text-muted-foreground">Not enrolled in any class</p>
                  <p className="text-sm text-muted-foreground/70 mt-1">Browse All tab to find upcoming sessions.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {enrolledClasses.map(lc => (
                  <ClassCard key={lc.id} lc={lc} {...cardProps} />
                ))}
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* ── Schedule Dialog ───────────────────────── */}
      <ScheduleDialog
        open={showSchedule}
        onClose={() => setShowSchedule(false)}
        subjects={subjectOptions}
        classes={availableClasses}
        onSubmit={handleCreate}
        isPending={createMutation.isPending}
      />

      {/* ── Details Dialog ───────────────────────── */}
      {detailClass && (
        <Dialog open={!!detailClass} onOpenChange={() => setDetailClass(null)}>
          <DialogContent className="max-w-md rounded-3xl">
            <DialogHeader>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={cn(
                  "text-[9px] font-black text-white border-none",
                  statusColor(detailClass.status)
                )}>
                  {statusLabel(detailClass.status)}
                </Badge>
                <span className="text-xs text-muted-foreground capitalize">{detailClass.platform}</span>
              </div>
              <DialogTitle className="font-black text-primary text-lg mt-1">{detailClass.title}</DialogTitle>
              <DialogDescription className="text-sm">{detailClass.description}</DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              {[
                { icon: <User className="w-4 h-4" />, label: "Teacher", value: detailClass.teacher_name },
                { icon: <BookOpen className="w-4 h-4" />, label: "Subject", value: detailClass.subject_display },
                { icon: <Users className="w-4 h-4" />, label: "Class", value: detailClass.target_class },
                { icon: <Calendar className="w-4 h-4" />, label: "Starts", value: formatDatetime(detailClass.start_time) },
                { icon: <Timer className="w-4 h-4" />, label: "Duration", value: formatDuration(detailClass.duration_minutes) },
                { icon: <Users className="w-4 h-4" />, label: "Enrolled", value: `${detailClass.enrolled_count}/${detailClass.max_participants}` },
              ].map(({ icon, label, value }) => (
                <div key={label} className="flex items-center gap-3 text-sm">
                  <div className="text-muted-foreground shrink-0">{icon}</div>
                  <span className="text-muted-foreground w-20 shrink-0">{label}</span>
                  <span className="font-bold text-primary">{value}</span>
                </div>
              ))}

              {detailClass.meeting_url && (
                <Button className="w-full mt-2 rounded-xl font-black gap-2 bg-primary text-white"
                  onClick={() => window.open(detailClass.meeting_url!, '_blank')}>
                  <ExternalLink className="w-4 h-4" />
                  Open Meeting Room
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
