"use client";

import { Archive, Edit2, MoreVertical, Pin, PinOff, Trash2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface ChatSessionMenuProps {
  sessionId: string;
  customTitle: string | null;
  isPinned: boolean;
  isArchived: boolean;
  onRename: (sessionId: string, newTitle: string) => Promise<void>;
  onTogglePin: (sessionId: string) => Promise<void>;
  onToggleArchive: (sessionId: string) => Promise<void>;
  onDelete: (sessionId: string) => Promise<void>;
}

export function ChatSessionMenu({
  sessionId,
  customTitle,
  isPinned,
  isArchived,
  onRename,
  onTogglePin,
  onToggleArchive,
  onDelete,
}: ChatSessionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newTitle, setNewTitle] = useState(customTitle || "");
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, ready: false });
  const menuRef = useRef<HTMLDivElement>(null);
  const portalMenuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuHeight = isRenaming ? 180 : 196;

  useEffect(() => {
    setNewTitle(customTitle || "");
  }, [customTitle]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (menuRef.current && !menuRef.current.contains(target) && portalMenuRef.current && !portalMenuRef.current.contains(target)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen || !buttonRef.current) {
      return;
    }

    const rect = buttonRef.current.getBoundingClientRect();
    const menuWidth = 224;
    const viewportPadding = 12;
    const openBelow = rect.bottom + menuHeight <= window.innerHeight - viewportPadding;
    const top = openBelow
      ? rect.bottom + 8
      : Math.max(viewportPadding, rect.top - menuHeight - 8);
    const left = Math.min(
      Math.max(viewportPadding, rect.right - menuWidth),
      window.innerWidth - menuWidth - viewportPadding,
    );

    setMenuPosition({ top, left, ready: true });
  }, [isOpen, isRenaming, menuHeight]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const closeOnViewportChange = () => setIsOpen(false);
    window.addEventListener("scroll", closeOnViewportChange, true);
    window.addEventListener("resize", closeOnViewportChange);
    return () => {
      window.removeEventListener("scroll", closeOnViewportChange, true);
      window.removeEventListener("resize", closeOnViewportChange);
    };
  }, [isOpen]);

  const handleRename = async () => {
    if (newTitle.trim()) {
      await onRename(sessionId, newTitle);
      setIsRenaming(false);
      setIsOpen(false);
    }
  };

  const handleTogglePin = async () => {
    await onTogglePin(sessionId);
    setIsOpen(false);
  };

  const handleToggleArchive = async () => {
    await onToggleArchive(sessionId);
    setIsOpen(false);
  };

  const handleDelete = async () => {
    if (confirm("Are you sure you want to delete this chat?")) {
      await onDelete(sessionId);
      setIsOpen(false);
    }
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
      >
        <MoreVertical size={16} className="text-gray-600 dark:text-gray-400" />
      </button>

      {isOpen && menuPosition.ready && typeof document !== "undefined" && createPortal(
        <div
          ref={portalMenuRef}
          className="fixed z-[100] w-56 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800"
          style={{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px` }}
        >
          {isRenaming ? (
            <div className="border-b border-gray-200 p-3 dark:border-gray-700">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Enter new title"
                className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename();
                  if (e.key === "Escape") setIsRenaming(false);
                }}
              />
              <div className="mt-2 flex gap-2">
                <button
                  onClick={handleRename}
                  className="flex-1 rounded bg-teal-500 px-2 py-1 text-xs text-white hover:bg-teal-600"
                >
                  Save
                </button>
                <button
                  onClick={() => setIsRenaming(false)}
                  className="flex-1 rounded bg-gray-200 px-2 py-1 text-xs text-gray-900 hover:bg-gray-300 dark:bg-gray-600 dark:text-white dark:hover:bg-gray-500"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                onClick={() => setIsRenaming(true)}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                <Edit2 size={14} />
                Rename
              </button>

              <button
                onClick={handleTogglePin}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
                {isPinned ? "Unpin" : "Pin"}
              </button>

              <button
                onClick={handleToggleArchive}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                <Archive size={14} />
                {isArchived ? "Unarchive" : "Archive"}
              </button>

              <div className="border-t border-gray-200 dark:border-gray-700" />

              <button
                onClick={handleDelete}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                <Trash2 size={14} />
                Delete
              </button>
            </>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
