"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api";

import { PeopleList } from "./PeopleList";

type TeacherRow = { id: number; name: string; email: string; is_main?: boolean };
type StudentRow = { id: number; name: string; email: string };

type StudentPeoplePageProps = {
  courseId: number;
};

const getErrorText = (error: unknown): string => {
  if (!(error instanceof Error)) {
    return "Could not fetch people.";
  }
  try {
    const parsed = JSON.parse(error.message);
    return parsed?.detail || parsed?.message || error.message;
  } catch {
    return error.message;
  }
};

export function StudentPeoplePage({ courseId }: StudentPeoplePageProps) {
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const loadPeople = async () => {
      try {
        setLoading(true);
        setError("");
        const response = await api.coursePeople(courseId);
        if (!active) {
          return;
        }
        setTeachers(response.data.teachers || []);
        setStudents(response.data.students || []);
      } catch (err) {
        if (!active) {
          return;
        }
        setTeachers([]);
        setStudents([]);
        setError(getErrorText(err));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadPeople();

    return () => {
      active = false;
    };
  }, [courseId]);

  return (
    <div className="space-y-4">
      {loading ? <div className="rounded-2xl border border-slate-200/80 bg-white/75 p-6 text-sm dark:border-slate-700 dark:bg-slate-900/55">Loading people...</div> : null}
      {error ? <p className="rounded-xl border border-rose-400/40 bg-rose-100/70 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">{error}</p> : null}

      <PeopleList
        title="Teachers"
        rows={teachers}
        emptyMessage="No teachers found for this class."
        readOnly
      />

      <PeopleList
        title="Classmates"
        rows={students}
        emptyMessage="No classmates enrolled yet."
        readOnly
      />
    </div>
  );
}
