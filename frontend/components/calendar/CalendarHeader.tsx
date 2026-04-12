import { format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";


type CourseFilterOption = {
  id: number;
  title: string;
  course_code: string;
};

type CalendarHeaderProps = {
  weekStart: Date;
  weekEnd: Date;
  selectedCourseId: number | null;
  courses: CourseFilterOption[];
  onCourseChange: (courseId: number | null) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
};

export function CalendarHeader({
  weekStart,
  weekEnd,
  selectedCourseId,
  courses,
  onCourseChange,
  onPrevWeek,
  onNextWeek,
}: CalendarHeaderProps) {
  const weekLabel = `${format(weekStart, "MMM d")} - ${format(weekEnd, "MMM d, yyyy")}`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <select
          className="rounded-xl border border-slate-300/80 bg-white/90 px-4 py-2 text-sm font-medium text-slate-900 shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-sky-400 dark:focus:ring-sky-500/40"
          value={selectedCourseId ?? "all"}
          onChange={(event) => {
            const value = event.target.value;
            onCourseChange(value === "all" ? null : Number(value));
          }}
        >
          <option value="all">All classes</option>
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.course_code} - {course.title}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onPrevWeek}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300/80 bg-white/85 text-slate-800 transition hover:bg-white dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100 dark:hover:bg-slate-800"
          aria-label="Previous week"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <p className="min-w-[180px] text-center text-sm font-semibold">{weekLabel}</p>
        <button
          type="button"
          onClick={onNextWeek}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300/80 bg-white/85 text-slate-800 transition hover:bg-white dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100 dark:hover:bg-slate-800"
          aria-label="Next week"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
