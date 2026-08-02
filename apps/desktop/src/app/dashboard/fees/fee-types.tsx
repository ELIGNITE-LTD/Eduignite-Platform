"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Coins, Loader2, Plus, Tag, Trash2 } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { feesService } from "@/lib/api/services/fees.service";
import { useHierarchyClasses } from "@/lib/hooks/useSchools";
import { getApiErrorMessage } from "@/lib/api/errors";
import { money } from "./fee-receipt";

const ALL = "all";

const normalizeList = (payload: any): any[] =>
  Array.isArray(payload) ? payload : Array.isArray(payload?.results) ? payload.results : [];

/**
 * Fee Type tab — the bursar / school admin adds a fee type with a name, amount,
 * an optional sub-school and an optional class. The fee then shows up in the
 * fee tab of every matching student (and their parents, labelled per child).
 */
export function FeeTypes() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [subSchool, setSubSchool] = useState(ALL);
  const [schoolClass, setSchoolClass] = useState(ALL);

  const classesQuery = useHierarchyClasses(undefined, true);
  const feesQuery = useQuery({
    queryKey: ["fee-types-list"],
    queryFn: async () => normalizeList(await feesService.getFeeStructures({ page_size: 200 } as any)),
  });

  const classes = normalizeList(classesQuery.data);
  const feeTypes = feesQuery.data || [];

  const subSchools = useMemo(() => {
    const map = new Map<string, string>();
    classes.forEach((c: any) => {
      if (c.sub_school && c.sub_school_name) map.set(String(c.sub_school), c.sub_school_name);
    });
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
  }, [classes]);

  const classOptions = useMemo(() => {
    if (subSchool === ALL) return classes;
    return classes.filter((c: any) => String(c.sub_school) === subSchool);
  }, [classes, subSchool]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const value = Number(amount);
      if (!name.trim()) throw new Error("Enter a fee name.");
      if (!Number.isFinite(value) || value < 0) throw new Error("Enter a valid amount.");
      return feesService.createFeeStructure({
        name: name.trim(),
        role: "STUDENT",
        amount: amount as any,
        currency: "XAF",
        sub_school: subSchool !== ALL ? subSchool : undefined,
        school_class: schoolClass !== ALL ? schoolClass : undefined,
        is_mandatory: true,
      } as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fee-types-list"] });
      queryClient.invalidateQueries({ queryKey: ["bursar-fee-types"] });
      setName(""); setAmount(""); setSubSchool(ALL); setSchoolClass(ALL);
      toast({ title: "Fee type added", description: "It now appears in the fee tab of every matching student and parent." });
    },
    onError: (error: any) =>
      toast({ variant: "destructive", title: "Could not add fee type", description: getApiErrorMessage(error, error?.message || "Please try again.") }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => feesService.deleteFeeStructure(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fee-types-list"] });
      queryClient.invalidateQueries({ queryKey: ["bursar-fee-types"] });
      toast({ title: "Fee type removed" });
    },
    onError: (error: any) =>
      toast({ variant: "destructive", title: "Could not remove fee type", description: getApiErrorMessage(error, "Please try again.") }),
  });

  const targetLabel = (fee: any) => {
    if (fee.school_class_name) return `${fee.school_class_name}${fee.sub_school_name ? ` · ${fee.sub_school_name}` : ""}`;
    if (fee.sub_school_name) return `All classes · ${fee.sub_school_name}`;
    return "All students";
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
      {/* Add fee type */}
      <Card className="border-none shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-black text-primary">
            <Plus className="h-5 w-5 text-secondary" /> Add Fee Type
          </CardTitle>
          <CardDescription>Name the fee, set the amount, and choose who it applies to.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-11 rounded-xl" placeholder="e.g. School Fees, PTA Levy, Exam Fee" />
          </div>
          <div className="space-y-2">
            <Label>Amount ({"XAF"})</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-11 rounded-xl" placeholder="0" />
          </div>
          <div className="space-y-2">
            <Label>Sub-School</Label>
            <Select value={subSchool} onValueChange={(v) => { setSubSchool(v); setSchoolClass(ALL); }}>
              <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All sub-schools</SelectItem>
                {subSchools.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Class</Label>
            <Select value={schoolClass} onValueChange={setSchoolClass}>
              <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All classes</SelectItem>
                {classOptions.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}{c.sub_school_name ? ` · ${c.sub_school_name}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">Leave both on “All” to charge every student, or narrow to a sub-school and/or class.</p>
          </div>
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="h-12 w-full gap-2 rounded-xl font-black uppercase">
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />}
            Add Fee Type
          </Button>
        </CardContent>
      </Card>

      {/* Existing fee types */}
      <Card className="border-none shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-black text-primary">
            <Tag className="h-5 w-5 text-secondary" /> Fee Types
          </CardTitle>
          <CardDescription>Every fee type appears in the fee tab of the students it applies to.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Fee</TableHead>
                  <TableHead>Applies To</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead className="text-right pr-6">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {feesQuery.isLoading ? (
                  <TableRow><TableCell colSpan={4} className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-primary/40" /></TableCell></TableRow>
                ) : feeTypes.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">No fee types yet. Add your first one on the left.</TableCell></TableRow>
                ) : feeTypes.map((fee: any) => (
                  <TableRow key={fee.id}>
                    <TableCell className="pl-6">
                      <p className="font-bold text-primary">{fee.name}</p>
                    </TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px] font-bold">{targetLabel(fee)}</Badge></TableCell>
                    <TableCell className="font-black text-secondary">{money(fee.amount, fee.currency || "XAF")}</TableCell>
                    <TableCell className="pr-6 text-right">
                      <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => deleteMutation.mutate(String(fee.id))} disabled={deleteMutation.isPending}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default FeeTypes;
