"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Archive, MessageSquarePlus, Pin, Trash2 } from "lucide-react";

import { ChatWindow } from "@/components/chat-window";
import { GlassCard } from "@/components/glass-card";
import { ThemeToggle } from "@/components/theme-toggle";
import { ChatSessionMenu } from "@/components/chat-session-menu";
import { api } from "@/lib/api";
import { authStorage } from "@/lib/auth";


type LeaderboardRow = {
  name: string;
  rank_score: number;
  completion_percentage: number;
  quiz_score: number;
};

type CourseRow = {
  id: number;
  title: string;
  course_code: string;
  description: string;
};

type ChatSessionRow = {
  session_id: string;
  preview: string;
  updated_at: string | null;
  custom_title: string | null;
  is_pinned: boolean;
  is_archived: boolean;
  pinned_at: string | null;
  archived_at: string | null;
};

type ChatMessageRow = { role: "user" | "assistant"; text: string };

const extractErrorMessage = (err: unknown): string => {
  if (!(err instanceof Error)) {
    return "Could not fetch answer right now.";
  }

  const raw = err.message?.trim();
  if (!raw) {
    return "Could not fetch answer right now.";
  }

  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.detail === "string" && parsed.detail.trim()) {
      return parsed.detail;
    }
    if (typeof parsed?.message === "string" && parsed.message.trim()) {
      return parsed.message;
    }
  } catch {
    // Non-JSON message; use raw text below.
  }

  return raw.length > 220 ? "Could not fetch answer right now." : raw;
};

const getTimeValue = (value: string | null | undefined): number => {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

export default function StudentDashboardPage() {
  const [messages, setMessages] = useState<ChatMessageRow[]>([
    { role: "assistant", text: "Hi, I am your AI study coach. Ask anything from your course material." }
  ]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<ChatSessionRow[]>([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [loadingSession, setLoadingSession] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [completion, setCompletion] = useState(0);
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);

  const activeSessions = useMemo(
    () =>
      sessions
        .filter((session) => !session.is_archived)
        .sort((left, right) => {
          if (left.is_pinned !== right.is_pinned) {
            return left.is_pinned ? -1 : 1;
          }

          if (left.is_pinned && right.is_pinned) {
            const pinDelta = getTimeValue(right.pinned_at) - getTimeValue(left.pinned_at);
            if (pinDelta !== 0) {
              return pinDelta;
            }
          }

          return getTimeValue(right.updated_at) - getTimeValue(left.updated_at);
        }),
    [sessions],
  );

  const archivedSessions = useMemo(
    () =>
      sessions
        .filter((session) => session.is_archived)
        .sort((left, right) => {
          const archiveDelta = getTimeValue(right.archived_at) - getTimeValue(left.archived_at);
          if (archiveDelta !== 0) {
            return archiveDelta;
          }

          return getTimeValue(right.updated_at) - getTimeValue(left.updated_at);
        }),
    [sessions],
  );

  const newSessionId = useMemo(() => `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, []);

  const createNewChat = () => {
    setActiveSessionId(`session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    setMessages([{ role: "assistant", text: "Hi, I am your AI study coach. Ask anything from your course material." }]);
  };

  const refreshSessions = async () => {
    try {
      const response = await api.chatSessions();
      setSessions(response.data);
      return response.data;
    } catch {
      return [] as ChatSessionRow[];
    }
  };

  const loadSessionMessages = async (sessionId: string) => {
    setLoadingSession(true);
    try {
      const response = await api.chatSessionMessages(sessionId);
      if (!response.data.length) {
        setMessages([{ role: "assistant", text: "Hi, I am your AI study coach. Ask anything from your course material." }]);
      } else {
        setMessages(response.data.map((row) => ({ role: row.role, text: row.content })));
      }
      setActiveSessionId(sessionId);
    } catch {
      setMessages([{ role: "assistant", text: "Could not load this conversation." }]);
    } finally {
      setLoadingSession(false);
    }
  };

  const handleRenameSession = async (sessionId: string, newTitle: string) => {
    try {
      await api.renameSession(sessionId, newTitle);
      await refreshSessions();
    } catch {
      alert("Failed to rename chat");
    }
  };

  const handleTogglePinSession = async (sessionId: string) => {
    try {
      await api.togglePinSession(sessionId);
      await refreshSessions();
    } catch {
      alert("Failed to pin/unpin chat");
    }
  };

  const handleToggleArchiveSession = async (sessionId: string) => {
    try {
      await api.toggleArchiveSession(sessionId);
      const updated = await refreshSessions();
      if (activeSessionId === sessionId) {
        const nextActive = updated.find((session) => !session.is_archived);
        if (nextActive) {
          await loadSessionMessages(nextActive.session_id);
        } else {
          createNewChat();
        }
      }
    } catch {
      alert("Failed to archive chat");
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      await api.deleteSession(sessionId);
      const updated = await refreshSessions();
      if (activeSessionId === sessionId) {
        const nextActive = updated.find((session) => !session.is_archived);
        if (nextActive) {
          await loadSessionMessages(nextActive.session_id);
        } else {
          createNewChat();
        }
      }
    } catch {
      alert("Failed to delete chat");
    }
  };

  useEffect(() => {
    const initialize = async () => {
      try {
        const courseResponse = await api.courses();
        setCourses(courseResponse.data);
        if (courseResponse.data.length > 0) {
          setSelectedCourseId(courseResponse.data[0].id);
        }
      } catch {
        // Ignore bootstrap errors; they surface when user sends a message.
      }

      const loadedSessions = await refreshSessions();
      if (loadedSessions.length > 0) {
        const firstActive = loadedSessions.find((session) => !session.is_archived) || loadedSessions[0];
        await loadSessionMessages(firstActive.session_id);
      } else {
        setActiveSessionId(newSessionId);
      }

      api.leaderboard().then((response) => setLeaderboard(response.data)).catch(() => undefined);
      api.progress().then((response) => setCompletion(response.data.completion_percentage)).catch(() => undefined);
    };

    initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ask = async (event: FormEvent) => {
    event.preventDefault();
    if (!question.trim()) {
      return;
    }
    const current = question;
    setQuestion("");
    setMessages((prev) => [...prev, { role: "user", text: current }]);
    setLoading(true);
    try {
      if (!selectedCourseId) {
        setMessages((prev) => [...prev, { role: "assistant", text: "No course content is available yet. Please ask your teacher to upload material." }]);
        return;
      }

      const sessionId = activeSessionId || `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      if (!activeSessionId) {
        setActiveSessionId(sessionId);
      }

      const response = await api.ask({ course_id: selectedCourseId, question: current, session_id: sessionId });
      setMessages((prev) => [...prev, { role: "assistant", text: response.data.answer }]);
      await refreshSessions();
    } catch (err) {
      setMessages((prev) => [...prev, { role: "assistant", text: extractErrorMessage(err) }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="grid min-h-screen grid-cols-1 gap-4 p-4 md:grid-cols-[300px_1fr]">
      <aside className="glass h-full rounded-2xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-heading text-xl font-semibold">Chats</h2>
          <button
            onClick={createNewChat}
            className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-sm hover:bg-white/20"
          >
            <MessageSquarePlus className="h-4 w-4" /> New
          </button>
        </div>
        <div className="mb-4 max-h-[58vh] space-y-2 overflow-y-auto pr-1">
          {sessions.length === 0 && <p className="text-sm opacity-70">No previous chats</p>}
          {activeSessions.length > 0 && (
            <div className="space-y-2">
              {activeSessions.map((session) => {
                const active = session.session_id === activeSessionId;
                const displayTitle = session.custom_title || session.preview || "New conversation";
                return (
                  <div
                    key={session.session_id}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 transition ${
                      active
                        ? "border-teal-400/40 bg-teal-500/15 text-teal-700 dark:text-teal-200"
                        : "border-white/20 hover:bg-white/20"
                    }`}
                  >
                    <button onClick={() => loadSessionMessages(session.session_id)} className="flex min-w-0 flex-1 items-start gap-2 text-left">
                      {session.is_pinned && <Pin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />}
                      <div className="min-w-0 flex-1">
                        <div className="line-clamp-2 text-sm">{displayTitle}</div>
                        <div className="mt-1 text-xs opacity-60">{session.updated_at ? new Date(session.updated_at).toLocaleString() : ""}</div>
                      </div>
                    </button>
                    <ChatSessionMenu
                      sessionId={session.session_id}
                      customTitle={session.custom_title}
                      isPinned={session.is_pinned}
                      isArchived={session.is_archived}
                      onRename={handleRenameSession}
                      onTogglePin={handleTogglePinSession}
                      onToggleArchive={handleToggleArchiveSession}
                      onDelete={handleDeleteSession}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {archivedSessions.length > 0 && (
            <div className="pt-2">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide opacity-70">
                <Trash2 className="h-3.5 w-3.5" />
                Archive Bin
              </div>
              <div className="space-y-2">
                {archivedSessions.map((session) => {
                  const active = session.session_id === activeSessionId;
                  const displayTitle = session.custom_title || session.preview || "Archived conversation";
                  return (
                    <div
                      key={session.session_id}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 transition ${
                        active
                          ? "border-rose-400/40 bg-rose-500/15 text-rose-700 dark:text-rose-200"
                          : "border-white/20 hover:bg-white/20"
                      }`}
                    >
                      <button onClick={() => loadSessionMessages(session.session_id)} className="flex min-w-0 flex-1 items-start gap-2 text-left">
                        <Trash2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
                        <div className="min-w-0 flex-1">
                          <div className="line-clamp-2 text-sm">{displayTitle}</div>
                          <div className="mt-1 text-xs opacity-60">{session.updated_at ? new Date(session.updated_at).toLocaleString() : ""}</div>
                        </div>
                      </button>
                      <ChatSessionMenu
                        sessionId={session.session_id}
                        customTitle={session.custom_title}
                        isPinned={session.is_pinned}
                        isArchived={session.is_archived}
                        onRename={handleRenameSession}
                        onTogglePin={handleTogglePinSession}
                        onToggleArchive={handleToggleArchiveSession}
                        onDelete={handleDeleteSession}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <button
          onClick={() => {
            authStorage.clearAuth();
            window.location.href = "/login";
          }}
          className="w-full rounded-lg border border-white/20 px-3 py-2 text-left hover:bg-white/20"
        >
          Logout
        </button>
      </aside>
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="font-heading text-3xl font-bold">Student Learning Studio</h1>
          <ThemeToggle />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <GlassCard className="p-5">
            <h2 className="font-heading text-xl">AI Tutor</h2>
            <p className="mt-1 text-sm opacity-70">RAG-powered, context-aware support with study-plan suggestions.</p>
            <div className="mt-4">
              <ChatWindow messages={messages} />
              {loadingSession && <p className="mt-2 text-xs opacity-70">Loading conversation...</p>}
              <form onSubmit={ask} className="mt-3 flex gap-2">
                <input className="w-full rounded-xl border border-white/20 bg-white/30 px-4 py-3" placeholder="Ask your question..." value={question} onChange={(e) => setQuestion(e.target.value)} />
                <button className="rounded-xl bg-teal-500 px-5 py-3 font-semibold text-white">{loading ? "..." : "Send"}</button>
              </form>
            </div>
          </GlassCard>

          <div className="space-y-4">
            <GlassCard className="p-5">
              <h2 className="font-heading text-xl">Progress</h2>
              <div className="mt-4 h-3 rounded-full bg-white/20">
                <div className="h-3 rounded-full bg-gradient-to-r from-teal-400 to-orange-400" style={{ width: `${completion}%` }} />
              </div>
              <p className="mt-2 text-sm">Completion: {completion}%</p>
            </GlassCard>

            <GlassCard className="p-5">
              <h2 className="font-heading text-xl">Leaderboard</h2>
              <div className="mt-3 space-y-2">
                {leaderboard.slice(0, 5).map((row, index) => (
                  <div key={row.name + index} className="flex items-center justify-between rounded-lg border border-white/20 px-3 py-2">
                    <span>{index + 1}. {row.name}</span>
                    <span className="font-semibold text-teal-600 dark:text-teal-300">{row.rank_score}</span>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>
        </div>
      </section>
    </main>
  );
}
