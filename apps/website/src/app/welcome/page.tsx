"use client";

import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { 
  ArrowRight, 
  Building2, 
  ShieldCheck, 
  BookOpen,
  Users,
  RefreshCw,
  Sparkles,
  Zap,
  Globe,
  MapPin,
  Phone,
  Mail,
  Quote,
  Clock,
  Heart,
  FileText,
  CheckCircle2,
  Info,
  Loader2
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { LoadingScreen } from "@/components/layout/loading-screen";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function SchoolWelcomePage() {
  const { user, isAuthenticated, isLoading: isAuthLoading, schools } = useAuth();
  const { t, language } = useI18n();
  const router = useRouter();
  const [isConnecting, setIsConnecting] = useState(true);
  const [isEntering, setIsEntering] = useState(false);

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.push("/login");
    }

    if (isAuthenticated && user) {
      const timer = setTimeout(() => {
        setIsConnecting(false);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, isAuthLoading, user, router]);

  const handleEnterDashboard = () => {
    setIsEntering(true);
    // Navigation is handled by the Link or router.push
    // We just set state here for immediate button feedback
  };

  if (isAuthLoading || isConnecting) {
    return <LoadingScreen />;
  }

  const resolvedSchool = user?.school || 
    (user?.schoolId ? schools.find(s => s.id === user?.schoolId) : null) || 
    schools[0];

  if (!user || !resolvedSchool) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-8 text-center space-y-6">
        <div className="p-6 bg-primary/5 rounded-full border-2 border-dashed border-primary/20">
          <Building2 className="w-16 h-16 text-primary/20" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-black text-primary uppercase tracking-tighter">Connection Failed</h1>
          <p className="text-muted-foreground max-w-md mx-auto">We couldn't synchronize your institutional node data. Please re-authenticate.</p>
        </div>
        <Button variant="outline" className="rounded-xl gap-2 font-bold" onClick={() => router.push("/login")}>
          <RefreshCw className="w-4 h-4" /> Back to Login
        </Button>
      </div>
    );
  }

  const schoolDomain = (resolvedSchool.shortName || "node").toLowerCase();
  const schoolLogo = resolvedSchool.logo?.trim() || null;
  const schoolBanner = resolvedSchool.banner?.trim() || null;
  const schoolInitial = resolvedSchool.name?.charAt(0)?.toUpperCase() || "S";

  return (
    <div className="min-h-screen bg-[#F0F2F5] selection:bg-secondary selection:text-primary flex flex-col items-center relative overflow-x-hidden">
      {/* 1. LOGO-FIRST BRANDING AT TOP */}
      <div className="w-full bg-white/80 backdrop-blur-xl border-b border-primary/5 py-8 flex flex-col items-center gap-4 shrink-0">
        <div className="w-24 h-24 md:w-32 bg-white rounded-[2.5rem] p-5 shadow-2xl flex items-center justify-center border-4 border-white ring-4 ring-primary/5 transition-transform hover:rotate-3">
          {schoolLogo ? (
            <img src={schoolLogo} alt="Logo" className="w-full h-full object-contain" />
          ) : (
            <div className="w-full h-full rounded-[1.5rem] bg-primary/5 text-primary flex items-center justify-center font-black text-3xl">
              {schoolInitial}
            </div>
          )}
        </div>
        <div className="text-center space-y-1">
          <div className="flex items-center justify-center gap-2">
            <Badge className="bg-secondary text-primary border-none font-black uppercase text-[10px] px-4 h-6">
              Node ID: {resolvedSchool.id}
            </Badge>
            <Badge variant="outline" className="border-primary/20 text-primary font-bold text-[10px] uppercase h-6">Verified Institution</Badge>
          </div>
          <h1 className="text-2xl md:text-4xl font-black text-primary tracking-tighter leading-none uppercase max-w-2xl px-4">
            {resolvedSchool.name}
          </h1>
          <p className="text-sm md:text-lg italic text-muted-foreground font-serif">
            "{resolvedSchool.motto}"
          </p>
        </div>
      </div>
      
      <div className="max-w-6xl w-full px-4 md:px-8 py-8 space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-1000">
        
        {/* 2. RESPONSIVE HERO BANNER */}
        <div className="relative w-full aspect-[21/9] md:aspect-[3/1] rounded-[2.5rem] md:rounded-[3.5rem] overflow-hidden shadow-2xl border-4 border-white bg-slate-200 group">
          {schoolBanner ? (
            <img
              src={schoolBanner}
              alt={resolvedSchool.name}
              className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary via-primary/90 to-secondary flex items-center justify-center">
              <div className="text-center text-white px-6">
                <Building2 className="w-14 h-14 mx-auto mb-4 text-white/80" />
                <p className="text-xs font-black uppercase tracking-[0.35em] text-white/70">Institutional Node</p>
                <h2 className="text-3xl md:text-5xl font-black tracking-tighter mt-2">{resolvedSchool.name}</h2>
              </div>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-primary/60 via-transparent to-transparent" />
          
          <div className="absolute bottom-6 left-6 md:bottom-10 md:left-10 text-white hidden sm:block">
             <div className="flex items-center gap-3">
                <div className="bg-white/20 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 flex items-center gap-2">
                   <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                   <span className="text-[10px] font-black uppercase tracking-widest">Campus Node Active</span>
                </div>
             </div>
          </div>
        </div>

        {/* 3. WELCOME ACTION CARD */}
        <div className="bg-white p-8 md:p-12 rounded-[2.5rem] shadow-xl border border-white/50 flex flex-col lg:flex-row items-center justify-between gap-8">
          <div className="space-y-4 text-center lg:text-left flex-1">
            <div className="flex items-center justify-center lg:justify-start gap-2">
              <Sparkles className="w-5 h-5 text-secondary" />
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/40">Access Initialized</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-black text-primary tracking-tighter leading-[0.9]">
              {language === 'en' ? `Welcome, ${user.name}` : `Bienvenue, ${user.name}`}
            </h2>
            <Badge className="bg-primary/5 text-primary border-primary/10 h-7 px-4 font-black uppercase text-[10px] tracking-widest">
              {user.role.replace('_', ' ')}
            </Badge>
            <p className="text-lg text-muted-foreground font-medium leading-relaxed max-w-xl">
              Your institutional gateway is synchronized. Step into your specialized dashboard to manage your academic and administrative sequence.
            </p>
          </div>
          
          <div className="w-full lg:w-auto shrink-0">
            <Button 
              asChild 
              size="lg" 
              className="w-full lg:w-[300px] h-20 bg-primary text-white hover:bg-primary/90 font-black uppercase tracking-widest text-sm rounded-2xl shadow-2xl transition-all active:scale-95 gap-4 group"
              onClick={handleEnterDashboard}
              disabled={isEntering}
            >
              <Link href="/dashboard">
                {isEntering ? (
                  <>
                    <Loader2 className="w-6 h-6 animate-spin text-secondary" />
                    Synchronizing Node...
                  </>
                ) : (
                  <>
                    Enter Dashboard 
                    <div className="bg-secondary p-2 rounded-lg group-hover:translate-x-1 transition-transform">
                      <ArrowRight className="w-5 h-5 text-primary" />
                    </div>
                  </>
                )}
              </Link>
            </Button>
          </div>
        </div>

        {/* 4. INTEGRATED INSTITUTIONAL PROFILE */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 space-y-8">
            <Card className="border-none shadow-sm overflow-hidden rounded-[2.5rem] bg-white">
              <CardHeader className="bg-primary/5 border-b p-8">
                <CardTitle className="flex items-center gap-3 text-primary text-xl font-black uppercase tracking-tight">
                  <BookOpen className="w-6 h-6 text-secondary" />
                  {t("aboutSchool")}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-8 space-y-6">
                <p className="text-muted-foreground leading-relaxed text-lg font-medium">
                  {resolvedSchool.description}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                  <div className="bg-accent/30 p-6 rounded-3xl space-y-2 border border-accent">
                    <h4 className="text-xs font-black uppercase text-primary tracking-widest flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-secondary" /> Pedagogy Focus
                    </h4>
                    <p className="text-sm text-primary/70 leading-relaxed font-bold">
                      Committed to delivering world-class curriculum with a focus on discipline, technological literacy, and character excellence.
                    </p>
                  </div>
                  <div className="bg-primary/5 p-6 rounded-3xl space-y-2 border border-primary/10">
                    <h4 className="text-xs font-black uppercase text-primary tracking-widest flex items-center gap-2">
                      <Globe className="w-4 h-4 text-secondary" /> Global Standard
                    </h4>
                    <p className="text-sm text-primary/70 leading-relaxed font-bold">
                      Operating as an official digital node within the high-fidelity pedagogical ecosystem.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm overflow-hidden rounded-[2.5rem] bg-white">
              <CardHeader className="bg-primary/5 border-b p-8">
                <CardTitle className="flex items-center gap-3 text-primary text-xl font-black uppercase tracking-tight">
                  <MapPin className="w-6 h-6 text-secondary" />
                  {t("contactInfo")}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <div className="flex items-start gap-4">
                      <div className="p-3 bg-accent rounded-2xl text-primary">
                        <MapPin className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-1">{t("address")}</p>
                        <p className="font-bold text-primary">{resolvedSchool.address}</p>
                        <p className="text-xs text-muted-foreground font-medium">{resolvedSchool.location}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-4">
                      <div className="p-3 bg-accent rounded-2xl text-primary">
                        <Phone className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-1">{t("phone")}</p>
                        <p className="font-bold text-primary">{resolvedSchool.phone}</p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-6">
                    <div className="flex items-start gap-4">
                      <div className="p-3 bg-accent rounded-2xl text-primary">
                        <Mail className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-1">{t("email")}</p>
                        <p className="font-bold text-primary">{resolvedSchool.email}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-4">
                      <div className="p-3 bg-accent rounded-2xl text-primary">
                        <Globe className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-1">Official Domain</p>
                        <p className="font-bold text-primary">{schoolDomain}.edu.cm</p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-4 space-y-8">
            {/* Principal Card */}
            <Card className="border-none shadow-xl bg-primary text-white overflow-hidden rounded-[2.5rem]">
              <CardHeader className="text-center pt-10 pb-2">
                <Avatar className="h-32 w-32 border-4 border-white/20 mx-auto shadow-2xl mb-4">
                  <AvatarFallback className="bg-secondary text-primary text-4xl font-black">
                    {resolvedSchool.principal?.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <CardTitle className="text-2xl font-black">{resolvedSchool.principal}</CardTitle>
                <CardDescription className="text-secondary font-black uppercase tracking-widest text-[10px] mt-1">
                  {t("proviseur")}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-8 text-center space-y-6">
                <div className="space-y-4">
                  <Quote className="w-8 h-8 text-secondary/20 mx-auto -mb-2" />
                  <p className="text-sm leading-relaxed italic text-white/80 font-medium">
                    "Leading this institution toward pedagogical excellence and digital transformation is my primary mission. We shape the leaders of tomorrow."
                  </p>
                </div>
                <div className="pt-6 border-t border-white/10 flex justify-center">
                   <Badge className="bg-secondary text-primary border-none font-black px-4 py-1">ADMINISTRATIVE HEAD</Badge>
                </div>
              </CardContent>
            </Card>

            {/* National Identity Card */}
            <Card className="border-none shadow-sm bg-white overflow-hidden rounded-[2.5rem] p-8 text-center space-y-6 border border-white">
               <div className="flex flex-col items-center gap-4">
                  <div className="flex gap-1.5 h-4 mb-2">
                    <div className="w-3 h-full bg-[#007a5e] rounded-sm" />
                    <div className="w-3 h-full bg-[#ce1126] rounded-sm flex items-center justify-center"><div className="w-1 h-1 bg-yellow-400 rounded-full" /></div>
                    <div className="w-3 h-full bg-[#fcd116] rounded-sm" />
                  </div>
                  <div className="space-y-1">
                     <p className="text-[9px] font-black uppercase text-muted-foreground tracking-tighter leading-none">Republic of Cameroon</p>
                     <p className="text-[9px] font-black uppercase text-muted-foreground tracking-tighter leading-none">Min. of Secondary Education</p>
                  </div>
               </div>
               <div className="h-px bg-accent w-1/2 mx-auto" />
               <div className="space-y-2">
                  <h4 className="text-xs font-black text-primary uppercase">Institutional Credibility</h4>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    This school is a registered pedagogical entity, recognized by the Ministry of Secondary Education and verified on the secure digital network.
                  </p>
               </div>
               <div className="bg-accent/30 p-4 rounded-2xl flex items-center justify-center gap-3">
                  <ShieldCheck className="w-5 h-5 text-primary" />
                  <span className="text-[9px] font-black text-primary uppercase tracking-widest">Node Registry Active</span>
               </div>
            </Card>
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between opacity-40 py-8 border-t">
           <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-primary" />
              <span className="text-[8px] font-black uppercase tracking-widest">Regional Cluster Node</span>
           </div>
           <p className="text-[8px] font-black uppercase tracking-widest">Verified Institutional Secure Infrastructure</p>
        </div>
      </div>
    </div>
  );
}
