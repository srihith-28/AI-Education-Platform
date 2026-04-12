"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";

type InviteRole = "teacher" | "student";

type InviteModalProps = {
  open: boolean;
  role: InviteRole;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (email: string, role: InviteRole) => Promise<void>;
};

export function InviteModal({ open, role, loading = false, onClose, onSubmit }: InviteModalProps) {
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }
    setEmail("");
  }, [open, role]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-white/20 bg-slate-100 p-6 text-slate-900 shadow-2xl dark:bg-slate-900 dark:text-slate-100"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-semibold">Invite {role === "teacher" ? "Teacher" : "Student"}</h3>
          <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-slate-200 dark:hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-2 text-sm opacity-75">Enter email to add directly if user exists, or send a pending invite.</p>

        <div className="mt-4 space-y-3">
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@example.com"
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-800"
          />
        </div>

        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-400 px-4 py-2 text-sm dark:border-slate-600"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={loading || !email.trim()}
            onClick={() => void onSubmit(email.trim(), role)}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {loading ? "Sending..." : "Send Invite"}
          </button>
        </div>
      </div>
    </div>
  );
}
