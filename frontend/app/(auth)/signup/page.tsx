"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { GlassCard } from "@/components/glass-card";
import { api } from "@/lib/api";
import { authStorage } from "@/lib/auth";


export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"teacher" | "student">("student");
  const [error, setError] = useState("");

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      const response = await api.signup({ name, email, password, role });
      authStorage.setAuth({ token: response.access_token, role: response.role });
      router.push(response.role === "teacher" ? "/dashboard/teacher" : "/dashboard/student");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6">
      <GlassCard className="w-full p-6">
        <h1 className="font-heading text-3xl font-semibold">Create Account</h1>
        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <input className="w-full rounded-lg border border-white/20 bg-white/30 p-3" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="w-full rounded-lg border border-white/20 bg-white/30 p-3" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="w-full rounded-lg border border-white/20 bg-white/30 p-3" placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <select className="w-full rounded-lg border border-white/20 bg-white/30 p-3" value={role} onChange={(e) => setRole(e.target.value as "teacher" | "student")}>
            <option value="student">Student</option>
            <option value="teacher">Teacher</option>
          </select>
          {error && <p className="text-sm text-rose-500">{error}</p>}
          <button className="w-full rounded-lg bg-teal-500 px-4 py-3 font-semibold text-white">Create Account</button>
        </form>
      </GlassCard>
    </main>
  );
}
