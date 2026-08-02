
"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  Heart,
  Coins,
  Building2,
  Clock,
  CheckCircle2,
  Smartphone,
  Loader2,
  Package,
  Mail,
  Phone,
  MapPin,
  User,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ordersService } from "@/lib/api/services/orders.service";
import { supportService } from "@/lib/api/services/support.service";
import { platformService } from "@/lib/api/services/platform.service";
import { MessageSquare } from "lucide-react";

const normalizeList = (payload: any) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
};

const usePlatformOrders = () =>
  useQuery({
    queryKey: ["platform-orders"],
    queryFn: async () => normalizeList(await ordersService.getOrders()),
    retry: 2,
  });

const useProcessOrder = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: string; notes?: string }) =>
      ordersService.updateOrder(id, { status, notes } as any),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["platform-orders"] }),
  });
};

const useSupportContributions = () =>
  useQuery({
    queryKey: ["support-contributions"],
    queryFn: async () => normalizeList(await supportService.getSupportContributions()),
    retry: 2,
  });

const useContactMessages = (enabled: boolean) =>
  useQuery({
    queryKey: ["contact-messages"],
    queryFn: async () => normalizeList(await platformService.getContactMessages()),
    enabled,
    retry: 2,
  });

const useVerifyContribution = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => supportService.verifySupport(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["support-contributions"] }),
  });
};

const ORDER_STATUS_CYCLE: Record<string, string> = {
  pending: "contacted",
  contacted: "processed",
  processed: "processed",
  rejected: "contacted",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  contacted: "bg-blue-100 text-blue-700",
  processed: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

export default function SupportLedgerPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const isSuperAdmin = ["SUPER_ADMIN", "CEO", "CTO", "COO"].includes(user?.role || "");

  const {
    data: orders = [],
    isLoading: ordersLoading,
    isError: ordersError,
    refetch: refetchOrders,
  } = usePlatformOrders();

  const {
    data: contributions = [],
    isLoading: contribLoading,
    isError: contribError,
    refetch: refetchContrib,
  } = useSupportContributions();

  const {
    data: messages = [],
    isLoading: messagesLoading,
    isError: messagesError,
    refetch: refetchMessages,
  } = useContactMessages(isSuperAdmin);

  const processOrderMutation = useProcessOrder();
  const verifyContribMutation = useVerifyContribution();

  // Contribute to EduIgnite via PayUnit mobile money.
  const CONTRIB_OPERATORS = [
    { value: "mtn_momo", label: "MTN MoMo" },
    { value: "orange_money", label: "Orange Money" },
  ];
  const [contributeOpen, setContributeOpen] = useState(false);
  const [cAmount, setCAmount] = useState("");
  const [cOperator, setCOperator] = useState("mtn_momo");
  const [cPhone, setCPhone] = useState("");
  const [cMessage, setCMessage] = useState("");
  const [cTxn, setCTxn] = useState<any | null>(null);
  const [cStarting, setCStarting] = useState(false);
  const cPoll = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopCPoll = () => { if (cPoll.current) { clearInterval(cPoll.current); cPoll.current = null; } };
  useEffect(() => stopCPoll, []);

  const startContribute = async () => {
    const amt = Number(cAmount);
    if (!amt || amt <= 0) { toast({ variant: "destructive", title: "Amount required", description: "Enter a valid amount." }); return; }
    if (!cPhone.trim()) { toast({ variant: "destructive", title: "Phone required", description: "Enter the mobile money number." }); return; }
    setCStarting(true);
    try {
      const created = await supportService.collectSupport({ amount: amt, phone: cPhone.trim(), operator: cOperator, message: cMessage });
      setCTxn(created);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Mobile money failed", description: error?.response?.data?.detail || "Could not start the request." });
    } finally {
      setCStarting(false);
    }
  };

  useEffect(() => {
    stopCPoll();
    if (!cTxn?.transaction_id) return;

    const succeed = () => {
      stopCPoll(); setCTxn(null); setContributeOpen(false); setCAmount(""); setCPhone(""); setCMessage("");
      refetchContrib();
      toast({ title: "Thank you!", description: "Your contribution was received." });
    };

    if (cTxn.status === "SUCCESS") { succeed(); return; }
    if (cTxn.status !== "PENDING") return;

    const tick = async () => {
      try {
        const updated = await supportService.supportPaymentStatus(cTxn.transaction_id);
        if (updated.status === "SUCCESS") {
          succeed();
        } else if (updated.status === "FAILED" || updated.status === "CANCELLED") {
          stopCPoll(); setCTxn(updated);
          toast({ variant: "destructive", title: "Payment not completed", description: "The mobile money payment was not completed." });
        }
      } catch { /* keep polling */ }
    };
    void tick();
    cPoll.current = setInterval(tick, 2500);
    return stopCPoll;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cTxn?.transaction_id, cTxn?.status]);

  const handleAdvanceOrder = async (order: any) => {
    const nextStatus = ORDER_STATUS_CYCLE[order.status] ?? "contacted";
    try {
      await processOrderMutation.mutateAsync({ id: String(order.id), status: nextStatus });
      toast({ title: "Order Updated", description: `Status advanced to ${nextStatus}.` });
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to update order." });
    }
  };

  const handleVerify = async (id: string) => {
    try {
      await verifyContribMutation.mutateAsync(id);
      toast({ title: "Contribution Verified", description: "Appreciation message dispatched." });
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to verify contribution." });
    }
  };

  if (!isSuperAdmin) return null;

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary font-headline flex items-center gap-3">
            <div className="p-2 bg-primary rounded-xl shadow-lg text-white">
              <Heart className="w-6 h-6 text-secondary fill-secondary/20" />
            </div>
            Support & Orders
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage platform onboarding orders and community contributions.
          </p>
        </div>
      </div>

      <Card className="border-none bg-primary text-white shadow-xl rounded-[2rem] overflow-hidden">
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-lg font-black uppercase tracking-tight"><Heart className="h-5 w-5 text-secondary" /> Support EduIgnite</p>
            <p className="mt-1 max-w-xl text-sm text-white/70">Contribute to the platform through MTN or Orange mobile money. Every contribution keeps EduIgnite running.</p>
          </div>
          <Button onClick={() => { setContributeOpen(true); setCTxn(null); setCPhone(""); setCAmount(""); }} className="h-11 gap-2 rounded-xl bg-white font-black text-primary hover:bg-white/90">
            <Smartphone className="h-4 w-4" /> Contribute
          </Button>
        </CardContent>
      </Card>

      <Dialog open={contributeOpen} onOpenChange={(open) => { if (!open) { setContributeOpen(false); setCTxn(null); stopCPoll(); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary"><Heart className="h-5 w-5 text-secondary" /> Support EduIgnite</DialogTitle>
            <DialogDescription>Contribute via mobile money. You&apos;ll approve the payment on your phone.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Amount (XAF)</Label>
              <Input type="number" value={cAmount} onChange={(e) => setCAmount(e.target.value)} placeholder="e.g. 5000" className="h-11 rounded-xl" disabled={cTxn?.status === "PENDING"} />
            </div>
            <div className="space-y-2">
              <Label>Mobile Money</Label>
              <div className="grid grid-cols-2 gap-2">
                {CONTRIB_OPERATORS.map((op) => (
                  <button key={op.value} type="button" onClick={() => setCOperator(op.value)} className={cn("rounded-xl border p-3 text-sm font-black transition-all", cOperator === op.value ? "border-primary bg-primary/5 ring-1 ring-primary text-primary" : "hover:bg-accent/20")}>{op.label}</button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>{cOperator === "orange_money" ? "Orange" : "MTN"} Money Number</Label>
              <Input value={cPhone} onChange={(e) => setCPhone(e.target.value)} placeholder="6XXXXXXXX" className="h-11 rounded-xl" disabled={cTxn?.status === "PENDING"} />
            </div>
            <div className="space-y-2">
              <Label>Message (optional)</Label>
              <Input value={cMessage} onChange={(e) => setCMessage(e.target.value)} placeholder="A word of encouragement" className="h-11 rounded-xl" />
            </div>
            {cTxn?.status === "PENDING" ? (
              <div className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm font-semibold text-primary"><Loader2 className="h-5 w-5 animate-spin" /> Approve the payment on the phone. Waiting for confirmation...</div>
            ) : null}
            {cTxn?.status === "FAILED" || cTxn?.status === "CANCELLED" ? (
              <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">The payment was not completed. You can try again.</div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setContributeOpen(false); setCTxn(null); stopCPoll(); }}>Close</Button>
            <Button onClick={startContribute} disabled={cStarting || cTxn?.status === "PENDING"} className="gap-2">
              {cStarting || cTxn?.status === "PENDING" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />} Contribute
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="orders" className="w-full">
        <TabsList className="grid grid-cols-3 w-full md:w-[560px] mb-8 bg-white shadow-sm border h-auto p-1 rounded-2xl">
          <TabsTrigger value="orders" className="gap-2 py-3 rounded-xl transition-all font-bold">
            <Package className="w-4 h-4" /> Platform Orders
            {orders.length > 0 && (
              <Badge className="ml-1 h-5 px-2 text-[9px] bg-primary text-white border-none">
                {orders.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="contributions" className="gap-2 py-3 rounded-xl transition-all font-bold">
            <Coins className="w-4 h-4" /> Contributions
            {contributions.length > 0 && (
              <Badge className="ml-1 h-5 px-2 text-[9px] bg-secondary text-primary border-none">
                {contributions.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="messages" className="gap-2 py-3 rounded-xl transition-all font-bold">
            <MessageSquare className="w-4 h-4" /> Messages
            {messages.length > 0 && (
              <Badge className="ml-1 h-5 px-2 text-[9px] bg-primary text-white border-none">
                {messages.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* PLATFORM ORDERS TAB */}
        <TabsContent value="orders" className="mt-0 animate-in fade-in">
          {ordersLoading && (
            <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="font-bold text-sm">Loading orders…</span>
            </div>
          )}

          {ordersError && !ordersLoading && (
            <div className="flex flex-col items-center justify-center py-20 gap-4 bg-white/50 rounded-[2rem] border-2 border-dashed border-destructive/20">
              <AlertCircle className="w-12 h-12 text-destructive/30" />
              <p className="text-muted-foreground font-bold">Failed to load orders.</p>
              <Button variant="outline" size="sm" onClick={() => refetchOrders()} className="gap-2">
                <RefreshCw className="w-4 h-4" /> Retry
              </Button>
            </div>
          )}

          {!ordersLoading && !ordersError && orders.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 bg-white/50 rounded-[2rem] border-2 border-dashed border-primary/10">
              <Package className="w-16 h-16 text-primary/10" />
              <p className="text-muted-foreground font-bold">No onboarding orders in the registry.</p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-6">
            {orders.map((order: any) => (
              <Card key={order.id} className="border-none shadow-xl overflow-hidden hover:shadow-2xl transition-all duration-300 bg-white rounded-[2rem]">
                <CardHeader className="bg-primary/5 border-b px-6 py-4 flex flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-primary/10 rounded-2xl">
                      <Package className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-black text-primary text-sm uppercase tracking-tight leading-tight">
                        {order.full_name}
                      </h3>
                      <p className="text-[10px] text-muted-foreground font-bold uppercase">
                        {order.occupation}
                      </p>
                    </div>
                  </div>
                  <Badge className={cn("font-black uppercase text-[9px] px-3 py-1", STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-600")}>
                    {order.status}
                  </Badge>
                </CardHeader>
                <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Building2 className="w-4 h-4 text-primary/50 shrink-0" />
                      <span className="font-bold text-primary">{order.school_name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="w-4 h-4 text-primary/50 shrink-0" />
                      <span className="text-muted-foreground">{order.email}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="w-4 h-4 text-primary/50 shrink-0" />
                      <span className="text-muted-foreground">{order.whatsapp_number}</span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="w-4 h-4 text-primary/50 shrink-0" />
                      <span className="text-muted-foreground">
                        {order.region}, {order.division}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="w-4 h-4 text-primary/50 shrink-0" />
                      <span className="text-muted-foreground text-xs">
                        {new Date(order.created_at).toLocaleString()}
                      </span>
                    </div>
                    {order.processed_by_name && (
                      <div className="flex items-center gap-2 text-sm">
                        <User className="w-4 h-4 text-primary/50 shrink-0" />
                        <span className="text-muted-foreground text-xs">
                          Processed by: <strong>{order.processed_by_name}</strong>
                        </span>
                      </div>
                    )}
                  </div>
                  {order.message && (
                    <div className="md:col-span-2 bg-accent/30 rounded-xl p-4 italic text-sm text-muted-foreground">
                      "{order.message}"
                    </div>
                  )}
                </CardContent>
                {order.status !== "processed" && (
                  <CardFooter className="bg-accent/10 px-6 py-4 border-t">
                    <Button
                      onClick={() => handleAdvanceOrder(order)}
                      disabled={processOrderMutation.isPending}
                      className="gap-2 bg-primary text-white font-bold"
                    >
                      {processOrderMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4" />
                      )}
                      {order.status === "pending" ? "Mark as Contacted" : "Mark as Processed"}
                    </Button>
                  </CardFooter>
                )}
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* CONTRIBUTIONS TAB */}
        <TabsContent value="contributions" className="mt-0 animate-in fade-in">
          {contribLoading && (
            <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="font-bold text-sm">Loading contributions…</span>
            </div>
          )}

          {contribError && !contribLoading && (
            <div className="flex flex-col items-center justify-center py-20 gap-4 bg-white/50 rounded-[2rem] border-2 border-dashed border-destructive/20">
              <AlertCircle className="w-12 h-12 text-destructive/30" />
              <p className="text-muted-foreground font-bold">Failed to load contributions.</p>
              <Button variant="outline" size="sm" onClick={() => refetchContrib()} className="gap-2">
                <RefreshCw className="w-4 h-4" /> Retry
              </Button>
            </div>
          )}

          {!contribLoading && !contribError && contributions.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 bg-white/50 rounded-[2rem] border-2 border-dashed border-primary/10">
              <Heart className="w-16 h-16 text-primary/10" />
              <p className="text-muted-foreground font-bold">No contributions in the ledger yet.</p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-6">
            {contributions.map((entry: any) => (
              <Card key={entry.id} className="border-none shadow-xl overflow-hidden hover:shadow-2xl transition-all duration-300">
                <div className="flex flex-col md:flex-row">
                  <div className="w-full md:w-64 bg-accent/20 border-r p-6 flex flex-col items-center text-center space-y-4 shrink-0">
                    <Avatar className="h-20 w-20 border-4 border-white shadow-xl">
                      <AvatarImage src={entry.user_avatar} />
                      <AvatarFallback className="bg-primary text-white text-2xl font-bold">
                        {entry.user_name?.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="space-y-1">
                      <h3 className="font-black text-primary text-sm uppercase leading-tight">
                        {entry.user_name}
                      </h3>
                    </div>
                    {entry.school && (
                      <div className="flex items-center justify-center gap-1 text-primary/60">
                        <Building2 className="w-3 h-3" />
                        <span className="text-[10px] font-bold">{entry.school}</span>
                      </div>
                    )}
                    <Badge
                      className={cn(
                        "w-full justify-center py-1 font-black uppercase text-[9px]",
                        entry.status === "Verified" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                      )}
                    >
                      {entry.status === "Verified" ? (
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                      ) : (
                        <Clock className="w-3 h-3 mr-1" />
                      )}
                      {entry.status}
                    </Badge>
                  </div>

                  <div className="flex-1 p-6 md:p-8 flex flex-col">
                    <div className="grid grid-cols-2 gap-8 mb-6">
                      <div className="space-y-1">
                        <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest flex items-center gap-2">
                          <Coins className="w-3 h-3 text-secondary" /> Contribution
                        </p>
                        <div className="flex items-baseline gap-1">
                          <span className="text-3xl font-black text-primary">
                            {Number(entry.amount).toLocaleString()}
                          </span>
                          <span className="text-xs font-bold text-muted-foreground">
                            {entry.currency || "XAF"}
                          </span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest flex items-center gap-2">
                          <Smartphone className="w-3 h-3 text-secondary" /> Method
                        </p>
                        <Badge variant="outline" className="h-7 px-3 bg-white text-primary font-black uppercase text-[10px]">
                          {entry.payment_method}
                        </Badge>
                        <p className="text-[10px] font-mono font-bold text-muted-foreground mt-1">{entry.phone}</p>
                      </div>
                    </div>

                    <div className="bg-white/50 border border-accent rounded-2xl p-6 italic text-sm text-muted-foreground leading-relaxed flex-1">
                      "{entry.message || "No message provided."}"
                    </div>

                    <div className="mt-6 pt-6 border-t flex justify-between items-center">
                      <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest italic flex items-center gap-2">
                        <Clock className="w-4 h-4 text-primary/40" />
                        Received: {new Date(entry.created_at).toLocaleString()}
                      </span>
                      <Button
                        className="gap-2 shadow-lg"
                        onClick={() => handleVerify(String(entry.id))}
                        disabled={entry.status === "Verified" || verifyContribMutation.isPending}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        {entry.status === "Verified" ? "Appreciation Sent" : "Verify & Appreciate"}
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* WEBSITE MESSAGES TAB */}
        <TabsContent value="messages" className="mt-0 animate-in fade-in">
          {messagesLoading && (
            <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="font-bold text-sm">Loading messages…</span>
            </div>
          )}

          {messagesError && !messagesLoading && (
            <div className="flex flex-col items-center justify-center py-20 gap-4 bg-white/50 rounded-[2rem] border-2 border-dashed border-destructive/20">
              <AlertCircle className="w-12 h-12 text-destructive/30" />
              <p className="text-muted-foreground font-bold">Failed to load messages.</p>
              <Button variant="outline" size="sm" onClick={() => refetchMessages()} className="gap-2">
                <RefreshCw className="w-4 h-4" /> Retry
              </Button>
            </div>
          )}

          {!messagesLoading && !messagesError && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 bg-white/50 rounded-[2rem] border-2 border-dashed border-primary/10">
              <MessageSquare className="w-16 h-16 text-primary/10" />
              <p className="text-muted-foreground font-bold">No messages from the website yet.</p>
              <p className="text-muted-foreground/70 text-xs max-w-sm">
                Messages sent from the public contact form appear here.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {messages.map((m: any) => (
              <Card key={m.id} className="border-none shadow-xl overflow-hidden bg-white rounded-[1.5rem]">
                <CardHeader className="bg-primary/5 border-b px-6 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-black text-primary text-sm uppercase tracking-tight leading-tight truncate">
                        {m.subject || "No subject"}
                      </h3>
                      <p className="text-[11px] text-muted-foreground font-bold mt-0.5 truncate">
                        {m.name} · {m.email}
                      </p>
                    </div>
                    <Badge className="shrink-0 bg-amber-100 text-amber-700 font-black uppercase text-[9px] px-3 py-1">
                      {m.status || "New"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{m.message}</p>
                  <div className="flex items-center justify-between border-t pt-4">
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-primary/40" />
                      {new Date(m.created_at).toLocaleString()}
                    </span>
                    <a
                      href={`mailto:${m.email}?subject=${encodeURIComponent("Re: " + (m.subject || "your message"))}`}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
                    >
                      <Mail className="w-3.5 h-3.5" /> Reply by email
                    </a>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
