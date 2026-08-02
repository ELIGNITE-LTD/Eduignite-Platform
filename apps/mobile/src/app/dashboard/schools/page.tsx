
"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Building2,
  Plus,
  Search,
  MoreVertical,
  Trash2,
  Settings2,
  Loader2,
  Globe,
  Receipt,
  CheckCircle2,
  ShieldCheck,
  QrCode,
  Download,
  Printer,
  X,
  Ban,
  MapPin,
  User,
  Mail,
  Fingerprint,
  Lock,
  Archive,
  RotateCcw,
  CalendarClock
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { schoolsService } from "@/lib/api/services/schools.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import { resolvePlatformLogoUrl } from "@/lib/platform-brand";

import { useCameroonConfig, useRegionDivisions } from "@/lib/hooks/useConfig";

const REGION_OPTIONS = [
  "Adamaoua","Centre","Est","Extrême-Nord","Littoral",
  "Nord","Nord-Ouest","Ouest","Sud","Sud-Ouest",
];

const normalizeSchoolList = (payload: any) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
};

const parseDRFError = (err: any): string => {
  if (!err?.response) return err?.message || "Network error — is the backend running?";
  const s = err.response.status;
  const d = err.response.data;
  if (!d) return `HTTP ${s}`;
  if (typeof d === "string") return `${s}: ${d}`;
  if (d.detail) return `${s}: ${d.detail}`;
  if (d.non_field_errors) return `${s}: ${d.non_field_errors}`;
  if (typeof d === "object") {
    const parts = Object.entries(d)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? (v as string[]).join(", ") : String(v)}`)
      .join(" | ");
    return `${s}: ${parts}`;
  }
  return `HTTP ${s}`;
};

// API Hooks
type SchoolRegistryMode = "active" | "draft";

const getDraftDeadline = (record: any) => record?.draftDeleteAfter || record?.draft_delete_after || null;
const getDraftReason = (record: any) => record?.draftReason || record?.draft_reason || "No reason provided.";
const getDraftReminderCount = (record: any) => record?.draftReminderCount ?? record?.draft_reminder_count ?? 0;

const formatDate = (value?: string | null) => {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

const useSchools = (mode: SchoolRegistryMode) => {
  return useQuery({
    queryKey: ["schools", mode],
    queryFn: async () => {
      try {
        const result = mode === "draft" ? await schoolsService.getDraftSchools() : await schoolsService.getSchools();
        return normalizeSchoolList(result);
      } catch (err: any) {
        console.error("[Schools] GET /schools/schools/ failed:", err?.response?.status, err?.response?.data ?? err?.message);
        throw err;
      }
    },
    retry: 1,
  });
};

const useSchoolStats = () => {
  return useQuery({
    queryKey: ["school-stats"],
    queryFn: async () => {
      return schoolsService.getSchoolStats();
    },
    initialData: {} as any,
  });
};

const useCreateSchool = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (school: any) => schoolsService.createSchool(school),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schools"] });
      queryClient.invalidateQueries({ queryKey: ["school-stats"] });
    },
  });
};

const useUpdateSchool = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...school }: any) => schoolsService.updateSchool(id, school),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schools"] });
    },
  });
};

const useToggleSchoolStatus = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return schoolsService.toggleSchoolStatus(id, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schools"] });
      queryClient.invalidateQueries({ queryKey: ["school-stats"] });
    },
  });
};

export default function SchoolsManagementPage() {
  const { user, schools: authSchools, platformSettings: authPlatformSettings } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: cameroonConfig } = useCameroonConfig();
  const [schoolRegistryMode, setSchoolRegistryMode] = useState<SchoolRegistryMode>("active");
  const { data: fetchedSchools, isLoading: schoolsLoading, isError: schoolsError, error: schoolsQueryError } = useSchools(schoolRegistryMode);
  // Fall back to auth-context schools if the query hasn't resolved yet
  const schools = fetchedSchools ?? (schoolRegistryMode === "active" ? authSchools : []) ?? [];
  const { data: schoolStats = {} } = useSchoolStats();
  const createSchoolMutation = useCreateSchool();
  const toggleSchoolStatusMutation = useToggleSchoolStatus();
  const deleteSchoolMutation = useMutation({
    mutationFn: async ({ id, confirmation }: { id: string; confirmation: { matricule: string; password: string; deletion_reason: string } }) => {
      await schoolsService.deleteSchool(id, confirmation);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schools"] });
      queryClient.invalidateQueries({ queryKey: ["school-stats"] });
    },
  });
  const restoreSchoolMutation = useMutation({
    mutationFn: async (id: string) => schoolsService.restoreSchool(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schools"] });
      queryClient.invalidateQueries({ queryKey: ["school-stats"] });
    },
  });
  
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [managedSchool, setManagedSchool] = useState<any>(null);
  const [subscriptionSchool, setSubscriptionSchool] = useState<any>(null);
  const [detailSchool, setDetailSchool] = useState<any>(null);
  const [onboardingSuccess, setOnboardingSuccess] = useState<any>(null);
  const [schoolPendingDelete, setSchoolPendingDelete] = useState<any>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState({ matricule: "", password: "", deletion_reason: "" });
  
  const [newSchoolData, setNewSchoolData] = useState({
    name: "",
    shortName: "",
    principal: "",
    email: "",
    phone: "",
    motto: "Discipline - Work - Success",
    description: "New Institutional Node",
    location: "",
    school_type: "general",
    subsystem: "francophone",
    region: "",
    division: "",
    subDivision: "",
    cityVillage: "",
    address: "",
    logo: "",
    banner: ""
  });

  // Derive divisions from selected region
  const availableDivisions = cameroonConfig?.regions?.find(
    (r) => r.name === newSchoolData.region
  )?.divisions ?? [];

  const isFounderOwner = ["SUPER_ADMIN", "CEO", "CTO"].includes(user?.role || "");
  const platformSettings = {
    name: authPlatformSettings?.name || "EduIgnite",
    logo: resolvePlatformLogoUrl(authPlatformSettings?.logo),
  };

  const filteredSchools = (schools || []).filter((s: any) =>
    s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.id?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getNextStatus = (currentStatus?: string) => {
    if (currentStatus === "Active") return "Suspended";
    return "Active";
  };

  const handleSaveSchool = async () => {
    if (!newSchoolData.name || !newSchoolData.principal || !newSchoolData.shortName || !newSchoolData.email) {
      toast({ variant: "destructive", title: "Missing Information", description: "School Name, Short Name, Principal, and Email are required." });
      return;
    }

    setIsProcessing(true);
    try {
      const created = await createSchoolMutation.mutateAsync({
        id: newSchoolData.shortName.trim().toUpperCase(),
        name: newSchoolData.name.trim(),
        short_name: newSchoolData.shortName.trim().toUpperCase(),
        principal: newSchoolData.principal.trim(),
        email: newSchoolData.email.trim(),
        phone: newSchoolData.phone.trim(),
        motto: newSchoolData.motto.trim(),
        description: newSchoolData.description.trim(),
        location: newSchoolData.location.trim() || newSchoolData.cityVillage.trim(),
        school_type: newSchoolData.school_type,
        subsystem: newSchoolData.subsystem,
        region: newSchoolData.region,
        division: newSchoolData.division,
        sub_division: newSchoolData.subDivision.trim(),
        city_village: newSchoolData.cityVillage.trim(),
        address: newSchoolData.address.trim(),
        logo: newSchoolData.logo,
        banner: newSchoolData.banner,
        status: "Pending",
      });
      setIsProcessing(false);
      setIsAddModalOpen(false);
      setOnboardingSuccess(created);
      setNewSchoolData({
        name: "", shortName: "", principal: "", email: "", phone: "",
        motto: "Discipline - Work - Success", description: "New Institutional Node",
        location: "", school_type: "general", subsystem: "francophone",
        region: "", division: "", subDivision: "", cityVillage: "", address: "",
        logo: "",
        banner: ""
      });
      toast({ title: "Node Provisioned", description: "Institution successfully onboarded to the network." });
    } catch (error: any) {
      setIsProcessing(false);
      toast({ variant: "destructive", title: "Failed to create school", description: parseDRFError(error) });
    }
  };

  const requestSchoolDelete = (school: any) => {
    setSchoolPendingDelete(school);
    setDeleteConfirmation({ matricule: "", password: "", deletion_reason: "" });
  };

  const canPermanentlyDelete = ["CEO", "CTO", "SUPER_ADMIN"].includes(user?.role || "");
  const [isPurging, setIsPurging] = useState(false);
  const handlePermanentDelete = async () => {
    if (!schoolPendingDelete) return;
    if (!deleteConfirmation.matricule.trim() || !deleteConfirmation.password) {
      toast({ variant: "destructive", title: "Confirmation Required", description: "Enter your matricule and password to permanently delete." });
      return;
    }
    if (!window.confirm(`This will PERMANENTLY erase "${schoolPendingDelete.name}" and ALL its data. This cannot be undone. Continue?`)) return;
    setIsPurging(true);
    try {
      await schoolsService.permanentDeleteSchool(schoolPendingDelete.id, {
        matricule: deleteConfirmation.matricule,
        password: deleteConfirmation.password,
      });
      toast({ title: "School permanently deleted", description: `${schoolPendingDelete.name} and all its data were erased.` });
      setSchoolPendingDelete(null);
      setManagedSchool(null);
      setDeleteConfirmation({ matricule: "", password: "", deletion_reason: "" });
      queryClient.invalidateQueries({ queryKey: ["schools"] });
      queryClient.invalidateQueries({ queryKey: ["school-stats"] });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Delete Failed", description: getApiErrorMessage(error, "Could not permanently delete this school.") });
    } finally {
      setIsPurging(false);
    }
  };

  const handleConfirmSchoolDelete = async () => {
    if (!schoolPendingDelete) return;
    if (!deleteConfirmation.matricule.trim() || !deleteConfirmation.password) {
      toast({ variant: "destructive", title: "Confirmation Required", description: "Enter your matricule and password before deleting this school." });
      return;
    }
    if (!deleteConfirmation.deletion_reason.trim()) {
      toast({ variant: "destructive", title: "Deletion Reason Required", description: "Enter a clear reason. This reason will be sent to affected school users." });
      return;
    }
    try {
      await deleteSchoolMutation.mutateAsync({
        id: schoolPendingDelete.id,
        confirmation: deleteConfirmation,
      });
      toast({ title: "School Moved to Draft", description: `${schoolPendingDelete.name} is recoverable for six months.` });
      setSchoolPendingDelete(null);
      setManagedSchool(null);
      setDeleteConfirmation({ matricule: "", password: "", deletion_reason: "" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Delete Failed", description: getApiErrorMessage(error, "Could not delete this school.") });
    }
  };

  const handleRestoreSchool = async (school: any) => {
    try {
      await restoreSchoolMutation.mutateAsync(school.id);
      toast({ title: "School Restored", description: `${school.name} and its linked school users are active again.` });
      setManagedSchool(null);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Restore Failed", description: getApiErrorMessage(error, "Could not restore this school.") });
    }
  };

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary font-headline flex items-center gap-3">
            <div className="p-2 bg-primary rounded-xl shadow-lg text-white">
              <Globe className="w-6 h-6 text-secondary" />
            </div>
            Institutional Nodes
          </h1>
          <p className="text-muted-foreground mt-1">Manage and monitor institutional dashboard instances across the SaaS network.</p>
        </div>
        
        {isFounderOwner && (
          <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 shadow-xl h-14 px-8 rounded-2xl bg-primary text-white font-black uppercase tracking-widest text-xs">
                <Plus className="w-5 h-5" /> Provision New Node
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md rounded-[2.5rem] p-0 border-none shadow-2xl flex flex-col max-h-[92dvh]">
              <DialogHeader className="bg-primary p-8 text-white relative shrink-0">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-white/10 rounded-2xl">
                    <Building2 className="w-8 h-8 text-secondary" />
                  </div>
                  <div>
                    <DialogTitle className="text-2xl font-black uppercase tracking-tighter">Onboard Institution</DialogTitle>
                    <DialogDescription className="text-white/60">Initialize a new secure pedagogical node.</DialogDescription>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setIsAddModalOpen(false)} className="absolute top-4 right-4 text-white/40 hover:text-white">
                  <X className="w-6 h-6" />
                </Button>
              </DialogHeader>
              <div className="p-6 sm:p-8 space-y-6 overflow-y-auto flex-1 min-h-0">

                {/* SECTION: School Identity */}
                <div className="space-y-1 pb-1 border-b border-accent">
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-primary/40">School Identity</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Full School Name <span className="text-destructive">*</span></Label>
                  <Input value={newSchoolData.name} onChange={(e) => setNewSchoolData({...newSchoolData, name: e.target.value})} className="h-12 bg-accent/30 border-none rounded-xl font-bold" placeholder="e.g. Government Bilingual High School Deido" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Short Code <span className="text-destructive">*</span></Label>
                    <Input value={newSchoolData.shortName} onChange={(e) => setNewSchoolData({...newSchoolData, shortName: e.target.value.toUpperCase()})} className="h-12 bg-accent/30 border-none rounded-xl font-black uppercase" placeholder="e.g. GBHS" maxLength={8} />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Principal Name <span className="text-destructive">*</span></Label>
                    <Input value={newSchoolData.principal} onChange={(e) => setNewSchoolData({...newSchoolData, principal: e.target.value})} className="h-12 bg-accent/30 border-none rounded-xl font-bold" placeholder="e.g. Dr. Jean Dupont" />
                  </div>
                </div>

                {/* SECTION: System Configuration */}
                <div className="space-y-1 pb-1 border-b border-accent">
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-primary/40">System Configuration</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">School Type <span className="text-destructive">*</span></Label>
                    <Select value={newSchoolData.school_type} onValueChange={(v) => setNewSchoolData({...newSchoolData, school_type: v})}>
                      <SelectTrigger className="h-12 bg-accent/30 border-none rounded-xl font-bold"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(cameroonConfig?.school_types ?? [{ value: "general", label: "General Education" }, { value: "technical", label: "Technical & Vocational" }, { value: "mixed", label: "Mixed" }]).map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Education Subsystem <span className="text-destructive">*</span></Label>
                    <Select value={newSchoolData.subsystem} onValueChange={(v) => setNewSchoolData({...newSchoolData, subsystem: v})}>
                      <SelectTrigger className="h-12 bg-accent/30 border-none rounded-xl font-bold"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(cameroonConfig?.subsystems ?? [{ value: "francophone", label: "Francophone" }, { value: "anglophone", label: "Anglophone" }, { value: "bilingual", label: "Bilingual" }]).map((s) => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* SECTION: Location */}
                <div className="space-y-1 pb-1 border-b border-accent">
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-primary/40">Location</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Region</Label>
                    <Select value={newSchoolData.region} onValueChange={(v) => setNewSchoolData({...newSchoolData, region: v, division: ""})}>
                      <SelectTrigger className="h-12 bg-accent/30 border-none rounded-xl font-bold"><SelectValue placeholder="Select region" /></SelectTrigger>
                      <SelectContent>
                        {REGION_OPTIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Division / Département</Label>
                    <Select value={newSchoolData.division} onValueChange={(v) => setNewSchoolData({...newSchoolData, division: v})} disabled={!newSchoolData.region}>
                      <SelectTrigger className="h-12 bg-accent/30 border-none rounded-xl font-bold"><SelectValue placeholder={newSchoolData.region ? "Select division" : "Select region first"} /></SelectTrigger>
                      <SelectContent>
                        {availableDivisions.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">City / Town</Label>
                    <Input value={newSchoolData.cityVillage} onChange={(e) => setNewSchoolData({...newSchoolData, cityVillage: e.target.value})} className="h-12 bg-accent/30 border-none rounded-xl font-bold" placeholder="e.g. Douala" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Address</Label>
                    <Input value={newSchoolData.address} onChange={(e) => setNewSchoolData({...newSchoolData, address: e.target.value})} className="h-12 bg-accent/30 border-none rounded-xl font-bold" placeholder="123 Education Avenue" />
                  </div>
                </div>

                {/* SECTION: Contact */}
                <div className="space-y-1 pb-1 border-b border-accent">
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-primary/40">Contact</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Official Email <span className="text-destructive">*</span></Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/40" />
                    <Input value={newSchoolData.email} onChange={(e) => setNewSchoolData({...newSchoolData, email: e.target.value})} className="h-12 bg-accent/30 border-none rounded-xl pl-10" placeholder="admin@school.edu.cm" type="email" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Phone Number (+237)</Label>
                  <Input value={newSchoolData.phone} onChange={(e) => setNewSchoolData({...newSchoolData, phone: e.target.value})} className="h-12 bg-accent/30 border-none rounded-xl font-bold" placeholder="+237 6XX XXX XXX" />
                </div>
              </div>
              <DialogFooter className="bg-accent/20 p-4 sm:p-6 border-t border-accent shrink-0">
                <Button onClick={handleSaveSchool} className="w-full h-14 rounded-2xl shadow-lg font-black uppercase tracking-widest text-xs gap-3 bg-primary text-white hover:bg-primary/90" disabled={isProcessing}>
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Provisioning...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-5 h-5 text-secondary" />
                      <span>Provision Node & Generate ID</span>
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 items-center gap-4">
          <Search className="ml-2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search institutions by name, id or domain..." className="border-none bg-transparent focus-visible:ring-0" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-accent/40 p-1">
          <Button
            type="button"
            variant={schoolRegistryMode === "active" ? "default" : "ghost"}
            className="h-10 rounded-xl gap-2 text-[10px] font-black uppercase tracking-widest"
            onClick={() => setSchoolRegistryMode("active")}
          >
            <Building2 className="h-4 w-4" /> Active
          </Button>
          <Button
            type="button"
            variant={schoolRegistryMode === "draft" ? "default" : "ghost"}
            className="h-10 rounded-xl gap-2 text-[10px] font-black uppercase tracking-widest"
            onClick={() => setSchoolRegistryMode("draft")}
          >
            <Archive className="h-4 w-4" /> Draft
          </Button>
        </div>
      </div>

      {schoolsLoading && !schools.length && (
        <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="font-bold text-sm">Loading institutional nodes…</span>
        </div>
      )}

      {schoolsError && !schools.length && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground">
          <Building2 className="w-10 h-10 text-primary/20" />
          <p className="font-bold text-sm text-destructive">Could not load schools.</p>
          {schoolsQueryError && (
            <div className="max-w-lg w-full bg-destructive/5 border border-destructive/20 rounded-xl p-3 text-center">
              <p className="text-[11px] font-mono text-destructive break-all">
                {parseDRFError(schoolsQueryError)}
              </p>
            </div>
          )}
          <p className="text-xs">Check the browser Console for details, then refresh.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredSchools.map((school) => (
          <Card key={school.id} className="border-none shadow-xl hover:shadow-2xl transition-all duration-300 relative overflow-hidden group bg-white rounded-[2rem]">
            <div className="absolute top-0 right-0 p-4 z-10">
               <DropdownMenu>
                 <DropdownMenuTrigger asChild>
                   <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full hover:bg-accent">
                     <MoreVertical className="w-5 h-5 text-primary/40"/>
                   </Button>
                 </DropdownMenuTrigger>
                 <DropdownMenuContent align="end" className="w-56 rounded-2xl shadow-xl p-2 border-none">
                   <DropdownMenuLabel className="text-[9px] uppercase font-black opacity-40 px-3">Node Control</DropdownMenuLabel>
                   {schoolRegistryMode === "draft" ? (
                     <DropdownMenuItem className="gap-3 rounded-xl cursor-pointer" onClick={() => handleRestoreSchool(school)}>
                       <RotateCcw className="w-4 h-4 text-green-600" /> 
                       <span className="font-bold text-xs">Restore School</span>
                     </DropdownMenuItem>
                   ) : (
                     <DropdownMenuItem className="gap-3 rounded-xl cursor-pointer" onClick={() => setManagedSchool(school)}>
                       <Settings2 className="w-4 h-4 text-primary/60" /> 
                       <span className="font-bold text-xs">Configuration Suite</span>
                     </DropdownMenuItem>
                   )}
                  {isFounderOwner && (
                     <>
                       {schoolRegistryMode === "active" ? (
                         <>
                           <DropdownMenuItem className="gap-3 rounded-xl cursor-pointer" onClick={() => toggleSchoolStatusMutation.mutateAsync({ id: school.id, status: getNextStatus(school.status) })}>
                             {school.status === 'Active' ? <Ban className="w-4 h-4 text-red-500" /> : <CheckCircle2 className="w-4 h-4 text-green-500" />}
                             <span className="font-bold text-xs">{school.status === 'Active' ? 'Suspend Node' : 'Activate Node'}</span>
                           </DropdownMenuItem>
                           <DropdownMenuSeparator />
                           <DropdownMenuItem className="text-destructive gap-3 rounded-xl cursor-pointer" onClick={() => requestSchoolDelete(school)}>
                             <Archive className="w-4 h-4" /> 
                             <span className="font-bold text-xs">Move to Draft</span>
                           </DropdownMenuItem>
                         </>
                       ) : null}
                     </>
                   )}
                 </DropdownMenuContent>
               </DropdownMenu>
            </div>
            
            <CardHeader className="flex flex-row items-center gap-4 pb-6">
              <Avatar className="h-16 w-16 rounded-2xl border-2 border-primary/10 shadow-lg shrink-0">
                <AvatarImage src={school.logo} alt={school.name} className="object-contain p-2 bg-white" />
                <AvatarFallback className="bg-primary text-white font-black text-xl">{school.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="overflow-hidden">
                <CardTitle className="text-lg font-black text-primary leading-tight uppercase tracking-tighter truncate">{school.name}</CardTitle>
                <div className="flex items-center gap-2 mt-1">
                  <Badge className={cn(
                    "text-[8px] font-black uppercase border-none px-3 h-5",
                    school.status === 'Active' ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                  )}>
                    {school.status}
                  </Badge>
                  <span className="text-[10px] font-mono text-muted-foreground">{school.id}</span>
                </div>
                {school.matricule && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <Fingerprint className="w-3 h-3 text-primary/40" />
                    <span className="text-[9px] font-mono font-black text-primary/50 tracking-widest">{school.matricule}</span>
                  </div>
                )}
              </div>
            </CardHeader>

            {schoolRegistryMode === "draft" ? (
              <div className="mx-6 mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
                  <CalendarClock className="h-4 w-4" />
                  Recoverable until {formatDate(getDraftDeadline(school))}
                </div>
                <p className="mt-2 text-xs font-medium leading-relaxed">{getDraftReason(school)}</p>
                <p className="mt-2 text-[10px] font-bold uppercase text-amber-700">
                  Reminder emails sent: {getDraftReminderCount(school)} / 6
                </p>
              </div>
            ) : null}
            
            <CardContent className="py-6 border-y border-accent/50 space-y-4 bg-accent/5">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/5 rounded-lg">
                  <User className="w-4 h-4 text-primary/60" />
                </div>
                <div className="space-y-0.5">
                  <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest leading-none">Principal</p>
                  <p className="text-sm font-bold text-primary">{school.principal}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/5 rounded-lg">
                  <MapPin className="w-4 h-4 text-primary/60" />
                </div>
                <div className="space-y-0.5">
                  <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest leading-none">Location</p>
                  <p className="text-sm font-bold text-primary">{school.location}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/5 rounded-lg">
                  <Mail className="w-4 h-4 text-primary/60" />
                </div>
                <div className="space-y-0.5">
                  <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest leading-none">Official Contact</p>
                  <p className="text-sm font-bold text-secondary italic truncate max-w-[200px]">{school.email}</p>
                </div>
              </div>
            </CardContent>
            
            <CardFooter className="flex-col gap-2 pt-6 pb-6">
              {schoolRegistryMode === "active" && (school as any).subscription && (
                <div className="flex w-full items-center justify-between rounded-xl bg-accent/30 px-3 py-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Subscription
                  </span>
                  {(() => {
                    const st = (school as any).subscription.effective_state as string;
                    const styles: Record<string, string> = {
                      paid: "bg-green-100 text-green-700",
                      free: "bg-sky-100 text-sky-700",
                      unpaid: "bg-red-100 text-red-700",
                    };
                    return (
                      <Badge className={cn("border-none text-[9px] font-black uppercase", styles[st] || "bg-gray-100 text-gray-600")}>
                        {st}
                      </Badge>
                    );
                  })()}
                </div>
              )}
              <Button
                variant={schoolRegistryMode === "draft" ? "default" : "outline"}
                className="w-full h-11 rounded-xl text-[10px] font-black uppercase tracking-widest gap-2 border-primary/10 text-primary hover:bg-primary/5"
                onClick={() => schoolRegistryMode === "draft" ? handleRestoreSchool(school) : setManagedSchool(school)}
                disabled={restoreSchoolMutation.isPending}
              >
                {schoolRegistryMode === "draft" ? <RotateCcw className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                {schoolRegistryMode === "draft" ? "Restore School" : "Node Governance"}
              </Button>
              {schoolRegistryMode === "active" && isFounderOwner && (
                <div className="flex w-full gap-2">
                  <Button
                    variant="outline"
                    className="h-10 flex-1 rounded-xl text-[10px] font-black uppercase tracking-widest gap-1.5 border-primary/10 text-primary hover:bg-primary/5"
                    onClick={() => setSubscriptionSchool(school)}
                  >
                    <Settings2 className="h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button
                    variant="outline"
                    className="h-10 flex-1 rounded-xl text-[10px] font-black uppercase tracking-widest gap-1.5 border-primary/10 text-primary hover:bg-primary/5"
                    onClick={() => setDetailSchool(school)}
                  >
                    <User className="h-3.5 w-3.5" /> Details
                  </Button>
                </div>
              )}
              {canPermanentlyDelete && schoolRegistryMode === "active" ? (
                <Button
                  variant="destructive"
                  className="w-full h-11 rounded-xl text-[10px] font-black uppercase tracking-widest gap-2"
                  onClick={() => requestSchoolDelete(school)}
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Permanently
                </Button>
              ) : null}
            </CardFooter>
          </Card>
        ))}
      </div>

      {!schoolsLoading && filteredSchools.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[2rem] border border-dashed bg-white py-16 text-center shadow-sm">
          <Archive className="h-10 w-10 text-primary/30" />
          <p className="mt-4 text-sm font-black uppercase tracking-widest text-primary">
            {schoolRegistryMode === "draft" ? "No schools in Draft" : "No active schools found"}
          </p>
          <p className="mt-2 max-w-md text-xs text-muted-foreground">
            {schoolRegistryMode === "draft"
              ? "Temporarily deleted schools will appear here until they are restored or permanently removed after six months."
              : "Try another search term or provision a new institutional node."}
          </p>
        </div>
      ) : null}

      {/* SCHOOL SUBSCRIPTION (founders) */}
      {subscriptionSchool && (
        <SubscriptionDialog
          school={subscriptionSchool}
          onClose={() => setSubscriptionSchool(null)}
          onSaved={() => { setSubscriptionSchool(null); queryClient.invalidateQueries({ queryKey: ["schools"] }); }}
        />
      )}

      {/* SCHOOL DETAILS / COUNTS (founders) */}
      {detailSchool && (
        <SchoolDetailsDialog school={detailSchool} onClose={() => setDetailSchool(null)} />
      )}

      {/* NODE CONFIGURATION DIALOG */}
      <Dialog open={!!managedSchool} onOpenChange={() => setManagedSchool(null)}>
        <DialogContent className="sm:max-w-xl rounded-[2.5rem] p-0 border-none shadow-2xl flex flex-col max-h-[92dvh]">
          <DialogHeader className={cn("p-8 sm:p-10 text-white relative shrink-0", managedSchool?.status === 'Active' ? "bg-primary" : "bg-destructive/80")}>
            <div className="flex items-center gap-6">
              <Avatar className="h-20 w-20 rounded-[1.5rem] border-4 border-white/20 shadow-xl shrink-0">
                <AvatarImage src={managedSchool?.logo} className="object-contain p-2 bg-white" />
                <AvatarFallback className="bg-white text-primary font-black text-2xl">{managedSchool?.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <div>
                <DialogTitle className="text-3xl font-black uppercase tracking-tighter">{managedSchool?.name}</DialogTitle>
                <p className="opacity-70 font-mono text-sm uppercase tracking-widest mt-1">Verified Node: {managedSchool?.id}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setManagedSchool(null)} className="absolute top-4 right-4 text-white/40 hover:text-white">
              <X className="w-6 h-6" />
            </Button>
          </DialogHeader>
          <div className="p-6 sm:p-10 space-y-8 overflow-y-auto flex-1 min-h-0">
            <div className="bg-primary/5 p-6 rounded-[2rem] border border-primary/10 space-y-6">
               <h3 className="font-black text-primary uppercase text-xs tracking-[0.2em] border-b pb-2 opacity-40">Administrative Interventions</h3>
               <div className="grid grid-cols-1 gap-4">
                 {isFounderOwner ? (
                    <>
                      <Button variant="outline" className="w-full justify-between h-14 rounded-2xl font-black uppercase tracking-widest text-[10px] bg-white border-primary/10 hover:bg-primary/5 transition-all" onClick={() => { toggleSchoolStatusMutation.mutate({ id: managedSchool.id, status: getNextStatus(managedSchool?.status) }); setManagedSchool(null); }}>
                        License Authorization {managedSchool?.status === 'Active' ? <Ban className="w-5 h-5 text-red-500" /> : <CheckCircle2 className="w-5 h-5 text-green-500" />}
                      </Button>
                      <Button variant="destructive" className="w-full justify-between h-14 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg opacity-80 hover:opacity-100 transition-all" onClick={() => requestSchoolDelete(managedSchool)}>
                        Move to Draft <Archive className="w-5 h-5" />
                      </Button>
                    </>
                  ) : (
                    <div className="p-4 bg-white rounded-xl border border-primary/10 flex items-center gap-3">
                      <Lock className="w-4 h-4 text-primary/40" />
                      <p className="text-[10px] font-black uppercase text-muted-foreground">Action restricted to the founder office.</p>
                    </div>
                  )}
               </div>
            </div>
            
            <div className="flex flex-col items-center gap-4 text-center">
               <QrCode className="w-24 h-24 text-primary opacity-10" />
               <p className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.3em]">Institutional Node Certificate</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!schoolPendingDelete} onOpenChange={(open) => !open && setSchoolPendingDelete(null)}>
        <DialogContent className="sm:max-w-md rounded-[2rem]">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase text-destructive">Move School to Draft</DialogTitle>
            <DialogDescription>
              This temporarily deletes {schoolPendingDelete?.name}, disables its users, and keeps all records recoverable for six months. Confirm with your own matricule and password.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Your Matricule</Label>
              <Input
                value={deleteConfirmation.matricule}
                onChange={(event) => setDeleteConfirmation((prev) => ({ ...prev, matricule: event.target.value }))}
                placeholder="Enter your matricule exactly"
              />
            </div>
            <div className="space-y-2">
              <Label>Your Password</Label>
              <Input
                type="password"
                value={deleteConfirmation.password}
                onChange={(event) => setDeleteConfirmation((prev) => ({ ...prev, password: event.target.value }))}
                placeholder="Enter your password"
              />
            </div>
            <div className="space-y-2">
              <Label>Reason for moving to Draft</Label>
              <Input
                value={deleteConfirmation.deletion_reason}
                onChange={(event) => setDeleteConfirmation((prev) => ({ ...prev, deletion_reason: event.target.value }))}
                placeholder="Explain why this school is being decommissioned"
              />
              <p className="text-xs text-muted-foreground">This reason will appear in the notification email sent to affected school users and in the Draft registry.</p>
            </div>
          </div>
          {canPermanentlyDelete ? (
            <div className="mt-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-[11px] font-black uppercase tracking-widest text-destructive">Founder-only: Permanent deletion</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Irreversibly erases {schoolPendingDelete?.name} and <span className="font-bold">every user, class, grade, payment and record</span> from the database. This cannot be undone or recovered. Requires your matricule and password above.
              </p>
              <Button
                variant="destructive"
                className="mt-3 w-full font-black uppercase tracking-widest text-[10px]"
                onClick={handlePermanentDelete}
                disabled={isPurging}
              >
                {isPurging ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                Delete completely (erase all data)
              </Button>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSchoolPendingDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleConfirmSchoolDelete} disabled={deleteSchoolMutation.isPending}>
              {deleteSchoolMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Move to Draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* NODE ACTIVATION RECEIPT (EDUIGNITE OFFICIAL) */}
      <Dialog open={!!onboardingSuccess} onOpenChange={() => setOnboardingSuccess(null)}>
        <DialogContent className="sm:max-w-2xl p-0 border-none shadow-2xl rounded-[2.5rem] flex flex-col max-h-[92dvh]">
          <DialogHeader className="bg-primary p-8 text-white no-print relative shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-white/10 rounded-2xl text-secondary">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <div>
                  <DialogTitle className="text-2xl font-black">Provisioning Successful</DialogTitle>
                  <DialogDescription className="text-white/60">New institutional node has been activated on the network.</DialogDescription>
                </div>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setOnboardingSuccess(null)} className="absolute top-4 right-4 text-white/40 hover:text-white">
              <X className="w-6 h-6" />
            </Button>
          </DialogHeader>

          <div className="bg-muted p-6 md:p-10 print:p-0 print:bg-white overflow-y-auto flex-1 min-h-0">
            <div id="activation-receipt" className="bg-white p-8 md:p-12 border-2 border-black shadow-sm relative flex flex-col space-y-10 font-serif text-black print:border-none print:shadow-none">
               
               {/* EduIgnite Platform Header */}
               <div className="flex justify-between items-center border-b-4 border-black pb-6">
                  <div className="flex items-center gap-4">
                    <img src={platformSettings.logo} alt="EduIgnite logo" className="w-16 h-16 object-contain rounded-2xl bg-white p-1.5" />
                    <div className="space-y-0.5">
                      <h2 className="font-black text-3xl uppercase tracking-tighter text-primary">{platformSettings.name}</h2>
                      <p className="text-[10px] font-black uppercase tracking-[0.4em] opacity-40">Digital Education Infrastructure</p>
                    </div>
                  </div>
                  <div className="text-right space-y-1">
                    <Badge variant="outline" className="border-black text-black font-black uppercase text-[10px] px-4 py-1">OFFICIAL NODE TICKET</Badge>
                    <p className="text-[9px] font-bold text-muted-foreground uppercase">{new Date().toLocaleDateString()}</p>
                  </div>
               </div>

               <div className="space-y-8 text-center py-4">
                  <div className="space-y-2">
                    <h3 className="text-xl font-black uppercase tracking-tight">Institutional Node Activation</h3>
                    <p className="text-sm font-medium italic opacity-60">This official document confirms the successful registration of:</p>
                  </div>

                  <div className="p-8 bg-accent/10 border-2 border-dashed border-black/20 rounded-[2.5rem] relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-5"><Globe className="w-24 h-24" /></div>
                    <div className="flex flex-col items-center gap-4">
                      <Avatar className="h-20 w-20 rounded-2xl border-2 border-black/10 shadow-lg">
                        <AvatarImage src={onboardingSuccess?.logo} className="object-contain p-2 bg-white" />
                        <AvatarFallback className="text-2xl font-black">{onboardingSuccess?.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <h2 className="text-2xl font-black text-primary uppercase leading-tight">{onboardingSuccess?.name}</h2>
                      <div className="flex items-center gap-4 text-sm font-bold text-muted-foreground mt-1">
                        <span className="flex items-center gap-1.5"><User className="w-4 h-4" /> {onboardingSuccess?.principal}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1.5"><Mail className="w-4 h-4" /> {onboardingSuccess?.email}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-center gap-2 mt-8">
                       <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1">Activation Matricule (Principal Account Key)</p>
                       <div className="bg-primary text-secondary px-8 py-4 rounded-2xl shadow-xl">
                          <p className="text-4xl font-mono font-black tracking-tighter leading-none">{onboardingSuccess?.matricule || onboardingSuccess?.id}</p>
                       </div>
                       <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest mt-1">Share this with the principal to activate the school account</p>
                    </div>
                  </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-10 border-t border-black/10 pt-8">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                       <ShieldCheck className="w-5 h-5 text-primary" />
                       <h4 className="text-xs font-black uppercase tracking-widest">Platform Integrity Notice</h4>
                    </div>
                    <p className="text-[11px] leading-relaxed font-medium text-muted-foreground">
                      "This matricule is the unique identifier for your institutional node. It must be provided to the school administrator to activate the secure dashboard and initialize the pedagogical registry."
                    </p>
                  </div>
                  <div className="flex flex-col items-center justify-center gap-4 text-center">
                    <div className="p-2 bg-white border-2 border-black rounded-xl shadow-inner">
                      <QrCode className="w-24 h-24 text-black" />
                    </div>
                    <p className="text-[8px] font-black uppercase tracking-widest opacity-40">Encrypted Registry Node</p>
                  </div>
               </div>

               <div className="pt-8 border-t-2 border-black/5 flex justify-between items-end">
                  <div className="space-y-1">
                    <p className="text-[8px] font-black uppercase text-muted-foreground tracking-[0.2em]">Verified by</p>
                    <p className="font-black text-sm uppercase tracking-tighter">The Office of the Founders</p>
                    <img src={platformSettings.logo} alt="EduIgnite logo" className="w-6 h-6 grayscale opacity-20" />
                  </div>
                  <div className="text-center space-y-4 w-40">
                    <div className="h-12 w-full mx-auto relative flex items-center justify-center">
                       <SignatureSVG className="w-full h-full text-primary/10 p-2" />
                    </div>
                    <p className="text-[9px] font-black uppercase text-primary border-t border-black/20 pt-1">Platform Registrar</p>
                  </div>
               </div>

               <div className="text-center pt-6 border-t border-black/5">
                  <div className="flex items-center justify-center gap-3">
                    <img src={platformSettings.logo} alt="EduIgnite logo" className="w-4 h-4 object-contain opacity-20" />
                    <p className="text-[8px] font-black uppercase text-muted-foreground opacity-30 tracking-[0.4em]">
                      Verified Employment Record • Secure Registry Node • {new Date().getFullYear()}
                    </p>
                  </div>
               </div>
            </div>
          </div>

          <DialogFooter className="bg-accent/10 p-8 border-t no-print flex flex-col sm:flex-row gap-4 shrink-0">
            <Button variant="outline" className="flex-1 rounded-2xl h-14 font-black uppercase tracking-widest text-xs" onClick={() => setOnboardingSuccess(null)}>
              Return to Registry
            </Button>
            <div className="flex flex-1 gap-2">
              <Button 
                variant="secondary" 
                className="flex-1 rounded-2xl h-14 font-black uppercase tracking-widest text-xs gap-2"
                onClick={() => toast({ title: "Receipt Downloaded" })}
              >
                <Download className="w-4 h-4" /> Download PDF
              </Button>
              <Button 
                className="flex-1 rounded-2xl h-14 shadow-2xl font-black uppercase tracking-widest text-xs gap-2 bg-primary text-white" 
                onClick={() => window.print()}
              >
                <Printer className="w-4 h-4" /> Print Ticket
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SignatureSVG({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 40" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 25C15 25 20 15 25 15C30 15 35 30 40 30C45 30 50 10 55 10C60 10 65 35 70 35C75 35 80 20 85 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M15 30L85 10" stroke="currentColor" strokeWidth="1" strokeOpacity="0.3" strokeDasharray="2 2" />
    </svg>
  );
}

/**
 * Founder control of a school's yearly subscription.
 *
 * Two independent things, deliberately kept apart so neither is confused for
 * the other:
 *   1. the yearly fee — how much this school pays;
 *   2. the status — free, paid or unpaid, which decides whether accounts work.
 * Each saves on its own, so setting a fee never touches the status and changing
 * the status never asks for an amount.
 */
function SubscriptionDialog({ school, onClose, onSaved }: { school: any; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [sub, setSub] = useState<any>(school.subscription || {});
  const currency = sub.currency || "XAF";

  // Section 1 — the yearly fee.
  const [amount, setAmount] = useState(String(sub.amount || 0));
  const [savingFee, setSavingFee] = useState(false);

  // Section 2 — the status.
  const [status, setStatus] = useState<string>(sub.status || "free");
  const [freeUntil, setFreeUntil] = useState<string>(sub.free_until || "");
  const [savingStatus, setSavingStatus] = useState(false);

  async function saveFee() {
    setSavingFee(true);
    try {
      const next = await schoolsService.setSchoolSubscriptionAmount(school.id, Number(amount) || 0, currency);
      setSub(next);
      toast({ title: "Yearly fee saved", description: `${(next.amount || 0).toLocaleString()} ${next.currency} per year.` });
      onSaved();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Could not save the fee", description: e?.response?.data?.detail || "Please try again." });
    } finally {
      setSavingFee(false);
    }
  }

  async function saveStatus() {
    setSavingStatus(true);
    try {
      const next = await schoolsService.setSchoolSubscriptionStatus(school.id, {
        status,
        free_until: status === "free" ? (freeUntil || null) : null,
      });
      setSub(next);
      toast({ title: "Status updated", description: `${school.name} is now ${status}.` });
      onSaved();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Could not change status", description: e?.response?.data?.detail || "Please try again." });
    } finally {
      setSavingStatus(false);
    }
  }

  const effective = sub.effective_state || sub.status || "free";
  const stateStyle: Record<string, string> = {
    paid: "bg-green-100 text-green-700",
    free: "bg-sky-100 text-sky-700",
    unpaid: "bg-red-100 text-red-700",
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md overflow-y-auto rounded-2xl bg-background p-6 shadow-xl max-h-[92dvh]">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-black">Subscription</h2>
            <p className="text-sm text-muted-foreground">{school.name}</p>
          </div>
          <Badge className={cn("border-none text-[10px] font-black uppercase", stateStyle[effective] || "bg-gray-100 text-gray-600")}>
            {effective}
          </Badge>
        </div>

        {/* SECTION 1 — YEARLY FEE */}
        <div className="mt-5 rounded-2xl border border-input p-4">
          <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Yearly fee</p>
          <p className="mt-1 text-xs text-muted-foreground">
            How much this school pays per year to keep all its accounts active.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="flex-1" />
            <span className="text-sm font-bold text-muted-foreground">{currency} / year</span>
          </div>
          <Button className="mt-3 w-full" size="sm" disabled={savingFee} onClick={saveFee}>
            {savingFee && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save fee
          </Button>
        </div>

        {/* SECTION 2 — STATUS */}
        <div className="mt-4 rounded-2xl border border-input p-4">
          <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Status</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Paid or free keeps every account active. Unpaid deactivates them (parents excepted) until settled.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {["free", "paid", "unpaid"].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={cn(
                  "rounded-xl border px-3 py-2 text-sm font-bold capitalize",
                  status === s ? "border-primary bg-primary/5 text-primary" : "border-input"
                )}
              >
                {s}
              </button>
            ))}
          </div>

          {status === "free" && (
            <div className="mt-3">
              <label className="block text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                Free until (optional)
              </label>
              <Input type="date" value={freeUntil} onChange={(e) => setFreeUntil(e.target.value)} className="mt-1.5" />
            </div>
          )}
          {status === "paid" && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Marking paid keeps the school active for one year{sub.expires_on ? ` (currently until ${sub.expires_on})` : ""}.
            </p>
          )}

          <Button className="mt-3 w-full" size="sm" disabled={savingStatus} onClick={saveStatus}>
            {savingStatus && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save status
          </Button>
        </div>

        <Button className="mt-5 w-full" variant="outline" onClick={onClose}>Done</Button>
      </div>
    </div>
  );
}

/** Founder view of a school's headline counts. */
function SchoolDetailsDialog({ school, onClose }: { school: any; onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    schoolsService.getSchoolDetailCounts(school.id)
      .then((d) => { if (alive) setData(d); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [school.id]);

  const rows = data
    ? [
        { label: "Total users", value: data.total_users },
        { label: "Students", value: data.students },
        { label: "Parents", value: data.parents },
        { label: "Staff", value: data.staff },
        { label: "Active accounts", value: data.active_users },
      ]
    : [];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-background p-6 shadow-xl">
        <h2 className="text-lg font-black">{school.name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">School details</p>

        {loading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
        ) : !data ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Could not load details.</p>
        ) : (
          <div className="mt-5 space-y-2">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center justify-between rounded-xl bg-accent/30 px-4 py-3">
                <span className="text-sm font-semibold text-muted-foreground">{r.label}</span>
                <span className="text-lg font-black text-primary tabular-nums">{r.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}

        <Button className="mt-6 w-full" variant="outline" onClick={onClose}>Close</Button>
      </div>
    </div>
  );
}
