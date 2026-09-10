"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  CheckCircle2,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  Phone,
  Save,
  User as UserIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { BottomNav, BottomNavSpacer } from "@/components/bottom-nav";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usersService } from "@/lib/api/services/users.service";
import { authService } from "@/lib/api/services/auth.service";
import { getApiErrorMessage } from "@/lib/api/errors";

const ROLE_LABELS: Record<string, string> = {
  SCHOOL_ADMIN: "School Administrator",
  SUB_ADMIN: "Sub Administrator",
  TEACHER: "Teacher",
  STUDENT: "Student",
  PARENT: "Parent",
};

/**
 * Spec section 7 — Profile: avatar (view + change), name/role/school,
 * editable name/email/phone/whatsapp, matricule shown read-only as an
 * identifier (not an editable field), and a Change Password section.
 * Genuinely new screen — see users.service.ts / auth.service.ts for the
 * backend contracts (PATCH /users/me/, POST /users/upload_avatar/,
 * POST /auth/change-password/) confirmed against
 * backend/apps/users/serializers.py + backend/apps/authentication.
 */
export default function ProfilePage() {
  const { user, isLoading, isAuthenticated, logout, updateUser } = useAuth();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);

  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login/");
    }
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    if (user) {
      setName(user.name || "");
      setEmail(user.email || "");
      setPhone(user.phone || "");
      setWhatsapp(user.whatsapp || "");
    }
  }, [user]);

  // Refresh from the server once so a matricule/school/avatar set by someone
  // else (e.g. the office updating a phone number) doesn't go stale.
  useEffect(() => {
    if (isAuthenticated) {
      usersService.getMe().then(updateUser).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAvatarError(null);
    setIsUploadingAvatar(true);
    try {
      const { avatar_url } = await usersService.uploadAvatar(file);
      if (user) updateUser({ ...user, avatar: avatar_url });
    } catch (err) {
      setAvatarError(getApiErrorMessage(err, "Could not upload your photo. Please try again."));
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setProfileError("Your name cannot be empty.");
      return;
    }
    setProfileError(null);
    setProfileSaved(false);
    setIsSavingProfile(true);
    try {
      const updated = await usersService.updateProfile({
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        whatsapp: whatsapp.trim() || undefined,
      });
      updateUser(updated);
      setProfileSaved(true);
    } catch (err) {
      setProfileError(getApiErrorMessage(err, "Could not save your profile. Please try again."));
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword || !newPassword || !confirmPassword) {
      setPasswordError("Fill in all three password fields.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirmation do not match.");
      return;
    }
    setPasswordError(null);
    setPasswordSaved(false);
    setIsChangingPassword(true);
    try {
      await authService.changePassword({
        old_password: oldPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSaved(true);
    } catch (err) {
      setPasswordError(getApiErrorMessage(err, "Could not change your password. Please try again."));
    } finally {
      setIsChangingPassword(false);
    }
  };

  const roleLabel = ROLE_LABELS[user?.role || ""] || user?.role;

  return (
    <main className="min-h-screen bg-background px-6 pt-10">
      <div className="mx-auto max-w-sm space-y-6">
        <h1 className="text-2xl font-black text-primary-dark">Profile</h1>

        {/* Identity */}
        <Card>
          <CardContent className="flex flex-col items-center text-center">
            <div className="relative">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-primary/10">
                {user?.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.avatar} alt={user.name} className="h-full w-full object-cover" />
                ) : (
                  <UserIcon className="h-9 w-9 text-primary" />
                )}
                {isUploadingAvatar ? (
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/30">
                    <Loader2 className="h-5 w-5 animate-spin text-white" />
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Change profile photo"
                className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white shadow-md transition hover:bg-primary-dark"
              >
                <Camera className="h-3.5 w-3.5" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>
            {avatarError ? <p className="mt-2 text-xs text-destructive">{avatarError}</p> : null}

            <p className="mt-3 text-lg font-black text-primary-dark">{user?.name}</p>
            <p className="text-sm text-gray-500">{roleLabel}</p>
            {user?.school?.name ? <p className="mt-0.5 text-xs text-gray-400">{user.school.name}</p> : null}

            <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-gray-50 px-3 py-1.5">
              <KeyRound className="h-3 w-3 text-gray-400" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Matricule</span>
              <span className="font-mono text-xs font-bold text-primary-dark">{user?.matricule || "—"}</span>
            </div>
          </CardContent>
        </Card>

        {/* Editable contact details */}
        <Card>
          <CardHeader className="pb-0">
            <p className="text-xs font-black uppercase tracking-wide text-gray-400">Contact Details</p>
          </CardHeader>
          <CardContent className="pt-3">
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <Field label="Full name" icon={UserIcon} value={name} onChange={setName} placeholder="Your name" />
              <Field
                label="Email"
                icon={Mail}
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="you@example.com"
              />
              <Field label="Telephone" icon={Phone} value={phone} onChange={setPhone} placeholder="+237 6XX XXX XXX" />
              <Field
                label="WhatsApp number"
                icon={Phone}
                value={whatsapp}
                onChange={setWhatsapp}
                placeholder="+237 6XX XXX XXX"
              />

              {profileError ? <p className="text-sm text-destructive">{profileError}</p> : null}
              {profileSaved ? (
                <p className="flex items-center gap-1.5 text-sm font-bold text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" />
                  Profile updated
                </p>
              ) : null}

              <Button type="submit" isLoading={isSavingProfile} className="w-full">
                <Save className="h-4 w-4" />
                Save Changes
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Security */}
        <Card>
          <CardHeader className="pb-0">
            <p className="text-xs font-black uppercase tracking-wide text-gray-400">Security</p>
          </CardHeader>
          <CardContent className="pt-3">
            <form onSubmit={handleChangePassword} className="space-y-4">
              <Field
                label="Current password"
                icon={KeyRound}
                type="password"
                value={oldPassword}
                onChange={setOldPassword}
                placeholder="••••••••"
              />
              <Field
                label="New password"
                icon={KeyRound}
                type="password"
                value={newPassword}
                onChange={setNewPassword}
                placeholder="••••••••"
              />
              <Field
                label="Confirm new password"
                icon={KeyRound}
                type="password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                placeholder="••••••••"
              />

              {passwordError ? <p className="text-sm text-destructive">{passwordError}</p> : null}
              {passwordSaved ? (
                <p className="flex items-center gap-1.5 text-sm font-bold text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" />
                  Password changed
                </p>
              ) : null}

              <Button type="submit" variant="secondary" isLoading={isChangingPassword} className="w-full">
                <KeyRound className="h-4 w-4" />
                Change Password
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Sign out */}
        {showLogoutConfirm ? (
          <Card className="border border-destructive/20 p-4">
            <p className="text-sm font-bold text-primary-dark">Sign out of EduIgnite Companion?</p>
            <p className="mt-1 text-xs text-gray-500">You&rsquo;ll need your matricule and password to sign in again.</p>
            <div className="mt-3 flex gap-2">
              <Button
                variant="destructive"
                size="md"
                className="flex-1"
                onClick={() => logout().then(() => router.replace("/login/"))}
              >
                Sign Out
              </Button>
              <Button variant="outline" size="md" className="flex-1" onClick={() => setShowLogoutConfirm(false)}>
                Cancel
              </Button>
            </div>
          </Card>
        ) : (
          <Button variant="outline" className="w-full" onClick={() => setShowLogoutConfirm(true)}>
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        )}

        <BottomNavSpacer />
      </div>
      <BottomNav />
    </main>
  );
}

function Field({
  label,
  icon: Icon,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-gray-600">{label}</label>
      <div className="flex items-center gap-2 rounded-xl border border-gray-300 px-3">
        <Icon className="h-4 w-4 shrink-0 text-gray-400" />
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-12 w-full bg-transparent text-sm outline-none"
        />
      </div>
    </div>
  );
}
