export type AssignmentType = "assignment" | "quiz" | "question" | "material";
export type AssignmentAction = "assign" | "schedule" | "draft";
export type AssignmentStatus = "published" | "scheduled" | "draft";

export type AttachmentSource = "upload" | "drive" | "link" | "youtube";

export type AssignmentAttachment = {
  id: string;
  source: AttachmentSource;
  name: string;
  url?: string;
  mimeType?: string;
  sizeBytes?: number;
};

export type QuizQuestion = {
  id: string;
  type: "mcq" | "short";
  question: string;
  options: string[];
  correctAnswer: string;
};

export type AssignmentRecord = {
  id: string;
  title: string;
  description: string;
  type: AssignmentType;
  points: number;
  dueDate: string | null;
  topic: string;
  classwork_section_id?: number | null;
  attachments: AssignmentAttachment[];
  quizQuestions: QuizQuestion[];
  createdAt: string;
  className: string;
  status: AssignmentStatus;
  scheduledFor: string | null;
  updatedAt: string;
};

export type CreateAssignmentPayload = {
  title: string;
  description: string;
  type: AssignmentType;
  points: number;
  dueDate: string | null;
  topic: string;
  classwork_section_id?: number | null;
  attachments: AssignmentAttachment[];
  quizQuestions: QuizQuestion[];
  className: string;
  action: AssignmentAction;
  scheduledFor: string | null;
};

export type UpdateAssignmentPayload = Partial<
  Omit<AssignmentRecord, "id" | "createdAt" | "updatedAt">
>;
