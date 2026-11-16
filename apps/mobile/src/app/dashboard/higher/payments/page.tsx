"use client";

import { Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePayments } from "@/lib/hooks/useFees";

export default function HigherPaymentsPage() {
  const { data, isLoading, isError } = usePayments({ limit: 50 });
  const rows = data?.results ?? [];
  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <div>
        <h1 className="font-headline text-2xl font-bold tracking-tight">Payments</h1>
        <p className="mt-1 text-sm text-muted-foreground">The latest payments recorded. To record a new one, open Fees.</p>
      </div>
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading payments...</p>
          ) : isError ? (
            <p className="p-6 text-sm text-muted-foreground">We could not load the payments right now. Please try again later.</p>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Receipt className="h-8 w-8 text-muted-foreground" aria-hidden />
              <p className="font-medium">No payments yet</p>
              <p className="text-sm text-muted-foreground">Payments you record in Fees will be listed here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Student</TableHead>
                    <TableHead>Fee</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="pl-6 font-medium">{p.payer_name ?? p.payer?.name ?? "-"}</TableCell>
                      <TableCell>{p.fee_name ?? p.payment_method ?? "-"}</TableCell>
                      <TableCell>{`XAF ${Number(p.amount || 0).toLocaleString()}`}</TableCell>
                      <TableCell><Badge variant="outline">{p.status}</Badge></TableCell>
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
