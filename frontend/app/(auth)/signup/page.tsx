"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { GlassCard } from "@/components/glass-card";
import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";


export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"teacher" | "student">("student");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      // Step 1: Create account via backend admin API to bypass email confirmation
      const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "/api/v1";
      const resolvedApiUrl = apiUrl.startsWith("http") ? apiUrl : `http://localhost:8000${apiUrl}`;
      
      const registerRes = await fetch(`${resolvedApiUrl}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name, role }),
      });

      if (!registerRes.ok) {
        let errMsg = "Signup failed. Please try again.";
        try {
          const errData = await registerRes.json();
          errMsg = errData.detail || errMsg;
        } catch (_) {}
        throw new Error(errMsg);
      }

      // Step 2: Now that user is created and confirmed, log in to get session
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        throw new Error(authError.message);
      }

      if (!data.session) {
        throw new Error("Could not log in after signup.");
      }

      window.location.href = role === "teacher" ? "/dashboard/teacher" : "/dashboard/student";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6">
      <GlassCard className="w-full p-6">
        <h1 className="font-heading text-3xl font-semibold">Create Account</h1>
        <p className="mt-1 text-sm opacity-70">Join your AI education workspace</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <input
            className="w-full rounded-lg border border-white/20 bg-white/30 p-3"
            placeholder="Full Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            className="w-full rounded-lg border border-white/20 bg-white/30 p-3"
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="w-full rounded-lg border border-white/20 bg-white/30 p-3"
            placeholder="Password (min 8 characters)"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
          <select
            className="w-full rounded-lg border border-white/20 bg-white/30 p-3"
            value={role}
            onChange={(e) => setRole(e.target.value as "teacher" | "student")}
          >
            <option value="student">Student</option>
            <option value="teacher">Teacher</option>
          </select>
          {error && <p className="text-sm text-rose-500">{error}</p>}
          <button
            disabled={loading}
            className="w-full rounded-lg bg-teal-500 px-4 py-3 font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Creating account..." : "Create Account"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm opacity-70">
          Already have an account?{" "}
          <a href="/login" className="text-teal-500 hover:underline">Log in</a>
        </p>
      </GlassCard>
    </main>
  );
}
