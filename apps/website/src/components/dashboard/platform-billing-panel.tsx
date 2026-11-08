"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { platformService } from "@/lib/api/services/platform.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

const CATEGORIES: { key: "basic" | "secondary" | "higher"; label: string }[] = [
  { key: "basic", label: "Basic (nursery / primary)" },
  { key: "secondary", label: "Secondary" },
  { key: "higher", label: "Higher" },
];

/**
 * Founders only: the platform fee per student (XAF) and the payment deadline,
 * with optional per-category overrides, plus every school's billing status.
 * Saved server-side with an audit entry; the server enforces who may save.
 */
export function PlatformBillingPanel({ canEdit }: { canEdit: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ["platform", "settings"], queryFn: () => platformService.getPlatformSettings() });
  const overviewQuery = useQuery({ queryKey: ["platform-billing-schools"], queryFn: () => platformService.getSchoolsBilling() });

  const [fee, setFee] = useState("");
  const [deadline, setDeadline] = useState("");
  const [cycle, setCycle] = useState("");
  const [feeBy, setFeeBy] = useState<Record<string, string>>({});
  const [deadlineBy, setDeadlineBy] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const s: any = settingsQuery.data;
    if (!s) return;
    setFee(String(Number(s.per_student_fee ?? 0) || ""));
    setDeadline(s.payment_deadline || "");
    setCycle(s.billing_cycle || "");
    setFeeBy(s.per_student_fee_by_category || {});
    setDeadlineBy(s.payment_deadline_by_category || {});
  }, [settingsQuery.data]);

  const save = async () => {
    setSaving(true);
    try {
      await platformService.updatePlatformSettings({
        per_student_fee: Number(fee || 0),
        payment_deadline: deadline || null,
        billing_cycle: cycle.trim(),
        per_student_fee_by_category: feeBy,
        payment_deadline_by_category: deadlineBy,
      } as any);
      await queryClient.invalidateQueries({ queryKey: ["platform", "settings"] });
      await queryClient.invalidateQueries({ queryKey: ["platform-billing-schools"] });
      toast({ title: "Platform fee saved", description: "Schools are billed on the new amount and deadline." });
    } catch (error) {
      toast({ variant: "destructive", title: "Could not save", description: getApiErrorMessage(error, "Failed to save the platform fee.") });
    } finally {
      setSaving(false);
    }
  };

  const rows: any[] = overviewQuery.data?.results ?? [];
  const summary = overviewQuery.data?.summary ?? {};

  return (
    <Card className="border-none shadow-xl overflow-hidden rounded-[2.5rem]">
      <CardHeader className="bg-primary/5 border-b p-10">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="text-2xl font-black text-primary">Platform fee per student</CardTitle>
            <CardDescription>
              What EduIgnite bills each school: active pupils x this amount (XAF). A fee of 0 means schools are not billed this way.
            </CardDescription>
          </div>
          {canEdit && (
            <Button onClick={() => void save()} disabled={saving} className="h-12 px-8 font-black uppercase tracking-widest text-xs gap-2 rounded-2xl bg-primary text-white">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-10 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Default fee per student (XAF)</Label>
            <Input type="number" min={0} value={fee} onChange={(e) => setFee(e.target.value)} disabled={!canEdit} className="h-12 rounded-xl bg-accent/30 border-none font-black text-primary" />
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Default payment deadline</Label>
            <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} disabled={!canEdit} className="h-12 rounded-xl bg-accent/30 border-none" />
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Billing period (optional, e.g. 2026-2027)</Label>
            <Input value={cycle} maxLength={20} onChange={(e) => setCycle(e.target.value)} disabled={!canEdit} className="h-12 rounded-xl bg-accent/30 border-none" />
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Per education category (empty = use the default)</p>
          {CATEGORIES.map(({ key, label }) => (
            <div key={key} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center p-3 rounded-2xl bg-accent/30">
              <span className="font-bold text-sm">{label}</span>
              <Input type="number" min={0} placeholder="Fee per student" value={feeBy[key] ?? ""} onChange={(e) => setFeeBy((prev) => ({ ...prev, [key]: e.target.value }))} disabled={!canEdit} className="h-11 rounded-xl bg-white border-none" />
              <Input type="date" value={deadlineBy[key] ?? ""} onChange={(e) => setDeadlineBy((prev) => ({ ...prev, [key]: e.target.value }))} disabled={!canEdit} className="h-11 rounded-xl bg-white border-none" />
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Schools billing status</p>
            {Object.entries(summary).map(([status, count]) => (
              <Badge key={status} variant="outline">{status}: {String(count)}</Badge>
            ))}
          </div>
          {overviewQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase text-muted-foreground">
                    <th className="py-2 pr-4">School</th><th className="pr-4">Pupils</th><th className="pr-4">Total</th><th className="pr-4">Paid</th><th className="pr-4">Balance</th><th className="pr-4">Deadline</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.filter((r) => r.configured).map((r) => (
                    <tr key={r.school_id} className="border-t">
                      <td className="py-2 pr-4 font-bold">{r.school_name}</td>
                      <td className="pr-4">{r.pupil_count}</td>
                      <td className="pr-4">{Number(r.total).toLocaleString()}</td>
                      <td className="pr-4">{Number(r.paid).toLocaleString()}</td>
                      <td className="pr-4">{Number(r.balance).toLocaleString()}</td>
                      <td className="pr-4">{r.deadline || "-"}</td>
                      <td><Badge className={r.status === "overdue" ? "bg-red-600 text-white" : r.status === "paid" ? "bg-green-600 text-white" : ""}>{r.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.filter((r) => r.configured).length === 0 && (
                <p className="text-sm text-muted-foreground py-4">No school is billed yet. Set a fee per student above.</p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
