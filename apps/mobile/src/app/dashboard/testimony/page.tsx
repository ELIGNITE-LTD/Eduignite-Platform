"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api/errors";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Info, Loader2, Quote, Send } from "lucide-react";

/**
 * Testimony: the footer "Give Testimony" flow, unchanged in functionality
 * (same addTestimony call), promoted to a full workspace page.
 */
export default function TestimonyPage() {
  const { user, addTestimony } = useAuth();
  const { toast } = useToast();

  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = () => {
    if (!message.trim() || !user) return;
    setIsSubmitting(true);

    addTestimony({
      userId: user.id,
      name: user.name,
      profileImage: user.avatar || "",
      role: user.role,
      schoolName: user.school?.name || "Institution Node",
      message,
    })
      .then(() => {
        setIsSubmitting(false);
        setMessage("");
        toast({
          title: "Testimony Received",
          description: "Your story has been submitted for review.",
        });
      })
      .catch((error) => {
        setIsSubmitting(false);
        toast({
          variant: "destructive",
          title: "Submission Failed",
          description: getApiErrorMessage(error, "We could not submit your testimony right now."),
        });
      });
  };

  return (
    <div className="pb-4 space-y-4">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-foreground">Testimony</h1>
        <p className="mt-0.5 text-[13px] font-medium text-muted-foreground">
          Share your experience with the community.
        </p>
      </div>

      <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/[0.04]">
        <div className="flex items-center gap-4 bg-primary p-5 text-white">
          <div className="rounded-2xl bg-white/10 p-3">
            <Quote className="h-7 w-7 text-secondary" />
          </div>
          <div>
            <p className="text-lg font-black uppercase leading-tight">Share Your Story</p>
            <p className="text-xs text-white/60">Help showcase the excellence of our institution.</p>
          </div>
        </div>

        <div className="space-y-5 p-5">
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Your Message
            </Label>
            <Textarea
              placeholder="Share your experience..."
              className="min-h-[150px] bg-accent/30 border-none rounded-2xl focus-visible:ring-primary p-4"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
            />
          </div>

          <div className="bg-primary/5 p-4 rounded-xl border border-primary/10 flex items-center gap-3">
            <Info className="w-5 h-5 text-primary opacity-40 shrink-0" />
            <p className="text-[10px] text-muted-foreground italic">
              Your professional profile details will be attached to this submission.
            </p>
          </div>

          <Button
            className="w-full h-14 rounded-2xl shadow-xl font-black uppercase text-xs gap-3 bg-primary text-white hover:bg-primary/90"
            onClick={handleSubmit}
            disabled={isSubmitting || !message.trim()}
          >
            {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            Submit for Review
          </Button>
        </div>
      </div>
    </div>
  );
}
