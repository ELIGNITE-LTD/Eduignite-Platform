"use client";

/**
 * The school's fee ledger: one row per student per class fee, with what is
 * owed, what has been paid and what is left.
 *
 * Shared by the school admin's Fees & Finance tab and the bursar's Fee Portal.
 * The two see the same figures — only the name signing the exported statement
 * differs, since a bursar signs their own collection report and an
 * administrator signs on behalf of the school.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Loader2, Search, TrendingUp, Wallet, AlertCircle, PieChart } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { feesService } from "@/lib/api/services/fees.service";
import { cn } from "@/lib/utils";
import { downloadFeeStatementPdf } from "@/lib/fee-statement-pdf";

const CURRENCY = "XAF";

const money = (value: unknown) =>
  `${Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })} ${CURRENCY}`;

const normalizeList = (payload: any): any[] => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
};

/** paid | incomplete | unpaid — "unpaid" in the filter covers anything owing. */
type StatusFilter = "ALL" | "paid" | "unpaid";

export function FeeRecords() {
  const { user, platformSettings } = useAuth();
  const { toast } = useToast();

  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [classId, setClassId] = useState("ALL");
  const [feeId, setFeeId] = useState("ALL");
  const [search, setSearch] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  const recordsQuery = useQuery({
    queryKey: ["student-school-fees"],
    queryFn: async () => normalizeList(await feesService.getStudentSchoolFees({ page_size: 1000 } as any)),
    retry: 2,
  });

  const feeTypesQuery = useQuery({
    queryKey: ["fee-structures-for-ledger"],
    queryFn: async () => normalizeList(await feesService.getFeeStructures({ page_size: 200 } as any)),
    retry: 1,
  });

  // Students pay by fee type, and the class ledger cannot answer "who paid the
  // PTA levy" — so choosing a fee type switches the table to that fee's roster
  // of learners, each marked paid or unpaid.
  const feeRosterQuery = useQuery({
    queryKey: ["fee-student-status", feeId],
    queryFn: () => feesService.getFeeStudentStatus(feeId),
    enabled: feeId !== "ALL",
    retry: 1,
  });

  const feeTypes = feeTypesQuery.data ?? [];
  const selectedFee = feeTypes.find((fee: any) => String(fee.id) === feeId);

  const records: any[] = useMemo(() => {
    if (feeId === "ALL") return recordsQuery.data ?? [];
    const roster = feeRosterQuery.data?.results ?? [];
    return roster.map((row: any) => ({
      id: `${feeId}-${row.student_id}`,
      student_name: row.student_name,
      student_matricule: row.student_matricule,
      admission_number: row.admission_number,
      class_id: row.class_id,
      class_name: row.class_name,
      total_amount: row.amount_due,
      amount_paid: row.amount_paid,
      balance: row.balance,
      status: row.status,
    }));
  }, [feeId, recordsQuery.data, feeRosterQuery.data]);

  const classOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of records) {
      if (row.class_id && row.class_name) seen.set(String(row.class_id), row.class_name);
    }
    return Array.from(seen, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [records]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return records.filter((row) => {
      if (status === "paid" && row.status !== "paid") return false;
      // Anything still owing counts as unpaid, whether untouched or part-paid.
      if (status === "unpaid" && row.status === "paid") return false;
      if (classId !== "ALL" && String(row.class_id) !== classId) return false;
      if (!term) return true;
      return [row.student_name, row.student_matricule, row.admission_number, row.class_name]
        .filter(Boolean)
        .some((value: string) => String(value).toLowerCase().includes(term));
    });
  }, [records, status, classId, search]);

  // ---- Financial analysis over exactly what is on screen ----
  const analysis = useMemo(() => {
    const billed = filtered.reduce((sum, r) => sum + Number(r.total_amount || 0), 0);
    const collected = filtered.reduce((sum, r) => sum + Number(r.amount_paid || 0), 0);
    const outstanding = filtered.reduce((sum, r) => sum + Number(r.balance || 0), 0);
    const paidCount = filtered.filter((r) => r.status === "paid").length;
    const partCount = filtered.filter((r) => r.status === "incomplete").length;
    const unpaidCount = filtered.filter((r) => r.status === "unpaid").length;
    return {
      billed,
      collected,
      outstanding,
      paidCount,
      partCount,
      unpaidCount,
      collectionRate: billed > 0 ? (collected / billed) * 100 : 0,
      settledRate: filtered.length ? (paidCount / filtered.length) * 100 : 0,
    };
  }, [filtered]);

  const role = String(user?.role || "").toUpperCase();
  const isBursar = role === "BURSAR";
  const schoolName = (user as any)?.school?.name || platformSettings?.name || "School";

  const handleExport = async () => {
    if (!filtered.length) {
      toast({ variant: "destructive", title: "Nothing to export", description: "No records match the current filters." });
      return;
    }
    setIsExporting(true);
    try {
      await downloadFeeStatementPdf({
        schoolName,
        schoolMotto: (user as any)?.school?.motto || "",
        // A bursar signs their own collection report; an administrator signs
        // for the school, so the block names the principal instead.
        signatoryRole: isBursar ? "The Bursar" : "The Principal",
        signatoryName: isBursar
          ? user?.name || "The Bursar"
          : (user as any)?.school?.principal || user?.name || "The Principal",
        filters: {
          status: status === "ALL" ? "All statuses" : status === "paid" ? "Paid" : "Unpaid / outstanding",
          className: classId === "ALL" ? "All classes" : (classOptions.find((c) => c.id === classId)?.name || "-"),
          feeType: feeId === "ALL" ? "All fee types" : (selectedFee?.name || "Selected fee"),
        },
        rows: filtered.map((r) => ({
          student: r.student_name || "-",
          matricule: r.student_matricule || r.admission_number || "-",
          className: r.class_name || "-",
          total: Number(r.total_amount || 0),
          paid: Number(r.amount_paid || 0),
          balance: Number(r.balance || 0),
          status: r.status || "unpaid",
        })),
        totals: {
          billed: analysis.billed,
          collected: analysis.collected,
          outstanding: analysis.outstanding,
          collectionRate: analysis.collectionRate,
        },
      });
      toast({ title: "Statement downloaded", description: `${filtered.length} record(s) exported as PDF.` });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Could not build the statement", description: error?.message || "Please try again." });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ---- Financial analysis ---- */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<PieChart className="h-5 w-5" />} label="Total Billed" value={money(analysis.billed)} hint={`${filtered.length} record(s)`} />
        <StatCard icon={<Wallet className="h-5 w-5" />} label="Collected" value={money(analysis.collected)} hint={`${analysis.collectionRate.toFixed(1)}% of billed`} tone="green" />
        <StatCard icon={<AlertCircle className="h-5 w-5" />} label="Outstanding" value={money(analysis.outstanding)} hint={`${analysis.unpaidCount} unpaid · ${analysis.partCount} part-paid`} tone="amber" />
        <StatCard icon={<TrendingUp className="h-5 w-5" />} label="Fully Settled" value={`${analysis.settledRate.toFixed(1)}%`} hint={`${analysis.paidCount} of ${filtered.length} students`} tone="blue" />
      </div>

      <Card className="border-none shadow-sm">
        <CardHeader className="gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle className="text-lg text-primary">Fee Records</CardTitle>
            <CardDescription>
              Filter the ledger, then download the filtered list as a signed statement.
            </CardDescription>
          </div>
          <Button onClick={handleExport} disabled={isExporting || !filtered.length} className="gap-2 rounded-xl font-bold">
            {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download PDF ({filtered.length})
          </Button>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v: StatusFilter) => setStatus(v)}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All statuses</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="unpaid">Unpaid / outstanding</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Class</Label>
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All classes</SelectItem>
                  {classOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fee type</Label>
              <Select value={feeId} onValueChange={setFeeId}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All fee types</SelectItem>
                  {feeTypes.map((fee: any) => (
                    <SelectItem key={fee.id} value={String(fee.id)}>{fee.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Name or matricule"
                  className="rounded-xl pl-9"
                />
              </div>
            </div>
          </div>

          {(feeId === "ALL" ? recordsQuery.isLoading : feeRosterQuery.isLoading) ? (
            <div className="flex items-center justify-center gap-3 py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin text-primary" /> Loading fee records…
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-primary/10 py-16 text-center">
              <Wallet className="mx-auto h-10 w-10 text-primary/20" />
              <p className="mt-3 font-bold text-muted-foreground">No fee records match these filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Matricule</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead className="text-right">Billed</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-bold text-primary">{row.student_name}</TableCell>
                      <TableCell className="font-mono text-xs">{row.student_matricule || row.admission_number}</TableCell>
                      <TableCell>{row.class_name || "-"}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(row.total_amount)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(row.amount_paid)}</TableCell>
                      <TableCell className="text-right font-bold tabular-nums">{money(row.balance)}</TableCell>
                      <TableCell>
                        <Badge className={cn("border-none text-[10px] font-black uppercase", statusTone(row.status))}>
                          {row.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function statusTone(status: string) {
  if (status === "paid") return "bg-green-100 text-green-700";
  if (status === "incomplete") return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

function StatCard({
  icon, label, value, hint, tone = "primary",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  tone?: "primary" | "green" | "amber" | "blue";
}) {
  const tones: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    green: "bg-green-100 text-green-700",
    amber: "bg-amber-100 text-amber-700",
    blue: "bg-blue-100 text-blue-700",
  };
  return (
    <Card className="border-none shadow-sm">
      <CardContent className="flex items-start gap-4 p-5">
        <span className={cn("rounded-2xl p-3", tones[tone])}>{icon}</span>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
          <p className="mt-1 truncate text-xl font-black text-primary">{value}</p>
          <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">{hint}</p>
        </div>
      </CardContent>
    </Card>
  );
}
