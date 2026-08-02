"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { apiClient } from "@/lib/api/client";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api/errors";
import { validateImageFile } from "@/lib/upload-validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CalendarDays,
  ImagePlus,
  Loader2,
  MapPin,
  Plus,
  Trash2,
  X,
} from "lucide-react";

/**
 * School Events (admin grid): the school administration posts events here —
 * title, description, date, location and an optional picture — and every
 * user in the school sees them in the Community tab. GET/POST/DELETE
 * /schools/events/.
 */

const normalizeList = (payload: any) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
};

const formatEventDate = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" });
};

export default function SchoolEventsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const imageInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = ["SCHOOL_ADMIN", "SUB_ADMIN"].includes(user?.role || "");

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    event_date: "",
    location: "",
    image: "",
  });

  const eventsQuery = useQuery({
    queryKey: ["school-events"],
    queryFn: async () => normalizeList((await apiClient.get("/schools/events/", { params: { page_size: 200 } })).data),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, string> = {
        title: form.title.trim(),
        description: form.description.trim(),
        location: form.location.trim(),
        image: form.image,
      };
      if (form.event_date) payload.event_date = form.event_date;
      const { data } = await apiClient.post("/schools/events/", payload);
      return data;
    },
    onSuccess: async () => {
      toast({ title: "Event published", description: "Everyone in your school can now see it in Community." });
      setCreateOpen(false);
      setForm({ title: "", description: "", event_date: "", location: "", image: "" });
      await queryClient.invalidateQueries({ queryKey: ["school-events"] });
    },
    onError: (error) =>
      toast({
        variant: "destructive",
        title: "Could not publish",
        description: getApiErrorMessage(error, "The event could not be published right now."),
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/schools/events/${id}/`),
    onSuccess: async () => {
      toast({ title: "Event removed" });
      await queryClient.invalidateQueries({ queryKey: ["school-events"] });
    },
    onError: (error) =>
      toast({
        variant: "destructive",
        title: "Could not remove",
        description: getApiErrorMessage(error, "The event could not be removed."),
      }),
  });

  const handlePickImage = (file: File | null | undefined) => {
    if (!file) return;
    const fileError = validateImageFile(file, "event picture", false);
    if (fileError) {
      toast({ variant: "destructive", title: "Image too large", description: fileError });
      if (imageInputRef.current) imageInputRef.current.value = "";
      return;
    }
    // Downscale before turning the picture into a base64 data URL. A full photo
    // produces a huge payload that can fail to publish; a resized JPEG keeps the
    // request small and reliable.
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const img = new Image();
      img.onload = () => {
        try {
          const maxDim = 1600;
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            const scale = maxDim / Math.max(width, height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            setForm((prev) => ({ ...prev, image: dataUrl }));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          setForm((prev) => ({ ...prev, image: canvas.toDataURL("image/jpeg", 0.82) }));
        } catch {
          setForm((prev) => ({ ...prev, image: dataUrl }));
        }
      };
      img.onerror = () => setForm((prev) => ({ ...prev, image: dataUrl }));
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const events = normalizeList(eventsQuery.data);

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">School Events</h1>
          <p className="mt-0.5 text-[13px] font-medium text-muted-foreground">
            {isAdmin
              ? "Publish events for everyone in your school."
              : "Events published by your school."}
          </p>
        </div>
        {isAdmin && (
          <Button
            size="icon"
            className="h-10 w-10 rounded-full bg-primary text-white shadow-md"
            onClick={() => setCreateOpen(true)}
            aria-label="New event"
          >
            <Plus className="h-5 w-5" />
          </Button>
        )}
      </div>

      {eventsQuery.isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-primary/30" />
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed bg-white py-14 text-center">
          <CalendarDays className="h-9 w-9 text-primary/20" />
          <p className="text-sm font-bold text-muted-foreground">No events yet</p>
          {isAdmin && (
            <Button size="sm" variant="outline" className="mt-1 gap-2 rounded-xl" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Post the first event
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((event: any) => (
            <div key={event.id} className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/[0.03]">
              {event.image ? (
                <img src={event.image} alt={event.title} className="h-44 w-full object-cover" />
              ) : null}
              <div className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[15px] font-black leading-snug text-foreground">{event.title}</p>
                  {isAdmin && (
                    <button
                      onClick={() => deleteMutation.mutate(String(event.id))}
                      disabled={deleteMutation.isPending}
                      className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-500"
                      aria-label="Delete event"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {event.description ? (
                  <p className="text-[13px] leading-relaxed text-muted-foreground">{event.description}</p>
                ) : null}
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  {event.event_date ? (
                    <span className="flex items-center gap-1.5 text-[12px] font-bold text-primary">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {formatEventDate(event.event_date)}
                    </span>
                  ) : null}
                  {event.location ? (
                    <span className="flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" />
                      {event.location}
                    </span>
                  ) : null}
                </div>
                {event.created_by_name ? (
                  <p className="text-[11px] text-muted-foreground">Posted by {event.created_by_name}</p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-black">New School Event</DialogTitle>
            <DialogDescription className="text-[13px]">
              Visible to every student, parent and staff member in your school.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Sports Day 2026"
                className="h-11 rounded-xl bg-accent/30 border-none"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What is happening, who should attend..."
                className="min-h-[90px] rounded-xl bg-accent/30 border-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">Date</Label>
                <Input
                  type="date"
                  value={form.event_date}
                  onChange={(e) => setForm({ ...form, event_date: e.target.value })}
                  className="h-11 rounded-xl bg-accent/30 border-none"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">Location</Label>
                <Input
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="School hall"
                  className="h-11 rounded-xl bg-accent/30 border-none"
                />
              </div>
            </div>

            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                handlePickImage(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            {form.image ? (
              <div className="relative overflow-hidden rounded-2xl">
                <img src={form.image} alt="Event" className="h-36 w-full object-cover" />
                <button
                  onClick={() => setForm({ ...form, image: "" })}
                  className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white"
                  aria-label="Remove picture"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => imageInputRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-primary/30 bg-primary/5 py-4 text-[13px] font-bold text-primary"
              >
                <ImagePlus className="h-4 w-4" />
                Add a picture (optional)
              </button>
            )}

            <Button
              className="h-12 w-full rounded-2xl font-black uppercase text-xs"
              onClick={() => {
                if (!form.title.trim()) {
                  toast({ variant: "destructive", title: "Title required", description: "Add an event title before publishing." });
                  return;
                }
                createMutation.mutate();
              }}
              disabled={createMutation.isPending || !form.title.trim()}
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Publish Event"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
