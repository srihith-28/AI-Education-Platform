"use client";

import { Fragment, useEffect, useState } from "react";
import { GradeCell } from "@/components/grades/GradeCell";


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

type Section = {
  id: number;
  name: string;
  percentage: number;
  manual_max_points: number | null;
  assignments: Assignment[];
};

type SubmissionStatus = "submitted" | "missing" | "late";

type SubmissionMeta = {
  status: SubmissionStatus;
  content: string;
  ai_marks: number | null;
  ai_feedback: string;
  final_marks: number | null;
  graded_by: "ai" | "teacher" | null;
  graded_at: string | null;
};

type ManualSectionGradeMap = Record<number, Record<number, number>>;

type StudentRowProps = {
  student: Student;
  sections: Section[];
  assignments: Assignment[];
  gradeMap: Record<number, Record<string, number>>;
  manualSectionGradeMap: ManualSectionGradeMap;
  manualSectionMaxMap: Record<number, number>;
  submissionMap: Record<number, Record<string, SubmissionStatus>>;
  submissionMetaMap: Record<number, Record<string, SubmissionMeta>>;
  savingCells: Record<string, boolean>;
  savingSectionCells: Record<string, boolean>;
  onSaveCell: (studentId: number, assignmentId: string, marks: number, maxMarks: number) => Promise<void>;
  onSaveSectionGrade: (studentId: number, sectionId: number, marks: number) => Promise<void>;
  onOpenDetails: (student: Student, assignment: Assignment) => void;
};

export function StudentRow({
  student,
  sections,
  assignments,
  gradeMap,
  manualSectionGradeMap,
  manualSectionMaxMap,
  submissionMap,
  submissionMetaMap,
  savingCells,
  savingSectionCells,
  onSaveCell,
  onSaveSectionGrade,
  onOpenDetails,
}: StudentRowProps) {
  const [sectionDrafts, setSectionDrafts] = useState<Record<number, string>>({});
  const totalSectionWeight = sections.reduce((sum, section) => sum + section.percentage, 0) || 100;

  useEffect(() => {
    const nextDrafts: Record<number, string> = {};
    sections.forEach((section) => {
      const manualValue = manualSectionGradeMap[student.id]?.[section.id];
      if (typeof manualValue === "number") {
        nextDrafts[section.id] = String(manualValue);
      }
    });
    setSectionDrafts(nextDrafts);
  }, [manualSectionGradeMap, sections, student.id]);

  const commitSectionGrade = async (sectionId: number, currentValue: string) => {
    const parsed = Number(currentValue);
    if (!Number.isFinite(parsed) || parsed < 0) {
      const existing = manualSectionGradeMap[student.id]?.[sectionId];
      setSectionDrafts((prev) => ({
        ...prev,
        [sectionId]: typeof existing === "number" ? String(existing) : "",
      }));
      return;
    }

    const existing = manualSectionGradeMap[student.id]?.[sectionId];
    if (existing === parsed) {
      return;
    }

    await onSaveSectionGrade(student.id, sectionId, parsed);
  };

  const computeSectionStats = (section: Section) => {
    const maxPoints = manualSectionMaxMap[section.id] ?? section.manual_max_points ?? 0;
    const manualMarks = manualSectionGradeMap[student.id]?.[section.id];
    if (section.assignments.length === 0) {
      const marks = typeof manualMarks === "number" ? manualMarks : 0;
      const percent = maxPoints > 0 ? (marks / maxPoints) * 100 : 0;
      const weightedContribution = (percent * section.percentage) / totalSectionWeight;
      return { marks, maxMarks: maxPoints, percent, weightedContribution };
    }

    const maxMarks = section.assignments.reduce((sum, assignment) => sum + assignment.max_marks, 0);
    const marks = section.assignments.reduce((sum, assignment) => {
      const value = gradeMap[student.id]?.[assignment.id];
      return typeof value === "number" ? sum + value : sum;
    }, 0);
    const percent = maxMarks > 0 ? (marks / maxMarks) * 100 : 0;
    const weightedContribution = (percent * section.percentage) / totalSectionWeight;
    return { marks, maxMarks, percent, weightedContribution };
  };

  const overallWeightedTotal = sections.reduce((sum, section) => sum + computeSectionStats(section).weightedContribution, 0);

  return (
    <tr className="border-b border-slate-200 dark:border-slate-800">
      <td className="sticky left-0 z-10 border border-slate-200 bg-white p-2 text-left dark:border-slate-800 dark:bg-slate-950">
        <p className="font-medium text-slate-800 dark:text-slate-100">{student.name}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{student.email || "-"}</p>
      </td>

      {sections.map((section) => (
        <Fragment key={section.id}>
          {section.assignments.map((assignment) => {
            const marks = gradeMap[student.id]?.[assignment.id] ?? null;
            const submissionStatus = submissionMap[student.id]?.[assignment.id] ?? null;
            const cellKey = `${student.id}::${assignment.id}`;

            return (
              <td key={assignment.id} className="border border-slate-200 p-2 text-center dark:border-slate-800">
                <GradeCell
                  studentId={student.id}
                  assignmentId={assignment.id}
                  maxMarks={assignment.max_marks}
                  marks={marks}
                  submissionStatus={submissionStatus}
                  gradedBy={submissionMetaMap[student.id]?.[assignment.id]?.graded_by || null}
                  saving={Boolean(savingCells[cellKey])}
                  onSave={onSaveCell}
                  onOpenDetails={() => onOpenDetails(student, assignment)}
                />
              </td>
            );
          })}
          <td className="border border-slate-200 bg-slate-50 p-2 text-center font-semibold dark:border-slate-800 dark:bg-slate-900">
            {(() => {
              const stats = computeSectionStats(section);

              if (section.assignments.length === 0) {
                const manualValue = manualSectionGradeMap[student.id]?.[section.id];
                const cellKey = `${student.id}::section-${section.id}`;

                return (
                  <div className="flex flex-col items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={stats.maxMarks > 0 ? stats.maxMarks : undefined}
                      value={sectionDrafts[section.id] ?? (typeof manualValue === "number" ? String(manualValue) : "")}
                      onChange={(event) => setSectionDrafts((prev) => ({ ...prev, [section.id]: event.target.value }))}
                      disabled={Boolean(savingSectionCells[cellKey])}
                      className="w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-center text-sm outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900"
                    />
                    <button
                      type="button"
                      onClick={() => void commitSectionGrade(section.id, sectionDrafts[section.id] ?? "")}
                      disabled={Boolean(savingSectionCells[cellKey])}
                      className="rounded-md border border-sky-300 bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-60 dark:border-sky-800 dark:bg-sky-900/30 dark:text-sky-300"
                    >
                      {savingSectionCells[cellKey] ? "Saving..." : "Save"}
                    </button>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {stats.marks.toFixed(1)} / {stats.maxMarks.toFixed(1)}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{stats.percent.toFixed(1)}%</p>
                  </div>
                );
              }

              return (
                <div className="flex flex-col items-center gap-1">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {stats.marks.toFixed(1)} / {stats.maxMarks.toFixed(1)}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{stats.percent.toFixed(1)}%</p>
                </div>
              );
            })()}
          </td>
        </Fragment>
      ))}

      <td className="border border-slate-200 bg-slate-50 p-2 text-center font-semibold dark:border-slate-800 dark:bg-slate-900">
        {overallWeightedTotal.toFixed(1)}%
      </td>
    </tr>
  );
}
