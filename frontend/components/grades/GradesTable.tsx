"use client";

import { Fragment, useEffect, useState } from "react";
import { ArrowDownWideNarrow, ArrowUpWideNarrow, Download } from "lucide-react";

import { StudentRow } from "@/components/grades/StudentRow";


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

type GradesTableProps = {
  students: Student[];
  sections: Section[];
  assignments: Assignment[];
  gradeMap: Record<number, Record<string, number>>;
  manualSectionGradeMap: ManualSectionGradeMap;
  manualSectionMaxMap: Record<number, number>;
  submissionMap: Record<number, Record<string, SubmissionStatus>>;
  submissionMetaMap: Record<number, Record<string, SubmissionMeta>>;
  savingCells: Record<string, boolean>;
  savingAssignmentMaxCells: Record<string, boolean>;
  savingSectionCells: Record<string, boolean>;
  savingSectionMaxCells: Record<string, boolean>;
  autoGradingAssignments: Record<string, boolean>;
  sortByTotalDesc: boolean;
  onToggleSort: () => void;
  onExportCsv: () => void;
  onSaveCell: (studentId: number, assignmentId: string, marks: number, maxMarks: number) => Promise<void>;
  onSaveAssignmentMax: (assignmentId: string, points: number) => Promise<void>;
  onSaveSectionGrade: (studentId: number, sectionId: number, marks: number) => Promise<void>;
  onSaveSectionMax: (sectionId: number, marks: number) => Promise<void>;
  onOpenDetails: (student: Student, assignment: Assignment) => void;
  onAutoGradeAssignment: (assignmentId: string) => Promise<void>;
};

export function GradesTable({
  students,
  sections,
  assignments,
  gradeMap,
  manualSectionGradeMap,
  manualSectionMaxMap,
  submissionMap,
  submissionMetaMap,
  savingCells,
  savingAssignmentMaxCells,
  savingSectionCells,
  savingSectionMaxCells,
  autoGradingAssignments,
  sortByTotalDesc,
  onToggleSort,
  onExportCsv,
  onSaveCell,
  onSaveAssignmentMax,
  onSaveSectionGrade,
  onSaveSectionMax,
  onOpenDetails,
  onAutoGradeAssignment,
}: GradesTableProps) {
  const [sectionMaxDrafts, setSectionMaxDrafts] = useState<Record<number, string>>({});
  const [assignmentMaxDrafts, setAssignmentMaxDrafts] = useState<Record<string, string>>({});
  const totalSectionWeight = sections.reduce((sum, section) => sum + section.percentage, 0) || 100;

  useEffect(() => {
    const nextAssignmentDrafts: Record<string, string> = {};
    assignments.forEach((assignment) => {
      nextAssignmentDrafts[assignment.id] = String(assignment.max_marks);
    });
    setAssignmentMaxDrafts(nextAssignmentDrafts);

    const nextDrafts: Record<number, string> = {};
    sections.forEach((section) => {
      const saved = manualSectionMaxMap[section.id] ?? section.manual_max_points;
      if (typeof saved === "number") {
        nextDrafts[section.id] = String(saved);
      }
    });
    setSectionMaxDrafts(nextDrafts);
  }, [manualSectionMaxMap, sections]);

  const commitSectionMax = async (sectionId: number) => {
    const raw = sectionMaxDrafts[sectionId] ?? "";
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return;
    }

    const existing = manualSectionMaxMap[sectionId];
    if (existing === parsed) {
      return;
    }

    await onSaveSectionMax(sectionId, parsed);
  };

  const commitAssignmentMax = async (assignmentId: string) => {
    const raw = assignmentMaxDrafts[assignmentId] ?? "";
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return;
    }

    const existing = assignments.find((assignment) => assignment.id === assignmentId)?.max_marks;
    if (typeof existing === "number" && existing === parsed) {
      return;
    }

    await onSaveAssignmentMax(assignmentId, parsed);
  };

  const computeStudentTotal = (studentId: number): number => {
    return sections.reduce((sum, section) => {
      const maxMarks = section.assignments.length === 0
        ? (manualSectionMaxMap[section.id] ?? section.manual_max_points ?? 0)
        : section.assignments.reduce((sectionSum, assignment) => sectionSum + assignment.max_marks, 0);

      if (maxMarks <= 0) {
        return sum;
      }

      const marks = section.assignments.length === 0
        ? (manualSectionGradeMap[studentId]?.[section.id] ?? 0)
        : section.assignments.reduce((sectionSum, assignment) => {
            const value = gradeMap[studentId]?.[assignment.id];
            return typeof value === "number" ? sectionSum + value : sectionSum;
          }, 0);

      const ratio = marks / maxMarks;
      return sum + (ratio * section.percentage * 100) / totalSectionWeight;
    }, 0);
  };

  const sortedStudents = [...students].sort((left, right) => {
    const leftTotal = computeStudentTotal(left.id);
    const rightTotal = computeStudentTotal(right.id);
    return sortByTotalDesc ? rightTotal - leftTotal : leftTotal - rightTotal;
  });

  const studentTotals = students.map((s) => computeStudentTotal(s.id));
  const classMean = studentTotals.length > 0 ? studentTotals.reduce((sum, val) => sum + val, 0) / studentTotals.length : 0;
  const classVariance = studentTotals.length > 0 ? studentTotals.reduce((sum, val) => sum + Math.pow(val - classMean, 2), 0) / studentTotals.length : 0;
  const classStdDev = Math.sqrt(classVariance);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleSort}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
          >
            {sortByTotalDesc ? <ArrowDownWideNarrow className="h-4 w-4" /> : <ArrowUpWideNarrow className="h-4 w-4" />}
            Sort by Total
          </button>
          <button
            type="button"
            onClick={onExportCsv}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="min-w-full border-collapse text-sm">
          <thead className="sticky top-0 z-20 bg-white dark:bg-slate-950">
            <tr>
              <th rowSpan={2} className="sticky left-0 z-30 border border-slate-200 bg-white p-2 text-left font-semibold dark:border-slate-800 dark:bg-slate-950">
                Student Name
              </th>
              {sections.map((section) => {
                const columnCount = section.assignments.length + 1;
                return (
                  <th key={section.id} colSpan={columnCount} className="border border-slate-200 bg-slate-50 p-2 text-center font-semibold dark:border-slate-800 dark:bg-slate-900">
                    <div>{section.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Weight {section.percentage}%</div>
                  </th>
                );
              })}
              <th rowSpan={2} className="border border-slate-200 bg-slate-50 p-2 text-center font-semibold dark:border-slate-800 dark:bg-slate-900">
                Total
              </th>
              <th rowSpan={2} className="border border-slate-200 bg-slate-50 p-2 text-center font-semibold dark:border-slate-800 dark:bg-slate-900">
                Grade
              </th>
            </tr>
            <tr>
              {sections.map((section) => (
                <Fragment key={section.id}>
                  {section.assignments.map((assignment) => (
                    <th key={assignment.id} className="border border-slate-200 p-2 text-center font-semibold dark:border-slate-800">
                      <div className="max-w-[180px] truncate">{assignment.title}</div>
                      <div className="mt-1 flex flex-col items-center gap-1">
                        <input
                          type="number"
                          min={1}
                          value={assignmentMaxDrafts[assignment.id] ?? String(assignment.max_marks)}
                          onChange={(event) => setAssignmentMaxDrafts((prev) => ({ ...prev, [assignment.id]: event.target.value }))}
                          disabled={Boolean(savingAssignmentMaxCells[`assignment-max-${assignment.id}`])}
                          className="w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-center text-xs outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900"
                        />
                        <button
                          type="button"
                          onClick={() => void commitAssignmentMax(assignment.id)}
                          disabled={Boolean(savingAssignmentMaxCells[`assignment-max-${assignment.id}`])}
                          className="rounded-md border border-sky-300 bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-60 dark:border-sky-800 dark:bg-sky-900/30 dark:text-sky-300"
                        >
                          {savingAssignmentMaxCells[`assignment-max-${assignment.id}`] ? "Saving..." : "Save"}
                        </button>
                        <div className="text-xs text-slate-500 dark:text-slate-400">Current {assignment.max_marks}</div>
                      </div>
                      <button
                        type="button"
                        disabled={Boolean(autoGradingAssignments[assignment.id])}
                        onClick={() => void onAutoGradeAssignment(assignment.id)}
                        className="mt-1 rounded-md border border-sky-300 bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-60 dark:border-sky-800 dark:bg-sky-900/30 dark:text-sky-300"
                      >
                        {autoGradingAssignments[assignment.id] ? "Grading..." : "Auto Grade"}
                      </button>
                    </th>
                  ))}
                  <th key={`${section.id}-total`} className="border border-slate-200 bg-slate-50 p-2 text-center font-semibold dark:border-slate-800 dark:bg-slate-900">
                    {section.assignments.length === 0 ? (
                      <div className="flex flex-col items-center gap-1">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Max</div>
                        <input
                          type="number"
                          min={0}
                          value={sectionMaxDrafts[section.id] ?? ""}
                          onChange={(event) => setSectionMaxDrafts((prev) => ({ ...prev, [section.id]: event.target.value }))}
                          disabled={Boolean(savingSectionMaxCells[`section-max-${section.id}`])}
                          className="w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-center text-sm outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-900"
                        />
                        <button
                          type="button"
                          onClick={() => void commitSectionMax(section.id)}
                          disabled={Boolean(savingSectionMaxCells[`section-max-${section.id}`])}
                          className="rounded-md border border-sky-300 bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-60 dark:border-sky-800 dark:bg-sky-900/30 dark:text-sky-300"
                        >
                          {savingSectionMaxCells[`section-max-${section.id}`] ? "Saving..." : "Save"}
                        </button>
                      </div>
                    ) : (
                      <>
                        <div>Total</div>
                        <div className="text-[11px] font-normal text-slate-500 dark:text-slate-400">earned / max</div>
                      </>
                    )}
                  </th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedStudents.map((student) => (
              <StudentRow
                key={student.id}
                student={student}
                sections={sections}
                assignments={assignments}
                gradeMap={gradeMap}
                manualSectionGradeMap={manualSectionGradeMap}
                manualSectionMaxMap={manualSectionMaxMap}
                submissionMap={submissionMap}
                submissionMetaMap={submissionMetaMap}
                savingCells={savingCells}
                savingSectionCells={savingSectionCells}
                onSaveCell={onSaveCell}
                onSaveSectionGrade={onSaveSectionGrade}
                onOpenDetails={onOpenDetails}
                classMean={classMean}
                classStdDev={classStdDev}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
