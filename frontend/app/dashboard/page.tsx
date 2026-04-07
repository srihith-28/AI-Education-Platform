"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";


export default function DashboardEntry() {
  const router = useRouter();

  useEffect(() => {
    const role = localStorage.getItem("role");
    if (role === "teacher") {
      router.replace("/dashboard/teacher");
      return;
    }
    router.replace("/dashboard/student");
  }, [router]);

  return <div className="p-8">Redirecting...</div>;
}
