"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  ChevronRight,
  Download,
  ExternalLink,
  GraduationCap,
  Loader2,
  Lock,
  PlayCircle,
} from "lucide-react";
import { getApiErrorMessage } from "@/lib/api/errors";
import { downloadBlob } from "@/lib/browser-download";
import {
  completeLesson,
  downloadCertificate,
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
import { AcademyLoadingScreen, AcademyLogo } from "../../../_components/academy-brand";

/**
 * The learner's top bar: the EduIgnite mark back to the Academy home, and a
 * way back to the course overview. Shown on every state of the player so the
 * learner never loses sight of whose platform they are on.
 */
function LearnerTopBar({ slug }: { slug: string }) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
        <a href="/academy" className="flex min-w-0 items-center" aria-label="EduIgnite Academy home">
          <AcademyLogo size="sm" subtitle="Learning" withWordmark className="min-w-0" />
        </a>
        <a
          href={`/academy/courses/${slug}`}
          className="shrink-0 rounded-xl border border-[#264D73]/15 px-4 py-2 text-xs font-bold uppercase tracking-wide text-[#264D73] transition-colors hover:bg-[#264D73]/5"
        >
          Course overview
        </a>
      </div>
    </header>
  );
}

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
  const [isDownloadingCertificate, setIsDownloadingCertificate] = useState(false);
  const [certificateDownloadError, setCertificateDownloadError] = useState<string | null>(null);

  const handleDownloadCertificate = async () => {
    if (!certificate) return;
    setIsDownloadingCertificate(true);
    setCertificateDownloadError(null);
    try {
      const blob = await downloadCertificate(certificate.id);
      downloadBlob(blob, `EduIgnite-Certificate-${certificate.verification_id}.pdf`);
    } catch (err) {
      setCertificateDownloadError(getApiErrorMessage(err, "Could not download this certificate."));
    } finally {
      setIsDownloadingCertificate(false);
    }
  };

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
    return <AcademyLoadingScreen label="Loading your course" />;
  }

  if (loadState === "needs-enroll") {
    return (
      <div className="min-h-screen bg-[#FBFCFE]">
      <LearnerTopBar slug={slug} />
      <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center p-6">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <AcademyLogo size="lg" className="mx-auto" />
          <p className="mt-5 inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.2em] text-[#264D73]/70">
            <Lock className="h-3.5 w-3.5" /> Locked
          </p>
          <h1 className="mt-2 font-serif text-xl font-bold text-[#12314d]">Enrollment required</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            You need to enroll in this course before you can access its lessons.
          </p>
          <button
            onClick={handleEnroll}
            disabled={isEnrolling}
            className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#264D73] text-sm font-bold text-white transition-colors hover:bg-[#1c3c5c] disabled:cursor-wait disabled:opacity-70"
          >
            {isEnrolling ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enroll & start learning"}
          </button>
        </div>
      </div>
      </div>
    );
  }

  if (loadState === "error" || !course) {
    return (
      <div className="min-h-screen bg-[#FBFCFE]">
      <LearnerTopBar slug={slug} />
      <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center p-6">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <AlertTriangle className="mx-auto h-10 w-10 text-red-500" />
          <p className="mt-4 text-sm font-semibold text-red-900">{loadError || "Something went wrong."}</p>
          <button
            onClick={loadPlayer}
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl border border-[#264D73]/20 bg-white px-5 py-2.5 text-sm font-bold text-[#264D73] transition-colors hover:bg-[#264D73]/5"
          >
            Try again
          </button>
        </div>
      </div>
      </div>
    );
  }

  const progressPercent = lessons.length ? Math.round((completedCount / lessons.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#FBFCFE]">
      <LearnerTopBar slug={slug} />
      <div className="mx-auto grid max-w-7xl gap-6 p-4 sm:p-8 lg:grid-cols-[320px_1fr]">
        {/* Sidebar: modules/lessons with progress checkmarks */}
        <aside className="order-2 lg:order-1">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-6">
            <div className="mb-4 space-y-2.5">
              <h2 className="font-serif text-lg font-bold leading-snug text-[#12314d]">{course.title}</h2>
              <div className="flex items-center gap-2.5">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-[#67D0E4] transition-all"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="shrink-0 text-xs font-bold text-slate-500">
                  {completedCount}/{lessons.length}
                </p>
              </div>
            </div>
            <div className="space-y-4">
              {course.modules.map((module) => (
                <div key={module.id}>
                  <p className="mb-2 text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">
                    {module.title}
                  </p>
                  <div className="space-y-1">
                    {module.lessons.map((lesson) => (
                      <button
                        key={lesson.id}
                        onClick={() => setSelectedLessonId(lesson.id)}
                        className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
                          lesson.id === selectedLessonId
                            ? "bg-[#264D73] text-white"
                            : "text-slate-700 hover:bg-[#67D0E4]/10"
                        }`}
                      >
                        {lesson.completed ? (
                          <CheckCircle2
                            className={`h-4 w-4 shrink-0 ${lesson.id === selectedLessonId ? "text-white" : "text-emerald-600"}`}
                          />
                        ) : (
                          <PlayCircle
                            className={`h-4 w-4 shrink-0 ${lesson.id === selectedLessonId ? "text-white" : "text-[#67D0E4]"}`}
                          />
                        )}
                        <span className="flex-1 truncate">{lesson.title}</span>
                        <span className={`shrink-0 text-[11px] font-bold ${lesson.id === selectedLessonId ? "text-white/70" : "text-slate-400"}`}>
                          {lesson.duration_minutes}m
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {allComplete && course.final_assessment_id && (
              <button
                onClick={() => openQuiz(course.final_assessment_id!)}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#67D0E4]/15 py-3 text-sm font-bold text-[#264D73] transition-colors hover:bg-[#67D0E4]/25"
              >
                <Award className="h-4 w-4" /> Take final assessment
              </button>
            )}
          </div>
        </aside>

        {/* Main pane */}
        <main className="order-1 space-y-6 lg:order-2">
          {certificate && (
            <div className="flex flex-col items-center gap-3 rounded-3xl border border-[#1c3c5c] bg-gradient-to-br from-[#264D73] to-[#1c3c5c] p-8 text-center text-white shadow-sm">
              <AcademyLogo onDark size="lg" />
              <h2 className="font-serif text-2xl font-bold">Certificate earned!</h2>
              <p className="text-sm text-white/80">
                {certificate.tier === "CERTIFIED_USER" ? "Certified EduIgnite User" : "Certificate of Completion"}:{" "}
                {certificate.course_title}
              </p>
              <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold">{certificate.verification_id}</span>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={handleDownloadCertificate}
                  disabled={isDownloadingCertificate}
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-[#264D73] transition-colors hover:bg-white/90 disabled:opacity-60"
                >
                  {isDownloadingCertificate ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Download your certificate
                </button>
                <a
                  href="/academy/certificates"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/25 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-white/10"
                >
                  View my certificates
                </a>
              </div>
              {certificateDownloadError && (
                <p className="text-xs font-semibold text-red-200">{certificateDownloadError}</p>
              )}
            </div>
          )}

          {activeQuizId ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="font-serif text-xl font-bold text-[#12314d]">
                  {quiz?.kind === "FINAL_ASSESSMENT" ? "Final assessment" : "Lesson quiz"}
                </h2>
                <button
                  className="text-xs font-bold text-slate-500 hover:text-[#264D73]"
                  onClick={() => setActiveQuizId(null)}
                >
                  Close
                </button>
              </div>

              {quizLoading && !quiz && <Loader2 className="h-6 w-6 animate-spin text-[#264D73]" />}
              {quizError && (
                <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-900">
                  {quizError}
                </div>
              )}

              {quiz && !quizResult && (
                <div className="space-y-8">
                  {quiz.questions.map((q, idx) => (
                    <div key={q.id} className="space-y-3">
                      <p className="font-semibold text-slate-800">
                        {idx + 1}. {q.text}
                      </p>
                      <RadioGroup
                        value={quizAnswers[q.id]?.toString() ?? ""}
                        onValueChange={(v) => setQuizAnswers((prev) => ({ ...prev, [q.id]: Number(v) }))}
                        className="space-y-2"
                      >
                        {q.choices.map((choice, choiceIdx) => (
                          <div key={choiceIdx} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <RadioGroupItem value={choiceIdx.toString()} id={`q${q.id}-c${choiceIdx}`} />
                            <Label htmlFor={`q${q.id}-c${choiceIdx}`} className="cursor-pointer text-sm font-medium text-slate-700">
                              {choice}
                            </Label>
                          </div>
                        ))}
                      </RadioGroup>
                    </div>
                  ))}
                  <button
                    onClick={submitQuiz}
                    disabled={quizLoading || Object.keys(quizAnswers).length < quiz.questions.length}
                    className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#264D73] text-sm font-bold text-white transition-colors hover:bg-[#1c3c5c] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {quizLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Submit answers"}
                  </button>
                </div>
              )}

              {quizResult && (
                <div className="flex flex-col items-center gap-4 py-6 text-center">
                  {quizResult.passed ? (
                    <CheckCircle2 className="h-14 w-14 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="h-14 w-14 text-amber-500" />
                  )}
                  <p className="font-serif text-2xl font-bold text-[#12314d]">{quizResult.score_percent}%</p>
                  <p
                    className={`text-sm font-bold ${
                      quizResult.passed ? "text-emerald-700" : "text-amber-700"
                    }`}
                  >
                    {quizResult.passed ? "Passed" : "Not passed. Try again."}
                  </p>
                  <button
                    onClick={() => setActiveQuizId(null)}
                    className="rounded-xl border border-[#264D73]/20 bg-white px-5 py-2.5 text-sm font-bold text-[#264D73] transition-colors hover:bg-[#264D73]/5"
                  >
                    Continue
                  </button>
                </div>
              )}
            </div>
          ) : (
            selectedLesson && (
              <div className="space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <LessonVideo
                  provider={selectedLesson.video_provider}
                  url={selectedLesson.video_url}
                  title={selectedLesson.title}
                />
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-serif text-xl font-bold text-[#12314d]">{selectedLesson.title}</h2>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">{selectedLesson.description}</p>
                  </div>
                  {selectedLesson.completed ? (
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Complete
                    </span>
                  ) : (
                    <button
                      onClick={() => handleMarkComplete(selectedLesson)}
                      disabled={completingLessonId === selectedLesson.id}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#264D73] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#1c3c5c] disabled:cursor-wait disabled:opacity-70"
                    >
                      {completingLessonId === selectedLesson.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          Mark complete <ChevronRight className="h-4 w-4" />
                        </>
                      )}
                    </button>
                  )}
                </div>

                {selectedLesson.quiz_id && (
                  <button
                    onClick={() => openQuiz(selectedLesson.quiz_id!)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#264D73]/20 bg-white px-4 py-3 text-sm font-bold text-[#264D73] transition-colors hover:bg-[#264D73]/5"
                  >
                    <GraduationCap className="h-4 w-4" /> Take lesson quiz
                  </button>
                )}

                {/*
                  Phase 1 placeholder ONLY: this is a plain deep-link to the
                  real School OS dashboard using the visitor's existing
                  login. There is no separate practice sandbox here.
                  Real sandbox execution is an explicit Phase 2 roadmap
                  item (see academy-contract.md); do not mistake this link
                  for that feature.
                */}
                <a
                  href="/dashboard"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-[#264D73]/25 px-4 py-3 text-sm font-semibold text-[#264D73]/70 transition-colors hover:bg-[#264D73]/5"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Practice in EduIgnite
                </a>
                <p className="text-center text-xs text-slate-500">
                  Opens your real EduIgnite dashboard with the same login. There is no separate practice sandbox yet.
                </p>
              </div>
            )
          )}
        </main>
      </div>
    </div>
  );
}
