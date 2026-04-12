"use client";

import { useEffect, useMemo, useState } from "react";

import { GradeDetailModal } from "@/components/grades/GradeDetailModal";
import { GradesTable } from "@/components/grades/GradesTable";
import { api } from "@/lib/api";


type Student = {
  id: number;
  name: string;
  email?: string;
};

type Assignment = {
  id: string;
  title: string;
  max_marks: number;
  classwork_section_id: number | null;
};

type GradeSection = {
  id: number;
  name: string;
  percentage: number;
  manual_max_points: number | null;
  assignments: Assignment[];
};

type GradeRow = {
  student_id: number;
  assignment_id: string;
  marks: number;
  earned_marks?: number;
  max_marks?: number;
  percentage?: number;
};

type ManualSectionGradeRow = {
  student_id: number;
  section_id: number;
  marks: number;
};

type ManualSectionMaxRow = {
  id: number;
  manual_max_points: number | null;
};

type SubmissionStatus = "submitted" | "missing" | "late";

type SubmissionRow = {
  student_id: number;
  assignment_id: string;
  status: SubmissionStatus;
  content: string;
  ai_marks: number | null;
  ai_feedback: string;
  final_marks: number | null;
  graded_by: "ai" | "teacher" | null;
  graded_at: string | null;
};

type SubmissionMeta = {
  status: SubmissionStatus;
  content: string;
  ai_marks: number | null;
  ai_feedback: string;
  final_marks: number | null;
  graded_by: "ai" | "teacher" | null;
  graded_at: string | null;
};

type TeacherGradesPageProps = {
  courseId: number;
  courseTitle: string;
};

const cellKey = (studentId: number, assignmentId: string): string => `${studentId}::${assignmentId}`;

const buildGradeMap = (rows: GradeRow[]): Record<number, Record<string, number>> => {
  return rows.reduce<Record<number, Record<string, number>>>((acc, row) => {
    if (!acc[row.student_id]) {
      acc[row.student_id] = {};
    }
    acc[row.student_id][row.assignment_id] = row.earned_marks ?? row.marks;
    return acc;
  }, {});
};

const buildSubmissionMap = (rows: SubmissionRow[]): Record<number, Record<string, SubmissionStatus>> => {
  return rows.reduce<Record<number, Record<string, SubmissionStatus>>>((acc, row) => {
    if (!acc[row.student_id]) {
      acc[row.student_id] = {};
    }
    acc[row.student_id][row.assignment_id] = row.status;
    return acc;
  }, {});
};

const buildSubmissionMetaMap = (rows: SubmissionRow[]): Record<number, Record<string, SubmissionMeta>> => {
  return rows.reduce<Record<number, Record<string, SubmissionMeta>>>((acc, row) => {
    if (!acc[row.student_id]) {
      acc[row.student_id] = {};
    }
    acc[row.student_id][row.assignment_id] = {
      status: row.status,
      content: row.content,
      ai_marks: row.ai_marks,
      ai_feedback: row.ai_feedback,
      final_marks: row.final_marks,
      graded_by: row.graded_by,
      graded_at: row.graded_at,
    };
    return acc;
  }, {});
};

const buildManualSectionGradeMap = (rows: ManualSectionGradeRow[]): Record<number, Record<number, number>> => {
  return rows.reduce<Record<number, Record<number, number>>>((acc, row) => {
    if (!acc[row.student_id]) {
      acc[row.student_id] = {};
    }
    acc[row.student_id][row.section_id] = row.marks;
    return acc;
  }, {});
};

const buildManualSectionMaxMap = (sections: ManualSectionMaxRow[]): Record<number, number> => {
  return sections.reduce<Record<number, number>>((acc, section) => {
    if (typeof section.manual_max_points === "number") {
      acc[section.id] = section.manual_max_points;
    }
    return acc;
  }, {});
};

const normalizeLabel = (value: string): string => {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
};

const resolveSectionIdForAssignment = (title: string, classworkSectionId: number | null, sections: GradeSection[]): number | null => {
  const normalizedTitle = normalizeLabel(title);
  if (!normalizedTitle) {
    return classworkSectionId;
  }

  const titleMatch = sections.find((section) => {
    if (section.id === 0) {
      return false;
    }
    const normalizedSectionName = normalizeLabel(section.name);
    return normalizedSectionName.length >= 3 && normalizedTitle.includes(normalizedSectionName);
  });

  return titleMatch ? titleMatch.id : classworkSectionId;
};

const buildResolvedSections = (sections: GradeSection[], assignments: Assignment[]): GradeSection[] => {
  const sectionMap = new Map<number, GradeSection>();
  sections.forEach((section) => {
    sectionMap.set(section.id, { ...section, assignments: [] });
  });

  assignments.forEach((assignment) => {
    const resolvedSectionId = resolveSectionIdForAssignment(assignment.title, assignment.classwork_section_id, sections);
    const targetSectionId = resolvedSectionId ?? 0;
    let target = sectionMap.get(targetSectionId);

    if (!target) {
      target = {
        id: 0,
        name: "Ungrouped",
        percentage: 0,
        manual_max_points: null,
        assignments: [],
      };
      sectionMap.set(0, target);
    }

    target.assignments.push({
      ...assignment,
      classwork_section_id: target.id === 0 ? null : target.id,
    });
  });

  return Array.from(sectionMap.values()).filter((section) => section.id !== 0 || section.assignments.length > 0);
};

export function TeacherGradesPage({ courseId, courseTitle }: TeacherGradesPageProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [sections, setSections] = useState<GradeSection[]>([]);
  const [gradeMap, setGradeMap] = useState<Record<number, Record<string, number>>>({});
  const [manualSectionGradeMap, setManualSectionGradeMap] = useState<Record<number, Record<number, number>>>({});
  const [manualSectionMaxMap, setManualSectionMaxMap] = useState<Record<number, number>>({});
  const [submissionMap, setSubmissionMap] = useState<Record<number, Record<string, SubmissionStatus>>>({});
  const [submissionMetaMap, setSubmissionMetaMap] = useState<Record<number, Record<string, SubmissionMeta>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [savingCells, setSavingCells] = useState<Record<string, boolean>>({});
  const [savingAssignmentMaxCells, setSavingAssignmentMaxCells] = useState<Record<string, boolean>>({});
  const [savingSectionCells, setSavingSectionCells] = useState<Record<string, boolean>>({});
  const [savingSectionMaxCells, setSavingSectionMaxCells] = useState<Record<string, boolean>>({});
  const [autoGradingAssignments, setAutoGradingAssignments] = useState<Record<string, boolean>>({});
  const [sortByTotalDesc, setSortByTotalDesc] = useState(true);
  const [detailPayload, setDetailPayload] = useState<{
    studentName: string;
    assignmentTitle: string;
    submissionStatus: SubmissionStatus | null;
    studentAnswer: string;
    aiFeedback: string;
    aiMarks: number | null;
    finalMarks: number | null;
    gradedBy: "ai" | "teacher" | null;
    gradedAt: string | null;
  } | null>(null);

  const hasData = useMemo(() => students.length > 0 && assignments.length > 0, [students.length, assignments.length]);
  const totalSectionWeight = useMemo(() => {
    const weight = sections.reduce((sum, section) => sum + section.percentage, 0);
    return weight > 0 ? weight : 100;
  }, [sections]);

  const computeSectionContribution = (studentId: number, section: GradeSection): number => {
    if (section.assignments.length === 0) {
      const maxPoints = manualSectionMaxMap[section.id] ?? section.manual_max_points ?? 0;
      if (maxPoints <= 0) {
        return 0;
      }

      const manualMarks = manualSectionGradeMap[studentId]?.[section.id] ?? 0;
      const percent = (manualMarks / maxPoints) * 100;
      return (percent * section.percentage) / 100;
    }

    const maxMarks = section.assignments.reduce((sum, assignment) => sum + assignment.max_marks, 0);
    if (maxMarks <= 0) {
      return 0;
    }

    const marks = section.assignments.reduce((sum, assignment) => sum + (gradeMap[studentId]?.[assignment.id] ?? 0), 0);
    const ratio = marks / maxMarks;
    return (ratio * section.percentage * 100) / totalSectionWeight;
  };

  const computeSectionStats = (studentId: number, section: GradeSection) => {
    if (section.assignments.length === 0) {
      const maxMarks = manualSectionMaxMap[section.id] ?? section.manual_max_points ?? 0;
      const marks = manualSectionGradeMap[studentId]?.[section.id] ?? 0;
      const percent = maxMarks > 0 ? (marks / maxMarks) * 100 : 0;
      return { marks, maxMarks, percent };
    }

    const maxMarks = section.assignments.reduce((sum, assignment) => sum + assignment.max_marks, 0);
    const marks = section.assignments.reduce((sum, assignment) => sum + (gradeMap[studentId]?.[assignment.id] ?? 0), 0);
    const percent = maxMarks > 0 ? (marks / maxMarks) * 100 : 0;
    return { marks, maxMarks, percent };
  };

  const computeStudentTotal = (studentId: number): number => {
    return sections.reduce((sum, section) => sum + computeSectionContribution(studentId, section), 0);
  };

  const loadGrades = async () => {
    try {
      setLoading(true);
      setError("");
      setInfo("");
      const response = await api.courseGrades(courseId);
      const apiAssignments = response.assignments || [];
      const apiSections = (response.sections || []) as GradeSection[];
      const resolvedSections = buildResolvedSections(apiSections, apiAssignments);

      setStudents(response.students || []);
      setAssignments(apiAssignments);
      setSections(resolvedSections);
      setGradeMap(buildGradeMap(response.grades || []));
      setManualSectionGradeMap(buildManualSectionGradeMap(response.manual_section_grades || []));
      setManualSectionMaxMap(buildManualSectionMaxMap(resolvedSections));
      setSubmissionMap(buildSubmissionMap(response.submissions || []));
      setSubmissionMetaMap(buildSubmissionMetaMap(response.submissions || []));
    } catch (err) {
      setStudents([]);
      setAssignments([]);
      setSections([]);
      setGradeMap({});
      setManualSectionGradeMap({});
      setManualSectionMaxMap({});
      setSubmissionMap({});
      setSubmissionMetaMap({});
      setError(err instanceof Error ? err.message : "Could not fetch grades");
    } finally {
      setLoading(false);
    }
  };

  const updateGrade = async (studentId: number, assignmentId: string, marks: number, maxMarks: number) => {
    const key = cellKey(studentId, assignmentId);
    const previousMarks = gradeMap[studentId]?.[assignmentId];
    const previousMeta = submissionMetaMap[studentId]?.[assignmentId];

    if (maxMarks <= 0) {
      setError("Enter max marks first");
      return;
    }

    if (marks > maxMarks) {
      setError("Earned marks cannot exceed max marks");
      return;
    }

    setSavingCells((prev) => ({ ...prev, [key]: true }));

    setGradeMap((prev) => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || {}),
        [assignmentId]: marks,
      },
    }));

    setSubmissionMetaMap((prev) => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || {}),
        [assignmentId]: {
          ...(prev[studentId]?.[assignmentId] || {
            status: "submitted",
            content: "",
            ai_marks: null,
            ai_feedback: "",
            final_marks: null,
            graded_by: null,
            graded_at: null,
          }),
          final_marks: marks,
          graded_by: "teacher",
          graded_at: new Date().toISOString(),
        },
      },
    }));

    try {
      await api.updateCourseGrade({ student_id: studentId, assignment_id: assignmentId, earned_marks: marks, max_marks: maxMarks });
      setInfo("Grades saved");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save grade");
      setGradeMap((prev) => {
        const next = { ...prev, [studentId]: { ...(prev[studentId] || {}) } };
        if (previousMarks == null) {
          delete next[studentId][assignmentId];
        } else {
          next[studentId][assignmentId] = previousMarks;
        }
        return next;
      });
      setSubmissionMetaMap((prev) => {
        const next = { ...prev, [studentId]: { ...(prev[studentId] || {}) } };
        if (previousMeta) {
          next[studentId][assignmentId] = previousMeta;
        }
        return next;
      });
    } finally {
      setSavingCells((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const updateAssignmentMax = async (assignmentId: string, points: number) => {
    const key = `assignment-max-${assignmentId}`;
    const previousAssignments = assignments;

    setSavingAssignmentMaxCells((prev) => ({ ...prev, [key]: true }));
    setAssignments((prev) => prev.map((assignment) => (assignment.id === assignmentId ? { ...assignment, max_marks: points } : assignment)));

    try {
      await api.updateClassworkPoints(assignmentId, points);
      setInfo("Assignment max saved");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save assignment max");
      setAssignments(previousAssignments);
    } finally {
      setSavingAssignmentMaxCells((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const updateSectionGrade = async (studentId: number, sectionId: number, marks: number) => {
    const key = `${studentId}::section-${sectionId}`;
    const previousMarks = manualSectionGradeMap[studentId]?.[sectionId];

    setSavingSectionCells((prev) => ({ ...prev, [key]: true }));
    setManualSectionGradeMap((prev) => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || {}),
        [sectionId]: marks,
      },
    }));

    try {
      await api.updateSectionGrade({ student_id: studentId, section_id: sectionId, marks });
      setInfo("Section grade saved");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save section grade");
      setManualSectionGradeMap((prev) => {
        const next = { ...prev, [studentId]: { ...(prev[studentId] || {}) } };
        if (previousMarks == null) {
          delete next[studentId][sectionId];
        } else {
          next[studentId][sectionId] = previousMarks;
        }
        return next;
      });
    } finally {
      setSavingSectionCells((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const updateSectionMax = async (sectionId: number, maxPoints: number) => {
    const key = `section-max-${sectionId}`;
    const previousMax = manualSectionMaxMap[sectionId];

    setSavingSectionMaxCells((prev) => ({ ...prev, [key]: true }));
    setManualSectionMaxMap((prev) => ({ ...prev, [sectionId]: maxPoints }));

    try {
      await api.updateSectionMax({ section_id: sectionId, max_points: maxPoints });
      setInfo("Section max points saved");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save section max points");
      setManualSectionMaxMap((prev) => {
        const next = { ...prev };
        if (typeof previousMax === "number") {
          next[sectionId] = previousMax;
        } else {
          delete next[sectionId];
        }
        return next;
      });
    } finally {
      setSavingSectionMaxCells((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const autoGradeAssignment = async (assignmentId: string) => {
    try {
      setAutoGradingAssignments((prev) => ({ ...prev, [assignmentId]: true }));
      setError("");
      const response = await api.autoGradeAssignment(assignmentId, false);
      setInfo(
        `Auto grading done. Graded: ${response.data.graded_count}, Skipped: ${response.data.skipped_count}, Errors: ${response.data.error_count}`
      );
      await loadGrades();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auto grading failed");
    } finally {
      setAutoGradingAssignments((prev) => {
        const next = { ...prev };
        delete next[assignmentId];
        return next;
      });
    }
  };

  const openCellDetails = (student: Student, assignment: Assignment) => {
    const meta = submissionMetaMap[student.id]?.[assignment.id];
    setDetailPayload({
      studentName: student.name,
      assignmentTitle: assignment.title,
      submissionStatus: meta?.status || null,
      studentAnswer: meta?.content || "",
      aiFeedback: meta?.ai_feedback || "",
      aiMarks: meta?.ai_marks ?? null,
      finalMarks: meta?.final_marks ?? null,
      gradedBy: meta?.graded_by ?? null,
      gradedAt: meta?.graded_at ?? null,
    });
  };

  const exportCsv = () => {
    if (!hasData) {
      return;
    }

    const header = ["Student Name"];
    sections.forEach((section) => {
      section.assignments.forEach((assignment) => {
        header.push(`${section.name}: ${assignment.title} (${assignment.max_marks})`);
      });
      header.push(`${section.name}: Total earned/max`);
    });
    header.push("Total %");

    const rows = students.map((student) => {
      const cells = sections.flatMap((section) => {
        const itemCells = section.assignments.map((assignment) => {
          const submitted = submissionMap[student.id]?.[assignment.id];
          const mark = gradeMap[student.id]?.[assignment.id];

          if (!submitted) {
            return "—";
          }
          if (typeof mark !== "number") {
            return "Ungraded";
          }
          return String(mark);
        });

        const stats = computeSectionStats(student.id, section);
        return [...itemCells, `${stats.marks.toFixed(1)}/${stats.maxMarks.toFixed(1)} (${stats.percent.toFixed(1)}%)`];
      });

      return [student.name, ...cells, computeStudentTotal(student.id).toFixed(2)];
    });

    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${courseTitle.toLowerCase().replace(/\s+/g, "-")}-grades.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  useEffect(() => {
    void loadGrades();
  }, [courseId]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-2xl font-semibold">Grades Dashboard</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">Spreadsheet-style grading for {courseTitle}.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadGrades()}
          disabled={loading}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? "Loading..." : "Refresh Grades"}
        </button>
      </div>

      {error ? <p className="rounded-lg border border-rose-300 bg-rose-100 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">{error}</p> : null}
      {info ? <p className="rounded-lg border border-emerald-300 bg-emerald-100 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">{info}</p> : null}

      {!hasData && !loading ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          Click Refresh Grades to load students, assignments, and marks for this class.
        </div>
      ) : null}

      {hasData ? (
        <GradesTable
          students={students}
          sections={sections}
          assignments={assignments}
          gradeMap={gradeMap}
          manualSectionGradeMap={manualSectionGradeMap}
          manualSectionMaxMap={manualSectionMaxMap}
          submissionMap={submissionMap}
          submissionMetaMap={submissionMetaMap}
          savingCells={savingCells}
          savingAssignmentMaxCells={savingAssignmentMaxCells}
          savingSectionCells={savingSectionCells}
          savingSectionMaxCells={savingSectionMaxCells}
          autoGradingAssignments={autoGradingAssignments}
          sortByTotalDesc={sortByTotalDesc}
          onToggleSort={() => setSortByTotalDesc((prev) => !prev)}
          onExportCsv={exportCsv}
          onSaveCell={updateGrade}
          onSaveAssignmentMax={updateAssignmentMax}
          onSaveSectionGrade={updateSectionGrade}
          onSaveSectionMax={updateSectionMax}
          onOpenDetails={openCellDetails}
          onAutoGradeAssignment={autoGradeAssignment}
        />
      ) : null}

      <GradeDetailModal open={Boolean(detailPayload)} payload={detailPayload} onClose={() => setDetailPayload(null)} />
    </div>
  );
}
