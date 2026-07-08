"use client";

import { Archive, CalendarDays, ChevronDown, Home, LogOut, Menu, Settings, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";


type SidebarProps = {
  role: "teacher" | "student";
  activeTeacherItem?: string;
  onTeacherItemSelect?: (itemId: string) => void;
  teacherCourses?: Array<{ id: number; title: string; section?: string }>;
  activeTeacherCourseId?: number | null;
  onTeacherCourseSelect?: (courseId: number) => void;
  activeStudentItem?: string;
  onStudentItemSelect?: (itemId: string) => void;
  studentEnrolledCourses?: Array<{ id: number; title: string; section?: string }>;
  activeStudentCourseId?: number | null;
  onStudentCourseSelect?: (courseId: number) => void;
  onStudentLogout?: () => void;
  onTeacherLogout?: () => void;
};

const teacherMenuItems = [
  { id: "home", label: "Home", icon: Home },
  { id: "teaching", label: "Teaching", icon: Users },
  { id: "archived", label: "Archived classes", icon: Archive },
  { id: "settings", label: "Settings", icon: Settings }
];

const studentMenuItems = [
  { id: "home", label: "Home", icon: Home },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "enrolled", label: "Enrolled", icon: Users },
  { id: "archived", label: "Archived classes", icon: Archive },
  { id: "settings", label: "Settings", icon: Settings }
];

const courseBadgeTones = [
  "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200",
  "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
  "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200"
];

export function Sidebar({
  role,
  activeTeacherItem,
  onTeacherItemSelect,
  teacherCourses = [],
  activeTeacherCourseId,
  onTeacherCourseSelect,
  activeStudentItem,
  onStudentItemSelect,
  studentEnrolledCourses = [],
  activeStudentCourseId,
  onStudentCourseSelect,
  onStudentLogout,
  onTeacherLogout
}: SidebarProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [internalActiveItemId, setInternalActiveItemId] = useState("home");
  const [isTeachingExpanded, setIsTeachingExpanded] = useState(false);
  const [isEnrolledExpanded, setIsEnrolledExpanded] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement | null>(null);

  const handleLogoutConfirm = () => {
    setIsLogoutModalOpen(false);
    if (role === "student" && onStudentLogout) {
      onStudentLogout();
    } else if (role === "teacher" && onTeacherLogout) {
      onTeacherLogout();
    }
  };

  const renderLogoutModal = () => {
    if (!isLogoutModalOpen) return null;
    return (
      <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/45 px-4" onClick={() => setIsLogoutModalOpen(false)}>
        <div className="w-full max-w-sm rounded-2xl border border-white/20 bg-slate-100 p-6 text-slate-900 shadow-2xl dark:bg-slate-900 dark:text-slate-100" onClick={(event) => event.stopPropagation()}>
          <h3 className="text-xl font-semibold mb-6">Are you sure you want to log out?</h3>
          <div className="flex justify-end gap-3">
            <button className="rounded-xl px-5 py-2 font-medium text-slate-700 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800" onClick={() => setIsLogoutModalOpen(false)}>No</button>
            <button className="rounded-xl bg-sky-600 px-5 py-2 font-medium text-white hover:bg-sky-700" onClick={handleLogoutConfirm}>Yes</button>
          </div>
        </div>
      </div>
    );
  };

  useEffect(() => {
    if (!isExpanded) {
      return;
    }

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (sidebarRef.current && !sidebarRef.current.contains(target)) {
        setIsExpanded(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isExpanded]);

  if (role === "student") {
    const selectedItemId = activeStudentItem ?? internalActiveItemId;

    return (
      <>
      <aside
        ref={sidebarRef}
        className={`glass sticky top-4 flex h-[calc(100vh-2rem)] flex-col rounded-3xl py-4 text-slate-800 shadow-glass transition-all duration-300 dark:text-slate-100 ${
          isExpanded ? "w-[272px] px-4" : "w-[84px] px-2.5"
        }`}
      >
        <button
          type="button"
          title="Menu"
          aria-label="Menu"
          onClick={() => setIsExpanded((prev) => !prev)}
          className={`mb-5 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/70 text-slate-800 transition hover:bg-white/90 dark:bg-slate-800/70 dark:text-slate-100 dark:hover:bg-slate-700/80 ${
            isExpanded ? "ml-0" : "mx-auto"
          }`}
        >
          <Menu className="h-[22px] w-[22px]" />
        </button>

        <nav className="space-y-2">
          {studentMenuItems.map((item) => {
            const Icon = item.icon;
            const isActive = selectedItemId === item.id;

            if (item.id === "enrolled") {
              return (
                <div key={item.id} className="space-y-2">
                  <button
                    type="button"
                    title={isExpanded ? undefined : item.label}
                    onClick={() => {
                      setIsEnrolledExpanded((prev) => !prev);
                      if (onStudentItemSelect) {
                        onStudentItemSelect(item.id);
                      } else {
                        setInternalActiveItemId(item.id);
                      }
                    }}
                    className={`flex w-full items-center transition ${
                      isExpanded
                        ? `justify-between rounded-full px-4 py-3 text-left ${
                            isActive
                              ? "border-2 border-sky-700 bg-sky-200/90 text-sky-950 dark:border-sky-300 dark:bg-sky-400/30 dark:text-sky-100"
                              : "border-2 border-transparent hover:bg-white/70 dark:hover:bg-slate-700/55"
                          }`
                        : `justify-center rounded-full p-2.5 ${
                            isActive
                              ? "bg-sky-200/90 text-sky-900 dark:bg-sky-400/30 dark:text-sky-100"
                              : "hover:bg-white/70 dark:hover:bg-slate-700/55"
                          }`
                    }`}
                  >
                    {isExpanded ? (
                      <span className="flex items-center gap-3">
                        <Icon className="h-5 w-5 shrink-0" />
                        <span className="text-[1.02rem] font-medium leading-none tracking-tight">{item.label}</span>
                      </span>
                    ) : (
                      <Icon className="h-5 w-5 shrink-0" />
                    )}
                    {isExpanded && (
                      <ChevronDown className={`h-4 w-4 shrink-0 opacity-80 transition ${isEnrolledExpanded ? "rotate-180" : "rotate-0"}`} />
                    )}
                  </button>

                  {isExpanded && isEnrolledExpanded && (
                    <div className="space-y-2 pl-2">
                      <div className="px-2 text-xs font-semibold uppercase tracking-wide opacity-70">Joined classes</div>
                      <div className="space-y-2">
                        {studentEnrolledCourses.length === 0 ? (
                          <p className="px-2 text-xs opacity-75">No enrolled classes yet.</p>
                        ) : (
                          studentEnrolledCourses.map((course, index) => {
                            const tone = courseBadgeTones[index % courseBadgeTones.length];
                            const initial = course.title.trim().charAt(0).toUpperCase() || "C";
                            const sectionLabel = course.section?.trim() ? course.section.trim() : "Section not set";
                            const isSelectedCourse = activeStudentCourseId === course.id;

                            return (
                              <button
                                key={course.id}
                                type="button"
                                onClick={() => {
                                  if (onStudentItemSelect) {
                                    onStudentItemSelect("enrolled");
                                  } else {
                                    setInternalActiveItemId("enrolled");
                                  }
                                  onStudentCourseSelect?.(course.id);
                                }}
                                className={`flex w-full items-start gap-3 rounded-xl px-2 py-1.5 text-left transition ${
                                  isSelectedCourse
                                    ? "bg-sky-200/85 text-sky-950 dark:bg-sky-400/30 dark:text-sky-100"
                                    : "hover:bg-white/45 dark:hover:bg-slate-700/35"
                                }`}
                              >
                                <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${tone}`}>
                                  {initial}
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate text-[1.02rem] font-medium leading-tight">{course.title}</p>
                                  <p className="text-sm opacity-80">{sectionLabel}</p>
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            }

            return (
              <button
                key={item.id}
                type="button"
                title={isExpanded ? undefined : item.label}
                onClick={() => {
                  if (onStudentItemSelect) {
                    onStudentItemSelect(item.id);
                  } else {
                    setInternalActiveItemId(item.id);
                  }
                }}
                className={`flex w-full items-center transition ${
                  isExpanded
                    ? `justify-between rounded-full px-4 py-3 text-left ${
                        isActive
                          ? "border-2 border-sky-700 bg-sky-200/90 text-sky-950 dark:border-sky-300 dark:bg-sky-400/30 dark:text-sky-100"
                          : "border-2 border-transparent hover:bg-white/70 dark:hover:bg-slate-700/55"
                      }`
                    : `justify-center rounded-full p-2.5 ${
                        isActive
                            ? "bg-sky-200/90 text-sky-900 dark:bg-sky-400/30 dark:text-sky-100"
                            : "hover:bg-white/70 dark:hover:bg-slate-700/55"
                      }`
                }`}
              >
                {isExpanded ? (
                  <span className="flex items-center gap-3">
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className="text-[1.02rem] font-medium leading-none tracking-tight">{item.label}</span>
                  </span>
                ) : (
                  <Icon className="h-5 w-5 shrink-0" />
                )}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto pt-4">
          <button
            type="button"
            title={isExpanded ? undefined : "Logout"}
            onClick={() => setIsLogoutModalOpen(true)}
            className={`flex w-full items-center transition ${
              isExpanded
                ? "justify-start rounded-full px-4 py-3 text-left border-2 border-transparent hover:bg-white/70 dark:hover:bg-slate-700/55"
                : "justify-center rounded-full p-2.5 hover:bg-white/70 dark:hover:bg-slate-700/55"
            }`}
          >
            {isExpanded ? (
              <span className="flex items-center gap-3">
                <LogOut className="h-5 w-5 shrink-0" />
                <span className="text-[1.02rem] font-medium leading-none tracking-tight">Logout</span>
              </span>
            ) : (
              <LogOut className="h-5 w-5 shrink-0" />
            )}
          </button>
        </div>
      </aside>
      {renderLogoutModal()}
      </>
    );
  }

  return (
    <>
    <aside
      className={`glass sticky top-4 flex h-[calc(100vh-2rem)] flex-col rounded-3xl py-4 text-slate-800 shadow-glass transition-all duration-300 dark:text-slate-100 ${
        isExpanded ? "w-[272px] px-4" : "w-[84px] px-2.5"
      }`}
    >
      <button
        type="button"
        title="Main Menu"
        aria-label="Main Menu"
        onClick={() => setIsExpanded((prev) => !prev)}
        className={`mb-5 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/70 text-slate-800 transition hover:bg-white/90 dark:bg-slate-800/70 dark:text-slate-100 dark:hover:bg-slate-700/80 ${
          isExpanded ? "ml-0" : "mx-auto"
        }`}
      >
        <Menu className="h-[22px] w-[22px]" />
      </button>

      <nav className="space-y-2">
        {teacherMenuItems.map((item) => {
          const Icon = item.icon;
          const selectedItemId = activeTeacherItem ?? internalActiveItemId;
          const isActive = selectedItemId === item.id;

          if (item.id === "teaching") {
            return (
              <div key={item.id} className="space-y-2">
                <button
                  type="button"
                  title={isExpanded ? undefined : item.label}
                  onClick={() => {
                    setIsTeachingExpanded((prev) => !prev);
                    if (onTeacherItemSelect) {
                      onTeacherItemSelect(item.id);
                    } else {
                      setInternalActiveItemId(item.id);
                    }
                  }}
                  className={`flex w-full items-center transition ${
                    isExpanded
                      ? `justify-between rounded-full px-4 py-3 text-left ${
                          isActive
                            ? "border-2 border-sky-700 bg-sky-200/90 text-sky-950 dark:border-sky-300 dark:bg-sky-400/30 dark:text-sky-100"
                            : "border-2 border-transparent hover:bg-white/70 dark:hover:bg-slate-700/55"
                        }`
                      : `justify-center rounded-full p-2.5 ${
                          isActive
                            ? "bg-sky-200/90 text-sky-900 dark:bg-sky-400/30 dark:text-sky-100"
                            : "hover:bg-white/70 dark:hover:bg-slate-700/55"
                        }`
                  }`}
                >
                  {isExpanded ? (
                    <span className="flex items-center gap-3">
                      <Icon className="h-5 w-5 shrink-0" />
                      <span className="text-[1.02rem] font-medium leading-none tracking-tight">{item.label}</span>
                    </span>
                  ) : (
                    <Icon className="h-5 w-5 shrink-0" />
                  )}
                  {isExpanded && (
                    <ChevronDown className={`h-4 w-4 shrink-0 opacity-80 transition ${isTeachingExpanded ? "rotate-180" : "rotate-0"}`} />
                  )}
                </button>

                {isExpanded && isTeachingExpanded && (
                  <div className="space-y-2 pl-2">
                    <div className="space-y-2">
                      {teacherCourses.length === 0 ? (
                        <p className="px-2 text-xs opacity-75">No created courses yet.</p>
                      ) : (
                        teacherCourses.map((course, index) => {
                          const tone = courseBadgeTones[index % courseBadgeTones.length];
                          const initial = course.title.trim().charAt(0).toUpperCase() || "C";
                          const sectionLabel = course.section?.trim() ? course.section.trim() : "Section not set";
                          const isSelectedCourse = activeTeacherCourseId === course.id;

                          return (
                            <button
                              key={course.id}
                              type="button"
                              onClick={() => {
                                if (onTeacherItemSelect) {
                                  onTeacherItemSelect("teaching");
                                } else {
                                  setInternalActiveItemId("teaching");
                                }
                                onTeacherCourseSelect?.(course.id);
                              }}
                              className={`flex w-full items-start gap-3 rounded-xl px-2 py-1.5 text-left transition ${
                                isSelectedCourse
                                  ? "bg-sky-200/85 text-sky-950 dark:bg-sky-400/30 dark:text-sky-100"
                                  : "hover:bg-white/45 dark:hover:bg-slate-700/35"
                              }`}
                            >
                              <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${tone}`}>
                                {initial}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-[1.02rem] font-medium leading-tight">{course.title}</p>
                                <p className="text-sm opacity-80">{sectionLabel}</p>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          }

          return (
            <button
              key={item.id}
              type="button"
              title={isExpanded ? undefined : item.label}
              onClick={() => {
                if (onTeacherItemSelect) {
                  onTeacherItemSelect(item.id);
                } else {
                  setInternalActiveItemId(item.id);
                }
              }}
              className={`flex w-full items-center transition ${
                isExpanded
                  ? `justify-between rounded-full px-4 py-3 text-left ${
                      isActive
                        ? "border-2 border-sky-700 bg-sky-200/90 text-sky-950 dark:border-sky-300 dark:bg-sky-400/30 dark:text-sky-100"
                        : "border-2 border-transparent hover:bg-white/70 dark:hover:bg-slate-700/55"
                    }`
                  : `justify-center rounded-full p-2.5 ${
                      isActive
                          ? "bg-sky-200/90 text-sky-900 dark:bg-sky-400/30 dark:text-sky-100"
                          : "hover:bg-white/70 dark:hover:bg-slate-700/55"
                    }`
              }`}
            >
              {isExpanded ? (
                <span className="flex items-center gap-3">
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="text-[1.02rem] font-medium leading-none tracking-tight">{item.label}</span>
                </span>
              ) : (
                <Icon className="h-5 w-5 shrink-0" />
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto pt-4">
        <button
          type="button"
          title={isExpanded ? undefined : "Logout"}
          onClick={() => setIsLogoutModalOpen(true)}
          className={`flex w-full items-center transition ${
            isExpanded
              ? "justify-start rounded-full px-4 py-3 text-left border-2 border-transparent hover:bg-white/70 dark:hover:bg-slate-700/55"
              : "justify-center rounded-full p-2.5 hover:bg-white/70 dark:hover:bg-slate-700/55"
          }`}
        >
          {isExpanded ? (
            <span className="flex items-center gap-3">
              <LogOut className="h-5 w-5 shrink-0" />
              <span className="text-[1.02rem] font-medium leading-none tracking-tight">Logout</span>
            </span>
          ) : (
            <LogOut className="h-5 w-5 shrink-0" />
          )}
        </button>
      </div>
    </aside>
    {renderLogoutModal()}
    </>
  );
}
