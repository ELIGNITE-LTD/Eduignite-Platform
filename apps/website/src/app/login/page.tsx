"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { useFirebaseBootstrapStatus } from "@/firebase/client-provider";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Languages,
  Loader2,
  Lock,
  Fingerprint,
  ExternalLink,
  ShieldCheck,
  Mail,
  ArrowLeft,
  CheckCircle2,
  Wifi,
  Sparkles,
  Eye,
  EyeOff,
  AlertTriangle,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { authService } from "@/lib/api/services/auth.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import { resolvePlatformLogoUrl } from "@/lib/platform-brand";

type AuthMode = "login" | "activate" | "forgot" | "otp" | "reset" | "success";


const isDev = process.env.NODE_ENV === "development";

export default function LoginPage() {
  const { login, activateAccount, platformSettings } = useAuth();
  const { setLanguage, language, t } = useI18n();
  const { toast } = useToast();
  const { initError: firebaseInitError } = useFirebaseBootstrapStatus();
  const platformLogo = resolvePlatformLogoUrl(platformSettings.logo);

  const [mode, setAuthMode] = useState<AuthMode>("login");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [authData, setAuthData] = useState({
    matricule: "",
    password: "",
    confirmPassword: "",
    email: "",
    otp: "",
    newPassword: "",
    resetConfirmPassword: "",
  });

  const clearAuthData = () => {
    setAuthData({
      matricule: "",
      password: "",
      confirmPassword: "",
      email: "",
      otp: "",
      newPassword: "",
      resetConfirmPassword: "",
    });
  };

  const handleQuickLogin = async (matricule: string) => {
    if (mode !== "login" || isProcessing) return;
    setAuthError(null);
    setIsProcessing(true);
    try {
      await login(matricule, authData.password);
      toast({ title: t("welcomeBack"), description: t("connectedToLiveBackend") });
    } catch (error: any) {
      const errorMessage = getApiErrorMessage(error, t("loginFailedTryAgain"));
      toast({
        variant: "destructive",
        title: t("authFailed"),
        description: firebaseInitError ? `${firebaseInitError} ${errorMessage}` : errorMessage,
      });
      setAuthError(firebaseInitError ? `${firebaseInitError} ${errorMessage}` : errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isProcessing) return;
    setAuthError(null);
    setIsProcessing(true);

    if (mode === "login" || mode === "activate") {
      if (mode === "activate" && authData.password !== authData.confirmPassword) {
        toast({ variant: "destructive", title: t("passwordMismatch"), description: t("passwordsDoNotMatch") });
        setIsProcessing(false);
        return;
      }

      try {
        if (mode === "activate") {
          await activateAccount(authData.matricule, authData.password, authData.confirmPassword);
          toast({ title: t("accountActivated"), description: t("accountActivatedDesc") });
          switchMode("login");
        } else {
          await login(authData.matricule, authData.password);
        }
      } catch (error: any) {
        const errorMessage = getApiErrorMessage(error, t("invalidCredentials"));
        toast({
          variant: "destructive",
          title: t("authFailed"),
          description: firebaseInitError ? `${firebaseInitError} ${errorMessage}` : errorMessage,
        });
        setAuthError(firebaseInitError ? `${firebaseInitError} ${errorMessage}` : errorMessage);
      } finally {
        setIsProcessing(false);
      }
    } else if (mode === "forgot") {
      if (!authData.matricule.trim()) {
        toast({ variant: "destructive", title: "Matricule required", description: "Please enter your account matricule." });
        setIsProcessing(false);
        return;
      }
      try {
        await authService.requestPasswordReset(authData.matricule.trim());
        setAuthMode("success");
        toast({ title: "Reset email sent", description: "Check your inbox for a password reset link." });
      } catch {
        // Always show success to avoid leaking whether matricule exists
        setAuthMode("success");
        toast({ title: "Reset email sent", description: "If that matricule is registered, a reset link has been sent." });
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const switchMode = (newMode: AuthMode) => {
    if (isProcessing) return;
    clearAuthData();
    setShowPassword(false);
    setShowConfirmPassword(false);
    setAuthError(null);
    setAuthMode(newMode);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F0F2F5] p-4 sm:p-8 relative overflow-hidden">
      <div className="pointer-events-none absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-[100px]" />
      <div className="pointer-events-none absolute bottom-0 left-0 w-[500px] h-[500px] bg-secondary/10 rounded-full translate-y-1/2 -translate-x-1/2 blur-[100px]" />

      {isDev && (
        <div className="absolute top-8 left-8 z-20">
          <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-full shadow-sm">
            <Wifi className="w-4 h-4 text-green-600 animate-pulse" />
                <span className="text-xs font-bold text-green-700">{t("connectedToLiveBackend")}</span>
          </div>
        </div>
      )}

      <div className="absolute top-6 right-4 z-30 sm:top-8 sm:right-8">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="h-11 px-4 sm:px-5 gap-2 bg-white/80 backdrop-blur-xl border-primary/10 rounded-2xl shadow-sm hover:bg-white transition-all touch-manipulation"
            >
              <Languages className="w-4 h-4 text-primary" />
              <span className="font-bold text-xs uppercase tracking-widest">
                {language === "en" ? "English" : "Français"}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="rounded-xl border-none shadow-2xl p-2">
            <DropdownMenuItem
              onClick={() => setLanguage("en")}
              className="rounded-lg font-bold text-xs py-2.5"
            >
              ENGLISH (UK)
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setLanguage("fr")}
              className="rounded-lg font-bold text-xs py-2.5"
            >
              FRANÇAIS (FR)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="w-full max-w-lg flex flex-col items-center gap-10 relative z-10">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="flex h-28 w-28 items-center justify-center rounded-[2rem] bg-white p-3 shadow-2xl ring-1 ring-primary/10 transition-all hover:scale-105 active:scale-95 sm:h-32 sm:w-32">
            <img src={platformLogo} alt={`${platformSettings.name} logo`} className="h-full w-full object-contain" />
          </div>
          <div className="space-y-1">
            <h1 className="text-5xl md:text-6xl font-black text-primary font-headline tracking-tighter leading-none">
              {platformSettings.name}
            </h1>
            <p className="text-xs text-muted-foreground font-black uppercase tracking-[0.4em] opacity-40">
              {t("highFidelityAccessPortal")}
            </p>
          </div>
        </div>

        <Card className="w-full border-none shadow-[0_32px_64px_-12px_rgba(0,0,0,0.14)] overflow-hidden rounded-[3rem] bg-white/90 backdrop-blur-2xl border border-white/50 animate-in fade-in slide-in-from-bottom-4 duration-700">
          {mode === "success" ? (
            <div className="p-12 text-center space-y-8 animate-in zoom-in-95 duration-500">
              <div className="w-24 h-24 bg-green-50 text-green-600 rounded-[2rem] flex items-center justify-center mx-auto shadow-inner border border-green-100">
                <Mail className="w-12 h-12" />
              </div>
              <div className="space-y-2">
                <CardTitle className="text-3xl font-black text-primary uppercase tracking-tighter">
                  Check Your Email
                </CardTitle>
                <CardDescription className="text-sm font-medium px-4">
                  A password reset link has been sent to your email address. Click the link in the email to set a new password. The link expires in 5 minutes.
                </CardDescription>
              </div>
              <Button
                onClick={() => switchMode("login")}
                className="w-full h-16 rounded-[1.5rem] font-black uppercase tracking-widest text-sm bg-primary shadow-xl hover:bg-primary/90 transition-all active:scale-95"
              >
                {t("returnToSignIn")}
              </Button>
            </div>
          ) : (
            <>
              <CardHeader className="pb-8 pt-10 text-center space-y-2 px-10">
                <CardTitle className="text-4xl font-black text-primary uppercase tracking-tighter">
                  {mode === "login"
                    ? t("signIn")
                    : mode === "activate"
                      ? t("activateAccountTitle")
                    : t("resetPassword")}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-10">
                {firebaseInitError && (
                  <div className="mb-6 rounded-[1.5rem] border border-red-200 bg-red-50 px-5 py-4 text-left shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 rounded-full bg-red-100 p-2 text-red-600">
                        <AlertTriangle className="h-4 w-4" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-700">
                          Login setup problem
                        </p>
                        <p className="text-sm font-medium leading-relaxed text-red-900">
                          {firebaseInitError}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                <form onSubmit={handleAuth} className="space-y-6">
                  {authError && (
                    <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-left shadow-sm">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-700">
                            Login problem
                          </p>
                          <p className="mt-1 text-sm font-bold leading-relaxed text-red-900">
                            {authError}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  {mode === "forgot" && (
                    <div className="space-y-6 animate-in slide-in-from-top-2">
                      <p className="text-sm text-center text-muted-foreground">
                        Enter your matricule and we'll send a password reset link to your registered email.
                      </p>
                      <div className="space-y-3">
                        <Label className="text-[10px] uppercase font-black text-muted-foreground tracking-[0.2em] ml-1 flex items-center gap-2">
                          <Fingerprint className="w-3.5 h-3.5 text-primary/40" /> {t("matricule")}
                        </Label>
                        <Input
                          required
                          autoComplete="username"
                          type="text"
                          disabled={isProcessing}
                          className="h-14 bg-accent/30 border-none rounded-2xl focus-visible:ring-primary font-bold normal-case text-center text-lg shadow-inner transition-all focus:bg-white px-6"
                          style={{ textTransform: "none" }}
                          placeholder="e.g. STU001"
                          value={authData.matricule}
                          onChange={(e) => { setAuthError(null); setAuthData({ ...authData, matricule: e.target.value }); }}
                        />
                      </div>
                    </div>
                  )}

                  {(mode === "login" || mode === "activate") && (
                    <>
                      <div className="space-y-3">
                        <Label className="text-[10px] uppercase font-black text-muted-foreground tracking-[0.2em] ml-1 flex items-center gap-2">
                          <Fingerprint className="w-3.5 h-3.5 text-primary/40" /> {t("matricule")}
                        </Label>
                        <Input
                          required
                          autoComplete="off"
                          disabled={isProcessing}
                          className="h-14 bg-accent/30 border-none rounded-2xl focus-visible:ring-primary font-black normal-case text-center text-xl shadow-inner transition-all focus:bg-white"
                          style={{ textTransform: "none" }}
                          value={authData.matricule}
                          onChange={(e) => {
                            setAuthError(null);
                            setAuthData({ ...authData, matricule: e.target.value });
                          }}
                        />
                        <p className="px-1 text-center text-[10px] font-bold text-muted-foreground">
                          Matricule is case-sensitive. Lowercase letters stay lowercase.
                        </p>
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                          <Label className="text-[10px] uppercase font-black text-muted-foreground tracking-[0.2em] flex items-center gap-2">
                            <Lock className="w-3.5 h-3.5 text-primary/40" /> {t("password")}
                          </Label>
                          {mode === "login" && (
                            <button
                              type="button"
                              disabled={isProcessing}
                              className="text-[10px] font-black uppercase text-primary/40 hover:text-primary transition-colors tracking-widest disabled:opacity-50"
                              onClick={() => switchMode("forgot")}
                            >
                              {t("forgotPassword")}
                            </button>
                          )}
                        </div>
                        <div className="relative">
                          <Input
                            required
                            autoComplete={mode === "activate" ? "new-password" : "current-password"}
                            type={showPassword ? "text" : "password"}
                            disabled={isProcessing}
                            className="h-14 bg-accent/30 border-none rounded-2xl focus-visible:ring-primary font-bold text-center text-lg shadow-inner transition-all focus:bg-white px-12"
                            value={authData.password}
                            onChange={(e) => { setAuthError(null); setAuthData({ ...authData, password: e.target.value }); }}
                          />
                          <button
                            type="button"
                            aria-label={showPassword ? "Hide password" : "Show password"}
                            disabled={isProcessing}
                            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-primary/50 transition-colors hover:text-primary disabled:opacity-50"
                            onClick={() => setShowPassword((current) => !current)}
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    </>
                  )}

                  {mode === "activate" && (
                    <div className="space-y-3 animate-in slide-in-from-top-2">
                      <Label className="text-[10px] uppercase font-black text-muted-foreground tracking-[0.2em] ml-1 flex items-center gap-2">
                        <ShieldCheck className="w-3.5 h-3.5 text-primary/40" /> {t("confirmPasswordLabel")}
                      </Label>
                      <div className="relative">
                        <Input
                          required
                          autoComplete="new-password"
                          type={showConfirmPassword ? "text" : "password"}
                          disabled={isProcessing}
                          className="h-14 bg-accent/30 border-none rounded-2xl focus-visible:ring-primary font-bold text-center text-lg shadow-inner transition-all focus:bg-white px-12"
                          value={authData.confirmPassword}
                          onChange={(e) =>
                            setAuthData({ ...authData, confirmPassword: e.target.value })
                          }
                        />
                        <button
                          type="button"
                          aria-label={showConfirmPassword ? "Hide password confirmation" : "Show password confirmation"}
                          disabled={isProcessing}
                          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-primary/50 transition-colors hover:text-primary disabled:opacity-50"
                          onClick={() => setShowConfirmPassword((current) => !current)}
                        >
                          {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  )}

                  {mode === "otp" && (
                    <div className="space-y-6 animate-in zoom-in-95">
                      <div className="space-y-3">
                        <Label className="text-[10px] uppercase font-black text-muted-foreground tracking-[0.2em] text-center block">
                          {t("sixDigitVerificationCode")}
                        </Label>
                        <Input
                          required
                          autoComplete="one-time-code"
                          disabled={isProcessing}
                          className="h-20 bg-accent/30 border-none rounded-[2rem] focus-visible:ring-primary font-black text-4xl text-center tracking-[0.5em] shadow-inner transition-all focus:bg-white"
                          maxLength={6}
                          value={authData.otp}
                          onChange={(e) => setAuthData({ ...authData, otp: e.target.value })}
                        />
                      </div>
                      <p className="text-[10px] text-center text-muted-foreground font-black uppercase tracking-widest opacity-40">
                        {t("codeExpires")}
                      </p>
                    </div>
                  )}

                  {mode === "reset" && (
                    <div className="space-y-8 animate-in slide-in-from-bottom-2">
                      <div className="bg-green-50 p-6 rounded-3xl border border-green-100 flex flex-col items-center gap-2 text-center">
                        <div className="p-2 bg-green-100 rounded-full text-green-600 mb-1">
                          <CheckCircle2 className="w-6 h-6" />
                        </div>
                        <h4 className="text-sm font-black text-green-900 uppercase tracking-tight">
                          {t("identityVerified")}
                        </h4>
                        <p className="text-[11px] text-green-800 font-medium">
                          {t("resetIdentityDesc")}
                        </p>
                      </div>

                      <div className="space-y-6">
                        <div className="space-y-3">
                          <Label className="text-[10px] uppercase font-black text-muted-foreground tracking-[0.2em] ml-1">
                            {t("newSecurePassword")}
                          </Label>
                          <Input
                            required
                            autoComplete="new-password"
                            type="password"
                            disabled={isProcessing}
                            className="h-14 bg-accent/30 border-none rounded-2xl shadow-inner focus:bg-white px-6 font-bold text-center text-lg"
                            value={authData.newPassword}
                            onChange={(e) =>
                              setAuthData({ ...authData, newPassword: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-3">
                          <Label className="text-[10px] uppercase font-black text-muted-foreground tracking-[0.2em] ml-1">
                            {t("confirmNewPasswordLabel")}
                          </Label>
                          <Input
                            required
                            autoComplete="new-password"
                            type="password"
                            disabled={isProcessing}
                            className="h-14 bg-accent/30 border-none rounded-2xl shadow-inner focus:bg-white px-6 font-bold text-center text-lg"
                            value={authData.resetConfirmPassword}
                            onChange={(e) =>
                              setAuthData({ ...authData, resetConfirmPassword: e.target.value })
                            }
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <Button
                    type="submit"
                    disabled={isProcessing}
                    className={cn(
                      "w-full h-16 text-sm font-black uppercase tracking-widest shadow-2xl rounded-[1.5rem] transition-all active:scale-95 mt-6 gap-3",
                      mode === "login"
                        ? "bg-primary hover:bg-primary/90 text-white"
                        : "bg-secondary text-primary hover:bg-secondary/90"
                    )}
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-6 h-6 animate-spin" />
                        {mode === "login"
                          ? t("authenticating")
                          : t("processing")}
                      </>
                    ) : mode === "login" ? (
                      t("openDashboard")
                    ) : mode === "activate" ? (
                      t("activateAccountCta")
                    ) : mode === "forgot" ? (
                      t("identifyRecord")
                    ) : mode === "otp" ? (
                      t("verifySecurity")
                    ) : (
                      t("commitReset")
                    )}
                  </Button>
                </form>
              </CardContent>
              <CardFooter className="pb-10 pt-4 flex flex-col gap-3 px-10">
                {mode === "login" ? (
                  <button
                    type="button"
                    disabled={isProcessing}
                    className="w-full text-[10px] font-black uppercase tracking-widest text-primary/40 hover:text-primary transition-all h-12 flex items-center justify-center gap-2 disabled:opacity-50"
                    onClick={() => switchMode("activate")}
                  >
                    {t("dontHaveAccount")}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isProcessing}
                    className="w-full text-[10px] font-black uppercase tracking-widest text-primary/40 hover:text-primary transition-all h-12 flex items-center justify-center gap-2 disabled:opacity-50"
                    onClick={() => switchMode("login")}
                  >
                    <ArrowLeft className="w-4 h-4" /> {t("alreadyHaveAccount")}
                  </button>
                )}
              </CardFooter>
            </>
          )}
        </Card>


        <div className="mt-4 flex flex-col items-center gap-4">
          <Button
            asChild
            variant="ghost"
            className="h-auto min-h-14 w-full max-w-sm rounded-[1.5rem] border border-primary/15 bg-white/90 px-5 py-4 text-primary shadow-lg transition-all hover:bg-white hover:text-primary sm:px-8"
          >
            <Link href="/community" className="flex w-full items-center justify-center gap-3 text-center">
              <Sparkles className="h-4 w-4 shrink-0 text-secondary fill-secondary/20" />
              <span className="text-xs font-black uppercase tracking-[0.2em] leading-relaxed sm:text-[10px] sm:tracking-widest">
                {t("visitCommunityPortal")}
              </span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-50" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
