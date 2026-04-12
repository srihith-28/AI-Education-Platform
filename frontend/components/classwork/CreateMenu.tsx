"use client";

import { ChevronDown, ClipboardCheck, FileText, HelpCircle, Library } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { AssignmentType } from "@/lib/classwork/types";

type MenuOption = {
  label: string;
  value: AssignmentType;
  icon: typeof FileText;
};

const MENU_ITEMS: MenuOption[] = [
  { label: "Assignment", value: "assignment", icon: FileText },
  { label: "Quiz Assignment", value: "quiz", icon: ClipboardCheck },
  { label: "Question", value: "question", icon: HelpCircle },
  { label: "Material", value: "material", icon: Library },
];

type CreateMenuProps = {
  onSelect: (type: AssignmentType) => void;
};

export function CreateMenu({ onSelect }: CreateMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current && !containerRef.current.contains(target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
      >
        + Create
        <ChevronDown className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute left-0 top-12 z-40 min-w-[230px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
          {MENU_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onSelect(item.value);
                }}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800"
              >
                <Icon className="h-4 w-4 text-sky-600 dark:text-sky-300" />
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
