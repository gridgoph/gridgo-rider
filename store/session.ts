import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

import type { User } from "@/lib/api";
import * as api from "@/lib/api";
import { ApiError } from "@/lib/api";
import { SESSION_READ_TIMEOUT_MS } from "@/lib/launchGate";
import { signupInput, type SignupFields } from "@/lib/signup";
import {
  parseStoredSession,
  serialiseSession,
  SESSION_STORAGE_KEY,
  type StoredSession,
} from "@/lib/sessionStorage";
import { usePush } from "@/store/push";

/** Expected role for this binary — mismatched login is rejected. */
export const APP_ROLE = "rider" as const;

/** Whether a stored user is a signed-in session. Used by push and the auth gate. */
export function isSignedIn(user: User | null | undefined): boolean {
  return user != null;
}

/** Outcome of a password login against the domain API. */
export type PasswordLoginResult = "signed_in" | "invalid_credentials" | "failed";

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

/** Map signup failures to rider-facing copy. */
export function signupErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return api.apiErrorMessage(
      error,
      "The application did not go through. Check your details and try again.",
    );
  }
  if (error instanceof Error && error.message && !api.isInternalCode(error.message)) {
    return error.message;
  }
  const base = api.getApiBase();
  return `Cannot reach GRIDGO at ${base}. Check the phone's connection, then try again.`;
}

type SessionState = {
  user: User | null;
  /** Which identity system owns the active bearer during the migration. */
  authSource: "legacy" | "clerk" | null;
  /**
   * Whether the stored session has been read back from the phone yet.
   * The auth gate waits for this — see `canGateNavigate`.
   */
  hydrated: boolean;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<PasswordLoginResult>;
  signup: (fields: SignupFields) => Promise<boolean>;
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
  /** Adopt the API projection after Clerk has authenticated a rider. */
  adoptClerkSession: () => Promise<boolean>;
  /** Supersede an older demo session as soon as Clerk reports a session. */
  beginClerkSession: () => void;
  /** Show an auth-door error without creating a local session. */
  rejectClerkSession: (message: string) => void;
  clearError: () => void;
};

/**
 * Set once the rider's session has been decided some other way — a login, a
 * sign-out, or a 401. A storage read that lands after that must not resurrect
 * the record it happened to capture before the change.
 */
let sessionDecisionVersion = 0;
let clerkOwnsSession = false;
let clerkSignOut: (() => Promise<unknown>) | null = null;

/** Bind Clerk sign-out without importing a React hook into the Zustand store. */
export function bindClerkSignOut(signOut: (() => Promise<unknown>) | null): () => void {
  clerkSignOut = signOut;
  return () => {
    if (clerkSignOut === signOut) clerkSignOut = null;
  };
}

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
  authSource: null,
  hydrated: false,
  loading: false,
  error: null,
  clearError: () => set({ error: null }),
  clearSession: () => {
    sessionDecisionVersion += 1;
    clerkOwnsSession = false;
    api.setToken(null);
    api.setTokenProvider(null);
    persist(null);
    const wasClerk = get().authSource === "clerk";
    set({ user: null, authSource: null, error: null, loading: false });
    if (wasClerk) void clerkSignOut?.().catch(() => {});
  },
  rejectClerkSession: (message) => {
    sessionDecisionVersion += 1;
    clerkOwnsSession = true;
    api.setToken(null);
    api.setTokenProvider(null);
    persist(null);
    set({ user: null, authSource: null, loading: false, error: message });
  },
  beginClerkSession: () => {
    sessionDecisionVersion += 1;
    clerkOwnsSession = true;
    api.setToken(null);
    api.setTokenProvider(null);
    persist(null);
    set({ user: null, authSource: null, loading: true, error: null });
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
    const decisionAtStart = sessionDecisionVersion;

    const read = readStoredSession();

    /** A stored session is only usable if nothing has decided otherwise since. */
    const usable = (stored: StoredSession | null) =>
      stored &&
      decisionAtStart === sessionDecisionVersion &&
      !clerkOwnsSession &&
      !get().user
        ? stored
        : null;

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
        set({ user: session.user, authSource: "legacy" });
      });
      set({ hydrated: true });
      return;
    }

    const session = usable(outcome);
    if (session) api.setToken(session.token);
    // One commit, so a signed-in rider never renders a frame as signed out.
    set(
      session
        ? { user: session.user, authSource: "legacy", hydrated: true }
        : { hydrated: true },
    );
  },
  login: async (email, password) => {
    sessionDecisionVersion += 1;
    clerkOwnsSession = false;
    api.setTokenProvider(null);
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
        return "failed";
      }
      persist({ token, user });
      set({ user, authSource: "legacy", loading: false });
      return "signed_in";
    } catch (e) {
      const invalid = e instanceof ApiError && e.status === 401;
      set({
        loading: false,
        error: loginErrorMessage(e),
      });
      return invalid ? "invalid_credentials" : "failed";
    }
  },
  signup: async (fields) => {
    sessionDecisionVersion += 1;
    clerkOwnsSession = false;
    api.setTokenProvider(null);
    set({ loading: true, error: null });
    try {
      const { token, user } = await api.signupRider(signupInput(fields));
      if (user.role !== APP_ROLE) {
        await api.logout();
        set({
          user: null,
          loading: false,
          error: `This is a ${roleLabel(user.role)} account. Open the GRIDGO ${roleLabel(user.role)} app to sign in.`,
        });
        return false;
      }
      persist({ token, user });
      set({ user, authSource: "legacy", loading: false });
      return true;
    } catch (e) {
      set({
        loading: false,
        error: signupErrorMessage(e),
      });
      return false;
    }
  },
  adoptClerkSession: async () => {
    sessionDecisionVersion += 1;
    clerkOwnsSession = true;
    api.setToken(null);
    persist(null);
    set({ loading: true, error: null });
    try {
      const user = await api.me();
      if (user.role !== APP_ROLE) {
        set({
          user: null,
          authSource: null,
          loading: false,
          error: `This is a ${roleLabel(user.role)} account. Open the GRIDGO ${roleLabel(user.role)} app to sign in.`,
        });
        return false;
      }
      set({ user, authSource: "clerk", loading: false });
      return true;
    } catch (error) {
      set({
        user: null,
        authSource: null,
        loading: false,
        error: loginErrorMessage(error),
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
    sessionDecisionVersion += 1;
    // The device token rides along with the sign-out rather than being
    // unregistered separately: afterwards the bearer token is dead, so a phone
    // that signed out first could no longer authenticate the unregister and
    // would keep waking up for the previous rider's job offers. The server
    // accepts a sign-out with no token exactly as before, so a phone that never
    // got one is unaffected.
    //
    // Afterwards the phone goes back on the unclaimed list rather than off it
    // entirely: a rider that signs out has not uninstalled GRIDGO, and "there
    // is a new version" still has to reach it.
    const deviceToken = usePush.getState().token;
    try {
      await api.logout(deviceToken);
    } catch {
      // Server may reject an already-dead token. Local wipe still happens below.
    } finally {
      // Always clear local state — even if the server call fails (expired token).
      // Clearing user trips the auth gate → replace to welcome; back cannot re-enter.
      api.setToken(null);
      api.setTokenProvider(null);
      persist(null);
      const wasClerk = get().authSource === "clerk";
      if (wasClerk) await clerkSignOut?.().catch(() => {});
      clerkOwnsSession = false;
      set({ user: null, authSource: null, error: null });
      void usePush.getState().release();
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
 * Call once from the root layout. The auth gate then replace-navigates to welcome.
 */
export function bindApiUnauthorizedHandler(): () => void {
  return api.setUnauthorizedHandler(() => {
    useSession.getState().clearSession();
  });
}
