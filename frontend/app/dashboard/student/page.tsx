"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Archive, BookOpen, ClipboardList, EllipsisVertical, MessageSquarePlus, Paperclip, Pencil, Pin, Send, Trash2, Upload, Users, X } from "lucide-react";
import { addWeeks, eachDayOfInterval, endOfWeek, format, startOfWeek } from "date-fns";

import { CalendarGrid } from "@/components/calendar/CalendarGrid";
import { CalendarHeader } from "@/components/calendar/CalendarHeader";
import { EventModal } from "@/components/calendar/EventModal";
import { CalendarEvent } from "@/components/calendar/types";
import { ChatWindow } from "@/components/chat-window";
import { GlassCard } from "@/components/glass-card";
import { StudentPeoplePage } from "@/components/people/StudentPeoplePage";
import { Sidebar } from "@/components/sidebar";
import { ClassworkPage } from "@/components/student-classwork/ClassworkPage";
import { StudentLeaderboardPage } from "@/components/grades/StudentLeaderboardPage";
import { ThemeToggle } from "@/components/theme-toggle";
import { ChatSessionMenu } from "@/components/chat-session-menu";
import { api } from "@/lib/api";
import { authStorage } from "@/lib/auth";
import { SettingsPage } from "@/components/settings/SettingsPage";


const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "/api/v1";


type CourseRow = {
  id: number;
  title: string;
  course_code: string;
  class_code?: string;
  section?: string;
  description: string;
  is_archived?: boolean;
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

type StreamComment = {
  id: number;
  content: string;
  created_at: string;
  author: {
    id: number;
    name: string;
    role: string;
  };
};

type StreamPost = {
  id: number;
  course_id: number;
  message: string;
  created_at: string;
  author: {
    id: number;
    name: string;
    role: string;
  };
  attachment?: {
    file_name?: string | null;
    content_type?: string | null;
    download_url?: string | null;
  };
  audience_student_ids: number[];
  comments: StreamComment[];
};

type CourseMaterialRow = {
  id: number;
  file_name: string;
  content_type: string | null;
  uploaded_at: string;
};

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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [activeStudentMenuItem, setActiveStudentMenuItem] = useState("home");
  const [activeClassroomTab, setActiveClassroomTab] = useState<"stream" | "classwork" | "people" | "leaderboard">("stream");
  const [messages, setMessages] = useState<ChatMessageRow[]>([
    { role: "assistant", text: "Hi, I am your AI study coach. Ask me anything." }
  ]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<ChatSessionRow[]>([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [loadingSession, setLoadingSession] = useState(false);
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [joinClassCode, setJoinClassCode] = useState("");
  const [joinMessage, setJoinMessage] = useState("");
  const [joiningClass, setJoiningClass] = useState(false);
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => startOfWeek(new Date(), { weekStartsOn: 0 }));
  const [selectedCalendarCourseId, setSelectedCalendarCourseId] = useState<number | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState("");
  const [selectedCalendarEvent, setSelectedCalendarEvent] = useState<CalendarEvent | null>(null);
  const [isAnnouncementModalOpen, setIsAnnouncementModalOpen] = useState(false);
  const [announcementText, setAnnouncementText] = useState("");
  const [selectedAnnouncementFile, setSelectedAnnouncementFile] = useState<File | null>(null);
  const [announcementUploadFileName, setAnnouncementUploadFileName] = useState("");
  const [postingAnnouncement, setPostingAnnouncement] = useState(false);
  const [streamPosts, setStreamPosts] = useState<StreamPost[]>([]);
  const [streamLoading, setStreamLoading] = useState(false);
  const [classroomMessage, setClassroomMessage] = useState("");
  const [classMaterials, setClassMaterials] = useState<CourseMaterialRow[]>([]);
  const [commentDrafts, setCommentDrafts] = useState<Record<number, string>>({});
  const [postingCommentFor, setPostingCommentFor] = useState<number | null>(null);
  const [isCourseActionsMenuOpen, setIsCourseActionsMenuOpen] = useState(false);
  const [studentArchiveMessage, setStudentArchiveMessage] = useState("");
  const [studentArchiving, setStudentArchiving] = useState(false);
  const [restoringCourseId, setRestoringCourseId] = useState<number | null>(null);
  const [isAttachmentPreviewOpen, setIsAttachmentPreviewOpen] = useState(false);
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState("");
  const [attachmentPreviewName, setAttachmentPreviewName] = useState("");
  const [attachmentPreviewType, setAttachmentPreviewType] = useState("");

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
  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId && !course.is_archived) || null,
    [courses, selectedCourseId],
  );
  const activeCourses = useMemo(
    () => courses.filter((course) => !course.is_archived),
    [courses],
  );
  const archivedCourses = useMemo(
    () => courses.filter((course) => course.is_archived),
    [courses],
  );
  const currentWeekEnd = useMemo(
    () => endOfWeek(currentWeekStart, { weekStartsOn: 0 }),
    [currentWeekStart],
  );
  const weekDays = useMemo(
    () => eachDayOfInterval({ start: currentWeekStart, end: currentWeekEnd }),
    [currentWeekStart, currentWeekEnd],
  );
  const eventsByDate = useMemo(() => {
    return calendarEvents.reduce<Record<string, CalendarEvent[]>>((acc, event) => {
      if (!acc[event.due_date]) {
        acc[event.due_date] = [];
      }
      acc[event.due_date].push(event);
      return acc;
    }, {});
  }, [calendarEvents]);

  const createNewChat = () => {
    setActiveSessionId(`session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    setMessages([{ role: "assistant", text: "Hi, I am your AI study coach. Ask me anything." }]);
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
        setMessages([{ role: "assistant", text: "Hi, I am your AI study coach. Ask me anything." }]);
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
        const courseResponse = await api.enrolledCourses();
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

    };

    initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeStudentMenuItem !== "enrolled" || !selectedCourse) {
      return;
    }

    void loadClassroomData(selectedCourse.course_code);
  }, [activeStudentMenuItem, activeClassroomTab, selectedCourse]);

  useEffect(() => {
    if (activeStudentMenuItem !== "calendar") {
      return;
    }

    void loadCalendarEvents();
  }, [activeStudentMenuItem, currentWeekStart, currentWeekEnd, selectedCalendarCourseId]);

  useEffect(
    () => () => {
      if (attachmentPreviewUrl) {
        window.URL.revokeObjectURL(attachmentPreviewUrl);
      }
    },
    [attachmentPreviewUrl],
  );

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

  const refreshEnrolledCourses = async () => {
    try {
      const response = await api.enrolledCourses();
      setCourses(response.data);
      if (response.data.length > 0) {
        const activeRows = response.data.filter((course) => !course.is_archived);
        const stillSelected = selectedCourseId ? activeRows.some((course) => course.id === selectedCourseId) : false;
        if (!stillSelected) {
          setSelectedCourseId(activeRows[0]?.id ?? null);
        }
      } else {
        setSelectedCourseId(null);
      }
      return response.data;
    } catch {
      return [] as CourseRow[];
    }
  };

  const loadCalendarEvents = async () => {
    try {
      setCalendarLoading(true);
      setCalendarError("");
      const response = await api.calendarEvents(
        format(currentWeekStart, "yyyy-MM-dd"),
        format(currentWeekEnd, "yyyy-MM-dd"),
        selectedCalendarCourseId,
      );
      setCalendarEvents(response.data);
    } catch (err) {
      setCalendarEvents([]);
      setCalendarError(extractErrorMessage(err));
    } finally {
      setCalendarLoading(false);
    }
  };

  const archiveCurrentCourse = async () => {
    if (!selectedCourse) {
      return;
    }

    try {
      setStudentArchiving(true);
      setStudentArchiveMessage("");
      const response = await api.archiveStudentCourse(selectedCourse.course_code);
      setStudentArchiveMessage(response.message || "Class archived.");
      setIsCourseActionsMenuOpen(false);
      const enrolled = await refreshEnrolledCourses();
      const nextActive = enrolled.find((course) => !course.is_archived);
      setSelectedCourseId(nextActive?.id ?? null);
      setActiveStudentMenuItem("archived");
    } catch (err) {
      setStudentArchiveMessage(extractErrorMessage(err));
    } finally {
      setStudentArchiving(false);
    }
  };

  const restoreArchivedCourse = async (course: CourseRow) => {
    try {
      setRestoringCourseId(course.id);
      setStudentArchiveMessage("");
      const response = await api.restoreStudentCourse(course.course_code);
      setStudentArchiveMessage(response.message || "Class restored.");
      await refreshEnrolledCourses();
      setSelectedCourseId(course.id);
      setActiveStudentMenuItem("enrolled");
      setActiveClassroomTab("stream");
    } catch (err) {
      setStudentArchiveMessage(extractErrorMessage(err));
    } finally {
      setRestoringCourseId(null);
    }
  };

  const loadClassroomData = async (courseCode: string) => {
    setStreamLoading(true);
    setClassroomMessage("");
    setStreamPosts([]);
    setClassMaterials([]);
    try {
      const [announcements, materials] = await Promise.all([
        api.studentCourseAnnouncements(courseCode),
        api.studentCourseMaterials(courseCode),
      ]);
      setStreamPosts(announcements.data);
      setClassMaterials(materials.data);
    } catch (err) {
      setStreamPosts([]);
      setClassMaterials([]);
      setClassroomMessage(extractErrorMessage(err));
    } finally {
      setStreamLoading(false);
    }
  };

  const openAttachmentPreview = async (post: StreamPost) => {
    const downloadUrl = post.attachment?.download_url;
    if (!downloadUrl) {
      return;
    }

    try {
      const token = await authStorage.getToken();
      const resolvedUrl = downloadUrl.startsWith("http") ? downloadUrl : new URL(downloadUrl, window.location.origin).toString();
      const response = await fetch(resolvedUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        setClassroomMessage("Could not open attachment.");
        return;
      }

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      if (attachmentPreviewUrl) {
        window.URL.revokeObjectURL(attachmentPreviewUrl);
      }
      setAttachmentPreviewUrl(blobUrl);
      setAttachmentPreviewName(post.attachment?.file_name || "attachment");
      setAttachmentPreviewType(blob.type || post.attachment?.content_type || "");
      setIsAttachmentPreviewOpen(true);
    } catch {
      setClassroomMessage("Could not open attachment.");
    }
  };

  const closeAttachmentPreview = () => {
    setIsAttachmentPreviewOpen(false);
    if (attachmentPreviewUrl) {
      window.URL.revokeObjectURL(attachmentPreviewUrl);
    }
    setAttachmentPreviewUrl("");
    setAttachmentPreviewName("");
    setAttachmentPreviewType("");
  };

  const resetAnnouncementComposer = () => {
    setIsAnnouncementModalOpen(false);
    setAnnouncementText("");
    setSelectedAnnouncementFile(null);
    setAnnouncementUploadFileName("");
  };

  const postComment = async (announcementId: number) => {
    if (!selectedCourse) {
      return;
    }

    const content = (commentDrafts[announcementId] || "").trim();
    if (!content) {
      return;
    }

    try {
      setPostingCommentFor(announcementId);
      const response = await api.studentCourseComment(selectedCourse.course_code, announcementId, content);
      setStreamPosts((prev) =>
        prev.map((post) => (post.id === announcementId ? { ...post, comments: [...post.comments, response.data] } : post)),
      );
      setCommentDrafts((prev) => ({ ...prev, [announcementId]: "" }));
    } catch (err) {
      setClassroomMessage(extractErrorMessage(err));
    } finally {
      setPostingCommentFor(null);
    }
  };

  const postAnnouncement = async () => {
    if (!selectedCourse) {
      return;
    }

    const cleanedMessage = announcementText.trim();
    if (!cleanedMessage && !selectedAnnouncementFile) {
      setClassroomMessage("Add a message or attachment before posting.");
      return;
    }

    try {
      setPostingAnnouncement(true);
      setClassroomMessage("");

      const token = await authStorage.getToken();
      const formData = new FormData();
      formData.append("message", cleanedMessage);
      if (selectedAnnouncementFile) {
        formData.append("file", selectedAnnouncementFile);
      }

      const response = await fetch(`${API_BASE}/student/courses/${selectedCourse.course_code}/announcements`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        setClassroomMessage(data?.detail || data?.message || "Could not post announcement.");
        return;
      }

      resetAnnouncementComposer();
      await loadClassroomData(selectedCourse.course_code);
    } catch {
      setClassroomMessage("Could not post announcement.");
    } finally {
      setPostingAnnouncement(false);
    }
  };

  const joinClass = async () => {
    const classCode = joinClassCode.trim();
    if (!classCode) {
      setJoinMessage("Please enter a class code.");
      return;
    }

    try {
      setJoiningClass(true);
      setJoinMessage("");
      const response = await api.joinCourse(classCode);
      setJoinMessage(response.message || "Joined class successfully.");
      setJoinClassCode("");
      const enrolled = await refreshEnrolledCourses();
      if (response.data?.course_id) {
        setSelectedCourseId(response.data.course_id);
      } else if (enrolled.length > 0) {
        const nextActive = enrolled.find((course) => !course.is_archived);
        setSelectedCourseId(nextActive?.id ?? null);
      }
      setActiveStudentMenuItem("enrolled");
      setActiveClassroomTab("stream");
    } catch (err) {
      setJoinMessage(extractErrorMessage(err));
    } finally {
      setJoiningClass(false);
    }
  };

  return (
    <main className="grid min-h-screen grid-cols-1 gap-4 p-4 md:grid-cols-[auto_1fr]">
      <Sidebar
        role="student"
        activeStudentItem={activeStudentMenuItem}
        onStudentItemSelect={(itemId) => {
          setActiveStudentMenuItem(itemId);
          if (itemId === "enrolled") {
            setActiveClassroomTab("stream");
            setSelectedCourseId(null);
            setIsCourseActionsMenuOpen(false);
          }
        }}
        studentEnrolledCourses={activeCourses.map((course) => ({ id: course.id, title: course.title, section: course.section }))}
        activeStudentCourseId={selectedCourseId}
        onStudentCourseSelect={(courseId) => {
          setSelectedCourseId(courseId);
          setActiveStudentMenuItem("enrolled");
          setActiveClassroomTab("stream");
          setIsCourseActionsMenuOpen(false);
        }}
        onStudentLogout={() => {
          authStorage.signOut().then(() => {
            window.location.href = "/login";
          });
        }}
      />

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="font-heading text-3xl font-bold">Student Learning Studio</h1>
          <ThemeToggle />
        </div>

        {activeStudentMenuItem === "calendar" ? (
          <div className="space-y-4">
            <GlassCard className="p-5">
              <div className="mb-4">
                <h2 className="font-heading text-2xl font-semibold">Weekly planner</h2>
                <p className="mt-1 text-sm opacity-75">Track assignments, quizzes, and announcements across your week.</p>
              </div>

              <CalendarHeader
                weekStart={currentWeekStart}
                weekEnd={currentWeekEnd}
                selectedCourseId={selectedCalendarCourseId}
                courses={activeCourses.map((course) => ({ id: course.id, title: course.title, course_code: course.course_code }))}
                onCourseChange={setSelectedCalendarCourseId}
                onPrevWeek={() => setCurrentWeekStart((prev) => addWeeks(prev, -1))}
                onNextWeek={() => setCurrentWeekStart((prev) => addWeeks(prev, 1))}
              />

              <div className="mt-5">
                {calendarLoading ? (
                  <div className="rounded-2xl border border-white/20 bg-white/20 p-6 text-sm">Loading weekly events...</div>
                ) : calendarError ? (
                  <div className="rounded-2xl border border-rose-300/40 bg-rose-100/30 p-6 text-sm text-rose-700 dark:text-rose-300">{calendarError}</div>
                ) : (
                  <CalendarGrid
                    weekDays={weekDays}
                    eventsByDate={eventsByDate}
                    onEventClick={(event) => setSelectedCalendarEvent(event)}
                  />
                )}
              </div>
            </GlassCard>

            <EventModal event={selectedCalendarEvent} onClose={() => setSelectedCalendarEvent(null)} />
          </div>
        ) : activeStudentMenuItem === "enrolled" ? (
          selectedCourse ? (
            <div className="space-y-4">
              <GlassCard className="overflow-hidden p-0">
                <div className="bg-gradient-to-r from-sky-500/20 via-cyan-400/15 to-teal-400/20 p-6 backdrop-blur">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] opacity-75">
                        <BookOpen className="h-4 w-4" />
                        Enrolled class
                      </div>
                      <h2 className="mt-3 font-heading text-3xl font-bold">{selectedCourse.title}</h2>
                      <p className="mt-2 max-w-2xl text-sm opacity-85">
                        {selectedCourse.description || "Your classroom stream, classwork, people, and grades live here."}
                      </p>
                      {studentArchiveMessage && <p className="mt-3 text-sm text-sky-800 dark:text-sky-200">{studentArchiveMessage}</p>}
                    </div>
                    <div className="grid min-w-[220px] gap-2 rounded-2xl border border-white/20 bg-white/20 p-4 text-sm backdrop-blur">
                      <div className="flex items-center justify-end">
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setIsCourseActionsMenuOpen((prev) => !prev)}
                            className="rounded-full border border-white/20 bg-white/40 p-2 hover:bg-white/60"
                            aria-label="Course actions"
                          >
                            <EllipsisVertical className="h-4 w-4" />
                          </button>
                          {isCourseActionsMenuOpen && (
                            <div className="absolute right-0 top-10 z-20 min-w-[180px] rounded-xl border border-white/20 bg-white/90 p-1 shadow-xl dark:bg-slate-900/95">
                              <button
                                type="button"
                                onClick={() => void archiveCurrentCourse()}
                                disabled={studentArchiving}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60"
                              >
                                <Archive className="h-4 w-4" />
                                {studentArchiving ? "Archiving..." : "Archive class"}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="opacity-75">Course code</span>
                        <span className="font-semibold">{selectedCourse.course_code}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="opacity-75">Section</span>
                        <span className="font-semibold">{selectedCourse.section || "Not set"}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="opacity-75">Materials</span>
                        <span className="font-semibold">{classMaterials.length}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {[
                      { id: "stream", label: "Stream", icon: MessageSquarePlus },
                      { id: "classwork", label: "Classwork", icon: ClipboardList },
                      { id: "people", label: "People", icon: Users },
                      { id: "leaderboard", label: "Leaderboard", icon: BookOpen },
                    ].map((tab) => {
                      const Icon = tab.icon;
                      const active = activeClassroomTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setActiveClassroomTab(tab.id as typeof activeClassroomTab)}
                          className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
                            active
                              ? "border-sky-500/50 bg-sky-600 text-white shadow-sm"
                              : "border-white/25 bg-white/35 hover:bg-white/50"
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="border-t border-white/15 p-5">
                  {activeClassroomTab === "stream" ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="font-heading text-2xl font-semibold">Stream</h3>
                          <p className="mt-1 text-sm opacity-75">Teacher announcements, attachments, and comments appear here.</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setIsAnnouncementModalOpen(true)}
                            className="inline-flex items-center gap-2 rounded-full bg-sky-200/90 px-5 py-2 text-sm font-semibold text-sky-900 transition hover:bg-sky-200 dark:bg-sky-500/25 dark:text-sky-100 dark:hover:bg-sky-500/35"
                          >
                            <Pencil className="h-4 w-4" />
                            New announcement
                          </button>
                          <div className="rounded-full border border-white/20 bg-white/25 px-3 py-1 text-xs font-medium uppercase tracking-wide">
                            {streamPosts.length} posts
                          </div>
                        </div>
                      </div>

                      {streamLoading ? (
                        <p className="text-sm opacity-75">Loading stream...</p>
                      ) : classroomMessage ? (
                        <p className="text-sm text-rose-600 dark:text-rose-300">{classroomMessage}</p>
                      ) : streamPosts.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-white/20 bg-white/15 p-6 text-sm opacity-80">
                          No announcements yet. When your teacher posts here, they will appear in this stream.
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {streamPosts.map((post) => (
                            <div key={post.id} className="rounded-2xl border border-white/20 bg-white/20 p-5 shadow-sm backdrop-blur">
                              <div className="flex flex-wrap items-start justify-between gap-4">
                                <div>
                                  <div className="text-sm font-semibold">{post.author.name}</div>
                                  <div className="text-xs uppercase tracking-wide opacity-65">{new Date(post.created_at).toLocaleString()}</div>
                                </div>
                                {post.attachment?.file_name && (
                                  <button
                                    type="button"
                                    onClick={() => void openAttachmentPreview(post)}
                                    className="inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-800 transition hover:bg-sky-500/20 dark:text-sky-100"
                                  >
                                    <Paperclip className="h-3.5 w-3.5" />
                                    {post.attachment.file_name}
                                  </button>
                                )}
                              </div>

                              <p className="mt-4 whitespace-pre-wrap text-sm leading-6">{post.message}</p>

                              {post.comments.length > 0 && (
                                <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
                                  {post.comments.map((comment) => (
                                    <div key={comment.id} className="rounded-xl bg-white/20 px-3 py-2 text-sm">
                                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs opacity-70">
                                        <span>{comment.author.name}</span>
                                        <span>{new Date(comment.created_at).toLocaleString()}</span>
                                      </div>
                                      <p className="mt-1">{comment.content}</p>
                                    </div>
                                  ))}
                                </div>
                              )}

                              <div className="mt-4 flex gap-2">
                                <input
                                  className="w-full rounded-xl border border-white/20 bg-white/35 px-4 py-2.5 text-sm outline-none ring-0 placeholder:text-slate-500"
                                  placeholder="Add a comment"
                                  value={commentDrafts[post.id] || ""}
                                  onChange={(event) => setCommentDrafts((prev) => ({ ...prev, [post.id]: event.target.value }))}
                                />
                                <button
                                  type="button"
                                  onClick={() => void postComment(post.id)}
                                  disabled={postingCommentFor === post.id}
                                  className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-60"
                                >
                                  <Send className="h-4 w-4" />
                                  {postingCommentFor === post.id ? "Posting" : "Comment"}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : activeClassroomTab === "classwork" ? (
                    <ClassworkPage courseId={selectedCourse.id} />
                  ) : activeClassroomTab === "people" ? (
                    <StudentPeoplePage courseId={selectedCourse.id} />
                  ) : activeClassroomTab === "leaderboard" ? (
                    <StudentLeaderboardPage courseId={selectedCourse.id} courseTitle={selectedCourse.title} />
                  ) : null}
                </div>
              </GlassCard>

              {isAnnouncementModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
                  <div className="glass w-full max-w-4xl overflow-hidden rounded-3xl border border-white/20">
                    <div className="border-b border-white/15 px-6 py-4">
                      <h3 className="font-heading text-3xl font-semibold">Announcement</h3>
                    </div>

                    <div className="space-y-4 px-6 py-5">
                      <textarea
                        value={announcementText}
                        onChange={(event) => setAnnouncementText(event.target.value)}
                        placeholder="Announce something to your class"
                        className="min-h-56 w-full rounded-2xl border border-white/20 bg-white/30 px-4 py-3 text-lg outline-none placeholder:text-slate-500"
                      />

                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="inline-flex items-center gap-2 rounded-full border border-slate-400/60 px-4 py-2 text-sm font-medium hover:bg-white/20"
                          >
                            <Upload className="h-4 w-4" />
                            Attach file
                          </button>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.png,.jpg,.jpeg"
                            className="hidden"
                            onChange={(event) => {
                              const file = event.target.files?.[0] || null;
                              setSelectedAnnouncementFile(file);
                              setAnnouncementUploadFileName(file?.name || "");
                            }}
                          />
                          {announcementUploadFileName && (
                            <p className="text-sm opacity-75">{announcementUploadFileName}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={resetAnnouncementComposer}
                            className="rounded-full border border-white/20 px-5 py-2 text-sm font-semibold hover:bg-white/15"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => void postAnnouncement()}
                            disabled={postingAnnouncement || (!announcementText.trim() && !selectedAnnouncementFile)}
                            className="rounded-full bg-sky-600 px-6 py-2 text-sm font-semibold text-white disabled:opacity-60"
                          >
                            {postingAnnouncement ? "Posting..." : "Post"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {isAttachmentPreviewOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
                  <div className="glass max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-3xl border border-white/20">
                    <div className="flex items-center justify-between gap-4 border-b border-white/15 px-5 py-4">
                      <div className="min-w-0">
                        <h3 className="truncate pr-4 text-base font-semibold">{attachmentPreviewName || "Attachment preview"}</h3>
                        <p className="text-xs opacity-70">{attachmentPreviewType || "File"}</p>
                      </div>
                      <button
                        type="button"
                        aria-label="Close attachment preview"
                        onClick={closeAttachmentPreview}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                    <div className="max-h-[calc(90vh-72px)] overflow-auto p-4">
                      {attachmentPreviewUrl ? (
                        attachmentPreviewType.startsWith("image/") ? (
                          <img src={attachmentPreviewUrl} alt={attachmentPreviewName} className="mx-auto max-h-[calc(90vh-112px)] w-auto object-contain" />
                        ) : attachmentPreviewType === "application/pdf" ? (
                          <iframe src={attachmentPreviewUrl} title={attachmentPreviewName} className="h-[75vh] w-full rounded-2xl border-0" />
                        ) : (
                          <div className="rounded-2xl border border-dashed border-white/20 bg-white/10 p-6 text-sm">
                            This file type cannot be previewed inline. Use the browser download controls or open the attachment link again.
                          </div>
                        )
                      ) : null}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <GlassCard className="min-h-[78vh] p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-heading text-2xl font-semibold">Enrolled classes</h2>
                <span className="rounded-full border border-white/20 bg-white/25 px-3 py-1 text-xs font-medium uppercase tracking-wide">
                  {activeCourses.length}
                </span>
              </div>

              {activeCourses.length === 0 ? (
                <p className="text-sm opacity-80">You do not have any enrolled classes yet.</p>
              ) : (
                <div className="grid content-start gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {activeCourses.map((course, index) => (
                    <button
                      key={course.id}
                      type="button"
                      className="flex h-60 flex-col overflow-hidden rounded-3xl border border-white/20 bg-white/30 text-left shadow-lg transition duration-300 hover:-translate-y-1 hover:shadow-2xl"
                      onClick={() => {
                        setSelectedCourseId(course.id);
                        setActiveClassroomTab("stream");
                        setIsCourseActionsMenuOpen(false);
                      }}
                    >
                      <div className={`relative h-32 px-5 py-4 text-white ${index % 2 === 0 ? "bg-gradient-to-br from-blue-500 via-indigo-600 to-blue-900" : "bg-gradient-to-br from-orange-400 via-rose-500 to-fuchsia-700"}`}>
                        <h3 className="truncate text-3xl font-bold tracking-tight">{course.title}</h3>
                        <p className="mt-1 text-base opacity-90">{course.section?.trim() || "Section not set"}</p>
                      </div>

                      <div className="flex flex-1 items-end justify-between px-5 py-4">
                        <div>
                          <p className="text-xs uppercase tracking-wider opacity-70">Course code</p>
                          <p className="text-base font-semibold opacity-90">{course.course_code}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </GlassCard>
          )
        ) : activeStudentMenuItem === "home" ? (
          <div className="space-y-4">
            <GlassCard className="p-5">
              <h2 className="font-heading text-2xl">Join class</h2>
              <p className="mt-2 text-sm opacity-80">Enter your teacher's class code to join an enrolled class.</p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <input
                  className="w-full max-w-sm rounded-xl border border-white/20 bg-white/30 px-4 py-3"
                  placeholder="Class code"
                  value={joinClassCode}
                  onChange={(event) => setJoinClassCode(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void joinClass();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => void joinClass()}
                  disabled={joiningClass || !joinClassCode.trim()}
                  className="rounded-xl bg-sky-600 px-5 py-3 font-semibold text-white disabled:opacity-60"
                >
                  {joiningClass ? "Joining..." : "Join"}
                </button>
              </div>
              {joinMessage && <p className="mt-3 text-sm opacity-85">{joinMessage}</p>}
            </GlassCard>

            <GlassCard className="p-5">
              <h2 className="font-heading text-xl">AI Tutor</h2>
              <p className="mt-1 text-sm opacity-70">RAG-powered, context-aware support with study-plan suggestions.</p>

              <div className="mt-4 grid gap-4 lg:grid-cols-[300px_1fr]">
                <aside className="rounded-xl border border-white/20 bg-white/10 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-heading text-lg font-semibold">Chats</h3>
                    <button
                      onClick={createNewChat}
                      className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-sm hover:bg-white/20"
                    >
                      <MessageSquarePlus className="h-4 w-4" /> New
                    </button>
                  </div>

                  <div className="max-h-[62vh] space-y-2 overflow-y-auto pr-1">
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
                </aside>

                <div>
                  <ChatWindow messages={messages} />
                  {loadingSession && <p className="mt-2 text-xs opacity-70">Loading conversation...</p>}
                  <form onSubmit={ask} className="mt-3 flex gap-2">
                    <input className="w-full rounded-xl border border-white/20 bg-white/30 px-4 py-3" placeholder="Ask your question..." value={question} onChange={(e) => setQuestion(e.target.value)} />
                    <button className="rounded-xl bg-teal-500 px-5 py-3 font-semibold text-white">{loading ? "..." : "Send"}</button>
                  </form>
                </div>
              </div>
            </GlassCard>
          </div>
        ) : activeStudentMenuItem === "archived" ? (
          <GlassCard className="min-h-[78vh] p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-heading text-2xl font-semibold">Archived classes</h2>
              <span className="rounded-full border border-white/20 bg-white/25 px-3 py-1 text-xs font-medium uppercase tracking-wide">
                {archivedCourses.length}
              </span>
            </div>

            {studentArchiveMessage && (
              <p className="mb-4 text-sm text-sky-800 dark:text-sky-200">{studentArchiveMessage}</p>
            )}

            {archivedCourses.length === 0 ? (
              <p className="text-sm opacity-80">No archived classes yet.</p>
            ) : (
              <div className="grid content-start gap-5 md:grid-cols-2 xl:grid-cols-3">
                {archivedCourses.map((course, index) => (
                  <div
                    key={course.id}
                    className="flex h-60 flex-col overflow-hidden rounded-3xl border border-white/20 bg-white/30 shadow-lg"
                  >
                    <div className={`relative h-32 px-5 py-4 text-white ${index % 2 === 0 ? "bg-gradient-to-br from-blue-500 via-indigo-600 to-blue-900" : "bg-gradient-to-br from-orange-400 via-rose-500 to-fuchsia-700"}`}>
                      <h3 className="truncate text-3xl font-bold tracking-tight">{course.title}</h3>
                      <p className="mt-1 text-base opacity-90">{course.section?.trim() || "Section not set"}</p>
                    </div>

                    <div className="flex flex-1 items-end justify-between px-5 py-4">
                      <div>
                        <p className="text-xs uppercase tracking-wider opacity-70">Course code</p>
                        <p className="text-base font-semibold opacity-90">{course.course_code}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void restoreArchivedCourse(course)}
                        disabled={restoringCourseId === course.id}
                        className="rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        {restoringCourseId === course.id ? "Restoring..." : "Restore"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        ) : activeStudentMenuItem === "settings" ? (
          <SettingsPage role="student" />
        ) : (
          <GlassCard className="p-6">
            <h2 className="font-heading text-2xl font-semibold capitalize">{activeStudentMenuItem}</h2>
            <p className="mt-2 text-sm opacity-80">This section is ready for future content.</p>
          </GlassCard>
        )}
      </section>
    </main>
  );
}
