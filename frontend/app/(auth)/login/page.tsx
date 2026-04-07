"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { GlassCard } from "@/components/glass-card";
import { api } from "@/lib/api";
import { authStorage } from "@/lib/auth";


export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await api.login({ email, password });
      authStorage.setAuth({ token: response.access_token, role: response.role });
      router.push(response.role === "teacher" ? "/dashboard/teacher" : "/dashboard/student");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6">
      <GlassCard className="w-full p-6">
        <h1 className="font-heading text-3xl font-semibold">Login</h1>
        <p className="mt-1 text-sm opacity-70">Continue to your AI workspace</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <input className="w-full rounded-lg border border-white/20 bg-white/30 p-3" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="w-full rounded-lg border border-white/20 bg-white/30 p-3" placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <p className="text-sm text-rose-500">{error}</p>}
          <button disabled={loading} className="w-full rounded-lg bg-teal-500 px-4 py-3 font-semibold text-white disabled:opacity-50">
            {loading ? "Signing in..." : "Login"}
          </button>
        </form>
      </GlassCard>
    </main>
  );
}
