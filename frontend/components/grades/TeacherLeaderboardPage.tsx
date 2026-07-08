"use client";

import { useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api";
import { computeRelativeGrade, getGradeBadgeColor } from "@/lib/grades";

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
};

type ManualSectionGradeRow = {
  student_id: number;
  section_id: number;
  marks: number;
};

type TeacherLeaderboardPageProps = {
  courseId: number;
  courseTitle: string;
};

const normalizeToken = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const sectionFamilyFromText = (value: string): "quiz" | "assignment" | "mid" | "end" | null => {
  const text = normalizeToken(value);
  if (!text) {
    return null;
  }
  if (/(^|\s)(quiz|mcq)(\s|$)/.test(text)) {
    return "quiz";
  }
  if (/(^|\s)(assignment|assign|homework|hw)(\s|$)/.test(text)) {
    return "assignment";
  }
  if (/(^|\s)(mid|midsem|mid term|midterm|mse)(\s|$)/.test(text)) {
    return "mid";
  }
  if (/(^|\s)(end|endsem|end term|endterm|final|ese)(\s|$)/.test(text)) {
    return "end";
  }
  return null;
};

const normalizeLeaderboardSections = (rawSections: GradeSection[]): GradeSection[] => {
  const baseSections = rawSections.map((section) => ({ ...section, assignments: [] as Assignment[] }));
  const sectionById = new Map(baseSections.map((section) => [section.id, section]));
  const firstSectionByFamily = new Map<string, GradeSection>();

  for (const section of baseSections) {
    const family = sectionFamilyFromText(section.name);
    if (family && !firstSectionByFamily.has(family)) {
      firstSectionByFamily.set(family, section);
    }
  }

  const seenAssignmentIds = new Set<string>();
  for (const rawSection of rawSections) {
    for (const assignment of rawSection.assignments || []) {
      if (seenAssignmentIds.has(assignment.id)) {
        continue;
      }
      seenAssignmentIds.add(assignment.id);

      const titleFamily = sectionFamilyFromText(assignment.title);
      const destinationByFamily = titleFamily ? firstSectionByFamily.get(titleFamily) : undefined;
      const destinationByStoredId = assignment.classwork_section_id ? sectionById.get(assignment.classwork_section_id) : undefined;
      const destinationByRawSection = sectionById.get(rawSection.id);
      const destination = destinationByFamily || destinationByStoredId || destinationByRawSection;

      if (destination) {
        destination.assignments.push(assignment);
      }
    }
  }

  return baseSections;
};

const buildGradeMap = (rows: GradeRow[]): Record<number, Record<string, number>> => {
  return rows.reduce<Record<number, Record<string, number>>>((acc, row) => {
    if (!acc[row.student_id]) {
      acc[row.student_id] = {};
    }
    acc[row.student_id][row.assignment_id] = row.marks;
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

export function TeacherLeaderboardPage({ courseId, courseTitle }: TeacherLeaderboardPageProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [sections, setSections] = useState<GradeSection[]>([]);
  const [gradeMap, setGradeMap] = useState<Record<number, Record<string, number>>>({});
  const [manualSectionGradeMap, setManualSectionGradeMap] = useState<Record<number, Record<number, number>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const totalSectionWeight = useMemo(() => {
    const value = sections.reduce((sum, section) => sum + section.percentage, 0);
    return value > 0 ? value : 100;
  }, [sections]);

  const computeSectionPercent = (studentId: number, section: GradeSection): number => {
    if (section.assignments.length === 0) {
      const maxMarks = section.manual_max_points ?? 0;
      if (maxMarks <= 0) {
        return 0;
      }
      const marks = manualSectionGradeMap[studentId]?.[section.id] ?? 0;
      return (marks / maxMarks) * 100;
    }

    const maxMarks = section.assignments.reduce((sum, assignment) => sum + assignment.max_marks, 0);
    if (maxMarks <= 0) {
      return 0;
    }

    const marks = section.assignments.reduce((sum, assignment) => {
      const value = gradeMap[studentId]?.[assignment.id];
      return typeof value === "number" ? sum + value : sum;
    }, 0);

    return (marks / maxMarks) * 100;
  };

  const computeTotalPercent = (studentId: number): number => {
    return sections.reduce((sum, section) => {
      const sectionPercent = computeSectionPercent(studentId, section);
      return sum + (sectionPercent * section.percentage) / totalSectionWeight;
    }, 0);
  };

  const sortedStudents = useMemo(() => {
    return [...students].sort((a, b) => computeTotalPercent(b.id) - computeTotalPercent(a.id));
  }, [students, sections, gradeMap, manualSectionGradeMap]);

  const { classMean, classStdDev } = useMemo(() => {
    const studentTotals = students.map((s) => computeTotalPercent(s.id));
    const mean = studentTotals.length > 0 ? studentTotals.reduce((sum, val) => sum + val, 0) / studentTotals.length : 0;
    const variance = studentTotals.length > 0 ? studentTotals.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / studentTotals.length : 0;
    return { classMean: mean, classStdDev: Math.sqrt(variance) };
  }, [students, sections, gradeMap, manualSectionGradeMap]);

  const loadLeaderboard = async () => {
    try {
      setLoading(true);
      setError("");
      const response = await api.courseLeaderboard(courseId);
      setStudents(response.students || []);
      setSections(normalizeLeaderboardSections(response.sections || []));
      setGradeMap(buildGradeMap(response.grades || []));
      setManualSectionGradeMap(buildManualSectionGradeMap(response.manual_section_grades || []));
    } catch (err) {
      setStudents([]);
      setSections([]);
      setGradeMap({});
      setManualSectionGradeMap({});
      setError(err instanceof Error ? err.message : "Could not load leaderboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLeaderboard();

    const intervalId = window.setInterval(() => {
      void loadLeaderboard();
    }, 10000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [courseId]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-2xl font-semibold">Leaderboard</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">Section-wise percentage ranking for {courseTitle}.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadLeaderboard()}
          disabled={loading}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? "Loading..." : "Refresh Leaderboard"}
        </button>
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-300 bg-rose-100 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-white dark:bg-slate-950">
            <tr>
              <th className="border border-slate-200 p-2 text-left font-semibold dark:border-slate-800">Student Name</th>
              {sections.map((section) => (
                <th key={section.id} className="border border-slate-200 p-2 text-center font-semibold dark:border-slate-800">
                  <div>{section.name}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">Weight {section.percentage}%</div>
                </th>
              ))}
              <th className="border border-slate-200 bg-slate-50 p-2 text-center font-semibold dark:border-slate-800 dark:bg-slate-900">Total</th>
              <th className="border border-slate-200 bg-slate-50 p-2 text-center font-semibold dark:border-slate-800 dark:bg-slate-900">Grade</th>
            </tr>
          </thead>
          <tbody>
            {sortedStudents.map((student) => (
              <tr key={student.id} className="border-b border-slate-200 dark:border-slate-800">
                <td className="border border-slate-200 p-2 text-left dark:border-slate-800">
                  <p className="font-medium text-slate-800 dark:text-slate-100">{student.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{student.email || "-"}</p>
                </td>
                {sections.map((section) => (
                  <td key={`${student.id}-${section.id}`} className="border border-slate-200 p-2 text-center dark:border-slate-800">
                    <p className="font-semibold text-slate-800 dark:text-slate-100">{computeSectionPercent(student.id, section).toFixed(1)}%</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">of 100%</p>
                  </td>
                ))}
                <td className="border border-slate-200 bg-slate-50 p-2 text-center font-semibold dark:border-slate-800 dark:bg-slate-900">
                  {computeTotalPercent(student.id).toFixed(1)}%
                </td>
                <td className="border border-slate-200 bg-slate-50 p-2 text-center font-bold dark:border-slate-800 dark:bg-slate-900">
                  {(() => {
                    const total = computeTotalPercent(student.id);
                    const grade = computeRelativeGrade(total, classMean, classStdDev);
                    return (
                      <span className={`inline-block rounded-md px-2 py-1 text-xs ${getGradeBadgeColor(grade)}`}>
                        {grade}
                      </span>
                    );
                  })()}
                </td>
              </tr>
            ))}

            {sortedStudents.length === 0 && !loading ? (
              <tr>
                <td colSpan={sections.length + 3} className="border border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-slate-800">
                  No leaderboard data yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
