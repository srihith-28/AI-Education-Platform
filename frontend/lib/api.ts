"use client";

import { authStorage } from "@/lib/auth";


const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "/api/v1";
const REQUEST_TIMEOUT_MS = 60000;


const withToggledLoopbackHost = (baseUrl: string): string | null => {
  try {
    const parsed = new URL(baseUrl);
    if (parsed.hostname === "127.0.0.1") {
      parsed.hostname = "localhost";
      return parsed.toString().replace(/\/$/, "");
    }
    if (parsed.hostname === "localhost") {
      parsed.hostname = "127.0.0.1";
      return parsed.toString().replace(/\/$/, "");
    }
    return null;
  } catch {
    return null;
  }
};


const API_BASE_FALLBACK = withToggledLoopbackHost(API_BASE);


type RequestOptions = RequestInit & {
  timeoutMs?: number;
};


async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = await authStorage.getToken();
  const controller = new AbortController();
  const timeoutMs = typeof options.timeoutMs === "number" && options.timeoutMs > 0 ? options.timeoutMs : REQUEST_TIMEOUT_MS;
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  const { timeoutMs: _timeoutMs, ...fetchOptions } = options;

  const executeFetch = async (baseUrl: string): Promise<T> => {
    const response = await fetch(`${baseUrl}${path}`, {
      ...fetchOptions,
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status === 401 && typeof window !== "undefined") {
        window.location.href = "/login?expired=true";
      }
      const text = await response.text();
      throw new Error(text || "Request failed");
    }

    return response.json() as Promise<T>;
  };

  try {
    try {
      return await executeFetch(API_BASE);
    } catch (error) {
      const isNetworkFailure = error instanceof TypeError || (error instanceof Error && error.message === "Failed to fetch");
      if (isNetworkFailure && API_BASE_FALLBACK) {
        return await executeFetch(API_BASE_FALLBACK);
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Request timed out. Please try again.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export const api = {
  /** Sync user profile with backend after Supabase signup */
  syncUser: (payload: { name: string; role: "teacher" | "student" }) =>
    request<{ success: boolean; data: { id: number; name: string; email: string; role: string } }>("/auth/sync", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  me: () => request<{ success: boolean; data: { id: number; name: string; email: string; role: "teacher" | "student" } }>("/auth/me"),
  ask: (payload: { course_id: number; question: string; session_id: string }) =>
    request<{ data: { answer: string } }>("/student/ask", {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: 45000
    }),
  chatSessions: () =>
    request<{ data: Array<{ session_id: string; preview: string; updated_at: string | null; custom_title: string | null; is_pinned: boolean; is_archived: boolean; pinned_at: string | null; archived_at: string | null }> }>("/student/chat/sessions"),
  chatSessionMessages: (sessionId: string) =>
    request<{ data: Array<{ id: number; role: "user" | "assistant"; content: string; created_at: string }> }>(`/student/chat/sessions/${sessionId}`),
  renameSession: (sessionId: string, customTitle: string) =>
    request<{ success: boolean }>(`/student/chat/sessions/${sessionId}/rename`, {
      method: "POST",
      body: JSON.stringify({ custom_title: customTitle })
    }),
  togglePinSession: (sessionId: string) =>
    request<{ success: boolean; data: { is_pinned: boolean } }>(`/student/chat/sessions/${sessionId}/pin`, {
      method: "POST",
      body: JSON.stringify({})
    }),
  toggleArchiveSession: (sessionId: string) =>
    request<{ success: boolean; data: { is_archived: boolean } }>(`/student/chat/sessions/${sessionId}/archive`, {
      method: "POST",
      body: JSON.stringify({})
    }),
  deleteSession: (sessionId: string) =>
    request<{ success: boolean }>(`/student/chat/sessions/${sessionId}`, {
      method: "DELETE"
    }),
  courses: () =>
    request<{ data: Array<{ id: number; title: string; course_code: string; description: string }> }>("/student/courses"),
  teacherCourses: () =>
    request<{ data: Array<{ id: number; title: string; course_code: string; class_code: string; section: string; description: string; is_archived: boolean }> }>("/teacher/courses"),
  enrolledCourses: () =>
    request<{ data: Array<{ id: number; title: string; course_code: string; class_code: string; section: string; description: string; is_archived: boolean }> }>("/student/enrolled-courses"),
  joinCourse: (classCode: string) =>
    request<{ success: boolean; message: string; data: { course_id: number; course_code: string; class_code: string; title: string; section: string } }>("/student/join-course", {
      method: "POST",
      body: JSON.stringify({ class_code: classCode })
    }),
  archiveStudentCourse: (courseCode: string) =>
    request<{ success: boolean; message: string }>(`/student/courses/${courseCode}/archive`, {
      method: "POST",
      body: JSON.stringify({})
    }),
  restoreStudentCourse: (courseCode: string) =>
    request<{ success: boolean; message: string }>(`/student/courses/${courseCode}/restore`, {
      method: "POST",
      body: JSON.stringify({})
    }),
  studentCourseAnnouncements: (courseCode: string) =>
    request<{ data: Array<{ id: number; course_id: number; message: string; created_at: string; author: { id: number; name: string; role: string }; attachment?: { file_name?: string | null; content_type?: string | null; download_url?: string | null }; audience_student_ids: number[]; comments: Array<{ id: number; content: string; created_at: string; author: { id: number; name: string; role: string } }> }> }>(`/student/courses/${courseCode}/announcements`),
  studentCourseComment: (courseCode: string, announcementId: number, content: string) =>
    request<{ success: boolean; data: { id: number; content: string; created_at: string; author: { id: number; name: string; role: string } } }>(`/student/courses/${courseCode}/announcements/${announcementId}/comments`, {
      method: "POST",
      body: JSON.stringify({ content })
    }),
  studentCourseMaterials: (courseCode: string) =>
    request<{ data: Array<{ id: number; file_name: string; content_type: string | null; uploaded_at: string }> }>(`/student/courses/${courseCode}/materials`),
  studentCoursePeople: (courseCode: string) =>
    request<{ data: { teacher: { id: number; name: string; email: string } | null; students: Array<{ id: number; name: string; email: string }> } }>(`/student/courses/${courseCode}/people`),
  coursePeople: (courseId: number) =>
    request<{ data: { teachers: Array<{ id: number; name: string; email: string }>; students: Array<{ id: number; name: string; email: string }> } }>(`/course/${courseId}/people`),
  addUserToCourse: (courseId: number, payload: { email: string; role: "teacher" | "student" }) =>
    request<{ success: boolean; message: string; data: { id: number; name: string; email: string; role: "teacher" | "student" } }>(`/course/${courseId}/add-user`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  removeUserFromCourse: (courseId: number, userId: number) =>
    request<{ success: boolean; message: string }>(`/course/${courseId}/remove-user/${userId}`, {
      method: "DELETE"
    }),
  studentCoursePeopleById: (courseId: number) =>
    request<{ data: { teachers: Array<{ id: number; name: string; email: string; is_main?: boolean }>; students: Array<{ id: number; name: string; email: string }> } }>(`/course/${courseId}/people`),
    calendarEvents: (startDate: string, endDate: string, courseId?: number | null) => {
      const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
      if (courseId) {
        params.set("course_id", String(courseId));
      }
      return request<{ data: Array<{ id: string; title: string; description: string; course_id: number; course_code: string; course_title: string; type: "assignment" | "quiz" | "announcement"; due_date: string; due_time: string | null; created_at: string }> }>(`/calendar/events?${params.toString()}`);
    },
    createCalendarEvent: (payload: { title: string; description?: string; course_id: number; type: "assignment" | "quiz" | "announcement"; due_date: string; due_time?: string | null }) =>
      request<{ success: boolean; data: { id: string } }>("/calendar/events", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    classworkTopics: (courseId: number) =>
      request<{ data: Array<{ id: number; course_id: number; title: string; order_index: number }> }>(`/classwork/topics/${courseId}`),
    classworkByCourse: (courseId: number, topicId?: number | null) => {
      const params = new URLSearchParams();
      if (topicId) {
        params.set("topic_id", String(topicId));
      }
      const query = params.toString();
      return request<{ data: Array<{ topic: { id: number; title: string; order_index: number } | null; items: Array<{ id: string; course_id: number; topic_id: number | null; type: "assignment" | "material" | "quiz"; title: string; description: string; due_date: string | null; created_at: string; status: "assigned" | "turned_in" | "missing" | "late" }> }> }>(`/classwork/${courseId}${query ? `?${query}` : ""}`);
    },
    teacherClasswork: (courseId: number, topicId?: number | null) => {
      const params = new URLSearchParams();
      if (topicId) {
        params.set("topic_id", String(topicId));
      }
      const query = params.toString();
      return request<{ data: Array<{ topic: { id: number; title: string; order_index: number } | null; items: Array<{ id: string; course_id: number; topic_id: number | null; topic: { id: number; title: string; order_index: number } | null; type: "assignment" | "material" | "quiz" | "question"; title: string; description: string; points: number; due_date: string | null; scheduled_for: string | null; status: "published" | "scheduled" | "draft"; attachments: Array<{ id: string; source: string; name: string; url?: string | null; mimeType?: string | null; sizeBytes?: number | null }>; quiz_questions: Array<{ id: string; type: string; question: string; options: string[]; correctAnswer: string }>; created_at: string; submission_status?: "assigned" | "turned_in" | "missing" | "late"; submitted_at?: string | null }> }> }>(`/classwork/${courseId}${query ? `?${query}` : ""}`);
    },
    createTeacherClasswork: (courseId: number, payload: {
      title: string;
      description: string;
      type: "assignment" | "material" | "quiz" | "question";
      points: number;
      dueDate: string | null;
      dueTime?: string | null;
      topic: string;
      attachments: Array<{ id: string; source: string; name: string; url?: string; mimeType?: string; sizeBytes?: number }>;
      quizQuestions: Array<{ id: string; type: string; question: string; options: string[]; correctAnswer: string }>;
      action: "assign" | "schedule" | "draft";
      scheduledFor: string | null;
    }) =>
      request<{ success: boolean; data: { id: string; course_id: number; topic_id: number | null; topic: { id: number; title: string; order_index: number } | null; type: string; title: string; description: string; points: number; due_date: string | null; scheduled_for: string | null; status: string; attachments: Array<{ id: string; source: string; name: string; url?: string | null; mimeType?: string | null; sizeBytes?: number | null }>; quiz_questions: Array<{ id: string; type: string; question: string; options: string[]; correctAnswer: string }>; created_at: string } }>(`/classwork/${courseId}`, {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    updateClassworkPoints: (classworkId: string, points: number) =>
      request<{ success: boolean; message: string; data: { id: string; course_id: number; topic: { id: number; title: string } | null; type: "assignment" | "material" | "quiz"; title: string; description: string; points: number; due_date: string | null; created_at: string; status: "published" | "scheduled" | "draft"; attachments: Array<{ id: string; source: string; name: string; url?: string | null; mimeType?: string | null; sizeBytes?: number | null }>; quiz_questions: Array<{ id: string; type: string; question: string; options: string[]; correctAnswer: string }>; submitted_at: string | null; submission_content: string } }>(`/classwork/${classworkId}/points`, {
        method: "PUT",
        body: JSON.stringify({ points }),
      }),
    deleteTeacherClasswork: (classworkId: string) =>
      request<{ success: boolean; message: string }>(`/classwork/${classworkId}`, {
        method: "DELETE"
      }),
    classworkItem: (classworkId: string) =>
      request<{ data: { id: string; course_id: number; topic: { id: number; title: string } | null; type: "assignment" | "material" | "quiz"; title: string; description: string; points: number; due_date: string | null; created_at: string; status: "assigned" | "turned_in" | "missing" | "late"; submitted_at: string | null; attachments: Array<{ id: string; source: string; name: string; url?: string | null; mimeType?: string | null; sizeBytes?: number | null }>; quiz_questions: Array<{ id: string; type: "mcq" | "short"; question: string; options: string[]; correctAnswer: string }>; submission_content: string } }>(`/classwork/item/${classworkId}`),
    studentSubmissions: (studentId: number, courseId?: number | null) => {
      const params = new URLSearchParams();
      if (courseId) {
        params.set("course_id", String(courseId));
      }
      const query = params.toString();
      return request<{ data: Array<{ id: number; classwork_id: string; course_id: number; status: "assigned" | "turned_in" | "missing" | "late"; submitted_at: string | null }> }>(`/classwork/submissions/${studentId}${query ? `?${query}` : ""}`);
    },
    submitClasswork: (classworkId: string, content: string = "") =>
      request<{ success: boolean; data: { status: "turned_in" | "late"; submitted_at: string | null } }>(`/classwork/${classworkId}/submit`, {
        method: "POST",
        body: JSON.stringify({ status: "turned_in", content })
      }),
    classworkSections: (courseId: number) =>
      request<{ success: boolean; data: Array<{ id: number; course_id: number; name: string; percentage: number; created_at: string; updated_at: string }> }>(`/classwork/sections/${courseId}`),
    createClassworkSection: (courseId: number, payload: { name: string; percentage: number }) =>
      request<{ success: boolean; data: { id: number; course_id: number; name: string; percentage: number; created_at: string; updated_at: string } }>(`/classwork/sections/${courseId}`, {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    updateClassworkSection: (sectionId: number, payload: { name: string; percentage: number }) =>
      request<{ success: boolean; data: { id: number; course_id: number; name: string; percentage: number; created_at: string; updated_at: string } }>(`/classwork/sections/${sectionId}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      }),
    deleteClassworkSection: (sectionId: number) =>
      request<{ success: boolean; message: string }>(`/classwork/sections/${sectionId}`, {
        method: "DELETE"
      }),
  teacherCoursePeople: (courseId: number) =>
    request<{ data: { teachers: Array<{ id: number; name: string; email: string }>; students: Array<{ id: number; name: string; email: string }> } }>(`/course/${courseId}/people`),
  courseGrades: (courseId: number) =>
    request<{
      success: boolean;
      students: Array<{ id: number; name: string; email?: string }>;
      assignments: Array<{ id: string; title: string; max_marks: number; classwork_section_id: number | null }>;
      sections: Array<{
        id: number;
        name: string;
        percentage: number;
        manual_max_points: number | null;
        assignments: Array<{ id: string; title: string; max_marks: number; classwork_section_id: number | null }>;
      }>;
      grades: Array<{ student_id: number; assignment_id: string; marks: number; earned_marks?: number; max_marks?: number; percentage?: number }>;
      manual_section_grades: Array<{ student_id: number; section_id: number; marks: number }>;
      submissions: Array<{
        student_id: number;
        assignment_id: string;
        status: "submitted" | "missing" | "late";
        content: string;
        ai_marks: number | null;
        ai_feedback: string;
        final_marks: number | null;
        graded_by: "ai" | "teacher" | null;
        graded_at: string | null;
      }>;
    }>(`/grades/${courseId}`),
  updateCourseGrade: (payload: { student_id: number; assignment_id: string; earned_marks: number; max_marks: number }) =>
    request<{ success: boolean; message: string; data: { student_id: number; assignment_id: string; marks: number; earned_marks: number; max_marks: number; percentage: number; graded_by: "teacher" } }>("/grades/update", {
      method: "POST",
      // Include legacy `marks` for compatibility with stale backend workers.
      body: JSON.stringify({ ...payload, marks: payload.earned_marks }),
    }),
  updateSectionGrade: (payload: { student_id: number; section_id: number; marks: number }) =>
    request<{ success: boolean; message: string; data: { student_id: number; section_id: number; marks: number } }>("/grades/update-section-grade", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateSectionMax: (payload: { section_id: number; max_points: number }) =>
    request<{ success: boolean; message: string; data: { section_id: number; max_points: number } }>("/grades/update-section-max", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  autoGradeAssignment: (assignmentId: string, overrideTeacherEdited: boolean = false) =>
    request<{ success: boolean; message: string; data: { graded_count: number; skipped_count: number; error_count: number } }>(`/grades/auto-grade/${assignmentId}`, {
      method: "POST",
      body: JSON.stringify({ override_teacher_edited: overrideTeacherEdited }),
      timeoutMs: 180000,
    }),
  courseLeaderboard: (courseId: number) =>
    request<{
      success: boolean;
      message: string;
      students: Array<{ id: number; name: string; email?: string }>;
      sections: Array<{
        id: number;
        name: string;
        percentage: number;
        manual_max_points: number | null;
        assignments: Array<{ id: string; title: string; max_marks: number; classwork_section_id: number | null }>;
      }>;
      grades: Array<{ student_id: number; assignment_id: string; marks: number }>;
      manual_section_grades: Array<{ student_id: number; section_id: number; marks: number }>;
    }>(`/grades/leaderboard/${courseId}`),
  leaderboard: () => request<{ data: Array<{ name: string; rank_score: number; completion_percentage: number; quiz_score: number }> }>("/student/leaderboard"),
  progress: () => request<{ data: { completion_percentage: number; completed_tasks: number; pending_tasks: number } }>("/student/progress/summary"),
  
  // Teacher session APIs
  teacherSessions: () =>
    request<{ data: Array<{ session_id: string; preview: string; updated_at: string | null; custom_title: string | null; is_pinned: boolean; is_archived: boolean; pinned_at: string | null; archived_at: string | null }> }>("/agents/teacher-assistant/sessions"),
  teacherSessionMessages: (sessionId: string) =>
    request<{ data: Array<{ id: number; role: "user" | "assistant"; content: string; created_at: string }> }>(`/agents/teacher-assistant/sessions/${sessionId}`),
  deleteTeacherSession: (sessionId: string) =>
    request<{ success: boolean }>(`/agents/teacher-assistant/sessions/${sessionId}`, {
      method: "DELETE"
    }),
  renameTeacherSession: (sessionId: string, customTitle: string) =>
    request<{ success: boolean }>(`/agents/teacher-assistant/sessions/${sessionId}/rename`, {
      method: "POST",
      body: JSON.stringify({ custom_title: customTitle })
    }),
  togglePinTeacherSession: (sessionId: string) =>
    request<{ success: boolean; data: { is_pinned: boolean } }>(`/agents/teacher-assistant/sessions/${sessionId}/pin`, {
      method: "POST",
      body: JSON.stringify({})
    }),
  toggleArchiveTeacherSession: (sessionId: string) =>
    request<{ success: boolean; data: { is_archived: boolean } }>(`/agents/teacher-assistant/sessions/${sessionId}/archive`, {
      method: "POST",
      body: JSON.stringify({})
    })
};
