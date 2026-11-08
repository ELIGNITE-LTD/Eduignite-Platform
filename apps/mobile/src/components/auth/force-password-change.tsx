"use client";

import { useState } from "react";
import { KeyRound, Loader2, LogOut } from "lucide-react";

import { authService } from "@/lib/api/services/auth.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Shown instead of the dashboard after a principal has reset the user's
 * password: the temporary password got them in, and now they choose their
 * own. The server clears the requirement when the password changes.
 *
 * This file is identical in the website, mobile and desktop apps.
 */
export function ForcePasswordChange() {
  const { logout } = useAuth();
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (form.next !== form.confirm) {
      setError("The two new passwords do not match.");
      return;
    }
    setSaving(true);
    try {
      await authService.changePassword({ old_password: form.current, new_password: form.next, confirm_password: form.confirm });
      // Reload so the session is fetched again, now without the requirement.
      window.location.reload();
    } catch (err) {
      setError(getApiErrorMessage(err, "Your password could not be changed. Please try again."));
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-accent/10 p-4">
      <Card className="w-full max-w-md overflow-hidden rounded-[2rem] border-none shadow-2xl">
        <CardHeader className="bg-primary p-6 text-center text-white sm:p-8">
          <div className="mb-4 flex justify-center">
            <div className="rounded-full bg-white/10 p-4">
              <KeyRound className="h-10 w-10 text-secondary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-black">Choose your own password</CardTitle>
          <CardDescription className="text-white/70">
            Your password was set for you. Enter the temporary password you were given, then choose a new one only you know.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 sm:p-8">
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fpc-current">Temporary password</Label>
              <Input id="fpc-current" type="password" autoComplete="current-password" required value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fpc-next">New password</Label>
              <Input id="fpc-next" type="password" autoComplete="new-password" required value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fpc-confirm">Confirm new password</Label>
              <Input id="fpc-confirm" type="password" autoComplete="new-password" required value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
            </div>
            {error ? <p className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p> : null}
            <Button type="submit" disabled={saving} className="h-12 w-full rounded-2xl font-black">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save my new password
            </Button>
            <Button type="button" variant="ghost" className="w-full gap-2" onClick={() => logout()}>
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
