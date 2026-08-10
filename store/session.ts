import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

import type { User } from "@/lib/api";
import * as api from "@/lib/api";
import { ApiError } from "@/lib/api";
import {
  parseStoredSession,
  serialiseSession,
  SESSION_STORAGE_KEY,
} from "@/lib/sessionStorage";

/** Expected role for this binary — mismatched login is rejected. */
export const APP_ROLE = "rider" as const;
export const DEMO_EMAIL = "rider@gridgo.local";

/** Map login failures to rider-facing copy (network vs bad credentials). */
export function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return "Wrong email or password.";
    }
    return api.apiErrorMessage(error, "Sign in did not go through. Try again.");
  }
  // fetch() network failures (offline host, wrong base URL, CORS on web, etc.)
  const base = api.getApiBase();
  return `Cannot reach GRIDGO at ${base}. Check the phone's connection, then try again.`;
}

type SessionState = {
  user: User | null;
  /**
   * Whether the stored session has been read back from the phone yet.
   * The auth gate waits for this — see `canGateNavigate`.
   */
  hydrated: boolean;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Read the persisted session at launch. Safe to call more than once. */
  hydrate: () => Promise<void>;
  /**
   * Wipe local session without calling the API.
   * Used when a 401 proves the bearer is already dead, and by tests.
   */
  clearSession: () => void;
  clearError: () => void;
};

/** Persist or clear the stored session; never blocks the caller. */
function persist(session: { token: string; user: User } | null): void {
  const write = session
    ? AsyncStorage.setItem(SESSION_STORAGE_KEY, serialiseSession(session))
    : AsyncStorage.removeItem(SESSION_STORAGE_KEY);
  void write.catch(() => {
    // The session still works for this launch if the write fails.
  });
}

export const useSession = create<SessionState>((set, get) => ({
  user: null,
  hydrated: false,
  loading: false,
  error: null,
  clearError: () => set({ error: null }),
  clearSession: () => {
    api.setToken(null);
    persist(null);
    set({ user: null, error: null, loading: false });
  },
  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const stored = parseStoredSession(await AsyncStorage.getItem(SESSION_STORAGE_KEY));
      if (stored) {
        api.setToken(stored.token);
        set({ user: stored.user });
      }
    } catch {
      // Unreadable storage is the same as no session.
    } finally {
      set({ hydrated: true });
    }
  },
  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const { token, user } = await api.login(email, password);
      if (user.role !== APP_ROLE) {
        await api.logout();
        set({
          user: null,
          loading: false,
          error: `This is a ${roleLabel(user.role)} account. Open the GRIDGO ${roleLabel(user.role)} app to sign in.`,
        });
        return;
      }
      persist({ token, user });
      set({ user, loading: false });
    } catch (e) {
      set({
        loading: false,
        error: loginErrorMessage(e),
      });
    }
  },
  logout: async () => {
    try {
      await api.logout();
    } catch {
      // Server may reject an already-dead token. Local wipe still happens below.
    } finally {
      // Always clear local state — even if the server call fails (expired token).
      // Clearing user trips the auth gate → replace to login; back cannot re-enter.
      api.setToken(null);
      persist(null);
      set({ user: null, error: null });
    }
  },
}));

/** Plain-language name for a platform role. Never show the raw enum. */
export function roleLabel(role: string): string {
  switch (role) {
    case "client":
      return "client";
    case "supplier":
      return "supplier";
    case "rider":
      return "rider";
    case "ops_admin":
      return "Operations";
    case "super_admin":
      return "admin";
    default:
      return "different";
  }
}

/**
 * Wire the API client so any 401 (expired/invalid token) clears the session.
 * Call once from the root layout. The auth gate then replace-navigates to login.
 */
export function bindApiUnauthorizedHandler(): () => void {
  return api.setUnauthorizedHandler(() => {
    useSession.getState().clearSession();
  });
}
