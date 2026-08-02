"use client";

import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ShieldCheck, Activity, GraduationCap, Wallet, Info, Lock, QrCode, Building2, CalendarDays, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { getLicenseAccessState } from "@/lib/license";

export function DefaultDashboard() {
  const { user, platformSettings } = useAuth();
  const licenseState = getLicenseAccessState(user as any, platformSettings as any);
  const schoolName = user?.school?.name || "Independent Account";
  const schoolLocation = [user?.school?.city_village, user?.school?.region].filter(Boolean).join(", ") || "Not linked to a school node yet";
  const accessSummary = licenseState.restricted
    ? "Platform access is currently restricted until the license condition is cleared."
    : "Platform access is active and your account can use the connected services normally.";
  const nextDeadline = platformSettings?.platformFeeDeadline || platformSettings?.licenseDeadline || null;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16 md:h-20 md:w-20 border-4 border-white shadow-xl shrink-0 ring-4 ring-primary/5">
            <AvatarImage src={user?.avatar} alt={user?.name} />
            <AvatarFallback className="bg-primary/5 text-primary text-2xl font-black">{user?.name?.charAt(0)}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-3xl font-bold text-primary font-headline tracking-tighter">Welcome back, {user?.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary" className="bg-primary/5 text-primary border-none font-black uppercase text-[10px] h-5 px-3">
                {user?.role?.replace('_', ' ')}
              </Badge>
              {user?.school && (
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">• {user.school.name}</span>
              )}
            </div>
          </div>
        </div>
        <div className="bg-green-50 px-4 py-2 rounded-xl border border-green-100 flex items-center gap-3 shrink-0">
          <ShieldCheck className="w-5 h-5 text-green-600" />
          <p className="text-xs font-bold text-green-700">Official Node Active</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Role Registry", value: user?.role?.replace('_', ' ') || "", icon: ShieldCheck, color: "text-blue-600" },
          { label: "License Status", value: licenseState.statusLabel, icon: Wallet, color: "text-green-600" },
          { label: "Matricule", value: user?.matricule || user?.id || "", icon: GraduationCap, color: "text-purple-600" },
          { label: "AI Requests", value: user?.aiRequestCount || 0, icon: Activity, color: "text-amber-600" },
        ].map((stat, i) => (
          <Card key={i} className="border-none shadow-sm group hover:shadow-md transition-all">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">{stat.label}</CardTitle>
              <stat.icon className={cn("w-4 h-4 transition-transform group-hover:scale-110", stat.color)} />
            </CardHeader>
            <CardContent><div className="text-2xl font-black text-primary">{stat.value}</div></CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 border-none shadow-xl overflow-hidden rounded-[2rem]">
          <CardHeader className="bg-primary/5 p-8 border-b">
            <CardTitle className="text-primary flex items-center gap-2 font-black uppercase tracking-tighter">
              <Building2 className="w-5 h-5 text-secondary"/> Account Connection Summary
            </CardTitle>
            <CardDescription>Live identity and access details from the connected profile and school node.</CardDescription>
          </CardHeader>
          <CardContent className="p-8">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-primary/10 bg-white p-5 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">School Node</p>
                <p className="mt-2 text-lg font-black text-primary">{schoolName}</p>
                <p className="mt-2 text-sm text-muted-foreground">{schoolLocation}</p>
              </div>
              <div className="rounded-2xl border border-primary/10 bg-white p-5 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Current Access</p>
                <p className="mt-2 text-lg font-black text-primary">{licenseState.statusLabel}</p>
                <p className="mt-2 text-sm text-muted-foreground">{accessSummary}</p>
              </div>
              <div className="rounded-2xl border border-primary/10 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2 text-primary">
                  <CalendarDays className="w-4 h-4" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Next Fee Deadline</p>
                </div>
                <p className="mt-2 text-lg font-black text-primary">{nextDeadline || "Not configured"}</p>
                <p className="mt-2 text-sm text-muted-foreground">This value comes directly from the current platform settings.</p>
              </div>
              <div className="rounded-2xl border border-primary/10 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2 text-primary">
                  <Sparkles className="w-4 h-4" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Profile Readiness</p>
                </div>
                <p className="mt-2 text-lg font-black text-primary">
                  {[user?.email, user?.phone, user?.avatar].filter(Boolean).length} / 3 essentials set
                </p>
                <p className="mt-2 text-sm text-muted-foreground">Complete contact details and profile media so they display consistently across the platform.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-none shadow-sm rounded-[2rem] bg-secondary/10 flex flex-col items-center justify-center text-center p-8 space-y-4">
            <div className="p-4 bg-white rounded-2xl shadow-xl">
              <ShieldCheck className="w-12 h-12 text-primary" />
            </div>
            <div>
              <h3 className="text-xl font-black text-primary uppercase tracking-tighter leading-none">Verified Identity</h3>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">Your account is secured with a unique institutional matricule. All actions are logged for integrity.</p>
            </div>
            <div className="pt-6 border-t border-white/10 flex justify-center gap-6 relative z-10">
              <div className="flex flex-col items-center gap-1 opacity-40">
                <QrCode className="w-8 h-8" />
                <span className="text-[7px] font-black uppercase tracking-widest">ID Scan</span>
              </div>
              <div className="flex flex-col items-center gap-1 opacity-40">
                <Lock className="w-8 h-8" />
                <span className="text-[7px] font-black uppercase tracking-widest">Vault</span>
              </div>
            </div>
            <Button asChild variant="outline" className="w-full rounded-xl font-bold border-primary/10 bg-white">
              <Link href="/dashboard/profile">View Secure Profile</Link>
            </Button>
          </Card>

          <Card className="border-none shadow-sm bg-primary text-white p-6 rounded-3xl">
            <div className="flex items-center gap-3 mb-4">
              <Info className="w-5 h-5 text-secondary" />
              <h4 className="text-[10px] font-black uppercase tracking-widest opacity-60">System Notice</h4>
            </div>
            <p className="text-xs font-medium leading-relaxed italic">
              Dashboard synchronization is currently operating at optimal capacity across the node.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
