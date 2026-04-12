"use client";

import { CalendarClock } from "lucide-react";

type DueDatePickerProps = {
  dateValue: string;
  timeValue: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
};

export function DueDatePicker({ dateValue, timeValue, onDateChange, onTimeChange }: DueDatePickerProps) {
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <CalendarClock className="h-4 w-4" />
        Due Date
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          type="date"
          value={dateValue}
          onChange={(event) => onDateChange(event.target.value)}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500"
        />
        <input
          type="time"
          value={timeValue}
          onChange={(event) => onTimeChange(event.target.value)}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500"
        />
      </div>
    </div>
  );
}
