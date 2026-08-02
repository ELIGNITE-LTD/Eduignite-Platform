"use client";

import { useMemo, useState } from "react";
import { useLibraryStats, useLoans, useOverdueLoans, useLowStockBooks, useBooks, useIssueBook } from "@/lib/hooks/useLibrary";
import { useUsers } from "@/lib/hooks/useUsers";
import { getApiErrorMessage } from "@/lib/api/errors";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Library, Book, BookMarked, Clock, AlertCircle, LayoutGrid, TrendingUp, Activity, PieChart, ShieldCheck, ArrowDownCircle, Plus, X, CheckCircle2, Loader2 } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from "recharts";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";

export function LibrarianDashboard() {
  const { toast } = useToast();
  const [isIssuingLoan, setIsIssuingLoan] = useState(false);
  const [loanFormData, setLoanFormData] = useState({ borrowerId: "", bookId: "", duration: "7" });

  const { data: libStats } = useLibraryStats();
  const { data: loansResp } = useLoans();
  const { data: overdueResp } = useOverdueLoans();
  const { data: lowStockResp } = useLowStockBooks();
  const { data: booksResp } = useBooks({ limit: 100 });
  const { data: usersResp } = useUsers({ limit: 300 });
  const issueBookMutation = useIssueBook();

  const totalBooks = libStats?.total_books ?? 0;
  const availableBooks = libStats?.available_books ?? 0;
  const activeLoans = libStats?.active_loans ?? 0;
  const overdueCount = libStats?.overdue_loans ?? overdueResp?.results?.length ?? 0;

  const allLoans = loansResp?.results ?? [];
  const allBooks = booksResp?.results ?? [];
  const eligibleBorrowers = (usersResp?.results ?? []).filter(
    (account) => account.role !== "PARENT" && account.role !== "SUPER_ADMIN" && !!account.school
  );

  const recentLoans = allLoans
    .slice()
    .sort((a, b) => new Date(b.issued_date).getTime() - new Date(a.issued_date).getTime())
    .slice(0, 5)
    .map((loan) => ({
      id: loan.id,
      borrower: loan.borrower.name,
      book: loan.book.title,
      due: loan.due_date,
      status: loan.status,
      avatar: loan.borrower.avatar,
      relationship: loan.borrower.student_class ?? loan.borrower.role ?? "School member",
    }));

  const lowStock = (lowStockResp?.results ?? []).map((book) => ({
    id: book.id,
    title: book.title,
    author: book.author,
    available: book.available_copies,
    total: book.total_copies,
  }));

  const categoryData = useMemo(() => {
    const grouped = new Map<string, number>();
    allBooks.forEach((book) => {
      const key = book.category?.name || "Uncategorized";
      grouped.set(key, (grouped.get(key) ?? 0) + 1);
    });
    const palette = ["#264D73", "#E8B20F", "#0F766E", "#9333EA", "#DC2626", "#2563EB"];
    return Array.from(grouped.entries())
      .map(([name, count], index) => ({
        name,
        count,
        color: palette[index % palette.length],
      }))
      .sort((a, b) => b.count - a.count);
  }, [allBooks]);

  const circulationData = [
    { name: "Available", count: availableBooks },
    { name: "Borrowed", count: Math.max(totalBooks - availableBooks, 0) },
    { name: "Active", count: activeLoans },
    { name: "Overdue", count: overdueCount },
  ];

  const availableBooksForIssue = allBooks.filter((book) => book.available_copies > 0);

  const handleIssueLoan = async () => {
    if (!loanFormData.borrowerId || !loanFormData.bookId) {
      toast({ variant: "destructive", title: "Form Incomplete", description: "Select a borrower and a volume." });
      return;
    }

    const durationDays = Number.parseInt(loanFormData.duration, 10);
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + (Number.isNaN(durationDays) ? 7 : durationDays));

    try {
      await issueBookMutation.mutateAsync({
        borrowerId: loanFormData.borrowerId,
        bookId: loanFormData.bookId,
        dueDate: dueDate.toISOString().split("T")[0],
      });
      setIsIssuingLoan(false);
      setLoanFormData({ borrowerId: "", bookId: "", duration: "7" });
      toast({ title: "Loan Recorded", description: "Pedagogical materials issued successfully." });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Loan Issue Failed",
        description: getApiErrorMessage(error, "Could not issue that book right now."),
      });
    }
  };

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary rounded-[1.5rem] shadow-xl border-2 border-white">
            <Library className="w-8 h-8 text-secondary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-primary font-headline tracking-tighter uppercase leading-none">Library Command Center</h1>
            <div className="flex items-center gap-2 mt-2">
              <Badge className="bg-secondary text-primary border-none font-black h-5 px-3 text-[9px] tracking-widest uppercase">Node Curator</Badge>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">• Verified Registry Sync</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" className="h-11 px-6 rounded-xl font-bold border-primary/10 bg-white gap-2 shadow-sm">
            <Link href="/dashboard/library"><Book className="w-4 h-4 text-primary" /> Manage Catalog</Link>
          </Button>
          <Button className="h-11 px-8 shadow-xl font-black uppercase tracking-widest text-[10px] gap-2 rounded-xl" onClick={() => setIsIssuingLoan(true)}>
            <Plus className="w-4 h-4" /> Issue Loan
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Volumes", value: `${totalBooks.toLocaleString()} Items`, icon: BookMarked, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Active Loans", value: `${activeLoans} Checked Out`, icon: Clock, color: "text-purple-600", bg: "bg-purple-50" },
          { label: "Overdue Items", value: `${overdueCount} Alerts`, icon: AlertCircle, color: "text-red-600", bg: "bg-red-50" },
          { label: "Node Capacity", value: `${totalBooks > 0 ? ((availableBooks / totalBooks) * 100).toFixed(0) : 0}% Available`, icon: LayoutGrid, color: "text-emerald-600", bg: "bg-emerald-50" },
        ].map((stat, i) => (
          <Card key={i} className="border-none shadow-sm group hover:shadow-md transition-all">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">{stat.label}</CardTitle>
              <div className={cn("p-2 rounded-lg", stat.bg)}>
                <stat.icon className={cn("w-4 h-4", stat.color)} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-primary">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <Card className="lg:col-span-8 border-none shadow-xl overflow-hidden rounded-[2.5rem] bg-white">
          <CardHeader className="bg-primary/5 p-8 border-b flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-xl font-black text-primary uppercase tracking-tighter flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-secondary" /> Circulation Snapshot
              </CardTitle>
              <CardDescription>Current library availability and borrowing pressure from real catalog data.</CardDescription>
            </div>
            <Badge variant="outline" className="border-primary/10 text-primary font-bold h-7 px-4">REGISTRY ACTIVE</Badge>
          </CardHeader>
          <CardContent className="h-[350px] pt-10">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={circulationData}>
                <defs>
                  <linearGradient id="colorLoan" x1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#264D73" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#264D73" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: "bold" }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                <RechartsTooltip contentStyle={{ borderRadius: "1rem", border: "none" }} />
                <Area name="Items" type="monotone" dataKey="count" stroke="#264D73" strokeWidth={4} fill="url(#colorLoan)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-4 border-none shadow-xl overflow-hidden rounded-[2.5rem] bg-white flex flex-col">
          <CardHeader className="bg-primary p-8 text-white">
            <CardTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
              <PieChart className="w-5 h-5 text-secondary" />
              Collection Density
            </CardTitle>
            <CardDescription className="text-white/60 text-xs">Distribution by real catalog category.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 pt-10">
            {categoryData.length === 0 ? (
              <div className="px-6 py-16 text-center text-sm text-muted-foreground">No categorized books have been recorded yet.</div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={categoryData}>
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: "bold" }} />
                    <YAxis hide />
                    <RechartsTooltip />
                    <Bar dataKey="count" radius={[10, 10, 0, 0]} barSize={25}>
                      {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-6 space-y-3">
                  {categoryData.slice(0, 3).map((item) => (
                    <div key={item.name} className="flex items-center justify-between p-3 rounded-xl bg-accent/20 border border-accent">
                      <span className="text-xs font-bold text-primary uppercase">{item.name}</span>
                      <Badge variant="outline" className="border-primary/10 text-primary font-black">{item.count}</Badge>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <Card className="lg:col-span-7 border-none shadow-xl overflow-hidden rounded-[2rem] bg-white">
          <CardHeader className="bg-white border-b p-8 flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-black text-primary uppercase flex items-center gap-2">
                <Activity className="w-5 h-5 text-secondary" />
                Active Circulation Registry
              </CardTitle>
              <CardDescription>Live tracking of checked-out pedagogical materials.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {recentLoans.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No book loans have been recorded yet.</div>
            ) : (
              <Table>
                <TableHeader className="bg-accent/10 uppercase text-[9px] font-black tracking-widest">
                  <TableRow>
                    <TableHead className="pl-8 py-4">Borrower</TableHead>
                    <TableHead>Requested Volume</TableHead>
                    <TableHead className="text-center">Due Date</TableHead>
                    <TableHead className="text-right pr-8">Lifecycle</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentLoans.map((loan) => (
                    <TableRow key={loan.id} className="hover:bg-primary/5 transition-colors border-b last:border-0 h-16">
                      <TableCell className="pl-8">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8 border shadow-sm">
                            <AvatarImage src={loan.avatar} />
                            <AvatarFallback>{loan.borrower.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col">
                            <span className="font-bold text-xs md:text-sm text-primary uppercase leading-none mb-1">{loan.borrower}</span>
                            <span className="text-[8px] font-black uppercase text-muted-foreground">{loan.relationship}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-black text-primary text-xs uppercase">{loan.book}</TableCell>
                      <TableCell className="text-center font-mono text-[10px] font-bold text-muted-foreground">{new Date(loan.due).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right pr-8">
                        <Badge className={cn("text-[8px] font-black uppercase px-2 h-5 border-none", loan.status === "Overdue" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700")}>
                          {loan.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-5 border-none shadow-xl overflow-hidden rounded-[2rem] bg-white">
          <CardHeader className="bg-white border-b p-8">
            <CardTitle className="text-lg font-black text-primary uppercase flex items-center gap-2">
              <ArrowDownCircle className="w-5 h-5 text-secondary" />
              Inventory Alerts
            </CardTitle>
            <CardDescription>Critical stock levels for high-demand curriculum.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {lowStock.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No low-stock alerts at the moment.</div>
            ) : (
              <Table>
                <TableBody>
                  {lowStock.map((item) => (
                    <TableRow key={item.id} className="hover:bg-primary/5 border-b last:border-0 h-16">
                      <TableCell className="pl-8">
                        <div className="space-y-0.5">
                          <p className="text-[11px] font-black text-primary uppercase leading-none">{item.title}</p>
                          <p className="text-[9px] font-bold text-muted-foreground uppercase">By {item.author}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right pr-8">
                        <div className="flex flex-col items-end">
                          <span className={cn("text-sm font-black", item.available === 0 ? "text-red-600" : "text-primary")}>
                            {item.available} <span className="text-[10px] opacity-40">/ {item.total}</span>
                          </span>
                          <span className="text-[8px] font-bold uppercase opacity-40">Stock Level</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
          <CardFooter className="bg-accent/10 p-4 flex justify-center border-t">
            <div className="flex items-center gap-2 text-muted-foreground italic">
              <ShieldCheck className="w-4 h-4 text-primary opacity-40" />
              <p className="text-[9px] font-black uppercase tracking-widest opacity-40">Verified Institutional Inventory</p>
            </div>
          </CardFooter>
        </Card>
      </div>

      <Dialog open={isIssuingLoan} onOpenChange={setIsIssuingLoan}>
        <DialogContent className="sm:max-w-md rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl">
          <DialogHeader className="bg-primary p-8 text-white relative">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/10 rounded-xl">
                <BookMarked className="w-8 h-8 text-secondary" />
              </div>
              <div>
                <DialogTitle className="text-2xl font-black">Issue Material Loan</DialogTitle>
                <DialogDescription className="text-white/60">Registry authorization for pedagogical volumes.</DialogDescription>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setIsIssuingLoan(false)} className="absolute top-4 right-4 text-white hover:bg-white/10">
              <X className="w-6 h-6" />
            </Button>
          </DialogHeader>
          <div className="p-8 space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Select Borrower</Label>
                <Select value={loanFormData.borrowerId} onValueChange={(value) => setLoanFormData({ ...loanFormData, borrowerId: value })}>
                  <SelectTrigger className="h-12 bg-accent/30 border-none rounded-xl font-bold">
                    <SelectValue placeholder="Choose Borrower..." />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleBorrowers.map((borrower) => (
                      <SelectItem key={borrower.id} value={borrower.id}>
                        {borrower.name} ({borrower.matricule || borrower.id}) - {borrower.role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Select Volume</Label>
                <Select value={loanFormData.bookId} onValueChange={(value) => setLoanFormData({ ...loanFormData, bookId: value })}>
                  <SelectTrigger className="h-12 bg-accent/30 border-none rounded-xl font-bold">
                    <SelectValue placeholder="Choose Book..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableBooksForIssue.map((book) => (
                      <SelectItem key={book.id} value={book.id}>
                        {book.title} ({book.available_copies} available)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Standard Duration</Label>
                <div className="flex gap-2">
                  {["7", "14", "21"].map((duration) => (
                    <Button
                      key={duration}
                      variant={loanFormData.duration === duration ? "default" : "outline"}
                      className={cn("flex-1 h-11 rounded-xl font-black", loanFormData.duration === duration ? "bg-primary text-white" : "border-primary/10")}
                      onClick={() => setLoanFormData({ ...loanFormData, duration })}
                    >
                      {duration} Days
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="bg-accent/20 p-6 border-t border-accent">
            <Button className="w-full h-14 rounded-2xl shadow-xl font-black uppercase tracking-widest text-xs gap-3" onClick={handleIssueLoan} disabled={issueBookMutation.isPending}>
              {issueBookMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-5 h-5 text-secondary" />}
              Authorize Loan Issue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
