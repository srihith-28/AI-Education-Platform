import { CalendarEvent } from "@/components/calendar/types";


type EventCardProps = {
  event: CalendarEvent;
  onClick: (event: CalendarEvent) => void;
};

const typeStyles: Record<CalendarEvent["type"], string> = {
  assignment: "bg-slate-900 text-white",
  quiz: "bg-amber-600 text-white",
  announcement: "bg-sky-600 text-white",
};

const formatTime = (value: string | null): string | null => {
  if (!value) {
    return null;
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

export function EventCard({ event, onClick }: EventCardProps) {
  const displayTime = formatTime(event.due_time);

  return (
    <button
      type="button"
      onClick={() => onClick(event)}
      className={`w-full rounded-md px-2 py-1 text-left text-xs transition hover:brightness-110 ${typeStyles[event.type]}`}
      title={event.title}
    >
      <p className="truncate font-semibold">{event.title}</p>
      {displayTime && <p className="mt-0.5 opacity-90">{displayTime}</p>}
    </button>
  );
}
