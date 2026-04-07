"use client";

import { motion } from "framer-motion";
import Link from "next/link";

import { GlassCard } from "@/components/glass-card";
import { ThemeToggle } from "@/components/theme-toggle";


export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10">
      <header className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold">Edu AI Pro</h1>
        <ThemeToggle />
      </header>

      <section className="mt-16 grid items-center gap-8 md:grid-cols-2">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <p className="text-sm uppercase tracking-[0.22em] text-teal-600">Industry-Level AI Learning Platform</p>
          <h2 className="mt-3 font-heading text-5xl font-bold leading-tight">
            Build smarter classrooms with <span className="text-gradient">RAG + AI Agents</span>
          </h2>
          <p className="mt-5 max-w-xl text-lg opacity-85">
            A production-ready education SaaS for teachers and students with secure auth, RAG, quizzes,
            progress analytics, and personalized learning intelligence.
          </p>
          <div className="mt-8 flex gap-4">
            <Link href="/signup" className="rounded-xl bg-teal-500 px-5 py-3 font-semibold text-white shadow-lg shadow-teal-400/30">
              Get Started
            </Link>
            <Link href="/login" className="glass rounded-xl px-5 py-3 font-semibold">
              Login
            </Link>
          </div>
        </motion.div>

        <motion.div className="animate-float" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7 }}>
          <GlassCard className="p-6">
            <div className="mb-4 h-2 w-24 rounded-full bg-teal-500/60" />
            <h3 className="font-heading text-xl font-semibold">Unified Teacher + Student AI Workspace</h3>
            <ul className="mt-4 space-y-2 text-sm opacity-90">
              <li>AI-powered content upload and retrieval</li>
              <li>Teacher co-pilot for notes, quiz generation, and material refinement</li>
              <li>Student assistant with memory, summaries, and study plans</li>
              <li>Leaderboard and progress analytics with adaptive recommendations</li>
            </ul>
          </GlassCard>
        </motion.div>
      </section>
    </main>
  );
}
