"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CircleCheck, Clock3, AlertTriangle } from "lucide-react";

import { GlassCard } from "@/components/glass-card";
import { ThemeToggle } from "@/components/theme-toggle";
import { api } from "@/lib/api";
import { authStorage } from "@/lib/auth";

type SubmissionRow = {
  id: number;
  classwork_id: string;
  course_id: number;
  status: "assigned" | "turned_in" | "missing" | "late";
  submitted_at: string | null;
};

function StatusPill({ status }: { status: SubmissionRow["status"] }) {
  if (status === "turned_in") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/50 bg-emerald-100/70 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-900/30 dark:text-emerald-200">
        <CircleCheck className="h-3.5 w-3.5" /> Turned in
      </span>
    );
  }
  if (status === "late") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/50 bg-amber-100/70 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:border-amber-400/40 dark:bg-amber-900/30 dark:text-amber-200">
        <Clock3 className="h-3.5 w-3.5" /> Late
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/50 bg-rose-100/70 px-2.5 py-1 text-xs font-semibold text-rose-800 dark:border-rose-400/40 dark:bg-rose-900/30 dark:text-rose-200">
      <AlertTriangle className="h-3.5 w-3.5" /> {status === "missing" ? "Missing" : "Assigned"}
    </span>
  );
}

function SubmissionsPageContent() {
  const searchParams = useSearchParams();
  const courseId = Number(searchParams.get("courseId") || 0) || null;

  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const studentId = authStorage.getUserId();
    if (!studentId) {
      setError("Could not determine your student profile from the current session.");
      return;
    }

    let active = true;

    const loadSubmissions = async () => {
      try {
        setLoading(true);
        setError("");
        const response = await api.studentSubmissions(studentId, courseId);
        if (!active) {
          return;
        }
        setRows(response.data);
      } catch (err) {
        if (!active) {
          return;
        }
        setRows([]);
        setError(err instanceof Error && err.message ? err.message : "Could not fetch submissions.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadSubmissions();

    return () => {
      active = false;
    };
  }, [courseId]);

  const summary = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.total += 1;
        if (row.status === "turned_in") {
          acc.turnedIn += 1;
        } else if (row.status === "late") {
          acc.late += 1;
        } else if (row.status === "missing") {
          acc.missing += 1;
        }
        return acc;
      },
      { total: 0, turnedIn: 0, late: 0, missing: 0 },
    );
  }, [rows]);

  return (
    <main className="mx-auto min-h-screen max-w-5xl space-y-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <Link href="/dashboard/student" className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/30 px-4 py-2 text-sm font-medium hover:bg-white/45">
          <ArrowLeft className="h-4 w-4" />
          Back to classroom
        </Link>
        <ThemeToggle />
      </div>

      <GlassCard className="space-y-4 p-6">
        <div>
          <h1 className="font-heading text-3xl font-bold">Your Work</h1>
          <p className="mt-1 text-sm opacity-75">Submission history for the selected classwork items.</p>
        </div>

        <div className="grid gap-3 rounded-2xl border border-white/15 bg-white/20 p-4 text-sm sm:grid-cols-4">
          <p><span className="opacity-70">Total:</span> {summary.total}</p>
          <p><span className="opacity-70">Turned in:</span> {summary.turnedIn}</p>
          <p><span className="opacity-70">Late:</span> {summary.late}</p>
          <p><span className="opacity-70">Missing:</span> {summary.missing}</p>
        </div>

        {loading ? (
          <p className="text-sm opacity-75">Loading submissions...</p>
        ) : error ? (
          <p className="text-sm text-rose-600 dark:text-rose-300">{error}</p>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/20 bg-white/15 p-6 text-sm opacity-80">
            No submissions found for this selection.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-white/20 bg-white/20">
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-white/15 px-4 py-3 text-xs font-semibold uppercase tracking-wide opacity-70">
              <span>Classwork</span>
              <span>Status</span>
              <span>Submitted</span>
            </div>
            {rows.map((row) => (
              <div key={row.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-white/10 px-4 py-3 text-sm last:border-b-0">
                <Link href={`/classwork/${row.classwork_id}`} className="truncate font-medium text-sky-700 hover:underline dark:text-sky-300">
                  {row.classwork_id}
                </Link>
                <StatusPill status={row.status} />
                <span className="text-xs opacity-70">{row.submitted_at ? new Date(row.submitted_at).toLocaleString() : "-"}</span>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </main>
  );
}

export default function SubmissionsPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto min-h-screen max-w-5xl space-y-4 p-4">
          <GlassCard className="p-6 text-sm opacity-75">Loading submissions...</GlassCard>
        </main>
      }
    >
      <SubmissionsPageContent />
    </Suspense>
  );
}
