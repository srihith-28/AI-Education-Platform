import { format } from "date-fns";

import { EventCard } from "@/components/calendar/EventCard";
import { CalendarEvent } from "@/components/calendar/types";


type DayColumnProps = {
  day: Date;
  events: CalendarEvent[];
  isToday: boolean;
  onEventClick: (event: CalendarEvent) => void;
};

export function DayColumn({ day, events, isToday, onEventClick }: DayColumnProps) {
  return (
    <div className="flex min-h-[420px] flex-col border-r border-slate-200/80 last:border-r-0 dark:border-slate-700/80">
      <div className="border-b border-slate-200/80 px-3 py-3 dark:border-slate-700/80">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{format(day, "EEE")}</p>
        <div className="mt-1 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{format(day, "MMM d")}</p>
          <div
            className={`h-8 w-8 rounded-full text-sm font-semibold ${
              isToday ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-100"
            } flex items-center justify-center`}
          >
            {format(day, "d")}
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {events.length === 0 ? (
          <p className="px-1 pt-1 text-xs text-slate-500 dark:text-slate-400">No items</p>
        ) : (
          events.map((event) => <EventCard key={event.id} event={event} onClick={onEventClick} />)
        )}
      </div>
    </div>
  );
}
