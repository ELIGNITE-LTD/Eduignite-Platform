"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AlertCircle, ChevronLeft, ChevronRight, Send, Timer, User } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { getApiErrorMessage } from "@/lib/api/errors";
import { useExam, useCreateExamSubmission } from "@/lib/hooks/useExams";
import { resolveMediaUrl } from "@/lib/media";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

export default function TakeExamPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const examId = searchParams.get("id") || "";

  const { data: exam, isLoading } = useExam(examId);
  const createSubmission = useCreateExamSubmission();

  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [timerReady, setTimerReady] = useState(false);
  const [expiredBeforeStart, setExpiredBeforeStart] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const timerWasLiveRef = useRef(false);

  const questions = exam?.questions ?? [];
  const question = questions[currentQuestion];

  const progress = useMemo(() => (questions.length ? ((currentQuestion + 1) / questions.length) * 100 : 0), [currentQuestion, questions.length]);

  const handleSelect = (optionIndex: number) => {
    if (!question?.id) return;
    setAnswers((prev) => ({ ...prev, [String(question.id)]: optionIndex }));
  };

  const handleSubmit = useCallback(async () => {
    if (!examId) return;
    setIsSubmitted(true);
    try {
      const submission = await createSubmission.mutateAsync({ exam: examId, answers });
      toast({ title: "Exam submitted", description: "Your answers were saved and graded successfully." });
      router.push(`/dashboard/exams/results?id=${submission.id}`);
    } catch (error) {
      setIsSubmitted(false);
      toast({ variant: "destructive", title: "Submission failed", description: getApiErrorMessage(error, "We could not submit this exam.") });
    }
  }, [answers, createSubmission, examId, router, toast]);

  useEffect(() => {
    if (!exam?.end_time) return;
    setTimerReady(false);
    setExpiredBeforeStart(false);
    timerWasLiveRef.current = false;

    const tick = () => {
      const secondsRemaining = Math.max(0, Math.floor((new Date(exam.end_time as string).getTime() - Date.now()) / 1000));
      if (secondsRemaining > 0) {
        timerWasLiveRef.current = true;
      }
      setTimeLeft(secondsRemaining);
      setTimerReady(true);
      if (secondsRemaining === 0 && !timerWasLiveRef.current) {
        setExpiredBeforeStart(true);
      }
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [exam?.end_time]);

  useEffect(() => {
    if (timerReady && timerWasLiveRef.current && timeLeft === 0 && exam && questions.length && !isSubmitted) {
      void handleSubmit();
    }
  }, [timerReady, timeLeft, exam, questions.length, isSubmitted, handleSubmit]);

  if (isLoading) {
    return <div className="max-w-4xl mx-auto py-20 text-center text-muted-foreground">Loading exam...</div>;
  }

  if (!exam || !questions.length) {
    return <div className="max-w-4xl mx-auto py-20 text-center text-muted-foreground">This exam is not available or does not contain any questions yet.</div>;
  }

  if (expiredBeforeStart) {
    return (
      <div className="max-w-4xl mx-auto py-20 text-center space-y-4">
        <AlertCircle className="mx-auto h-10 w-10 text-destructive" />
        <h1 className="text-2xl font-black text-primary">This examination window has closed.</h1>
        <p className="text-muted-foreground">No submission was created because the exam had already ended before you started.</p>
        <Button variant="outline" onClick={() => router.push("/dashboard/exams")}>Back to Exams</Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between sticky top-0 z-20 bg-background/95 backdrop-blur-sm py-4 border-b gap-4">
        <div className="flex items-center gap-2 md:gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} disabled={isSubmitted} className="shrink-0"><ChevronLeft className="w-5 h-5" /></Button>
          <div className="flex items-center gap-3 border-l pl-2 md:pl-4">
            <Avatar className="h-8 w-8 md:h-10 md:w-10 ring-2 ring-primary/10 shrink-0">
              <AvatarImage src={resolveMediaUrl(user?.avatar)} alt={user?.name} />
              <AvatarFallback className="bg-primary/5 text-primary"><User className="h-4 w-4" /></AvatarFallback>
            </Avatar>
            <div className="hidden sm:block overflow-hidden">
              <p className="text-xs font-black leading-none text-primary truncate uppercase">{user?.name?.split(" ")[0]}</p>
              <p className="text-[9px] text-muted-foreground uppercase font-mono font-bold mt-1 truncate">{user?.matricule || user?.id}</p>
            </div>
          </div>
          <div className="border-l pl-2 md:pl-4">
            <h1 className="font-bold text-sm md:text-base line-clamp-1 uppercase">{exam.title}</h1>
            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{currentQuestion + 1} / {questions.length}</p>
          </div>
        </div>
        <div className={cn("flex items-center self-end md:self-auto gap-2 px-4 py-2 rounded-full font-mono font-bold text-xs md:text-sm shadow-sm transition-colors shrink-0", (timeLeft ?? 0) < 300 ? "bg-destructive text-destructive-foreground animate-pulse" : "bg-primary text-white")}><Timer className="w-3 h-3 md:w-4 md:h-4" />{timerReady ? formatTime(timeLeft ?? 0) : "--:--"}</div>
      </div>

      <div className="space-y-8 pb-20 px-1">
        <div className="space-y-2">
          <div className="flex justify-between text-[10px] uppercase font-bold text-muted-foreground tracking-widest"><span>Progress</span><span>{Math.round(progress)}%</span></div>
          <Progress value={progress} className="h-2" />
        </div>

        <Card className="border-none shadow-xl bg-white overflow-hidden">
          <CardHeader className="pb-6 bg-accent/10 border-b">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <Badge variant="secondary">{exam.subject_name ?? "Subject"}</Badge>
              <Badge variant="outline">{exam.target_class}</Badge>
            </div>
            <CardTitle className="text-lg md:text-2xl leading-relaxed text-primary">{question.text}</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 md:pt-8 space-y-6 md:space-y-8">
            {question.image_url && <img src={resolveMediaUrl(question.image_url)} alt="Question visual" className="w-full rounded-2xl border bg-accent/30 max-h-[360px] object-cover" />}
            <RadioGroup value={answers[String(question.id)]?.toString()} onValueChange={(val) => handleSelect(Number(val))} className="space-y-3">
              {question.options.map((option, idx) => (
                <div key={idx} className={cn("flex items-center space-x-3 p-3 md:p-4 rounded-xl border-2 transition-all cursor-pointer hover:border-primary/50", answers[String(question.id)] === idx ? "border-primary bg-primary/5 shadow-sm" : "border-accent bg-background")} onClick={() => handleSelect(idx)}>
                  <RadioGroupItem value={idx.toString()} id={`opt-${idx}`} className="sr-only" />
                  <div className={cn("w-7 h-7 md:w-8 md:h-8 rounded-full border-2 flex items-center justify-center shrink-0 font-bold transition-colors text-sm", answers[String(question.id)] === idx ? "border-primary bg-primary text-white" : "border-muted-foreground/30 text-muted-foreground")}>{String.fromCharCode(65 + idx)}</div>
                  <Label htmlFor={`opt-${idx}`} className="flex-1 text-sm md:text-base cursor-pointer font-medium leading-tight">{option}</Label>
                </div>
              ))}
            </RadioGroup>
          </CardContent>
          <CardFooter className="flex flex-col md:flex-row justify-between border-t mt-6 md:mt-8 pt-6 gap-4">
            <Button variant="outline" onClick={() => setCurrentQuestion((prev) => Math.max(0, prev - 1))} disabled={currentQuestion === 0 || isSubmitted} className="w-full md:w-auto gap-2"><ChevronLeft className="w-4 h-4" /> Previous</Button>
            {currentQuestion === questions.length - 1 ? (
              <Button onClick={() => void handleSubmit()} disabled={isSubmitted || Object.keys(answers).length < questions.length} className="w-full md:w-auto gap-2 bg-green-600 hover:bg-green-700 shadow-lg text-white font-bold px-8"><Send className="w-4 h-4" /> Submit Exam</Button>
            ) : (
              <Button onClick={() => setCurrentQuestion((prev) => Math.min(questions.length - 1, prev + 1))} disabled={isSubmitted || answers[String(question.id)] === undefined} className="w-full md:w-auto gap-2 px-8">Next <ChevronRight className="w-4 h-4" /></Button>
            )}
          </CardFooter>
        </Card>

        {Object.keys(answers).length < questions.length && <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs md:text-sm animate-in fade-in slide-in-from-top-1"><AlertCircle className="w-5 h-5 shrink-0" /><p className="font-medium">Please answer all questions before submitting.</p></div>}
      </div>
    </div>
  );
}
