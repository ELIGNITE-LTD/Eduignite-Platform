
"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useLiveClass, useStartClass, useEndClass, useCancelLiveClass } from "@/lib/hooks";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  Monitor,
  MessageSquare,
  Users,
  LogOut,
  Send,
  ShieldCheck,
  Settings2,
  MoreHorizontal,
  Sparkles,
  Zap,
  X,
  Fingerprint,
  CheckCircle2,
  Mail,
  Circle,
  Heart,
  LayoutGrid,
  ListChecks,
  UserCheck,
  Loader2,
  Hand,
  ThumbsUp,
  Search,
  Play,
  Square,
  ExternalLink,
  Video as VideoCamera,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { format } from "date-fns";
import { resolveMediaUrl } from "@/lib/media";

interface ChatMessage {
  id: string;
  sender: string;
  role: string;
  text: string;
  time: string;
  isSelf: boolean;
  avatar: string;
}

export default function LiveClassRoomPage() {
  const params = useParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const classId = params.classId as string;

  // ── Real API ──────────────────────────────────────────────────────────
  const { data: liveClass, isLoading: classLoading } = useLiveClass(classId);
  const startMutation = useStartClass();
  const endMutation = useEndClass();
  const cancelMutation = useCancelLiveClass();

  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [isAttendanceOpen, setIsAttendanceOpen] = useState(false);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [gallerySearch, setGallerySearch] = useState("");
  const [isSyncingAttendance, setIsSyncingAttendance] = useState(false);
  const [presenceMap, setPresenceMap] = useState<Record<string, boolean>>({});

  // Interaction State
  const [loveCount, setLoveCount] = useState(12);
  const [isLiking, setIsLiking] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const isTeacher = user?.role === "TEACHER" || user?.role === "SCHOOL_ADMIN" || user?.role === "SUB_ADMIN";
  const isOwnClass = liveClass?.teacher === user?.id || liveClass?.teacher_name === user?.name;
  const canControl = isTeacher && (isOwnClass || user?.role === "SCHOOL_ADMIN" || user?.role === "SUB_ADMIN");

  // Derived class info
  const classTitle = liveClass?.title ?? "Live Class";
  const subjectDisplay = liveClass?.subject_display ?? liveClass?.subject_name ?? "Subject";
  const teacherName = liveClass?.teacher_name ?? "Instructor";
  const classStatus = liveClass?.status ?? "upcoming";
  const isLive = classStatus === "live";
  const isUpcoming = classStatus === "upcoming";
  const isEnded = classStatus === "ended";
  const meetingUrl = liveClass?.meeting_url;
  const platform = liveClass?.platform ?? "jitsi";
  const participants = useMemo(
    () =>
      (liveClass?.participants || []).map((participant) => ({
        id: participant.student,
        name: participant.student_name || "Participant",
        avatar: resolveMediaUrl(participant.student_avatar) || "",
        liveClassParticipantId: participant.id,
      })),
    [liveClass?.participants]
  );
  const enrolledCount = liveClass?.enrolled_count ?? participants.length;
  const activeSpeakers = useMemo(() => participants.slice(0, 2), [participants]);

  useEffect(() => {
    if (!participants.length) {
      setPresenceMap({});
      return;
    }

    setPresenceMap((current) =>
      participants.reduce((acc: Record<string, boolean>, participant) => {
        acc[participant.id] = current[participant.id] ?? true;
        return acc;
      }, {})
    );
  }, [participants]);

  const handleStartClass = () => {
    startMutation.mutate(classId, {
      onSuccess: () => toast({ title: "Class Started", description: "The session is now live." }),
      onError: (err: any) => toast({ title: "Error", description: err?.response?.data?.message || "Failed to start class", variant: "destructive" }),
    });
  };

  const handleEndClass = () => {
    endMutation.mutate(classId, {
      onSuccess: () => {
        toast({ title: "Class Ended", description: "The session has been closed." });
        router.push("/dashboard/live-classes");
      },
      onError: (err: any) => toast({ title: "Error", description: err?.response?.data?.message || "Failed to end class", variant: "destructive" }),
    });
  };

  const handleJoinMeeting = () => {
    if (meetingUrl) {
      window.open(meetingUrl, "_blank", "noopener,noreferrer");
    } else {
      toast({ title: "No Meeting Link", description: "The instructor has not set a meeting URL yet.", variant: "destructive" });
    }
  };

  const handleSendMessage = () => {
    if (!chatMessage.trim()) return;
    const msg: ChatMessage = {
      id: Date.now().toString(),
      sender: user?.name?.split(' ')[0] || "You",
      role: user?.role || "USER",
      text: chatMessage,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isSelf: true,
      avatar: user?.avatar || ""
    };
    setMessages([...messages, msg]);
    setChatMessage("");
  };

  const handleLeave = () => {
    toast({ title: "Session Left", description: "You have left the virtual classroom." });
    router.push("/dashboard/live-classes");
  };

  const handleCommitAttendance = () => {
    setIsSyncingAttendance(true);
    setTimeout(() => {
      setIsSyncingAttendance(false);
      setIsAttendanceOpen(false);
      toast({ title: "Registry Synchronized", description: "Attendance data has been committed to the institutional node." });
    }, 1500);
  };

  // Loading state
  if (classLoading) {
    return (
      <div className="fixed inset-0 z-50 bg-[#1A1C2E] flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 animate-spin text-secondary mx-auto" />
          <p className="text-white/40 text-xs font-black uppercase tracking-widest">Connecting to Session...</p>
        </div>
      </div>
    );
  }

  // Not found
  if (!liveClass && !classLoading) {
    return (
      <div className="fixed inset-0 z-50 bg-[#1A1C2E] flex items-center justify-center">
        <div className="text-center space-y-6 p-8">
          <AlertTriangle className="w-16 h-16 text-yellow-500 mx-auto" />
          <div>
            <h2 className="text-white font-black text-xl uppercase tracking-tight">Session Not Found</h2>
            <p className="text-white/40 text-sm mt-2">This live class could not be found or has been removed.</p>
          </div>
          <Button onClick={() => router.push("/dashboard/live-classes")} className="rounded-xl font-black uppercase tracking-widest text-xs">
            Back to Live Classes
          </Button>
        </div>
      </div>
    );
  }

  const toggleHand = () => {
    const nextState = !isHandRaised;
    setIsHandRaised(nextState);
    if (nextState) {
      toast({
        title: "Hand Raised",
        description: "The instructor has been notified that you wish to speak.",
      });
    }
  };

  const handleLove = () => {
    setLoveCount(prev => prev + 1);
    toast({ title: "Reaction Sent", description: "You sent a ❤️ reaction." });
  };

  const handleLike = () => {
    setIsLiking(true);
    setTimeout(() => setIsLiking(false), 1000);
    toast({ title: "Reaction Sent", description: "You sent a 👍 reaction." });
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#1A1C2E] flex flex-col overflow-hidden text-slate-200">
      {/* TOP NAVIGATION BAR */}
      <header className="h-14 bg-[#1A1C2E] border-b border-white/5 flex items-center justify-between px-4 sm:px-6 shrink-0">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            {isLive ? (
              <Badge className="bg-red-600 text-white border-none rounded-sm px-2 py-0.5 text-[10px] font-black h-5 animate-pulse">LIVE</Badge>
            ) : isUpcoming ? (
              <Badge className="bg-yellow-500 text-black border-none rounded-sm px-2 py-0.5 text-[10px] font-black h-5">UPCOMING</Badge>
            ) : (
              <Badge className="bg-slate-600 text-white border-none rounded-sm px-2 py-0.5 text-[10px] font-black h-5">ENDED</Badge>
            )}
          </div>
          <div className="h-4 w-px bg-white/10 hidden md:block" />
          <div className="hidden md:flex flex-col min-w-0">
            <h2 className="text-xs font-black uppercase tracking-widest text-white truncate">{classTitle}</h2>
            <p className="text-[9px] text-slate-500 uppercase tracking-widest">{subjectDisplay} • {teacherName}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 text-slate-400">
          {/* Teacher Controls */}
          {canControl && (
            <div className="flex items-center gap-2">
              {isUpcoming && (
                <Button
                  size="sm"
                  className="h-8 rounded-lg bg-green-600 hover:bg-green-700 text-white text-[9px] font-black uppercase gap-2 border-none"
                  onClick={handleStartClass}
                  disabled={startMutation.isPending}
                >
                  {startMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3 fill-white" />}
                  <span className="hidden sm:inline">Start Class</span>
                </Button>
              )}
              {isLive && (
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-8 rounded-lg text-[9px] font-black uppercase gap-2"
                  onClick={handleEndClass}
                  disabled={endMutation.isPending}
                >
                  {endMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3 fill-white" />}
                  <span className="hidden sm:inline">End Class</span>
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-lg bg-white/5 border-white/10 hover:bg-white/10 text-white text-[9px] font-black uppercase gap-2"
                onClick={() => setIsAttendanceOpen(true)}
              >
                <ListChecks className="w-3.5 h-3.5 text-secondary" />
                <span className="hidden sm:inline">Attendance</span>
              </Button>
            </div>
          )}
          {/* Join external meeting */}
          {meetingUrl && (
            <Button
              size="sm"
              className="h-8 rounded-lg bg-secondary text-primary text-[9px] font-black uppercase gap-2 border-none hover:bg-secondary/90"
              onClick={handleJoinMeeting}
            >
              <ExternalLink className="w-3 h-3" />
              <span className="hidden sm:inline">Join {platform === "jitsi" ? "Jitsi" : platform === "zoom" ? "Zoom" : platform === "google_meet" ? "Meet" : "Teams"}</span>
            </Button>
          )}
          <div className="flex items-center gap-2 sm:gap-3">
            <Monitor className="w-4 h-4 hidden sm:block" />
            <Settings2 className="w-4 h-4" />
          </div>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex overflow-hidden p-4 gap-4">
        {/* LEFT COLUMN: MAIN STAGE & CHAT */}
        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          {/* MAIN VIDEO FEED / MEETING AREA */}
          <Card className="flex-1 bg-[#252841] border-none rounded-2xl overflow-hidden relative shadow-2xl">
            <div className="absolute top-4 left-4 z-10 flex items-center gap-3">
              <div className="bg-white/10 backdrop-blur-md p-2 rounded-lg">
                <Users className="w-4 h-4 text-white" />
              </div>
              <h2 className="text-xs sm:text-sm font-black uppercase tracking-widest text-white truncate max-w-[200px] sm:max-w-none">{classTitle}</h2>
            </div>

            {/* Meeting iframe for Jitsi, or placeholder for other platforms */}
            {isLive && meetingUrl && platform === "jitsi" ? (
              <iframe
                src={meetingUrl}
                className="w-full h-full border-none"
                allow="camera; microphone; display-capture; autoplay; clipboard-write"
                title={classTitle}
              />
            ) : isLive && meetingUrl ? (
              /* External platform — show join prompt */
              <div className="w-full h-full flex flex-col items-center justify-center gap-6 bg-gradient-to-br from-[#252841] to-[#1a1c2e]">
                <div className="p-6 bg-white/5 rounded-3xl border border-white/10 text-center space-y-4 max-w-sm mx-4">
                  <div className="p-4 bg-secondary/20 rounded-2xl w-fit mx-auto">
                    <VideoCamera className="w-10 h-10 text-secondary" />
                  </div>
                  <div>
                    <h3 className="text-white font-black text-lg uppercase tracking-tight">{classTitle}</h3>
                    <p className="text-slate-400 text-xs mt-1">{subjectDisplay} • {teacherName}</p>
                  </div>
                  <p className="text-slate-400 text-xs">
                    This class is hosted on <strong className="text-white">{platform === "zoom" ? "Zoom" : platform === "google_meet" ? "Google Meet" : "Microsoft Teams"}</strong>. Click below to join the external meeting.
                  </p>
                  <Button
                    className="w-full rounded-xl bg-secondary text-primary font-black uppercase text-xs tracking-widest gap-2"
                    onClick={handleJoinMeeting}
                  >
                    <ExternalLink className="w-4 h-4" /> Join {platform === "zoom" ? "Zoom Meeting" : platform === "google_meet" ? "Google Meet" : "Teams Meeting"}
                  </Button>
                  {liveClass?.meeting_id && (
                    <p className="text-[10px] text-slate-500">Meeting ID: <span className="font-mono text-slate-300">{liveClass.meeting_id}</span></p>
                  )}
                  {liveClass?.meeting_password && (
                    <p className="text-[10px] text-slate-500">Password: <span className="font-mono text-slate-300">{liveClass.meeting_password}</span></p>
                  )}
                </div>
              </div>
            ) : (
              /* Upcoming or ended — show status screen */
              <div className="w-full h-full flex flex-col items-center justify-center gap-6 bg-gradient-to-br from-[#252841] to-[#1a1c2e] relative">
                <div className="relative z-10 text-center space-y-4 max-w-sm mx-4">
                  {isUpcoming ? (
                    <>
                      <div className="p-4 bg-yellow-500/20 rounded-2xl w-fit mx-auto">
                        <Clock className="w-10 h-10 text-yellow-400" />
                      </div>
                      <h3 className="text-white font-black text-xl uppercase tracking-tight">{classTitle}</h3>
                      <p className="text-slate-400 text-sm">{subjectDisplay}</p>
                      {liveClass?.start_time && (
                        <p className="text-yellow-400 text-xs font-bold">
                          Scheduled: {format(new Date(liveClass.start_time), "MMM d, yyyy 'at' h:mm a")}
                        </p>
                      )}
                      {canControl && (
                        <Button
                          className="rounded-xl bg-green-600 hover:bg-green-700 text-white font-black uppercase text-xs tracking-widest gap-2 border-none"
                          onClick={handleStartClass}
                          disabled={startMutation.isPending}
                        >
                          {startMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-white" />}
                          Start Class Now
                        </Button>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="p-4 bg-slate-600/20 rounded-2xl w-fit mx-auto">
                        <CheckCircle2 className="w-10 h-10 text-slate-400" />
                      </div>
                      <h3 className="text-white font-black text-xl uppercase tracking-tight">Session Ended</h3>
                      <p className="text-slate-400 text-sm">{classTitle} has concluded.</p>
                      {liveClass?.recording_url && (
                        <Button className="rounded-xl bg-secondary text-primary font-black uppercase text-xs tracking-widest gap-2" onClick={() => window.open(liveClass.recording_url!, "_blank")}>
                          <VideoCamera className="w-4 h-4" /> Watch Recording
                        </Button>
                      )}
                    </>
                  )}
                </div>
                <div className="absolute bottom-4 left-4 flex items-center gap-3">
                  <div className="flex -space-x-2">
                    {participants.slice(0, 3).map((p, i) => (
                      <Avatar key={i} className="h-6 w-6 border-2 border-[#252841]">
                        <AvatarImage src={p.avatar} />
                      </Avatar>
                    ))}
                  </div>
                  <span className="text-[10px] font-bold text-white/60">{enrolledCount > 0 ? `${enrolledCount} enrolled` : "No participants yet"}</span>
                </div>
              </div>
            )}
          </Card>

          {/* CHAT & Q&A AREA */}
          <Card className="h-64 bg-[#252841] border-none rounded-2xl overflow-hidden flex flex-col shadow-xl">
            <div className="px-6 py-3 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white">Live Pedagogical Chat</h3>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-red-400 hover:bg-white/5" onClick={handleLove}>
                    <Heart className={cn("w-3.5 h-3.5", loveCount > 12 && "fill-current")} />
                  </Button>
                  <span className="text-[10px] font-black">{loveCount}</span>
                </div>
              </div>
              <div className="flex gap-3 text-white/40">
                <Button variant="ghost" size="icon" className="h-6 w-6 text-secondary hover:bg-white/5" onClick={handleLike}>
                  <ThumbsUp className={cn("w-3.5 h-3.5", isLiking && "fill-current")} />
                </Button>
                <MessageSquare className="w-3.5 h-3.5 mt-1.5" />
              </div>
            </div>
            <ScrollArea className="flex-1 px-6">
              <div className="space-y-4 py-4">
                {messages.map((msg) => (
                  <div key={msg.id} className="flex items-start gap-3 animate-in fade-in slide-in-from-left-2">
                    <Avatar className="h-8 w-8 border border-white/10">
                      <AvatarImage src={msg.avatar} />
                      <AvatarFallback className="text-[10px] font-bold">{msg.sender.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="space-y-1">
                      <p className="text-xs">
                        <span className="font-black text-secondary mr-2">{msg.sender}:</span>
                        <span className="text-slate-200">{msg.text}</span>
                      </p>
                      <span className="text-[8px] font-bold opacity-30 uppercase">{msg.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="p-4 bg-black/20 mt-auto">
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 h-12">
                <input 
                  placeholder="Ask a question..." 
                  className="flex-1 bg-transparent border-none outline-none text-xs text-white placeholder:text-white/20" 
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                />
                <Button variant="ghost" size="icon" className="text-secondary hover:bg-white/10" onClick={handleSendMessage}>
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {/* RIGHT COLUMN: PARTICIPANTS (SCROLLABLE) */}
        <div className="w-[320px] hidden xl:flex flex-col gap-4 shrink-0 overflow-hidden">
          {/* ACTIVE SPEAKERS */}
          <div className="space-y-4 shrink-0">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
              <Zap className="w-3 h-3 text-secondary fill-secondary" /> Active Speakers
            </h3>
            <div className="grid grid-cols-1 gap-3">
              {activeSpeakers.map((p, i) => (
                <div key={i} className="aspect-video bg-[#252841] rounded-2xl overflow-hidden relative border border-white/5 group">
                  <img src={p.avatar} alt={p.name} className="w-full h-full object-cover opacity-80" />
                  <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/60 backdrop-blur-md rounded text-[9px] font-black uppercase text-white flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    {p.name}
                  </div>
                  <div className="absolute top-2 right-2 p-1.5 bg-secondary text-primary rounded-lg">
                    <Mic className="w-3 h-3" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* PARTICIPANTS GRID (SCROLLABLE) */}
          <Card className="bg-[#252841] border-none rounded-2xl overflow-hidden flex flex-col shadow-xl flex-1">
            <div className="p-4 border-b border-white/5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-white">Registry</h3>
                <Badge variant="outline" className="text-[8px] h-4 border-white/10 text-white/40">{enrolledCount || participants.length} Active</Badge>
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-500 hover:text-white" onClick={() => setIsGalleryOpen(true)}>
                <LayoutGrid className="w-3 h-3" />
              </Button>
            </div>
            
            <ScrollArea className="flex-1">
              <div className="p-4 grid grid-cols-2 gap-3 pb-10">
                {participants.map((p) => (
                  <div key={p.id} className="relative aspect-square rounded-xl overflow-hidden border border-white/5 bg-slate-800 group cursor-pointer hover:border-secondary/40 transition-all">
                    <img src={p.avatar} alt={p.name} className="w-full h-full object-cover opacity-60 group-hover:scale-110 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                    <div className="absolute bottom-2 left-2 right-2 space-y-0.5">
                      <p className="text-[9px] font-black uppercase text-white truncate">{p.name.split(' ')[0]}</p>
                      <p className="text-[7px] font-mono font-bold text-white/40 truncate">{p.id}</p>
                    </div>
                    
                    {/* Raising Hand Visual */}
                    {p.id === "GBHS26S001" && isHandRaised && (
                      <div className="absolute top-2 right-2 bg-yellow-400 text-primary p-1 rounded-md shadow-lg animate-bounce">
                        <Hand className="w-3 h-3 fill-current" />
                      </div>
                    )}

                    {!presenceMap[p.id] && (
                      <div className="absolute inset-0 bg-red-900/40 flex items-center justify-center">
                        <Badge variant="destructive" className="text-[7px] h-4 font-black">ABSENT</Badge>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>

            {/* NODE STATUS FOOTER */}
            <div className="p-4 bg-black/20 border-t border-white/5 flex items-center justify-between shrink-0">
               <div className="flex items-center gap-2 text-[8px] font-black uppercase text-slate-500 tracking-widest">
                  <ShieldCheck className="w-3 h-3 text-green-600" />
                  Node Sync Active
               </div>
               <div className="flex items-center gap-1">
                  <div className="w-1 h-1 rounded-full bg-green-500" />
                  <span className="text-[8px] font-bold text-slate-500">92ms</span>
               </div>
            </div>
          </Card>
        </div>
      </div>

      {/* CONTROL DOCK */}
      <footer className="h-20 bg-[#1A1C2E] border-t border-white/5 flex items-center justify-between px-8 shrink-0">
        <div className="flex items-center gap-6">
          <button 
            onClick={() => setIsMuted(!isMuted)}
            className="flex flex-col items-center gap-1 group"
          >
            <div className={cn(
              "p-2.5 rounded-xl transition-all", 
              isMuted ? "bg-red-600 shadow-[0_0_15px_rgba(220,38,38,0.4)]" : "bg-white/5 group-hover:bg-white/10"
            )}>
              {isMuted ? <MicOff className="w-5 h-5 text-white" /> : <Mic className="w-5 h-5 text-white" />}
            </div>
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 group-hover:text-white transition-colors">
              {isMuted ? "Muted" : "Unmute"}
            </span>
          </button>

          <button 
            onClick={() => setIsCamOff(!isCamOff)}
            className="flex flex-col items-center gap-1 group"
          >
            <div className={cn(
              "p-2.5 rounded-xl transition-all", 
              isCamOff ? "bg-red-600 shadow-[0_0_15px_rgba(220,38,38,0.4)]" : "bg-white/5 group-hover:bg-white/10"
            )}>
              {isCamOff ? <VideoOff className="w-5 h-5 text-white" /> : <VideoIcon className="w-5 h-5 text-white" />}
            </div>
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 group-hover:text-white transition-colors">
              Camera
            </span>
          </button>
        </div>

        <div className="flex items-center gap-6">
          {!isTeacher && (
            <button 
              onClick={toggleHand}
              className="flex flex-col items-center gap-1 group"
            >
              <div className={cn(
                "p-2.5 rounded-xl transition-all", 
                isHandRaised ? "bg-yellow-400 text-primary shadow-[0_0_15px_rgba(250,204,21,0.4)]" : "bg-white/5 group-hover:bg-white/10"
              )}>
                <Hand className="w-5 h-5" />
              </div>
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 group-hover:text-white transition-colors">
                Hand
              </span>
            </button>
          )}

          <button 
            onClick={() => setIsSharing(!isSharing)}
            className="flex flex-col items-center gap-1 group"
          >
            <div className={cn(
              "p-2.5 rounded-xl transition-all", 
              isSharing ? "bg-secondary text-primary shadow-[0_0_15px_rgba(103,208,228,0.4)]" : "bg-white/5 hover:bg-white/10"
            )}>
              <Monitor className="w-5 h-5" />
            </div>
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 group-hover:text-white transition-colors">
              Share
            </span>
          </button>

          <button 
            onClick={() => setIsRecording(!isRecording)}
            className="flex flex-col items-center gap-1 group"
          >
            <div className={cn(
              "p-2.5 rounded-xl transition-all",
              isRecording ? "bg-red-600 animate-pulse" : "bg-white/5 group-hover:bg-white/10"
            )}>
              <div className="w-5 h-5 rounded-full border-2 border-current flex items-center justify-center">
                <div className={cn("w-2 h-2 rounded-full", isRecording ? "bg-white" : "bg-red-600")} />
              </div>
            </div>
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 group-hover:text-white transition-colors">
              Rec
            </span>
          </button>
        </div>

        <Button 
          variant="destructive" 
          className="h-12 px-10 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black uppercase text-[11px] tracking-widest shadow-xl transition-all active:scale-95 border-none"
          onClick={handleLeave}
        >
          Leave
        </Button>
      </footer>

      {/* ATTENDANCE DIALOG (TEACHER ONLY) */}
      <Dialog open={isAttendanceOpen} onOpenChange={setIsAttendanceOpen}>
        <DialogContent className="sm:max-w-2xl rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl bg-[#1A1C2E] text-slate-200">
          <DialogHeader className="bg-primary p-8 text-white relative shrink-0">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/10 rounded-2xl text-secondary">
                <ListChecks className="w-8 h-8" />
              </div>
              <div>
                <DialogTitle className="text-xl font-black uppercase tracking-tight">Live Attendance Registry</DialogTitle>
                <DialogDescription className="text-white/60">Mark presence for students currently in the virtual node.</DialogDescription>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setIsAttendanceOpen(false)} className="absolute top-4 right-4 text-white hover:bg-white/10">
              <X className="w-6 h-6" />
            </Button>
          </DialogHeader>
          
          <ScrollArea className="max-h-[50vh] bg-white/5 p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {participants.map((p) => (
                <div 
                  key={p.id} 
                  className={cn(
                    "flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer",
                    presenceMap[p.id] ? "bg-white/10 border-white/10" : "bg-red-900/20 border-red-900/40"
                  )}
                  onClick={() => setPresenceMap(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8 border border-white/10">
                      <AvatarImage src={p.avatar} />
                      <AvatarFallback>{p.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="overflow-hidden">
                      <p className="text-xs font-black text-white truncate uppercase">{p.name.split(' ')[0]}</p>
                      <p className="text-[8px] font-mono text-white/40 uppercase">{p.id}</p>
                    </div>
                  </div>
                  <div className={cn(
                    "w-6 h-6 rounded-lg flex items-center justify-center transition-colors",
                    presenceMap[p.id] ? "bg-green-600" : "bg-red-600"
                  )}>
                    {presenceMap[p.id] ? <UserCheck className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          <DialogFooter className="bg-black/20 p-8 border-t border-white/5">
            <Button 
              className="w-full h-14 rounded-2xl bg-primary text-white font-black uppercase tracking-widest text-xs gap-3 shadow-xl transition-all"
              onClick={handleCommitAttendance}
              disabled={isSyncingAttendance}
            >
              {isSyncingAttendance ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5 text-secondary" />}
              Commit Node Register
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* GALLERY VIEW DIALOG */}
      <Dialog open={isGalleryOpen} onOpenChange={setIsGalleryOpen}>
        <DialogContent className="sm:max-w-7xl w-[95vw] h-[90vh] rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl bg-[#1A1C2E] text-slate-200 flex flex-col">
          <DialogHeader className="bg-primary p-8 text-white relative shrink-0">
             <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                   <div className="p-3 bg-white/10 rounded-2xl text-secondary">
                      <Users className="w-8 h-8" />
                   </div>
                   <div>
                      <DialogTitle className="text-2xl font-black uppercase tracking-tight">Participant Gallery</DialogTitle>
                      <DialogDescription className="text-white/60">Node Registry • {enrolledCount || participants.length} Connected</DialogDescription>
                   </div>
                </div>
                <div className="flex items-center gap-4 mr-8">
                   <div className="relative w-64 hidden md:block">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                      <input 
                        placeholder="Search students..." 
                        className="w-full bg-white/10 border-none rounded-xl h-10 pl-10 pr-4 text-xs text-white placeholder:text-white/20 focus:ring-1 focus:ring-secondary outline-none"
                        value={gallerySearch}
                        onChange={(e) => setGallerySearch(e.target.value)}
                      />
                   </div>
                   <Button variant="ghost" size="icon" onClick={() => setIsGalleryOpen(false)} className="text-white hover:bg-white/10 rounded-full">
                     <X className="w-6 h-6" />
                   </Button>
                </div>
             </div>
          </DialogHeader>
          <ScrollArea className="flex-1 p-8">
             <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 pb-10">
                {participants.filter(p => p.name.toLowerCase().includes(gallerySearch.toLowerCase()) || p.id.toLowerCase().includes(gallerySearch.toLowerCase())).map((p) => (
                  <div key={p.id} className="relative aspect-video rounded-3xl overflow-hidden border border-white/5 bg-[#252841] group shadow-xl hover:border-secondary/40 transition-all">
                     <img src={p.avatar} alt={p.name} className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-all duration-500" />
                     <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent" />
                     <div className="absolute bottom-4 left-4 right-4">
                        <p className="text-xs font-black uppercase text-white truncate">{p.name.split(' ')[0]}</p>
                        <p className="text-[9px] font-mono font-bold text-secondary/60 truncate">{p.id}</p>
                     </div>
                     {/* Mic indicator */}
                     <div className="absolute top-3 right-3 p-1.5 bg-black/40 backdrop-blur-md rounded-lg">
                        <MicOff className="w-3 h-3 text-red-400" />
                     </div>
                  </div>
                ))}
             </div>
          </ScrollArea>
          <DialogFooter className="bg-black/20 p-4 border-t border-white/5 flex justify-center shrink-0">
             <div className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-500 tracking-[0.2em]">
                <ShieldCheck className="w-4 h-4 text-green-600" /> Verified Pedagogical Gallery
             </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
