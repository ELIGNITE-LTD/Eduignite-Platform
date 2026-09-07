"use client";

import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  Users,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  Info,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api/errors";
import {
  createTrainer,
  deleteTrainer,
  listTrainers,
  updateTrainer,
  type TrainerProfileItem,
} from "../_lib/api";

interface TrainerFormState {
  user: string;
  bio: string;
  photo_url: string;
  credentials: string;
  is_verified: boolean;
}

const emptyForm = (): TrainerFormState => ({
  user: "",
  bio: "",
  photo_url: "",
  credentials: "",
  is_verified: false,
});

export default function TrainerProfilesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<TrainerFormState>(emptyForm());

  const { data: trainers = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["academy-admin", "trainers"],
    queryFn: listTrainers,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["academy-admin", "trainers"] });

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (trainer: TrainerProfileItem) => {
    setEditingId(trainer.id);
    setForm({
      user: trainer.user_id,
      bio: trainer.bio ?? "",
      photo_url: trainer.photo_url ?? "",
      credentials: trainer.credentials ?? "",
      is_verified: trainer.is_verified,
    });
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        user: form.user,
        bio: form.bio,
        photo_url: form.photo_url || undefined,
        credentials: form.credentials,
        is_verified: form.is_verified,
      };
      return editingId ? updateTrainer(editingId, payload) : createTrainer(payload);
    },
    onSuccess: () => {
      invalidate();
      setDialogOpen(false);
      toast({
        title: editingId ? "Trainer Profile Updated" : "Trainer Profile Created",
        description: "The public trainer directory reflects this immediately once verified.",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: editingId ? "Update Failed" : "Creation Failed",
        description: getApiErrorMessage(error, "You need the PROFILE_EDIT Academy scope to manage trainer profiles."),
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteTrainer(id),
    onSuccess: () => {
      invalidate();
      toast({ title: "Trainer Profile Removed" });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Delete Failed",
        description: getApiErrorMessage(error, "You need the PROFILE_EDIT Academy scope to remove trainer profiles."),
      });
    },
  });

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-primary flex items-center gap-3">
            <div className="p-2 bg-primary rounded-xl shadow-lg text-white">
              <Users className="w-5 h-5 text-secondary" />
            </div>
            Trainer Profile &amp; Bio Manager
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Bio, photo, credentials and verification status for the public trainer directory.
          </p>
        </div>
        <Button onClick={openCreate} className="h-12 px-6 rounded-xl font-black uppercase tracking-widest text-xs gap-2">
          <Plus className="w-4 h-4" /> New Trainer Profile
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="font-bold text-sm">Loading trainer profiles…</span>
        </div>
      )}

      {isError && !isLoading && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 bg-white/50 rounded-[2rem] border-2 border-dashed border-destructive/20">
          <AlertCircle className="w-12 h-12 text-destructive/30" />
          <p className="text-muted-foreground font-bold">Failed to load trainer profiles.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Retry
          </Button>
        </div>
      )}

      {!isLoading && !isError && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {trainers.map((trainer) => (
            <Card key={trainer.id} className="border-none shadow-md rounded-2xl overflow-hidden flex flex-col">
              <div className="aspect-[3/2] bg-accent/30 flex items-center justify-center overflow-hidden">
                {trainer.photo_url ? (
                  <img src={trainer.photo_url} alt={trainer.name} className="w-full h-full object-cover" />
                ) : (
                  <Users className="w-10 h-10 text-primary/20" />
                )}
              </div>
              <CardContent className="p-5 flex-1 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-black text-primary text-sm leading-tight">{trainer.name}</h3>
                  {trainer.is_verified ? (
                    <Badge className="bg-emerald-100 text-emerald-700 border-none text-[9px] uppercase font-black shrink-0">
                      <ShieldCheck className="w-3 h-3 mr-1" /> Verified
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[9px] border-primary/10 shrink-0">Unverified</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground line-clamp-3 flex-1">{trainer.bio}</p>
                <p className="text-[10px] text-muted-foreground font-bold uppercase line-clamp-1">{trainer.credentials}</p>
                <div className="flex gap-2 mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-2 rounded-xl font-bold"
                    onClick={() => openEdit(trainer)}
                  >
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive gap-2 rounded-xl"
                    onClick={() => deleteMutation.mutate(trainer.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          {trainers.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-20 text-center space-y-4 bg-white/50 rounded-[2rem] border-2 border-dashed border-primary/10">
              <Users className="w-16 h-16 text-primary/10" />
              <p className="text-muted-foreground font-medium max-w-md">
                No trainer profiles yet. Create one below and mark it verified to surface it on the public directory.
              </p>
            </div>
          )}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Trainer Profile" : "New Trainer Profile"}</DialogTitle>
            <DialogDescription>Requires the PROFILE_EDIT Academy scope. Enforced server-side.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">User ID</Label>
              <Input
                value={form.user}
                onChange={(e) => setForm((f) => ({ ...f, user: e.target.value }))}
                placeholder="Platform user ID this profile belongs to"
                className="h-11 rounded-xl"
                disabled={Boolean(editingId)}
              />
              {!editingId && (
                <div className="bg-primary/5 p-3 rounded-xl border border-primary/10 flex items-start gap-2">
                  <Info className="w-4 h-4 text-primary opacity-40 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-muted-foreground italic">
                    The user this trainer profile is linked to. Each user may have only one trainer profile.
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Photo URL</Label>
              <Input
                value={form.photo_url}
                onChange={(e) => setForm((f) => ({ ...f, photo_url: e.target.value }))}
                placeholder="https://..."
                className="h-11 rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Bio</Label>
              <Textarea
                value={form.bio}
                onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                className="min-h-[100px] rounded-xl"
                placeholder="Short public bio shown on the trainer directory."
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Credentials</Label>
              <Textarea
                value={form.credentials}
                onChange={(e) => setForm((f) => ({ ...f, credentials: e.target.value }))}
                className="min-h-[80px] rounded-xl"
                placeholder="Certifications, degrees, prior experience…"
              />
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl border bg-accent/10">
              <div>
                <p className="text-xs font-bold text-primary">Verified</p>
                <p className="text-[10px] text-muted-foreground">Only verified trainers appear on the public directory.</p>
              </div>
              <Switch
                checked={form.is_verified}
                onCheckedChange={(checked) => setForm((f) => ({ ...f, is_verified: checked }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !form.user || !form.bio}
              className="gap-2 rounded-xl font-black uppercase tracking-widest text-xs"
            >
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {editingId ? "Save Changes" : "Create Profile"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
