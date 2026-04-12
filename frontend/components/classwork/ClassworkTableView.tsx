"use client";

import Link from "next/link";
import { useState } from "react";
import { AssignmentRecord } from "@/lib/classwork/types";
import { format } from "date-fns";

type ClassworkSection = {
  id: number;
  name: string;
  percentage: number;
};

const normalizeLabel = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const sectionFamilyFromText = (value: string): "quiz" | "assignment" | "mid" | "end" | null => {
  const text = normalizeLabel(value);
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

type ClassworkTableViewProps = {
  sections: ClassworkSection[];
  assignments: AssignmentRecord[];
  loading?: boolean;
  onDelete?: (assignmentId: string) => Promise<void> | void;
};

export function ClassworkTableView({
  sections,
  assignments,
  loading = false,
  onDelete,
}: ClassworkTableViewProps) {
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-slate-800">Classworks</h3>
        <p className="text-center text-sm text-slate-500">Loading classworks...</p>
      </section>
    );
  }

  if (sections.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-slate-800">Classworks</h3>
        <p className="text-center text-sm text-slate-500">
          Create classwork sections first to organize assignments
        </p>
      </section>
    );
  }

  // Group assignments by section
  const assignmentsBySection: Record<number, AssignmentRecord[]> = {};
  const firstSectionByFamily = new Map<string, number>();

  sections.forEach((section) => {
    assignmentsBySection[section.id] = assignments.filter(
      (a) => {
        const titleFamily = sectionFamilyFromText(a.title);
        const sectionFamily = sectionFamilyFromText(section.name);
        if (titleFamily && sectionFamily === titleFamily) {
          return true;
        }
        return a.classwork_section_id === section.id;
      }
    );
    const family = sectionFamilyFromText(section.name);
    if (family && !firstSectionByFamily.has(family)) {
      firstSectionByFamily.set(family, section.id);
    }
  });

  const groupedAssignmentIds = new Set<string>();
  sections.forEach((section) => {
    assignmentsBySection[section.id] = assignmentsBySection[section.id].filter((assignment) => {
      if (groupedAssignmentIds.has(assignment.id)) {
        return false;
      }

      const titleFamily = sectionFamilyFromText(assignment.title);
      if (titleFamily) {
        const familySectionId = firstSectionByFamily.get(titleFamily);
        if (familySectionId && familySectionId !== section.id) {
          return false;
        }
      }

      groupedAssignmentIds.add(assignment.id);
      return true;
    });
  });

  const handleDelete = async (assignmentId: string, title: string) => {
    if (!onDelete) {
      return;
    }

    setPendingDelete({ id: assignmentId, title });
  };

  const confirmDelete = async () => {
    if (!onDelete || !pendingDelete) {
      return;
    }

    try {
      setDeleting(true);
      await onDelete(pendingDelete.id);
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="relative rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <h3 className="mb-4 text-lg font-semibold text-slate-800">Classworks</h3>

      {pendingDelete ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-2xl">
            <h4 className="text-base font-semibold text-slate-800">Delete classwork?</h4>
            <p className="mt-2 text-sm text-slate-600">
              Are you sure you want to delete "{pendingDelete.title}"? This action cannot be undone.
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                disabled={deleting}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={deleting}
                className="rounded-md bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200/70">
              {sections.map((section) => (
                <th
                  key={section.id}
                  className="bg-slate-50/50 px-4 py-3 text-left text-xs font-semibold text-slate-600"
                >
                  <div>{section.name}</div>
                  <div className="text-xs text-slate-500">{section.percentage}%</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {assignments.length === 0 ? (
              <tr>
                <td
                  colSpan={sections.length}
                  className="px-4 py-8 text-center text-sm text-slate-500"
                >
                  No assignments created yet
                </td>
              </tr>
            ) : (
              <tr className="align-top">
                {sections.map((section) => {
                  const items = assignmentsBySection[section.id] || [];
                  return (
                    <td key={section.id} className="px-4 py-3">
                      {items.length === 0 ? (
                        <p className="text-xs text-slate-400">No items</p>
                      ) : (
                        <div className="space-y-2">
                          {items.map((assignment) => (
                            <div
                              key={assignment.id}
                              className="rounded-lg border border-slate-200 bg-slate-50/60 p-2 transition hover:border-sky-300 hover:bg-sky-50/60"
                            >
                              <div className="mb-1 flex items-start justify-between gap-2">
                                <Link
                                  href={`/classwork/${assignment.id}`}
                                  className="min-w-0 flex-1"
                                >
                                  <p className="truncate text-sm font-medium text-slate-800 hover:text-sky-700">{assignment.title}</p>
                                </Link>
                                <button
                                  type="button"
                                  onClick={() => void handleDelete(assignment.id, assignment.title)}
                                  className="rounded px-2 py-0.5 text-xs font-medium text-rose-700 hover:bg-rose-100"
                                >
                                  Delete
                                </button>
                              </div>
                              <p className="text-xs text-slate-500">
                                {assignment.type} • {assignment.points} pts
                              </p>
                              {assignment.dueDate ? (
                                <p className="text-xs text-slate-400">
                                  Due: {format(new Date(assignment.dueDate), "MMM dd")}
                                </p>
                              ) : null}
                              <Link href={`/classwork/${assignment.id}`} className="mt-1 inline-block text-xs font-medium text-sky-700">
                                Open
                              </Link>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
