"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { usePagination, DataPagination } from "@/components/ui/data-pagination";
import { Search, Smartphone, Loader2, CheckCircle2, ShieldCheck, Wallet } from "lucide-react";
import { usersService } from "@/lib/api/services/users.service";
import { feesService } from "@/lib/api/services/fees.service";
import { usePlatformFees } from "@/lib/hooks/usePlatform";
import { useHierarchyClasses } from "@/lib/hooks/useSchools";
import { getApiErrorMessage } from "@/lib/api/errors";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { money } from "./fee-receipt";
import { resolveStudentSubscriptionFee, studentSubscriptionBlocks } from "./subscription-access";

/**
 * Subscription tab — the only place the platform subscription is paid.
 * Payment is collected through PayUnit (MTN / Orange mobile money); the amount is
 * the founder-set fee from /platform/fees/. On success the student is activated
 * automatically. A zero fee means the subscription is free and no one is charged.
 */

const ALL = "all";
const OPERATORS = [
  { value: "mtn_momo", label: "MTN MoMo" },
  { value: "orange_money", label: "Orange Money" },
];

const normalizeList = (payload: any): any[] =>
  Array.isArray(payload) ? payload : Array.isArray(payload?.results) ? payload.results : [];
const classOf = (s: any) => s.student_class || s.class_name || s.school_class_name || s.className || "";
const subSchoolOf = (s: any) => s.sub_school_name || s.subSchoolName || s.section || "General";

export function Subscription() {
  const { user, platformSettings } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const schoolId = (typeof (user as any)?.school === "object" ? (user as any)?.school?.id : (user as any)?.school) || (user as any)?.school_id || "";

  const platformFeesQuery = usePlatformFees();
  const { amount: platformFeeAmount, known: feeKnown } = resolveStudentSubscriptionFee(platformFeesQuery.data, platformSettings);
  const subscriptionRequired = platformFeeAmount > 0;

  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState(ALL);
  const [subSchoolFilter, setSubSchoolFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);

  const [paying, setPaying] = useState<any | null>(null);
  const [operator, setOperator] = useState("mtn_momo");
  const [phone, setPhone] = useState("");
  const [txn, setTxn] = useState<any | null>(null);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const studentsQuery = useQuery({
    queryKey: ["subscription-students", schoolId],
    queryFn: async () => normalizeList(await usersService.getUsers({ role: "STUDENT", school: schoolId, page_size: 1000 } as any)),
    enabled: Boolean(schoolId),
  });
  const classesQuery = useHierarchyClasses(schoolId ? { school_id: schoolId } : undefined);

  const students = studentsQuery.data || [];
  const classes = normalizeList(classesQuery.data);
  const subSchools = useMemo(() => Array.from(new Set(students.map(subSchoolOf).filter(Boolean))).sort() as string[], [students]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return students.filter((s: any) => {
      const matchesSearch = !term || s.name?.toLowerCase().includes(term) || s.matricule?.toLowerCase().includes(term) || s.admission_number?.toLowerCase().includes(term);
      const matchesClass = classFilter === ALL || classOf(s) === classFilter;
      const matchesSub = subSchoolFilter === ALL || subSchoolOf(s) === subSchoolFilter;
      const paid = Boolean(s.is_license_paid);
      const matchesStatus = statusFilter === ALL || (statusFilter === "paid" ? paid : !paid);
      return matchesSearch && matchesClass && matchesSub && matchesStatus;
    });
  }, [students, search, classFilter, subSchoolFilter, statusFilter]);

  const pager = usePagination(filtered, 20);
  const paidCount = useMemo(
    () => (subscriptionRequired ? students.filter((s: any) => s.is_license_paid).length : students.length),
    [students, subscriptionRequired],
  );
  const unpaidCount = Math.max(students.length - paidCount, 0);

  const stopPolling = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  useEffect(() => stopPolling, []);

  const startPayment = async () => {
    if (!paying) return;
    if (!phone.trim()) {
      toast({ variant: "destructive", title: "Phone required", description: "Enter the mobile money number (e.g. 6XXXXXXXX)." });
      return;
    }
    setStarting(true);
    try {
      const created = await feesService.payunitCollect({ phone: phone.trim(), operator, student_id: String(paying.id) });
      setTxn(created);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Mobile money failed", description: getApiErrorMessage(error, "Could not start the mobile money request.") });
    } finally {
      setStarting(false);
    }
  };

  // Immediate first check + 2.5s interval so instant/sandbox approvals confirm fast.
  useEffect(() => {
    stopPolling();
    if (!txn?.transaction_id) return;

    const succeed = async () => {
      stopPolling();
      setTxn(null);
      setPaying(null);
      setPhone("");
      await queryClient.invalidateQueries({ queryKey: ["subscription-students"] });
      toast({ title: "Subscription paid", description: "Payment received and the student's account is now active." });
    };

    if (txn.status === "SUCCESS") { void succeed(); return; }
    if (txn.status !== "PENDING") return;

    const tick = async () => {
      try {
        const updated = await feesService.payunitStatus(txn.transaction_id);
        if (updated.status === "SUCCESS") {
          void succeed();
        } else if (updated.status === "FAILED" || updated.status === "CANCELLED") {
          stopPolling();
          setTxn(updated);
          toast({ variant: "destructive", title: "Payment not completed", description: updated.reason || "The mobile money payment was not completed." });
        }
      } catch { /* keep polling */ }
    };
    void tick();
    pollRef.current = setInterval(tick, 2500);
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txn?.transaction_id, txn?.status]);

  return (
    <div className="space-y-6">
      <Card className="border-none bg-primary text-white shadow-xl rounded-[2rem] overflow-hidden">
        <CardHeader className="p-8 pb-4">
          <CardTitle className="flex items-center gap-3 text-2xl font-black uppercase tracking-tight">
            <Wallet className="h-6 w-6 text-secondary" /> Subscription
          </CardTitle>
          <CardDescription className="text-white/70 max-w-2xl">
            The platform subscription is set by EduIgnite and paid directly through MTN or Orange Money. Payment is real and immediate — the student&apos;s account is activated automatically once it succeeds.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 p-8 pt-2 sm:grid-cols-4">
          <div className="rounded-2xl bg-white/10 p-4"><p className="text-[10px] font-black uppercase tracking-widest text-white/60">Subscription</p><p className="mt-2 text-xl font-black">{platformFeeAmount > 0 ? money(platformFeeAmount) : (feeKnown ? "Free" : "Not set")}</p></div>
          <div className="rounded-2xl bg-white/10 p-4"><p className="text-[10px] font-black uppercase tracking-widest text-white/60">Total Students</p><p className="mt-2 text-xl font-black">{students.length}</p></div>
          <div className="rounded-2xl bg-white/10 p-4"><p className="text-[10px] font-black uppercase tracking-widest text-white/60">Settled</p><p className="mt-2 text-xl font-black text-green-300">{paidCount}</p></div>
          <div className="rounded-2xl bg-white/10 p-4"><p className="text-[10px] font-black uppercase tracking-widest text-white/60">Owing</p><p className="mt-2 text-xl font-black text-amber-300">{unpaidCount}</p></div>
        </CardContent>
      </Card>

      <Card className="border-none shadow-sm rounded-[2rem]">
        <CardContent className="space-y-5 p-6">
          <div className="grid gap-4 lg:grid-cols-[2fr,1fr,1fr,1fr]">
            <div className="space-y-2">
              <Label>Search Student</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} className="h-11 rounded-xl pl-10" placeholder="Name, matricule or admission no..." />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Class</Label>
              <Select value={classFilter} onValueChange={setClassFilter}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All classes</SelectItem>
                  {classes.map((c: any) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Sub-School</Label>
              <Select value={subSchoolFilter} onValueChange={setSubSchoolFilter}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All sub-schools</SelectItem>
                  {subSchools.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All statuses</SelectItem>
                  <SelectItem value="paid">Settled</SelectItem>
                  <SelectItem value="unpaid">Owing</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border">
            <Table className="min-w-[760px]">
              <TableHeader className="bg-primary">
                <TableRow className="hover:bg-primary">
                  <TableHead className="pl-6 text-xs font-black uppercase tracking-widest text-white">Student</TableHead>
                  <TableHead className="text-xs font-black uppercase tracking-widest text-white">Matricule</TableHead>
                  <TableHead className="text-xs font-black uppercase tracking-widest text-white">Class</TableHead>
                  <TableHead className="text-xs font-black uppercase tracking-widest text-white">Sub-School</TableHead>
                  <TableHead className="text-xs font-black uppercase tracking-widest text-white">Status</TableHead>
                  <TableHead className="pr-6 text-right text-xs font-black uppercase tracking-widest text-white">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {studentsQuery.isLoading ? (
                  <TableRow><TableCell colSpan={6} className="py-12 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary/40" /></TableCell></TableRow>
                ) : pager.pageItems.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">No students match the current filters.</TableCell></TableRow>
                ) : pager.pageItems.map((s: any) => {
                  const paid = Boolean(s.is_license_paid);
                  const owing = subscriptionRequired && studentSubscriptionBlocks(s, platformFeesQuery.data, platformSettings);
                  return (
                    <TableRow key={s.id} className="odd:bg-accent/5">
                      <TableCell className="pl-6"><p className="font-black text-primary">{s.name}</p><p className="text-xs text-muted-foreground">{s.admission_number || ""}</p></TableCell>
                      <TableCell className="font-mono text-xs">{s.matricule || "—"}</TableCell>
                      <TableCell>{classOf(s) || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{subSchoolOf(s)}</TableCell>
                      <TableCell>
                        <Badge className={cn("border-none font-black uppercase text-[10px]", (!subscriptionRequired || paid) ? "bg-green-100 text-green-700" : owing ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600")}>
                          {!subscriptionRequired ? "Free" : paid ? "Paid" : owing ? "Owing" : "Pending"}
                        </Badge>
                      </TableCell>
                      <TableCell className="pr-6 text-right">
                        {!subscriptionRequired ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-green-600"><CheckCircle2 className="h-4 w-4" /> Free</span>
                        ) : paid ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-green-600"><CheckCircle2 className="h-4 w-4" /> Settled</span>
                        ) : (
                          <Button size="sm" className="h-9 gap-2 rounded-xl font-bold" onClick={() => { setPaying(s); setPhone(""); setTxn(null); setOperator("mtn_momo"); }}>
                            <Smartphone className="h-4 w-4" /> Pay
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <DataPagination pager={pager} label="students" />
        </CardContent>
      </Card>

      {/* Payment dialog */}
      <Dialog open={!!paying} onOpenChange={(open) => { if (!open) { setPaying(null); setTxn(null); stopPolling(); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary"><ShieldCheck className="h-5 w-5 text-secondary" /> Pay Subscription</DialogTitle>
            <DialogDescription>
              Paying for <span className="font-bold text-primary">{paying?.name}</span> through mobile money. The amount is fixed by EduIgnite.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-2xl border bg-accent/10 p-4 text-center">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Amount to pay</p>
              <p className="mt-1 text-2xl font-black text-primary">{platformFeeAmount > 0 ? money(platformFeeAmount) : (feeKnown ? "Free" : "Not set")}</p>
            </div>
            <div className="space-y-2">
              <Label>Mobile Money</Label>
              <div className="grid grid-cols-2 gap-2">
                {OPERATORS.map((op) => (
                  <button key={op.value} type="button" onClick={() => setOperator(op.value)}
                    className={cn("rounded-xl border p-3 text-sm font-black transition-all", operator === op.value ? "border-primary bg-primary/5 ring-1 ring-primary text-primary" : "hover:bg-accent/20")}>
                    {op.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>{operator === "orange_money" ? "Orange" : "MTN"} Money Number</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="6XXXXXXXX" className="h-11 rounded-xl" disabled={txn?.status === "PENDING"} />
            </div>
            {txn?.status === "PENDING" ? (
              <div className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm font-semibold text-primary">
                <Loader2 className="h-5 w-5 animate-spin" /> Approve the payment on the phone. Waiting for confirmation...
              </div>
            ) : null}
            {txn?.status === "FAILED" || txn?.status === "CANCELLED" ? (
              <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">{txn.reason || "The payment was not completed. You can try again."}</div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPaying(null); setTxn(null); stopPolling(); }}>Close</Button>
            <Button onClick={startPayment} disabled={starting || txn?.status === "PENDING"} className="gap-2">
              {starting || txn?.status === "PENDING" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />} Request payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default Subscription;
