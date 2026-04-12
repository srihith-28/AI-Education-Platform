"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  Archive,
  Bold,
  ChevronDown,
  Copy,
  EllipsisVertical,
  Image,
  Italic,
  Link2,
  Maximize2,
  MessageSquarePlus,
  Minimize2,
  Pencil,
  Pin,
  Play,
  Smile,
  Trash2,
  Underline,
  Upload,
  Users,
  X,
} from "lucide-react";

import { ChatWindow } from "@/components/chat-window";
import { ClassworkPage } from "@/components/classwork/ClassworkPage";
import { GlassCard } from "@/components/glass-card";
import { TeacherGradesPage } from "@/components/grades/TeacherGradesPage";
import { TeacherLeaderboardPage } from "@/components/grades/TeacherLeaderboardPage";
import { TeacherPeoplePage } from "@/components/people/TeacherPeoplePage";
import { Sidebar } from "@/components/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { ChatSessionMenu } from "@/components/chat-session-menu";
import { authStorage } from "@/lib/auth";


const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "/api/v1";


type Course = {
  id: number;
  title: string;
  course_code: string;
  class_code: string;
  is_archived: boolean;
  section?: string;
  description: string;
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

type CourseStudent = {
  id: number;
  name: string;
  email: string;
};

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
  comments: StreamComment[];
};

type CourseActionKind = "archive" | "restore" | "delete";
type ClassroomTab = "stream" | "classwork" | "people" | "grades" | "leaderboard";

const TEACHER_VIEW_STATE_KEY = "teacher_dashboard_view_state_v1";
const DEFAULT_CLASSROOM_TAB: ClassroomTab = "stream";

const isTeacherMenuItem = (value: string): value is "home" | "teaching" | "archived" | "settings" => {
  return ["home", "teaching", "archived", "settings"].includes(value);
};

const isClassroomTab = (value: string): value is ClassroomTab => {
  return ["stream", "classwork", "people", "grades", "leaderboard"].includes(value);
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
  const [activeTeacherMenuItem, setActiveTeacherMenuItem] = useState("home");
  const [activeTeachingCourseId, setActiveTeachingCourseId] = useState<number | null>(null);
  const [activeClassroomTab, setActiveClassroomTab] = useState<ClassroomTab>(DEFAULT_CLASSROOM_TAB);
  const [viewStateHydrated, setViewStateHydrated] = useState(false);
  const [isClassCodeMenuOpen, setIsClassCodeMenuOpen] = useState(false);
  const [isClassCodeModalOpen, setIsClassCodeModalOpen] = useState(false);
  const [isAnnouncementModalOpen, setIsAnnouncementModalOpen] = useState(false);
  const [announcementText, setAnnouncementText] = useState("");
  const [announcementCourseId, setAnnouncementCourseId] = useState<number | null>(null);
  const [isAnnouncementCourseMenuOpen, setIsAnnouncementCourseMenuOpen] = useState(false);
  const [isAudienceMenuOpen, setIsAudienceMenuOpen] = useState(false);
  const [isEmojiMenuOpen, setIsEmojiMenuOpen] = useState(false);
  const [announcementStudents, setAnnouncementStudents] = useState<CourseStudent[]>([]);
  const [selectedAudienceStudentIds, setSelectedAudienceStudentIds] = useState<number[]>([]);
  const [audienceLoading, setAudienceLoading] = useState(false);
  const [classCodeActionMessage, setClassCodeActionMessage] = useState("");
  const [courseTitle, setCourseTitle] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [courseSection, setCourseSection] = useState("");
  const [courseDescription, setCourseDescription] = useState("");
  const [courses, setCourses] = useState<Course[]>([]);
  const [isCourseActionsMenuOpen, setIsCourseActionsMenuOpen] = useState(false);
  const [isRenameCourseModalOpen, setIsRenameCourseModalOpen] = useState(false);
  const [renameCourseTitle, setRenameCourseTitle] = useState("");
  const [renameCourseCode, setRenameCourseCode] = useState("");
  const [courseActionMessage, setCourseActionMessage] = useState("");
  const [archivedCardMenuCourseId, setArchivedCardMenuCourseId] = useState<number | null>(null);
  const [pendingCourseAction, setPendingCourseAction] = useState<{ kind: CourseActionKind; course: Course } | null>(null);
  const [selectedCourseCode, setSelectedCourseCode] = useState("");
  const [streamPosts, setStreamPosts] = useState<StreamPost[]>([]);
  const [streamLoading, setStreamLoading] = useState(false);
  const [streamMessage, setStreamMessage] = useState("");
  const [postingAnnouncement, setPostingAnnouncement] = useState(false);
  const [selectedAnnouncementFile, setSelectedAnnouncementFile] = useState<File | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<number, string>>({});
  const [postingCommentFor, setPostingCommentFor] = useState<number | null>(null);
  const [isAttachmentPreviewOpen, setIsAttachmentPreviewOpen] = useState(false);
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState("");
  const [attachmentPreviewName, setAttachmentPreviewName] = useState("");
  const [attachmentPreviewType, setAttachmentPreviewType] = useState("");
  const [agentQuery, setAgentQuery] = useState("");
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentMessages, setAgentMessages] = useState<Array<{ role: "user" | "assistant"; text: string }>>([
    { role: "assistant", text: TEACHER_WELCOME }
  ]);
  const [teacherSessions, setTeacherSessions] = useState<TeacherSessionRow[]>([]);
  const [agentSessionId, setAgentSessionId] = useState("");
  const [agentSessionLoading, setAgentSessionLoading] = useState(false);
  const [courseMessage, setCourseMessage] = useState("");
  const [announcementUploadFileName, setAnnouncementUploadFileName] = useState("");
  const [agentMessage, setAgentMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const classCodeMenuRef = useRef<HTMLDivElement | null>(null);
  const courseActionsMenuRef = useRef<HTMLDivElement | null>(null);
  const announcementTextRef = useRef<HTMLDivElement | null>(null);
  const announcementCourseMenuRef = useRef<HTMLDivElement | null>(null);
  const announcementAudienceMenuRef = useRef<HTMLDivElement | null>(null);
  const emojiMenuRef = useRef<HTMLDivElement | null>(null);
  const activeTeachingCourse = courses.find((course) => course.id === activeTeachingCourseId) || null;
  const currentClassCode = activeTeachingCourse?.class_code || "";
  const activeCourses = courses.filter((course) => !course.is_archived);
  const archivedCourses = courses.filter((course) => course.is_archived);

  const getClassInviteLink = (classCode: string): string => {
    if (typeof window === "undefined") {
      return `https://classroom.local/join/${classCode}`;
    }
    return `${window.location.origin}/join/${classCode}`;
  };

  const copyToClipboard = async (value: string, successMessage: string) => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        setClassCodeActionMessage(successMessage);
        return;
      }
    } catch {
      // fall back to showing raw value
    }

    setClassCodeActionMessage(`${successMessage} (${value})`);
  };

  const formatTimestamp = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return "Now";
    }
    return parsed.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const resetAnnouncementComposer = () => {
    setIsAnnouncementModalOpen(false);
    setIsAnnouncementCourseMenuOpen(false);
    setIsAudienceMenuOpen(false);
    setIsEmojiMenuOpen(false);
    setSelectedAudienceStudentIds([]);
    setAnnouncementUploadFileName("");
    setSelectedAnnouncementFile(null);
    setAnnouncementText("");
    if (announcementTextRef.current) {
      announcementTextRef.current.innerHTML = "";
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

  const selectedAnnouncementCourse = courses.find((course) => course.id === announcementCourseId) || null;
  const allStudentsSelected = selectedAudienceStudentIds.length === 0;

  const selectedAudienceSummary = allStudentsSelected
    ? "All students"
    : `${selectedAudienceStudentIds.length} selected`;

  const emojiOptions = [
    "😀", "😁", "😂", "🤣", "😊", "😍", "🤩", "😎", "🙂", "😉", "🤗", "😇",
    "👍", "👏", "🙌", "💪", "🔥", "💯", "✅", "⭐", "🎉", "🎯", "🚀", "📚",
    "📝", "💡", "📌", "📣", "❤️", "✨", "🥳", "🤝",
  ];

  const runEditorCommand = (command: string, value?: string) => {
    const editor = announcementTextRef.current;
    if (!editor || typeof document === "undefined") {
      return;
    }
    editor.focus();
    document.execCommand(command, false, value);
    setAnnouncementText((editor.innerText || "").trim());
  };

  const applyFormatting = (kind: "bold" | "italic" | "underline") => {
    runEditorCommand(kind);
  };

  const insertEmoji = (emoji: string) => {
    runEditorCommand("insertText", `${emoji} `);
    setIsEmojiMenuOpen(false);
  };

  const fetchAnnouncementStudents = async (courseCode: string) => {
    try {
      setAudienceLoading(true);
      const response = await fetch(`${API_BASE}/teacher/courses/${courseCode}/students`, {
        headers: getAuthHeaders(true),
      });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data?.data)) {
        setAnnouncementStudents([]);
        return;
      }
      setAnnouncementStudents(data.data);
    } catch {
      setAnnouncementStudents([]);
    } finally {
      setAudienceLoading(false);
    }
  };

  const resetClassCode = async () => {
    if (!activeTeachingCourse) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/teacher/courses/${activeTeachingCourse.course_code}/reset-class-code`, {
        method: "POST",
        headers: getAuthHeaders(true),
        body: JSON.stringify({})
      });
      const data = await response.json();
      if (!response.ok) {
        setClassCodeActionMessage(data?.detail || data?.message || "Could not reset class code");
        return;
      }
      const updatedCode = data?.data?.class_code;
      if (typeof updatedCode === "string" && updatedCode.trim()) {
        setCourses((prev) => prev.map((course) => (
          course.id === activeTeachingCourse.id ? { ...course, class_code: updatedCode } : course
        )));
        setClassCodeActionMessage("Class code reset");
      } else {
        await loadCourses();
      }
    } catch {
      setClassCodeActionMessage("Could not reset class code");
    }
  };

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

  const renameCourse = async () => {
    if (!activeTeachingCourse) {
      return;
    }

    const title = renameCourseTitle.trim();
    const nextCode = renameCourseCode.trim().toUpperCase();
    if (!title || !nextCode) {
      setCourseActionMessage("Please provide course name and course code.");
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/teacher/courses/${activeTeachingCourse.course_code}/rename`, {
        method: "POST",
        headers: getAuthHeaders(true),
        body: JSON.stringify({ title, course_code: nextCode }),
      });
      const data = await response.json();
      if (!response.ok) {
        setCourseActionMessage(data?.detail || data?.message || "Could not rename class.");
        return;
      }

      await loadCourses();
      setCourseActionMessage("Class renamed successfully.");
      setIsRenameCourseModalOpen(false);
      setIsCourseActionsMenuOpen(false);
    } catch {
      setCourseActionMessage("Could not rename class.");
    }
  };

  const archiveCourse = async (course: Course) => {
    try {
      const response = await fetch(`${API_BASE}/teacher/courses/${course.course_code}/archive`, {
        method: "POST",
        headers: getAuthHeaders(true),
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (!response.ok) {
        setCourseActionMessage(data?.detail || data?.message || "Could not archive class.");
        return;
      }

      await loadCourses();
      setCourseActionMessage("");
      setIsCourseActionsMenuOpen(false);
      setActiveTeacherMenuItem("archived");
      if (activeTeachingCourseId === course.id) {
        setActiveTeachingCourseId(null);
      }
      setPendingCourseAction(null);
    } catch {
      setCourseActionMessage("Could not archive class.");
    }
  };

  const restoreCourse = async (course: Course) => {
    try {
      const response = await fetch(`${API_BASE}/teacher/courses/${course.course_code}/restore`, {
        method: "POST",
        headers: getAuthHeaders(true),
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (!response.ok) {
        setCourseActionMessage(data?.detail || data?.message || "Could not restore class.");
        return;
      }

      await loadCourses();
      setCourseActionMessage("Class restored to Teaching.");
      setActiveTeacherMenuItem("teaching");
      setActiveTeachingCourseId(course.id);
      setActiveClassroomTab("stream");
      setArchivedCardMenuCourseId(null);
      setPendingCourseAction(null);
    } catch {
      setCourseActionMessage("Could not restore class.");
    }
  };

  const deleteCoursePermanently = async (course: Course) => {
    await deleteCourse(course.course_code);
    setCourseActionMessage("Class deleted permanently.");
    setArchivedCardMenuCourseId(null);
    setPendingCourseAction(null);
  };

  const executePendingCourseAction = async () => {
    if (!pendingCourseAction) {
      return;
    }

    if (pendingCourseAction.kind === "archive") {
      await archiveCourse(pendingCourseAction.course);
      return;
    }
    if (pendingCourseAction.kind === "restore") {
      await restoreCourse(pendingCourseAction.course);
      return;
    }
    await deleteCoursePermanently(pendingCourseAction.course);
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const menuFromQuery = params.get("menu")?.trim() || "";
    const tabFromQuery = params.get("tab")?.trim() || "";
    const courseFromQuery = params.get("course")?.trim() || "";

    let restoredMenu = "";
    let restoredTab = "";
    let restoredCourseId: number | null = null;

    if (menuFromQuery || tabFromQuery || courseFromQuery) {
      restoredMenu = menuFromQuery;
      restoredTab = tabFromQuery;
      const parsedCourseId = Number(courseFromQuery);
      restoredCourseId = Number.isFinite(parsedCourseId) && parsedCourseId > 0 ? parsedCourseId : null;
    } else {
      const rawStored = window.localStorage.getItem(TEACHER_VIEW_STATE_KEY);
      if (rawStored) {
        try {
          const parsed = JSON.parse(rawStored) as {
            menu?: string;
            tab?: string;
            courseId?: number | null;
          };
          restoredMenu = String(parsed.menu || "");
          restoredTab = String(parsed.tab || "");
          const parsedCourseId = Number(parsed.courseId);
          restoredCourseId = Number.isFinite(parsedCourseId) && parsedCourseId > 0 ? parsedCourseId : null;
        } catch {
          restoredMenu = "";
          restoredTab = "";
          restoredCourseId = null;
        }
      }
    }

    if (isTeacherMenuItem(restoredMenu)) {
      setActiveTeacherMenuItem(restoredMenu);
    }
    if (isClassroomTab(restoredTab)) {
      setActiveClassroomTab(restoredTab);
    }
    if (restoredCourseId) {
      setActiveTeachingCourseId(restoredCourseId);
    }

    setViewStateHydrated(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!viewStateHydrated) {
      return;
    }

    const stateToPersist = {
      menu: activeTeacherMenuItem,
      tab: activeClassroomTab,
      courseId: activeTeachingCourseId,
    };
    window.localStorage.setItem(TEACHER_VIEW_STATE_KEY, JSON.stringify(stateToPersist));

    const url = new URL(window.location.href);
    url.searchParams.set("menu", activeTeacherMenuItem);
    if (activeTeacherMenuItem === "teaching") {
      url.searchParams.set("tab", activeClassroomTab);
      if (activeTeachingCourseId) {
        url.searchParams.set("course", String(activeTeachingCourseId));
      } else {
        url.searchParams.delete("course");
      }
    } else {
      url.searchParams.delete("tab");
      url.searchParams.delete("course");
    }

    const nextPath = `${url.pathname}${url.search}`;
    const currentPath = `${window.location.pathname}${window.location.search}`;
    if (nextPath !== currentPath) {
      window.history.replaceState({}, "", nextPath);
    }
  }, [activeTeacherMenuItem, activeClassroomTab, activeTeachingCourseId, viewStateHydrated]);

  useEffect(() => {
    if (!courses.length || activeTeachingCourseId == null) {
      return;
    }

    const exists = courses.some((course) => course.id === activeTeachingCourseId);
    if (!exists) {
      setActiveTeachingCourseId(null);
      if (activeTeacherMenuItem === "teaching") {
        setActiveClassroomTab(DEFAULT_CLASSROOM_TAB);
      }
    }
  }, [courses, activeTeacherMenuItem, activeTeachingCourseId]);

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

  useEffect(() => {
    if (!isAnnouncementModalOpen) {
      return;
    }
    const defaultCourseId = activeTeachingCourse?.id || courses[0]?.id || null;
    setAnnouncementCourseId(defaultCourseId);
    setSelectedAudienceStudentIds([]);
    if (defaultCourseId) {
      const course = courses.find((row) => row.id === defaultCourseId);
      if (course) {
        void fetchAnnouncementStudents(course.course_code);
      }
    } else {
      setAnnouncementStudents([]);
    }
  }, [isAnnouncementModalOpen, activeTeachingCourse, courses]);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const target = event.target as Node;
      if (announcementCourseMenuRef.current && !announcementCourseMenuRef.current.contains(target)) {
        setIsAnnouncementCourseMenuOpen(false);
      }
      if (announcementAudienceMenuRef.current && !announcementAudienceMenuRef.current.contains(target)) {
        setIsAudienceMenuOpen(false);
      }
      if (emojiMenuRef.current && !emojiMenuRef.current.contains(target)) {
        setIsEmojiMenuOpen(false);
      }
    };

    if (isAnnouncementModalOpen) {
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }
  }, [isAnnouncementModalOpen]);

  useEffect(() => {
    setIsClassCodeMenuOpen(false);
    setIsClassCodeModalOpen(false);
    setClassCodeActionMessage("");
  }, [activeTeachingCourseId]);

  useEffect(() => {
    if (!activeTeachingCourse?.course_code || activeClassroomTab !== "stream") {
      return;
    }
    void loadCourseAnnouncements(activeTeachingCourse.course_code);
  }, [activeTeachingCourse?.course_code, activeClassroomTab]);

  useEffect(() => {
    if (!isClassCodeMenuOpen) {
      return;
    }

    const handleOutsideMenuClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (classCodeMenuRef.current && !classCodeMenuRef.current.contains(target)) {
        setIsClassCodeMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideMenuClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideMenuClick);
    };
  }, [isClassCodeMenuOpen]);

  useEffect(() => {
    const handleOutsideMenuClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (courseActionsMenuRef.current && !courseActionsMenuRef.current.contains(target)) {
        setIsCourseActionsMenuOpen(false);
      }

      const targetElement = event.target as Element | null;
      if (!targetElement || !targetElement.closest("[data-archived-menu-root='true']")) {
        setArchivedCardMenuCourseId(null);
      }
    };

    document.addEventListener("mousedown", handleOutsideMenuClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideMenuClick);
    };
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
        body: JSON.stringify({
          title: courseTitle,
          course_code: courseCode,
          section: courseSection,
          description: courseDescription
        })
      });

      const data = await response.json();
      if (!response.ok) {
        setCourseMessage(data?.detail || data?.message || "Course creation failed.");
        return;
      }

      if (data?.data?.course_id) {
        setCourseTitle("");
        setCourseCode("");
        setCourseSection("");
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

  const loadCourseAnnouncements = async (courseCode: string) => {
    try {
      setStreamLoading(true);
      setStreamMessage("");
      const response = await fetch(`${API_BASE}/teacher/courses/${courseCode}/announcements`, {
        headers: getAuthHeaders(true),
      });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data?.data)) {
        setStreamPosts([]);
        setStreamMessage(data?.detail || data?.message || "Could not load stream posts.");
        return;
      }
      setStreamPosts(data.data);
    } catch {
      setStreamPosts([]);
      setStreamMessage("Could not load stream posts.");
    } finally {
      setStreamLoading(false);
    }
  };

  const postAnnouncement = async () => {
    if (!selectedAnnouncementCourse) {
      setStreamMessage("Please select a course.");
      return;
    }

    const hasText = announcementText.trim().length > 0;
    if (!hasText && !selectedAnnouncementFile) {
      setStreamMessage("Add a message or attachment before posting.");
      return;
    }

    const formData = new FormData();
    formData.append("message", announcementText.trim());
    if (selectedAudienceStudentIds.length > 0) {
      formData.append("student_ids", JSON.stringify(selectedAudienceStudentIds));
    }
    if (selectedAnnouncementFile) {
      formData.append("file", selectedAnnouncementFile);
    }

    try {
      setPostingAnnouncement(true);
      const response = await fetch(`${API_BASE}/teacher/courses/${selectedAnnouncementCourse.course_code}/announcements`, {
        method: "POST",
        headers: getAuthHeaders(false),
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        setStreamMessage(data?.detail || data?.message || "Could not post announcement.");
        return;
      }

      resetAnnouncementComposer();
      if (activeTeachingCourse?.course_code === selectedAnnouncementCourse.course_code) {
        await loadCourseAnnouncements(selectedAnnouncementCourse.course_code);
      }
    } catch {
      setStreamMessage("Could not post announcement.");
    } finally {
      setPostingAnnouncement(false);
    }
  };

  const postComment = async (postId: number) => {
    if (!activeTeachingCourse) {
      return;
    }
    const content = (commentDrafts[postId] || "").trim();
    if (!content) {
      return;
    }

    try {
      setPostingCommentFor(postId);
      const response = await fetch(`${API_BASE}/teacher/courses/${activeTeachingCourse.course_code}/announcements/${postId}/comments`, {
        method: "POST",
        headers: getAuthHeaders(true),
        body: JSON.stringify({ content }),
      });
      const data = await response.json();
      if (!response.ok || !data?.data) {
        setStreamMessage(data?.detail || data?.message || "Could not post comment.");
        return;
      }

      setStreamPosts((prev) => prev.map((post) => (
        post.id === postId ? { ...post, comments: [...post.comments, data.data] } : post
      )));
      setCommentDrafts((prev) => ({ ...prev, [postId]: "" }));
    } catch {
      setStreamMessage("Could not post comment.");
    } finally {
      setPostingCommentFor(null);
    }
  };

  const openAnnouncementAttachmentPreview = async (post: StreamPost) => {
    const downloadUrl = post.attachment?.download_url;
    const fileName = post.attachment?.file_name || "attachment";
    if (!downloadUrl) {
      return;
    }

    try {
      const resolvedDownloadUrl = downloadUrl.startsWith("http")
        ? downloadUrl
        : new URL(downloadUrl, window.location.origin).toString();

      const response = await fetch(resolvedDownloadUrl, {
        headers: getAuthHeaders(false),
      });
      if (!response.ok) {
        setStreamMessage("Could not open attachment.");
        return;
      }

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      if (attachmentPreviewUrl) {
        window.URL.revokeObjectURL(attachmentPreviewUrl);
      }
      setAttachmentPreviewUrl(blobUrl);
      setAttachmentPreviewName(fileName);
      setAttachmentPreviewType(blob.type || post.attachment?.content_type || "");
      setIsAttachmentPreviewOpen(true);
    } catch {
      setStreamMessage("Could not open attachment.");
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
        body: JSON.stringify({ query: currentQuestion, session_id: activeSessionId, course_code: selectedCourseCode || undefined, chat_mode: "quality" })
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

  return (
    <main className="grid min-h-screen grid-cols-1 gap-4 p-4 md:grid-cols-[auto_1fr]">
      <Sidebar
        role="teacher"
        activeTeacherItem={activeTeacherMenuItem}
        onTeacherItemSelect={(itemId) => {
          setActiveTeacherMenuItem(itemId);
          if (itemId === "teaching") {
            setActiveTeachingCourseId(null);
          }
        }}
        teacherCourses={activeCourses.map((course) => ({ id: course.id, title: course.title, section: course.section }))}
        activeTeacherCourseId={activeTeachingCourseId}
        onTeacherCourseSelect={(courseId) => {
          setActiveTeachingCourseId(courseId);
          setActiveTeacherMenuItem("teaching");
          setActiveClassroomTab("stream");
        }}
      />
      <section className="space-y-4">
        {activeTeacherMenuItem === "teaching" ? (
          activeTeachingCourse ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-white/20 bg-white/35 px-5 py-3 backdrop-blur">
              <div className="flex items-center justify-end">
                <ThemeToggle />
              </div>

              <div className="mt-3 flex flex-wrap gap-5 pt-1">
                {[
                  { id: "stream", label: "Stream" },
                  { id: "classwork", label: "Classwork" },
                  { id: "people", label: "People" },
                  { id: "grades", label: "Grades" },
                  { id: "leaderboard", label: "Leaderboard" }
                ].map((tab) => {
                  const active = activeClassroomTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveClassroomTab(tab.id as typeof activeClassroomTab)}
                      className={`relative px-1 pb-2 text-lg font-semibold transition ${
                        active ? "text-sky-700 dark:text-sky-300" : "opacity-80 hover:opacity-100"
                      }`}
                    >
                      {tab.label}
                      {active && <span className="absolute -bottom-0.5 left-0 h-1 w-full rounded bg-sky-600" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {activeClassroomTab === "stream" ? (
              <div className="space-y-4">
                <GlassCard className="overflow-hidden p-0">
                  <div className="relative h-52 bg-gradient-to-r from-slate-700 via-slate-700 to-slate-800 px-6 py-5 text-white">
                    <div ref={courseActionsMenuRef} className="absolute right-5 top-4">
                      <button
                        type="button"
                        onClick={() => setIsCourseActionsMenuOpen((prev) => !prev)}
                        className="rounded-full border border-white/35 bg-black/20 p-2 hover:bg-black/35"
                        aria-label="Course actions"
                      >
                        <EllipsisVertical className="h-5 w-5" />
                      </button>
                      {isCourseActionsMenuOpen && (
                        <div className="absolute right-0 top-11 z-[130] min-w-[250px] overflow-hidden rounded-xl border border-slate-300 bg-white text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                          <button
                            type="button"
                            onClick={() => {
                              setRenameCourseTitle(activeTeachingCourse.title);
                              setRenameCourseCode(activeTeachingCourse.course_code);
                              setIsRenameCourseModalOpen(true);
                              setIsCourseActionsMenuOpen(false);
                            }}
                            className="block w-full px-4 py-3 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            Rename
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingCourseAction({ kind: "archive", course: activeTeachingCourse })}
                            className="block w-full px-4 py-3 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            Archive
                          </button>
                        </div>
                      )}
                    </div>
                    <h2 className="font-heading text-5xl font-bold leading-tight">{activeTeachingCourse.title}</h2>
                    <p className="mt-1 text-3xl opacity-90">{activeTeachingCourse.section?.trim() || "Section not set"}</p>
                  </div>
                </GlassCard>

                <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
                  <div className="space-y-4">
                    <GlassCard className="relative z-30 overflow-visible p-5">
                      <div ref={classCodeMenuRef} className="relative flex items-center justify-between">
                        <h3 className="text-2xl font-semibold">Class code</h3>
                        <button
                          type="button"
                          onClick={() => setIsClassCodeMenuOpen((prev) => !prev)}
                          className="rounded-full border border-white/30 bg-white/20 p-2 hover:bg-white/40"
                          aria-label="Class code options"
                        >
                          <EllipsisVertical className="h-5 w-5 opacity-80" />
                        </button>
                        {isClassCodeMenuOpen && (
                          <div className="absolute right-0 top-12 z-[120] min-w-[260px] overflow-hidden rounded-2xl border border-slate-300 bg-white text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                            <button
                              type="button"
                              onClick={() => {
                                void copyToClipboard(getClassInviteLink(currentClassCode), "Invite link copied");
                                setIsClassCodeMenuOpen(false);
                              }}
                              className="block w-full px-4 py-3 text-left text-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              Copy class invite link
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                void copyToClipboard(currentClassCode, "Class code copied");
                                setIsClassCodeMenuOpen(false);
                              }}
                              className="block w-full px-4 py-3 text-left text-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              Copy class code
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                void resetClassCode();
                                setIsClassCodeMenuOpen(false);
                              }}
                              className="block w-full px-4 py-3 text-left text-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              Reset class code
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="mt-4 flex items-center gap-3">
                        <p className="text-5xl font-semibold tracking-wide">{currentClassCode}</p>
                        <button
                          type="button"
                          onClick={() => setIsClassCodeModalOpen(true)}
                          className="rounded-full p-2 text-sky-700 hover:bg-sky-100/70 dark:text-sky-300 dark:hover:bg-sky-500/20"
                          aria-label="Open class code"
                        >
                          <Maximize2 className="h-5 w-5" />
                        </button>
                      </div>

                      {classCodeActionMessage && <p className="mt-3 text-sm opacity-80">{classCodeActionMessage}</p>}
                    </GlassCard>

                    <GlassCard className="relative z-10 p-5">
                      <h3 className="text-2xl font-semibold">Upcoming</h3>
                      <p className="mt-3 text-lg opacity-75">No work due soon</p>
                    </GlassCard>
                  </div>

                  <GlassCard className="p-5">
                    <div className="flex flex-wrap items-center gap-4">
                      <button
                        type="button"
                        onClick={() => setIsAnnouncementModalOpen(true)}
                        className="inline-flex items-center gap-2 rounded-full bg-sky-200/90 px-5 py-2 text-lg font-semibold text-sky-900 dark:bg-sky-500/25 dark:text-sky-100"
                      >
                        <Pencil className="h-4 w-4" />
                        New announcement
                      </button>
                      <button className="text-lg font-semibold text-sky-700 dark:text-sky-300">Repost</button>
                    </div>
                    {streamMessage && <p className="mt-3 text-sm opacity-80">{streamMessage}</p>}
                    <div className="mt-4 space-y-4">
                      {streamLoading ? (
                        <div className="rounded-2xl border border-white/20 bg-white/30 p-6 text-sm opacity-80">Loading posts...</div>
                      ) : streamPosts.length === 0 ? (
                        <div className="rounded-2xl border border-white/20 bg-white/30 p-6">
                          <h4 className="text-2xl font-semibold">No announcements yet</h4>
                          <p className="mt-2 text-base opacity-80">Post a message or file to start your class stream.</p>
                        </div>
                      ) : (
                        streamPosts.map((post) => (
                          <div key={post.id} className="overflow-hidden rounded-2xl border border-white/25 bg-white/40">
                            <div className="px-5 py-4">
                              <div className="flex items-start gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-700 text-lg font-semibold text-white">
                                  {(post.author?.name || "U").slice(0, 1).toUpperCase()}
                                </div>
                                <div>
                                  <p className="text-lg font-semibold">{post.author?.name || "Unknown"}</p>
                                  <p className="text-sm opacity-70">{formatTimestamp(post.created_at)}</p>
                                </div>
                              </div>

                              {post.message && <p className="mt-3 whitespace-pre-wrap text-base">{post.message}</p>}

                              {post.attachment?.file_name && (
                                <div className="mt-4 overflow-hidden rounded-xl border border-slate-300/70 bg-white/70 dark:border-slate-700 dark:bg-slate-800/70">
                                  <button
                                    type="button"
                                    onClick={() => void openAnnouncementAttachmentPreview(post)}
                                    className="flex items-center justify-between px-4 py-3 text-sm hover:bg-slate-100/70 dark:hover:bg-slate-700/60"
                                  >
                                    <span className="font-medium">{post.attachment.file_name}</span>
                                    <span className="opacity-70">Preview</span>
                                  </button>
                                </div>
                              )}
                            </div>

                            <div className="border-t border-white/20 bg-white/20 px-5 py-4">
                              <div className="space-y-3">
                                {post.comments.map((comment) => (
                                  <div key={comment.id} className="rounded-xl bg-white/50 px-3 py-2 dark:bg-slate-800/50">
                                    <p className="text-sm font-semibold">
                                      {comment.author?.name || "Unknown"}
                                      <span className="ml-2 text-xs font-normal opacity-70">{formatTimestamp(comment.created_at)}</span>
                                    </p>
                                    <p className="text-sm">{comment.content}</p>
                                  </div>
                                ))}
                              </div>

                              <div className="mt-3 flex items-center gap-2">
                                <input
                                  value={commentDrafts[post.id] || ""}
                                  onChange={(event) => setCommentDrafts((prev) => ({ ...prev, [post.id]: event.target.value }))}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      event.preventDefault();
                                      void postComment(post.id);
                                    }
                                  }}
                                  placeholder="Add class comment..."
                                  className="w-full rounded-full border border-white/30 bg-white/60 px-4 py-2 text-sm outline-none focus:border-sky-400 dark:bg-slate-800/60"
                                />
                                <button
                                  type="button"
                                  onClick={() => void postComment(post.id)}
                                  disabled={postingCommentFor === post.id || !(commentDrafts[post.id] || "").trim()}
                                  className="rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                                >
                                  Reply
                                </button>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </GlassCard>
                </div>
                {courseActionMessage && <p className="text-sm opacity-80">{courseActionMessage}</p>}
              </div>
            ) : activeClassroomTab === "classwork" ? (
              <ClassworkPage embedded courseId={activeTeachingCourse.id} />
            ) : activeClassroomTab === "people" ? (
              <TeacherPeoplePage courseId={activeTeachingCourse.id} classCode={currentClassCode} />
            ) : activeClassroomTab === "grades" ? (
              <TeacherGradesPage courseId={activeTeachingCourse.id} courseTitle={activeTeachingCourse.title} />
            ) : activeClassroomTab === "leaderboard" ? (
              <TeacherLeaderboardPage courseId={activeTeachingCourse.id} courseTitle={activeTeachingCourse.title} />
            ) : (
              <GlassCard className="p-6">
                <h2 className="font-heading text-2xl font-semibold capitalize">{activeClassroomTab}</h2>
                <p className="mt-2 text-sm opacity-80">{activeClassroomTab} panel for {activeTeachingCourse.title} is ready for your next feature request.</p>
              </GlassCard>
            )}

            {isClassCodeModalOpen && (
              <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4" onClick={() => setIsClassCodeModalOpen(false)}>
                <div
                  className="w-full max-w-4xl rounded-3xl border border-white/20 bg-slate-100 p-6 text-slate-900 shadow-2xl dark:bg-slate-900 dark:text-slate-100"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="flex items-center justify-between">
                    <h2 className="text-5xl font-semibold">Class code</h2>
                    <button
                      type="button"
                      onClick={() => setIsClassCodeModalOpen(false)}
                      className="rounded-full p-2 hover:bg-slate-200 dark:hover:bg-slate-800"
                      aria-label="Close class code modal"
                    >
                      <X className="h-8 w-8" />
                    </button>
                  </div>

                  <p className="mt-10 text-center text-9xl font-semibold tracking-wide">{currentClassCode}</p>

                  <div className="mt-10 flex items-center justify-between">
                    <div>
                      <p className="text-4xl font-medium">{activeTeachingCourse.title}</p>
                      <p className="text-2xl opacity-75">{activeTeachingCourse.section?.trim() || "Section not set"}</p>
                    </div>

                    <div className="flex items-center gap-4">
                      <button
                        type="button"
                        onClick={() => void copyToClipboard(getClassInviteLink(currentClassCode), "Invite link copied")}
                        className="inline-flex items-center gap-2 rounded-full border border-sky-400/60 px-5 py-2 text-2xl font-semibold text-sky-700 dark:text-sky-300"
                      >
                        <Copy className="h-6 w-6" /> Copy invite link
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsClassCodeModalOpen(false)}
                        className="rounded-full border border-white/30 p-2 hover:bg-slate-200 dark:hover:bg-slate-800"
                        aria-label="Zoom out class code"
                      >
                        <Minimize2 className="h-6 w-6" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {isAttachmentPreviewOpen && (
              <div className="fixed inset-0 z-50 bg-black/70" onClick={closeAttachmentPreview}>
                <div
                  className="mx-auto mt-4 flex h-[92vh] w-[94vw] max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/20 bg-slate-900 shadow-2xl"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3 text-slate-100">
                    <h3 className="truncate pr-4 text-base font-semibold">{attachmentPreviewName || "Attachment preview"}</h3>
                    <button
                      type="button"
                      onClick={closeAttachmentPreview}
                      className="rounded-full p-2 hover:bg-slate-700"
                      aria-label="Close attachment preview"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="h-full bg-slate-800">
                    {attachmentPreviewUrl ? (
                      attachmentPreviewType.includes("image/") ? (
                        <div className="flex h-full items-center justify-center p-4">
                          <img src={attachmentPreviewUrl} alt={attachmentPreviewName} className="max-h-full max-w-full object-contain" />
                        </div>
                      ) : (
                        <iframe
                          src={attachmentPreviewUrl}
                          title={attachmentPreviewName || "Attachment preview"}
                          className="h-full w-full"
                        />
                      )
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-slate-300">Loading preview...</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {isRenameCourseModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4" onClick={() => setIsRenameCourseModalOpen(false)}>
                <div
                  className="w-full max-w-xl rounded-2xl border border-white/20 bg-slate-100 p-6 text-slate-900 shadow-2xl dark:bg-slate-900 dark:text-slate-100"
                  onClick={(event) => event.stopPropagation()}
                >
                  <h3 className="text-2xl font-semibold">Rename class</h3>
                  <div className="mt-4 space-y-3">
                    <input
                      className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800"
                      value={renameCourseTitle}
                      onChange={(event) => setRenameCourseTitle(event.target.value)}
                      placeholder="Course name"
                    />
                    <input
                      className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 uppercase dark:border-slate-700 dark:bg-slate-800"
                      value={renameCourseCode}
                      onChange={(event) => setRenameCourseCode(event.target.value.toUpperCase())}
                      placeholder="Course code"
                    />
                  </div>
                  <div className="mt-5 flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setIsRenameCourseModalOpen(false)}
                      className="rounded-lg border border-slate-400 px-4 py-2 text-sm dark:border-slate-600"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void renameCourse()}
                      className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            )}

            {isAnnouncementModalOpen && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
                onClick={() => resetAnnouncementComposer()}
              >
                <div
                  className="w-full max-w-4xl overflow-hidden rounded-3xl border border-white/30 bg-slate-100 text-slate-900 shadow-2xl dark:bg-slate-900 dark:text-slate-100"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="border-b border-slate-300/70 px-6 py-4 dark:border-slate-700">
                    <h2 className="text-4xl font-semibold">Announcement</h2>
                  </div>

                  <div className="space-y-4 px-6 py-5">
                    <div className="text-base font-semibold opacity-85">For</div>
                    <div className="flex flex-wrap items-center gap-4">
                      <div ref={announcementCourseMenuRef} className="relative">
                        <button
                          type="button"
                          onClick={() => setIsAnnouncementCourseMenuOpen((prev) => !prev)}
                          className="inline-flex items-center gap-2 rounded-lg bg-white/80 px-4 py-3 text-xl font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                          {selectedAnnouncementCourse
                            ? `${selectedAnnouncementCourse.title} (${selectedAnnouncementCourse.section?.trim() || "Section"})`
                            : "Select course"}
                          <ChevronDown className="h-5 w-5" />
                        </button>
                        {isAnnouncementCourseMenuOpen && (
                          <div className="absolute left-0 top-full z-30 mt-2 max-h-64 min-w-[360px] overflow-auto rounded-xl border border-slate-300 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                            {courses.map((course) => (
                              <button
                                key={course.id}
                                type="button"
                                onClick={() => {
                                  setAnnouncementCourseId(course.id);
                                  setSelectedAudienceStudentIds([]);
                                  setIsAnnouncementCourseMenuOpen(false);
                                  void fetchAnnouncementStudents(course.course_code);
                                }}
                                className={`block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800 ${
                                  announcementCourseId === course.id ? "bg-sky-100 dark:bg-sky-900/30" : ""
                                }`}
                              >
                                <div className="font-semibold">{course.title}</div>
                                <div className="opacity-70">{course.section?.trim() || "Section not set"}</div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div ref={announcementAudienceMenuRef} className="relative">
                        <button
                          type="button"
                          onClick={() => setIsAudienceMenuOpen((prev) => !prev)}
                          className="inline-flex items-center gap-2 rounded-full border border-slate-500/50 px-5 py-2.5 text-xl font-medium text-sky-700 dark:border-slate-600 dark:text-sky-300"
                        >
                          <Users className="h-5 w-5" />
                          {selectedAudienceSummary}
                          <ChevronDown className="h-5 w-5" />
                        </button>
                        {isAudienceMenuOpen && (
                          <div className="absolute left-0 top-full z-30 mt-2 max-h-72 min-w-[380px] overflow-auto rounded-xl border border-slate-300 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                            <button
                              type="button"
                              onClick={() => setSelectedAudienceStudentIds([])}
                              className={`block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800 ${
                                allStudentsSelected ? "bg-sky-100 dark:bg-sky-900/30" : ""
                              }`}
                            >
                              <div className="font-semibold">All students</div>
                            </button>
                            <div className="my-1 h-px bg-slate-200 dark:bg-slate-700" />
                            {audienceLoading ? (
                              <div className="px-3 py-2 text-sm opacity-70">Loading students...</div>
                            ) : announcementStudents.length === 0 ? (
                              <div className="px-3 py-2 text-sm opacity-70">No students have joined this course yet.</div>
                            ) : (
                              announcementStudents.map((student) => {
                                const selected = selectedAudienceStudentIds.includes(student.id);
                                return (
                                  <button
                                    key={student.id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedAudienceStudentIds((prev) => {
                                        if (prev.includes(student.id)) {
                                          return prev.filter((id) => id !== student.id);
                                        }
                                        return [...prev, student.id];
                                      });
                                    }}
                                    className={`block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800 ${
                                      selected ? "bg-sky-100 dark:bg-sky-900/30" : ""
                                    }`}
                                  >
                                    <div className="font-semibold">{student.name}</div>
                                    <div className="opacity-70">{student.email}</div>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-lg border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800">
                      <div className="relative">
                        {announcementText.trim().length === 0 && (
                          <div className="pointer-events-none absolute left-4 top-3 text-lg text-sky-700/80">
                            Announce something to your class
                          </div>
                        )}
                        <div
                          ref={announcementTextRef}
                          contentEditable
                          suppressContentEditableWarning
                          onInput={(event) => setAnnouncementText((event.currentTarget.innerText || "").trim())}
                          className="h-56 overflow-y-auto rounded-t-lg bg-transparent px-4 py-3 text-lg outline-none"
                        />
                      </div>
                      <div className="border-t border-slate-300 dark:border-slate-700" />
                      <div className="flex items-center gap-5 px-4 py-3 text-slate-600 dark:text-slate-300">
                        <button type="button" onClick={() => applyFormatting("bold")} className="rounded p-1 hover:bg-slate-200 dark:hover:bg-slate-700"><Bold className="h-6 w-6" /></button>
                        <button type="button" onClick={() => applyFormatting("italic")} className="rounded p-1 hover:bg-slate-200 dark:hover:bg-slate-700"><Italic className="h-6 w-6" /></button>
                        <button type="button" onClick={() => applyFormatting("underline")} className="rounded p-1 hover:bg-slate-200 dark:hover:bg-slate-700"><Underline className="h-6 w-6" /></button>
                        <div ref={emojiMenuRef} className="relative">
                          <button type="button" onClick={() => setIsEmojiMenuOpen((prev) => !prev)} className="rounded p-1 hover:bg-slate-200 dark:hover:bg-slate-700"><Smile className="h-6 w-6" /></button>
                          {isEmojiMenuOpen && (
                            <div className="absolute bottom-full left-0 z-30 mb-2 w-72 rounded-xl border border-slate-300 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                              <div className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-70">Select emoji</div>
                              <div className="grid max-h-44 grid-cols-8 gap-1 overflow-y-auto pr-1">
                              {emojiOptions.map((emoji) => (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() => insertEmoji(emoji)}
                                  className="flex h-8 w-8 items-center justify-center rounded text-xl leading-none hover:bg-slate-100 dark:hover:bg-slate-800"
                                >
                                  {emoji}
                                </button>
                              ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            className="rounded-full border border-slate-500/60 p-2.5 text-slate-600 hover:bg-slate-200 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                          >
                            <Image className="h-6 w-6" />
                          </button>
                          <button
                            type="button"
                            className="rounded-full border border-slate-500/60 p-2.5 text-slate-600 hover:bg-slate-200 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                          >
                            <Play className="h-6 w-6" />
                          </button>
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="rounded-full border border-slate-500/60 p-2.5 text-slate-600 hover:bg-slate-200 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                          >
                            <Upload className="h-6 w-6" />
                          </button>
                          <button
                            type="button"
                            className="rounded-full border border-slate-500/60 p-2.5 text-slate-600 hover:bg-slate-200 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                          >
                            <Link2 className="h-6 w-6" />
                          </button>

                          <input
                            ref={fileInputRef}
                            type="file"
                            accept=".pdf,.doc,.docx,.ppt,.pptx,.txt"
                            className="hidden"
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              setSelectedAnnouncementFile(file || null);
                              setAnnouncementUploadFileName(file?.name || "");
                            }}
                          />
                        </div>
                        {announcementUploadFileName && (
                          <p className="text-xs opacity-80">File selected: {announcementUploadFileName}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-5">
                        <button
                          type="button"
                          onClick={() => {
                            resetAnnouncementComposer();
                          }}
                          className="text-2xl font-medium text-sky-700 hover:underline dark:text-sky-300"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={postingAnnouncement || (!announcementText.trim() && !selectedAnnouncementFile)}
                          onClick={() => void postAnnouncement()}
                          className="rounded-full bg-slate-300 px-8 py-2.5 text-2xl font-semibold text-slate-500 disabled:opacity-100 dark:bg-slate-700 dark:text-slate-400"
                        >
                          {postingAnnouncement ? "Posting..." : "Post"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          ) : (
            <GlassCard className="min-h-[78vh] p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-heading text-2xl font-semibold">Teaching classes</h2>
                <ThemeToggle />
              </div>

              {activeCourses.length === 0 ? (
                <p className="text-sm opacity-80">No active classes yet. Create a class from Home to start teaching.</p>
              ) : (
                <div className="grid content-start gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {activeCourses.map((course, index) => (
                    <button
                      key={course.id}
                      type="button"
                      className="group relative flex h-64 flex-col overflow-hidden rounded-3xl border border-white/20 bg-white/30 text-left shadow-lg shadow-slate-900/20 transition duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-slate-900/35"
                      onClick={() => {
                        setActiveTeachingCourseId(course.id);
                        setActiveClassroomTab("stream");
                      }}
                    >
                      <div className={`relative h-36 px-5 py-4 text-white ${index % 2 === 0 ? "bg-gradient-to-br from-blue-500 via-indigo-600 to-blue-900" : "bg-gradient-to-br from-orange-400 via-rose-500 to-fuchsia-700"}`}>
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.25),transparent_50%)]" />
                        <h3 className="relative truncate text-4xl font-bold tracking-tight">{course.title}</h3>
                        <p className="relative mt-1 text-lg opacity-90">{course.section?.trim() || "Section not set"}</p>
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
        ) : activeTeacherMenuItem === "archived" ? (
          <GlassCard className="min-h-[78vh] p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-heading text-2xl font-semibold">Archived classes</h2>
              <ThemeToggle />
            </div>
            {archivedCourses.length === 0 ? (
              <p className="text-sm opacity-80">No archived classes yet.</p>
            ) : (
              <div className="grid content-start gap-5 md:grid-cols-2 xl:grid-cols-3">
                {archivedCourses.map((course, index) => (
                  <div
                    key={course.id}
                    className="group relative flex h-64 cursor-pointer flex-col overflow-visible rounded-3xl border border-white/20 bg-white/30 shadow-lg shadow-slate-900/20 transition duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-slate-900/35"
                    onClick={() => {
                      setActiveTeachingCourseId(course.id);
                      setActiveTeacherMenuItem("teaching");
                      setActiveClassroomTab("stream");
                    }}
                  >
                    <div className={`relative h-36 px-5 py-4 text-white ${index % 2 === 0 ? "bg-gradient-to-br from-blue-500 via-indigo-600 to-blue-900" : "bg-gradient-to-br from-orange-400 via-rose-500 to-fuchsia-700"}`}>
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.25),transparent_50%)]" />
                      <h3 className="relative truncate text-4xl font-bold tracking-tight">{course.title}</h3>
                      <p className="relative mt-1 text-lg opacity-90">{course.section?.trim() || "Section not set"}</p>
                    </div>
                    <div className="flex flex-1 items-end justify-between px-5 py-4">
                      <div>
                        <p className="text-xs uppercase tracking-wider opacity-70">Course code</p>
                        <p className="text-base font-semibold opacity-90">{course.course_code}</p>
                      </div>
                      <div data-archived-menu-root="true" className="relative z-20">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setArchivedCardMenuCourseId((prev) => (prev === course.id ? null : course.id));
                          }}
                          className="rounded-full border border-white/25 bg-white/70 p-2 text-slate-700 hover:bg-white dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-100 dark:hover:bg-slate-700"
                          aria-label="Archived class actions"
                        >
                          <EllipsisVertical className="h-5 w-5 opacity-80" />
                        </button>
                        {archivedCardMenuCourseId === course.id && (
                          <div className="absolute right-0 top-12 z-[220] min-w-[220px] overflow-hidden rounded-2xl border border-slate-300/90 bg-white text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setArchivedCardMenuCourseId(null);
                                setPendingCourseAction({ kind: "restore", course });
                              }}
                              className="block w-full px-4 py-3 text-left text-sm font-medium hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                            >
                              Restore
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setArchivedCardMenuCourseId(null);
                                setPendingCourseAction({ kind: "delete", course });
                              }}
                              className="block w-full px-4 py-3 text-left text-sm font-medium text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-900/20"
                            >
                              Delete permanently
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        ) : activeTeacherMenuItem !== "home" ? (
          <GlassCard className="p-6">
            <h2 className="font-heading text-2xl font-semibold">{activeTeacherMenuItem.charAt(0).toUpperCase() + activeTeacherMenuItem.slice(1)}</h2>
            <p className="mt-2 text-sm opacity-80">
              This section is selected from the left menu. Click Home to view the full Teacher Command Center content.
            </p>
          </GlassCard>
        ) : (
          <>
        <div className="flex items-center justify-between">
          <h1 className="font-heading text-3xl font-bold">Teacher Command Center</h1>
          <ThemeToggle />
        </div>

        <div className="grid gap-4 lg:grid-cols-1">
          <GlassCard className="p-5">
            <h2 className="font-heading text-xl">Create Course</h2>
            <form onSubmit={createCourse} className="mt-4 space-y-3">
              <input className="w-full rounded-lg border border-white/20 bg-white/30 p-3" placeholder="Course title" value={courseTitle} onChange={(e) => setCourseTitle(e.target.value)} />
              <input className="w-full rounded-lg border border-white/20 bg-white/30 p-3 uppercase" placeholder="Course code e.g. CS111" value={courseCode} onChange={(e) => setCourseCode(e.target.value.toUpperCase())} />
              <input className="w-full rounded-lg border border-white/20 bg-white/30 p-3" placeholder="Section" value={courseSection} onChange={(e) => setCourseSection(e.target.value)} />
              <textarea className="w-full rounded-lg border border-white/20 bg-white/30 p-3" placeholder="Description" value={courseDescription} onChange={(e) => setCourseDescription(e.target.value)} />
              <button className="rounded-lg bg-teal-500 px-4 py-2 text-white">Create</button>
              {courseMessage && <p className="text-sm opacity-85">{courseMessage}</p>}
            </form>
          </GlassCard>
        </div>

        <GlassCard className="p-5">
          <h2 className="font-heading text-xl">Teacher AI Chatbot</h2>
          <p className="mt-1 text-sm opacity-75">Direct LLM chat powered by Ollama (llama3.1:latest).</p>
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
          </>
        )}

        {pendingCourseAction && (
          <div className="fixed inset-0 z-[180] flex items-center justify-center bg-black/45 px-4" onClick={() => setPendingCourseAction(null)}>
            <div
              className="w-full max-w-lg rounded-2xl border border-white/20 bg-slate-100 p-6 text-slate-900 shadow-2xl dark:bg-slate-900 dark:text-slate-100"
              onClick={(event) => event.stopPropagation()}
            >
              <h3 className="text-xl font-semibold">
                {pendingCourseAction.kind === "archive" && "Are you sure to archive the class?"}
                {pendingCourseAction.kind === "restore" && "Are you sure to restore this class?"}
                {pendingCourseAction.kind === "delete" && "Are you sure to delete this class permanently?"}
              </h3>
              <p className="mt-2 text-sm opacity-80">
                {pendingCourseAction.course.title} ({pendingCourseAction.course.course_code})
              </p>
              <p className="mt-1 text-xs opacity-70">
                Click Yes to continue. Click No to keep the class in the archive bin.
              </p>
              <div className="mt-5 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setPendingCourseAction(null)}
                  className="rounded-lg border border-slate-400 px-4 py-2 text-sm dark:border-slate-600"
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={() => void executePendingCourseAction()}
                  className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white"
                >
                  Yes
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
