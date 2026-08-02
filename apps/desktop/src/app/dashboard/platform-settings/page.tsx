"use client";

import { useEffect, useRef, useState } from "react";
import { isCEOCTO, isRestrictedRole, useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { usePlatformSettings, usePlatformFees, usePublicEvents, useUpdatePlatformSettings, useCreatePublicEvent, useDeletePublicEvent, useUpdatePublicEvent } from "@/lib/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { platformService } from "@/lib/api/services/platform.service";
import { PublicSitePanel } from "@/components/dashboard/public-site-panel";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Settings2,
  Save,
  Loader2,
  Coins,
  Globe,
  Plus,
  Trash2,
  Star,
  Upload,
  Layout,
  Users,
  Building2,
  Wallet,
  Heart,
  BookOpen,
  Video,
  Image as ImageIcon,
  GraduationCap,
  Link as LinkIcon,
  PlayCircle,
  Info,
  Pencil,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { resolveMediaUrl } from "@/lib/media";
import { getUploadErrorMessage, validateImageFile } from "@/lib/upload-validation";
import {
  normalizeTutorialLinksRecord,
  type TutorialLinksRecord,
} from "@/lib/tutorial-links";

const FEE_ROLES = [
  { role: "STUDENT", label: "Student Access", icon: GraduationCap },
  { role: "TEACHER", label: "Teacher Licensing", icon: Users },
  { role: "PARENT", label: "Family Portal", icon: Heart },
  { role: "BURSAR", label: "Financial Node", icon: Wallet },
  { role: "LIBRARIAN", label: "Library Node", icon: BookOpen },
  { role: "SCHOOL_ADMIN", label: "Primary Admin", icon: Building2 },
  { role: "SUB_ADMIN", label: "Sub Admin", icon: Building2 },
] as const;

const TRAINING_ROLES = ["STUDENT", "TEACHER", "PARENT", "SCHOOL_ADMIN", "SUB_ADMIN", "BURSAR", "LIBRARIAN"] as const;

export default function PlatformSettingsPage() {
  const { user, updatePlatformSettings } = useAuth();
  const { t } = useI18n();
  const { toast } = useToast();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const eventMediaInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data: settings, isLoading: settingsLoading } = usePlatformSettings();
  const { data: feesResponse } = usePlatformFees();
  const { data: eventsResponse } = usePublicEvents();

  const updateMutation = useUpdatePlatformSettings();
  const createEventMutation = useCreatePublicEvent();
  const deleteEventMutation = useDeletePublicEvent();
  const updateEventMutation = useUpdatePublicEvent();

  const fees: any[] = (feesResponse as any)?.results ?? (Array.isArray(feesResponse) ? feesResponse : []);
  const events: any[] = (eventsResponse as any)?.results ?? (Array.isArray(eventsResponse) ? eventsResponse : []);

  const [formData, setFormData] = useState({
    platformName: "",
    platformLogo: "",
    paymentDeadline: "",
    honourRollThreshold: 0,
    maintenanceMode: false,
  });

  // Editable fee amounts keyed by role
  const [feeAmounts, setFeeAmounts] = useState<Record<string, string>>({});
  const [isSavingFees, setIsSavingFees] = useState(false);

  // Editable tutorial links keyed by role
  const [tutorialEdits, setTutorialEdits] = useState<TutorialLinksRecord>({});
  const [isSavingTutorials, setIsSavingTutorials] = useState(false);

  const [newEvent, setNewEvent] = useState({
    title: "",
    description: "",
    url: "",
    type: "video" as "video" | "image",
  });
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [selectedEventMediaFile, setSelectedEventMediaFile] = useState<File | null>(null);
  const [selectedEventMediaPreview, setSelectedEventMediaPreview] = useState("");

  const isDesigner = user?.role === "DESIGNER";
  const isExecutive = ["SUPER_ADMIN", "CEO", "CTO", "COO", "INV", "DESIGNER"].includes(user?.role || "");
  const canManagePlatformIdentity = isCEOCTO(user?.role) && !isRestrictedRole(user?.role);
  const canManageAnnualLicense = canManagePlatformIdentity;

  const parsePlatformError = (err: any) => {
    const data = err?.response?.data;
    if (!data) return err?.message || "Validation error";
    if (typeof data === "string") return data;
    if (data.detail) return data.detail;
    return Object.entries(data)
      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`)
      .join(" | ");
  };

  const isUploadedVideoSource = (value?: string | null) => !!value && value.startsWith("data:video/");
  const isDirectVideoSource = (value?: string | null) =>
    !!value && (isUploadedVideoSource(value) || /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(value));

  useEffect(() => {
    if (!settings) return;
    setFormData({
      platformName: settings.name || "",
      platformLogo: settings.logo || "",
      paymentDeadline: (settings as any).payment_deadline || "",
      honourRollThreshold: (settings as any).honour_roll_threshold || 0,
      maintenanceMode: (settings as any).maintenance_mode || false,
    });
    // Pre-fill tutorial links from settings
    setTutorialEdits(
      normalizeTutorialLinksRecord(
        (settings as any).tutorial_links || (settings as any).tutorialLinks || {},
        TRAINING_ROLES
      )
    );
  }, [settings]);

  useEffect(() => {
    if (!fees.length) return;
    const amounts: Record<string, string> = {};
    fees.forEach((f: any) => { amounts[f.role] = String(f.amount); });
    setFeeAmounts(amounts);
  }, [fees]);

  const handleSaveFees = async () => {
    if (!canManageAnnualLicense) {
      toast({ variant: "destructive", title: "Access denied", description: "Only CEO, CTO, or Super Admin can edit annual license settings." });
      return;
    }
    setIsSavingFees(true);
    try {
      const nextFees: Record<string, string> = {};
      await Promise.all(
        FEE_ROLES.map(async ({ role }) => {
          const existing = fees.find((f: any) => f.role === role);
          const amount = parseFloat(feeAmounts[role] || "0");
          if (isNaN(amount) || amount < 0) return;
          nextFees[role] = String(amount);
          if (existing) {
            await platformService.updateFee(String(existing.id), { amount, currency: existing.currency || "XAF" });
          } else {
            await platformService.createFee({ role, amount, currency: "XAF" });
          }
        })
      );
      await updatePlatformSettings({ fees: nextFees as any });
      queryClient.invalidateQueries({ queryKey: ["platform"] });
      toast({ title: "License Fees Saved", description: "Annual license structure has been updated." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: parsePlatformError(err) || "Failed to save fees." });
    } finally {
      setIsSavingFees(false);
    }
  };

  const handleSaveTutorials = async () => {
    setIsSavingTutorials(true);
    try {
      await updatePlatformSettings({ tutorialLinks: tutorialEdits as any });
      queryClient.invalidateQueries({ queryKey: ["platform", "settings"] });
      toast({ title: "Training Links Saved", description: "User training repository updated." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: parsePlatformError(err) || "Failed to save training links." });
    } finally {
      setIsSavingTutorials(false);
    }
  };

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canManagePlatformIdentity) {
      toast({ variant: "destructive", title: "Access denied", description: "Only CEO, CTO, or Super Admin can change the platform logo." });
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;

    const fileError = validateImageFile(file, "platform logo", true);
    if (fileError) {
      toast({ variant: "destructive", title: "Upload blocked", description: fileError });
      if (logoInputRef.current) logoInputRef.current.value = "";
      return;
    }

    // Show preview immediately
    const previewUrl = URL.createObjectURL(file);
    setFormData((prev) => ({ ...prev, platformLogo: previewUrl }));

    try {
      const result = await platformService.uploadLogo(file);
      setFormData((prev) => ({ ...prev, platformLogo: resolveMediaUrl(result.logo_url) }));
      await updatePlatformSettings({ logo: result.logo_url });
      window.dispatchEvent(
        new CustomEvent("eduignite:platform-logo-updated", {
          detail: { logo: result.logo_url, revision: Date.now() },
        })
      );
      queryClient.invalidateQueries({ queryKey: ["platform", "settings"] });
      toast({ title: "Logo Uploaded", description: "Platform logo has been saved." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Upload Failed", description: getUploadErrorMessage(err, "platform logo") });
      setFormData((prev) => ({ ...prev, platformLogo: formData.platformLogo }));
    } finally {
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  };

  const clearSelectedEventMedia = () => {
    if (selectedEventMediaPreview.startsWith("blob:")) {
      URL.revokeObjectURL(selectedEventMediaPreview);
    }
    setSelectedEventMediaFile(null);
    setSelectedEventMediaPreview("");
    if (eventMediaInputRef.current) {
      eventMediaInputRef.current.value = "";
    }
  };

  const handleEventMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    clearSelectedEventMedia();
    const inferredType = file.type.startsWith("image/") ? "image" : "video";
    const previewUrl = URL.createObjectURL(file);
    setSelectedEventMediaFile(file);
    setSelectedEventMediaPreview(previewUrl);
    setNewEvent((prev) => ({
      ...prev,
      type: inferredType,
    }));
    toast({
      title: "Media Ready",
      description: `${inferredType === "video" ? "Video" : "Photo"} selected from device. Save the portfolio item to upload it.`,
    });
  };

  const handleUpdateSettings = () => {
    if (!canManagePlatformIdentity) return;

    updateMutation.mutate(
      {
        name: formData.platformName,
        logo: formData.platformLogo,
        payment_deadline: formData.paymentDeadline,
        honour_roll_threshold: formData.honourRollThreshold,
        maintenance_mode: formData.maintenanceMode,
      },
      {
        onSuccess: async () => {
          await updatePlatformSettings({
            name: formData.platformName,
            logo: formData.platformLogo,
            paymentDeadline: formData.paymentDeadline,
            honourRollThreshold: formData.honourRollThreshold,
          });
          queryClient.invalidateQueries({ queryKey: ["platform", "settings"] });
          toast({
            title: "Platform Policy Updated",
            description: "All branding, financial, and training parameters have been synchronized.",
          });
        },
        onError: (error: any) => {
          toast({
            title: "Error",
            description: parsePlatformError(error) || "Failed to update settings",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handlePublishEvent = () => {
    if (!newEvent.title || (!newEvent.url && !selectedEventMediaFile)) {
      toast({ variant: "destructive", title: "Missing Information", description: "Title and either a media URL or selected device file are required." });
      return;
    }

    const payload = selectedEventMediaFile
      ? (() => {
          const formData = new FormData();
          formData.append("title", newEvent.title.trim());
          formData.append("description", newEvent.description.trim());
          formData.append("type", newEvent.type);
          formData.append("is_active", "true");
          formData.append("media", selectedEventMediaFile);
          return formData;
        })()
      : {
          title: newEvent.title.trim(),
          description: newEvent.description.trim(),
          url: newEvent.url.trim(),
          type: newEvent.type,
          is_active: true,
        };

    const callbacks = {
      onSuccess: () => {
        setNewEvent({ title: "", description: "", url: "", type: "video" });
        setEditingEventId(null);
        clearSelectedEventMedia();
        toast({
          title: "Portfolio Updated",
          description: editingEventId
            ? "Portfolio content has been updated successfully."
            : "New content added to community portal.",
        });
      },
      onError: (error: any) => {
        toast({
          title: "Error",
          description: parsePlatformError(error) || (editingEventId ? "Failed to update portfolio item." : "Failed to add event"),
          variant: "destructive",
        });
      },
    };

    if (editingEventId) {
      updateEventMutation.mutate({ id: editingEventId, data: payload }, callbacks);
      return;
    }

    createEventMutation.mutate(payload, callbacks);
  };

  const handleDeleteEvent = (eventId: string) => {
    deleteEventMutation.mutate(eventId, {
      onSuccess: () => {
        toast({ title: "Event Removed", description: "Portfolio content has been deleted." });
      },
      onError: (error: any) => {
        toast({
          title: "Error",
          description: parsePlatformError(error) || "Failed to delete event",
          variant: "destructive",
        });
      },
    });
  };

  const handleEditEvent = (event: any) => {
    setEditingEventId(event.id);
    clearSelectedEventMedia();
    setNewEvent({
      title: event.title || "",
      description: event.description || "",
      url: event.url || "",
      type: event.type === "image" ? "image" : "video",
    });
  };

  if (settingsLoading) {
    return (
      <div className="flex justify-center items-center h-40">
        <Loader2 className="w-8 h-8 animate-spin text-primary/30" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary font-headline flex items-center gap-3">
            <div className="p-2 bg-primary rounded-xl shadow-lg">
              {isDesigner ? <Star className="w-6 h-6 text-secondary" /> : <Settings2 className="w-6 h-6 text-secondary" />}
            </div>
            {isDesigner ? "Creative Portfolio Suite" : t("platformSettings")}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isDesigner
              ? "Manage public institutional highlights and marketing media."
              : "Govern global SaaS identity, revenue models, and educational content."}
          </p>
        </div>
        {canManagePlatformIdentity && (
          <Button onClick={handleUpdateSettings} disabled={updateMutation.isPending} className="h-14 px-10 shadow-2xl font-black uppercase tracking-widest text-xs gap-3 rounded-2xl bg-primary text-white hover:bg-primary/90">
            {updateMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            Commit Global Policy
          </Button>
        )}
      </div>

      <Tabs defaultValue={canManagePlatformIdentity && !isDesigner ? "branding" : "marketing"} className="w-full">
        <TabsList className={cn("grid w-full mb-10 bg-white shadow-sm border h-auto p-1.5 rounded-3xl", isDesigner ? "grid-cols-1 md:w-[300px]" : canManagePlatformIdentity ? "grid-cols-4 md:w-[900px]" : "grid-cols-2 md:w-[520px]")}>
          {!isDesigner && (
            <>
              {canManagePlatformIdentity && (
                <>
                  <TabsTrigger value="branding" className="gap-2 py-3 rounded-2xl font-bold text-xs sm:text-sm">
                    <Layout className="w-4 h-4" /> <span className="hidden sm:inline">Identity</span>
                  </TabsTrigger>
                  <TabsTrigger value="revenue" className="gap-2 py-3 rounded-2xl font-bold text-xs sm:text-sm">
                    <Coins className="w-4 h-4" /> <span className="hidden sm:inline">Revenue</span>
                  </TabsTrigger>
                </>
              )}
              <TabsTrigger value="training" className="gap-2 py-3 rounded-2xl font-bold text-xs sm:text-sm">
                <PlayCircle className="w-4 h-4" /> <span className="hidden sm:inline">Training</span>
              </TabsTrigger>
            </>
          )}
          <TabsTrigger value="marketing" className="gap-2 py-3 rounded-2xl font-bold text-xs sm:text-sm">
            <Star className="w-4 h-4" /> <span className="hidden sm:inline">Portfolio</span>
          </TabsTrigger>
        </TabsList>

        {!isDesigner && (
          <>
            {canManagePlatformIdentity && <TabsContent value="branding" className="space-y-8">
              <Card className="border-none shadow-xl overflow-hidden rounded-[2.5rem]">
                <CardHeader className="bg-primary p-10 text-white">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-white/10 rounded-2xl">
                      <Globe className="w-8 h-8 text-secondary" />
                    </div>
                    <div>
                      <CardTitle className="text-2xl font-black uppercase tracking-tighter">Strategic Branding</CardTitle>
                      <CardDescription className="text-white/60">Customize the visual identity of the SaaS platform.</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-10 space-y-10">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-10 items-start">
                    <div className="md:col-span-4 space-y-4 text-center">
                      <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground block">Platform Logo</Label>
                      <div
                        className={cn("group relative w-48 h-48 mx-auto bg-accent/20 rounded-[2.5rem] border-2 border-dashed border-accent flex items-center justify-center overflow-hidden transition-all shadow-inner", canManagePlatformIdentity ? "cursor-pointer hover:border-primary" : "cursor-default")}
                        onClick={() => canManagePlatformIdentity && logoInputRef.current?.click()}
                      >
                        <input type="file" ref={logoInputRef} className="hidden" accept="image/*" onChange={handleLogoChange} />
                        {formData.platformLogo ? (
                          <img src={resolveMediaUrl(formData.platformLogo)} alt="Logo" className="w-full h-full object-contain p-6" />
                        ) : (
                          <Upload className="w-10 h-10 text-primary/20" />
                        )}
                      </div>
                    </div>

                    <div className="md:col-span-8 space-y-8">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Platform Market Name</Label>
                        <Input
                          value={formData.platformName}
                          onChange={(e) => setFormData({ ...formData, platformName: e.target.value })}
                          placeholder="e.g. EduIgnite"
                          className="h-14 bg-accent/30 border-none rounded-2xl font-black text-2xl text-primary focus-visible:ring-primary px-6"
                          disabled={!canManagePlatformIdentity}
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Payment Deadline</Label>
                          <Input
                            type="date"
                            value={formData.paymentDeadline}
                            onChange={(e) => setFormData({ ...formData, paymentDeadline: e.target.value })}
                            className="h-12 bg-accent/30 border-none rounded-xl"
                            disabled={!canManagePlatformIdentity}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Honour Roll Threshold</Label>
                          <Input
                            type="number"
                            value={formData.honourRollThreshold}
                            onChange={(e) => setFormData({ ...formData, honourRollThreshold: Number(e.target.value) })}
                            className="h-12 bg-accent/30 border-none rounded-xl"
                            disabled={!canManagePlatformIdentity}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>}

            {canManageAnnualLicense && <TabsContent value="revenue" className="space-y-8">
              <Card className="border-none shadow-xl overflow-hidden rounded-[2.5rem]">
                <CardHeader className="bg-primary/5 border-b p-10">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <CardTitle className="text-2xl font-black text-primary flex items-center gap-3">
                        <Coins className="w-6 h-6 text-secondary" />
                        Annual License Structures
                      </CardTitle>
                      <CardDescription>Set the platform access fees for non-executive roles (XAF).</CardDescription>
                    </div>
                    {canManageAnnualLicense && (
                      <Button onClick={handleSaveFees} disabled={isSavingFees} className="h-12 px-8 font-black uppercase tracking-widest text-xs gap-2 rounded-2xl bg-primary text-white">
                        {isSavingFees ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save Fees
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-10">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {FEE_ROLES.map(({ role, label, icon: Icon }) => (
                      <div key={role} className="space-y-3 p-4 rounded-2xl bg-accent/30 border border-accent">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                          <Icon className="w-3.5 h-3.5 text-primary" />
                          {label}
                        </Label>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black text-muted-foreground shrink-0">XAF</span>
                          <Input
                            type="number"
                            min={0}
                            value={feeAmounts[role] ?? ""}
                            onChange={(e) => setFeeAmounts((prev) => ({ ...prev, [role]: e.target.value }))}
                            placeholder="0"
                            disabled={!canManageAnnualLicense}
                            className="bg-white border-none h-12 rounded-xl font-black text-primary"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>}

            <TabsContent value="training" className="space-y-8">
              <Card className="border-none shadow-xl overflow-hidden rounded-[2.5rem]">
                <CardHeader className="bg-primary p-10 text-white">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-white/10 rounded-2xl">
                        <PlayCircle className="w-8 h-8 text-secondary" />
                      </div>
                      <div>
                        <CardTitle className="text-2xl font-black uppercase tracking-tighter">User Training Repository</CardTitle>
                        <CardDescription className="text-white/60">Set separate tutorial videos for the web app and mobile app for each user role.</CardDescription>
                      </div>
                    </div>
                    {isExecutive && (
                      <Button onClick={handleSaveTutorials} disabled={isSavingTutorials} variant="secondary" className="h-12 px-8 font-black uppercase tracking-widest text-xs gap-2 rounded-2xl text-primary">
                        {isSavingTutorials ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save Links
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-10">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {TRAINING_ROLES.map((role) => (
                      <div key={role} className="space-y-3 p-4 rounded-2xl bg-accent/30 border border-accent">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                          <LinkIcon className="w-3.5 h-3.5 text-primary" />
                          {role.replace("_", " ")} Tutorials
                        </Label>
                        <div className="space-y-2">
                          <Label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground ml-1">
                            Web App
                          </Label>
                          <Input
                            value={tutorialEdits[role]?.web ?? ""}
                            onChange={(e) =>
                              setTutorialEdits((prev) => ({
                                ...prev,
                                [role]: {
                                  web: e.target.value,
                                  mobile: prev[role]?.mobile ?? "",
                                },
                              }))
                            }
                            placeholder="https://..."
                            disabled={!isExecutive}
                            className="bg-white border-none h-11 rounded-xl text-xs font-bold"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground ml-1">
                            Mobile App
                          </Label>
                          <Input
                            value={tutorialEdits[role]?.mobile ?? ""}
                            onChange={(e) =>
                              setTutorialEdits((prev) => ({
                                ...prev,
                                [role]: {
                                  web: prev[role]?.web ?? "",
                                  mobile: e.target.value,
                                },
                              }))
                            }
                            placeholder="https://..."
                            disabled={!isExecutive}
                            className="bg-white border-none h-11 rounded-xl text-xs font-bold"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
                <CardFooter className="bg-accent/10 p-6 border-t flex items-center gap-3">
                  <Info className="w-5 h-5 text-primary opacity-40" />
                  <p className="text-[10px] text-muted-foreground italic">Training links are embedded in user dashboards to guide onboarding for each role.</p>
                </CardFooter>
              </Card>
            </TabsContent>
          </>
        )}

        <TabsContent value="marketing" className="space-y-8">
          {isExecutive && <PublicSitePanel />}

          <Card className="border-none shadow-xl rounded-[2.5rem] overflow-hidden">
            <CardHeader className="bg-primary p-10 text-white">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-white/10 rounded-2xl">
                  <Star className="w-8 h-8 text-secondary" />
                </div>
                <div>
                  <CardTitle className="text-2xl font-black uppercase tracking-tighter">Public Portfolio Management</CardTitle>
                  <CardDescription className="text-white/60">Add institutional content via external URLs to the community highlights.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-10 space-y-10">
              {isExecutive && (
                <div className="p-8 bg-accent/30 rounded-[2rem] border border-accent space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                    <div className="md:col-span-4 space-y-4 flex flex-col">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Content Type</Label>
                      <Select
                        value={newEvent.type}
                        onValueChange={(value: "video" | "image") => {
                          clearSelectedEventMedia();
                          setNewEvent({ ...newEvent, type: value, url: "" });
                        }}
                      >
                        <SelectTrigger className="h-12 rounded-xl bg-white border-none">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="video">Video</SelectItem>
                          <SelectItem value="image">Image</SelectItem>
                        </SelectContent>
                      </Select>
                      <input
                        type="file"
                        ref={eventMediaInputRef}
                        className="hidden"
                        accept={newEvent.type === "video" ? "video/mp4,video/webm,video/ogg,video/quicktime" : "image/jpeg,image/png,image/gif,image/webp,image/svg+xml"}
                        onChange={handleEventMediaUpload}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => eventMediaInputRef.current?.click()}
                        className="h-12 rounded-xl border-dashed font-black uppercase tracking-widest text-[10px] gap-2"
                      >
                        <Upload className="w-4 h-4" />
                        Upload {newEvent.type === "video" ? "Video" : "Photo"} From Device
                      </Button>
                      <p className="text-[10px] text-muted-foreground">
                        {newEvent.type === "video"
                          ? "MP4, WebM, OGG, or MOV up to 12MB."
                          : "JPEG, PNG, GIF, WebP, or SVG up to 5MB."}
                      </p>
                    </div>

                    <div className="md:col-span-8 space-y-6">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Headline Title</Label>
                        <Input value={newEvent.title} onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })} placeholder="e.g. Annual Pedagogical Summit" className="h-12 border-none bg-white rounded-xl px-4 font-bold" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Short Summary</Label>
                        <Input value={newEvent.description} onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })} placeholder="Capturing the moments..." className="h-12 border-none bg-white rounded-xl px-4" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest ml-1">
                          {newEvent.type === "video" ? "Video URL or Uploaded Video" : "Image URL or Uploaded Photo"}
                        </Label>
                        <Input
                          value={newEvent.url}
                          onChange={(e) => setNewEvent({ ...newEvent, url: e.target.value })}
                          placeholder={newEvent.type === "video" ? "https://... or upload a video above" : "https://... or upload a photo above"}
                          className="h-12 border-none bg-white rounded-xl px-4"
                        />
                        {(newEvent.url || selectedEventMediaPreview) && (
                          <p className="text-[10px] text-muted-foreground">
                            {selectedEventMediaFile
                              ? `Selected device file: ${selectedEventMediaFile.name}`
                              : newEvent.url.startsWith("data:")
                              ? "This portfolio item is currently using uploaded media."
                              : "This portfolio item is currently using an external media link."}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                    <Button
                      onClick={handlePublishEvent}
                      disabled={createEventMutation.isPending || updateEventMutation.isPending}
                      className="w-full h-14 bg-primary text-white font-black uppercase tracking-widest text-xs gap-3 rounded-2xl shadow-xl"
                    >
                      {createEventMutation.isPending || updateEventMutation.isPending ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : editingEventId ? (
                        <Pencil className="w-5 h-5 text-secondary" />
                      ) : (
                        <Plus className="w-5 h-5 text-secondary" />
                      )}
                      {editingEventId ? "Update Portfolio Item" : "Add to Public Portfolio"}
                    </Button>
                    {editingEventId && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setEditingEventId(null);
                          setNewEvent({ title: "", description: "", url: "", type: "video" });
                          clearSelectedEventMedia();
                        }}
                        className="w-full h-12 rounded-2xl font-bold"
                      >
                        Cancel Editing
                      </Button>
                    )}
                  </div>
                )}

              <div className="space-y-6">
                <h3 className="text-sm font-black uppercase text-primary tracking-[0.3em] border-b pb-2 flex items-center gap-2">
                  <Layout className="w-4 h-4" /> Active Gallery Contents
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {events.map((event) => (
                    <Card key={event.id} className="border-none shadow-sm overflow-hidden bg-accent/10 flex flex-col group">
                      <div className="aspect-video relative bg-slate-900 overflow-hidden">
                        {event.type === "video" ? (
                          isDirectVideoSource(event.url) ? (
                            <video
                              src={event.url}
                              className="w-full h-full object-cover"
                              controls
                              muted
                              playsInline
                              preload="metadata"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <iframe src={event.url} className="w-full h-full pointer-events-none" title={event.title} />
                              <div className="absolute inset-0 bg-black/40 flex items-center justify-center font-bold text-white uppercase text-[10px]">
                                <Video className="w-4 h-4 mr-2" />
                                VIDEO CONTENT
                              </div>
                            </div>
                          )
                        ) : (
                          <img src={event.url} alt={event.title} className="w-full h-full object-cover" />
                        )}
                        {isExecutive && (
                          <div className="absolute top-2 right-2 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                            <Button variant="secondary" size="icon" className="h-8 w-8 rounded-full shadow-xl" onClick={() => handleEditEvent(event)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button variant="destructive" size="icon" className="h-8 w-8 rounded-full shadow-xl" onClick={() => handleDeleteEvent(event.id)} disabled={deleteEventMutation.isPending}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                      <CardHeader className="p-4">
                        <div className="flex items-center justify-between gap-4">
                          <CardTitle className="text-base font-black truncate">{event.title}</CardTitle>
                          <Badge variant="outline" className="text-[8px] font-black uppercase border-primary/10">{event.type}</Badge>
                        </div>
                        <CardDescription className="text-xs line-clamp-1">{event.description}</CardDescription>
                      </CardHeader>
                      {isExecutive && (
                        <CardFooter className="p-4 pt-0 justify-end gap-2">
                          <Button variant="ghost" size="sm" className="gap-2 text-[10px] font-black uppercase text-primary" onClick={() => handleEditEvent(event)}>
                            <Pencil className="w-3.5 h-3.5" /> Edit
                          </Button>
                          <Button variant="ghost" size="sm" className="text-destructive gap-2 text-[10px] font-black uppercase" onClick={() => handleDeleteEvent(event.id)} disabled={deleteEventMutation.isPending}>
                            <Trash2 className="w-3.5 h-3.5" /> Remove
                          </Button>
                        </CardFooter>
                      )}
                    </Card>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
