"use client";

import { Copy } from "lucide-react";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";

import { InviteModal } from "./InviteModal";
import { PeopleList } from "./PeopleList";

type TeacherRow = { id: number; name: string; email: string; is_main?: boolean };
type StudentRow = { id: number; name: string; email: string };

type TeacherPeoplePageProps = {
  courseId: number;
  classCode: string;
};

const getErrorText = (error: unknown): string => {
  if (!(error instanceof Error)) {
    return "Request failed";
  }
  try {
    const parsed = JSON.parse(error.message);
    return parsed?.detail || parsed?.message || error.message;
  } catch {
    return error.message;
  }
};

export function TeacherPeoplePage({ courseId, classCode }: TeacherPeoplePageProps) {
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteRole, setInviteRole] = useState<"teacher" | "student">("student");

  const loadPeople = async () => {
    try {
      setLoading(true);
      setError("");
      const response = await api.coursePeople(courseId);
      setTeachers(response.data.teachers || []);
      setStudents(response.data.students || []);
    } catch (err) {
      setError(getErrorText(err));
      setTeachers([]);
      setStudents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPeople();
  }, [courseId]);

  const openInviteModal = (role: "teacher" | "student") => {
    setInviteRole(role);
    setInviteModalOpen(true);
  };

  const submitInvite = async (email: string, role: "teacher" | "student") => {
    try {
      setSubmitting(true);
      setError("");
      setMessage("");

      const response = await api.addUserToCourse(courseId, { email, role });

      setMessage(response.message || "Updated successfully");
      setInviteModalOpen(false);
      await loadPeople();
    } catch (err) {
      setError(getErrorText(err));
    } finally {
      setSubmitting(false);
    }
  };

  const removePerson = async (role: "teacher" | "student", userId: number) => {
    try {
      setError("");
      setMessage("");
      const response = await api.removeUserFromCourse(courseId, userId);
      setMessage(response.message || "Removed successfully");
      await loadPeople();
    } catch (err) {
      setError(getErrorText(err));
    }
  };

  const copyClassCode = async () => {
    if (!classCode) {
      return;
    }
    try {
      await navigator.clipboard.writeText(classCode);
      setMessage("Class code copied");
    } catch {
      setMessage(`Class code: ${classCode}`);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200/80 bg-white/75 p-4 backdrop-blur dark:border-slate-700 dark:bg-slate-900/55">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-heading text-2xl font-semibold">Invite System</h3>
            <p className="mt-1 text-sm opacity-75">Invite by email, or share your class code.</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-300/80 bg-white/80 px-4 py-2 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900/70">
            <span>Course code:</span>
            <span className="tracking-widest">{classCode || "-"}</span>
            <button type="button" onClick={() => void copyClassCode()} className="rounded-full p-1 hover:bg-white dark:hover:bg-slate-800">
              <Copy className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {error ? <p className="rounded-xl border border-rose-400/40 bg-rose-100/70 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">{error}</p> : null}
      {message ? <p className="rounded-xl border border-sky-400/40 bg-sky-100/80 px-3 py-2 text-sm text-sky-700 dark:bg-sky-500/10 dark:text-sky-200">{message}</p> : null}

      {loading ? (
        <div className="rounded-2xl border border-slate-200/80 bg-white/75 p-6 text-sm dark:border-slate-700 dark:bg-slate-900/55">Loading people...</div>
      ) : (
        <>
          <PeopleList
            title="Teachers"
            rows={teachers}
            emptyMessage="No teachers found for this class."
            onAdd={() => openInviteModal("teacher")}
            onRemove={(person) => void removePerson("teacher", person.id)}
          />

          <PeopleList
            title="Students"
            rows={students}
            emptyMessage="No students enrolled in this class yet."
            onAdd={() => openInviteModal("student")}
            onRemove={(person) => void removePerson("student", person.id)}
          />
        </>
      )}

      <InviteModal
        open={inviteModalOpen}
        role={inviteRole}
        loading={submitting}
        onClose={() => setInviteModalOpen(false)}
        onSubmit={submitInvite}
      />
    </div>
  );
}
