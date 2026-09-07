"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  GraduationCap,
  Loader2,
  Lock,
  PlayCircle,
} from "lucide-react";
import { getApiErrorMessage } from "@/lib/api/errors";
import {
  completeLesson,
  enrollInCourse,
  getCoursePlayer,
  getMyCertificates,
  getQuizAttempt,
  submitQuizAttempt,
  type CoursePlayer,
  type MyCertificate,
  type PlayerLesson,
  type QuizAttemptGetResponse,
  type QuizAttemptSubmitResponse,
} from "../../../start/_lib/api";
import { LessonVideo } from "./_components/lesson-video";

type LoadState = "loading" | "ready" | "needs-enroll" | "error";

function allLessonsOf(course: CoursePlayer): PlayerLesson[] {
  return course.modules.flatMap((m) => m.lessons);
}

export default function CourseLearnPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [course, setCourse] = useState<CoursePlayer | null>(null);
  const [isEnrolling, setIsEnrolling] = useState(false);

  const [selectedLessonId, setSelectedLessonId] = useState<number | null>(null);
  const [completingLessonId, setCompletingLessonId] = useState<number | null>(null);
  const [certificate, setCertificate] = useState<MyCertificate | null>(null);

  // Quiz-in-progress state, keyed loosely — only one quiz open at a time.
  const [activeQuizId, setActiveQuizId] = useState<number | null>(null);
  const [quiz, setQuiz] = useState<QuizAttemptGetResponse | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [quizResult, setQuizResult] = useState<QuizAttemptSubmitResponse | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);

  const loadPlayer = async () => {
    setLoadState("loading");
    setLoadError(null);
    try {
      const data = await getCoursePlayer(slug);
      setCourse(data);
      setLoadState("ready");
      const lessons = allLessonsOf(data);
      const requestedLessonId = Number(searchParams.get("lesson"));
      const requested = lessons.find((l) => l.id === requestedLessonId);
      const firstIncomplete = lessons.find((l) => !l.completed);
      setSelectedLessonId((requested ?? firstIncomplete ?? lessons[0])?.id ?? null);
    } catch (err: any) {
      if (err?.response?.status === 403) {
        setLoadState("needs-enroll");
      } else {
        setLoadError(getApiErrorMessage(err, "Could not load this course."));
        setLoadState("error");
      }
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.replace(`/academy/start?returnPath=${encodeURIComponent(`/academy/courses/${slug}/learn`)}`);
      return;
    }
    loadPlayer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAuthenticated, slug]);

  const lessons = useMemo(() => (course ? allLessonsOf(course) : []), [course]);
  const selectedLesson = lessons.find((l) => l.id === selectedLessonId) || null;
  const completedCount = lessons.filter((l) => l.completed).length;
  const allComplete = lessons.length > 0 && completedCount === lessons.length;

  const refreshCertificateIfAny = async () => {
    try {
      const certs = await getMyCertificates();
      const mine = certs.find((c) => c.course_slug === slug);
      if (mine) setCertificate(mine);
    } catch {
      // Non-critical — the learner can still see everything else worked.
    }
  };

  const handleEnroll = async () => {
    setIsEnrolling(true);
    try {
      await enrollInCourse(slug);
      await loadPlayer();
    } catch (err) {
      setLoadError(getApiErrorMessage(err, "Could not enroll in this course."));
      setLoadState("error");
    } finally {
      setIsEnrolling(false);
    }
  };

  const handleMarkComplete = async (lesson: PlayerLesson) => {
    setCompletingLessonId(lesson.id);
    try {
      await completeLesson(lesson.id);
      setCourse((prev) =>
        prev
          ? {
              ...prev,
              modules: prev.modules.map((m) => ({
                ...m,
                lessons: m.lessons.map((l) => (l.id === lesson.id ? { ...l, completed: true } : l)),
              })),
            }
          : prev
      );
      // The completion endpoint may silently auto-issue a certificate
      // server-side; check for one rather than parsing it out of this
      // response (the endpoint only returns {lesson_id, completed}).
      await refreshCertificateIfAny();
    } catch (err) {
      setLoadError(getApiErrorMessage(err, "Could not mark this lesson complete."));
    } finally {
      setCompletingLessonId(null);
    }
  };

  const openQuiz = async (quizId: number) => {
    setActiveQuizId(quizId);
    setQuiz(null);
    setQuizResult(null);
    setQuizAnswers({});
    setQuizError(null);
    setQuizLoading(true);
    try {
      const data = await getQuizAttempt(quizId);
      setQuiz(data);
    } catch (err) {
      setQuizError(getApiErrorMessage(err, "Could not load this quiz."));
    } finally {
      setQuizLoading(false);
    }
  };

  const submitQuiz = async () => {
    if (!quiz) return;
    setQuizLoading(true);
    setQuizError(null);
    try {
      const answers = quiz.questions.map((q) => ({
        question_id: q.id,
        selected_index: quizAnswers[q.id] ?? -1,
      }));
      const result = await submitQuizAttempt(quiz.quiz_id, answers);
      setQuizResult(result);
      if (result.passed) {
        await refreshCertificateIfAny();
      }
    } catch (err) {
      setQuizError(getApiErrorMessage(err, "Could not submit your answers."));
    } finally {
      setQuizLoading(false);
    }
  };

  if (loadState === "loading" || authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F0F2F5]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (loadState === "needs-enroll") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F0F2F5] p-6">
        <Card className="max-w-md rounded-[2.5rem] border-none p-4 text-center shadow-2xl">
          <CardContent className="flex flex-col items-center gap-4 pt-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <Lock className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-xl font-black uppercase tracking-tight text-primary">Enrollment Required</h1>
            <p className="text-sm text-muted-foreground">
              You need to enroll in this course before you can access its lessons.
            </p>
            <Button
              onClick={handleEnroll}
              disabled={isEnrolling}
              className="h-12 w-full rounded-2xl bg-primary font-black uppercase tracking-widest text-white hover:bg-primary/90"
            >
              {isEnrolling ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enroll & Start Learning"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loadState === "error" || !course) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F0F2F5] p-6">
        <Card className="max-w-md rounded-[2.5rem] border-none p-4 text-center shadow-2xl">
          <CardContent className="flex flex-col items-center gap-4 pt-8">
            <AlertTriangle className="h-10 w-10 text-red-500" />
            <p className="text-sm font-bold text-red-900">{loadError || "Something went wrong."}</p>
            <Button variant="outline" onClick={loadPlayer} className="rounded-2xl">
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F0F2F5]">
      <div className="mx-auto grid max-w-7xl gap-6 p-4 sm:p-8 lg:grid-cols-[320px_1fr]">
        {/* Sidebar: modules/lessons with progress checkmarks */}
        <aside className="order-2 lg:order-1">
          <Card className="rounded-[2rem] border-none shadow-xl">
            <CardContent className="p-5">
              <div className="mb-4 space-y-1">
                <h2 className="text-lg font-black uppercase tracking-tight text-primary">{course.title}</h2>
                <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  {completedCount}/{lessons.length} lessons complete
                </p>
              </div>
              <div className="space-y-4">
                {course.modules.map((module) => (
                  <div key={module.id}>
                    <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                      {module.title}
                    </p>
                    <div className="space-y-1">
                      {module.lessons.map((lesson) => (
                        <button
                          key={lesson.id}
                          onClick={() => setSelectedLessonId(lesson.id)}
                          className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition-all ${
                            lesson.id === selectedLessonId
                              ? "bg-primary text-white shadow-md"
                              : "text-slate-700 hover:bg-primary/5"
                          }`}
                        >
                          {lesson.completed ? (
                            <CheckCircle2
                              className={`h-4 w-4 shrink-0 ${lesson.id === selectedLessonId ? "text-white" : "text-green-600"}`}
                            />
                          ) : (
                            <PlayCircle
                              className={`h-4 w-4 shrink-0 ${lesson.id === selectedLessonId ? "text-white" : "text-primary/40"}`}
                            />
                          )}
                          <span className="flex-1 truncate">{lesson.title}</span>
                          <span className={`text-[10px] ${lesson.id === selectedLessonId ? "text-white/70" : "text-muted-foreground"}`}>
                            {lesson.duration_minutes}m
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {allComplete && course.final_assessment_id && (
                <Button
                  onClick={() => openQuiz(course.final_assessment_id!)}
                  className="mt-5 w-full rounded-2xl bg-secondary font-black uppercase tracking-widest text-primary hover:bg-secondary/90"
                >
                  <Award className="mr-2 h-4 w-4" /> Take Final Assessment
                </Button>
              )}
            </CardContent>
          </Card>
        </aside>

        {/* Main pane */}
        <main className="order-1 space-y-6 lg:order-2">
          {certificate && (
            <Card className="rounded-[2rem] border-none bg-gradient-to-br from-primary to-primary/80 text-white shadow-2xl">
              <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
                <Award className="h-12 w-12 text-secondary" />
                <h2 className="text-2xl font-black uppercase tracking-tight">Certificate Earned!</h2>
                <p className="text-sm text-white/80">
                  {certificate.tier === "CERTIFIED_USER" ? "Certified EduIgnite User" : "Certificate of Completion"} —{" "}
                  {certificate.course_title}
                </p>
                <Badge className="bg-white/15 text-white">{certificate.verification_id}</Badge>
                <Button asChild variant="secondary" className="mt-2 rounded-xl font-bold">
                  <a href="/academy/certificates">View My Certificates</a>
                </Button>
              </CardContent>
            </Card>
          )}

          {activeQuizId ? (
            <Card className="rounded-[2rem] border-none shadow-xl">
              <CardContent className="p-8">
                <div className="mb-6 flex items-center justify-between">
                  <h2 className="text-xl font-black uppercase tracking-tight text-primary">
                    {quiz?.kind === "FINAL_ASSESSMENT" ? "Final Assessment" : "Lesson Quiz"}
                  </h2>
                  <button
                    className="text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-primary"
                    onClick={() => setActiveQuizId(null)}
                  >
                    Close
                  </button>
                </div>

                {quizLoading && !quiz && <Loader2 className="h-6 w-6 animate-spin text-primary" />}
                {quizError && (
                  <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-900">
                    {quizError}
                  </div>
                )}

                {quiz && !quizResult && (
                  <div className="space-y-8">
                    {quiz.questions.map((q, idx) => (
                      <div key={q.id} className="space-y-3">
                        <p className="font-bold text-slate-800">
                          {idx + 1}. {q.text}
                        </p>
                        <RadioGroup
                          value={quizAnswers[q.id]?.toString() ?? ""}
                          onValueChange={(v) => setQuizAnswers((prev) => ({ ...prev, [q.id]: Number(v) }))}
                          className="space-y-2"
                        >
                          {q.choices.map((choice, choiceIdx) => (
                            <div key={choiceIdx} className="flex items-center gap-3 rounded-xl bg-accent/30 px-4 py-3">
                              <RadioGroupItem value={choiceIdx.toString()} id={`q${q.id}-c${choiceIdx}`} />
                              <Label htmlFor={`q${q.id}-c${choiceIdx}`} className="cursor-pointer font-medium">
                                {choice}
                              </Label>
                            </div>
                          ))}
                        </RadioGroup>
                      </div>
                    ))}
                    <Button
                      onClick={submitQuiz}
                      disabled={quizLoading || Object.keys(quizAnswers).length < quiz.questions.length}
                      className="h-14 w-full rounded-2xl bg-primary font-black uppercase tracking-widest text-white hover:bg-primary/90"
                    >
                      {quizLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Submit Answers"}
                    </Button>
                  </div>
                )}

                {quizResult && (
                  <div className="flex flex-col items-center gap-4 py-6 text-center">
                    {quizResult.passed ? (
                      <CheckCircle2 className="h-14 w-14 text-green-600" />
                    ) : (
                      <AlertTriangle className="h-14 w-14 text-amber-500" />
                    )}
                    <p className="text-2xl font-black">{quizResult.score_percent}%</p>
                    <p
                      className={`text-sm font-black uppercase tracking-widest ${
                        quizResult.passed ? "text-green-700" : "text-amber-700"
                      }`}
                    >
                      {quizResult.passed ? "Passed" : "Not Passed — try again"}
                    </p>
                    <Button variant="outline" onClick={() => setActiveQuizId(null)} className="rounded-xl">
                      Continue
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            selectedLesson && (
              <Card className="rounded-[2rem] border-none shadow-xl">
                <CardContent className="space-y-5 p-6">
                  <LessonVideo
                    provider={selectedLesson.video_provider}
                    url={selectedLesson.video_url}
                    title={selectedLesson.title}
                  />
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-black text-primary">{selectedLesson.title}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">{selectedLesson.description}</p>
                    </div>
                    {selectedLesson.completed ? (
                      <Badge className="shrink-0 bg-green-100 text-green-800 hover:bg-green-100">
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Complete
                      </Badge>
                    ) : (
                      <Button
                        onClick={() => handleMarkComplete(selectedLesson)}
                        disabled={completingLessonId === selectedLesson.id}
                        className="shrink-0 rounded-xl bg-primary font-bold text-white hover:bg-primary/90"
                      >
                        {completingLessonId === selectedLesson.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            Mark Complete <ChevronRight className="ml-1 h-4 w-4" />
                          </>
                        )}
                      </Button>
                    )}
                  </div>

                  {selectedLesson.quiz_id && (
                    <Button
                      variant="outline"
                      onClick={() => openQuiz(selectedLesson.quiz_id!)}
                      className="w-full rounded-xl border-primary/20 font-bold text-primary hover:bg-primary/5"
                    >
                      <GraduationCap className="mr-2 h-4 w-4" /> Take Lesson Quiz
                    </Button>
                  )}

                  {/*
                    Phase 1 placeholder ONLY: this is a plain deep-link to the
                    real School OS dashboard using the visitor's existing
                    login — there is no provisioned sandbox instance here.
                    Real sandbox execution is an explicit Phase 2 roadmap
                    item (see academy-contract.md); do not mistake this link
                    for that feature.
                  */}
                  <a
                    href="/dashboard"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-primary/30 px-4 py-3 text-xs font-black uppercase tracking-widest text-primary/70 hover:bg-primary/5"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Practice in EduIgnite
                  </a>
                  <p className="text-center text-[10px] font-medium text-muted-foreground">
                    Opens your real EduIgnite dashboard with the same login — not yet a separate practice sandbox.
                  </p>
                </CardContent>
              </Card>
            )
          )}
        </main>
      </div>
    </div>
  );
}
