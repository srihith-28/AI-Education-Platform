"use client";

import { useState } from "react";
import { Trash2, Plus } from "lucide-react";
import { api } from "@/lib/api";

type ClassworkSection = {
  id: number;
  course_id: number;
  name: string;
  percentage: number;
  created_at: string;
  updated_at: string;
};

type ClassworkSectionManagerProps = {
  courseId: number | null;
  sections: ClassworkSection[];
  onUpdate: () => void;
  loading?: boolean;
};

export function ClassworkSectionManager({
  courseId,
  sections,
  onUpdate,
  loading = false,
}: ClassworkSectionManagerProps) {
  const [name, setName] = useState("");
  const [percentage, setPercentage] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

  const handleCreate = async () => {
    if (!courseId || !name.trim() || !percentage) {
      setFeedback("Please fill in all fields");
      return;
    }

    const percent = parseFloat(percentage);
    if (isNaN(percent) || percent < 0 || percent > 100) {
      setFeedback("Percentage must be between 0 and 100");
      return;
    }

    setSaving(true);
    setFeedback("");
    try {
      await api.createClassworkSection(courseId, {
        name: name.trim(),
        percentage: percent,
      });
      setName("");
      setPercentage("");
      setFeedback("Section created successfully");
      onUpdate();
      setTimeout(() => setFeedback(""), 3000);
    } catch {
      setFeedback("Failed to create section");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (sectionId: number) => {
    if (!confirm("Delete this classwork section? (Assignments will not be deleted)")) return;

    try {
      await api.deleteClassworkSection(sectionId);
      onUpdate();
      setFeedback("Section deleted successfully");
      setTimeout(() => setFeedback(""), 3000);
    } catch {
      setFeedback("Failed to delete section");
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <h3 className="mb-4 text-lg font-semibold text-slate-800">Classwork Sections</h3>

      {/* Input Form */}
      <div className="mb-4 space-y-3 rounded-lg border border-slate-200/70 bg-slate-50/50 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input
            type="text"
            placeholder="Section name (e.g., Quiz, Assignment)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg border border-slate-300/80 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-300/50"
          />
          <input
            type="number"
            placeholder="Percentage (0-100)"
            value={percentage}
            onChange={(e) => setPercentage(e.target.value)}
            min="0"
            max="100"
            className="rounded-lg border border-slate-300/80 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-300/50"
          />
          <button
            onClick={handleCreate}
            disabled={saving || loading}
            className="flex items-center justify-center gap-2 rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800 disabled:bg-slate-400"
          >
            <Plus size={16} />
            Save
          </button>
        </div>
        {feedback && (
          <p
            className={`text-sm ${
              feedback.includes("Failed") ? "text-rose-600" : "text-emerald-600"
            }`}
          >
            {feedback}
          </p>
        )}
      </div>

      {/* Sections List */}
      {loading ? (
        <p className="text-center text-sm text-slate-500">Loading sections...</p>
      ) : sections.length === 0 ? (
        <p className="text-center text-sm text-slate-500">No sections created yet</p>
      ) : (
        <div className="space-y-2">
          {sections.map((section) => (
            <div
              key={section.id}
              className="flex items-center justify-between rounded-lg border border-slate-200/70 bg-slate-50/50 px-4 py-3 hover:bg-white"
            >
              <div className="flex-1">
                <p className="font-medium text-slate-800">{section.name}</p>
                <p className="text-xs text-slate-500">{section.percentage}%</p>
              </div>
              <button
                onClick={() => handleDelete(section.id)}
                className="ml-2 rounded-lg p-2 text-slate-600 hover:bg-rose-100 hover:text-rose-700"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
