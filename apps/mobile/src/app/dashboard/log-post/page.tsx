
"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { 
  PenTool, 
  Send, 
  Plus, 
  Trash2, 
  Loader2, 
  ImageIcon, 
  CheckCircle2,
  FileText,
  Eye,
  ShieldCheck,
  Type
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { fileToDataUrl, getApiErrorMessage } from "@/lib/api/errors";

export default function LogPostPage() {
  const { user, addCommunityBlog } = useAuth();
  const { language } = useI18n();
  const { toast } = useToast();
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [isReadingImage, setIsReadingImage] = useState(false);
  const [title, setTitle] = useState("");
  const [image, setImage] = useState("");
  const [paragraphs, setParagraphs] = useState<string[]>([""]);

  const handleAddParagraph = () => {
    setParagraphs([...paragraphs, ""]);
  };

  const handleRemoveParagraph = (index: number) => {
    if (paragraphs.length === 1) return;
    setParagraphs(paragraphs.filter((_, i) => i !== index));
  };

  const handleParagraphChange = (index: number, value: string) => {
    const updated = [...paragraphs];
    updated[index] = value;
    setParagraphs(updated);
  };

  const handleImageFileChange = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ variant: "destructive", title: "Invalid Image", description: "Please select a valid image file." });
      return;
    }
    setIsReadingImage(true);
    try {
      setImage(await fileToDataUrl(file));
    } catch (error) {
      toast({ variant: "destructive", title: "Image Upload Failed", description: getApiErrorMessage(error, "Could not read that image file.") });
    } finally {
      setIsReadingImage(false);
    }
  };

  const handlePublish = async () => {
    if (!user) return;
    if (!title.trim()) {
      toast({ variant: "destructive", title: "Missing Title", description: "Every log requires a subject/title." });
      return;
    }
    if (paragraphs.some(p => !p.trim())) {
      toast({ variant: "destructive", title: "Empty Paragraphs", description: "Please fill in all content fields or remove empty ones." });
      return;
    }

    setIsProcessing(true);

    try {
      await addCommunityBlog({
        title,
        senderName: user.name,
        senderRole: user.role,
        senderAvatar: user.avatar || "",
        image: image || undefined,
        paragraphs: paragraphs.filter(p => p.trim() !== "")
      });

      setIsProcessing(false);
      toast({ title: "Log Published", description: "Your post is now visible on the community portal." });
      setTitle("");
      setImage("");
      setParagraphs([""]);
    } catch (error) {
      setIsProcessing(false);
      toast({ variant: "destructive", title: "Publish Failed", description: getApiErrorMessage(error, "We could not publish this strategic log right now.") });
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary font-headline flex items-center gap-3">
            <div className="p-2 bg-primary rounded-xl shadow-lg text-white">
              <PenTool className="w-6 h-6 text-secondary" />
            </div>
            {language === 'en' ? 'Publish Strategic Log' : 'Publier un Log Stratégique'}
          </h1>
          <p className="text-muted-foreground mt-1">Broadcast institutional updates and board decisions to the community portal.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-7 space-y-8">
          <Card className="border-none shadow-xl rounded-[2.5rem] overflow-hidden bg-white">
            <CardHeader className="bg-primary p-8 text-white">
              <CardTitle className="text-xl font-black uppercase tracking-tight">Post Composer</CardTitle>
              <CardDescription className="text-white/60">Craft your message with optional media and multiple paragraphs.</CardDescription>
            </CardHeader>
            <CardContent className="p-8 space-y-8">
              {/* Subject Title */}
              <div className="space-y-3">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1 flex items-center gap-2">
                  <Type className="w-3.5 h-3.5" /> Subject / Title
                </Label>
                <Input 
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Q3 Pedagogical Goals"
                  className="h-12 bg-accent/30 border-none rounded-xl font-bold text-primary"
                />
              </div>

              {/* Optional Image */}
              <div className="space-y-3">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1 flex items-center gap-2">
                  <ImageIcon className="w-3.5 h-3.5" /> Feature Image URL (Optional)
                </Label>
                <div className="grid gap-3">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageFileChange(e.target.files?.[0])}
                    className="h-12 bg-accent/30 border-none rounded-xl file:mr-4 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:text-xs file:font-bold file:text-white"
                    disabled={isReadingImage}
                  />
                  <Input
                    value={image}
                    onChange={(e) => setImage(e.target.value)}
                    placeholder="Or paste an image URL / data URL..."
                    className="h-12 bg-accent/30 border-none rounded-xl"
                  />
                </div>
              </div>

              {/* Dynamic Paragraphs */}
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-accent pb-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5" /> Content Paragraphs
                  </Label>
                  <Button variant="ghost" size="sm" className="h-7 gap-1 text-[10px] font-black uppercase" onClick={handleAddParagraph}>
                    <Plus className="w-3 h-3" /> Add Paragraph
                  </Button>
                </div>
                
                <div className="space-y-4">
                  {paragraphs.map((p, idx) => (
                    <div key={idx} className="group relative">
                      <Textarea 
                        value={p}
                        onChange={(e) => handleParagraphChange(idx, e.target.value)}
                        placeholder={`Paragraph ${idx + 1}...`}
                        className="min-h-[120px] bg-accent/30 border-none rounded-2xl p-6 leading-relaxed shadow-inner focus-visible:ring-primary"
                      />
                      {paragraphs.length > 1 && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="absolute top-2 right-2 h-8 w-8 rounded-full bg-white shadow-sm opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                          onClick={() => handleRemoveParagraph(idx)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
            <CardFooter className="bg-accent/20 p-8 border-t border-accent">
              <Button 
                className="w-full h-16 rounded-2xl shadow-xl font-black uppercase text-sm gap-3 bg-primary text-white hover:bg-primary/90 transition-all active:scale-95" 
                onClick={handlePublish}
                disabled={isProcessing || isReadingImage || !title.trim() || paragraphs.every(p => !p.trim())}
              >
                {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                Publish to Community Feed
              </Button>
            </CardFooter>
          </Card>
        </div>

        <div className="lg:col-span-5 space-y-8">
          <div className="sticky top-8 space-y-8">
            <Card className="border-none shadow-sm bg-white p-8 rounded-[2.5rem] space-y-6">
              <div className="flex items-center gap-3 border-b pb-4">
                <Eye className="w-5 h-5 text-primary" />
                <h3 className="text-sm font-black uppercase text-primary tracking-widest">Live Preview</h3>
              </div>
              
              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <Avatar className="h-12 w-12 border-2 border-primary/10 shadow-md">
                    <AvatarImage src={user?.avatar} />
                    <AvatarFallback>{user?.name?.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-black text-primary text-sm uppercase leading-none mb-1">{user?.name}</p>
                    <Badge variant="secondary" className="bg-secondary/20 text-primary border-none text-[8px] h-4 font-black uppercase">{user?.role}</Badge>
                  </div>
                </div>

                <div className="space-y-4">
                  {title && <h2 className="text-xl font-black text-primary uppercase">{title}</h2>}
                  {image && (
                    <div className="aspect-video w-full rounded-2xl overflow-hidden bg-accent shadow-inner border border-accent">
                      <img src={image} className="w-full h-full object-cover" alt="Preview" />
                    </div>
                  )}
                  <div className="space-y-3">
                    {paragraphs.map((p, i) => p.trim() && (
                      <p key={i} className="text-xs text-muted-foreground leading-relaxed italic border-l-2 border-primary/10 pl-4">
                        {p}
                      </p>
                    ))}
                    {paragraphs.every(p => !p.trim()) && <p className="text-xs text-muted-foreground/40 italic">Start typing to see preview...</p>}
                  </div>
                </div>
              </div>
            </Card>

            <Card className="border-none shadow-sm bg-primary text-white p-8 rounded-[2.5rem] space-y-4 relative overflow-hidden">
               <div className="absolute top-0 right-0 p-6 opacity-5 rotate-12"><PenTool className="w-32 h-32" /></div>
               <div className="flex items-center gap-3 relative z-10">
                  <ShieldCheck className="w-6 h-6 text-secondary" />
                  <h4 className="text-xs font-black uppercase tracking-widest">Board Authorization</h4>
               </div>
               <p className="text-[11px] leading-relaxed opacity-70 relative z-10 font-medium italic">
                 "Strategic logs are permanent pedagogical records of the platform board. They serve as the primary source of truth for institutional growth and global node governance."
               </p>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
