"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { 
  ArrowRight, 
  Quote, 
  Sparkles,
  Users,
  Send,
  Loader2,
  School,
  Star,
  Video,
  ImageIcon,
  ShieldCheck,
  Calendar,
  User,
  PenTool,
  MessageSquare,
  X,
  FileText,
  Clock,
  ChevronRight,
  Heart
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api/errors";
import { resolvePlatformLogoUrl } from "@/lib/platform-brand";
import { CommunityHeader } from "@/components/layout/community-header";

const ALL_VOICES: any[] = [];

const Row1: any[] = [];
const Row2: any[] = [];

export default function CommunityTestimonyPage() {
  const [mounted, setMounted] = useState(false);
  const { testimonials, addOrder, publicEvents, communityBlogs, platformSettings } = useAuth();
  const { toast } = useToast();
  
  const [isSubmitting, setIsProcessing] = useState(false);
  const [formData, setFormData] = useState({
    fullName: "",
    occupation: "",
    schoolName: "",
    whatsappNumber: "",
    email: "",
    region: "",
    division: "",
    subDivision: ""
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);

    try {
      await addOrder(formData);
      setIsProcessing(false);
      toast({
        title: "Order Received",
        description: "Your request has been submitted to the Super Admin.",
      });
      setFormData({
        fullName: "",
        occupation: "",
        schoolName: "",
        whatsappNumber: "",
        email: "",
        region: "",
        division: "",
        subDivision: ""
      });
    } catch (error) {
      setIsProcessing(false);
      toast({
        title: "Submission Failed",
        description: getApiErrorMessage(error, "We could not submit your activation request right now."),
        variant: "destructive",
      });
    }
  };

  if (!mounted) return null;

  const approvedTestimonials = testimonials.filter(t => t.status === 'approved');
  const platformLogo = resolvePlatformLogoUrl(platformSettings.logo);
  const latestBlogs = communityBlogs.slice(0, 4);
  const latestEvents = publicEvents.slice(0, 4);

  return (
    <div className="min-h-screen bg-[#F0F2F5] selection:bg-secondary selection:text-primary">
      <CommunityHeader />

      <main className="max-w-7xl mx-auto px-4 py-16 space-y-32">
        {/* HERO SECTION */}
        <section className="text-center space-y-8 max-w-4xl mx-auto animate-in fade-in slide-in-from-top-10 duration-1000">
          <div className="inline-flex items-center gap-2 bg-secondary/10 px-4 py-1.5 rounded-full border border-secondary/20">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">National Institutional Network</span>
          </div>
          <h1 className="text-5xl md:text-8xl font-black text-primary font-headline tracking-tighter leading-none">
            Fueling the Future of <span className="text-secondary underline decoration-primary/10 decoration-8 underline-offset-12">Education</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground font-medium leading-relaxed max-w-2xl mx-auto">
            High-fidelity pedagogical management. Witness how our digital nodes are empowering schools, teachers, and students across the nation.
          </p>
          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" className="w-full sm:w-auto rounded-2xl h-16 px-10 bg-primary shadow-2xl font-black uppercase tracking-widest text-xs gap-3 group" asChild>
              <a href="#order">Join the Network <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" /></a>
            </Button>
            <Button variant="outline" size="lg" className="w-full sm:w-auto rounded-2xl h-16 px-10 border-primary/10 bg-white font-bold text-primary" asChild>
              <a href="#logs">Read Strategic Logs</a>
            </Button>
          </div>
        </section>

        {/* 2. EXECUTIVE STRATEGIC LOGS (COMPACT BLOG SECTION) */}
        {communityBlogs.length > 0 && (
          <section id="logs" className="space-y-16 animate-in fade-in slide-in-from-bottom-10 duration-1000">
            <div className="text-center space-y-4">
              <div className="inline-flex items-center gap-2 bg-primary/5 px-4 py-1 rounded-full border border-primary/10">
                <PenTool className="w-4 h-4 text-secondary" />
                <span className="text-[10px] font-black uppercase tracking-widest text-primary">Founder's Insights</span>
              </div>
              <h2 className="text-4xl md:text-6xl font-black text-primary uppercase tracking-tighter">
                Strategic Platform Logs
              </h2>
              <p className="text-muted-foreground font-medium max-w-2xl mx-auto">
                Direct updates and vision statements from the {platformSettings.name} leadership board.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {latestBlogs.map((blog) => (
                <Card key={blog.id} className="border-none shadow-xl rounded-[2.5rem] overflow-hidden bg-white group transition-all duration-500 hover:shadow-2xl hover:-translate-y-1 flex flex-col">
                  <div className="aspect-[16/10] w-full overflow-hidden relative">
                    {blog.image ? (
                      <img src={blog.image} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" alt="Strategic update" />
                    ) : (
                      <div className="w-full h-full bg-primary/5 flex items-center justify-center">
                        <FileText className="w-12 h-12 text-primary/10" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-primary/60 via-transparent to-transparent opacity-60" />
                    <div className="absolute top-4 left-4">
                      <Badge className="bg-secondary text-primary border-none font-black uppercase text-[8px] h-6 px-3 shadow-lg">OFFICIAL</Badge>
                    </div>
                  </div>
                  <CardHeader className="p-6 space-y-4">
                    <h3 className="font-black text-primary text-xl uppercase leading-tight line-clamp-2 min-h-[3rem] tracking-tight">
                      {blog.title || "Platform Update"}
                    </h3>
                    <div className="flex items-center gap-3 pt-2 border-t border-accent/50">
                      <Avatar className="h-10 w-10 border-2 border-white shadow-md">
                        <AvatarImage src={blog.senderAvatar} />
                        <AvatarFallback className="bg-primary text-white font-bold">{(blog.senderName || "E").charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="overflow-hidden">
                        <p className="font-black text-primary text-xs uppercase truncate">{blog.senderName}</p>
                        <p className="text-[9px] text-muted-foreground font-bold uppercase opacity-60">{blog.senderRole}</p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardFooter className="p-6 pt-0 mt-auto">
                    <Button 
                      asChild
                      className="w-full h-11 rounded-xl bg-primary/5 text-primary hover:bg-primary hover:text-white font-black uppercase text-[10px] tracking-widest gap-2 shadow-sm transition-all"
                    >
                      <Link href={`/community/logs/${blog.id}`}>
                        Open Strategic Log <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
            <div className="flex justify-center">
              <Button asChild variant="outline" className="h-14 rounded-2xl border-primary/10 bg-white px-8 font-black uppercase tracking-widest text-xs text-primary">
                <Link href="/community/logs">
                  See All Strategic Logs <ArrowRight className="ml-2 w-4 h-4" />
                </Link>
              </Button>
            </div>
          </section>
        )}

        {/* 3. EVENT SECTION */}
        <section id="events" className="space-y-16">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 bg-secondary/10 px-4 py-1 rounded-full">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-[10px] font-black uppercase tracking-widest text-primary">Momentum</span>
              </div>
              <h2 className="text-4xl font-black text-primary uppercase tracking-tighter leading-none">
                Institutional Highlights
              </h2>
              <p className="text-muted-foreground font-medium text-lg">Capturing the moments that define our academic evolution.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            {latestEvents.map((event, idx) => (
              <Card key={event.id} className={cn(
                "border-none shadow-2xl rounded-[3rem] overflow-hidden group hover:shadow-primary/5 transition-all duration-500 bg-white",
                "animate-in fade-in slide-in-from-bottom-10"
              )} style={{ animationDelay: `${idx * 150}ms` }}>
                <div className="aspect-video relative bg-slate-900 overflow-hidden">
                  {event.type === "video" ? (
                    <div className="w-full h-full">
                      <iframe 
                        src={event.url} 
                        className="w-full h-full border-none"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                        allowFullScreen
                      ></iframe>
                    </div>
                  ) : (
                    <img src={event.url} alt={event.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000" />
                  )}
                  <div className="absolute top-6 left-6">
                    <Badge className="bg-black/60 backdrop-blur-xl text-white border-none uppercase text-[9px] font-black px-4 h-7">
                      {event.type === 'video' ? <><Video className="w-3.5 h-3.5 mr-2" /> VIDEO</> : <><ImageIcon className="w-3.5 h-3.5 mr-2" /> PHOTO</>}
                    </Badge>
                  </div>
                </div>
                <CardHeader className="p-10">
                  <CardTitle className="text-3xl font-black text-primary leading-tight group-hover:text-secondary transition-colors">
                    {event.title}
                  </CardTitle>
                  <CardDescription className="text-lg font-medium text-muted-foreground leading-relaxed mt-4">
                    {event.description}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
          <div className="flex justify-center">
            <Button asChild variant="outline" className="h-14 rounded-2xl border-primary/10 bg-white px-8 font-black uppercase tracking-widest text-xs text-primary">
              <Link href="/community/highlights">
                See All Institutional Highlights <ArrowRight className="ml-2 w-4 h-4" />
              </Link>
            </Button>
          </div>
        </section>

        {/* 4. TESTIMONY MARQUEE SECTION */}
        <section id="testimonies" className="space-y-20 overflow-hidden py-10 bg-primary/[0.02] -mx-4 px-4 rounded-[4rem]">
          <div className="text-center space-y-6 px-4">
            <div className="inline-flex items-center gap-2 bg-primary/5 px-4 py-1 rounded-full">
              <MessageSquare className="w-4 h-4 text-secondary" />
              <span className="text-[10px] font-black uppercase tracking-widest text-primary">Voices of Impact</span>
            </div>
            <h2 className="text-4xl md:text-6xl font-black text-primary uppercase tracking-tighter">Community Proof</h2>
            <p className="text-muted-foreground font-medium text-lg max-w-2xl mx-auto">
              Real stories from the individuals powering our digital educational ecosystem.
            </p>
          </div>

          <div className="flex flex-col gap-12">
            <div className="group flex overflow-hidden p-4 [--gap:3rem] [--duration:50s]">
              <div className="flex shrink-0 animate-marquee items-stretch gap-[var(--gap)] group-hover:[animation-play-state:paused]">
                {[...Row1, ...approvedTestimonials.slice(0, 6), ...Row1, ...approvedTestimonials.slice(0, 6)].map((test, idx) => (
                  <TestimonyCard key={`${test.id}-${idx}`} test={test} />
                ))}
              </div>
            </div>

            <div className="group flex overflow-hidden p-4 [--gap:3rem] [--duration:60s]">
              <div className="flex shrink-0 animate-marquee-reverse items-stretch gap-[var(--gap)] group-hover:[animation-play-state:paused]">
                {[...Row2, ...approvedTestimonials.slice(0, 6), ...Row2, ...approvedTestimonials.slice(0, 6)].map((test, idx) => (
                  <TestimonyCard key={`${test.id}-${idx}`} test={test} />
                ))}
              </div>
            </div>
            <div className="flex justify-center">
              <Button asChild variant="outline" className="h-14 rounded-2xl border-primary/10 bg-white px-8 font-black uppercase tracking-widest text-xs text-primary">
                <Link href="/community/testimonials">
                  See All School Stories <ArrowRight className="ml-2 w-4 h-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        {/* 5. PLACE ORDER FORM SECTION */}
        <section id="order" className="max-w-5xl mx-auto space-y-16">
          <div className="text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-1000">
            <div className="flex flex-col items-center gap-6 mb-4">
              <div className="bg-primary p-5 rounded-[2.5rem] shadow-2xl border-4 border-white transition-transform hover:scale-110">
                <img src={platformLogo} alt={`${platformSettings.name} logo`} className="h-14 w-14 object-contain" />
              </div>
              <h2 className="text-5xl md:text-6xl font-black text-primary uppercase tracking-tighter leading-none">{platformSettings.name}</h2>
            </div>
            <h2 className="text-3xl font-black text-primary uppercase tracking-widest">Activate Your Node</h2>
            <p className="text-xl text-muted-foreground font-medium max-w-2xl mx-auto italic leading-relaxed">
              "Fueling the digital transformation of education across Africa. Register your institution to activate your secure infrastructure node today."
            </p>
          </div>

          <Card className="border-none shadow-2xl rounded-[4rem] overflow-hidden bg-white/80 backdrop-blur-2xl border border-white animate-in zoom-in-95 duration-1000">
            <form onSubmit={handleOrderSubmit}>
              <CardContent className="p-10 md:p-20 space-y-12">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
                  {/* Individual Info */}
                  <div className="space-y-8">
                    <div className="flex items-center gap-4 border-b-2 border-accent pb-4">
                      <Users className="w-6 h-6 text-primary" />
                      <h3 className="text-lg font-black uppercase text-primary tracking-widest">Authorized Lead</h3>
                    </div>
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Full Identity Name</Label>
                        <Input required value={formData.fullName} onChange={(e) => setFormData({...formData, fullName: e.target.value})} className="h-14 bg-accent/30 border-none rounded-2xl px-6 font-bold" placeholder="e.g. Dr. Jean Dupont" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Professional Role</Label>
                        <Input required value={formData.occupation} onChange={(e) => setFormData({...formData, occupation: e.target.value})} className="h-14 bg-accent/30 border-none rounded-2xl px-6 font-bold" placeholder="e.g. School Principal" />
                      </div>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Official Email</Label>
                          <Input required type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="h-14 bg-accent/30 border-none rounded-2xl px-6" placeholder="admin@node.edu" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">WhatsApp Line</Label>
                          <Input required value={formData.whatsappNumber} onChange={(e) => setFormData({...formData, whatsappNumber: e.target.value})} className="h-14 bg-accent/30 border-none rounded-2xl px-6 font-bold" placeholder="+237 ..." />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Institution Info */}
                  <div className="space-y-8">
                    <div className="flex items-center gap-4 border-b-2 border-accent pb-4">
                      <School className="w-6 h-6 text-primary" />
                      <h3 className="text-lg font-black uppercase text-primary tracking-widest">Institutional Node</h3>
                    </div>
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Official School Label</Label>
                        <Input required value={formData.schoolName} onChange={(e) => setFormData({...formData, schoolName: e.target.value})} className="h-14 bg-accent/30 border-none rounded-2xl px-6 font-bold uppercase" placeholder="e.g. GBHS DEIDO" />
                      </div>
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Region</Label>
                          <Input required value={formData.region} onChange={(e) => setFormData({...formData, region: e.target.value})} className="h-14 bg-accent/30 border-none rounded-2xl px-4" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Division</Label>
                          <Input required value={formData.division} onChange={(e) => setFormData({...formData, division: e.target.value})} className="h-14 bg-accent/30 border-none rounded-2xl px-4" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Sub-Div</Label>
                          <Input required value={formData.subDivision} onChange={(e) => setFormData({...formData, subDivision: e.target.value})} className="h-14 bg-accent/30 border-none rounded-2xl px-4" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="p-10 md:p-20 bg-accent/10 border-t border-accent flex flex-col items-center gap-8">
                <Button type="submit" disabled={isSubmitting} className="w-full md:w-auto px-20 h-20 rounded-[2rem] bg-primary shadow-2xl font-black uppercase tracking-widest text-sm gap-4 transition-all active:scale-95 text-white">
                  {isSubmitting ? <Loader2 className="w-8 h-8 animate-spin" /> : <Send className="w-8 h-8 text-secondary" />}
                  Finalize Node Activation
                </Button>
                <div className="flex items-center gap-3 text-muted-foreground opacity-40">
                   <ShieldCheck className="w-5 h-5" />
                   <span className="text-[10px] font-black uppercase tracking-[0.3em]">Encrypted Onboarding Protocol</span>
                </div>
              </CardFooter>
            </form>
          </Card>
        </section>
      </main>

      <footer className="w-full py-20 border-t border-primary/5 bg-white">
        <div className="max-w-7xl mx-auto px-4 flex flex-col items-center gap-12 text-center">
          <div className="space-y-2">
            <p className="text-xl md:text-2xl font-black text-primary uppercase tracking-tighter flex items-center justify-center gap-3">
              {platformSettings.name} Community Love You Dearly <Heart className="w-6 h-6 text-red-500 fill-red-500" />
            </p>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.4em] opacity-40">Together for pedagogical excellence</p>
          </div>

          <div className="w-full flex flex-col md:flex-row justify-between items-center gap-8 text-[10px] font-black uppercase tracking-widest text-primary/40 border-t pt-12 border-primary/5">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-primary/5 bg-primary/5 p-1.5">
                <img src={platformLogo} alt={`${platformSettings.name} logo`} className="h-full w-full object-contain" />
              </div>
              <div className="text-left space-y-1">
                <p>{platformSettings.name} SECURE INFRASTRUCTURE</p>
                <p className="opacity-60">Verified Node Cluster Registry</p>
              </div>
            </div>
            <div className="text-center md:text-right space-y-1">
              <p>© 2024 EDUIGNITE SAAS GLOBAL OPERATIONS</p>
              <p className="flex items-center justify-center md:justify-end gap-2 text-secondary opacity-100">
                <ShieldCheck className="w-3 h-3" /> HIGH FIDELITY PEDAGOGY
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function TestimonyCard({ test }: { test: any }) {
  const [isOpen, setIsOpen] = useState(false);
  const isLong = test.message?.length > 120;
  const displayMessage = isLong ? `${test.message.slice(0, 120)}...` : test.message;

  return (
    <>
      <Card 
        className="w-[400px] shrink-0 border-none shadow-xl rounded-[2.5rem] bg-white transition-all duration-500 hover:shadow-2xl hover:-translate-y-1 flex flex-col"
      >
        <CardContent className="p-10 space-y-8 flex flex-col h-full">
          <div className="flex justify-between items-start">
            <div className="p-4 bg-accent rounded-3xl w-fit text-primary shadow-inner">
              <Quote className="w-8 h-8" />
            </div>
            <div className="flex gap-0.5 pt-2">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
              ))}
            </div>
          </div>
          
          <div className="space-y-4 flex-1">
            <p className="text-lg italic font-medium leading-relaxed text-primary/80">
              "{displayMessage}"
            </p>
            {isLong && (
              <button 
                onClick={() => setIsOpen(true)}
                className="text-[10px] font-black uppercase tracking-widest text-secondary hover:text-primary transition-colors flex items-center gap-2"
              >
                Read Full Story <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="pt-8 border-t flex items-center gap-5">
            <Avatar className="h-16 w-16 border-4 border-white shadow-2xl ring-1 ring-accent">
              <AvatarImage src={test.profileImage} />
              <AvatarFallback className="bg-primary/5 text-primary font-black uppercase text-lg">
                {test.name?.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="overflow-hidden">
              <p className="font-black text-primary text-lg truncate uppercase tracking-tight leading-none mb-1">{test.name}</p>
              <div className="flex items-center gap-2 overflow-hidden">
                <Badge variant="secondary" className="bg-secondary text-primary border-none text-[8px] font-black h-5 px-3 shrink-0">
                  {test.role}
                </Badge>
                <span className="text-[10px] text-muted-foreground font-bold truncate opacity-60">@ {test.schoolName}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-xl rounded-[3rem] p-0 overflow-hidden border-none shadow-2xl">
          <DialogHeader className="bg-primary p-10 text-white relative">
            <div className="flex items-center gap-5">
              <div className="p-4 bg-white/10 rounded-[1.5rem] shadow-xl backdrop-blur-md">
                <Quote className="w-8 h-8 text-secondary" />
              </div>
              <div>
                <DialogTitle className="text-2xl font-black uppercase tracking-tighter">Community Voice</DialogTitle>
                <DialogDescription className="text-white/60">Verified institutional testimony.</DialogDescription>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="absolute top-4 right-4 text-white/40 hover:text-white">
              <X className="w-6 h-6" />
            </Button>
          </DialogHeader>
          <div className="p-10 space-y-10 bg-white">
            <div className="space-y-6">
              <p className="text-2xl italic font-serif leading-relaxed text-primary font-medium">
                "{test.message}"
              </p>
            </div>
            
            <div className="pt-8 border-t flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Avatar className="h-14 w-14 border-2 border-primary/10 shadow-lg">
                  <AvatarImage src={test.profileImage} />
                  <AvatarFallback className="font-bold">{test.name?.charAt(0)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-black text-primary uppercase text-base leading-none mb-1">{test.name}</p>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase">{test.role} • {test.schoolName}</p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 opacity-20">
                 <ShieldCheck className="w-10 h-10 text-primary" />
                 <span className="text-[8px] font-black uppercase tracking-widest text-primary">Verified</span>
              </div>
            </div>
          </div>
          <DialogFooter className="bg-accent/20 p-6 border-t border-accent">
            <Button onClick={() => setIsOpen(false)} className="w-full h-12 rounded-xl font-bold uppercase text-xs tracking-widest">Close Dossier</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
