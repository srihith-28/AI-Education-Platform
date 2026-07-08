"use client";

import { useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api";
import type { AssignmentRecord, AssignmentType, CreateAssignmentPayload } from "@/lib/classwork/types";

import { AssignmentModal } from "./AssignmentModal";
import { CreateMenu } from "./CreateMenu";
import { ClassworkSectionManager } from "./ClassworkSectionManager";
import { ClassworkTableView } from "./ClassworkTableView";

const tabs = ["stream", "classwork", "people", "grades"] as const;
type TabId = (typeof tabs)[number];

type ClassworkPageProps = {
  embedded?: boolean;
  courseId?: number | null;
};

type TeacherCourseRow = {
  id: number;
  title: string;
  course_code: string;
  section: string;
  is_archived: boolean;
};

type ClassworkSection = {
  id: number;
  course_id: number;
  name: string;
  percentage: number;
  created_at: string;
  updated_at: string;
};

type BackendClassworkGroup = {
  topic: { id: number; title: string; order_index: number } | null;
  items: Array<{
    id: string;
    course_id: number;
    topic_id: number | null;
    classwork_section_id?: number | null;
    topic: { id: number; title: string; order_index: number } | null;
    type: AssignmentType;
    title: string;
    description: string;
    points: number;
    due_date: string | null;
    scheduled_for: string | null;
    status: "published" | "scheduled" | "draft";
    attachments: Array<{ id: string; source: string; name: string; url?: string | null; mimeType?: string | null; sizeBytes?: number | null }>;
    quiz_questions: Array<{ id: string; type: string; question: string; options: string[]; correctAnswer: string }>;
    created_at: string;
  }>;
};

const flattenBackendGroups = (groups: BackendClassworkGroup[]): AssignmentRecord[] => {
  const flattened: AssignmentRecord[] = [];

  groups.forEach((group) => {
    group.items.forEach((item) => {
      flattened.push({
        id: item.id,
        title: item.title,
        description: item.description,
        type: item.type,
        points: item.points,
        dueDate: item.due_date,
        topic: group.topic?.title || item.topic?.title || "No topic",
        classwork_section_id: item.classwork_section_id,
        attachments: item.attachments as AssignmentRecord["attachments"],
        quizQuestions: item.quiz_questions as AssignmentRecord["quizQuestions"],
        createdAt: item.created_at,
        className: String(item.course_id),
        status: item.status,
        scheduledFor: item.scheduled_for,
        updatedAt: item.created_at,
      });
    });
  });

  return flattened;
};

export function ClassworkPage({ embedded = false, courseId = null }: ClassworkPageProps) {
  const [activeTab, setActiveTab] = useState<TabId>("classwork");
  const [availableCourses, setAvailableCourses] = useState<TeacherCourseRow[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(courseId);
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null);
  const [assignments, setAssignments] = useState<AssignmentRecord[]>([]);
  const [sections, setSections] = useState<ClassworkSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSections, setLoadingSections] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<AssignmentType>("assignment");
  const [feedback, setFeedback] = useState("");

  const currentCourse = useMemo(
    () => availableCourses.find((course) => course.id === selectedCourseId) || null,
    [availableCourses, selectedCourseId],
  );

  const classOptions = useMemo(() => {
    if (currentCourse) {
      return [currentCourse.course_code];
    }
    return availableCourses.map((course) => course.course_code);
  }, [availableCourses, currentCourse]);

  const topics = useMemo(
    () => Array.from(new Set(assignments.map((assignment) => assignment.topic).filter(Boolean))),
    [assignments],
  );

  const loadAssignments = async () => {
    if (!selectedCourseId) {
      setAssignments([]);
      setFeedback("Select a class to view classwork.");
      return;
    }

    setLoading(true);
    setFeedback("");
    try {
      const response = await api.teacherClasswork(selectedCourseId);
      if (!Array.isArray(response.data)) {
        setFeedback("Failed to fetch assignments");
        return;
      }
      setAssignments(flattenBackendGroups(response.data));
    } catch (e: any) {
      setFeedback(`Could not connect to classwork API: ${e.message || String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const loadSections = async () => {
    if (!selectedCourseId) {
      setSections([]);
      return;
    }

    setLoadingSections(true);
    try {
      const response = await api.classworkSections(selectedCourseId);
      if (response.data) {
        setSections(response.data);
      }
    } catch {
      setSections([]);
    } finally {
      setLoadingSections(false);
    }
  };

  const createAssignment = async (payload: CreateAssignmentPayload) => {
    if (!selectedCourseId) {
      setFeedback("Select a class before creating classwork.");
      return;
    }

    setSaving(true);
    setFeedback("");
    try {
      const response = await api.createTeacherClasswork(selectedCourseId, {
        ...payload,
        dueTime: null,
      });

      if (!response || !response.data) {
        setFeedback("Could not create assignment");
        return;
      }

      setModalOpen(false);
      await loadAssignments();
      setFeedback("Assignment saved successfully");
    } catch {
      setFeedback("Could not connect to classwork API");
    } finally {
      setSaving(false);
    }
  };

  const deleteAssignment = async (assignmentId: string) => {
    setFeedback("");
    try {
      await api.deleteTeacherClasswork(assignmentId);
      await loadAssignments();
      setFeedback("Classwork deleted successfully");
    } catch {
      setFeedback("Could not delete classwork");
    }
  };

  useEffect(() => {
    let active = true;

    const loadCourses = async () => {
      try {
        const response = await api.teacherCourses();
        if (!active) {
          return;
        }
        setAvailableCourses(response.data.filter((course) => !course.is_archived));
        if (!selectedCourseId) {
          setSelectedCourseId(courseId || response.data.find((course) => !course.is_archived)?.id || null);
        }
      } catch {
        if (!active) {
          return;
        }
        setAvailableCourses([]);
      }
    };

    void loadCourses();

    return () => {
      active = false;
    };
  }, [courseId]);

  useEffect(() => {
    void loadAssignments();
    void loadSections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCourseId]);

  useEffect(() => {
    if (courseId && courseId !== selectedCourseId) {
      setSelectedCourseId(courseId);
    }
  }, [courseId, selectedCourseId]);

  return (
    <div className={embedded ? "" : "min-h-screen bg-gradient-to-b from-slate-100 via-slate-50 to-white p-4 sm:p-6"}>
      <div className="mx-auto w-full max-w-6xl space-y-5">
        {/* Show classwork layout only when on classwork tab or embedded */}
        {activeTab === "classwork" || embedded ? (
          <>
            {/* Header with tabs and course selector */}
            {!embedded ? (
              <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-6">
                  {tabs.map((tab) => {
                    const active = tab === activeTab;
                    return (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setActiveTab(tab)}
                        className={`relative pb-2 text-sm font-semibold capitalize transition ${
                          active ? "text-sky-700" : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        {tab}
                        {active ? <span className="absolute -bottom-0 left-0 h-0.5 w-full rounded bg-sky-600" /> : null}
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {/* Box 1: Classwork Section Manager */}
            <ClassworkSectionManager
              courseId={selectedCourseId}
              sections={sections}
              onUpdate={loadSections}
              loading={loadingSections}
            />

            {/* Header for embedded - Classwork selector */}
            {embedded ? (
              <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-lg font-semibold text-slate-800">Classwork</h2>
                    <select
                      value={selectedSectionId ?? ""}
                      onChange={(event) => setSelectedSectionId(event.target.value ? Number(event.target.value) : null)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    >
                      <option value="">All Sections</option>
                      {sections.map((section) => (
                        <option key={section.id} value={section.id}>
                          {section.name} ({section.percentage}%)
                        </option>
                      ))}
                    </select>
                  </div>
                  <CreateMenu
                    onSelect={(type) => {
                      setSelectedType(type);
                      setModalOpen(true);
                    }}
                  />
                </div>
              </section>
            ) : null}

            {/* Box 2: Classwork Table View */}
            <ClassworkTableView
              sections={sections}
              assignments={assignments}
              loading={loading}
              onDelete={deleteAssignment}
            />

            {feedback ? (
              <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm">{feedback}</p>
            ) : null}
          </>
        ) : (
          <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
            <h3 className="text-lg font-semibold text-slate-700 capitalize">{activeTab} tab</h3>
            <p className="mt-1 text-sm text-slate-500">Teacher-side {activeTab} section will be expanded next.</p>
          </section>
        )}
      </div>

      <AssignmentModal
        open={modalOpen}
        type={selectedType}
        classes={classOptions}
        sections={sections}
        topics={topics}
        onClose={() => setModalOpen(false)}
        onSubmit={createAssignment}
        saving={saving}
      />
    </div>
  );
}
