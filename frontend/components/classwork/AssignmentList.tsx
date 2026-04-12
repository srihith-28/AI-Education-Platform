"use client";

import type { AssignmentRecord } from "@/lib/classwork/types";

import { TopicSection } from "./TopicSection";

type AssignmentListProps = {
  assignments: AssignmentRecord[];
  loading: boolean;
};

const groupByTopic = (assignments: AssignmentRecord[]): Array<{ topic: string; assignments: AssignmentRecord[] }> => {
  const map = new Map<string, AssignmentRecord[]>();

  assignments.forEach((assignment) => {
    const key = assignment.topic.trim() || "No topic";
    const current = map.get(key) || [];
    current.push(assignment);
    map.set(key, current);
  });

  return Array.from(map.entries()).map(([topic, items]) => ({
    topic,
    assignments: items,
  }));
};

export function AssignmentList({ assignments, loading }: AssignmentListProps) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
        Loading assignments...
      </div>
    );
  }

  if (assignments.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
        <h3 className="text-lg font-semibold text-slate-700">No classwork yet</h3>
        <p className="mt-1 text-sm text-slate-500">Use + Create to add assignments, quizzes, questions, or materials.</p>
      </div>
    );
  }

  const grouped = groupByTopic(assignments);

  return (
    <div className="space-y-4">
      {grouped.map((entry) => (
        <TopicSection key={entry.topic} topic={entry.topic} assignments={entry.assignments} />
      ))}
    </div>
  );
}
