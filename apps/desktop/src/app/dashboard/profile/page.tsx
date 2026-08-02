"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { User, Camera, Lock, Save, Loader2, Mail, Smartphone, MessageCircle } from "lucide-react";
import { usersService } from "@/lib/api/services/users.service";
import { authService } from "@/lib/api/services/auth.service";
import { resolveMediaUrl } from "@/lib/media";
import { getUploadErrorMessage, validateImageFile } from "@/lib/upload-validation";

export default function ProfilePage() {
  const { user: authUser, updateUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch fresh user data
  const { data: user, isLoading } = useQuery({
    queryKey: ["profile-me"],
    queryFn: () => usersService.getMe(),
    retry: 2,
  });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [avatarPreview, setAvatarPreview] = useState("");
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const [passwords, setPasswords] = useState({ current: "", new: "", confirm: "" });

  // Sync state once user data loads
  useEffect(() => {
    if (user) {
      setName((user as any).name || "");
      setEmail((user as any).email || "");
      setPhone((user as any).phone || "");
      setWhatsapp((user as any).whatsapp || "");
      setAvatarPreview(resolveMediaUrl((user as any).avatar) || "");
    }
  }, [user]);

  // Update profile mutation
  const updateMutation = useMutation({
    mutationFn: (data: { name?: string; phone?: string; whatsapp?: string; avatar?: string; email?: string }) =>
      usersService.updateProfile(data as any),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["profile-me"] });
      // Sync auth context so avatar/name appears everywhere
      updateUser({
        name: (updated as any).name,
        email: (updated as any).email,
        avatar: (updated as any).avatar,
        phone: (updated as any).phone,
        whatsapp: (updated as any).whatsapp,
      } as any);
      toast({ title: "Changes Saved", description: "Your profile has been updated successfully." });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.email?.[0] || err?.response?.data?.detail || "Failed to update profile.";
      toast({ variant: "destructive", title: "Error", description: msg });
    },
  });

  // Change password mutation
  const passwordMutation = useMutation({
    mutationFn: ({ current, newPw, confirm }: { current: string; newPw: string; confirm: string }) =>
      authService.changePassword({ old_password: current, new_password: newPw, confirm_password: confirm }),
    onSuccess: () => {
      setPasswords({ current: "", new: "", confirm: "" });
      toast({ title: "Password Updated", description: "Your password has been changed successfully." });
    },
    onError: () => toast({ variant: "destructive", title: "Error", description: "Failed to update password. Check your current password." }),
  });

  const handleUpdateProfile = () => {
    if (!name.trim()) {
      toast({ variant: "destructive", title: "Name is required." });
      return;
    }
    updateMutation.mutate({ name, phone, whatsapp, email });
  };

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileError = validateImageFile(file, "profile image");
    if (fileError) {
      toast({ variant: "destructive", title: "Upload blocked", description: fileError });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // Show preview immediately
    const previewUrl = URL.createObjectURL(file);
    setAvatarPreview(previewUrl);

    setIsUploadingAvatar(true);
    try {
      const result = await usersService.uploadAvatar(file);
      setAvatarPreview(resolveMediaUrl(result.avatar_url));
      queryClient.invalidateQueries({ queryKey: ["profile-me"] });
      // Sync auth context
      await updateUser({ avatar: result.avatar_url } as any);
      toast({ title: "Photo Updated", description: "Your profile picture has been saved." });
    } catch (err: any) {
      setAvatarPreview(resolveMediaUrl((user as any)?.avatar) || "");
      toast({ variant: "destructive", title: "Upload Failed", description: getUploadErrorMessage(err, "profile image") });
    } finally {
      setIsUploadingAvatar(false);
      // Reset input so same file can be selected again
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleUpdatePassword = () => {
    if (!passwords.current || !passwords.new || !passwords.confirm) {
      toast({ variant: "destructive", title: "Please fill in all password fields." });
      return;
    }
    if (passwords.new !== passwords.confirm) {
      toast({ variant: "destructive", title: "New passwords do not match." });
      return;
    }
    passwordMutation.mutate({ current: passwords.current, newPw: passwords.new, confirm: passwords.confirm });
  };

  const displayUser = user ?? authUser;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-primary font-headline">Profile</h1>
        <p className="text-muted-foreground mt-1">Manage your personal information and credentials</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Identity card */}
        <Card className="md:col-span-1 border-none shadow-sm h-fit bg-white">
          <CardHeader className="text-center">
            <CardTitle className="text-lg">Identity Preview</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center space-y-6">
            <div className="relative group">
              <Avatar className="h-40 w-40 border-4 border-white shadow-2xl ring-1 ring-primary/5">
                <AvatarImage src={resolveMediaUrl(avatarPreview || (displayUser as any)?.avatar) || ""} />
                <AvatarFallback className="bg-primary/5 text-primary text-4xl font-black">
                  {((displayUser as any)?.name || "?").charAt(0)}
                </AvatarFallback>
              </Avatar>
              <Button
                size="icon"
                className="absolute bottom-2 right-2 rounded-2xl shadow-xl border-2 border-white bg-primary text-white hover:bg-primary/90"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingAvatar}
                title="Upload photo from device"
              >
                {isUploadingAvatar ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
              </Button>
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={handleAvatarFileChange}
              />
            </div>
            <div className="text-center space-y-1">
              <p className="font-black text-xl text-primary uppercase tracking-tight leading-none">
                {(displayUser as any)?.name || "—"}
              </p>
              <Badge variant="secondary" className="bg-secondary/20 text-primary border-none text-[10px] font-black uppercase tracking-widest">
                {(displayUser as any)?.role || "USER"}
              </Badge>
              {(displayUser as any)?.id && (
                <p className="text-xs text-muted-foreground mt-2 font-mono">{(displayUser as any).id}</p>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground text-center px-2">
              Click the camera icon to upload a photo from your device (JPEG, PNG, WebP, GIF - max 6MB)
            </p>
          </CardContent>
        </Card>

        <div className="md:col-span-2 space-y-6">
          {/* Personal info */}
          <Card className="border-none shadow-sm bg-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl font-black text-primary uppercase tracking-tight">
                <User className="w-5 h-5 text-secondary" />
                Personal Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-primary/30" />
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Full Name</Label>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="h-12 bg-accent/30 border-none rounded-xl focus-visible:ring-primary font-bold"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1 flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5" /> Email Address
                    </Label>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-12 bg-accent/30 border-none rounded-xl focus-visible:ring-primary font-bold"
                      placeholder="your@email.com"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1 flex items-center gap-2">
                        <Smartphone className="w-3.5 h-3.5" /> Contact Phone
                      </Label>
                      <Input
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+237 6XX XX XX XX"
                        className="h-12 bg-accent/30 border-none rounded-xl focus-visible:ring-primary font-bold"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1 flex items-center gap-2">
                        <MessageCircle className="w-3.5 h-3.5" /> WhatsApp Contact
                      </Label>
                      <Input
                        value={whatsapp}
                        onChange={(e) => setWhatsapp(e.target.value)}
                        placeholder="+237 6XX XX XX XX"
                        className="h-12 bg-accent/30 border-none rounded-xl focus-visible:ring-primary font-bold text-secondary"
                      />
                    </div>
                  </div>
                </>
              )}
            </CardContent>
            <CardFooter className="border-t bg-accent/5 pt-6">
              <Button
                onClick={handleUpdateProfile}
                disabled={updateMutation.isPending || isLoading}
                className="gap-2 ml-auto h-12 px-8 rounded-xl shadow-lg font-bold"
              >
                {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Update Profile
              </Button>
            </CardFooter>
          </Card>

          {/* Change password */}
          <Card className="border-none shadow-sm bg-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl font-black text-primary uppercase tracking-tight">
                <Lock className="w-5 h-5 text-secondary" />
                Change Password
              </CardTitle>
              <CardDescription className="text-xs font-medium">
                Use a long, random password to keep your account secure.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Current Password</Label>
                <Input
                  type="password"
                  value={passwords.current}
                  onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                  className="h-12 bg-accent/30 border-none rounded-xl focus-visible:ring-primary"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">New Password</Label>
                  <Input
                    type="password"
                    value={passwords.new}
                    onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                    className="h-12 bg-accent/30 border-none rounded-xl focus-visible:ring-primary"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Confirm New Password</Label>
                  <Input
                    type="password"
                    value={passwords.confirm}
                    onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                    className="h-12 bg-accent/30 border-none rounded-xl focus-visible:ring-primary"
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter className="border-t bg-accent/5 pt-6">
              <Button
                onClick={handleUpdatePassword}
                disabled={passwordMutation.isPending || !passwords.new}
                className="gap-2 ml-auto h-12 px-8 rounded-xl shadow-lg font-bold"
              >
                {passwordMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                Update Password
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
