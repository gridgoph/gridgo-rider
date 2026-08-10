import type { User } from "@/lib/api";

/**
 * What a signed-in rider's phone remembers between launches.
 *
 * The token is the whole point: without it, closing the app signs the rider
 * out, and a rider who has to type a password at a supplier counter in the
 * rain will not use the app. The user record rides along so the first frame
 * after launch can render their name instead of a spinner.
 *
 * Parsing is deliberately strict and pure so it can be unit-tested: a
 * half-written or stale record from an older build must read as "no session"
 * rather than crash the launch path.
 */

export const SESSION_STORAGE_KEY = "gridgo.session";

/** Only this role may hold a session in this binary. */
export const SESSION_ROLE = "rider" as const;

export type StoredSession = {
  token: string;
  user: User;
};

/** Serialise a session for AsyncStorage. */
export function serialiseSession(session: StoredSession): string {
  return JSON.stringify({ token: session.token, user: session.user });
}

/**
 * Read a stored session back, or null if there is nothing trustworthy there.
 *
 * Rejects: absent values, malformed JSON, a missing token, a missing user id,
 * and — the one that matters for a per-role app — a user whose role is not
 * `rider`. A stale record from a shared device must not open the rider app.
 */
export function parseStoredSession(raw: string | null | undefined): StoredSession | null {
  if (!raw) return null;

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof value !== "object" || value === null) return null;
  const record = value as { token?: unknown; user?: unknown };

  const token = typeof record.token === "string" ? record.token.trim() : "";
  if (!token) return null;

  const user = record.user;
  if (typeof user !== "object" || user === null) return null;
  const candidate = user as Partial<User>;

  if (typeof candidate.id !== "string" || !candidate.id) return null;
  if (typeof candidate.email !== "string" || !candidate.email) return null;
  if (typeof candidate.name !== "string" || !candidate.name) return null;
  if (candidate.role !== SESSION_ROLE) return null;

  return { token, user: candidate as User };
}
