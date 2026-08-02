"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, Coins, Download, GraduationCap, Loader2, ShieldAlert, Wallet } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FeeRecords } from "./fee-records";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/lib/auth-context";
import { feesService } from "@/lib/api/services/fees.service";
import { RecordPayment } from "./record-payment";
import { Subscription } from "./subscription";
import { FeeTypes } from "./fee-types";
import { downloadReceiptPdf, receiptFromFeeItem, money } from "./fee-receipt";

function humanizeStatus(status: string) {
  if (status === "paid") return "Paid";
  return "Unpaid";
}
function statusBadgeClass(status: string) {
  return status === "paid" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700";
}

export default function FeesPage() {
  const router = useRouter();
  const { user } = useAuth();

  const canManageSchoolFees = user?.role === "BURSAR" || user?.role === "SCHOOL_ADMIN" || user?.role === "SUB_ADMIN";
  const canViewOwnFees = user?.role === "STUDENT" || user?.role === "PARENT";
  const isParent = user?.role === "PARENT";
  const schoolName = (typeof (user as any)?.school === "object" && (user as any)?.school?.name) || "EduIgnite School";

  const myFeesQuery = useQuery({
    queryKey: ["my-fees", user?.id],
    queryFn: () => feesService.getMyFees(),
    enabled: canViewOwnFees,
  });
  const feeItems: any[] = myFeesQuery.data || [];

  const totals = useMemo(() => {
    const totalFees = feeItems.reduce((sum, i) => sum + Number(i.amount || 0), 0);
    const paid = feeItems.filter((i) => i.status === "paid");
    const amountPaid = paid.reduce((sum, i) => sum + Number(i.amount_paid || i.amount || 0), 0);
    const rate = totalFees > 0 ? Math.round((amountPaid / totalFees) * 100) : 0;
    return { totalFees, amountPaid, paidCount: paid.length, unpaidCount: feeItems.length - paid.length, rate };
  }, [feeItems]);

  const downloadReceipt = (item: any) => {
    downloadReceiptPdf(receiptFromFeeItem(item), schoolName);
  };

  // ---------------- Student / Parent view ----------------
  if (canViewOwnFees) {
    if (myFeesQuery.isLoading) {
      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-bold text-muted-foreground">Loading your fees...</p>
        </div>
      );
    }

    return (
      <div className="space-y-8 pb-20">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="shrink-0 rounded-full shadow-sm hover:bg-white">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="rounded-2xl border-2 border-white bg-primary p-3 shadow-xl">
            <Wallet className="h-6 w-6 text-secondary md:h-8 md:w-8" />
          </div>
          <div>
            <h1 className="font-headline text-2xl font-bold uppercase tracking-tighter text-primary md:text-3xl">
              {isParent ? "Children Fees" : "My Fees"}
            </h1>
            <p className="mt-1 text-xs text-muted-foreground md:text-sm">
              Every fee set by your school bursar, its amount, and your payment status.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {[
            { label: "Total Fees", value: money(totals.totalFees), icon: Coins },
            { label: "Paid", value: money(totals.amountPaid), icon: Wallet },
            { label: "Fees Settled", value: `${totals.paidCount}/${feeItems.length}`, icon: GraduationCap },
            { label: "Payment Rate", value: `${totals.rate}%`, icon: AlertCircle },
          ].map((card) => (
            <Card key={card.label} className="border-none shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{card.label}</CardTitle>
                <card.icon className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent><div className="text-2xl font-black text-primary">{card.value}</div></CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-primary">Fee Items</CardTitle>
            <CardDescription>Each fee type published by the school and whether it has been paid.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Fee</TableHead>
                    {isParent ? <TableHead>Child</TableHead> : null}
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right pr-6">Receipt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {feeItems.length ? feeItems.map((item, idx) => (
                    <TableRow key={`${item.fee_id}-${item.student_id}-${idx}`}>
                      <TableCell className="pl-6">
                        <p className="font-bold text-primary">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{item.class_name}{item.sub_school_name ? ` · ${item.sub_school_name}` : ""}</p>
                      </TableCell>
                      {isParent ? <TableCell className="font-semibold text-primary">{item.student_name}</TableCell> : null}
                      <TableCell className="font-black text-secondary">{money(item.amount, item.currency)}</TableCell>
                      <TableCell>
                        <Badge className={`${statusBadgeClass(item.status)} border-none text-[10px] font-black uppercase`}>{humanizeStatus(item.status)}</Badge>
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        {item.status === "paid" ? (
                          <Button variant="outline" size="sm" className="rounded-xl font-bold" onClick={() => downloadReceipt(item)}>
                            <Download className="mr-2 h-4 w-4" /> Download
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell colSpan={isParent ? 5 : 4} className="h-24 text-center text-sm text-muted-foreground">
                        No fees have been published for {isParent ? "your children" : "your account"} yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!canManageSchoolFees) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <ShieldAlert className="h-12 w-12 text-destructive" />
        <h2 className="text-lg font-bold">Finance portal unavailable</h2>
        <p className="max-w-md text-center text-sm text-muted-foreground">
          Only bursars and school administrators can manage the fee portal.
        </p>
      </div>
    );
  }

  // ---------------- Bursar / School-admin view ----------------
  return (
    <div className="space-y-8 pb-20">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="shrink-0 rounded-full hover:bg-white shadow-sm">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="rounded-2xl border-2 border-white bg-primary p-3 shadow-xl">
          <Wallet className="h-6 w-6 text-secondary md:h-8 md:w-8" />
        </div>
        <div>
          <h1 className="font-headline text-2xl font-bold uppercase tracking-tighter text-primary md:text-3xl">
            {user?.role === "BURSAR" ? "Fee Portal" : "Fees & Finance"}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground md:text-sm">
            Record fee payments, review the fee ledger, collect the platform subscription, and manage fee types.
          </p>
        </div>
      </div>

      <Tabs defaultValue="record" className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-2 rounded-2xl border bg-white p-1.5 shadow-sm sm:w-auto sm:grid-cols-4">
          <TabsTrigger value="record" className="rounded-xl py-3 text-xs font-bold sm:text-sm">Record Payment</TabsTrigger>
          <TabsTrigger value="records" className="rounded-xl py-3 text-xs font-bold sm:text-sm">Fee Records</TabsTrigger>
          <TabsTrigger value="subscription" className="rounded-xl py-3 text-xs font-bold sm:text-sm">Subscription</TabsTrigger>
          <TabsTrigger value="fee-types" className="rounded-xl py-3 text-xs font-bold sm:text-sm">Fee Type</TabsTrigger>
        </TabsList>

        <TabsContent value="record" className="mt-6 space-y-6"><RecordPayment /></TabsContent>
        <TabsContent value="records" className="mt-6 space-y-6"><FeeRecords /></TabsContent>
        <TabsContent value="subscription" className="mt-6 space-y-6"><Subscription /></TabsContent>
        <TabsContent value="fee-types" className="mt-6 space-y-6"><FeeTypes /></TabsContent>
      </Tabs>
    </div>
  );
}
