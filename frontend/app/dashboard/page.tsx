"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function DashboardEntry() {
  const router = useRouter();
  const [error, setError] = useState(false);

  useEffect(() => {
    async function checkRole() {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/login");
        return;
      }
      const role = data.session.user?.user_metadata?.role;
      if (role === "teacher") {
        router.replace("/dashboard/teacher");
      } else {
        router.replace("/dashboard/student");
      }
    }
    void checkRole();
  }, [router]);

  if (error) {
    return <div className="p-8 text-rose-500">Authentication error. Please log in again.</div>;
  }

  return <div className="p-8">Redirecting...</div>;
}
