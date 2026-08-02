"use client";

import { useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  useExecutives,
  useFounders,
  useCreateFounder,
  useUpdateFounder,
  useAddFounderShares,
  useDeleteFounder,
  useRenewFounderShares,
  useRemoveShareAdjustment,
} from "@/lib/hooks/useUsers";
import { useSchoolStats } from "@/lib/hooks/useSchools";
import type { FounderProfile, FounderAccessLevel } from "@/lib/api/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CheckCircle2,
  Crown,
  Eye,
  GraduationCap,
  History,
  Loader2,
  Lock,
  Mail,
  Pencil,
  PieChart,
  Plus,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Timer,
  Trash2,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getApiErrorMessage } from "@/lib/api/errors";

const EXECUTIVE_ORDER = ["CEO", "CTO", "SUPER_ADMIN", "COO", "INV", "DESIGNER"];
const FOUNDER_ROLE_OPTIONS = [
  { value: "COO", label: "COO" },
  { value: "INV", label: "Investor" },
  { value: "DESIGNER", label: "Designer" },
  { value: "SUPER_ADMIN", label: "Super Admin" },
] as const;

type FounderFormState = {
  name: string;
  email: string;
  phone: string;
  whatsapp: string;
  role: string;
  founderTitle: string;
  primarySharePercentage: string;
  primaryShareUnits: string;
  hasRenewableShares: boolean;
  shareRenewalPeriodDays: string;
  accessLevel: FounderAccessLevel;
};

type ShareFormState = {
  percentage: string;
  units: string;
  note: string;
  durationDays: string;
};

type ExecutiveRecord = {
  id: string;
  name: string;
  role: string;
  relationship: string;
  isFounder: boolean;
};

const EMPTY_FORM: FounderFormState = {
  name: "",
  email: "",
  phone: "",
  whatsapp: "",
  role: "COO",
  founderTitle: "",
  primarySharePercentage: "",
  primaryShareUnits: "",
  hasRenewableShares: false,
  shareRenewalPeriodDays: "365",
  accessLevel: "FULL",
};

const EMPTY_SHARE_FORM: ShareFormState = {
  percentage: "",
  units: "",
  note: "",
  durationDays: "365",
};

const mapExecutiveRecord = (executive: any): ExecutiveRecord => {
  const role = executive.role || "";
  const isFounder = ["CEO", "CTO"].includes(role);

  return {
    id: executive.id,
    name: executive.name || "",
    role,
    relationship:
      role === "CEO"
        ? "Primary co-founder with protected governance authority, 40% base shares, and full platform oversight."
        : role === "CTO"
          ? "Primary co-founder with protected governance authority, 27% base shares, and full technical oversight."
          : role === "SUPER_ADMIN"
            ? "Executive operator supporting the founder board across platform administration."
            : role === "COO"
              ? "Operational executive collaborating with the founder board on execution."
              : role === "INV"
                ? "Strategic founder-board stakeholder with investment visibility."
                : "Design leadership stakeholder visible within the founder board.",
    isFounder,
  };
};

const founderStatusLabel = (founder: FounderProfile) => (founder.is_active ? "Active" : "Inactive");

export default function FoundersManagementPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: founders = [], isLoading: foundersLoading } = useFounders();
  const { data: executivesData, isLoading: executivesLoading } = useExecutives();
  const createFounderMutation = useCreateFounder();
  const updateFounderMutation = useUpdateFounder();
  const addSharesMutation = useAddFounderShares();
  const deleteFounderMutation = useDeleteFounder();
  const renewSharesMutation = useRenewFounderShares();
  const removeShareAdjustmentMutation = useRemoveShareAdjustment();
  const { data: schoolStats, isLoading: schoolStatsLoading } = useSchoolStats();

  const isPrimaryFounder = ["CEO", "CTO"].includes(user?.role || "");
  const executiveRecords = executivesData?.results ?? [];

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isSharesOpen, setIsSharesOpen] = useState(false);
  const [form, setForm] = useState<FounderFormState>(EMPTY_FORM);
  const [shareForm, setShareForm] = useState<ShareFormState>(EMPTY_SHARE_FORM);
  const [selectedFounder, setSelectedFounder] = useState<FounderProfile | null>(null);
  const [founderPendingDelete, setFounderPendingDelete] = useState<FounderProfile | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState({ matricule: "", password: "" });

  const sortedFounders = useMemo(
    () =>
      [...founders].sort((a, b) => {
        const aIndex = EXECUTIVE_ORDER.indexOf(a.role);
        const bIndex = EXECUTIVE_ORDER.indexOf(b.role);
        if (a.is_primary_founder !== b.is_primary_founder) {
          return a.is_primary_founder ? -1 : 1;
        }
        return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
      }),
    [founders]
  );

  const executiveMap = useMemo(
    () => executiveRecords.map(mapExecutiveRecord).sort((a, b) => EXECUTIVE_ORDER.indexOf(a.role) - EXECUTIVE_ORDER.indexOf(b.role)),
    [executiveRecords]
  );

  useEffect(() => {
    if (!isEditOpen) {
      setSelectedFounder(null);
      setForm(EMPTY_FORM);
    }
  }, [isEditOpen]);

  useEffect(() => {
    if (!isSharesOpen) {
      setSelectedFounder(null);
      setShareForm(EMPTY_SHARE_FORM);
    }
  }, [isSharesOpen]);

  const openEditDialog = (founder: FounderProfile) => {
    setSelectedFounder(founder);
    setForm({
      name: founder.name,
      email: founder.email,
      phone: founder.phone || "",
      whatsapp: founder.whatsapp || "",
      role: founder.role,
      founderTitle: founder.founder_title,
      primarySharePercentage: founder.primary_share_percentage,
      primaryShareUnits: String(founder.primary_share_units ?? 0),
      hasRenewableShares: founder.has_renewable_shares,
      shareRenewalPeriodDays: String(founder.share_renewal_period_days),
      accessLevel: founder.access_level,
    });
    setIsEditOpen(true);
  };

  const openSharesDialog = (founder: FounderProfile) => {
    setSelectedFounder(founder);
    setShareForm(EMPTY_SHARE_FORM);
    setIsSharesOpen(true);
  };

  const handleCreateFounder = async () => {
    try {
      const created = await createFounderMutation.mutateAsync({
        name: form.name,
        email: form.email,
        phone: form.phone,
        whatsapp: form.whatsapp || form.phone,
        role: form.role as "SUPER_ADMIN" | "COO" | "INV" | "DESIGNER",
        founder_title: form.founderTitle,
        primary_share_percentage: form.primarySharePercentage,
        primary_share_units: Number(form.primaryShareUnits || 0),
        has_renewable_shares: form.hasRenewableShares,
        share_renewal_period_days: form.hasRenewableShares
          ? parseInt(form.shareRenewalPeriodDays, 10)
          : undefined,
        access_level: form.accessLevel,
      });
      toast({
        title: "Founder Added",
        description: `${created.name} has been added. Activation matricule: ${created.matricule}.`,
      });
      setIsCreateOpen(false);
      setForm(EMPTY_FORM);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Could not add founder",
        description: error?.response?.data?.detail || "Please verify the founder information and try again.",
      });
    }
  };

  const handleUpdateFounder = async () => {
    if (!selectedFounder) return;
    try {
      await updateFounderMutation.mutateAsync({
        id: selectedFounder.id,
        data: {
          name: form.name,
          email: form.email,
          phone: form.phone,
          whatsapp: form.whatsapp || form.phone,
          role: form.role as "SUPER_ADMIN" | "COO" | "INV" | "DESIGNER",
          founder_title: form.founderTitle,
          primary_share_percentage: form.primarySharePercentage,
          primary_share_units: Number(form.primaryShareUnits || 0),
          access_level: form.accessLevel,
        },
      });
      toast({
        title: "Founder Updated",
        description: "Founder information and share configuration were updated successfully.",
      });
      setIsEditOpen(false);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: error?.response?.data?.detail || "We could not update this founder right now.",
      });
    }
  };

  const handleAddShares = async () => {
    if (!selectedFounder) return;
    try {
      await addSharesMutation.mutateAsync({
        id: selectedFounder.id,
        data: {
          percentage: shareForm.percentage,
          units: Number(shareForm.units || 0),
          note: shareForm.note,
          duration_days: parseInt(shareForm.durationDays, 10),
        },
      });
      toast({
        title: "Additional Shares Added",
        description: `Shares locked for ${shareForm.durationDays} day(s) and will auto-expire after that period.`,
      });
      setIsSharesOpen(false);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Share update failed",
        description: error?.response?.data?.detail || "We could not record that share adjustment.",
      });
    }
  };

  const handleRenewShares = async (founder: FounderProfile) => {
    try {
      await renewSharesMutation.mutateAsync(founder.id);
      toast({
        title: "Shares Renewed",
        description: `${founder.name}'s share period has been renewed for another ${founder.share_renewal_period_days} day(s).`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Renewal failed",
        description: error?.response?.data?.detail || "We could not renew shares right now.",
      });
    }
  };

  const handleRemoveShareAdjustment = async (founder: FounderProfile, adjustmentId: string) => {
    try {
      await removeShareAdjustmentMutation.mutateAsync({ founderId: founder.id, adjustmentId });
      toast({
        title: "Share Adjustment Removed",
        description: "The expired share allocation has been removed.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Removal failed",
        description: error?.response?.data?.detail || "We could not remove that share adjustment.",
      });
    }
  };

  const handleDeleteFounder = async (founder: FounderProfile) => {
    if (!founder.can_be_removed) {
      toast({
        variant: "destructive",
        title: "Protected Founder",
        description: "Primary founders cannot be removed from the system.",
      });
      return;
    }
    setFounderPendingDelete(founder);
    setDeleteConfirmation({ matricule: "", password: "" });
  };

  const handleConfirmFounderDelete = async () => {
    if (!founderPendingDelete) return;
    if (!deleteConfirmation.matricule.trim() || !deleteConfirmation.password) {
      toast({
        variant: "destructive",
        title: "Confirmation Required",
        description: "Enter your matricule and password before removing this founder.",
      });
      return;
    }
    try {
      await deleteFounderMutation.mutateAsync({
        id: founderPendingDelete.id,
        confirmation: deleteConfirmation,
      });
      toast({
        title: "Founder Removed",
        description: `${founderPendingDelete.name} was removed from the system.`,
      });
      setFounderPendingDelete(null);
      setDeleteConfirmation({ matricule: "", password: "" });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Removal failed",
        description: getApiErrorMessage(error, "We could not remove this founder right now."),
      });
    }
  };

  const isLoading = foundersLoading || executivesLoading;

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary/40" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold text-primary font-headline">
            <div className="rounded-xl bg-primary p-2 text-white shadow-lg">
              <Crown className="h-6 w-6 text-secondary" />
            </div>
            Founder Governance
          </h1>
          <p className="mt-1 max-w-3xl text-muted-foreground">
            CEO and CTO remain the protected primary founders. From here they can add secondary founders, assign roles,
            define shareholding, grant additional shares over time, and manage activation-ready matricules.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Badge className="h-10 rounded-xl bg-secondary/20 px-4 text-[10px] font-black uppercase tracking-widest text-primary">
            {sortedFounders.length} Founder Accounts
          </Badge>
          {isPrimaryFounder && (
            <Button
              className="h-11 rounded-xl bg-primary px-5 text-xs font-black uppercase tracking-widest text-white"
              onClick={() => setIsCreateOpen(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Founder
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <FounderMetricCard
          icon={<Building2 className="h-5 w-5" />}
          label="Registered Schools"
          value={schoolStatsLoading ? "..." : String(schoolStats?.total_schools ?? 0)}
          detail={`${schoolStats?.active_schools ?? 0} active institutions`}
        />
        <FounderMetricCard
          icon={<GraduationCap className="h-5 w-5" />}
          label="Total Students"
          value={schoolStatsLoading ? "..." : String(schoolStats?.total_students ?? 0)}
          detail="All registered student profiles across every school"
        />
        <FounderMetricCard
          icon={<Users className="h-5 w-5" />}
          label="Total Staff"
          value={schoolStatsLoading ? "..." : String(schoolStats?.total_staff ?? schoolStats?.total_teachers ?? 0)}
          detail={`${schoolStats?.total_teachers ?? 0} teachers plus school administrators and support staff`}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {sortedFounders.map((founder) => (
          <Card key={founder.id} className="overflow-hidden rounded-[2rem] border-none bg-white shadow-xl">
            <CardHeader className="bg-primary p-6 text-white sm:p-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <Avatar className="h-20 w-20 border-4 border-white/20 shadow-xl">
                  <AvatarImage src={founder.avatar} />
                  <AvatarFallback className="bg-white text-2xl font-black text-primary">
                    {founder.name?.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="space-y-3">
                  <CardTitle className="text-2xl font-black uppercase tracking-tight">{founder.name}</CardTitle>
                  <div className="flex flex-wrap gap-2">
                    <Badge className="border-none bg-secondary px-4 py-1 text-[8px] font-black uppercase text-primary">
                      {founder.is_primary_founder ? "Primary Founder" : "Board Founder"}
                    </Badge>
                    <Badge variant="secondary" className="border-none bg-white/10 px-4 py-1 text-[8px] font-black uppercase text-white">
                      {founder.role}
                    </Badge>
                    <Badge className="border-none bg-white px-4 py-1 text-[8px] font-black uppercase text-primary">
                      {founderStatusLabel(founder)}
                    </Badge>
                    {/* Access level badge */}
                    {founder.access_level === "READ_ONLY" ? (
                      <Badge className="border-none bg-amber-400/80 px-4 py-1 text-[8px] font-black uppercase text-white">
                        <Eye className="mr-1 h-3 w-3" /> Read Only
                      </Badge>
                    ) : (
                      <Badge className="border-none bg-emerald-500/80 px-4 py-1 text-[8px] font-black uppercase text-white">
                        <CheckCircle2 className="mr-1 h-3 w-3" /> Full Access
                      </Badge>
                    )}
                    {/* Renewable shares warning */}
                    {founder.has_renewable_shares && founder.is_share_expired && (
                      <Badge className="border-none bg-red-500 px-4 py-1 text-[8px] font-black uppercase text-white">
                        <AlertTriangle className="mr-1 h-3 w-3" /> Shares Expired
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="text-sm font-bold text-white/80">
                    {founder.founder_title}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-6 p-6 sm:p-8">
              <div className="grid gap-4 sm:grid-cols-3">
                <ShareBlock label="Primary Shares" value={`${founder.primary_share_percentage}%`} units={founder.primary_share_units} />
                <ShareBlock label="Additional Shares" value={`${founder.additional_share_percentage}%`} units={founder.additional_share_units} accent />
                <ShareBlock label="Total Shares" value={`${founder.total_share_percentage}%`} units={founder.total_share_units} />
              </div>

              <div className="rounded-2xl border border-accent bg-accent/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Activation Matricule</p>
                    <p className="mt-1 text-sm font-mono font-bold text-primary/80">{founder.matricule}</p>
                  </div>
                  {!founder.can_be_removed && (
                    <Badge className="border-none bg-primary/10 px-3 py-1 text-[8px] font-black uppercase text-primary">
                      Protected Founder
                    </Badge>
                  )}
                </div>
                <p className="mt-3 text-xs font-bold text-primary/70">
                  {founder.is_primary_founder
                    ? "Primary founder account: role and base shares stay protected. Additional shares can still be granted over time."
                    : "Secondary founder account: editable and removable by the CEO or CTO at any time."}
                </p>
              </div>

              {/* Renewable shares expiry panel */}
              {founder.has_renewable_shares && (
                <div className={cn(
                  "rounded-2xl border p-4",
                  founder.is_share_expired
                    ? "border-red-200 bg-red-50"
                    : (founder.days_until_share_expiry ?? 999) <= 30
                      ? "border-amber-200 bg-amber-50"
                      : "border-emerald-200 bg-emerald-50",
                )}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CalendarClock className={cn(
                        "h-4 w-4",
                        founder.is_share_expired ? "text-red-500" : "text-emerald-600",
                      )} />
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        Renewable Shares
                      </p>
                    </div>
                    {founder.is_share_expired ? (
                      <Badge className="border-none bg-red-500 px-3 py-1 text-[8px] font-black uppercase text-white">
                        Expired — grace period active
                      </Badge>
                    ) : (
                      <Badge className="border-none bg-emerald-500 px-3 py-1 text-[8px] font-black uppercase text-white">
                        <Timer className="mr-1 h-3 w-3" />
                        {founder.days_until_share_expiry} day(s) left
                      </Badge>
                    )}
                  </div>
                  <p className="mt-2 text-xs font-bold text-primary/70">
                    Renewal period: {founder.share_renewal_period_days} day(s).
                    {founder.is_share_expired
                      ? " Shares have expired. Renew now to restore access before the 30-day grace period ends."
                      : ` Expires on ${founder.shares_expire_at ? new Date(founder.shares_expire_at).toLocaleDateString() : "—"}.`}
                  </p>
                </div>
              )}

              <div className="space-y-3 border-t border-accent pt-4">
                <InfoRow icon={<Mail className="h-4 w-4" />} value={founder.email} />
                <InfoRow icon={<Smartphone className="h-4 w-4" />} value={founder.phone || "No contact configured"} />
                <InfoRow icon={<Wallet className="h-4 w-4" />} value={`${founder.share_adjustments.length} additional share grants recorded`} />
              </div>

              {founder.share_adjustments.length > 0 && (
                <div className="space-y-2 rounded-2xl border border-accent bg-white p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Share Adjustments</p>
                  <div className="space-y-2">
                    {founder.share_adjustments.slice(0, 5).map((adjustment) => (
                      <div key={adjustment.id} className={cn(
                        "flex flex-col gap-1 rounded-xl px-3 py-2 sm:flex-row sm:items-center sm:justify-between",
                        adjustment.is_expired ? "bg-red-50" : adjustment.is_locked ? "bg-accent/20" : "bg-emerald-50",
                      )}>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-black text-primary">+{adjustment.percentage}%</p>
                            {adjustment.is_locked && (
                              <Badge className="border-none bg-primary/10 px-2 py-0.5 text-[8px] font-black uppercase text-primary">
                                <Lock className="mr-1 h-2.5 w-2.5" />
                                Locked — {adjustment.days_until_expiry}d left
                              </Badge>
                            )}
                            {adjustment.is_expired && (
                              <Badge className="border-none bg-red-100 px-2 py-0.5 text-[8px] font-black uppercase text-red-600">
                                Expired
                              </Badge>
                            )}
                          </div>
                          <p className="text-[10px] font-bold text-muted-foreground">{adjustment.note || "Additional founder allocation"}</p>
                          {adjustment.expires_at && (
                            <p className="text-[10px] font-bold text-primary/50">
                              Expires: {new Date(adjustment.expires_at).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-primary/60">{adjustment.added_by_name || "Founder Board"}</p>
                          {isPrimaryFounder && !adjustment.is_locked && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 rounded-lg px-2 text-red-500 hover:bg-red-50 hover:text-red-600"
                              onClick={() => handleRemoveShareAdjustment(founder, adjustment.id)}
                              disabled={removeShareAdjustmentMutation.isPending}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {isPrimaryFounder && (
                <div className="flex flex-wrap gap-3 border-t border-accent pt-4">
                  <Button variant="outline" className="rounded-xl" onClick={() => openEditDialog(founder)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit Founder
                  </Button>
                  <Button variant="outline" className="rounded-xl" onClick={() => openSharesDialog(founder)}>
                    <PieChart className="mr-2 h-4 w-4" />
                    Add Shares
                  </Button>
                  {founder.has_renewable_shares && (
                    <Button
                      variant="outline"
                      className="rounded-xl border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                      onClick={() => handleRenewShares(founder)}
                      disabled={renewSharesMutation.isPending}
                    >
                      {renewSharesMutation.isPending
                        ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        : <RefreshCw className="mr-2 h-4 w-4" />}
                      Renew Shares
                    </Button>
                  )}
                  {founder.can_be_removed && (
                    <Button
                      variant="destructive"
                      className="rounded-xl"
                      onClick={() => handleDeleteFounder(founder)}
                      disabled={deleteFounderMutation.isPending}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remove Founder
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="rounded-[2rem] border-none bg-white shadow-sm">
        <CardHeader className="border-b bg-white p-8">
          <CardTitle className="flex items-center gap-2 text-xl font-black uppercase text-primary">
            <Building2 className="h-6 w-6 text-secondary" />
            Executive Relationship Map
          </CardTitle>
          <CardDescription>
            Both primary founders can see every executive account and every founder record from the same governance view.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Executive</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="min-w-[280px]">Relationship</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {executiveMap.map((record) => (
                <TableRow key={record.id}>
                  <TableCell className="pl-6">
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl border border-primary/10 bg-white p-2.5 shadow-sm">
                        {record.isFounder ? <Crown className="h-5 w-5 text-primary" /> : <ShieldCheck className="h-5 w-5 text-primary/60" />}
                      </div>
                      <p className="text-xs font-black uppercase text-primary">{record.name}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="border-none bg-primary/5 text-[8px] font-black uppercase text-primary">
                      {record.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-[11px] font-bold text-muted-foreground">{record.relationship}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="rounded-[2rem] border-none bg-white shadow-sm">
        <CardHeader className="border-b bg-white p-8">
          <CardTitle className="flex items-center gap-2 text-xl font-black uppercase text-primary">
            <History className="h-6 w-6 text-secondary" />
            Founder Protection Rules
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 p-8 md:grid-cols-2 xl:grid-cols-4">
          {[
            "CEO remains fixed at 40% primary shares and CTO remains fixed at 27% primary shares.",
            "CEO and CTO can add secondary founders, define titles, assign roles, and generate activation-ready matricules. Every user receives a unique matricule to activate their account.",
            "Additional shares are locked for the full time frame set at creation — no one can edit or remove them before expiry. Expired shares are automatically removed.",
            "Renewable-share founders who do not renew within 30 days of expiry are permanently deleted and cannot log in again.",
            "CEO and CTO set each secondary founder’s access level: Read Only (view only) or Full Access (can perform permitted operations).",
            "Only secondary founders can be removed from the system. Primary founder accounts remain protected.",
          ].map((rule) => (
            <div key={rule} className="rounded-2xl border border-accent bg-accent/20 p-5">
              <div className="mb-3 flex items-center gap-2">
                <Lock className="h-4 w-4 text-primary" />
                <span className="text-[10px] font-black uppercase tracking-widest text-primary">Founder Rule</span>
              </div>
              <p className="text-sm font-bold text-primary/80">{rule}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <FounderDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        title="Add Founder"
        description="Create a founder account, define their role and base shares, then share the generated matricule so they can activate their account."
        form={form}
        setForm={setForm}
        onSubmit={handleCreateFounder}
        submitLabel={createFounderMutation.isPending ? "Creating..." : "Create Founder"}
        loading={createFounderMutation.isPending}
      />

      <FounderDialog
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        title="Edit Founder"
        description="Update founder contact details, board title, and editable share setup."
        form={form}
        setForm={setForm}
        onSubmit={handleUpdateFounder}
        submitLabel={updateFounderMutation.isPending ? "Saving..." : "Save Changes"}
        loading={updateFounderMutation.isPending}
        disableRole={selectedFounder?.is_primary_founder}
      />

      <Dialog open={isSharesOpen} onOpenChange={setIsSharesOpen}>
        <DialogContent className="max-w-xl rounded-[2rem]">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase text-primary">
              Add Additional Shares
            </DialogTitle>
            <DialogDescription>
              {selectedFounder
                ? `${selectedFounder.name} currently holds ${selectedFounder.primary_share_percentage}% primary shares and ${selectedFounder.additional_share_percentage}% additional shares.`
                : "Record a new share allocation."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <ShareBlock label="Primary Shares" value={`${selectedFounder?.primary_share_percentage || "0.00"}%`} units={selectedFounder?.primary_share_units} />
              <ShareBlock label="Additional Shares" value={`${selectedFounder?.additional_share_percentage || "0.00"}%`} units={selectedFounder?.additional_share_units} accent />
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="flex items-start gap-2">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <p className="text-xs font-bold text-amber-700">
                  Shares are <span className="underline">locked for the entire duration</span> you set below — no one can edit or remove them before the time frame expires. Once expired they are automatically removed.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="additional-share">New Additional Share (%)</Label>
                <Input
                  id="additional-share"
                  inputMode="decimal"
                  placeholder="e.g. 2.50"
                  value={shareForm.percentage}
                  onChange={(event) => setShareForm((prev) => ({ ...prev, percentage: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="additional-share-units">New Additional Shares (number)</Label>
                <Input
                  id="additional-share-units"
                  inputMode="numeric"
                  placeholder="e.g. 500"
                  value={shareForm.units}
                  onChange={(event) => setShareForm((prev) => ({ ...prev, units: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="share-duration">Lock Duration (days)</Label>
                <Input
                  id="share-duration"
                  inputMode="numeric"
                  placeholder="e.g. 365"
                  value={shareForm.durationDays}
                  onChange={(event) => setShareForm((prev) => ({ ...prev, durationDays: event.target.value }))}
                />
                {shareForm.durationDays && parseInt(shareForm.durationDays, 10) > 0 && (
                  <p className="text-[10px] font-bold text-muted-foreground">
                    Expires: {new Date(Date.now() + parseInt(shareForm.durationDays, 10) * 86400000).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="share-note">Reason / Note</Label>
              <Textarea
                id="share-note"
                placeholder="e.g. Additional governance shares approved after Series A close."
                value={shareForm.note}
                onChange={(event) => setShareForm((prev) => ({ ...prev, note: event.target.value }))}
              />
            </div>
          </div>

          <DialogFooter className="gap-3 sm:justify-end">
            <Button variant="outline" onClick={() => setIsSharesOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddShares}
              disabled={
                addSharesMutation.isPending ||
                !shareForm.percentage.trim() ||
                !shareForm.durationDays.trim() ||
                parseInt(shareForm.durationDays, 10) < 1
              }
            >
              {addSharesMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PieChart className="mr-2 h-4 w-4" />}
              Add Shares
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!founderPendingDelete} onOpenChange={(open) => !open && setFounderPendingDelete(null)}>
        <DialogContent className="max-w-md rounded-[2rem]">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase text-destructive">Confirm Founder Removal</DialogTitle>
            <DialogDescription>
              This will permanently remove {founderPendingDelete?.name}. Confirm with your own matricule and password.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <Field label="Your Matricule" htmlFor="founder-delete-matricule">
              <Input
                id="founder-delete-matricule"
                value={deleteConfirmation.matricule}
                onChange={(event) => setDeleteConfirmation((prev) => ({ ...prev, matricule: event.target.value }))}
                placeholder="Enter your matricule exactly"
              />
            </Field>
            <Field label="Your Password" htmlFor="founder-delete-password">
              <Input
                id="founder-delete-password"
                type="password"
                value={deleteConfirmation.password}
                onChange={(event) => setDeleteConfirmation((prev) => ({ ...prev, password: event.target.value }))}
                placeholder="Enter your password"
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFounderPendingDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleConfirmFounderDelete} disabled={deleteFounderMutation.isPending}>
              {deleteFounderMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Remove Founder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ShareBlock({
  label,
  value,
  units,
  accent = false,
}: {
  label: string;
  value: string;
  /** Whole-share count shown under the percentage, when one is allocated. */
  units?: number;
  accent?: boolean;
}) {
  return (
    <div className={cn("rounded-2xl border p-4", accent ? "border-secondary/20 bg-secondary/10" : "border-accent bg-accent/20")}>
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
      <div className="mt-2 flex items-center gap-2">
        <PieChart className="h-4 w-4 text-primary/50" />
        <span className="text-lg font-black text-primary">{value}</span>
      </div>
      {units ? (
        <p className="mt-1 text-xs font-bold text-muted-foreground">
          {units.toLocaleString()} {units === 1 ? "share" : "shares"}
        </p>
      ) : null}
    </div>
  );
}

function FounderMetricCard({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return (
    <Card className="rounded-[1.5rem] border-none bg-white shadow-sm">
      <CardContent className="flex items-center gap-4 p-5">
        <div className="rounded-2xl bg-primary/10 p-3 text-primary">{icon}</div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
          <p className="text-2xl font-black text-primary">{value}</p>
          <p className="text-xs font-bold text-muted-foreground">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function InfoRow({ icon, value }: { icon: ReactNode; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="rounded-lg bg-primary/5 p-2 text-primary/60">{icon}</div>
      <p className="break-all text-xs font-bold text-primary/80">{value}</p>
    </div>
  );
}

function FounderDialog({
  open,
  onOpenChange,
  title,
  description,
  form,
  setForm,
  onSubmit,
  submitLabel,
  loading,
  disableRole = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  form: FounderFormState;
  setForm: Dispatch<SetStateAction<FounderFormState>>;
  onSubmit: () => Promise<void>;
  submitLabel: string;
  loading: boolean;
  disableRole?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-[2rem]">
        <DialogHeader>
          <DialogTitle className="text-xl font-black uppercase text-primary">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <Field label="Full Name" htmlFor={`${title}-name`}>
            <Input
              id={`${title}-name`}
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            />
          </Field>

          <Field label="Founder Title" htmlFor={`${title}-founder-title`}>
            <Input
              id={`${title}-founder-title`}
              value={form.founderTitle}
              onChange={(event) => setForm((prev) => ({ ...prev, founderTitle: event.target.value }))}
              placeholder="e.g. Strategic Growth Founder"
            />
          </Field>

          <Field label="Email" htmlFor={`${title}-email`}>
            <Input
              id={`${title}-email`}
              type="email"
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            />
          </Field>

          <Field label="Phone Number" htmlFor={`${title}-phone`}>
            <Input
              id={`${title}-phone`}
              value={form.phone}
              onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
            />
          </Field>

          <Field label="WhatsApp" htmlFor={`${title}-whatsapp`}>
            <Input
              id={`${title}-whatsapp`}
              value={form.whatsapp}
              onChange={(event) => setForm((prev) => ({ ...prev, whatsapp: event.target.value }))}
            />
          </Field>

          <Field label="System Role" htmlFor={`${title}-role`}>
            <Select
              value={form.role}
              onValueChange={(value) => setForm((prev) => ({ ...prev, role: value }))}
              disabled={disableRole}
            >
              <SelectTrigger id={`${title}-role`}>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {FOUNDER_ROLE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Primary Share (%)" htmlFor={`${title}-shares`}>
            <Input
              id={`${title}-shares`}
              inputMode="decimal"
              value={form.primarySharePercentage}
              onChange={(event) => setForm((prev) => ({ ...prev, primarySharePercentage: event.target.value }))}
              placeholder="e.g. 40 for the CEO, 27 for the CTO"
            />
          </Field>

          <Field label="Primary Shares (number)" htmlFor={`${title}-share-units`}>
            <Input
              id={`${title}-share-units`}
              inputMode="numeric"
              value={form.primaryShareUnits}
              onChange={(event) => setForm((prev) => ({ ...prev, primaryShareUnits: event.target.value }))}
              placeholder="e.g. 1000"
            />
          </Field>

          {/* Activity access level */}
          <Field label="Activity Access Level" htmlFor={`${title}-access-level`}>
            <Select
              value={form.accessLevel}
              onValueChange={(value) => setForm((prev) => ({ ...prev, accessLevel: value as FounderAccessLevel }))}
            >
              <SelectTrigger id={`${title}-access-level`}>
                <SelectValue placeholder="Select access level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FULL">Full Access — can perform activities</SelectItem>
                <SelectItem value="READ_ONLY">Read Only — view only, no actions</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {/* Renewable shares toggle + period */}
          <div className="col-span-full space-y-3 rounded-2xl border border-accent bg-accent/20 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-primary">Renewable Shares</p>
                <p className="text-[10px] font-bold text-muted-foreground">
                  After expiry the founder has 30 days to renew or their account is permanently deleted.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={form.hasRenewableShares}
                onClick={() => setForm((prev) => ({ ...prev, hasRenewableShares: !prev.hasRenewableShares }))}
                className={cn(
                  "relative inline-flex h-6 w-11 cursor-pointer rounded-full transition-colors focus:outline-none",
                  form.hasRenewableShares ? "bg-primary" : "bg-muted-foreground/30",
                )}
              >
                <span
                  className={cn(
                    "inline-block h-5 w-5 translate-y-0.5 rounded-full bg-white shadow transition-transform",
                    form.hasRenewableShares ? "translate-x-5" : "translate-x-0.5",
                  )}
                />
              </button>
            </div>
            {form.hasRenewableShares && (
              <Field label="Renewal Period (days)" htmlFor={`${title}-renewal-days`}>
                <Input
                  id={`${title}-renewal-days`}
                  inputMode="numeric"
                  placeholder="e.g. 365"
                  value={form.shareRenewalPeriodDays}
                  onChange={(event) => setForm((prev) => ({ ...prev, shareRenewalPeriodDays: event.target.value }))}
                />
              </Field>
            )}
          </div>
        </div>

        <DialogFooter className="gap-3 sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={
              loading ||
              !form.name.trim() ||
              !form.email.trim() ||
              !form.phone.trim() ||
              !form.founderTitle.trim() ||
              !form.primarySharePercentage.trim() ||
              (form.hasRenewableShares && (!form.shareRenewalPeriodDays || parseInt(form.shareRenewalPeriodDays, 10) < 1))
            }
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
