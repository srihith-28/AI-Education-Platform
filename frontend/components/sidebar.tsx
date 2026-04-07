"use client";

import { BookOpenText, ChartSpline, Home, Trophy } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { authStorage } from "@/lib/auth";


type SidebarProps = {
  role: "teacher" | "student";
};

const teacherLinks = [
  { href: "/dashboard/teacher", label: "Overview", icon: Home },
  { href: "/dashboard/teacher?tab=upload", label: "Upload", icon: BookOpenText },
  { href: "/dashboard/teacher?tab=analytics", label: "Analytics", icon: ChartSpline }
];

const studentLinks = [
  { href: "/dashboard/student", label: "Assistant", icon: Home },
  { href: "/dashboard/student?tab=leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/dashboard/student?tab=progress", label: "Progress", icon: ChartSpline }
];

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();
  const links = role === "teacher" ? teacherLinks : studentLinks;

  return (
    <aside className="glass h-full rounded-2xl p-4">
      <div className="mb-8 font-heading text-xl font-semibold">Edu AI Pro</div>
      <nav className="space-y-2">
        {links.map((link) => {
          const active = pathname === link.href;
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 transition ${
                active ? "bg-teal-500/20 text-teal-600 dark:text-teal-300" : "hover:bg-white/30"
              }`}
            >
              <Icon className="h-4 w-4" /> {link.label}
            </Link>
          );
        })}
      </nav>
      <button
        onClick={() => {
          authStorage.clearAuth();
          window.location.href = "/login";
        }}
        className="mt-8 w-full rounded-lg border border-white/20 px-3 py-2 text-left hover:bg-white/20"
      >
        Logout
      </button>
    </aside>
  );
}
