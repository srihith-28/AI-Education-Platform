"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BookOpenCheck, ChevronDown, ChevronRight, ClipboardList, Eye, FileText, Filter } from "lucide-react";

import { api } from "@/lib/api";

type TopicRow = {
  id: number;
  course_id: number;
  title: string;
  order_index: number;
};

type ClassworkItemRow = {
  id: string;
  course_id: number;
  topic_id: number | null;
  type: "assignment" | "material" | "quiz";
  title: string;
  description: string;
  due_date: string | null;
  created_at: string;
  status: "assigned" | "turned_in" | "missing" | "late";
};

type ClassworkGroup = {
  topic: { id: number; title: string; order_index: number } | null;
  items: ClassworkItemRow[];
};

type Props = {
  courseId: number;
};

const statusOptions: Array<{ value: "all" | "assigned" | "turned_in" | "missing" | "late"; label: string }> = [
  { value: "all", label: "All" },
  { value: "assigned", label: "Assigned" },
  { value: "turned_in", label: "Turned in" },
  { value: "missing", label: "Missing" },
  { value: "late", label: "Late" },
];

const statusBadgeClass: Record<ClassworkItemRow["status"], string> = {
  assigned: "border-slate-300/70 bg-white/60 text-slate-700 dark:border-slate-500/60 dark:bg-slate-700/40 dark:text-slate-100",
  turned_in: "border-emerald-400/50 bg-emerald-100/70 text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-900/30 dark:text-emerald-200",
  missing: "border-rose-400/50 bg-rose-100/70 text-rose-800 dark:border-rose-400/40 dark:bg-rose-900/30 dark:text-rose-200",
  late: "border-amber-400/50 bg-amber-100/70 text-amber-800 dark:border-amber-400/40 dark:bg-amber-900/30 dark:text-amber-200",
};

function getTypeIcon(type: ClassworkItemRow["type"]) {
  if (type === "quiz") {
    return <BookOpenCheck className="h-4 w-4" />;
  }
  if (type === "material") {
    return <FileText className="h-4 w-4" />;
  }
  return <ClipboardList className="h-4 w-4" />;
}

export function ClassworkPage({ courseId }: Props) {
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [groups, setGroups] = useState<ClassworkGroup[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<"all" | number>("all");
  const [selectedStatus, setSelectedStatus] = useState<"all" | "assigned" | "turned_in" | "missing" | "late">("all");
  const [collapsedTopics, setCollapsedTopics] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const loadTopics = async () => {
      try {
        const response = await api.classworkTopics(courseId);
        if (!active) {
          return;
        }
        setTopics(response.data);
      } catch {
        if (!active) {
          return;
        }
        setTopics([]);
      }
    };

    void loadTopics();

    return () => {
      active = false;
    };
  }, [courseId]);

  useEffect(() => {
    let active = true;

    const loadClasswork = async () => {
      try {
        setLoading(true);
        setError("");
        const response = await api.classworkByCourse(courseId, selectedTopic === "all" ? null : selectedTopic);
        if (!active) {
          return;
        }
        setGroups(response.data);
        setCollapsedTopics(new Set());
      } catch (err) {
        if (!active) {
          return;
        }
        setGroups([]);
        setError(err instanceof Error && err.message ? err.message : "Could not load classwork.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadClasswork();

    return () => {
      active = false;
    };
  }, [courseId, selectedTopic]);

  const visibleGroups = useMemo(() => {
    if (selectedStatus === "all") {
      return groups;
    }

    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => item.status === selectedStatus),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, selectedStatus]);

  const totalVisibleItems = useMemo(
    () => visibleGroups.reduce((sum, group) => sum + group.items.length, 0),
    [visibleGroups],
  );

  const toggleTopic = (key: string) => {
    setCollapsedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const collapseAll = () => {
    setCollapsedTopics(new Set(visibleGroups.map((group) => String(group.topic?.id ?? "untitled"))));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-heading text-2xl font-semibold">Classwork</h3>
          <p className="mt-1 text-sm opacity-75">Review assignments, materials, and quizzes grouped by topic.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/submissions?courseId=${courseId}`}
            className="inline-flex items-center gap-2 rounded-full border border-slate-300/80 bg-white/80 px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-white dark:border-slate-700 dark:bg-slate-900/65 dark:text-slate-100 dark:hover:bg-slate-800"
          >
            <Eye className="h-4 w-4" />
            View your work
          </Link>
          <button
            type="button"
            onClick={collapseAll}
            className="inline-flex items-center gap-2 rounded-full border border-slate-300/80 bg-white/80 px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-white dark:border-slate-700 dark:bg-slate-900/65 dark:text-slate-100 dark:hover:bg-slate-800"
          >
            Collapse all
          </button>
        </div>
      </div>

      <div className="grid gap-3 rounded-2xl border border-slate-200/80 bg-white/75 p-4 md:grid-cols-2 dark:border-slate-700 dark:bg-slate-900/55">
        <label className="space-y-1 text-sm">
          <span className="inline-flex items-center gap-2 font-medium opacity-80">
            <Filter className="h-4 w-4" />
            Topic
          </span>
          <select
            value={selectedTopic}
            onChange={(event) => {
              const value = event.target.value;
              setSelectedTopic(value === "all" ? "all" : Number(value));
            }}
            className="w-full rounded-xl border border-slate-300/80 bg-white/90 px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/35"
          >
            <option value="all">All topics</option>
            {topics.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.title}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium opacity-80">Status</span>
          <select
            value={selectedStatus}
            onChange={(event) => setSelectedStatus(event.target.value as typeof selectedStatus)}
            className="w-full rounded-xl border border-slate-300/80 bg-white/90 px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/35"
          >
            {statusOptions.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200/80 bg-white/75 p-6 text-sm opacity-90 dark:border-slate-700 dark:bg-slate-900/55">Loading classwork...</div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-300/40 bg-rose-100/30 p-6 text-sm text-rose-700 dark:text-rose-300">{error}</div>
      ) : totalVisibleItems === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300/80 bg-white/70 p-6 text-sm opacity-90 dark:border-slate-700 dark:bg-slate-900/50">
          No classwork matches the current filters.
        </div>
      ) : (
        <div className="space-y-3">
          {visibleGroups.map((group) => {
            const key = String(group.topic?.id ?? "untitled");
            const collapsed = collapsedTopics.has(key);
            return (
              <section key={key} className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/75 dark:border-slate-700 dark:bg-slate-900/55">
                <button
                  type="button"
                  onClick={() => toggleTopic(key)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left"
                >
                  <div>
                    <h4 className="font-semibold">{group.topic?.title || "Untitled topic"}</h4>
                    <p className="text-xs opacity-70">{group.items.length} item{group.items.length === 1 ? "" : "s"}</p>
                  </div>
                  {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>

                {!collapsed && (
                  <div className="border-t border-slate-200/80 dark:border-slate-700/80">
                    {group.items.map((item) => (
                      <Link
                        key={item.id}
                        href={`/classwork/${item.id}`}
                        className="flex items-center justify-between gap-3 border-b border-slate-200/70 px-4 py-3 transition hover:bg-white dark:border-slate-700/70 dark:hover:bg-slate-800/65 last:border-b-0"
                      >
                        <div className="min-w-0">
                          <div className="inline-flex items-center gap-2 text-sm font-medium">
                            {getTypeIcon(item.type)}
                            <span className="truncate">{item.title}</span>
                          </div>
                          <p className="mt-1 text-xs opacity-70">
                            {item.due_date ? `Due ${new Date(item.due_date).toLocaleDateString()}` : "No due date"}
                          </p>
                        </div>

                        <span className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadgeClass[item.status]}`}>
                          {item.status.replace("_", " ")}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
