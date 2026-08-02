"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { useFirebaseBootstrapStatus } from "@/firebase/client-provider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Languages,
  Loader2,
  Lock,
  Fingerprint,
  ShieldCheck,
  Mail,
  ArrowLeft,
  CheckCircle2,
  Wifi,
  Eye,
  EyeOff,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
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
  const [resetNotice, setResetNotice] = useState<{ isStudent: boolean; text: string } | null>(null);

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
        const res: any = await authService.requestPasswordReset(authData.matricule.trim());
        if (res?.is_student) {
          setResetNotice({ isStudent: true, text: res.detail || "As a student, you cannot reset your password online. Please see your school administrator to get a new password." });
          setAuthMode("success");
          toast({ title: "See your school admin", description: res.detail });
        } else {
          setResetNotice({ isStudent: false, text: "" });
          setAuthMode("success");
          toast({ title: "Reset email sent", description: "Check your inbox for a password reset link." });
        }
      } catch {
        // Always show success to avoid leaking whether matricule exists
        setResetNotice({ isStudent: false, text: "" });
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

  const heading =
    mode === "login"
      ? language === "en" ? "Welcome back" : "Bon retour"
      : mode === "activate"
        ? t("activateAccountTitle")
        : t("resetPassword");

  const subheading =
    mode === "login"
      ? language === "en"
        ? "Sign in to continue to your dashboard."
        : "Connectez-vous pour accéder à votre tableau de bord."
      : mode === "activate"
        ? language === "en"
          ? "Set a password to activate your account."
          : "Définissez un mot de passe pour activer votre compte."
        : language === "en"
          ? "We'll email you a secure reset link."
          : "Nous vous enverrons un lien de réinitialisation.";

  return (
    <div
      className="relative flex min-h-dvh flex-col overflow-hidden bg-background"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      {/* Brand ambient background */}
      <div className="pointer-events-none absolute -top-32 right-0 h-80 w-80 rounded-full bg-primary/[0.07] blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 -left-24 h-80 w-80 rounded-full bg-secondary/15 blur-3xl" />

      {isDev && (
        <div className="absolute left-4 top-4 z-20">
          <div className="flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-3 py-1.5 shadow-sm">
            <Wifi className="h-3.5 w-3.5 animate-pulse text-green-600" />
            <span className="text-[10px] font-bold text-green-700">{t("connectedToLiveBackend")}</span>
          </div>
        </div>
      )}

      {/* Language selector */}
      <div className="absolute right-4 top-4 z-30" style={{ marginTop: "env(safe-area-inset-top, 0px)" }}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-10 gap-2 rounded-full border border-border/60 bg-white/80 px-4 shadow-sm backdrop-blur transition-all hover:bg-white"
            >
              <Languages className="h-4 w-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-wider text-primary">
                {language === "en" ? "EN" : "FR"}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="rounded-2xl border-none p-2 shadow-2xl">
            <DropdownMenuItem onClick={() => setLanguage("en")} className="rounded-xl py-2.5 text-xs font-bold">
              ENGLISH (UK)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setLanguage("fr")} className="rounded-xl py-2.5 text-xs font-bold">
              FRANÇAIS (FR)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-14">
        {/* Brand */}
        <div className="mb-10 flex flex-col items-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-[1.6rem] bg-white p-3 shadow-xl ring-1 ring-primary/10">
            <img src={platformLogo} alt={`${platformSettings.name} logo`} className="h-full w-full object-contain" />
          </div>
          <h1 className="mt-4 text-2xl font-black tracking-tight text-primary">
            {platformSettings.name}
          </h1>
        </div>

        {mode === "success" ? (
          <div className="rounded-[2rem] bg-white p-8 text-center shadow-xl ring-1 ring-black/[0.04] animate-in zoom-in-95 duration-500">
            {resetNotice?.isStudent ? (
              <>
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl border border-amber-100 bg-amber-50 text-amber-600">
                  <ShieldCheck className="h-8 w-8" />
                </div>
                <h2 className="mt-6 text-xl font-black tracking-tight text-foreground">See your school admin</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {resetNotice.text}
                </p>
              </>
            ) : (
              <>
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl border border-green-100 bg-green-50 text-green-600">
                  <Mail className="h-8 w-8" />
                </div>
                <h2 className="mt-6 text-xl font-black tracking-tight text-foreground">Check your email</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  A password reset link has been sent to your email address. It expires in 5 minutes.
                </p>
              </>
            )}
            <Button
              onClick={() => switchMode("login")}
              className="mt-8 h-14 w-full rounded-2xl text-sm font-bold shadow-lg transition-all active:scale-[0.98]"
            >
              {t("returnToSignIn")}
            </Button>
          </div>
        ) : (
          <div className="rounded-[2rem] bg-white p-6 shadow-xl ring-1 ring-black/[0.04] animate-in fade-in slide-in-from-bottom-4 duration-500 sm:p-8">
            <div className="mb-7">
              <h2 className="text-[26px] font-black leading-tight tracking-tight text-foreground">
                {heading}
              </h2>
              <p className="mt-1 text-sm font-medium text-muted-foreground">{subheading}</p>
            </div>

            {firebaseInitError && (
              <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3.5">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-red-700">Login setup problem</p>
                    <p className="mt-1 text-[13px] font-medium leading-relaxed text-red-900">{firebaseInitError}</p>
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={handleAuth} className="space-y-5">
              {authError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3.5">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-red-700">Login problem</p>
                      <p className="mt-1 text-[13px] font-semibold leading-relaxed text-red-900">{authError}</p>
                    </div>
                  </div>
                </div>
              )}

              {mode === "forgot" && (
                <div className="space-y-2 animate-in slide-in-from-top-2">
                  <Label className="text-xs font-bold text-foreground/80">{t("matricule")}</Label>
                  <div className="relative">
                    <Fingerprint className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                    <Input
                      required
                      autoComplete="username"
                      type="text"
                      disabled={isProcessing}
                      className="h-14 rounded-2xl border-border/60 bg-muted/40 pl-11 text-base font-semibold transition-all focus:bg-white focus-visible:ring-primary"
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
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-foreground/80">{t("matricule")}</Label>
                    <div className="relative">
                      <Fingerprint className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                      <Input
                        required
                        autoComplete="off"
                        disabled={isProcessing}
                        placeholder="STU001"
                        className="h-14 rounded-2xl border-border/60 bg-muted/40 pl-11 text-base font-semibold transition-all focus:bg-white focus-visible:ring-primary"
                        style={{ textTransform: "none" }}
                        value={authData.matricule}
                        onChange={(e) => {
                          setAuthError(null);
                          setAuthData({ ...authData, matricule: e.target.value });
                        }}
                      />
                    </div>
                    <p className="pl-1 text-[11px] font-medium text-muted-foreground/80">
                      {language === "en"
                        ? "Matricule is case-sensitive."
                        : "Le matricule est sensible à la casse."}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold text-foreground/80">{t("password")}</Label>
                      {mode === "login" && (
                        <button
                          type="button"
                          disabled={isProcessing}
                          className="text-xs font-bold text-primary transition-colors hover:text-primary/80 disabled:opacity-50"
                          onClick={() => switchMode("forgot")}
                        >
                          {t("forgotPassword")}
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                      <Input
                        required
                        autoComplete={mode === "activate" ? "new-password" : "current-password"}
                        type={showPassword ? "text" : "password"}
                        disabled={isProcessing}
                        placeholder="••••••••"
                        className="h-14 rounded-2xl border-border/60 bg-muted/40 pl-11 pr-12 text-base font-semibold transition-all focus:bg-white focus-visible:ring-primary"
                        value={authData.password}
                        onChange={(e) => { setAuthError(null); setAuthData({ ...authData, password: e.target.value }); }}
                      />
                      <button
                        type="button"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        disabled={isProcessing}
                        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted-foreground/70 transition-colors hover:text-primary disabled:opacity-50"
                        onClick={() => setShowPassword((current) => !current)}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {mode === "activate" && (
                <div className="space-y-2 animate-in slide-in-from-top-2">
                  <Label className="text-xs font-bold text-foreground/80">{t("confirmPasswordLabel")}</Label>
                  <div className="relative">
                    <ShieldCheck className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                    <Input
                      required
                      autoComplete="new-password"
                      type={showConfirmPassword ? "text" : "password"}
                      disabled={isProcessing}
                      placeholder="••••••••"
                      className="h-14 rounded-2xl border-border/60 bg-muted/40 pl-11 pr-12 text-base font-semibold transition-all focus:bg-white focus-visible:ring-primary"
                      value={authData.confirmPassword}
                      onChange={(e) =>
                        setAuthData({ ...authData, confirmPassword: e.target.value })
                      }
                    />
                    <button
                      type="button"
                      aria-label={showConfirmPassword ? "Hide password confirmation" : "Show password confirmation"}
                      disabled={isProcessing}
                      className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted-foreground/70 transition-colors hover:text-primary disabled:opacity-50"
                      onClick={() => setShowConfirmPassword((current) => !current)}
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              )}

              {mode === "otp" && (
                <div className="space-y-4 animate-in zoom-in-95">
                  <div className="space-y-2">
                    <Label className="block text-center text-xs font-bold text-foreground/80">
                      {t("sixDigitVerificationCode")}
                    </Label>
                    <Input
                      required
                      autoComplete="one-time-code"
                      disabled={isProcessing}
                      className="h-16 rounded-2xl border-border/60 bg-muted/40 text-center text-3xl font-black tracking-[0.4em] transition-all focus:bg-white focus-visible:ring-primary"
                      maxLength={6}
                      value={authData.otp}
                      onChange={(e) => setAuthData({ ...authData, otp: e.target.value })}
                    />
                  </div>
                  <p className="text-center text-[11px] font-semibold text-muted-foreground/70">
                    {t("codeExpires")}
                  </p>
                </div>
              )}

              {mode === "reset" && (
                <div className="space-y-5 animate-in slide-in-from-bottom-2">
                  <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-green-100 bg-green-50 p-5 text-center">
                    <div className="mb-1 rounded-full bg-green-100 p-2 text-green-600">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                    <h4 className="text-sm font-black text-green-900">{t("identityVerified")}</h4>
                    <p className="text-[11px] font-medium text-green-800">{t("resetIdentityDesc")}</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-foreground/80">{t("newSecurePassword")}</Label>
                    <Input
                      required
                      autoComplete="new-password"
                      type="password"
                      disabled={isProcessing}
                      className="h-14 rounded-2xl border-border/60 bg-muted/40 px-5 text-base font-semibold transition-all focus:bg-white focus-visible:ring-primary"
                      value={authData.newPassword}
                      onChange={(e) =>
                        setAuthData({ ...authData, newPassword: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-foreground/80">{t("confirmNewPasswordLabel")}</Label>
                    <Input
                      required
                      autoComplete="new-password"
                      type="password"
                      disabled={isProcessing}
                      className="h-14 rounded-2xl border-border/60 bg-muted/40 px-5 text-base font-semibold transition-all focus:bg-white focus-visible:ring-primary"
                      value={authData.resetConfirmPassword}
                      onChange={(e) =>
                        setAuthData({ ...authData, resetConfirmPassword: e.target.value })
                      }
                    />
                  </div>
                </div>
              )}

              <Button
                type="submit"
                disabled={isProcessing}
                className={cn(
                  "mt-2 h-14 w-full gap-2 rounded-2xl text-sm font-bold shadow-lg shadow-primary/20 transition-all active:scale-[0.98]",
                  mode === "login"
                    ? "bg-primary text-white hover:bg-primary/90"
                    : "bg-secondary text-primary hover:bg-secondary/90"
                )}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    {mode === "login" ? t("authenticating") : t("processing")}
                  </>
                ) : (
                  <>
                    {mode === "login"
                      ? t("openDashboard")
                      : mode === "activate"
                        ? t("activateAccountCta")
                        : mode === "forgot"
                          ? t("identifyRecord")
                          : mode === "otp"
                            ? t("verifySecurity")
                            : t("commitReset")}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </form>

            <div className="mt-6 border-t border-border/50 pt-5">
              {mode === "login" ? (
                <button
                  type="button"
                  disabled={isProcessing}
                  className="flex w-full items-center justify-center gap-1.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-primary disabled:opacity-50"
                  onClick={() => switchMode("activate")}
                >
                  {t("dontHaveAccount")}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isProcessing}
                  className="flex w-full items-center justify-center gap-1.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-primary disabled:opacity-50"
                  onClick={() => switchMode("login")}
                >
                  <ArrowLeft className="h-4 w-4" /> {t("alreadyHaveAccount")}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
