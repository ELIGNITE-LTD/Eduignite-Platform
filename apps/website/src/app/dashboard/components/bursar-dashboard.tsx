"use client";

import { useMemo } from "react";
import { useRevenueReport, usePayments, useFeeStructures, useOutstandingFees } from "@/lib/hooks/useFees";
import { useStudents } from "@/lib/hooks/useStudents";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Coins, TrendingDown, PieChart, Receipt, TrendingUp, History, LayoutGrid, ShieldCheck, Printer, CheckCircle2, ChevronRight } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import Link from "next/link";

function formatMoney(value: number | string | undefined) {
  return `XAF ${Number(value || 0).toLocaleString()}`;
}

export function BursarDashboard() {
  const { data: revenueReport } = useRevenueReport();
  const { data: paymentsResp } = usePayments({ limit: 200 });
  const { data: feesResp } = useFeeStructures({ limit: 200 });
  const { data: studentsResp } = useStudents({ limit: 500, ordering: "user__name" });
  const { data: outstandingResp } = useOutstandingFees();

  const allPayments = paymentsResp?.results ?? [];
  const confirmedPayments = allPayments.filter((payment) => payment.status === "Confirmed");
  const totalCollected = formatMoney(revenueReport?.total_collected);
  const totalPending = formatMoney(revenueReport?.total_pending);
  const feeStructureCount = feesResp?.results?.length ?? 0;
  const students = studentsResp?.results ?? [];
  const outstandingFees = Array.isArray(outstandingResp) ? outstandingResp : [];

  const revenueTrends = Array.isArray(revenueReport?.monthly_trend)
    ? revenueReport.monthly_trend.map((month: any) => ({
        name: month.month,
        revenue: Number(month.amount),
      }))
    : [];

  const feeDistribution = Object.entries(revenueReport?.by_fee_type || {}).map(([name, amount], index) => ({
    name,
    value: Number(amount || 0),
    color: ["#264D73", "#67D0E4", "#FCD116", "#CE1126", "#10B981"][index % 5],
  }));

  const totalFeeDistribution = feeDistribution.reduce((sum, item) => sum + item.value, 0);

  const recentCollections = confirmedPayments.slice(0, 5).map((payment) => ({
    name: payment.payer_name ?? payment.payer?.name ?? "Unknown",
    amount: Number(payment.amount),
    method: payment.fee_name ?? payment.payment_method,
    status: payment.status,
    avatar: payment.payer?.avatar,
    matricule: payment.payer?.matricule ?? payment.payer?.id ?? payment.reference_number,
  }));

  const outstandingUserIds = new Set(outstandingFees.map((entry: any) => String(entry.user_id)));

  const classCompliance = useMemo(() => {
    const grouped = students.reduce((acc: Record<string, { className: string; total: number; compliant: number }>, student) => {
      const className = student.student_class || "Unassigned";
      if (!acc[className]) {
        acc[className] = { className, total: 0, compliant: 0 };
      }
      acc[className].total += 1;
      if (!outstandingUserIds.has(String(student.user?.id))) {
        acc[className].compliant += 1;
      }
      return acc;
    }, {});

    return Object.values(grouped)
      .map((row) => ({
        className: row.className,
        total: row.total,
        compliant: row.compliant,
        percentage: row.total ? Math.round((row.compliant / row.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [students, outstandingUserIds]);

  const intakeEfficiency = allPayments.length ? Math.round((confirmedPayments.length / allPayments.length) * 100) : 0;

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className="rounded-[1.5rem] border-2 border-white bg-primary p-3 shadow-xl">
            <Coins className="h-8 w-8 text-secondary" />
          </div>
          <div>
            <h1 className="font-headline text-3xl font-bold uppercase leading-none tracking-tighter text-primary">Financial Management Hub</h1>
            <div className="mt-2 flex items-center gap-2">
              <Badge className="h-5 border-none bg-secondary px-3 text-[9px] font-black uppercase tracking-widest text-primary">Bursar Office</Badge>
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">• Live Revenue Node</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" className="h-11 gap-2 rounded-xl border-primary/10 bg-white px-6 font-bold shadow-sm">
            <Link href="/dashboard/fees"><Receipt className="h-4 w-4 text-primary" /> Collect Fees</Link>
          </Button>
          <Button className="h-11 gap-2 rounded-xl px-8 text-[10px] font-black uppercase tracking-widest shadow-xl">
            <Printer className="h-4 w-4" /> Print Ledger
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Net Collection", value: totalCollected, icon: Coins, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Outstanding Arrears", value: totalPending, icon: TrendingDown, color: "text-red-600", bg: "bg-red-50" },
          { label: "Intake Efficiency", value: `${intakeEfficiency}%`, icon: PieChart, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Fee Structures", value: feeStructureCount.toLocaleString(), icon: Receipt, color: "text-purple-600", bg: "bg-purple-50" },
        ].map((stat) => (
          <Card key={stat.label} className="group border-none shadow-sm transition-all hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{stat.label}</CardTitle>
              <div className={cn("rounded-lg p-2", stat.bg)}>
                <stat.icon className={cn("h-4 w-4", stat.color)} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-primary">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <Card className="overflow-hidden rounded-[2.5rem] border-none bg-white shadow-xl lg:col-span-8">
          <CardHeader className="flex flex-col gap-4 border-b bg-primary/5 p-8 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl font-black uppercase tracking-tighter text-primary">
                <TrendingUp className="h-5 w-5 text-secondary" /> Revenue Intake Velocity
              </CardTitle>
              <CardDescription>Chronological tracking of real fee collections returned by the backend report.</CardDescription>
            </div>
            <Badge variant="outline" className="h-7 border-primary/10 px-4 font-bold text-primary">SECURE NODE SYNC</Badge>
          </CardHeader>
          <CardContent className="h-[350px] pt-10">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueTrends.length > 0 ? revenueTrends : [{ name: "No Data", revenue: 0 }]}>
                <defs>
                  <linearGradient id="colorBursarRev" x1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#264D73" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#264D73" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: "bold" }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                <RechartsTooltip contentStyle={{ borderRadius: "1rem", border: "none" }} />
                <Area name="Intake (XAF)" type="monotone" dataKey="revenue" stroke="#264D73" strokeWidth={4} fill="url(#colorBursarRev)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="flex flex-col overflow-hidden rounded-[2.5rem] border-none bg-primary shadow-xl lg:col-span-4">
          <CardHeader className="p-8 text-white">
            <CardTitle className="flex items-center gap-2 text-xl font-black uppercase tracking-tight">
              <Coins className="h-5 w-5 text-secondary" />
              Fee Allocation
            </CardTitle>
            <CardDescription className="text-xs text-white/60">Distribution by real fee category totals.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 space-y-6 px-8 pt-10">
            {feeDistribution.length ? (
              feeDistribution.map((item) => {
                const percentage = totalFeeDistribution ? Number(((item.value / totalFeeDistribution) * 100).toFixed(1)) : 0;
                return (
                  <div key={item.name} className="space-y-2">
                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-white/60">
                      <span>{item.name}</span>
                      <span>{percentage}%</span>
                    </div>
                    <Progress value={percentage} className="h-1.5 rounded-full" />
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-white/60">No fee data available.</p>
            )}
            <div className="border-t border-white/10 pt-4">
              <Button asChild variant="ghost" className="w-full gap-2 text-[10px] font-black uppercase tracking-widest hover:bg-white/10">
                <Link href="/dashboard/fees">View Policy Settings <ChevronRight className="h-3.5 w-3.5" /></Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <Card className="overflow-hidden rounded-[2rem] border-none bg-white shadow-xl lg:col-span-7">
          <CardHeader className="flex items-center justify-between border-b bg-white p-8">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg font-black uppercase text-primary">
                <History className="h-5 w-5 text-secondary" />
                Recent Collection Registry
              </CardTitle>
              <CardDescription>Latest confirmed backend payments.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-accent/10 text-[9px] font-black uppercase tracking-widest">
                <TableRow>
                  <TableHead className="py-4 pl-8">Student Profile</TableHead>
                  <TableHead>Fee Category</TableHead>
                  <TableHead className="text-center">Amount</TableHead>
                  <TableHead className="pr-8 text-right">Integrity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentCollections.map((collection) => (
                  <TableRow key={`${collection.matricule}-${collection.amount}`} className="h-16 border-b transition-colors last:border-0 hover:bg-primary/5">
                    <TableCell className="pl-8">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8 border shadow-sm">
                          <AvatarImage src={collection.avatar} />
                          <AvatarFallback>{collection.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="mb-1 text-[11px] font-black uppercase leading-none text-primary">{collection.name}</p>
                          <p className="text-[9px] font-mono font-bold uppercase text-muted-foreground">{collection.matricule}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-black uppercase text-primary">{collection.method}</TableCell>
                    <TableCell className="text-center text-sm font-black text-primary">{formatMoney(collection.amount)}</TableCell>
                    <TableCell className="pr-8 text-right">
                      <div className="inline-flex items-center gap-1.5 rounded-full border border-green-100 bg-green-50 px-3 py-1 text-[8px] font-bold uppercase text-green-700">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Secure
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!recentCollections.length ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-20 text-center text-sm text-muted-foreground">
                      Confirmed payments will appear here once collections are recorded.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="overflow-hidden rounded-[2rem] border-none bg-white shadow-xl lg:col-span-5">
          <CardHeader className="border-b bg-white p-8">
            <CardTitle className="flex items-center gap-2 text-lg font-black uppercase text-primary">
              <LayoutGrid className="h-5 w-5 text-secondary" />
              Class Compliance Matrix
            </CardTitle>
            <CardDescription>Real student compliance by class based on outstanding backend accounts.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableBody>
                {classCompliance.map((row) => (
                  <TableRow key={row.className} className="h-16 border-b hover:bg-primary/5 last:border-0">
                    <TableCell className="pl-8">
                      <p className="text-xs font-black uppercase leading-none text-primary">{row.className}</p>
                      <p className="mt-1 text-[9px] font-bold uppercase text-muted-foreground">
                        {row.compliant} compliant of {row.total} students
                      </p>
                    </TableCell>
                    <TableCell className="pr-8 text-right">
                      <div className="flex flex-col items-end">
                        <span className={cn("text-sm font-black", row.percentage >= 90 ? "text-emerald-600" : row.percentage < 60 ? "text-red-600" : "text-primary")}>
                          {row.percentage}%
                        </span>
                        <span className="text-[8px] font-bold uppercase opacity-40">Compliance</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!classCompliance.length ? (
                  <TableRow>
                    <TableCell colSpan={2} className="h-20 text-center text-sm text-muted-foreground">
                      Class compliance will appear here once students and fee obligations are available.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
          <CardFooter className="flex justify-center border-t bg-accent/10 p-4">
            <div className="flex items-center gap-2 italic text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary opacity-40" />
              <p className="text-[9px] font-black uppercase tracking-widest opacity-40">Verified Institutional Financial Record</p>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
