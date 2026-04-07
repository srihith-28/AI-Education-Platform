"use client";

import { authStorage } from "@/lib/auth";


const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api/v1";


async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = authStorage.getToken();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Request failed");
  }

  return response.json() as Promise<T>;
}

export const api = {
  signup: (payload: { name: string; email: string; password: string; role: "teacher" | "student" }) =>
    request<{ access_token: string; role: "teacher" | "student" }>("/auth/signup", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  login: (payload: { email: string; password: string }) =>
    request<{ access_token: string; role: "teacher" | "student" }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  me: () => request<{ id: number; name: string; email: string; role: "teacher" | "student" }>("/users/me"),
  ask: (payload: { course_id: number; question: string; session_id: string }) =>
    request<{ data: { answer: string } }>("/student/ask", {
      method: "POST",
      body: JSON.stringify(payload)
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
