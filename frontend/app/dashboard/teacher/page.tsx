"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Archive, MessageSquarePlus, Pin, Trash2 } from "lucide-react";

import { ChatWindow } from "@/components/chat-window";
import { GlassCard } from "@/components/glass-card";
import { Sidebar } from "@/components/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { ChatSessionMenu } from "@/components/chat-session-menu";
import { authStorage } from "@/lib/auth";


const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api/v1";


type Course = {
  id: number;
  title: string;
  course_code: string;
  description: string;
};

type CourseFile = {
  id: number;
  file_name: string;
  content_type: string;
  uploaded_at: string;
};

type TeacherSessionRow = {
  session_id: string;
  preview: string;
  updated_at: string | null;
  custom_title: string | null;
  is_pinned: boolean;
  is_archived: boolean;
  pinned_at: string | null;
  archived_at: string | null;
};

const TEACHER_WELCOME = "Hi! I am your Teacher AI assistant. Ask me lesson planning, quiz, rubric, and pedagogy questions.";

const getTimeValue = (value: string | null | undefined): number => {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};


export default function TeacherDashboardPage() {
  const [courseTitle, setCourseTitle] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [courseDescription, setCourseDescription] = useState("");
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseCode, setSelectedCourseCode] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [agentQuery, setAgentQuery] = useState("");
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentChatMode, setAgentChatMode] = useState<"fast" | "quality">("fast");
  const [agentMessages, setAgentMessages] = useState<Array<{ role: "user" | "assistant"; text: string }>>([
    { role: "assistant", text: TEACHER_WELCOME }
  ]);
  const [teacherSessions, setTeacherSessions] = useState<TeacherSessionRow[]>([]);
  const [agentSessionId, setAgentSessionId] = useState("");
  const [agentSessionLoading, setAgentSessionLoading] = useState(false);
  const [courseMessage, setCourseMessage] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const [agentMessage, setAgentMessage] = useState("");
  const [expandedCourseCode, setExpandedCourseCode] = useState("");
  const [courseFilesByCode, setCourseFilesByCode] = useState<Record<string, CourseFile[]>>({});
  const [filesLoadingCode, setFilesLoadingCode] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeTeacherSessions = teacherSessions
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
    });

  const archivedTeacherSessions = teacherSessions
    .filter((session) => session.is_archived)
    .sort((left, right) => {
      const archiveDelta = getTimeValue(right.archived_at) - getTimeValue(left.archived_at);
      if (archiveDelta !== 0) {
        return archiveDelta;
      }

      return getTimeValue(right.updated_at) - getTimeValue(left.updated_at);
    });

  const refreshTeacherSessions = async () => {
    try {
      const response = await fetch(`${API_BASE}/agents/teacher-assistant/sessions`, {
        headers: getAuthHeaders(true)
      });
      const data = await response.json();
      if (response.ok && Array.isArray(data?.data)) {
        setTeacherSessions(data.data);
        return data.data as TeacherSessionRow[];
      }
    } catch {
      // ignore sidebar refresh failure
    }
    return [] as TeacherSessionRow[];
  };

  const loadTeacherSessionMessages = async (sessionId: string) => {
    try {
      setAgentSessionLoading(true);
      const response = await fetch(`${API_BASE}/agents/teacher-assistant/sessions/${sessionId}`, {
        headers: getAuthHeaders(true)
      });
      const data = await response.json();
      if (!response.ok) {
        setAgentMessage(data?.detail || data?.message || "Could not load chat.");
        return;
      }
      const mapped = Array.isArray(data?.data)
        ? data.data.map((row: { role: "user" | "assistant"; content: string }) => ({ role: row.role, text: row.content }))
        : [];
      setAgentMessages(mapped.length ? mapped : [{ role: "assistant", text: TEACHER_WELCOME }]);
      setAgentSessionId(sessionId);
    } catch {
      setAgentMessage("Could not load chat history.");
    } finally {
      setAgentSessionLoading(false);
    }
  };

  const startNewTeacherChat = () => {
    setAgentMessage("");
    setAgentSessionId(`teacher-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    setAgentMessages([{ role: "assistant", text: TEACHER_WELCOME }]);
  };

  const deleteTeacherSession = async (sessionId: string) => {
    try {
      const response = await fetch(`${API_BASE}/agents/teacher-assistant/sessions/${sessionId}`, {
        method: "DELETE",
        headers: getAuthHeaders(true)
      });
      const data = await response.json();
      if (!response.ok) {
        setAgentMessage(data?.detail || data?.message || "Could not delete chat.");
        return;
      }

      const updated = await refreshTeacherSessions();
      if (agentSessionId === sessionId) {
        const nextActive = updated.find((session) => !session.is_archived);
        if (nextActive) {
          await loadTeacherSessionMessages(nextActive.session_id);
        } else {
          startNewTeacherChat();
        }
      }
    } catch {
      setAgentMessage("Could not connect to delete chat.");
    }
  };

  const handleRenameTeacherSession = async (sessionId: string, newTitle: string) => {
    try {
      const response = await fetch(`${API_BASE}/agents/teacher-assistant/sessions/${sessionId}/rename`, {
        method: "POST",
        headers: getAuthHeaders(true),
        body: JSON.stringify({ custom_title: newTitle })
      });
      if (!response.ok) {
        setAgentMessage("Failed to rename chat");
        return;
      }
      await refreshTeacherSessions();
    } catch {
      setAgentMessage("Failed to rename chat");
    }
  };

  const handleTogglePinTeacherSession = async (sessionId: string) => {
    try {
      const response = await fetch(`${API_BASE}/agents/teacher-assistant/sessions/${sessionId}/pin`, {
        method: "POST",
        headers: getAuthHeaders(true),
        body: JSON.stringify({})
      });
      if (!response.ok) {
        setAgentMessage("Failed to pin/unpin chat");
        return;
      }
      await refreshTeacherSessions();
    } catch {
      setAgentMessage("Failed to pin/unpin chat");
    }
  };

  const handleToggleArchiveTeacherSession = async (sessionId: string) => {
    try {
      const response = await fetch(`${API_BASE}/agents/teacher-assistant/sessions/${sessionId}/archive`, {
        method: "POST",
        headers: getAuthHeaders(true),
        body: JSON.stringify({})
      });
      if (!response.ok) {
        setAgentMessage("Failed to archive chat");
        return;
      }
      
      const updated = await refreshTeacherSessions();
      if (agentSessionId === sessionId) {
        const nextActive = updated.find((session) => !session.is_archived);
        if (nextActive) {
          await loadTeacherSessionMessages(nextActive.session_id);
        } else {
          startNewTeacherChat();
        }
      }
    } catch {
      setAgentMessage("Failed to archive chat");
    }
  };

  const getAuthHeaders = (json = true): HeadersInit => {
    const token = authStorage.getToken();
    return {
      ...(json ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
  };

  const loadCourses = async () => {
    try {
      const response = await fetch(`${API_BASE}/teacher/courses`, {
        headers: getAuthHeaders(true)
      });
      const data = await response.json();
      if (response.ok && Array.isArray(data?.data)) {
        setCourses(data.data);
        if (!selectedCourseCode && data.data.length > 0) {
          setSelectedCourseCode(data.data[0].course_code);
        }
      }
    } catch {
      // keep UI usable even if loading saved courses fails
    }
  };

  useEffect(() => {
    const initialize = async () => {
      await loadCourses();
      const sessions = await refreshTeacherSessions();
      if (sessions.length > 0) {
        const firstActive = sessions.find((session) => !session.is_archived) || sessions[0];
        await loadTeacherSessionMessages(firstActive.session_id);
      } else {
        startNewTeacherChat();
      }
    };

    initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createCourse = async (event: FormEvent) => {
    event.preventDefault();
    setCourseMessage("");

    if (!courseTitle.trim() || !courseCode.trim()) {
      setCourseMessage("Please enter a course title and course code.");
      return;
    }

    if (!/^[A-Za-z0-9]+$/.test(courseCode)) {
      setCourseMessage("Course code must contain only letters and numbers, like CS111.");
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/teacher/courses`, {
        method: "POST",
        headers: getAuthHeaders(true),
        body: JSON.stringify({ title: courseTitle, course_code: courseCode, description: courseDescription })
      });

      const data = await response.json();
      if (!response.ok) {
        setCourseMessage(data?.detail || data?.message || "Course creation failed.");
        return;
      }

      if (data?.data?.course_id) {
        setCourseTitle("");
        setCourseCode("");
        setCourseDescription("");
        setCourseMessage("course is created");
        await loadCourses();
        setSelectedCourseCode(data?.data?.course_code || "");
        return;
      }

      setCourseMessage("Course created, but no course ID returned.");
    } catch {
      setCourseMessage("Could not connect to backend. Check if API is running.");
    }
  };

  const uploadMaterial = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setUploadMessage("");

    if (!selectedCourseCode) {
      setUploadMessage("Please select a course code first.");
      return;
    }

    const file = fileInputRef.current?.files?.[0] ?? null;
    if (!file) {
      setUploadMessage("Please choose a file to upload.");
      return;
    }

    const formData = new FormData();
    formData.append("course_code", selectedCourseCode);
    formData.append("file", file);

    try {
      setUploading(true);
      setProgress(20);
      const response = await fetch(`${API_BASE}/teacher/upload-material`, {
        method: "POST",
        headers: getAuthHeaders(false),
        body: formData
      });

      const data = await response.json();
      if (!response.ok) {
        setProgress(0);
        setUploadMessage(data?.detail || data?.message || "Upload failed.");
        return;
      }

      setProgress(100);
      setUploadMessage(data?.message || `file had successfully uploaded in the ${selectedCourseCode}`);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setProgress(0);
    } catch {
      setProgress(0);
      setUploadMessage("Could not upload file. Check backend and try again.");
    } finally {
      setUploading(false);
    }
  };

  const askTeacherAgent = async () => {
    setAgentMessage("");
    if (!agentQuery.trim()) {
      setAgentMessage("Please enter your question for the teacher agent.");
      return;
    }

    const currentQuestion = agentQuery.trim();
    setAgentQuery("");
    setAgentMessages((prev) => [...prev, { role: "user", text: currentQuestion }]);
    setAgentLoading(true);

    try {
      const activeSessionId = agentSessionId || `teacher-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      if (!agentSessionId) {
        setAgentSessionId(activeSessionId);
      }

      const response = await fetch(`${API_BASE}/agents/teacher-assistant-chat`, {
        method: "POST",
        headers: getAuthHeaders(true),
        body: JSON.stringify({ query: currentQuestion, session_id: activeSessionId, course_code: selectedCourseCode || undefined, chat_mode: agentChatMode })
      });
      // Some backend failures can return plain text/HTML in debug mode.
      // Parse defensively so we can surface a useful message to users.
      const raw = await response.text();
      let data: any = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        data = null;
      }

      if (!response.ok) {
        const backendMessage =
          data?.detail ||
          data?.message ||
          (raw && raw.length < 300 ? raw : "Agent request failed.");
        setAgentMessage(backendMessage);
        setAgentMessages((prev) => [...prev, { role: "assistant", text: "I could not answer right now. Please try again." }]);
        return;
      }

      setAgentMessages((prev) => [...prev, { role: "assistant", text: data?.data?.answer || "No response" }]);
      await refreshTeacherSessions();
    } catch {
      setAgentMessage("Could not connect to agent endpoint.");
      setAgentMessages((prev) => [...prev, { role: "assistant", text: "I could not reach the backend right now." }]);
    } finally {
      setAgentLoading(false);
    }
  };

  const deleteCourse = async (courseCodeToDelete: string) => {
    setCourseMessage("");
    setUploadMessage("");

    try {
      const response = await fetch(`${API_BASE}/teacher/courses/${courseCodeToDelete}`, {
        method: "DELETE",
        headers: getAuthHeaders(true)
      });
      const data = await response.json();

      if (!response.ok) {
        setCourseMessage(data?.detail || data?.message || "Could not delete course.");
        return;
      }

      setCourseMessage(data?.message || "Course deleted permanently");
      if (selectedCourseCode === courseCodeToDelete) {
        setSelectedCourseCode("");
      }
      await loadCourses();
    } catch {
      setCourseMessage("Could not connect to backend. Check if API is running.");
    }
  };

  const toggleCourseFiles = async (courseCodeToView: string) => {
    if (expandedCourseCode === courseCodeToView) {
      setExpandedCourseCode("");
      return;
    }

    setExpandedCourseCode(courseCodeToView);
    if (courseFilesByCode[courseCodeToView]) {
      return;
    }

    try {
      setFilesLoadingCode(courseCodeToView);
      const response = await fetch(`${API_BASE}/teacher/courses/${courseCodeToView}/materials`, {
        headers: getAuthHeaders(true)
      });
      const data = await response.json();
      if (!response.ok) {
        setCourseMessage(data?.detail || data?.message || "Could not fetch uploaded files.");
        return;
      }
      setCourseFilesByCode((prev) => ({ ...prev, [courseCodeToView]: Array.isArray(data?.data) ? data.data : [] }));
    } catch {
      setCourseMessage("Could not connect to backend to fetch uploaded files.");
    } finally {
      setFilesLoadingCode("");
    }
  };

  return (
    <main className="grid min-h-screen grid-cols-1 gap-4 p-4 md:grid-cols-[260px_1fr]">
      <Sidebar role="teacher" />
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="font-heading text-3xl font-bold">Teacher Command Center</h1>
          <ThemeToggle />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <GlassCard className="p-5">
            <h2 className="font-heading text-xl">Create Course</h2>
            <form onSubmit={createCourse} className="mt-4 space-y-3">
              <input className="w-full rounded-lg border border-white/20 bg-white/30 p-3" placeholder="Course title" value={courseTitle} onChange={(e) => setCourseTitle(e.target.value)} />
              <input className="w-full rounded-lg border border-white/20 bg-white/30 p-3 uppercase" placeholder="Course code e.g. CS111" value={courseCode} onChange={(e) => setCourseCode(e.target.value.toUpperCase())} />
              <textarea className="w-full rounded-lg border border-white/20 bg-white/30 p-3" placeholder="Description" value={courseDescription} onChange={(e) => setCourseDescription(e.target.value)} />
              <button className="rounded-lg bg-teal-500 px-4 py-2 text-white">Create</button>
              {courseMessage && <p className="text-sm opacity-85">{courseMessage}</p>}
            </form>
          </GlassCard>

          <GlassCard className="p-5">
            <h2 className="font-heading text-xl">Upload Materials</h2>
            <form onSubmit={uploadMaterial} className="mt-4 space-y-3">
              <select className="w-full rounded-lg border border-white/20 bg-white/30 p-3" value={selectedCourseCode} onChange={(e) => setSelectedCourseCode(e.target.value)}>
                <option value="">Select course code</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.course_code}>
                    {course.course_code} - {course.title}
                  </option>
                ))}
              </select>
              <input ref={fileInputRef} className="w-full rounded-lg border border-white/20 bg-white/30 p-3" name="material" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.txt" />
              <button disabled={uploading || !selectedCourseCode} className="rounded-lg bg-orange-500 px-4 py-2 text-white disabled:opacity-60">
                {uploading ? "Uploading..." : "Upload"}
              </button>
              <div className="h-2 rounded-full bg-white/20">
                <div className="h-2 rounded-full bg-teal-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
              {uploadMessage && <p className="text-sm opacity-85">{uploadMessage}</p>}
            </form>
            <div className="mt-4 space-y-2">
              <p className="text-sm font-semibold opacity-80">Saved Courses</p>
              {courses.length === 0 ? (
                <p className="text-sm opacity-70">No saved courses yet.</p>
              ) : (
                courses.map((course) => (
                  <div key={course.id} className="flex items-start justify-between gap-3 rounded-lg border border-white/20 px-3 py-2 text-sm">
                    <div>
                      <div className="font-semibold">{course.course_code}</div>
                      <div className="opacity-80">{course.title}</div>
                      {expandedCourseCode === course.course_code && (
                        <div className="mt-2 rounded-md border border-white/20 bg-white/10 p-2">
                          {filesLoadingCode === course.course_code ? (
                            <p className="text-xs opacity-80">Loading files...</p>
                          ) : (courseFilesByCode[course.course_code] || []).length === 0 ? (
                            <p className="text-xs opacity-80">No uploaded files for this course yet.</p>
                          ) : (
                            <ul className="space-y-1 text-xs opacity-90">
                              {(courseFilesByCode[course.course_code] || []).map((file) => (
                                <li key={file.id} className="truncate">
                                  {file.file_name}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => toggleCourseFiles(course.course_code)}
                        className="rounded-md bg-sky-500/90 px-3 py-1 text-xs font-semibold text-white hover:bg-sky-500"
                      >
                        {expandedCourseCode === course.course_code ? "Hide Files" : "View Files"}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteCourse(course.course_code)}
                        className="rounded-md bg-rose-500/90 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-500"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </GlassCard>
        </div>

        <GlassCard className="p-5">
          <h2 className="font-heading text-xl">Teacher AI Chatbot</h2>
          <p className="mt-1 text-sm opacity-75">Direct LLM chat powered by Ollama. No file upload required.</p>
          <div className="mt-3 flex items-center gap-2 text-sm">
            <span className="opacity-80">Mode:</span>
            <select
              className="rounded-md border border-white/20 bg-white/20 px-2 py-1"
              value={agentChatMode}
              onChange={(e) => setAgentChatMode(e.target.value as "fast" | "quality")}
            >
              <option value="quality">High Quality (llama3)</option>
              <option value="fast">Ultra Fast (phi3:mini)</option>
            </select>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-[260px_1fr]">
            <div className="rounded-xl border border-white/20 bg-white/10 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold opacity-90">Chats</p>
                <button
                  type="button"
                  onClick={startNewTeacherChat}
                  className="inline-flex items-center gap-1 rounded-md border border-white/20 px-2 py-1 text-xs hover:bg-white/20"
                >
                  <MessageSquarePlus className="h-3.5 w-3.5" /> New
                </button>
              </div>
              <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {teacherSessions.length === 0 ? (
                  <p className="text-xs opacity-70">No previous chats</p>
                ) : (
                  <>
                    {activeTeacherSessions.length > 0 && (
                      <div className="space-y-2">
                        {activeTeacherSessions.map((session) => {
                          const active = session.session_id === agentSessionId;
                          const displayTitle = session.custom_title || session.preview || "New conversation";
                          return (
                            <div
                              key={session.session_id}
                              className={`group flex items-center gap-1 rounded-md border px-2 py-1.5 ${
                                active ? "border-teal-400/40 bg-teal-500/15" : "border-white/20"
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => loadTeacherSessionMessages(session.session_id)}
                                className="flex min-w-0 flex-1 items-start gap-1.5 text-left text-xs"
                              >
                                {session.is_pinned && <Pin className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" />}
                                <div className="min-w-0 flex-1">
                                  <div className="line-clamp-2">{displayTitle}</div>
                                </div>
                              </button>
                              <ChatSessionMenu
                                sessionId={session.session_id}
                                customTitle={session.custom_title}
                                isPinned={session.is_pinned}
                                isArchived={session.is_archived}
                                onRename={handleRenameTeacherSession}
                                onTogglePin={handleTogglePinTeacherSession}
                                onToggleArchive={handleToggleArchiveTeacherSession}
                                onDelete={deleteTeacherSession}
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {archivedTeacherSessions.length > 0 && (
                      <div className="pt-2">
                        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide opacity-70">
                          <Trash2 className="h-3.5 w-3.5" />
                          Archive Bin
                        </div>
                        <div className="space-y-2">
                          {archivedTeacherSessions.map((session) => {
                            const active = session.session_id === agentSessionId;
                            const displayTitle = session.custom_title || session.preview || "Archived conversation";
                            return (
                              <div
                                key={session.session_id}
                                className={`group flex items-center gap-1 rounded-md border px-2 py-1.5 ${
                                  active ? "border-rose-400/40 bg-rose-500/15" : "border-white/20"
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => loadTeacherSessionMessages(session.session_id)}
                                  className="flex min-w-0 flex-1 items-start gap-1.5 text-left text-xs"
                                >
                                  <Trash2 className="mt-0.5 h-3 w-3 shrink-0 text-rose-400" />
                                  <div className="min-w-0 flex-1">
                                    <div className="line-clamp-2">{displayTitle}</div>
                                  </div>
                                </button>
                                <ChatSessionMenu
                                  sessionId={session.session_id}
                                  customTitle={session.custom_title}
                                  isPinned={session.is_pinned}
                                  isArchived={session.is_archived}
                                  onRename={handleRenameTeacherSession}
                                  onTogglePin={handleTogglePinTeacherSession}
                                  onToggleArchive={handleToggleArchiveTeacherSession}
                                  onDelete={deleteTeacherSession}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
            <div>
              <ChatWindow messages={agentMessages} />
              {agentSessionLoading && <p className="mt-2 text-xs opacity-70">Loading chat...</p>}
              <form
                className="mt-3 flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void askTeacherAgent();
                }}
              >
                <input
                  className="w-full rounded-xl border border-white/20 bg-white/30 px-4 py-3"
                  placeholder="Ask about lesson plans, activities, rubrics, quizzes..."
                  value={agentQuery}
                  onChange={(e) => setAgentQuery(e.target.value)}
                />
                <button disabled={agentLoading} className="rounded-xl bg-teal-500 px-5 py-3 font-semibold text-white disabled:opacity-60">
                  {agentLoading ? "Thinking..." : "Send"}
                </button>
              </form>
            </div>
          </div>
          {agentMessage && <p className="mt-3 text-sm opacity-85">{agentMessage}</p>}
        </GlassCard>
      </section>
    </main>
  );
}
