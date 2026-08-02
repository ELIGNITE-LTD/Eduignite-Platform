"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Ban, ShieldCheck, Trash2, Loader2 } from "lucide-react";
import { usersService } from "@/lib/api/services/users.service";
import { getApiErrorMessage } from "@/lib/api/errors";
import { useToast } from "@/hooks/use-toast";

/**
 * School-admin moderation controls for a single user: suspend for a number of
 * days (cancellable at any time) and permanent deletion of the user and all
 * their data. Reused across the staff and student registries.
 */
export function UserModerationControls({
  user,
  onChanged,
  compact = false,
}: {
  user: any;
  onChanged?: () => void;
  compact?: boolean;
}) {
  const { toast } = useToast();
  const userId = user?.id || user?.user?.id;
  const userName = user?.name || user?.user?.name || "this user";
  const isSuspended = user?.is_suspended ?? user?.user?.is_suspended ?? false;
  const suspendedUntil = user?.suspended_until ?? user?.user?.suspended_until ?? null;

  const [suspendOpen, setSuspendOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [days, setDays] = useState("7");
  const [reason, setReason] = useState("");
  const [matricule, setMatricule] = useState("");
  const [password, setPassword] = useState("");

  const untilLabel = suspendedUntil
    ? new Date(suspendedUntil).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : null;

  const suspend = async () => {
    if (!userId) return;
    const parsedDays = Number(days);
    if (!Number.isFinite(parsedDays) || parsedDays < 1) {
      toast({ variant: "destructive", title: "Invalid duration", description: "Enter the number of days (1 or more) to suspend for." });
      return;
    }
    setBusy(true);
    try {
      await usersService.suspendUser(userId, { days: parsedDays, reason: reason.trim() });
      toast({ title: "User suspended", description: `${userName} is suspended for ${parsedDays} day(s).` });
      setSuspendOpen(false);
      setReason("");
      onChanged?.();
    } catch (error) {
      toast({ variant: "destructive", title: "Suspension failed", description: getApiErrorMessage(error, "Could not suspend this user.") });
    } finally {
      setBusy(false);
    }
  };

  const cancelSuspension = async () => {
    if (!userId) return;
    setBusy(true);
    try {
      await usersService.unsuspendUser(userId);
      toast({ title: "Suspension cancelled", description: `${userName} can access their account again.` });
      onChanged?.();
    } catch (error) {
      toast({ variant: "destructive", title: "Could not cancel", description: getApiErrorMessage(error, "Could not cancel the suspension.") });
    } finally {
      setBusy(false);
    }
  };

  const hardDelete = async () => {
    if (!userId) return;
    if (!matricule.trim() || !password) {
      toast({ variant: "destructive", title: "Confirmation required", description: "Enter your own matricule and password to confirm permanent deletion." });
      return;
    }
    setBusy(true);
    try {
      await usersService.hardDeleteUser(userId, { matricule: matricule.trim(), password });
      toast({ title: "User deleted", description: `${userName} and all their data were permanently deleted.` });
      setDeleteOpen(false);
      setMatricule("");
      setPassword("");
      onChanged?.();
    } catch (error) {
      toast({ variant: "destructive", title: "Delete failed", description: getApiErrorMessage(error, "Could not delete this user.") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={compact ? "flex flex-wrap items-center gap-2" : "flex flex-wrap items-center gap-2"}>
      {isSuspended ? (
        <>
          <Badge className="bg-amber-100 text-[10px] font-black uppercase text-amber-700">
            Suspended{untilLabel ? ` · until ${untilLabel}` : ""}
          </Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-2 rounded-xl border-emerald-300 font-bold text-emerald-700"
            onClick={cancelSuspension}
            disabled={busy}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Cancel suspension
          </Button>
        </>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 gap-2 rounded-xl border-amber-300 font-bold text-amber-700"
          onClick={() => setSuspendOpen(true)}
          disabled={busy}
        >
          <Ban className="h-4 w-4" /> Suspend
        </Button>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 gap-2 rounded-xl border-red-300 font-bold text-red-600"
        onClick={() => setDeleteOpen(true)}
        disabled={busy}
      >
        <Trash2 className="h-4 w-4" /> Delete
      </Button>

      {/* Suspend dialog */}
      <Dialog open={suspendOpen} onOpenChange={(open) => { if (!busy) setSuspendOpen(open); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Suspend {userName}</DialogTitle>
            <DialogDescription>
              They will not be able to sign in until the suspension ends or you cancel it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Number of days</Label>
              <Input type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} placeholder="7" />
            </div>
            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason shown to the user" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={suspend} disabled={busy} className="gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
              Suspend
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permanent delete dialog */}
      <Dialog open={deleteOpen} onOpenChange={(open) => { if (!busy) setDeleteOpen(open); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600">Permanently delete {userName}?</DialogTitle>
            <DialogDescription>
              This cannot be undone. The user and all their data (profile, grades, attendance, fees, links) are removed from the database. Confirm with your own matricule and password.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Your matricule</Label>
              <Input value={matricule} onChange={(e) => setMatricule(e.target.value)} placeholder="Your matricule" />
            </div>
            <div className="space-y-2">
              <Label>Your password</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={busy}>Cancel</Button>
            <Button variant="destructive" onClick={hardDelete} disabled={busy} className="gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default UserModerationControls;
