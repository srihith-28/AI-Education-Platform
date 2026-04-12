import { randomUUID } from "crypto";

import { readAssignments, writeAssignments } from "./db";
import type { AssignmentRecord, AssignmentStatus, CreateAssignmentPayload, UpdateAssignmentPayload } from "./types";

const resolveStatus = (action: CreateAssignmentPayload["action"]): AssignmentStatus => {
  if (action === "draft") {
    return "draft";
  }
  if (action === "schedule") {
    return "scheduled";
  }
  return "published";
};

const publishScheduledAssignments = (assignments: AssignmentRecord[]): AssignmentRecord[] => {
  const now = Date.now();
  return assignments.map((assignment) => {
    if (
      assignment.status === "scheduled" &&
      assignment.scheduledFor &&
      Date.parse(assignment.scheduledFor) <= now
    ) {
      return {
        ...assignment,
        status: "published",
        updatedAt: new Date().toISOString(),
      };
    }
    return assignment;
  });
};

export const getAssignments = async (): Promise<AssignmentRecord[]> => {
  const current = await readAssignments();
  const upgraded = publishScheduledAssignments(current);
  const changed = JSON.stringify(current) !== JSON.stringify(upgraded);
  if (changed) {
    await writeAssignments(upgraded);
  }
  return upgraded;
};

export const createAssignment = async (
  payload: CreateAssignmentPayload,
): Promise<AssignmentRecord> => {
  const assignments = await getAssignments();
  const now = new Date().toISOString();
  const next: AssignmentRecord = {
    id: randomUUID(),
    title: payload.title.trim(),
    description: payload.description.trim(),
    type: payload.type,
    points: Number.isFinite(payload.points) ? payload.points : 100,
    dueDate: payload.dueDate,
    topic: payload.topic.trim() || "No topic",
    attachments: payload.attachments,
    quizQuestions: payload.quizQuestions,
    createdAt: now,
    className: payload.className.trim() || "Class A",
    status: resolveStatus(payload.action),
    scheduledFor: payload.action === "schedule" ? payload.scheduledFor : null,
    updatedAt: now,
  };

  await writeAssignments([next, ...assignments]);
  return next;
};

export const updateAssignment = async (
  id: string,
  payload: UpdateAssignmentPayload,
): Promise<AssignmentRecord | null> => {
  const assignments = await getAssignments();
  const target = assignments.find((item) => item.id === id);
  if (!target) {
    return null;
  }

  const updated: AssignmentRecord = {
    ...target,
    ...payload,
    topic: (payload.topic ?? target.topic).trim() || "No topic",
    title: (payload.title ?? target.title).trim() || "Untitled",
    className: (payload.className ?? target.className).trim() || "Class A",
    updatedAt: new Date().toISOString(),
  };

  const nextAssignments = assignments.map((item) => (item.id === id ? updated : item));
  await writeAssignments(nextAssignments);
  return updated;
};
