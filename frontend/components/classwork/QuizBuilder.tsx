"use client";

import { Plus, Trash2 } from "lucide-react";

import type { QuizQuestion } from "@/lib/classwork/types";

type QuizBuilderProps = {
  questions: QuizQuestion[];
  onChange: (questions: QuizQuestion[]) => void;
};

const emptyMcqQuestion = (): QuizQuestion => ({
  id: crypto.randomUUID(),
  type: "mcq",
  question: "",
  options: ["", "", "", ""],
  correctAnswer: "",
});

const emptyShortQuestion = (): QuizQuestion => ({
  id: crypto.randomUUID(),
  type: "short",
  question: "",
  options: [],
  correctAnswer: "",
});

export function QuizBuilder({ questions, onChange }: QuizBuilderProps) {
  const updateQuestion = (id: string, patch: Partial<QuizQuestion>) => {
    onChange(questions.map((question) => (question.id === id ? { ...question, ...patch } : question)));
  };

  const updateOption = (id: string, index: number, value: string) => {
    onChange(
      questions.map((question) => {
        if (question.id !== id) {
          return question;
        }

        const nextOptions = [...question.options];
        nextOptions[index] = value;
        const shouldClearAnswer = question.correctAnswer === question.options[index] && question.correctAnswer !== value;

        return {
          ...question,
          options: nextOptions,
          correctAnswer: shouldClearAnswer ? "" : question.correctAnswer,
        };
      }),
    );
  };

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-slate-700">Quiz Editor</h4>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onChange([...questions, emptyMcqQuestion()])}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            <Plus className="h-3.5 w-3.5" />
            Add MCQ
          </button>
          <button
            type="button"
            onClick={() => onChange([...questions, emptyShortQuestion()])}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Short Answer
          </button>
        </div>
      </div>

      {questions.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 bg-white p-3 text-sm text-slate-500">
          No quiz questions yet. Add one to build the quiz assignment.
        </p>
      ) : (
        <div className="space-y-4">
          {questions.map((question, index) => (
            <div key={question.id} className="rounded-md border border-slate-200 bg-white p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Q{index + 1} - {question.type === "mcq" ? "Multiple Choice" : "Short Answer"}
                </p>
                <button
                  type="button"
                  onClick={() => onChange(questions.filter((item) => item.id !== question.id))}
                  className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-red-500"
                  aria-label="Remove question"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <input
                type="text"
                value={question.question}
                onChange={(event) => updateQuestion(question.id, { question: event.target.value })}
                placeholder="Enter your question"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
              />

              {question.type === "mcq" ? (
                <div className="mt-3 space-y-2">
                  {question.options.map((option, optionIndex) => (
                    <div key={`${question.id}-${optionIndex}`} className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={question.correctAnswer === option && option.trim().length > 0}
                        onChange={() => updateQuestion(question.id, { correctAnswer: option })}
                        disabled={!option.trim()}
                        aria-label={`Select option ${optionIndex + 1} as correct answer`}
                      />
                      <input
                        type="text"
                        value={option}
                        onChange={(event) => updateOption(question.id, optionIndex, event.target.value)}
                        placeholder={`Option ${optionIndex + 1}`}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3">
                  <input
                    type="text"
                    value={question.correctAnswer}
                    onChange={(event) => updateQuestion(question.id, { correctAnswer: event.target.value })}
                    placeholder="Expected short answer"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
