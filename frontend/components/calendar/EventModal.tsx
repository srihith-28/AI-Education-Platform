import { format } from "date-fns";
import { X } from "lucide-react";

import { CalendarEvent } from "@/components/calendar/types";


type EventModalProps = {
  event: CalendarEvent | null;
  onClose: () => void;
};

const formatTime = (value: string | null): string => {
  if (!value) {
    return "No specific time";
  }
  const [hours, minutes] = value.split(":");
  const parsedHours = Number(hours);
  if (Number.isNaN(parsedHours)) {
    return value;
  }
  const suffix = parsedHours >= 12 ? "PM" : "AM";
  const normalized = parsedHours % 12 || 12;
  return `${normalized}:${minutes} ${suffix}`;
};

export function EventModal({ event, onClose }: EventModalProps) {
  if (!event) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="glass w-full max-w-xl rounded-3xl border border-slate-200/80 p-6 shadow-glass dark:border-slate-700" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{event.type}</p>
            <h3 className="mt-1 font-heading text-2xl font-semibold">{event.title}</h3>
            <p className="mt-1 text-sm opacity-80">{event.course_code} - {event.course_title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300/80 bg-white/85 text-slate-800 transition hover:bg-white dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100 dark:hover:bg-slate-800"
            aria-label="Close event details"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 grid gap-2 text-sm">
          <p>
            <span className="font-semibold">Due date:</span>{" "}
            {format(new Date(`${event.due_date}T00:00:00`), "EEE, MMM d, yyyy")}
          </p>
          <p>
            <span className="font-semibold">Due time:</span> {formatTime(event.due_time)}
          </p>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200/80 bg-white/75 p-4 text-sm leading-6 dark:border-slate-700 dark:bg-slate-900/55">
          {event.description?.trim() ? event.description : "No additional details provided."}
        </div>
      </div>
    </div>
  );
}
