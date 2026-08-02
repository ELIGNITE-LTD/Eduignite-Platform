"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Heart, Loader2, ShieldCheck, Smartphone } from "lucide-react";

/**
 * Support: the footer "Support our Vision" contribution flow, unchanged in
 * functionality (same addSupport call), promoted to a full workspace page.
 */
export default function SupportUsPage() {
  const { user, addSupport } = useAuth();
  const { toast } = useToast();

  const [supportData, setSupportData] = useState({
    amount: "1000",
    method: "MTN MoMo",
    phone: "",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = () => {
    if (!supportData.phone || !user || !supportData.amount) return;
    setIsSubmitting(true);

    addSupport({
      userName: user.name,
      userRole: user.role,
      userAvatar: user.avatar || "",
      amount: parseInt(supportData.amount),
      method: supportData.method,
      phone: supportData.phone,
      message: supportData.message,
      schoolName: user.school?.name || "EduIgnite Node",
      uid: user.uid,
    })
      .then(() => {
        setIsSubmitting(false);
        setSupportData({ amount: "1000", method: "MTN MoMo", phone: "", message: "" });
        toast({
          title: "Contribution Received",
          description: "Thank you for supporting our institutional vision!",
        });
      })
      .catch((error) => {
        setIsSubmitting(false);
        toast({
          variant: "destructive",
          title: "Contribution Failed",
          description: getApiErrorMessage(error, "We could not record your support contribution right now."),
        });
      });
  };

  return (
    <div className="pb-4 space-y-4">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-foreground">Support Us</h1>
        <p className="mt-0.5 text-[13px] font-medium text-muted-foreground">
          Contribute to the school&apos;s digital evolution.
        </p>
      </div>

      <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/[0.04]">
        <div className="flex items-center gap-4 bg-primary p-5 text-white">
          <div className="rounded-2xl bg-white/10 p-3">
            <Heart className="h-7 w-7 text-secondary fill-secondary/20" />
          </div>
          <div>
            <p className="text-lg font-black uppercase leading-tight">Willing Support</p>
            <p className="text-xs text-white/60">Help strengthen our institutional digital vision.</p>
          </div>
        </div>

        <div className="space-y-5 p-5">
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">
              Contribution Amount (XAF)
            </Label>
            <div className="relative">
              <Input
                type="number"
                placeholder="Enter amount..."
                className="h-12 bg-accent/30 border-none rounded-xl font-black text-primary pl-14"
                value={supportData.amount}
                onChange={(e) => setSupportData({ ...supportData, amount: e.target.value })}
              />
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black text-primary/40">XAF</div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">
              Payment Method
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={supportData.method === "MTN MoMo" ? "default" : "outline"}
                className={cn("h-12 rounded-xl font-bold", supportData.method === "MTN MoMo" ? "border-primary" : "border-accent")}
                onClick={() => setSupportData({ ...supportData, method: "MTN MoMo" })}
              >
                MTN
              </Button>
              <Button
                type="button"
                variant={supportData.method === "Orange Money" ? "default" : "outline"}
                className={cn("h-12 rounded-xl font-bold", supportData.method === "Orange Money" ? "border-primary" : "border-accent")}
                onClick={() => setSupportData({ ...supportData, method: "Orange Money" })}
              >
                Orange
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">
              Mobile Number
            </Label>
            <div className="relative">
              <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/40" />
              <Input
                placeholder="6XX XX XX XX"
                className="h-12 pl-10 bg-accent/30 border-none rounded-xl font-bold"
                value={supportData.phone}
                onChange={(e) => setSupportData({ ...supportData, phone: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">
              Optional Note
            </Label>
            <Textarea
              placeholder="Leave a message of encouragement..."
              className="bg-accent/30 border-none rounded-xl min-h-[80px]"
              value={supportData.message}
              onChange={(e) => setSupportData({ ...supportData, message: e.target.value })}
            />
          </div>

          <Button
            className="w-full h-14 rounded-2xl shadow-xl font-black uppercase text-xs gap-3 bg-primary text-white hover:bg-primary/90"
            onClick={handleSubmit}
            disabled={isSubmitting || !supportData.phone || !supportData.amount}
          >
            {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5 text-secondary" />}
            Authorize Contribution
          </Button>
        </div>
      </div>
    </div>
  );
}
