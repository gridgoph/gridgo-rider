import { create } from "zustand";

import type { User } from "@/lib/api";
import * as api from "@/lib/api";
import { ApiError } from "@/lib/api";

/** Expected role for this binary — mismatched login is rejected. */
export const APP_ROLE = "rider" as const;
export const DEMO_EMAIL = "rider@gridgo.local";

/** Map login failures to rider-facing copy (network vs bad credentials). */
export function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return "Wrong email or password.";
    }
    return error.message || `HTTP ${error.status}`;
  }
  // fetch() network failures (offline host, wrong base URL, CORS on web, etc.)
  const base = api.getApiBase();
  return `Cannot reach the backend at ${base}. Is gridgo-api running and reachable from this device?`;
}

type SessionState = {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
};

export const useSession = create<SessionState>((set) => ({
  user: null,
  loading: false,
  error: null,
  clearError: () => set({ error: null }),
  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const { user } = await api.login(email, password);
      if (user.role !== APP_ROLE) {
        await api.logout();
        set({
          user: null,
          loading: false,
          error: `This account is role "${user.role}". Open the ${user.role} app instead.`,
        });
        return;
      }
      set({ user, loading: false });
    } catch (e) {
      set({
        loading: false,
        error: loginErrorMessage(e),
      });
    }
  },
  logout: async () => {
    await api.logout();
    set({ user: null });
  },
}));
