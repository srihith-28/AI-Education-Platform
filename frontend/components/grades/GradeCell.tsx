"use client";

import { KeyboardEvent, useEffect, useMemo, useState } from "react";

type SubmissionStatus = "submitted" | "missing" | "late";

type GradeCellProps = {
  studentId: number;
  assignmentId: string;
  maxMarks: number;
  marks: number | null;
  submissionStatus: SubmissionStatus | null;
  gradedBy: "ai" | "teacher" | null;
  saving: boolean;
  onSave: (studentId: number, assignmentId: string, marks: number, maxMarks: number) => Promise<void>;
  onOpenDetails?: () => void;
};

const valueToText = (value: number | null): string => (value == null ? "" : String(value));

const getMarkTone = (marks: number, maxMarks: number): string => {
  if (maxMarks <= 0) {
    return "text-slate-700 dark:text-slate-100";
  }
  const ratio = marks / maxMarks;
  if (ratio >= 0.8) {
    return "text-emerald-700 dark:text-emerald-300";
  }
  if (ratio <= 0.4) {
    return "text-rose-700 dark:text-rose-300";
  }
  return "text-amber-700 dark:text-amber-300";
};

export function GradeCell({
  studentId,
  assignmentId,
  maxMarks,
  marks,
  submissionStatus,
  gradedBy,
  saving,
  onSave,
  onOpenDetails,
}: GradeCellProps) {
  const [draft, setDraft] = useState(valueToText(marks));
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft(valueToText(marks));
    setError("");
  }, [marks]);

  const parsedDraft = useMemo(() => Number(draft), [draft]);
  const hasValidDraft = Number.isFinite(parsedDraft) && parsedDraft >= 0;
  const displayMarks = hasValidDraft ? parsedDraft : marks ?? 0;
  const displayPercentage = maxMarks > 0 ? (displayMarks / maxMarks) * 100 : 0;
  const toneMarks = marks ?? displayMarks;

  const commit = async () => {
    if (maxMarks <= 0) {
      setError("Enter max marks first");
      return;
    }

    if (!draft.trim()) {
      setDraft(valueToText(marks));
      setError("");
      return;
    }

    if (!hasValidDraft) {
      setDraft(valueToText(marks));
      setError("Enter a valid numeric mark");
      return;
    }

    if (parsedDraft > maxMarks) {
      setError("Earned marks cannot exceed max marks");
      return;
    }

    if (marks !== null && parsedDraft === marks) {
      setError("");
      return;
    }

    await onSave(studentId, assignmentId, parsedDraft, maxMarks);
    setError("");
  };

  const onKeyDown = async (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      await commit();
      return;
    }

    if (event.key === "Escape") {
      setDraft(valueToText(marks));
      setError("");
    }
  };

  return (
    <div className="flex cursor-pointer flex-col items-center justify-center gap-1" onClick={onOpenDetails}>
      <input
        type="number"
        min={0}
        max={maxMarks > 0 ? maxMarks : undefined}
        value={draft}
        placeholder={marks == null ? "Ungraded" : ""}
        onChange={(event) => {
          setDraft(event.target.value);
          setError("");
        }}
        onKeyDown={(event) => void onKeyDown(event)}
        onClick={(event) => event.stopPropagation()}
        disabled={saving || maxMarks <= 0}
        className={`w-20 rounded-md border bg-white px-2 py-1 text-center text-sm outline-none transition focus:border-sky-500 dark:bg-slate-900 ${
          error
            ? "border-rose-500 text-rose-700 dark:border-rose-400 dark:text-rose-300"
            : marks == null
              ? "border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-400"
              : `border-slate-300 ${getMarkTone(toneMarks, maxMarks)}`
        }`}
      />
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          void commit();
        }}
        disabled={saving || maxMarks <= 0}
        className="rounded-md border border-sky-300 bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-60 dark:border-sky-800 dark:bg-sky-900/30 dark:text-sky-300"
      >
        {saving ? "Saving..." : "Save"}
      </button>
      <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
        {displayMarks.toFixed(1)} / {maxMarks.toFixed(1)}
      </p>
      <p className="text-[11px] text-slate-500 dark:text-slate-400">{displayPercentage.toFixed(1)}%</p>
      {error ? <p className="text-[11px] text-rose-600 dark:text-rose-300">{error}</p> : null}
      {!submissionStatus ? (
        <span className="rounded-full border border-dashed border-slate-400 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          Manual
        </span>
      ) : null}
      {gradedBy === "ai" ? (
        <span className="rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
          AI
        </span>
      ) : gradedBy === "teacher" ? (
        <span className="rounded-full border border-sky-300 bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700 dark:border-sky-800 dark:bg-sky-900/40 dark:text-sky-300">
          Edited
        </span>
      ) : null}
    </div>
  );
}
