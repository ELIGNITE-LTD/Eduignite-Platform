"use client";

import { useEffect, useState } from "react";
import { Heart, ImageIcon, MessageCircle, Send, Sparkles, Video } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { platformService } from "@/lib/api/services/platform.service";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { CommunityHeader } from "@/components/layout/community-header";
import { cn } from "@/lib/utils";
import { resolveMediaUrl } from "@/lib/media";
import { useToast } from "@/hooks/use-toast";

export default function CommunityHighlightsPage() {
  const { publicEvents, user } = useAuth();
  const { toast } = useToast();
  const [events, setEvents] = useState(publicEvents);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const isDirectVideoSource = (value?: string | null) =>
    !!value && (value.startsWith("data:video/") || /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(value));

  useEffect(() => {
    setEvents(publicEvents);
  }, [publicEvents]);

  const handleLike = async (eventId: string, liked?: boolean) => {
    if (!user) {
      toast({ title: "Login required", description: "Please sign in to like highlights.", variant: "destructive" });
      return;
    }
    try {
      const updated = liked ? await platformService.unlikeEvent(eventId) : await platformService.likeEvent(eventId);
      setEvents((current) => current.map((item) => (item.id === eventId ? { ...item, ...updated } : item)));
    } catch (error) {
      toast({ title: "Action failed", description: "We could not update your like right now.", variant: "destructive" });
    }
  };

  const handleComment = async (eventId: string) => {
    if (!user) {
      toast({ title: "Login required", description: "Please sign in to comment on highlights.", variant: "destructive" });
      return;
    }
    const content = (commentDrafts[eventId] || "").trim();
    if (!content) return;
    try {
      const comment = await platformService.createEventComment(eventId, content);
      setEvents((current) => current.map((item) => (
        item.id === eventId
          ? {
              ...item,
              comment_count: Number(item.comment_count || 0) + 1,
              comments: [...(item.comments || []), comment],
            }
          : item
      )));
      setCommentDrafts((current) => ({ ...current, [eventId]: "" }));
      setExpandedComments((current) => ({ ...current, [eventId]: true }));
    } catch (error) {
      toast({ title: "Comment failed", description: "We could not publish your comment.", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F2F5]">
      <CommunityHeader />

      <main className="mx-auto max-w-7xl space-y-10 px-4 py-12">
        <div className="max-w-3xl space-y-3">
          <Badge className="border-none bg-secondary text-primary">COMMUNITY ARCHIVE</Badge>
          <h1 className="font-headline text-4xl font-black uppercase tracking-tighter text-primary md:text-6xl">
            All Institutional Highlights
          </h1>
          <p className="text-muted-foreground">
            Every published photo and video highlight from the EduIgnite platform community.
          </p>
        </div>

        {events.length === 0 ? (
          <Card className="rounded-[2rem] border-none bg-white p-10 text-center shadow-sm">
            <Sparkles className="mx-auto h-10 w-10 text-primary/20" />
            <p className="mt-4 font-bold text-muted-foreground">No institutional highlights have been published yet.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            {events.map((event) => (
              <Card key={event.id} className="overflow-hidden rounded-[3rem] border-none bg-white shadow-2xl transition-all duration-500 hover:shadow-primary/5">
                <div className="relative aspect-video overflow-hidden bg-slate-900">
                  {event.type === "video" ? (
                    isDirectVideoSource(event.url) ? (
                      <video
                        src={event.url}
                        className="h-full w-full object-cover"
                        controls
                        playsInline
                        preload="metadata"
                      />
                    ) : (
                      <iframe
                        src={event.url}
                        className="h-full w-full border-none"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    )
                  ) : (
                    <img src={event.url} alt={event.title} className="h-full w-full object-cover transition-transform duration-700 hover:scale-105" />
                  )}
                  <div className="absolute left-6 top-6">
                    <Badge className="h-7 border-none bg-black/60 px-4 text-[9px] font-black uppercase text-white backdrop-blur-xl">
                      {event.type === "video" ? (
                        <>
                          <Video className="mr-2 h-3.5 w-3.5" /> VIDEO
                        </>
                      ) : (
                        <>
                          <ImageIcon className="mr-2 h-3.5 w-3.5" /> PHOTO
                        </>
                      )}
                    </Badge>
                  </div>
                </div>
                <CardHeader className="p-8">
                  <CardTitle className="text-2xl font-black leading-tight text-primary">
                    {event.title}
                  </CardTitle>
                  <CardDescription className="mt-3 text-base font-medium leading-relaxed text-muted-foreground">
                    {event.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5 px-8 pb-8 pt-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <Button variant="outline" className="gap-2 rounded-xl" onClick={() => handleLike(event.id, event.liked_by_me)}>
                      <Heart className={cn("h-4 w-4", event.liked_by_me ? "fill-red-500 text-red-500" : "")} />
                      {Number(event.like_count || 0)} Likes
                    </Button>
                    <Button
                      variant="ghost"
                      className="gap-2 rounded-xl"
                      onClick={() => setExpandedComments((current) => ({ ...current, [event.id]: !current[event.id] }))}
                    >
                      <MessageCircle className="h-4 w-4" />
                      {Number(event.comment_count || event.comments?.length || 0)} Comments
                    </Button>
                  </div>

                  {expandedComments[event.id] ? (
                    <div className="space-y-4 rounded-2xl bg-accent/20 p-4">
                      {(event.comments || []).length ? (
                        (event.comments || []).map((comment: any) => (
                          <div key={comment.id} className="rounded-xl bg-white p-3">
                            <div className="mb-2 flex items-center gap-2">
                              <Avatar className="h-7 w-7">
                                <AvatarImage src={resolveMediaUrl(comment.author?.avatar)} />
                                <AvatarFallback className="bg-primary text-[10px] text-white">{(comment.author?.name || "U").charAt(0)}</AvatarFallback>
                              </Avatar>
                              <p className="text-xs font-black text-primary">{comment.author?.name || "Community Member"}</p>
                            </div>
                            <p className="text-sm text-muted-foreground">{comment.content}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm font-semibold text-muted-foreground">No comments yet.</p>
                      )}
                      <div className="space-y-2">
                        <Textarea
                          value={commentDrafts[event.id] || ""}
                          onChange={(input) => setCommentDrafts((current) => ({ ...current, [event.id]: input.target.value }))}
                          placeholder="Add a comment..."
                          className="min-h-20 rounded-xl bg-white"
                        />
                        <Button className="gap-2 rounded-xl" onClick={() => handleComment(event.id)} disabled={!commentDrafts[event.id]?.trim()}>
                          <Send className="h-4 w-4" /> Post Comment
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
