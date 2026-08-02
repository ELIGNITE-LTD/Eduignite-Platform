
"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth, type SchoolInfo } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { schoolsService } from "@/lib/api/services/schools.service";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { 
  Building2, 
  Save, 
  Loader2, 
  Image as ImageIcon, 
  MapPin, 
  Quote, 
  FileText, 
  Upload, 
  Phone, 
  Mail, 
  Hash, 
  ShieldCheck, 
  CheckCircle2, 
  User,
  Fingerprint,
  Network,
  Globe
} from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveMediaUrl } from "@/lib/media";
import { getUploadErrorMessage, validateImageFile } from "@/lib/upload-validation";

export default function SchoolSettingsPage() {
  const { user, updateSchool } = useAuth();
  const { t, language } = useI18n();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    shortName: "",
    principal: "",
    motto: "",
    description: "",
    region: "Littoral",
    division: "",
    subDivision: "",
    cityVillage: "",
    address: "",
    postalCode: "",
    phone: "",
    email: "",
    logo: "",
    banner: "",
  });

  useEffect(() => {
    if (user?.school) {
      setFormData({
        name: user.school.name || "",
        shortName: user.school.shortName || "",
        principal: user.school.principal || "",
        motto: user.school.motto || "",
        description: user.school.description || "",
        region: user.school.region || "Littoral",
        division: user.school.division || "",
        subDivision: user.school.subDivision || "",
        cityVillage: user.school.cityVillage || "",
        address: user.school.address || "",
        postalCode: user.school.postalCode || "",
        phone: user.school.phone || "",
        email: user.school.email || "",
        logo: user.school.logo || "",
        banner: user.school.banner || "",
      });
    }
  }, [user?.school]);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'banner') => {
    const file = e.target.files?.[0];
    if (!file || !user?.school?.id) return;

    const fileError = validateImageFile(file, type === "logo" ? "school logo" : "school banner", true);
    if (fileError) {
      toast({ variant: "destructive", title: "Upload blocked", description: fileError });
      if (type === "logo" && logoInputRef.current) logoInputRef.current.value = "";
      if (type === "banner" && bannerInputRef.current) bannerInputRef.current.value = "";
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setFormData((prev) => ({ ...prev, [type]: previewUrl }));

    if (type === "logo") setIsUploadingLogo(true);
    if (type === "banner") setIsUploadingBanner(true);

    try {
      const result =
        type === "logo"
          ? await schoolsService.uploadLogo(user.school.id, file)
          : await schoolsService.uploadBanner(user.school.id, file);

      const persistedUrl = resolveMediaUrl((result as any)[`${type}_url`] || (result as any)[type] || previewUrl);
      setFormData((prev) => ({ ...prev, [type]: persistedUrl }));
      await updateSchool({ [type]: persistedUrl } as Partial<SchoolInfo>);
      toast({ title: "Image Uploaded", description: `${type.charAt(0).toUpperCase() + type.slice(1)} has been saved.` });
    } catch (error: any) {
      setFormData((prev) => ({ ...prev, [type]: resolveMediaUrl(user.school?.[type]) || "" }));
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description: getUploadErrorMessage(error, type === "logo" ? "school logo" : "school banner"),
      });
    } finally {
      if (type === "logo") setIsUploadingLogo(false);
      if (type === "banner") setIsUploadingBanner(false);
      if (type === "logo" && logoInputRef.current) logoInputRef.current.value = "";
      if (type === "banner" && bannerInputRef.current) bannerInputRef.current.value = "";
    }
  };

  const handleUpdateSettings = async () => {
    if (!formData.name || !formData.shortName) {
      toast({ variant: "destructive", title: "Missing Information", description: "School name and code are required." });
      return;
    }

    setLoading(true);
    try {
      const location = `${formData.cityVillage}, ${formData.region}`;
      await updateSchool({ ...formData, location } as Partial<SchoolInfo>);
      toast({
        title: "Profile Updated",
        description: "Institutional records have been synchronized successfully.",
      });
    } catch (e) {
      toast({ variant: "destructive", title: "Save Failed", description: "Failed to update school settings." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary font-headline flex items-center gap-3">
            <div className="p-2 bg-primary rounded-xl shadow-lg">
              <Building2 className="w-6 h-6 text-secondary" />
            </div>
            Manage Institution
          </h1>
          <p className="text-muted-foreground mt-1">Configure your school's visual identity, pedagogical goals, and contact registry.</p>
        </div>
        <Button onClick={handleUpdateSettings} disabled={loading} className="h-12 px-8 shadow-xl font-black uppercase tracking-widest text-xs gap-2 rounded-2xl">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Commit Profile Changes
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">
          {/* Section 1: Core Identity */}
          <Card className="border-none shadow-sm overflow-hidden rounded-3xl">
            <CardHeader className="bg-primary/5 border-b p-6">
              <CardTitle className="flex items-center gap-2 text-primary text-lg"><FileText className="w-5 h-5" /> Institutional Identity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-2">
                  <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Official School Name</Label>
                  <Input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="bg-accent/30 border-none h-12 rounded-xl font-bold text-lg" placeholder="e.g. Example Secondary School" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Short Name / Code</Label>
                  <div className="relative">
                    <Fingerprint className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/40" />
                    <Input value={formData.shortName} onChange={(e) => setFormData({...formData, shortName: e.target.value})} className="bg-accent/30 border-none h-12 pl-10 rounded-xl font-black uppercase" placeholder="GBHSD" maxLength={8} />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Head of Institution (Principal)</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/40" />
                    <Input value={formData.principal} onChange={(e) => setFormData({...formData, principal: e.target.value})} className="bg-accent/30 border-none h-12 pl-10 rounded-xl font-bold" placeholder="e.g. Principal Fonka" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-muted-foreground flex items-center gap-2"><Quote className="w-3 h-3" /> Motto / Official Slogan</Label>
                  <Input value={formData.motto} onChange={(e) => setFormData({...formData, motto: e.target.value})} className="bg-accent/30 border-none h-12 rounded-xl italic font-serif" placeholder="e.g. Discipline - Work - Success" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-muted-foreground">About the Institution (Pedagogical Mission)</Label>
                <Textarea value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} className="bg-accent/30 border-none min-h-[150px] rounded-xl leading-relaxed" placeholder="Tell students and parents about your school's unique vision..." />
              </div>
            </CardContent>
          </Card>

          {/* Section 2: Registry & Physical Contacts */}
          <Card className="border-none shadow-sm overflow-hidden rounded-3xl">
            <CardHeader className="bg-primary/5 border-b p-6">
              <CardTitle className="flex items-center gap-2 text-primary text-lg"><MapPin className="w-5 h-5" /> Registry & Physical Location</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Region</Label>
                  <Input value={formData.region} onChange={(e) => setFormData({...formData, region: e.target.value})} className="bg-accent/30 border-none h-11 rounded-xl" placeholder="e.g. Littoral" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Division</Label>
                  <Input value={formData.division} onChange={(e) => setFormData({...formData, division: e.target.value})} className="bg-accent/30 border-none h-11 rounded-xl" placeholder="e.g. Wouri" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Sub-division</Label>
                  <Input value={formData.subDivision} onChange={(e) => setFormData({...formData, subDivision: e.target.value})} className="bg-accent/30 border-none h-11 rounded-xl" placeholder="e.g. Douala 1er" />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">City / Village</Label>
                  <Input value={formData.cityVillage} onChange={(e) => setFormData({...formData, cityVillage: e.target.value})} className="bg-accent/30 border-none h-11 rounded-xl font-bold" placeholder="e.g. Douala" />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Physical Address / Street</Label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/40" />
                    <Input value={formData.address} onChange={(e) => setFormData({...formData, address: e.target.value})} className="bg-accent/30 border-none h-11 pl-10 rounded-xl" placeholder="e.g. Rue de Deido, 123" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Official Phone</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/40" />
                    <Input value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} className="bg-accent/30 border-none h-11 pl-10 rounded-xl font-bold" placeholder="+237 6XX XX XX XX" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest ml-1">Official Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/40" />
                    <Input value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="bg-accent/30 border-none h-11 pl-10 rounded-xl" placeholder="admin@school.edu.cm" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-4 space-y-8">
          {/* Section 3: Visual Assets */}
          <Card className="border-none shadow-sm overflow-hidden rounded-3xl">
            <CardHeader className="bg-primary/5 border-b p-6">
              <CardTitle className="flex items-center gap-2 text-primary text-lg"><ImageIcon className="w-5 h-5" /> Visual Branding</CardTitle>
            </CardHeader>
            <CardContent className="space-y-8 pt-6">
              <div className="space-y-4">
                <Label className="text-[10px] font-black uppercase text-muted-foreground text-center block tracking-widest">Institutional Logo</Label>
                <div className="group relative w-32 h-32 mx-auto bg-accent/20 rounded-[2rem] border-2 border-dashed border-accent flex items-center justify-center cursor-pointer overflow-hidden transition-all hover:border-primary shadow-inner" onClick={() => !isUploadingLogo && logoInputRef.current?.click()}>
                  <input type="file" ref={logoInputRef} className="hidden" accept="image/*" onChange={(e) => handleFileChange(e, 'logo')} />
                  {formData.logo ? <img src={resolveMediaUrl(formData.logo)} alt="Logo" className="w-full h-full object-contain" /> : <Upload className="w-8 h-8 text-muted-foreground" />}
                  {isUploadingLogo && <Loader2 className="absolute w-8 h-8 animate-spin text-primary" />}
                  <div className="absolute inset-0 bg-primary/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white gap-1 backdrop-blur-sm">
                    <Upload className="w-5 h-5" />
                    <span className="text-[8px] font-black uppercase">Change Logo</span>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <Label className="text-[10px] font-black uppercase text-muted-foreground text-center block tracking-widest">Welcome Portal Banner</Label>
                <div className="group relative aspect-video bg-accent/20 rounded-2xl border-2 border-dashed border-accent flex items-center justify-center cursor-pointer overflow-hidden transition-all hover:border-primary shadow-inner" onClick={() => !isUploadingBanner && bannerInputRef.current?.click()}>
                  <input type="file" ref={bannerInputRef} className="hidden" accept="image/*" onChange={(e) => handleFileChange(e, 'banner')} />
                  {formData.banner ? <img src={resolveMediaUrl(formData.banner)} alt="Banner" className="w-full h-full object-cover" /> : <Upload className="w-10 h-10 text-muted-foreground" />}
                  {isUploadingBanner && <Loader2 className="absolute w-8 h-8 animate-spin text-primary" />}
                  <div className="absolute inset-0 bg-primary/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white gap-1 backdrop-blur-sm">
                    <Upload className="w-5 h-5" />
                    <span className="text-[8px] font-black uppercase">Change Banner</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 4: Node Integrity */}
          <Card className="border-none shadow-sm bg-gradient-to-br from-primary to-primary/90 text-white rounded-[2.5rem] overflow-hidden">
            <CardHeader className="bg-white/10 p-6 border-b border-white/5">
              <CardTitle className="text-white flex items-center gap-2 font-black uppercase tracking-widest text-xs">
                <ShieldCheck className="w-5 h-5 text-secondary" /> Management Status
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between text-[11px]"><span className="opacity-60 font-bold">Node Identity Verified</span><CheckCircle2 className="w-4 h-4 text-green-400" /></div>
                <div className="flex items-center justify-between text-[11px]"><span className="opacity-60 font-bold">Contact Registry Synced</span><CheckCircle2 className="w-4 h-4 text-green-400" /></div>
                <div className="flex items-center justify-between text-[11px]"><span className="opacity-60 font-bold">Infrastructure Security</span><CheckCircle2 className="w-4 h-4 text-green-400" /></div>
              </div>
              <div className="pt-4 border-t border-white/10 text-center">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] opacity-40 italic leading-relaxed">
                  All updates committed here reflect immediately on the institutional portal and student dashboard.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
