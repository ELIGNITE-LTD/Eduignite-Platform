"use client";

import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  HelpCircle,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api/errors";
import { createFaq, deleteFaq, listFaqsGrouped, updateFaq, type FAQItem } from "../_lib/api";

interface FaqFormState {
  question: string;
  answer: string;
  category: string;
  order: string;
}

const emptyForm = (): FaqFormState => ({ question: "", answer: "", category: "General", order: "0" });

export default function FaqBuilderPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FaqFormState>(emptyForm());

  const { data: grouped = {}, isLoading, isError, refetch } = useQuery({
    queryKey: ["academy-admin", "faqs"],
    queryFn: listFaqsGrouped,
  });

  const categories = Object.keys(grouped).sort();
  const totalCount = categories.reduce((sum, category) => sum + grouped[category].length, 0);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["academy-admin", "faqs"] });

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (faq: FAQItem) => {
    setEditingId(faq.id);
    setForm({
      question: faq.question,
      answer: faq.answer,
      category: faq.category,
      order: String(faq.order ?? 0),
    });
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        question: form.question,
        answer: form.answer,
        category: form.category || "General",
        order: Number(form.order) || 0,
      };
      return editingId ? updateFaq(editingId, payload) : createFaq(payload);
    },
    onSuccess: () => {
      invalidate();
      setDialogOpen(false);
      toast({
        title: editingId ? "FAQ Updated" : "FAQ Created",
        description: "The public FAQ list reflects this immediately.",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: editingId ? "Update Failed" : "Creation Failed",
        description: getApiErrorMessage(error, "You need the PROFILE_EDIT Academy scope to manage FAQ entries."),
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteFaq(id),
    onSuccess: () => {
      invalidate();
      toast({ title: "FAQ Removed" });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Delete Failed",
        description: getApiErrorMessage(error, "You need the PROFILE_EDIT Academy scope to remove FAQ entries."),
      });
    },
  });

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-primary flex items-center gap-3">
            <div className="p-2 bg-primary rounded-xl shadow-lg text-white">
              <HelpCircle className="w-5 h-5 text-secondary" />
            </div>
            Resource &amp; FAQ Builder
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Question, answer, category and ordering for the public Academy FAQ section.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="h-10 px-4 rounded-xl border-primary/20 text-primary font-black uppercase tracking-widest w-fit">
            {totalCount} Entries
          </Badge>
          <Button onClick={openCreate} className="h-12 px-6 rounded-xl font-black uppercase tracking-widest text-xs gap-2">
            <Plus className="w-4 h-4" /> New FAQ
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="font-bold text-sm">Loading FAQ entries…</span>
        </div>
      )}

      {isError && !isLoading && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 bg-white/50 rounded-[2rem] border-2 border-dashed border-destructive/20">
          <AlertCircle className="w-12 h-12 text-destructive/30" />
          <p className="text-muted-foreground font-bold">Failed to load FAQ entries.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Retry
          </Button>
        </div>
      )}

      {!isLoading && !isError && (
        <div className="space-y-8">
          {categories.map((category) => (
            <div key={category} className="space-y-3">
              <h2 className="text-xs font-black uppercase tracking-[0.2em] text-primary/60">{category}</h2>
              <div className="grid grid-cols-1 gap-3">
                {grouped[category]
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((faq) => (
                    <Card key={faq.id} className="border-none shadow-md rounded-2xl">
                      <CardContent className="p-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-black text-primary text-sm">{faq.question}</h3>
                            <Badge variant="outline" className="text-[9px] border-primary/10 shrink-0">#{faq.order}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">{faq.answer}</p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button variant="outline" size="sm" className="gap-2 rounded-xl font-bold" onClick={() => openEdit(faq)}>
                            <Pencil className="w-3.5 h-3.5" /> Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive gap-2 rounded-xl"
                            onClick={() => deleteMutation.mutate(faq.id)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
              </div>
            </div>
          ))}

          {totalCount === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 bg-white/50 rounded-[2rem] border-2 border-dashed border-primary/10">
              <HelpCircle className="w-16 h-16 text-primary/10" />
              <p className="text-muted-foreground font-medium max-w-md">
                No FAQ entries yet. Create one below to populate the public Academy FAQ section.
              </p>
            </div>
          )}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit FAQ Entry" : "New FAQ Entry"}</DialogTitle>
            <DialogDescription>Requires the PROFILE_EDIT Academy scope. Enforced server-side.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Question</Label>
              <Input
                value={form.question}
                onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))}
                placeholder="e.g. How long does a course take?"
                className="h-11 rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Answer</Label>
              <Textarea
                value={form.answer}
                onChange={(e) => setForm((f) => ({ ...f, answer: e.target.value }))}
                className="min-h-[120px] rounded-xl"
                placeholder="The public-facing answer."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Category</Label>
                <Input
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  placeholder="e.g. Enrollment"
                  className="h-11 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Order</Label>
                <Input
                  type="number"
                  value={form.order}
                  onChange={(e) => setForm((f) => ({ ...f, order: e.target.value }))}
                  className="h-11 rounded-xl"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !form.question || !form.answer}
              className="gap-2 rounded-xl font-black uppercase tracking-widest text-xs"
            >
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {editingId ? "Save Changes" : "Create FAQ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
