
"use client";

import { useAuth, type UserRole } from "@/lib/auth-context";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardSidebar } from "@/components/layout/dashboard-sidebar";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { 
  Menu, 
  Building2, 
  Heart, 
  Youtube, 
  MessageSquare, 
  Send, 
  CheckCircle2, 
  Loader2, 
  Info, 
  Lock, 
  Wallet, 
  Quote,
  ChevronRight,
  ShieldCheck,
  Globe,
  Coins,
  Smartphone,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { resolveMediaUrl } from "@/lib/media";
import { resolvePlatformLogoUrl } from "@/lib/platform-brand";
import { TrainingPortalSpotlight } from "@/components/layout/training-portal-spotlight";
import { getLicenseAccessState } from "@/lib/license";
import { getApiErrorMessage } from "@/lib/api/errors";
import { useI18n } from "@/lib/i18n-context";
import { getTutorialLinkForSurface } from "@/lib/tutorial-links";
import { ErrorBoundary } from "@/components/error-boundary";

const EXECUTIVE_ROLES: UserRole[] = ["SUPER_ADMIN", "CEO", "CTO", "COO", "INV", "DESIGNER"];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, isLoading, platformSettings, addTestimony, addSupport } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isTestimonyModalOpen, setIsTestimonyModalOpen] = useState(false);
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);
  
  const [testimonyMessage, setTestimonyMessage] = useState("");
  const [isSubmittingTestimony, setIsSubmittingTestimony] = useState(false);

  const [supportData, setSupportData] = useState({
    amount: "1000",
    method: "MTN MoMo",
    phone: "",
    message: ""
  });
  const [isSubmittingSupport, setIsSubmittingSupport] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  const handleTestimonySubmit = () => {
    if (!testimonyMessage.trim() || !user) return;
    setIsSubmittingTestimony(true);

    addTestimony({
        userId: user.id,
        name: user.name,
        profileImage: user.avatar || "",
        role: user.role,
        schoolName: user.school?.name || "Institution Node",
        message: testimonyMessage,
      })
      .then(() => {
        setIsSubmittingTestimony(false);
        setIsTestimonyModalOpen(false);
        setTestimonyMessage("");
        toast({
          title: "Testimony Received",
          description: "Your story has been submitted for review.",
        });
      })
      .catch((error) => {
        setIsSubmittingTestimony(false);
        toast({
          variant: "destructive",
          title: "Submission Failed",
          description: getApiErrorMessage(error, "We could not submit your testimony right now."),
        });
      });
  };

  const handleSupportSubmit = () => {
    if (!supportData.phone || !user || !supportData.amount) return;
    setIsSubmittingSupport(true);

    addSupport({
      userName: user.name,
      userRole: user.role,
      userAvatar: user.avatar || "",
      amount: parseInt(supportData.amount),
      method: supportData.method,
      phone: supportData.phone,
      message: supportData.message,
      schoolName: user.school?.name || "EduIgnite Node",
      uid: user.uid
    })
      .then(() => {
        setIsSubmittingSupport(false);
        setIsSupportModalOpen(false);
        setSupportData({ amount: "1000", method: "MTN MoMo", phone: "", message: "" });
        toast({
          title: "Contribution Received",
          description: "Thank you for supporting our institutional vision!",
        });
      })
      .catch((error) => {
        setIsSubmittingSupport(false);
        toast({
          variant: "destructive",
          title: "Contribution Failed",
          description: getApiErrorMessage(error, "We could not record your support contribution right now."),
        });
      });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-4">
        <Loader2 className="w-12 h-12 animate-spin text-primary opacity-20" />
        <p className="text-primary/40 font-black uppercase text-[10px] tracking-[0.3em] animate-pulse">Syncing Prototype Session</p>
      </div>
    );
  }

  if (!user) return null;

  const isPlatformExecutive = EXECUTIVE_ROLES.includes(user.role as UserRole);
  const licenseState = getLicenseAccessState(user, platformSettings as any);
  const isSubscriptionPage = pathname === "/dashboard/subscription";
  const schoolLogo = resolveMediaUrl(user?.school?.logo);
  const platformLogo = resolvePlatformLogoUrl(platformSettings.logo);

  if (licenseState.restrictionApplies && !isPlatformExecutive && !isSubscriptionPage) {
    return (
      <div className="flex min-h-dvh flex-col md:flex-row bg-background">
        <aside className="hidden md:flex w-64 shrink-0 h-full">
          <DashboardSidebar />
        </aside>
        <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 bg-accent/10">
          <Card className="max-w-md w-full border-none shadow-2xl rounded-[2rem] overflow-hidden">
            <CardHeader className="bg-primary p-6 sm:p-8 text-white text-center">
              <div className="flex justify-center mb-4">
                <div className="p-4 bg-white/10 rounded-full">
                  <Lock className="w-12 h-12 text-secondary" />
                </div>
              </div>
              <CardTitle className="text-2xl font-black uppercase">Dashboard Locked</CardTitle>
              <CardDescription className="text-white/60">Annual Institutional License Required</CardDescription>
            </CardHeader>
            <CardContent className="p-6 sm:p-8 text-center space-y-6">
              <p className="text-sm text-muted-foreground leading-relaxed">
                Your account dashboard is locked because the founder-configured annual license fee for your role is still unpaid and the payment deadline has passed.
              </p>
              <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 flex gap-3 text-left">
                <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-800 font-medium">
                  Amount due: {licenseState.feeAmount.toLocaleString()} XAF.
                  {licenseState.deadline ? ` Deadline: ${licenseState.deadline.toLocaleDateString()}.` : ""}
                </p>
              </div>
              <Button asChild className="w-full h-14 rounded-2xl shadow-lg font-black uppercase tracking-widest text-xs gap-2">
                <Link href="/dashboard/subscription">
                  <Wallet className="w-5 h-5" /> Activate License Now
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const tutorialUrl =
    getTutorialLinkForSurface(platformSettings?.tutorialLinks, user.role, "web") ||
    "https://youtube.com";
  const dashboardTitle = isPlatformExecutive
    ? platformSettings.name || "Platform Board"
    : user?.school?.shortName || user?.school?.name || "Institution";

  return (
    <div className="flex min-h-dvh flex-col md:flex-row bg-background">
      <aside className="hidden md:flex w-64 shrink-0 h-full">
        <DashboardSidebar />
      </aside>

      <div className="flex-1 flex min-h-dvh flex-col overflow-hidden">
        <header className="md:hidden sticky top-0 z-20 flex items-center justify-between gap-3 px-3 py-3 bg-primary/95 backdrop-blur text-white shrink-0">
          <div className="flex items-center gap-2 overflow-hidden">
            {!isPlatformExecutive && schoolLogo ? (
              <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shrink-0 overflow-hidden">
                <img src={schoolLogo} alt="Logo" className="w-full h-full object-contain" />
              </div>
            ) : isPlatformExecutive ? (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-1">
                <img
                  src={platformLogo}
                  alt={`${platformSettings.name} logo`}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            ) : null}
            <span className="font-bold tracking-tight text-white truncate uppercase">
              {dashboardTitle}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <LanguageSwitcher tone="dark" />
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="text-white">
                  <Menu className="w-6 h-6" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 border-none w-[88vw] max-w-80">
                <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
                <DashboardSidebar onClose={() => setIsMobileMenuOpen(false)} />
              </SheetContent>
            </Sheet>
          </div>
        </header>

        <header className="hidden md:flex sticky top-0 z-20 items-center justify-between gap-4 border-b border-border/60 bg-background/95 px-8 py-3 backdrop-blur shrink-0">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground">
              {t("workspaceLanguage")}
            </p>
            <p className="truncate text-sm font-black text-primary uppercase tracking-tight">
              {dashboardTitle}
            </p>
          </div>
          <LanguageSwitcher />
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="px-3 py-4 sm:px-4 md:p-8 min-h-full flex flex-col">
            <div className="max-w-7xl mx-auto space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500 w-full flex-1">
              <ErrorBoundary fallbackTitle="Something went wrong on our end.">
                {children}
              </ErrorBoundary>
              <TrainingPortalSpotlight
                roleLabel={user.role.replace(/_/g, " ")}
                tutorialUrl={tutorialUrl}
              />
            </div>

            {!isPlatformExecutive && (
              <footer className="mt-12 md:mt-20 border-t pt-8 pb-10 md:pb-12 w-full max-w-7xl mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-primary/5 rounded-lg border border-primary/10">
                        {schoolLogo ? (
                          <img src={schoolLogo} alt="School Logo" className="w-full h-full object-contain" />
                        ) : (
                          <Building2 className="w-4 h-4 text-primary" />
                        )}
                      </div>
                      <span className="font-black text-primary uppercase tracking-tighter">
                        {user?.school?.name || "Institutional Node"}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed max-w-md">
                      Dedicated to delivering world-class pedagogical excellence through secure digital infrastructure. This institutional node is verified and managed by authorized personnel.
                    </p>
                    <div className="flex flex-wrap items-center gap-4">
                      <Button variant="outline" size="sm" className="rounded-xl border-primary/20 text-primary font-bold gap-2 h-10 px-4 group" asChild>
                        <a href={tutorialUrl} target="_blank" rel="noopener noreferrer">
                          <Youtube className="w-4 h-4 text-red-600" />
                          Training Portal
                          <ChevronRight className="w-3 h-3 transition-transform group-hover:translate-x-1" />
                        </a>
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-col md:items-end gap-4">
                    <div className="bg-secondary/10 p-5 sm:p-6 rounded-3xl border border-secondary/20 flex flex-col md:items-end text-center md:text-right space-y-3">
                      <div>
                        <h4 className="font-black text-primary uppercase text-xs tracking-widest flex items-center md:justify-end gap-2 mb-1">
                          Community & Support <Heart className="w-3.5 h-3.5 text-red-500 fill-red-500" />
                        </h4>
                        <p className="text-xs text-muted-foreground">Help strengthen our institutional digital vision.</p>
                      </div>
                      
                      <div className="flex flex-wrap gap-3 md:justify-end">
                        <Dialog open={isTestimonyModalOpen} onOpenChange={setIsTestimonyModalOpen}>
                          <Button asChild variant="outline" className="rounded-xl border-primary/20 text-primary h-11 px-6 font-bold gap-2 bg-white hover:bg-primary/5">
                            <button onClick={() => setIsTestimonyModalOpen(true)}>
                              <Quote className="w-4 h-4" />
                              Give Testimony
                            </button>
                          </Button>
                          <DialogContent className="sm:max-w-md rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
                            <DialogHeader className="bg-primary p-6 sm:p-8 text-white relative">
                              <div className="flex items-center gap-4">
                                <div className="p-3 bg-white/10 rounded-2xl">
                                  <Quote className="w-8 h-8 text-secondary" />
                                </div>
                                <div>
                                  <DialogTitle className="text-2xl font-black uppercase">Share Your Story</DialogTitle>
                                  <DialogDescription className="text-white/60">Help showcase the excellence of our institution.</DialogDescription>
                                </div>
                              </div>
                              <Button variant="ghost" size="icon" onClick={() => setIsTestimonyModalOpen(false)} className="absolute top-4 right-4 text-white/40 hover:text-white">
                                <X className="w-6 h-6" />
                              </Button>
                            </DialogHeader>
                            <div className="p-5 sm:p-8 space-y-6">
                              <div className="space-y-2">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Your Message</Label>
                                <Textarea 
                                  placeholder="Share your experience..." 
                                  className="min-h-[150px] bg-accent/30 border-none rounded-2xl focus-visible:ring-primary p-4"
                                  value={testimonyMessage}
                                  onChange={(e) => setTestimonyMessage(e.target.value)}
                                  required
                                />
                              </div>
                              <div className="bg-primary/5 p-4 rounded-xl border border-primary/10 flex items-center gap-3">
                                <Info className="w-5 h-5 text-primary opacity-40" />
                                <p className="text-[10px] text-muted-foreground italic">Your professional profile details will be attached to this submission.</p>
                              </div>
                            </div>
                            <DialogFooter className="bg-accent/20 p-5 sm:p-6 border-t border-accent">
                              <Button 
                                className="w-full h-14 rounded-2xl shadow-xl font-black uppercase text-xs gap-3 bg-primary text-white hover:bg-primary/90" 
                                onClick={handleTestimonySubmit}
                                disabled={isSubmittingTestimony || !testimonyMessage.trim()}
                              >
                                {isSubmittingTestimony ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                                Submit for Review
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>

                        <Dialog open={isSupportModalOpen} onOpenChange={setIsSupportModalOpen}>
                          <Button asChild className="rounded-xl bg-primary text-white h-11 px-8 font-black uppercase tracking-widest text-[10px] gap-2 shadow-lg hover:bg-primary/90">
                            <button onClick={() => setIsSupportModalOpen(true)}>
                              <Coins className="w-4 h-4 text-secondary" />
                              Support our Vision
                            </button>
                          </Button>
                          <DialogContent className="sm:max-w-md rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
                            <DialogHeader className="bg-primary p-6 sm:p-8 text-white relative">
                              <div className="flex items-center gap-4">
                                <div className="p-3 bg-white/10 rounded-2xl">
                                  <Heart className="w-8 h-8 text-secondary fill-secondary/20" />
                                </div>
                                <div>
                                  <DialogTitle className="text-2xl font-black uppercase">Willing Support</DialogTitle>
                                  <DialogDescription className="text-white/60">Contribute to the school's digital evolution.</DialogDescription>
                                </div>
                              </div>
                              <Button variant="ghost" size="icon" onClick={() => setIsSupportModalOpen(false)} className="absolute top-4 right-4 text-white/40 hover:text-white">
                                <X className="w-6 h-6" />
                              </Button>
                            </DialogHeader>
                            <div className="p-5 sm:p-8 space-y-6 max-h-[70vh] overflow-y-auto">
                              <div className="space-y-4">
                                <div className="space-y-2">
                                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Contribution Amount (XAF)</Label>
                                  <div className="relative">
                                    <Input 
                                      type="number" 
                                      placeholder="Enter amount..." 
                                      className="h-12 bg-accent/30 border-none rounded-xl font-black text-primary pl-14"
                                      value={supportData.amount}
                                      onChange={(e) => setSupportData({...supportData, amount: e.target.value})}
                                    />
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black text-primary/40">XAF</div>
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Payment Method</Label>
                                  <div className="grid grid-cols-2 gap-2">
                                    <Button 
                                      type="button"
                                      variant={supportData.method === 'MTN MoMo' ? 'default' : 'outline'}
                                      className={cn("h-12 rounded-xl font-bold", supportData.method === 'MTN MoMo' ? "border-primary" : "border-accent")}
                                      onClick={() => setSupportData({...supportData, method: 'MTN MoMo'})}
                                    >MTN</Button>
                                    <Button 
                                      type="button"
                                      variant={supportData.method === 'Orange Money' ? 'default' : 'outline'}
                                      className={cn("h-12 rounded-xl font-bold", supportData.method === 'Orange Money' ? "border-primary" : "border-accent")}
                                      onClick={() => setSupportData({...supportData, method: 'Orange Money'})}
                                    >Orange</Button>
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Mobile Number</Label>
                                  <div className="relative">
                                    <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/40" />
                                    <Input 
                                      placeholder="6XX XX XX XX" 
                                      className="h-12 pl-10 bg-accent/30 border-none rounded-xl font-bold" 
                                      value={supportData.phone}
                                      onChange={(e) => setSupportData({...supportData, phone: e.target.value})}
                                    />
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Optional Note</Label>
                                  <Textarea 
                                    placeholder="Leave a message of encouragement..." 
                                    className="bg-accent/30 border-none rounded-xl min-h-[80px]"
                                    value={supportData.message}
                                    onChange={(e) => setSupportData({...supportData, message: e.target.value})}
                                  />
                                </div>
                              </div>
                            </div>
                            <DialogFooter className="bg-accent/20 p-5 sm:p-6 border-t border-accent">
                              <Button 
                                className="w-full h-14 rounded-2xl shadow-xl font-black uppercase text-xs gap-3 bg-primary text-white hover:bg-primary/90" 
                                onClick={handleSupportSubmit}
                                disabled={isSubmittingSupport || !supportData.phone || !supportData.amount}
                              >
                                {isSubmittingSupport ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5 text-secondary" />}
                                Authorize Contribution
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap items-center justify-center md:justify-end gap-3 md:gap-6 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground opacity-40 text-center md:text-right">
                      <span>Node Status: Optimal</span>
                      <span>•</span>
                      <span>Verified Institutional Registry</span>
                    </div>
                  </div>
                </div>
              </footer>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
