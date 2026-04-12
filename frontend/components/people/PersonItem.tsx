"use client";

import { MoreVertical, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type PersonItemProps = {
  id: number;
  name: string;
  email: string;
  removable?: boolean;
  onRemove?: (id: number) => void;
  badgeText?: string;
};

export function PersonItem({ id, name, email, removable = true, onRemove, badgeText }: PersonItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const onClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  const initial = (name || "U").trim().charAt(0).toUpperCase();

  return (
    <div className="group flex items-center justify-between rounded-xl px-3 py-3 transition hover:bg-white/55 dark:hover:bg-slate-800/45">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-700 text-sm font-semibold text-white">
          {initial}
        </div>
        <div>
          <p className="text-sm font-semibold">{name}</p>
          <p className="text-xs opacity-75">{email}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {badgeText ? (
          <span className="rounded-full border border-slate-300/80 bg-white/70 px-2.5 py-1 text-xs font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-800/65 dark:text-slate-100">{badgeText}</span>
        ) : null}

        {removable ? (
          <div ref={menuRef} className="relative">
            <button
              type="button"
              aria-label="Open actions"
              onClick={() => setMenuOpen((prev) => !prev)}
              className="rounded-full p-2 transition hover:bg-white/70 dark:hover:bg-slate-700/55"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-10 z-20 min-w-[150px] overflow-hidden rounded-xl border border-white/20 bg-slate-900/95 p-1 shadow-xl">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onRemove?.(id);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-rose-300 transition hover:bg-slate-800"
                >
                  <Trash2 className="h-4 w-4" />
                  Remove
                </button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
