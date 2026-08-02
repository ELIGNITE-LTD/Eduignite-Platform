"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, CheckCircle2, CreditCard, Download, Loader2, Printer,
  ReceiptText, Search, UserCheck,
} from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { usePagination, DataPagination } from "@/components/ui/data-pagination";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { feesService } from "@/lib/api/services/fees.service";
import { usersService } from "@/lib/api/services/users.service";
import { usePlatformFees } from "@/lib/hooks/usePlatform";
import { useHierarchyClasses } from "@/lib/hooks/useSchools";
import { studentSubscriptionBlocks } from "./subscription-access";
import { getApiErrorMessage } from "@/lib/api/errors";
import { downloadReceiptPdf, printReceiptPdf, receiptFromPayment, money } from "./fee-receipt";

const ALL = "all";
const METHODS = [
  { value: "mtn_momo", label: "MTN Mobile Money" },
  { value: "orange_money", label: "Orange Money" },
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
];

const normalizeList = (payload: any): any[] =>
  Array.isArray(payload) ? payload : Array.isArray(payload?.results) ? payload.results : [];
const classOf = (s: any) => s.student_class || s.class_name || s.school_class_name || s.className || "";
const subSchoolOf = (s: any) => s.sub_school_name || s.subSchoolName || s.section || "General";

/**
 * Record Payment tab — once a student's subscription is paid, the bursar / school
 * admin records a fee. Pick sub-school and class, choose the student, pick a fee
 * type (its amount is shown), and Record. A fee cannot be recorded for a student
 * whose subscription is unpaid. On phones the record form opens as a pop-up.
 */
export function RecordPayment() {
  const { user, platformSettings } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const schoolId = (typeof (user as any)?.school === "object" ? (user as any)?.school?.id : (user as any)?.school) || (user as any)?.school_id || "";
  const schoolName = (typeof (user as any)?.school === "object" && (user as any)?.school?.name) || platformSettings?.name || "EduIgnite School";

  const [search, setSearch] = useState("");
  const [subSchoolFilter, setSubSchoolFilter] = useState(ALL);
  const [classFilter, setClassFilter] = useState(ALL);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [recordDialogOpen, setRecordDialogOpen] = useState(false);

  const [feeId, setFeeId] = useState("");
  const [method, setMethod] = useState("mtn_momo");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [receipt, setReceipt] = useState<any | null>(null);

  const studentsQuery = useQuery({
    queryKey: ["record-payment-students", schoolId],
    queryFn: async () => normalizeList(await usersService.getUsers({ role: "STUDENT", school: schoolId, page_size: 1000 } as any)),
    enabled: Boolean(schoolId),
  });
  const feeTypesQuery = useQuery({
    queryKey: ["bursar-fee-types", schoolId],
    queryFn: async () => normalizeList(await feesService.getFeeStructures({ page_size: 200 } as any)),
  });

  const students = studentsQuery.data || [];
  const feeTypes = feeTypesQuery.data || [];

  const classOptions = useMemo(() => Array.from(new Set(students.map(classOf).filter(Boolean))).sort() as string[], [students]);
  const subSchoolOptions = useMemo(() => Array.from(new Set(students.map(subSchoolOf).filter(Boolean))).sort() as string[], [students]);

  const filteredStudents = useMemo(() => {
    const term = search.trim().toLowerCase();
    return students.filter((s: any) => {
      const matchesSearch = !term || s.name?.toLowerCase().includes(term) || s.matricule?.toLowerCase().includes(term) || s.admission_number?.toLowerCase().includes(term);
      const matchesClass = classFilter === ALL || classOf(s) === classFilter;
      const matchesSub = subSchoolFilter === ALL || subSchoolOf(s) === subSchoolFilter;
      return matchesSearch && matchesClass && matchesSub;
    });
  }, [students, search, classFilter, subSchoolFilter]);

  const platformFeesQuery = usePlatformFees();
  const pager = usePagination(filteredStudents, 8);
  const selectedStudent = useMemo(() => students.find((s: any) => String(s.id) === String(selectedStudentId)) || null, [students, selectedStudentId]);
  // Recording is blocked only when the subscription is genuinely required and
  // unpaid past the deadline — not merely when is_license_paid is false (a zero
  // fee or a deadline that hasn't passed means no subscription is owed).
  const subscriptionBlocks = studentSubscriptionBlocks(selectedStudent, platformFeesQuery.data, platformSettings);
  const selectedFee = useMemo(() => feeTypes.find((f: any) => String(f.id) === String(feeId)) || null, [feeTypes, feeId]);

  const selectStudent = (id: string) => {
    setSelectedStudentId(id);
    setFeeId("");
    if (isMobile) setRecordDialogOpen(true);
  };

  const recordFee = useMutation({
    mutationFn: async () => {
      if (!selectedStudent) throw new Error("Select a student first.");
      if (!selectedFee) throw new Error("Select a fee type.");
      const created = await feesService.createPayment({
        payer: selectedStudentId,
        fee_structure: feeId,
        amount: String(selectedFee.amount || 0),
        payment_method: method as any,
        payment_date: paymentDate,
        notes,
      } as any);
      try {
        const confirmed: any = await feesService.confirmPayment(String((created as any).id));
        return confirmed?.payment || confirmed || created;
      } catch {
        return created;
      }
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["record-payment-students"] });
      setReceipt(receiptFromPayment(data, "Fee Payment"));
      setFeeId(""); setNotes("");
      setRecordDialogOpen(false);
      toast({ title: "Fee recorded", description: "The receipt is ready to print or download." });
    },
    onError: (error: any) => toast({ variant: "destructive", title: "Could not record fee", description: getApiErrorMessage(error, error?.message || "Please try again.") }),
  });

  const renderRecordBody = () => {
    if (!selectedStudent) {
      return <p className="py-10 text-center text-sm text-muted-foreground">No student selected yet.</p>;
    }
    if (subscriptionBlocks) {
      return (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <span>{selectedStudent.name}'s subscription is due and unpaid past the deadline. Settle it in the <b>Subscription</b> tab before recording any fee.</span>
        </div>
      );
    }
    return (
      <>
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Fee Type</Label>
          {feeTypes.length === 0 ? (
            <p className="text-xs text-muted-foreground">No fee types yet. Add them in the Fee Type tab.</p>
          ) : (
            <Select value={feeId} onValueChange={setFeeId}>
              <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Choose a fee type" /></SelectTrigger>
              <SelectContent>
                {feeTypes.map((fee: any) => (
                  <SelectItem key={fee.id} value={String(fee.id)}>{fee.name} — {money(fee.amount, fee.currency || "XAF")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {selectedFee ? (
          <div className="flex items-center justify-between rounded-2xl border bg-accent/10 p-4">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Fee Amount</span>
            <span className="text-xl font-black text-primary">{money(selectedFee.amount, selectedFee.currency || "XAF")}</span>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>{METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Payment Date</Label>
            <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="h-10 rounded-xl" />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Notes (optional)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="h-10 rounded-xl" placeholder="e.g. First instalment" />
          </div>
        </div>

        <Button onClick={() => recordFee.mutate()} disabled={!feeId || recordFee.isPending} className="h-12 w-full gap-2 rounded-xl font-black">
          {recordFee.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ReceiptText className="h-4 w-4" />} Record &amp; Generate Receipt
        </Button>
      </>
    );
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
      {/* Student picker */}
      <Card className="border-none shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-black text-primary"><UserCheck className="h-5 w-5 text-secondary" /> Select Student</CardTitle>
          <CardDescription>Filter by sub-school and class, then choose the student.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 rounded-xl border bg-white px-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, matricule or admission no..." className="border-none focus-visible:ring-0" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={subSchoolFilter} onValueChange={setSubSchoolFilter}>
              <SelectTrigger className="h-10 rounded-xl text-xs"><SelectValue placeholder="Sub-school" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All sub-schools</SelectItem>
                {subSchoolOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger className="h-10 rounded-xl text-xs"><SelectValue placeholder="Class" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All classes</SelectItem>
                {classOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="overflow-hidden rounded-xl border">
            <table className="w-full text-left text-sm">
              <thead className="bg-primary text-[10px] font-black uppercase tracking-widest text-white">
                <tr><th className="px-3 py-2">Student</th><th className="px-3 py-2 text-right">Subscription</th></tr>
              </thead>
              <tbody>
                {studentsQuery.isLoading ? (
                  <tr><td colSpan={2} className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-primary/40" /></td></tr>
                ) : pager.pageItems.length === 0 ? (
                  <tr><td colSpan={2} className="py-8 text-center text-xs text-muted-foreground">No students match the filters.</td></tr>
                ) : pager.pageItems.map((student: any) => (
                  <tr key={student.id} onClick={() => selectStudent(String(student.id))}
                    className={cn("cursor-pointer border-t transition-colors", String(selectedStudentId) === String(student.id) ? "bg-primary/5" : "hover:bg-accent/20")}>
                    <td className="px-3 py-2.5">
                      <p className="truncate font-bold text-primary">{student.name}</p>
                      <p className="truncate text-[10px] font-mono text-muted-foreground">{student.matricule} · {classOf(student) || "—"}</p>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {(() => {
                        const blocked = studentSubscriptionBlocks(student, platformFeesQuery.data, platformSettings);
                        return (
                          <Badge className={cn("text-[8px] font-black uppercase", blocked ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700")}>{blocked ? "Unpaid" : "Active"}</Badge>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DataPagination pager={pager} label="students" />
        </CardContent>
      </Card>

      {/* Record panel — inline on desktop/tablet, pop-up on phones */}
      {!isMobile ? (
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-black text-primary"><CreditCard className="h-5 w-5 text-secondary" /> Record Fee</CardTitle>
            <CardDescription>{selectedStudent ? `Recording for ${selectedStudent.name}` : "Select a student to begin."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">{renderRecordBody()}</CardContent>
        </Card>
      ) : null}

      {/* Mobile record pop-up */}
      <Dialog open={isMobile && recordDialogOpen} onOpenChange={(open) => { if (!open) setRecordDialogOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary"><CreditCard className="h-5 w-5 text-secondary" /> Record Fee</DialogTitle>
            <DialogDescription>{selectedStudent ? `Recording for ${selectedStudent.name}` : "Select a student to begin."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-5">{renderRecordBody()}</div>
        </DialogContent>
      </Dialog>

      {/* Receipt dialog */}
      <Dialog open={!!receipt} onOpenChange={(open) => { if (!open) setReceipt(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary"><CheckCircle2 className="h-5 w-5 text-green-600" /> Payment Receipt</DialogTitle>
            <DialogDescription>The fee was recorded successfully.</DialogDescription>
          </DialogHeader>
          {receipt ? (
            <div className="rounded-2xl border bg-accent/10 p-4 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Receipt No.</span><span className="font-mono font-bold text-primary">{receipt.receiptNo}</span></div>
              <div className="mt-2 flex justify-between"><span className="text-muted-foreground">Student</span><span className="font-bold text-primary">{receipt.studentName}</span></div>
              <div className="mt-2 flex justify-between"><span className="text-muted-foreground">Fee</span><span className="font-bold text-primary">{receipt.feeName}</span></div>
              <div className="mt-2 flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-black text-primary">{money(receipt.amount, receipt.currency)}</span></div>
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" className="gap-2" onClick={() => receipt && downloadReceiptPdf(receipt, schoolName)}><Download className="h-4 w-4" /> Download PDF</Button>
            <Button className="gap-2" onClick={() => receipt && printReceiptPdf(receipt, schoolName)}><Printer className="h-4 w-4" /> Print</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default RecordPayment;
