
"use client";

import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  MapPin, 
  Phone, 
  Mail, 
  User, 
  ShieldCheck, 
  BookOpen, 
  Users, 
  Calendar,
  Globe,
  Quote,
  Clock,
  Heart,
  FileText
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { SchoolHierarchyManager } from "@/components/dashboard/school-hierarchy-manager";

export default function InstitutionProfilePage() {
  const { user } = useAuth();
  const { t, language } = useI18n();

  if (!user?.school) return null;

  const school = user.school;

  return (
    <div className="space-y-8 pb-20">
      {/* Hero Branding Section */}
      <div className="relative h-[300px] md:h-[400px] rounded-[3rem] overflow-hidden shadow-2xl border-4 border-white group bg-slate-200">
        {school.banner ? (
          <img
            src={school.banner}
            alt={school.name}
            className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-primary/95 via-primary/40 to-transparent" />
        
        <div className="absolute bottom-10 left-10 right-10 text-white flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-20 h-20 bg-white rounded-[2rem] shadow-xl p-4 flex items-center justify-center border-4 border-accent transition-transform hover:rotate-3">
                {school.logo ? <img src={school.logo} alt="Logo" className="w-full h-full object-contain" /> : null}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Badge className="bg-secondary text-primary border-none font-black uppercase text-[10px] px-3">
                    {t("academicYear")} 2023/24
                  </Badge>
                  <Badge variant="outline" className="text-white border-white/20 text-[10px] uppercase font-bold">Verified Node</Badge>
                </div>
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-black font-headline tracking-tighter leading-none">{school.name}</h1>
              </div>
            </div>
            <p className="text-lg md:text-xl italic opacity-90 font-serif max-w-2xl">"{school.motto}"</p>
          </div>
          
          <div className="hidden lg:flex items-center gap-4 bg-white/10 backdrop-blur-md px-6 py-4 rounded-3xl border border-white/10">
             <div className="text-center border-r border-white/10 pr-6">
                <p className="text-[10px] font-black uppercase opacity-60">Students</p>
                <p className="text-2xl font-black">2,500+</p>
             </div>
             <div className="text-center">
                <p className="text-[10px] font-black uppercase opacity-60">Staff</p>
                <p className="text-2xl font-black">120+</p>
             </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Details */}
        <div className="lg:col-span-8 space-y-8">
          <Card className="border-none shadow-sm overflow-hidden rounded-[2.5rem]">
            <CardHeader className="bg-primary/5 border-b p-8">
              <CardTitle className="flex items-center gap-3 text-primary text-xl">
                <BookOpen className="w-6 h-6 text-secondary" />
                {t("aboutSchool")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-8 space-y-6">
              <p className="text-muted-foreground leading-relaxed text-lg font-medium">
                {school.description}
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                <div className="bg-accent/30 p-6 rounded-3xl space-y-2">
                  <h4 className="text-xs font-black uppercase text-primary tracking-widest flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-secondary" /> Pedagogy Focus
                  </h4>
                  <p className="text-sm text-primary/70 leading-relaxed font-bold">
                    Committed to delivering world-class curriculum with a focus on discipline, technological literacy, and character excellence.
                  </p>
                </div>
                <div className="bg-primary/5 p-6 rounded-3xl space-y-2">
                  <h4 className="text-xs font-black uppercase text-primary tracking-widest flex items-center gap-2">
                    <Globe className="w-4 h-4 text-secondary" /> Global Standard
                  </h4>
                  <p className="text-sm text-primary/70 leading-relaxed font-bold">
                    Operating as an official digital node within the EduIgnite Academic SaaS ecosystem for enhanced integrity.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm overflow-hidden rounded-[2.5rem]">
            <CardHeader className="bg-primary/5 border-b p-8">
              <CardTitle className="flex items-center gap-3 text-primary text-xl">
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
                      <p className="font-bold text-primary">{school.address}</p>
                      <p className="text-xs text-muted-foreground font-medium">{school.location}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-accent rounded-2xl text-primary">
                      <Phone className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-1">{t("phone")}</p>
                      <p className="font-bold text-primary">{school.phone}</p>
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
                      <p className="font-bold text-primary">{school.email}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-accent rounded-2xl text-primary">
                      <Globe className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-1">Official Domain</p>
                      <p className="font-bold text-primary">{school.id.toLowerCase()}.eduignite.cm</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Principal & National Context */}
        <div className="lg:col-span-4 space-y-8">
          {/* Principal Card */}
          <Card className="border-none shadow-xl bg-primary text-white overflow-hidden rounded-[2.5rem]">
            <CardHeader className="text-center pt-10 pb-2">
              <Avatar className="h-32 w-32 border-4 border-white/20 mx-auto shadow-2xl mb-4">
                <AvatarFallback className="bg-secondary text-primary text-4xl font-black">
                  {school.principal?.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <CardTitle className="text-2xl font-black">{school.principal}</CardTitle>
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
          <Card className="border-none shadow-sm bg-white overflow-hidden rounded-[2.5rem] p-8 text-center space-y-6">
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
                  This school is a registered public pedagogical entity, recognized by the Ministry of Secondary Education and verified on the EduIgnite platform.
                </p>
             </div>
             <div className="bg-accent/30 p-4 rounded-2xl flex items-center justify-center gap-3">
                <ShieldCheck className="w-5 h-5 text-primary" />
                <span className="text-[9px] font-black text-primary uppercase tracking-widest">Digital License Active</span>
             </div>
          </Card>
        </div>
      </div>

      <SchoolHierarchyManager schoolId={school.id} schoolName={school.name} />
    </div>
  );
}
