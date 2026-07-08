"use client";

/**
 * lib/auth.ts
 *
 * Supabase-based auth helpers. Replaces the previous localStorage/cookie-based
 * custom JWT implementation. All auth state is managed by Supabase session.
 *
 * Usage:
 *   import { authStorage } from "@/lib/auth";
 *   const token = await authStorage.getToken();
 *   const userId = await authStorage.getUserId();
 */
import { supabase } from "@/lib/supabase";

export const authStorage = {
  /**
   * Get the current Supabase access token (Bearer token for API calls).
   * Returns empty string if not authenticated.
   */
  async getToken(): Promise<string> {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? "";
  },

  /**
   * Get the current Supabase user UUID.
   * Returns null if not authenticated.
   */
  async getUserId(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id ?? null;
  },

  /**
   * Get the user's role from Supabase app_metadata.
   * Returns null if not authenticated or role not set.
   */
  async getRole(): Promise<"teacher" | "student" | null> {
    const { data } = await supabase.auth.getSession();
    const role = data.session?.user?.app_metadata?.role as string | undefined;
    if (role === "teacher" || role === "student") return role;
    return null;
  },

  /**
   * Get the user's email.
   */
  async getEmail(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.email ?? null;
  },

  /**
   * Sign out from Supabase and clear all local session state.
   */
  async signOut(): Promise<void> {
    await supabase.auth.signOut();
  },

  /**
   * Check if there is an active session.
   */
  async isAuthenticated(): Promise<boolean> {
    const { data } = await supabase.auth.getSession();
    return !!data.session;
  },
};

/**
 * Get a synchronous token from localStorage as a fallback for non-async contexts.
 * Prefer authStorage.getToken() in components.
 */
export function getTokenSync(): string {
  if (typeof window === "undefined") return "";
  // Supabase stores the session in localStorage automatically
  try {
    const raw = localStorage.getItem(
      `sb-${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace("https://", "").split(".")[0]}-auth-token`
    );
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    return parsed?.access_token ?? "";
  } catch {
    return "";
  }
}
