"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Eye, EyeOff, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { authService } from "@/lib/api/services/auth.service";
import Link from "next/link";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();

  const token = searchParams.get("token") || "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F0F2F5] p-4">
        <Card className="w-full max-w-md border-none shadow-2xl rounded-[2.5rem] overflow-hidden">
          <CardContent className="p-12 text-center space-y-6">
            <div className="w-20 h-20 bg-red-50 rounded-[1.5rem] flex items-center justify-center mx-auto border border-red-100">
              <AlertCircle className="w-10 h-10 text-red-500" />
            </div>
            <div className="space-y-2">
              <CardTitle className="text-2xl font-black text-primary uppercase tracking-tight">
                Invalid Link
              </CardTitle>
              <CardDescription>
                This password reset link is missing or invalid. Please request a new one.
              </CardDescription>
            </div>
            <Button asChild className="w-full h-14 rounded-2xl font-black uppercase tracking-widest text-sm">
              <Link href="/login">Back to Sign In</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F0F2F5] p-4">
        <Card className="w-full max-w-md border-none shadow-2xl rounded-[2.5rem] overflow-hidden">
          <CardContent className="p-12 text-center space-y-6">
            <div className="w-20 h-20 bg-green-50 rounded-[1.5rem] flex items-center justify-center mx-auto border border-green-100">
              <CheckCircle2 className="w-10 h-10 text-green-500" />
            </div>
            <div className="space-y-2">
              <CardTitle className="text-2xl font-black text-primary uppercase tracking-tight">
                Password Updated
              </CardTitle>
              <CardDescription>
                Your password has been changed successfully. You can now sign in with your new password.
              </CardDescription>
            </div>
            <Button asChild className="w-full h-14 rounded-2xl font-black uppercase tracking-widest text-sm">
              <Link href="/login">Sign In</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || !confirmPassword) return;

    if (newPassword !== confirmPassword) {
      toast({ variant: "destructive", title: "Passwords do not match", description: "Please make sure both passwords are identical." });
      return;
    }

    if (newPassword.length < 8) {
      toast({ variant: "destructive", title: "Password too short", description: "Password must be at least 8 characters." });
      return;
    }

    setIsSubmitting(true);
    try {
      await authService.confirmPasswordReset(token, newPassword);
      setDone(true);
      toast({ title: "Password updated", description: "You can now sign in with your new password." });
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.response?.data?.error || "This reset link may have expired. Please request a new one.";
      toast({ variant: "destructive", title: "Reset failed", description: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F0F2F5] p-4">
      <div className="pointer-events-none absolute top-0 right-0 w-[400px] h-[400px] bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-[80px]" />
      <div className="pointer-events-none absolute bottom-0 left-0 w-[400px] h-[400px] bg-secondary/10 rounded-full translate-y-1/2 -translate-x-1/2 blur-[80px]" />

      <Card className="w-full max-w-md border-none shadow-[0_32px_64px_-12px_rgba(0,0,0,0.14)] rounded-[3rem] overflow-hidden bg-white/90 backdrop-blur-2xl animate-in fade-in slide-in-from-bottom-4 duration-700">
        <CardHeader className="px-10 pt-10 pb-0 text-center space-y-2">
          <div className="w-16 h-16 bg-primary/5 rounded-2xl flex items-center justify-center mx-auto mb-2">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-3xl font-black text-primary uppercase tracking-tighter">
            New Password
          </CardTitle>
          <CardDescription className="text-sm font-medium">
            Enter and confirm your new password below.
          </CardDescription>
        </CardHeader>

        <CardContent className="px-10 pt-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-3">
              <Label className="text-[10px] uppercase font-black text-muted-foreground tracking-[0.2em] ml-1">
                New Password
              </Label>
              <div className="relative">
                <Input
                  required
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  disabled={isSubmitting}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="h-14 bg-accent/30 border-none rounded-2xl focus-visible:ring-primary font-bold text-center text-lg shadow-inner pr-12"
                  placeholder="Min. 8 characters"
                />
                <button
                  type="button"
                  disabled={isSubmitting}
                  className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-primary/40 hover:text-primary transition-colors"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-[10px] uppercase font-black text-muted-foreground tracking-[0.2em] ml-1">
                Confirm New Password
              </Label>
              <div className="relative">
                <Input
                  required
                  type={showConfirm ? "text" : "password"}
                  autoComplete="new-password"
                  disabled={isSubmitting}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="h-14 bg-accent/30 border-none rounded-2xl focus-visible:ring-primary font-bold text-center text-lg shadow-inner pr-12"
                  placeholder="Repeat password"
                />
                <button
                  type="button"
                  disabled={isSubmitting}
                  className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-primary/40 hover:text-primary transition-colors"
                  onClick={() => setShowConfirm((v) => !v)}
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={isSubmitting || !newPassword || !confirmPassword}
              className="w-full h-16 rounded-[1.5rem] font-black uppercase tracking-widest text-sm bg-primary shadow-xl hover:bg-primary/90 transition-all active:scale-95"
            >
              {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Set New Password"}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="px-10 pb-10 pt-4 justify-center">
          <Link
            href="/login"
            className="text-[10px] font-black uppercase text-primary/40 hover:text-primary tracking-widest transition-colors"
          >
            Back to Sign In
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#F0F2F5]">
        <Loader2 className="w-8 h-8 animate-spin text-primary/30" />
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}
