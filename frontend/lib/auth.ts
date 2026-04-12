"use client";


type AuthPayload = {
  token: string;
  role: "teacher" | "student";
};

export const authStorage = {
  setAuth({ token, role }: AuthPayload) {
    localStorage.setItem("token", token);
    localStorage.setItem("role", role);
    document.cookie = `token=${token}; path=/; max-age=86400`;
    document.cookie = `role=${role}; path=/; max-age=86400`;
  },
  clearAuth() {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    document.cookie = "token=; path=/; max-age=0";
    document.cookie = "role=; path=/; max-age=0";
  },
  getToken() {
    if (typeof window === "undefined") {
      return "";
    }

    const localToken = localStorage.getItem("token") ?? "";
    if (localToken) {
      return localToken;
    }

    const cookieToken = document.cookie
      .split("; ")
      .find((entry) => entry.startsWith("token="))
      ?.slice("token=".length)
      ?? "";

    if (cookieToken) {
      localStorage.setItem("token", cookieToken);
    }

    return cookieToken;
  },
  getUserId() {
    const token = this.getToken();
    if (!token) {
      return null;
    }

    try {
      const payload = token.split(".")[1];
      if (!payload) {
        return null;
      }
      const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
      const decoded = JSON.parse(atob(padded));
      const subject = Number(decoded?.sub);
      return Number.isFinite(subject) ? subject : null;
    } catch {
      return null;
    }
  }
};
