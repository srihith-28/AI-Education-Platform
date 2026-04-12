"use client";

import { X } from "lucide-react";


type GradeDetailModalProps = {
  open: boolean;
  onClose: () => void;
  payload: {
    studentName: string;
    assignmentTitle: string;
    submissionStatus: "submitted" | "missing" | "late" | null;
    studentAnswer: string;
    aiFeedback: string;
    aiMarks: number | null;
    finalMarks: number | null;
    gradedBy: "ai" | "teacher" | null;
    gradedAt: string | null;
  } | null;
};

export function GradeDetailModal({ open, onClose, payload }: GradeDetailModalProps) {
  if (!open || !payload) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold">Grade Details</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {payload.studentName} - {payload.assignmentTitle}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
            <p className="font-medium">Submission Status</p>
            <p className="mt-1 capitalize">{payload.submissionStatus || "none"}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
            <p className="font-medium">Marks</p>
            <p className="mt-1">
              Final: {payload.finalMarks == null ? "Ungraded" : payload.finalMarks}
              {" | "}
              AI: {payload.aiMarks == null ? "N/A" : payload.aiMarks}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Graded by: {payload.gradedBy || "none"}
              {payload.gradedAt ? ` at ${new Date(payload.gradedAt).toLocaleString()}` : ""}
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <p className="mb-1 text-sm font-medium">Student Answer</p>
            <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
              {payload.studentAnswer?.trim() ? payload.studentAnswer : "No answer submitted."}
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <p className="mb-1 text-sm font-medium">AI Feedback</p>
            <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
              {payload.aiFeedback?.trim() ? payload.aiFeedback : "No AI feedback yet."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
