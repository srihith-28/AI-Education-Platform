import { NextResponse } from "next/server";

import { createAssignment, getAssignments } from "@/lib/classwork/service";
import type { CreateAssignmentPayload } from "@/lib/classwork/types";

const validatePayload = (payload: Partial<CreateAssignmentPayload>): string | null => {
  if (!payload.title || !payload.title.trim()) {
    return "Title is required";
  }
  if (!payload.type) {
    return "Type is required";
  }
  if (!payload.action) {
    return "Action is required";
  }
  if (payload.action === "schedule" && !payload.scheduledFor) {
    return "Scheduled date and time are required";
  }
  return null;
};

export async function GET() {
  try {
    const data = await getAssignments();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: "Could not fetch assignments",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<CreateAssignmentPayload>;
    const message = validatePayload(body);
    if (message) {
      return NextResponse.json({ success: false, message }, { status: 400 });
    }

    const created = await createAssignment({
      title: body.title || "",
      description: body.description || "",
      type: body.type || "assignment",
      points: Number.isFinite(body.points) ? Number(body.points) : 100,
      dueDate: body.dueDate || null,
      topic: body.topic || "No topic",
      attachments: Array.isArray(body.attachments) ? body.attachments : [],
      quizQuestions: Array.isArray(body.quizQuestions) ? body.quizQuestions : [],
      className: body.className || "Class A",
      action: body.action || "assign",
      scheduledFor: body.scheduledFor || null,
    });

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: "Could not create assignment",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
