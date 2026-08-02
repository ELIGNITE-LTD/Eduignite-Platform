"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n-context";
import {
  useAssignment,
  useCreateAssignmentSubmission,
  useMyAssignmentSubmissions,
  useUpdateAssignmentSubmission,
} from "@/lib/hooks/useAssignments";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Send,
  Paperclip,
  FileText,
  Clock,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Award,
  Upload,
  X,
  ShieldCheck,
  FileCheck,
  QrCode
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { fileToDataUrl, getApiErrorMessage } from "@/lib/api/errors";

export default function SubmitAssignmentPage() {
  const { language } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const assignmentId = searchParams.get("id") || "";
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const { data: assignment, isLoading: isTaskLoading } = useAssignment(assignmentId);
  const { data: mySubmissionsData } = useMyAssignmentSubmissions({ limit: 200 });
  const createSubmissionMutation = useCreateAssignmentSubmission();
  const updateSubmissionMutation = useUpdateAssignmentSubmission();

  const submission = (mySubmissionsData?.results || []).find((item: any) => item.assignment === assignmentId) || null;

  useEffect(() => {
    setContent(submission?.content || "");
  }, [submission?.content]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 6 * 1024 * 1024) {
        if (fileInputRef.current) fileInputRef.current.value = "";
        toast({ variant: "destructive", title: "File too large", description: "Maximum file size is 6MB." });
        return;
      }
      setSelectedFile(file);
      toast({ title: "File attached", description: file.name });
    }
  };

  const removeFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handlePageSubmit = async () => {
    if (!assignment) return;
    if (new Date(assignment.due_date) <= new Date()) {
      toast({
        variant: "destructive",
        title: language === "en" ? "Submission closed" : "Dépôt fermé",
        description: language === "en" ? "The assignment deadline has passed." : "La date limite du devoir est passée.",
      });
      return;
    }

    if (assignment.submission_type === "text" && !content) return;
    if (assignment.submission_type === "file" && !selectedFile && !submission?.attachment_data) return;
    if (assignment.submission_type === "both" && !content && !selectedFile && !submission?.attachment_data) return;

    setLoading(true);
    try {
      const attachmentData = selectedFile ? await fileToDataUrl(selectedFile) : submission?.attachment_data || "";
      const payload = {
        assignment: assignment.id,
        content,
        attachment_name: selectedFile?.name || submission?.attachment_name || "",
        attachment_data: attachmentData,
      };

      if (submission?.id) {
        await updateSubmissionMutation.mutateAsync({ id: submission.id, payload });
      } else {
        await createSubmissionMutation.mutateAsync(payload);
      }

      toast({
        title: language === "en" ? "Submission Received" : "Travail Reçu",
        description: language === "en" ? "Your pedagogical record has been updated." : "Votre dossier pédagogique a été mis à jour.",
      });
      setTimeout(() => router.push("/dashboard/assignments"), 1200);
    } catch (error) {
      toast({
        variant: "destructive",
        title: language === "en" ? "Submission Failed" : "Échec de l’envoi",
        description: getApiErrorMessage(error, "Could not submit this assignment."),
      });
    } finally {
      setLoading(false);
    }
  };

  if (isTaskLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <Loader2 className="w-12 h-12 animate-spin text-primary opacity-20" />
        <p className="text-muted-foreground font-black uppercase text-[10px] tracking-widest animate-pulse">Syncing Task Dossier</p>
      </div>
    );
  }

  if (!assignment) return <div className="text-center py-20 font-bold">Assignment not found.</div>;

  const hasSubmitted = !!submission;
  const dueDate = new Date(assignment.due_date);
  const isClosed = dueDate <= new Date();

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-20">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full hover:bg-white shadow-sm">
          <ArrowLeft className="w-6 h-6" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-primary font-headline tracking-tighter">
            {language === "en" ? "Submission Suite" : "Portail de Rendu"}
          </h1>
          <p className="text-sm text-muted-foreground font-medium">{assignment.title} • {assignment.subject_name}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">
          <Card className="border-none shadow-sm bg-accent/30 overflow-hidden rounded-3xl">
            <CardHeader className="bg-white/50 border-b p-6">
              <CardTitle className="text-sm font-black uppercase text-primary tracking-widest flex items-center gap-2">
                <FileCheck className="w-4 h-4" /> Pedagogical Instructions
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground leading-relaxed italic font-medium">
                "{assignment.instructions}"
              </p>
            </CardContent>
          </Card>

          <Card className="border-none shadow-2xl rounded-[2.5rem] overflow-hidden bg-white">
            <CardHeader className="p-8 border-b">
              <CardTitle className="text-xl font-black text-primary">Submit Your Work</CardTitle>
              <CardDescription>Follow the institutional requirements for this task.</CardDescription>
            </CardHeader>
            <CardContent className="p-8 space-y-8">
              {hasSubmitted ? (
                <div className="p-10 bg-green-50 rounded-[2rem] border-2 border-green-100 flex flex-col items-center text-center space-y-4 animate-in zoom-in-95 duration-500">
                  <div className="p-4 bg-green-100 rounded-full shadow-inner">
                    <CheckCircle2 className="w-12 h-12 text-green-600" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-2xl font-black text-green-900">Work Successfully Recorded</h3>
                    <p className="text-sm text-green-800 font-medium">Your response is stored and ready for review.</p>
                  </div>
                  <div className="pt-4 flex flex-col items-center gap-2 opacity-60">
                    <ShieldCheck className="w-6 h-6 text-green-700" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Pedagogical Integrity Verified</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-8">
                  {(assignment.submission_type === "text" || assignment.submission_type === "both") && (
                    <div className="space-y-3">
                      <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5" /> Written Response
                      </Label>
                      <Textarea
                        placeholder="Type your academic summary or response here..."
                        className="min-h-[300px] bg-accent/20 border-none rounded-2xl focus-visible:ring-primary p-6 text-base leading-relaxed font-medium"
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                      />
                    </div>
                  )}

                  {(assignment.submission_type === "file" || assignment.submission_type === "both") && (
                    <div className="space-y-3">
                      <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest flex items-center gap-2">
                        <Paperclip className="w-3.5 h-3.5" /> Attach Supporting Documents
                      </Label>

                      {!selectedFile ? (
                        <div
                          className="group relative h-40 bg-accent/20 rounded-[2rem] border-2 border-dashed border-accent flex flex-col items-center justify-center cursor-pointer transition-all hover:border-primary hover:bg-primary/5"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            accept="application/pdf,image/*,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt"
                            onChange={handleFileChange}
                          />
                          <div className="p-3 bg-white rounded-2xl shadow-sm group-hover:scale-110 transition-transform mb-3">
                            <Upload className="w-6 h-6 text-primary" />
                          </div>
                          <p className="text-xs font-bold text-primary/60">Click to browse or drag PDF/Images</p>
                          <p className="text-[9px] text-muted-foreground uppercase font-black mt-1">MAX SIZE: 6MB</p>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between p-4 bg-primary/5 rounded-2xl border border-primary/10">
                          <div className="flex items-center gap-4">
                            <div className="p-2 bg-white rounded-lg shadow-sm">
                              <FileCheck className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-primary truncate max-w-[200px] md:max-w-sm">{selectedFile.name}</p>
                              <p className="text-[10px] font-black text-muted-foreground uppercase">{(selectedFile.size / 1024).toFixed(1)} KB • Ready to send</p>
                            </div>
                          </div>
                          <Button variant="ghost" size="icon" className="rounded-full text-red-400 hover:text-red-600 hover:bg-red-50" onClick={removeFile}>
                            <X className="w-5 h-5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
            {!hasSubmitted && (
              <CardFooter className="bg-accent/10 border-t p-8">
                <Button
                  className="w-full h-16 text-lg font-black uppercase tracking-tighter shadow-xl gap-3 rounded-2xl bg-primary text-white hover:bg-primary/90 transition-all active:scale-95"
                  onClick={handlePageSubmit}
                  disabled={loading || isClosed}
                >
                  {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Send className="w-6 h-6" />}
                  {isClosed ? "Submission Closed" : "Finalize Submission"}
                </Button>
              </CardFooter>
            )}
          </Card>
        </div>

        <div className="lg:col-span-4 space-y-8">
          <Card className="border-none shadow-sm bg-primary text-white overflow-hidden rounded-[2rem]">
            <CardHeader className="bg-white/10 p-6 border-b border-white/5">
              <CardTitle className="text-sm font-black uppercase tracking-widest opacity-60">Assignment Registry</CardTitle>
            </CardHeader>
            <CardContent className="p-8 space-y-8">
              <div className="flex gap-4">
                <div className="p-3 bg-white/10 rounded-2xl h-fit">
                  <Clock className="w-6 h-6 text-secondary" />
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] uppercase font-black opacity-40 tracking-widest">Submission Deadline</p>
                  <p className="text-lg font-black text-secondary leading-none">{dueDate.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</p>
                  <p className="text-[10px] font-bold opacity-60 italic">{isClosed ? "Submission window closed" : "Standard Institutional Window"}</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="p-3 bg-white/10 rounded-2xl h-fit">
                  <Award className="w-6 h-6 text-secondary" />
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] uppercase font-black opacity-40 tracking-widest">Pedagogical Weight</p>
                  <p className="text-2xl font-black leading-none">{assignment.max_marks} Points</p>
                  <p className="text-[10px] font-bold opacity-60 italic">Institutional Evaluation Cycle</p>
                </div>
              </div>

              <div className="pt-6 border-t border-white/5 flex flex-col items-center text-center gap-4">
                <QrCode className="w-24 h-24 opacity-10" />
                <div className="space-y-1">
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] opacity-40">Digital ID Reference</p>
                  <Badge variant="outline" className="border-white/20 text-white font-mono text-[9px]">TSK-{assignment.id}-2026</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm bg-blue-50 rounded-[2rem] p-6 space-y-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600" />
              <h4 className="text-xs font-black uppercase text-blue-700">Submission Notice</h4>
            </div>
            <p className="text-[11px] text-blue-800 leading-relaxed font-medium italic">
              "Students are advised to review their work carefully. Once submitted, records are finalized and sent to the pedagogical council for review."
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
