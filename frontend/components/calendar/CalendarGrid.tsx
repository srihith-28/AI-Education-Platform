import { isSameDay } from "date-fns";

import { DayColumn } from "@/components/calendar/DayColumn";
import { CalendarEvent } from "@/components/calendar/types";


type CalendarGridProps = {
  weekDays: Date[];
  eventsByDate: Record<string, CalendarEvent[]>;
  onEventClick: (event: CalendarEvent) => void;
};

const keyForDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export function CalendarGrid({ weekDays, eventsByDate, onEventClick }: CalendarGridProps) {
  const today = new Date();

  return (
    <div className="grid grid-cols-7 rounded-2xl border border-slate-200/80 bg-white/75 backdrop-blur dark:border-slate-700 dark:bg-slate-900/60">
      {weekDays.map((day) => {
        const key = keyForDate(day);
        return (
          <DayColumn
            key={key}
            day={day}
            events={eventsByDate[key] || []}
            isToday={isSameDay(today, day)}
            onEventClick={onEventClick}
          />
        );
      })}
    </div>
  );
}
