export type CalendarEvent = {
  id: string;
  title: string;
  description: string;
  course_id: number;
  course_code: string;
  course_title: string;
  type: "assignment" | "quiz" | "announcement";
  due_date: string;
  due_time: string | null;
  created_at: string;
};
