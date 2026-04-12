import { NextResponse } from "next/server";

import { updateAssignment } from "@/lib/classwork/service";
import type { UpdateAssignmentPayload } from "@/lib/classwork/types";

type Context = {
  params: {
    id: string;
  };
};

export async function PATCH(request: Request, context: Context) {
  try {
    const body = (await request.json()) as UpdateAssignmentPayload;
    const updated = await updateAssignment(context.params.id, body);

    if (!updated) {
      return NextResponse.json({ success: false, message: "Assignment not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: "Could not update assignment",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
