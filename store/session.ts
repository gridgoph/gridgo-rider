import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

import type { User } from "@/lib/api";
import * as api from "@/lib/api";
import { ApiError } from "@/lib/api";
import { SESSION_READ_TIMEOUT_MS } from "@/lib/launchGate";
import {
  parseStoredSession,
  serialiseSession,
  SESSION_STORAGE_KEY,
  type StoredSession,
} from "@/lib/sessionStorage";

/** Expected role for this binary — mismatched login is rejected. */
export const APP_ROLE = "rider" as const;

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
  /** Create a rider account and sign in. The account arrives awaiting approval. */
  signup: (input: api.RiderSignup) => Promise<boolean>;
  logout: () => Promise<void>;
  /** Re-read the account so an approval decision lands without signing out. */
  refreshUser: () => Promise<void>;
  /** Read the persisted session at launch. Safe to call more than once. */
  hydrate: () => Promise<void>;
  /**
   * Wipe local session without calling the API.
   * Used when a 401 proves the bearer is already dead, and by tests.
   */
  clearSession: () => void;
  clearError: () => void;
};

/**
 * Set once the rider's session has been decided some other way — a login, a
 * sign-out, or a 401. A storage read that lands after that must not resurrect
 * the record it happened to capture before the change.
 */
let storedSessionSuperseded = false;

/** Read the stored session back, treating anything unreadable as no session. */
function readStoredSession(): Promise<StoredSession | null> {
  return AsyncStorage.getItem(SESSION_STORAGE_KEY)
    .then(parseStoredSession)
    .catch(() => null);
}

/** Resolve with `work`, or with "timeout" if it has not answered within `ms`. */
function raceDeadline<T>(work: Promise<T>, ms: number): Promise<T | "timeout"> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve("timeout"), ms);
    void work.then((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

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
    storedSessionSuperseded = true;
    api.setToken(null);
    persist(null);
    set({ user: null, error: null, loading: false });
  },
  /*
    Read the stored session back — on a deadline.

    `hydrated` is what the auth gate, `app/index.tsx`, and the root layout all
    wait on, so a read that never answers used to hold the entire app on a
    blank screen. It now gives up after `SESSION_READ_TIMEOUT_MS` and lets the
    rider reach login, which is recoverable in a way that a black rectangle is
    not.

    Giving up on the gate is not giving up on the session: a late answer is
    still adopted, and because the auth gate re-evaluates continuously, a rider
    sitting on login is carried into the tab shell the moment their session
    arrives.
  */
  hydrate: async () => {
    if (get().hydrated) return;
    storedSessionSuperseded = false;

    const read = readStoredSession();

    /** A stored session is only usable if nothing has decided otherwise since. */
    const usable = (stored: StoredSession | null) =>
      stored && !storedSessionSuperseded && !get().user ? stored : null;

    const outcome = await raceDeadline(read, SESSION_READ_TIMEOUT_MS);

    if (outcome === "timeout") {
      if (__DEV__) {
        console.warn(
          `[GRIDGO launch] the stored session did not read back within ` +
            `${SESSION_READ_TIMEOUT_MS}ms. Continuing as signed out rather than ` +
            "holding the app on a blank screen.",
        );
      }
      // Stopped waiting, still listening: the gate opens now, and the auth gate
      // carries the rider off login if this ever answers.
      void read.then((stored) => {
        const session = usable(stored);
        if (!session) return;
        api.setToken(session.token);
        set({ user: session.user });
      });
      set({ hydrated: true });
      return;
    }

    const session = usable(outcome);
    if (session) api.setToken(session.token);
    // One commit, so a signed-in rider never renders a frame as signed out.
    set(session ? { user: session.user, hydrated: true } : { hydrated: true });
  },
  login: async (email, password) => {
    storedSessionSuperseded = true;
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
  /*
    Sign-up is a login that happens to create the account first.

    Nothing branches on approval here: the account is real, the token is real,
    and the rider belongs in the app straight away. What they cannot do is take
    work — and that is the screens' job to say, not the gate's, because a rider
    locked out at the door has nowhere to read why.
  */
  signup: async (input) => {
    storedSessionSuperseded = true;
    set({ loading: true, error: null });
    try {
      const { token, user } = await api.signupRider(input);
      persist({ token, user });
      set({ user, loading: false });
      return true;
    } catch (e) {
      set({
        loading: false,
        error: api.apiErrorMessage(
          e,
          `Your account was not created. Check the details, or try again — GRIDGO is at ${api.getApiBase()}.`,
        ),
      });
      return false;
    }
  },
  refreshUser: async () => {
    if (!get().user) return;
    try {
      const user = await api.me();
      // A late answer must not resurrect a session that has since been ended.
      if (get().user) set({ user });
    } catch {
      // A 401 already clears the session through the unauthorized handler;
      // anything else is a bad moment on the network, not a decision.
    }
  },
  logout: async () => {
    storedSessionSuperseded = true;
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
