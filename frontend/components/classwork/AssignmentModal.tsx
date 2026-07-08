"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CalendarClock, FileUp, FolderKanban, Link2, ListTodo, Youtube } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type {
  AssignmentAction,
  AssignmentAttachment,
  AssignmentRecord,
  AssignmentType,
  CreateAssignmentPayload,
  QuizQuestion,
} from "@/lib/classwork/types";

import { DueDatePicker } from "./DueDatePicker";
import { QuizBuilder } from "./QuizBuilder";

type ClassworkSection = {
  id: number;
  name: string;
  percentage: number;
};

type AssignmentModalProps = {
  open: boolean;
  type: AssignmentType;
  classes: string[];
  sections: ClassworkSection[];
  topics: string[];
  onClose: () => void;
  onSubmit: (payload: CreateAssignmentPayload) => Promise<void>;
  saving: boolean;
};

const actionLabel: Record<AssignmentAction, string> = {
  assign: "Assign",
  schedule: "Schedule",
  draft: "Save Draft",
};

const typeHeadline: Record<AssignmentType, string> = {
  assignment: "Create Assignment",
  quiz: "Create Quiz Assignment",
  question: "Create Question",
  material: "Create Material",
};

const topicFallback = ["No topic", "Homework", "Exams", "Projects", "Reference"];

const combineDateTime = (dateValue: string, timeValue: string): string | null => {
  if (!dateValue) {
    return null;
  }
  const timePart = timeValue || "23:59";
  const timestamp = new Date(`${dateValue}T${timePart}:00`);
  if (Number.isNaN(timestamp.getTime())) {
    return null;
  }
  return timestamp.toISOString();
};

export function AssignmentModal({
  open,
  type,
  classes,
  sections,
  topics,
  onClose,
  onSubmit,
  saving,
}: AssignmentModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [className, setClassName] = useState(classes[0] || "Class A");
  // Require explicit section choice so new items are not accidentally assigned to the first column.
  const [sectionId, setSectionId] = useState<number | undefined>(undefined);
  const [points, setPoints] = useState("100");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [topic, setTopic] = useState("No topic");
  const [selectedAction, setSelectedAction] = useState<AssignmentAction>("assign");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [attachments, setAttachments] = useState<AssignmentAttachment[]>([]);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }

    setTitle("");
    setDescription("");
    setClassName(classes[0] || "Class A");
    setSectionId(undefined);
    setPoints("100");
    setDueDate("");
    setDueTime("");
    setTopic("No topic");
    setSelectedAction("assign");
    setScheduleDate("");
    setScheduleTime("");
    setAttachments([]);
    setQuizQuestions([]);
    setError("");
  }, [open, classes, sections, type]);

  const availableTopics = useMemo(() => {
    const set = new Set(["No topic", ...topics, ...topicFallback]);
    return Array.from(set);
  }, [topics]);

  const addAttachment = (attachment: AssignmentAttachment) => {
    setAttachments((prev) => [attachment, ...prev]);
  };

  const onAddFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    addAttachment({
      id: crypto.randomUUID(),
      source: "upload",
      name: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    });
  };

  const onAddFromPrompt = (source: "drive" | "link" | "youtube") => {
    const url = window.prompt(`Paste ${source === "drive" ? "Google Drive" : source === "link" ? "link" : "YouTube"} URL`);
    if (!url) {
      return;
    }

    addAttachment({
      id: crypto.randomUUID(),
      source,
      name: url,
      url,
    });
  };

  const submit = async () => {
    setError("");

    if (!title.trim()) {
      setError("Title is required.");
      return;
    }

    if (type === "quiz" && quizQuestions.length === 0) {
      setError("Add at least one quiz question.");
      return;
    }

    if (type !== "material" && sectionId == null) {
      setError("Select a classwork section so this item appears in the correct grade column.");
      return;
    }

    const payload: CreateAssignmentPayload = {
      title,
      description,
      type,
      points: Number(points) || 0,
      dueDate: combineDateTime(dueDate, dueTime),
      topic,
      classwork_section_id: sectionId,
      attachments,
      quizQuestions,
      className,
      action: selectedAction,
      scheduledFor: selectedAction === "schedule" ? combineDateTime(scheduleDate, scheduleTime) : null,
    };

    if (selectedAction === "schedule" && !payload.scheduledFor) {
      setError("Scheduled date and time are required.");
      return;
    }

    await onSubmit(payload);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/65 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="mx-auto my-8 w-full max-w-6xl overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-50 text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
              <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{typeHeadline[type]}</h3>
              <div className="flex items-center gap-2">
                <select
                  value={selectedAction}
                  onChange={(event) => setSelectedAction(event.target.value as AssignmentAction)}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="assign">Assign</option>
                  <option value="schedule">Schedule</option>
                  <option value="draft">Save Draft</option>
                </select>
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={saving}
                  className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-500 disabled:opacity-60"
                >
                  {saving ? "Saving..." : actionLabel[selectedAction]}
                </button>
              </div>
            </div>

            {error ? (
              <div className="border-b border-red-200 bg-red-50 px-6 py-3 text-sm font-medium text-red-600 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
                {error}
              </div>
            ) : null}

            <div className="max-h-[calc(100vh-10rem)] overflow-y-auto p-6">
              <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
              <section className="space-y-4">
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Title"
                  className="w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-sky-900"
                />

                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Instructions"
                  rows={6}
                  className="w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-sky-900"
                />

                <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800/70">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Attachment options</p>
                  <div className="flex flex-wrap gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-700">
                      <FileUp className="h-3.5 w-3.5" />
                      Upload file
                      <input type="file" className="hidden" onChange={onAddFile} />
                    </label>
                    <button
                      type="button"
                      onClick={() => onAddFromPrompt("drive")}
                      className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-700"
                    >
                      <FolderKanban className="h-3.5 w-3.5" />
                      Google Drive
                    </button>
                    <button
                      type="button"
                      onClick={() => onAddFromPrompt("link")}
                      className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-700"
                    >
                      <Link2 className="h-3.5 w-3.5" />
                      Link
                    </button>
                    <button
                      type="button"
                      onClick={() => onAddFromPrompt("youtube")}
                      className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-700"
                    >
                      <Youtube className="h-3.5 w-3.5" />
                      YouTube
                    </button>
                  </div>

                  {attachments.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {attachments.map((attachment) => (
                        <span key={attachment.id} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
                          {attachment.name}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                {type === "quiz" ? (
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={() => {
                        if (quizQuestions.length === 0) {
                          setQuizQuestions([
                            {
                              id: crypto.randomUUID(),
                              type: "mcq",
                              question: "",
                              options: ["", "", "", ""],
                              correctAnswer: "",
                            },
                          ]);
                        }
                      }}
                      className="rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-100 dark:border-sky-700 dark:bg-sky-900/30 dark:text-sky-200 dark:hover:bg-sky-900/50"
                    >
                      Create Quiz
                    </button>
                    <QuizBuilder questions={quizQuestions} onChange={setQuizQuestions} />
                  </div>
                ) : null}
              </section>

              <aside className="space-y-3">
                <div className={`space-y-1 rounded-lg border bg-white p-3 dark:bg-slate-800/70 ${error && type !== "material" && sectionId == null ? "border-red-400 shadow-[0_0_0_1px_rgba(248,113,113,1)]" : "border-slate-200 dark:border-slate-700"}`}>
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Classwork Section</label>
                  <select
                    value={sectionId || ""}
                    onChange={(event) => setSectionId(event.target.value ? Number(event.target.value) : undefined)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-sky-900"
                  >
                    <option value="">-- Select section (required) --</option>
                    {sections.map((section) => (
                      <option key={section.id} value={section.id}>
                        {section.name} ({section.percentage}%)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800/70">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Points</label>
                  <input
                    type="number"
                    min={0}
                    value={points}
                    onChange={(event) => setPoints(event.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-sky-900"
                  />
                </div>

                <DueDatePicker dateValue={dueDate} timeValue={dueTime} onDateChange={setDueDate} onTimeChange={setDueTime} />

                <div className="space-y-1 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800/70">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Topic</label>
                  <select
                    value={topic}
                    onChange={(event) => setTopic(event.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-sky-900"
                  >
                    {availableTopics.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedAction === "schedule" ? (
                  <div className={`space-y-2 rounded-lg border bg-white p-3 dark:bg-slate-800/70 ${error && selectedAction === "schedule" && !combineDateTime(scheduleDate, scheduleTime) ? "border-red-400 shadow-[0_0_0_1px_rgba(248,113,113,1)]" : "border-slate-200 dark:border-slate-700"}`}>
                    <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                      <CalendarClock className="h-4 w-4" />
                      Schedule for
                    </p>
                    <input
                      type="date"
                      value={scheduleDate}
                      onChange={(event) => setScheduleDate(event.target.value)}
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-sky-900"
                    />
                    <input
                      type="time"
                      value={scheduleTime}
                      onChange={(event) => setScheduleTime(event.target.value)}
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-sky-900"
                    />
                  </div>
                ) : null}

                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-700"
                >
                  <ListTodo className="h-4 w-4" />
                  Rubric
                </button>
              </aside>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
