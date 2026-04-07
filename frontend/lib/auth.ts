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
    return localStorage.getItem("token") ?? "";
  }
};
