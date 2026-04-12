"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChangeEvent, useRef } from "react";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookOpenCheck, CheckCircle2, ClipboardList, FileText, Link2, Paperclip, Plus } from "lucide-react";

import { GlassCard } from "@/components/glass-card";
import { ThemeToggle } from "@/components/theme-toggle";
import { api } from "@/lib/api";

type ClassworkItem = {
  id: string;
  course_id: number;
  topic: { id: number; title: string } | null;
  type: "assignment" | "material" | "quiz";
  title: string;
  description: string;
  points: number;
  due_date: string | null;
  created_at: string;
  status: "assigned" | "turned_in" | "missing" | "late";
  submitted_at: string | null;
  attachments: Array<{ id: string; source: string; name: string; url?: string | null; mimeType?: string | null; sizeBytes?: number | null }>;
  quiz_questions: Array<{ id: string; type: "mcq" | "short"; question: string; options: string[]; correctAnswer: string }>;
  submission_content: string;
};

type WorkItemType = "drive" | "link" | "file" | "docs" | "slides" | "sheets" | "drawings" | "vids";

type WorkItem = {
  id: string;
  type: WorkItemType;
  label: string;
  url?: string;
  sizeBytes?: number;
};

const normalizeClassworkItem = (raw: unknown): ClassworkItem | null => {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const source = raw as Record<string, unknown>;
  const normalizedQuestions = Array.isArray(source.quiz_questions)
    ? source.quiz_questions
        .filter((question) => question && typeof question === "object")
        .map((question, index) => {
          const q = question as Record<string, unknown>;
          const optionValues = Array.isArray(q.options)
            ? q.options.filter((option): option is string => typeof option === "string")
            : [];
          const questionType: "mcq" | "short" = q.type === "short" ? "short" : "mcq";
          return {
            id: typeof q.id === "string" && q.id.trim() ? q.id : `q-${index + 1}`,
            type: questionType,
            question: typeof q.question === "string" ? q.question : "",
            options: optionValues,
            correctAnswer: typeof q.correctAnswer === "string" ? q.correctAnswer : "",
          };
        })
    : [];

  const normalizedAttachments = Array.isArray(source.attachments)
    ? source.attachments.filter((attachment) => attachment && typeof attachment === "object") as ClassworkItem["attachments"]
    : [];

  return {
    id: typeof source.id === "string" ? source.id : "",
    course_id: typeof source.course_id === "number" ? source.course_id : 0,
    topic: source.topic && typeof source.topic === "object"
      ? ({
          id: typeof (source.topic as Record<string, unknown>).id === "number" ? (source.topic as Record<string, unknown>).id as number : 0,
          title: typeof (source.topic as Record<string, unknown>).title === "string" ? (source.topic as Record<string, unknown>).title as string : "",
        })
      : null,
    type: source.type === "quiz" ? "quiz" : source.type === "material" ? "material" : "assignment",
    title: typeof source.title === "string" ? source.title : "Untitled",
    description: typeof source.description === "string" ? source.description : "",
    points: typeof source.points === "number" ? source.points : 0,
    due_date: typeof source.due_date === "string" ? source.due_date : null,
    created_at: typeof source.created_at === "string" ? source.created_at : new Date().toISOString(),
    status: source.status === "turned_in" || source.status === "missing" || source.status === "late" ? source.status : "assigned",
    submitted_at: typeof source.submitted_at === "string" ? source.submitted_at : null,
    attachments: normalizedAttachments,
    quiz_questions: normalizedQuestions,
    submission_content: typeof source.submission_content === "string" ? source.submission_content : "",
  };
};

function TypeIcon({ type }: { type: ClassworkItem["type"] }) {
  if (type === "quiz") {
    return <BookOpenCheck className="h-5 w-5" />;
  }
  if (type === "material") {
    return <FileText className="h-5 w-5" />;
  }
  return <ClipboardList className="h-5 w-5" />;
}

export default function ClassworkDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<ClassworkItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [responseText, setResponseText] = useState("");
  const menuContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const classworkId = params?.id;

  useEffect(() => {
    if (!classworkId) {
      return;
    }

    let active = true;

    const loadItem = async () => {
      try {
        setLoading(true);
        setError("");
        const response = await api.classworkItem(classworkId);
        if (!active) {
          return;
        }
        const normalized = normalizeClassworkItem(response.data);
        if (!normalized) {
          setItem(null);
          setError("Invalid classwork data received.");
          return;
        }

        // Fallback for environments where /classwork/item may omit quiz_questions.
        if (normalized.type === "quiz" && normalized.quiz_questions.length === 0) {
          try {
            const courseResponse = await api.classworkByCourse(normalized.course_id);
            const groups = (courseResponse as unknown as { data?: Array<{ items?: Array<Record<string, unknown>> }> })?.data || [];
            const matched = groups
              .flatMap((group) => group.items || [])
              .find((entry) => entry && entry.id === normalized.id);

            if (matched && Array.isArray(matched.quiz_questions)) {
              const fromCourse = normalizeClassworkItem({ ...normalized, quiz_questions: matched.quiz_questions });
              if (fromCourse) {
                setItem(fromCourse);
                return;
              }
            }
          } catch {
            // Keep original normalized payload if fallback lookup fails.
          }
        }

        setItem(normalized);
      } catch (err) {
        if (!active) {
          return;
        }
        setItem(null);
        setError(err instanceof Error && err.message ? err.message : "Could not load classwork item.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadItem();

    return () => {
      active = false;
    };
  }, [classworkId]);

  useEffect(() => {
    if (!item) {
      return;
    }

    if (item.type !== "quiz") {
      return;
    }

    const raw = (item.submission_content || "").trim();
    if (!raw.startsWith("QUIZ_RESPONSES_JSON:")) {
      return;
    }

    const payloadText = raw.slice("QUIZ_RESPONSES_JSON:".length).split("\n\n")[0]?.trim();
    if (!payloadText) {
      return;
    }

    try {
      const parsed = JSON.parse(payloadText) as { answers?: Record<string, string>; comment?: string };
      if (parsed.answers && typeof parsed.answers === "object") {
        setQuizAnswers(parsed.answers);
      }
      if (typeof parsed.comment === "string") {
        setResponseText(parsed.comment);
      }
    } catch {
      // Ignore malformed historical payloads.
    }
  }, [item]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (menuContainerRef.current && target && !menuContainerRef.current.contains(target)) {
        setMenuOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const canSubmit = useMemo(() => {
    if (!item) {
      return false;
    }
    return item.type !== "material" && item.status !== "turned_in";
  }, [item]);

  const addWorkItem = (entry: Omit<WorkItem, "id">) => {
    setWorkItems((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        ...entry,
      },
    ]);
  };

  const openExternalAndAttach = (type: WorkItemType, label: string, url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
    addWorkItem({ type, label, url });
    setMenuOpen(false);
  };

  const handleAddLink = () => {
    const value = window.prompt("Paste link URL");
    if (!value) {
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    try {
      const parsed = new URL(trimmed);
      addWorkItem({
        type: "link",
        label: parsed.hostname,
        url: parsed.toString(),
      });
      setMenuOpen(false);
    } catch {
      setError("Please enter a valid URL.");
    }
  };

  const handleFilePick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }
    Array.from(files).forEach((file) => {
      addWorkItem({
        type: "file",
        label: file.name,
        sizeBytes: file.size,
      });
    });
    event.target.value = "";
    setMenuOpen(false);
  };

  const removeWorkItem = (id: string) => {
    setWorkItems((prev) => prev.filter((entry) => entry.id !== id));
  };

  const buildSubmissionContent = () => {
    if (item?.type === "quiz" && item.quiz_questions.length > 0) {
      const normalizedAnswers: Record<string, string> = {};
      item.quiz_questions.forEach((question) => {
        normalizedAnswers[question.id] = (quizAnswers[question.id] || "").trim();
      });

      const lines = ["Quiz answers:"];
      item.quiz_questions.forEach((question, index) => {
        const answer = normalizedAnswers[question.id] || "(not answered)";
        lines.push(`Q${index + 1}: ${question.question}`);
        lines.push(`Answer: ${answer}`);
      });

      if (responseText.trim()) {
        lines.push(`Comment: ${responseText.trim()}`);
      }

      const payload = {
        mode: "quiz_v1",
        answers: normalizedAnswers,
        comment: responseText.trim(),
      };

      return `QUIZ_RESPONSES_JSON:${JSON.stringify(payload)}\n\n${lines.join("\n")}`;
    }

    const lines: string[] = [];
    if (responseText.trim()) {
      lines.push(`Response: ${responseText.trim()}`);
    }

    if (workItems.length > 0) {
      lines.push("Attachments:");
      workItems.forEach((entry) => {
        const parts = [entry.type.toUpperCase(), entry.label];
        if (entry.url) {
          parts.push(entry.url);
        }
        if (typeof entry.sizeBytes === "number") {
          parts.push(`${entry.sizeBytes} bytes`);
        }
        lines.push(`- ${parts.join(" | ")}`);
      });
    }

    return lines.join("\n");
  };

  const submit = async () => {
    if (!classworkId) {
      return;
    }

    if (item?.type === "quiz" && item.quiz_questions.length > 0) {
      const unanswered = item.quiz_questions.some((question) => !(quizAnswers[question.id] || "").trim());
      if (unanswered) {
        setError("Please answer all quiz questions before submitting.");
        return;
      }
    }

    try {
      setSubmitting(true);
      setError("");
      await api.submitClasswork(classworkId, buildSubmissionContent());
      const refreshed = await api.classworkItem(classworkId);
      setItem(refreshed.data);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Could not submit classwork.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-4xl space-y-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/30 px-4 py-2 text-sm font-medium hover:bg-white/45"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <ThemeToggle />
      </div>

      <GlassCard className="space-y-5 p-6">
        {loading ? (
          <p className="text-sm opacity-75">Loading classwork item...</p>
        ) : error ? (
          <p className="text-sm text-rose-600 dark:text-rose-300">{error}</p>
        ) : !item ? (
          <p className="text-sm opacity-75">Classwork item not found.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-65">{item.type}</p>
                <h1 className="mt-2 font-heading text-3xl font-bold">{item.title}</h1>
                <p className="mt-2 text-sm opacity-75">{item.topic ? `Topic: ${item.topic.title}` : "No topic assigned"}</p>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/35 px-3 py-1.5 text-sm font-medium">
                <TypeIcon type={item.type} />
                {item.status.replace("_", " ")}
              </span>
            </div>

            <div className="grid gap-3 rounded-2xl border border-white/15 bg-white/20 p-4 text-sm sm:grid-cols-2">
              <p>
                <span className="opacity-70">Due date:</span> {item.due_date ? new Date(item.due_date).toLocaleDateString() : "No due date"}
              </p>
              <p>
                <span className="opacity-70">Created:</span> {new Date(item.created_at).toLocaleString()}
              </p>
              <p>
                <span className="opacity-70">Submitted:</span> {item.submitted_at ? new Date(item.submitted_at).toLocaleString() : "Not submitted"}
              </p>
              <p>
                <span className="opacity-70">Course ID:</span> {item.course_id}
              </p>
            </div>

            <div className="rounded-2xl border border-white/15 bg-white/20 p-4">
              <h2 className="font-semibold">Instructions</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 opacity-90">{item.description || "No additional instructions provided."}</p>
            </div>

            {item.type === "quiz" && item.quiz_questions.length > 0 ? (
              <div className="rounded-2xl border border-white/15 bg-white/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-semibold">Quiz questions</h2>
                  <span className="text-sm opacity-75">{item.quiz_questions.length} questions</span>
                </div>

                <div className="mt-4 space-y-4">
                  {item.quiz_questions.map((question, index) => (
                    <div key={question.id} className="rounded-xl border border-white/20 bg-white/25 p-3">
                      <p className="text-sm font-semibold">Q{index + 1}. {question.question}</p>
                      {question.type === "mcq" && question.options.length > 0 ? (
                        <div className="mt-3 space-y-2">
                          {question.options.map((option, optionIndex) => (
                            <label key={`${question.id}-${optionIndex}`} className="flex cursor-pointer items-center gap-2 text-sm">
                              <input
                                type="radio"
                                name={`question-${question.id}`}
                                value={option}
                                checked={(quizAnswers[question.id] || "") === option}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  setQuizAnswers((prev) => ({ ...prev, [question.id]: value }));
                                }}
                                disabled={!canSubmit}
                              />
                              <span>{option || `Option ${optionIndex + 1}`}</span>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <textarea
                          value={quizAnswers[question.id] || ""}
                          onChange={(event) => {
                            const value = event.target.value;
                            setQuizAnswers((prev) => ({ ...prev, [question.id]: value }));
                          }}
                          placeholder="Type your answer"
                          className="mt-3 w-full rounded-lg border border-white/20 bg-white/35 p-3 text-sm outline-none placeholder:text-slate-500 focus:border-sky-400"
                          rows={2}
                          disabled={!canSubmit}
                        />
                      )}
                    </div>
                  ))}
                </div>

                <textarea
                  value={responseText}
                  onChange={(event) => setResponseText(event.target.value)}
                  placeholder="Optional private comment"
                  className="mt-4 w-full rounded-lg border border-white/20 bg-white/35 p-3 text-sm outline-none placeholder:text-slate-500 focus:border-sky-400"
                  rows={3}
                  disabled={!canSubmit}
                />
              </div>
            ) : item.type !== "material" ? (
              <div className="rounded-2xl border border-white/15 bg-white/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-semibold">Your work</h2>
                  <span className="text-sm opacity-75">{item.status.replace("_", " ")}</span>
                </div>

                <div ref={menuContainerRef} className="relative mt-3">
                  <button
                    type="button"
                    onClick={() => setMenuOpen((open) => !open)}
                    className="inline-flex items-center gap-2 rounded-full border border-sky-300 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-100"
                  >
                    <Plus className="h-4 w-4" />
                    Add or create
                  </button>

                  {menuOpen ? (
                    <div className="absolute z-20 mt-2 w-72 rounded-xl border border-slate-300 bg-white p-2 text-sm text-slate-800 shadow-xl">
                      <button
                        type="button"
                        onClick={() => openExternalAndAttach("drive", "Google Drive", "https://drive.google.com")}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-slate-800 hover:bg-slate-100"
                      >
                        <Paperclip className="h-4 w-4 text-slate-700" /> Google Drive
                      </button>
                      <button
                        type="button"
                        onClick={handleAddLink}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-slate-800 hover:bg-slate-100"
                      >
                        <Link2 className="h-4 w-4 text-slate-700" /> Link
                      </button>
                      <button
                        type="button"
                        onClick={handleFilePick}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-slate-800 hover:bg-slate-100"
                      >
                        <FileText className="h-4 w-4 text-slate-700" /> File
                      </button>

                      <div className="my-2 border-t border-slate-200 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                        Create new
                      </div>

                      <button
                        type="button"
                        onClick={() => openExternalAndAttach("docs", "Google Docs", "https://docs.new")}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-slate-800 hover:bg-slate-100"
                      >
                        Docs
                      </button>
                      <button
                        type="button"
                        onClick={() => openExternalAndAttach("slides", "Google Slides", "https://slides.new")}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-slate-800 hover:bg-slate-100"
                      >
                        Slides
                      </button>
                      <button
                        type="button"
                        onClick={() => openExternalAndAttach("sheets", "Google Sheets", "https://sheets.new")}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-slate-800 hover:bg-slate-100"
                      >
                        Sheets
                      </button>
                      <button
                        type="button"
                        onClick={() => openExternalAndAttach("drawings", "Google Drawings", "https://drawings.new")}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-slate-800 hover:bg-slate-100"
                      >
                        Drawings
                      </button>
                      <button
                        type="button"
                        onClick={() => openExternalAndAttach("vids", "Google Vids", "https://vids.new")}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-slate-800 hover:bg-slate-100"
                      >
                        Vids
                      </button>
                    </div>
                  ) : null}

                  <input ref={fileInputRef} type="file" multiple onChange={handleFileChange} className="hidden" />
                </div>

                <div className="mt-4 space-y-2">
                  {workItems.length === 0 ? (
                    <p className="text-sm opacity-70">No work attached yet.</p>
                  ) : (
                    workItems.map((entry) => (
                      <div key={entry.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/20 bg-white/30 px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{entry.label}</p>
                          <p className="truncate text-xs opacity-75">
                            {entry.type}
                            {entry.url ? ` • ${entry.url}` : ""}
                            {typeof entry.sizeBytes === "number" ? ` • ${entry.sizeBytes} bytes` : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeWorkItem(entry.id)}
                          className="rounded-md px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100"
                        >
                          Remove
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <textarea
                  value={responseText}
                  onChange={(event) => setResponseText(event.target.value)}
                  placeholder="Add a private comment or answer summary"
                  className="mt-4 w-full rounded-lg border border-white/20 bg-white/35 p-3 text-sm outline-none placeholder:text-slate-500 focus:border-sky-400"
                  rows={3}
                />
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              {canSubmit ? (
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-full bg-sky-600 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {submitting ? "Submitting..." : "Turn in"}
                </button>
              ) : (
                <span className="rounded-full border border-emerald-400/50 bg-emerald-100/70 px-4 py-2 text-sm font-semibold text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-900/30 dark:text-emerald-200">
                  Submission complete
                </span>
              )}

              <Link href={`/submissions?courseId=${item.course_id}`} className="text-sm font-medium text-sky-700 hover:underline dark:text-sky-300">
                View all your work
              </Link>
            </div>
          </>
        )}
      </GlassCard>
    </main>
  );
}
