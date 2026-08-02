
"use client";

import { useAuth } from "@/lib/auth-context";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { 
  PenTool, 
  Calendar, 
  ShieldCheck,
  ChevronLeft,
  Heart,
  MessageCircle,
  Send
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { communityService } from "@/lib/api/services/community.service";
import { resolveMediaUrl } from "@/lib/media";
import { MediaRenderer } from "@/components/shared/MediaRenderer";
import { CommunityHeader } from "@/components/layout/community-header";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

export default function BlogDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { communityBlogs, platformSettings, user } = useAuth();
  const { toast } = useToast();
  const [blog, setBlog] = useState<any>(null);
  const [commentText, setCommentText] = useState("");
  const [isCommenting, setIsCommenting] = useState(false);
  const [isLiking, setIsLiking] = useState(false);

  useEffect(() => {
    const found = communityBlogs.find(b => b.id === params.id);
    if (found) {
      setBlog(found);
    }
    if (!params.id) return;

    communityService.viewBlog(String(params.id))
      .then((record: any) => {
        setBlog({
          id: record.id,
          title: record.title,
          senderName: record.author?.name || "EduIgnite Board",
          senderRole: record.author?.role || "Executive",
          senderAvatar: resolveMediaUrl(record.author?.avatar),
          image: resolveMediaUrl(record.image),
          video_url: resolveMediaUrl(record.video_url) || record.video_url,
          paragraphs: Array.isArray(record.paragraphs) ? record.paragraphs : [],
          createdAt: record.created_at,
          like_count: record.like_count || 0,
          comment_count: record.comment_count || 0,
          liked_by_me: Boolean(record.liked_by_me),
          comments: Array.isArray(record.comments) ? record.comments : [],
        });
      })
      .catch(() => setBlog(null));
  }, [params.id, communityBlogs]);

  const handleLike = async () => {
    if (!blog?.id || !user) {
      toast({ title: "Login required", description: "Please sign in to like this post.", variant: "destructive" });
      return;
    }
    setIsLiking(true);
    try {
      const updated = blog.liked_by_me
        ? await communityService.unlikeBlog(blog.id)
        : await communityService.likeBlog(blog.id);
      setBlog((current: any) => ({ ...current, ...updated }));
    } catch (error) {
      toast({ title: "Action failed", description: "We could not update your like right now.", variant: "destructive" });
    } finally {
      setIsLiking(false);
    }
  };

  const handleComment = async () => {
    if (!blog?.id || !user) {
      toast({ title: "Login required", description: "Please sign in to comment on this post.", variant: "destructive" });
      return;
    }
    if (!commentText.trim()) return;
    setIsCommenting(true);
    try {
      const comment = await communityService.createComment(blog.id, commentText.trim());
      setBlog((current: any) => ({
        ...current,
        comment_count: Number(current?.comment_count || 0) + 1,
        comments: [...(current?.comments || []), comment],
      }));
      setCommentText("");
    } catch (error) {
      toast({ title: "Comment failed", description: "We could not publish your comment.", variant: "destructive" });
    } finally {
      setIsCommenting(false);
    }
  };

  if (!blog) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F0F2F5] gap-4">
        <Loader2 className="w-12 h-12 animate-spin text-primary opacity-20" />
        <p className="text-muted-foreground font-black uppercase text-[10px] tracking-widest">Syncing Strategic Record</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F0F2F5] pb-20">
      <CommunityHeader />

      <main className="max-w-4xl mx-auto px-4 py-12 space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
        {/* LOG METADATA */}
        <section className="space-y-6 text-center">
          <div className="inline-flex items-center gap-2 bg-primary/5 px-4 py-1 rounded-full border border-primary/10">
            <PenTool className="w-4 h-4 text-secondary" />
            <span className="text-[10px] font-black uppercase tracking-widest text-primary">Strategic Node Audit</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-black text-primary uppercase tracking-tighter leading-tight">
            {blog.title}
          </h1>
          <div className="flex items-center justify-center gap-4 text-xs font-bold text-muted-foreground">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-secondary" />
              {new Date(blog.createdAt || Date.now()).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
            <span className="opacity-30">|</span>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-secondary" />
              Official Board Record
            </div>
          </div>
        </section>

        {/* HERO IMAGE */}
        {(blog.image || blog.video_url) && (
          <div className="overflow-hidden rounded-[3rem] border-8 border-white shadow-2xl ring-1 ring-primary/5">
            <MediaRenderer imageUrl={blog.image} videoUrl={blog.video_url} alt="Strategic update media" aspectClassName="aspect-[21/9]" />
          </div>
        )}

        {/* CONTENT */}
        <Card className="border-none shadow-xl rounded-[3rem] bg-white p-8 md:p-16">
          <div className="space-y-8 max-w-2xl mx-auto">
            {(blog.paragraphs || []).map((p: string, i: number) => (
              <p key={i} className="text-xl text-muted-foreground leading-relaxed font-medium first-letter:text-5xl first-letter:font-black first-letter:text-primary first-letter:mr-2">
                {p}
              </p>
            ))}
          </div>

          <div className="mx-auto mt-12 flex max-w-2xl flex-wrap items-center gap-3 border-t border-accent pt-8">
            <Button variant="outline" className="gap-2 rounded-xl" onClick={handleLike} disabled={isLiking}>
              <Heart className={cn("h-4 w-4", blog.liked_by_me ? "fill-red-500 text-red-500" : "")} />
              {Number(blog.like_count || 0)} Likes
            </Button>
            <Badge variant="secondary" className="gap-2 rounded-xl px-4 py-2">
              <MessageCircle className="h-4 w-4" /> {Number(blog.comment_count || blog.comments?.length || 0)} Comments
            </Badge>
          </div>

          <div className="mx-auto mt-8 max-w-2xl space-y-5">
            <h2 className="text-sm font-black uppercase tracking-widest text-primary">Comments</h2>
            {(blog.comments || []).length ? (
              <div className="space-y-4">
                {(blog.comments || []).map((comment: any) => (
                  <div key={comment.id} className="rounded-2xl bg-accent/20 p-4">
                    <div className="mb-2 flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={resolveMediaUrl(comment.author?.avatar)} />
                        <AvatarFallback className="bg-primary text-xs text-white">{(comment.author?.name || "U").charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-xs font-black text-primary">{comment.author?.name || "Community Member"}</p>
                        <p className="text-[10px] font-bold text-muted-foreground">{comment.created_at ? new Date(comment.created_at).toLocaleString() : ""}</p>
                      </div>
                    </div>
                    <p className="text-sm leading-relaxed text-muted-foreground">{comment.content}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm font-semibold text-muted-foreground">No comments yet. Be the first to add a professional reflection.</p>
            )}
            <div className="space-y-3 rounded-2xl border bg-white p-4">
              <Textarea
                value={commentText}
                onChange={(event) => setCommentText(event.target.value)}
                placeholder="Add a comment..."
                className="min-h-24 rounded-xl"
              />
              <Button className="gap-2 rounded-xl" onClick={handleComment} disabled={isCommenting || !commentText.trim()}>
                {isCommenting ? <Loader2 className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                Post Comment
              </Button>
            </div>
          </div>

          <div className="pt-16 mt-16 border-t flex flex-col md:flex-row md:items-center justify-between gap-10">
            <div className="flex items-center gap-5">
              <Avatar className="h-20 w-20 border-4 border-white shadow-2xl ring-1 ring-primary/5">
                <AvatarImage src={blog.senderAvatar} />
                <AvatarFallback className="bg-primary text-white font-bold">{(blog.senderName || "E").charAt(0)}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-black text-primary text-2xl uppercase leading-none mb-1">{blog.senderName}</p>
                <p className="text-xs font-bold text-secondary uppercase tracking-widest">{blog.senderRole} • {platformSettings.name} Leadership</p>
              </div>
            </div>
            <div className="flex flex-col items-center gap-2 text-center opacity-20">
               <ShieldCheck className="w-16 h-16 text-primary" />
               <span className="text-[10px] font-black uppercase tracking-[0.3em]">Verified Log Integrity</span>
            </div>
          </div>
        </Card>

        {/* FOOTER CTA */}
        <section className="pt-12 text-center">
           <Button 
            className="h-14 px-10 rounded-2xl bg-primary text-white font-black uppercase tracking-widest text-xs gap-3 shadow-2xl"
            onClick={() => router.push('/community#order')}
           >
             Join the Regional Node Network <ChevronLeft className="w-4 h-4 rotate-180" />
           </Button>
        </section>
      </main>
    </div>
  );
}

function Loader2({ className }: { className?: string }) {
  return (
    <div className={cn("animate-spin", className)}>
      <svg className="w-full h-full" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2V6M12 18V22M6 12H2M18 12H22M5.636 5.636L8.464 8.464M15.536 15.536L18.364 18.364M5.636 18.364L8.464 15.536M15.536 8.464L18.364 5.636" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    </div>
  );
}
