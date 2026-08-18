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
  const message = first?.longMessage ?? first?.message;
  return typeof message === "string" && message.trim() ? message.trim() : fallback;
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
