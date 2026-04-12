"use client";

import { Calendar, ClipboardList, Clock3 } from "lucide-react";

import type { AssignmentRecord } from "@/lib/classwork/types";

type TopicSectionProps = {
  topic: string;
  assignments: AssignmentRecord[];
};

const typeLabel: Record<AssignmentRecord["type"], string> = {
  assignment: "Assignment",
  quiz: "Quiz Assignment",
  question: "Question",
  material: "Material",
};

const statusStyles: Record<AssignmentRecord["status"], string> = {
  published: "bg-emerald-100 text-emerald-700",
  scheduled: "bg-amber-100 text-amber-700",
  draft: "bg-slate-200 text-slate-700",
};

const formatDate = (value: string | null): string => {
  if (!value) {
    return "No due date";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "No due date";
  }

  return parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export function TopicSection({ topic, assignments }: TopicSectionProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-100 px-5 py-4">
        <h3 className="text-lg font-semibold text-slate-800">{topic}</h3>
      </header>

      <div className="divide-y divide-slate-100">
        {assignments.map((assignment) => (
          <article key={assignment.id} className="px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">{typeLabel[assignment.type]}</p>
                <h4 className="mt-0.5 text-base font-semibold text-slate-800">{assignment.title}</h4>
                {assignment.description ? (
                  <p className="mt-1 text-sm text-slate-600">{assignment.description}</p>
                ) : null}
              </div>

              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[assignment.status]}`}>
                {assignment.status}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1">
                <ClipboardList className="h-3.5 w-3.5" />
                {assignment.points} points
              </span>
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Due: {formatDate(assignment.dueDate)}
              </span>
              {assignment.status === "scheduled" && assignment.scheduledFor ? (
                <span className="inline-flex items-center gap-1">
                  <Clock3 className="h-3.5 w-3.5" />
                  Posts on: {formatDate(assignment.scheduledFor)}
                </span>
              ) : null}
            </div>

            {assignment.attachments.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {assignment.attachments.map((attachment) => (
                  <span key={attachment.id} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">
                    {attachment.name}
                  </span>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
