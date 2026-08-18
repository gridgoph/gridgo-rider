import type { Role } from "@/lib/api";

const GRIDGO_ROLES: readonly Role[] = [
  "client",
  "supplier",
  "rider",
  "ops_admin",
  "super_admin",
];

export type ClerkMetadata = Record<string, unknown> | null | undefined;

/** Read the server-owned GRIDGO role without trusting an arbitrary string. */
export function readGridgoRole(metadata: ClerkMetadata): Role | null {
  if (!metadata) return null;
  const value = metadata.gridgoRole ?? metadata.gridgo_role;
  return typeof value === "string" && GRIDGO_ROLES.includes(value as Role)
    ? (value as Role)
    : null;
}

/** Fail closed when a fresh user resource and a still-cached claim disagree. */
export function resolveGridgoRole(
  claimRole: Role | null,
  metadataRole: Role | null,
): Role | null {
  const mismatch = [claimRole, metadataRole].find(
    (role): role is Role => role != null && role !== "rider",
  );
  return mismatch ?? claimRole ?? metadataRole;
}

/**
 * Rider-facing recovery copy for a Clerk account that belongs elsewhere.
 *
 * A *missing* role is not a rejection. Rider enrollment writes a GRIDGO
 * membership, never Clerk `publicMetadata.gridgoRole`, so a legitimate rider —
 * and every brand-new applicant — reaches this check with no role at all.
 * Only `/auth/me` can tell those apart, so absence defers to it. Conflating
 * the two is what locked riders out of their own app and blocked self-signup.
 */
export function riderAccessError(role: Role | null): string | null {
  if (role == null || role === "rider") return null;
  switch (role) {
    case "client":
      return "This account belongs in the GRIDGO Client app.";
    case "supplier":
      return "This account belongs in the GRIDGO Supplier app.";
    case "ops_admin":
    case "super_admin":
      return "This account belongs in the GRIDGO Operations app.";
    default:
      return "This account is not activated for riders. Open the link from your Operations invite.";
  }
}

type ClerkErrorLike = {
  errors?: Array<{ longMessage?: string; message?: string }>;
};

/** Clerk errors are structured; never leak codes or response internals. */
export function clerkErrorMessage(error: unknown, fallback: string): string {
  if (typeof error !== "object" || error === null) return fallback;
  const first = (error as ClerkErrorLike).errors?.[0];
  const structured = first?.longMessage ?? first?.message;
  if (typeof structured === "string" && structured.trim()) return structured.trim();
  // A thrown Error (incomplete factor, leftover session) used to collapse into
  // "Wrong email or password" and hide the real reason.
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return fallback;
}

/**
 * Clerk answers a duplicate sign-in attempt with an error rather than a
 * no-op, and enrollment must treat that as success — the phone already holds
 * the session the caller was trying to create.
 */
export function isAlreadySignedInError(error: unknown): boolean {
  const message = clerkErrorMessage(error, "").toLowerCase();
  return (
    message.includes("already signed in") ||
    message.includes("already logged in") ||
    message.includes("currently signed in") ||
    message.includes("currently logged in")
  );
}

export type ClerkGetToken = (
  options?: { skipCache?: boolean },
) => Promise<string | null | undefined>;

/**
 * Fresh JWT for gridgo-api. A cached leftover is often expired or empty, and a
 * signed-out Clerk throws rather than returning null — answer null either way.
 */
async function clerkSessionToken(getToken: ClerkGetToken): Promise<string | null> {
  try {
    const token = await getToken({ skipCache: true });
    return token?.trim() ? token : null;
  } catch {
    return null;
  }
}

/**
 * A session created moments ago does not always mint a token on the first ask,
 * so enrollment waits briefly rather than sending an unauthenticated request.
 */
export async function awaitClerkSessionToken(
  getToken: ClerkGetToken,
  attempts = 5,
  delayMs = 120,
): Promise<string | null> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const token = await clerkSessionToken(getToken);
    if (token) return token;
    if (attempt < attempts - 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return null;
}

/** Clerk takes a first and last name; the form asks for one full name. */
export function splitPersonName(value: string): { firstName: string; lastName?: string } {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  const firstName = parts.shift() ?? "";
  return parts.length ? { firstName, lastName: parts.join(" ") } : { firstName };
}

/** Production builds must be configured explicitly with a live Clerk instance. */
export function clerkPublishableKey(
  value: string | null | undefined,
  development: boolean,
): string {
  const key = value?.trim();
  if (!key || !/^pk_(test|live)_/.test(key)) {
    throw new Error("EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is missing or invalid.");
  }
  if (!development && !key.startsWith("pk_live_")) {
    throw new Error("Production GRIDGO Rider builds require a pk_live_ Clerk key.");
  }
  return key;
}

/**
 * Expo extra is preferred because app.config.ts stamps it at prebuild. Keep
 * the static process.env read as a Gradle-time fallback: Babel can inline that
 * value while bundling even if prebuild evaluated an empty environment.
 */
export function resolveClerkPublishableKey(
  extra: unknown,
  development: boolean,
): string {
  const fromExtra = typeof extra === "string" ? extra : "";
  return clerkPublishableKey(
    fromExtra || process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
    development,
  );
}
