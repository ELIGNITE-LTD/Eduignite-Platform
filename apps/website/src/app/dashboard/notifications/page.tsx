"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Loader2, Send, Shield, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { notificationsService } from "@/lib/api/services/notifications.service";

const normalizeList = (payload: any) => Array.isArray(payload) ? payload : Array.isArray(payload?.results) ? payload.results : [];
const MANAGER_ROLES = ["SUPER_ADMIN", "CEO", "CTO", "SCHOOL_ADMIN", "SUB_ADMIN"];
const ROLE_TARGETS = ["STUDENT", "PARENT", "TEACHER", "SCHOOL_ADMIN", "SUB_ADMIN", "BURSAR", "LIBRARIAN"];

export default function NotificationsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState({ title: "", message: "", role: "STUDENT", priority: "normal", url: "" });
  const canManage = MANAGER_ROLES.includes(user?.role || "");

  const { data: raw = [], isLoading, refetch } = useQuery({
    queryKey: ["notifications", filter],
    queryFn: async () => normalizeList(await notificationsService.listNotifications(filter === "all" ? undefined : { is_read: filter === "read" })),
  });

  const markRead = useMutation({
    mutationFn: (id: string) => notificationsService.markRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAll = useMutation({
    mutationFn: () => notificationsService.markAllRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast({ title: "Notifications updated", description: "All visible notifications were marked as read." });
    },
  });

  const createNotification = useMutation({
    mutationFn: () => notificationsService.createNotification({
      title: form.title,
      message: form.message,
      role_targets: [form.role],
      priority: form.priority as any,
      notification_type: "platform",
      url: form.url || undefined,
    }),
    onSuccess: () => {
      setForm({ title: "", message: "", role: "STUDENT", priority: "normal", url: "" });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast({ title: "Notification sent", description: "The role-targeted notification was created." });
    },
    onError: () => toast({ variant: "destructive", title: "Unable to send notification" }),
  });

  const unreadCount = raw.filter((item: any) => !item.is_read).length;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-headline text-3xl font-bold text-primary">Notification Center</h1>
          <p className="text-sm text-muted-foreground">Enterprise alerts for assignments, grades, fees, classes, support, and platform operations.</p>
        </div>
        <div className="flex gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="unread">Unread</SelectItem>
              <SelectItem value="read">Read</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => refetch()}>Refresh</Button>
          <Button onClick={() => markAll.mutate()} disabled={markAll.isPending || unreadCount === 0}><CheckCheck className="mr-2 h-4 w-4" /> Mark all read</Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {canManage && (
          <Card className="lg:col-span-4 border-none shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5 text-secondary" /> Managed Broadcast</CardTitle>
              <CardDescription>CEO, CTO, and school leadership can send role-targeted operational notifications.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2"><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div className="space-y-2"><Label>Message</Label><Textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Role</Label><Select value={form.role} onValueChange={(role) => setForm({ ...form, role })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ROLE_TARGETS.map((role) => <SelectItem key={role} value={role}>{role}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><Label>Priority</Label><Select value={form.priority} onValueChange={(priority) => setForm({ ...form, priority })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["low", "normal", "high", "urgent"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>
              </div>
              <div className="space-y-2"><Label>Optional URL</Label><Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="/dashboard/assignments" /></div>
              <Button className="w-full" disabled={!form.title || !form.message || createNotification.isPending} onClick={() => createNotification.mutate()}><Send className="mr-2 h-4 w-4" /> Send notification</Button>
            </CardContent>
          </Card>
        )}

        <div className={canManage ? "lg:col-span-8 space-y-4" : "lg:col-span-12 space-y-4"}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card><CardContent className="p-4"><div className="text-2xl font-bold text-primary">{raw.length}</div><div className="text-xs text-muted-foreground">Total notifications</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-2xl font-bold text-secondary">{unreadCount}</div><div className="text-xs text-muted-foreground">Unread</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-2xl font-bold text-primary">Realtime</div><div className="text-xs text-muted-foreground">WebSocket-ready backend channel</div></CardContent></Card>
          </div>
          {isLoading ? <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading notifications...</div> : raw.length === 0 ? <Card><CardContent className="p-8 text-center text-muted-foreground">No notifications found.</CardContent></Card> : raw.map((item: any) => (
            <Card key={item.id} className="border-none shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-3">
                    <div className="rounded-full bg-primary/10 p-2 text-primary"><Bell className="h-4 w-4" /></div>
                    <div><CardTitle className="text-base">{item.title}</CardTitle><CardDescription>{item.created_at ? new Date(item.created_at).toLocaleString() : ""}</CardDescription></div>
                  </div>
                  <div className="flex gap-2"><Badge variant={item.is_read ? "outline" : "default"}>{item.is_read ? "Read" : "Unread"}</Badge><Badge variant="secondary">{item.priority}</Badge></div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{item.message}</p>
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="gap-1"><Users className="h-3 w-3" /> {item.notification_type}</Badge>
                  {!item.is_read && <Button size="sm" variant="ghost" onClick={() => markRead.mutate(String(item.id))}>Mark read</Button>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
