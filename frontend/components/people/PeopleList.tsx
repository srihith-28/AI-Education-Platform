"use client";

import { UserPlus } from "lucide-react";

import { PersonItem } from "./PersonItem";

type PersonRow = {
  id: number;
  name: string;
  email: string;
  is_main?: boolean;
};

type PeopleListProps = {
  title: string;
  rows: PersonRow[];
  emptyMessage: string;
  onAdd?: () => void;
  onRemove?: (person: PersonRow) => void;
  readOnly?: boolean;
};

export function PeopleList({ title, rows, emptyMessage, onAdd, onRemove, readOnly = false }: PeopleListProps) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/75 p-4 backdrop-blur dark:border-slate-700 dark:bg-slate-900/55">
      <div className="mb-3 flex items-center justify-between border-b border-slate-200/80 pb-3 dark:border-slate-700/80">
        <h3 className="font-heading text-3xl font-semibold">{title}</h3>
        {!readOnly && onAdd ? (
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-2 rounded-full border border-sky-500/50 bg-sky-500/15 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-500/25 dark:text-sky-200"
          >
            <UserPlus className="h-4 w-4" />
            Add
          </button>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="py-4 text-sm opacity-75">{emptyMessage}</p>
      ) : (
        <div className="space-y-1">
          {rows.map((row) => (
            <PersonItem
              key={row.id}
              id={row.id}
              name={row.name}
              email={row.email}
              removable={!readOnly && !row.is_main}
              badgeText={row.is_main ? "Owner" : undefined}
              onRemove={onRemove ? () => onRemove(row) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
