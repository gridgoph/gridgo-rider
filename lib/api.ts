import Constants from "expo-constants";
import { Platform } from "react-native";

import { shouldInvalidateSessionOnStatus } from "@/lib/authGate";

/**
 * GRIDGO demo API client.
 *
 * Points at the local `gridgo-api` server. Replace this module's base URL and
 * auth storage later when Clerk / Supabase land — keep call sites stable.
 */

export type Role = "client" | "supplier" | "rider" | "ops_admin" | "super_admin";

export type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
  orgName?: string;
  supplierName?: string;
};

/** Structured stop with coordinates from the API — never geocode at runtime. */
export type OrderStop = {
  lat: number;
  lng: number;
  label: string;
};

export type Order = {
  id: string;
  clientId: string;
  supplierId: string | null;
  riderId: string | null;
  state: string;
  productId: string;
  title: string;
  quantity: number;
  size: string;
  material: string;
  deadline: string | null;
  address: string;
  zone: string;
  totalMinor: number;
  deliveryFeeMinor: number;
  paymentMethod: string | null;
  paymentStatus: string;
  codEligible: boolean;
  promisedDate: string | null;
  artworkName: string | null;
  createdAt: string;
  updatedAt: string;
  timeline: { at: string; state: string; by: string; note: string }[];
  /** Supplier pickup stop with lat/lng from the API. */
  pickup?: OrderStop | null;
  /** Client drop-off stop with lat/lng from the API. */
  dropoff?: OrderStop | null;
};

export type Notification = {
  id: string;
  userId: string;
  title: string;
  body: string;
  read: boolean;
  at: string;
};

let tokenMemory: string | null = null;

/** Fired when a request proves the bearer is invalid (401, not login). */
let unauthorizedHandler: (() => void) | null = null;

/**
 * Register a single handler for expired/invalid-token responses.
 * Returns an unsubscribe function. Session store wires this to clearSession.
 */
export function setUnauthorizedHandler(handler: (() => void) | null): () => void {
  unauthorizedHandler = handler;
  return () => {
    if (unauthorizedHandler === handler) unauthorizedHandler = null;
  };
}

const DEFAULT_API_PORT = "8787";

/** Inputs for pure base-URL resolution (unit-tested). */
export type ResolveApiBaseInput = {
  /** Explicit override from EXPO_PUBLIC_API_URL. */
  envUrl?: string | null;
  /** EXPO_PUBLIC_API_PORT, default 8787 when unset. */
  envPort?: string | null;
  /**
   * Host:port (or host) of the Expo dev server, e.g. "192.168.1.12:8081".
   * Hostname only is used; the packager port is dropped.
   */
  devHostUri?: string | null;
  /** Platform.OS value. */
  platformOS: string;
};

/**
 * Resolve the demo API base URL.
 *
 * Precedence:
 * 1. Explicit EXPO_PUBLIC_API_URL (trailing slash stripped)
 * 2. Hostname from the Expo dev server + apiPort
 * 3. Android emulator loopback alias when dev host is localhost
 * 4. http://127.0.0.1:apiPort
 */
export function resolveApiBase({
  envUrl,
  envPort,
  devHostUri,
  platformOS,
}: ResolveApiBaseInput): string {
  const trimmed = envUrl?.trim().replace(/\/$/, "");
  if (trimmed) return trimmed;

  const apiPort = (envPort?.trim() || DEFAULT_API_PORT).replace(/^:/, "");
  const hostname = hostnameFromDevHostUri(devHostUri);

  if (hostname) {
    if (
      (hostname === "localhost" || hostname === "127.0.0.1") &&
      platformOS === "android"
    ) {
      return `http://10.0.2.2:${apiPort}`;
    }
    return `http://${hostname}:${apiPort}`;
  }

  return `http://127.0.0.1:${apiPort}`;
}

/** Pull a hostname from `host:port`, URL-like strings, or bare host. */
export function hostnameFromDevHostUri(hostUri: string | null | undefined): string | null {
  if (!hostUri) return null;
  const raw = hostUri.trim();
  if (!raw) return null;

  // Accept full URLs (linkingUri) as well as bare host:port.
  const candidate = raw.includes("://") ? raw : `http://${raw}`;
  try {
    const { hostname } = new URL(candidate);
    return hostname || null;
  } catch {
    // Last resort: strip path/query and port by hand.
    const withoutPath = raw.split("/")[0]?.split("?")[0] ?? "";
    const host = withoutPath.includes("]")
      ? withoutPath // IPv6 [addr]:port — leave as-is if URL failed
      : withoutPath.replace(/:\d+$/, "");
    return host || null;
  }
}

/**
 * Best-effort Expo dev-server host across Expo Go, dev clients, and classic
 * manifests. Prefer expoConfig.hostUri; fall back to other populated fields.
 */
export function getExpoDevHostUri(): string | null {
  const expoConfig = Constants.expoConfig as { hostUri?: string } | null;
  if (expoConfig?.hostUri) return expoConfig.hostUri;

  const expoGo = Constants.expoGoConfig as { debuggerHost?: string } | null;
  if (expoGo?.debuggerHost) return expoGo.debuggerHost;

  const classic = Constants.manifest as { debuggerHost?: string; hostUri?: string } | null;
  if (classic?.debuggerHost) return classic.debuggerHost;
  if (classic?.hostUri) return classic.hostUri;

  const platformHost = Constants.platform?.hostUri;
  if (platformHost) return platformHost;

  // linkingUri is often exp://192.168.x.x:8081 — usable as a last resort.
  const linking = Constants.linkingUri;
  if (linking && !linking.startsWith("exp://127.") && linking.includes("://")) {
    return linking;
  }

  return null;
}

export function getApiBase(): string {
  return resolveApiBase({
    envUrl: process.env.EXPO_PUBLIC_API_URL,
    envPort: process.env.EXPO_PUBLIC_API_PORT,
    devHostUri: getExpoDevHostUri(),
    platformOS: Platform.OS,
  });
}

export function setToken(token: string | null): void {
  tokenMemory = token;
}

export function getToken(): string | null {
  return tokenMemory;
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(
      typeof body === "object" && body && "error" in body
        ? String((body as { error: string }).error)
        : `HTTP ${status}`,
    );
    this.status = status;
    this.body = body;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const sentBearer = Boolean(tokenMemory);
  if (tokenMemory) headers.Authorization = `Bearer ${tokenMemory}`;

  const res = await fetch(`${getApiBase()}${path}`, { ...init, headers });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    // Expired/invalid bearer — wipe local auth so the routing gate leaves (tabs).
    // Login 401 is wrong password, not session death; skip that path.
    //
    // A 401 on a request that carried no bearer at all proves nothing about the
    // stored session — it usually means the request went out before the session
    // was read back from the phone. Treating it as expiry deleted the very
    // session that was still loading, which signed the rider out on every cold
    // start.
    if (sentBearer && shouldInvalidateSessionOnStatus(res.status, path)) {
      tokenMemory = null;
      unauthorizedHandler?.();
    }
    throw new ApiError(res.status, data);
  }
  return data as T;
}

export async function login(email: string, password: string): Promise<{ token: string; user: User }> {
  const result = await request<{ token: string; user: User }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setToken(result.token);
  return result;
}

export async function logout(): Promise<void> {
  try {
    await request("/auth/logout", { method: "POST" });
  } finally {
    setToken(null);
  }
}

export async function me(): Promise<User> {
  const result = await request<{ user: User }>("/auth/me");
  return result.user;
}

export async function listOrders(): Promise<Order[]> {
  const result = await request<{ orders: Order[] }>("/orders");
  return result.orders;
}

export async function listJobs(): Promise<Order[]> {
  const result = await request<{ jobs: Order[] }>("/jobs");
  return result.jobs;
}

export async function listOffers(): Promise<Order[]> {
  const result = await request<{ offers: Order[] }>("/dispatch/offers");
  return result.offers;
}

export async function getOrder(orderId: string): Promise<Order> {
  const result = await request<{ order: Order }>(`/orders/${orderId}`);
  return result.order;
}

export async function acceptOffer(orderId: string): Promise<Order> {
  const result = await request<{ order: Order }>(`/dispatch/${orderId}/accept`, {
    method: "POST",
    body: "{}",
  });
  return result.order;
}

export async function transitionOrder(
  orderId: string,
  state: string,
  extra: Record<string, unknown> = {},
): Promise<Order> {
  const result = await request<{ order: Order }>(`/orders/${orderId}/transition`, {
    method: "POST",
    body: JSON.stringify({ state, ...extra }),
  });
  return result.order;
}

export type ProofKind = "pickup" | "delivery" | "cod" | "failure";

export type ProofPayload = {
  kind: ProofKind;
  otp?: string;
  photoName?: string;
  note?: string;
  reason?: string;
};

export type ProofResult = {
  proof: {
    id: string;
    orderId: string;
    riderId: string;
    kind: string;
    otp: string | null;
    photoName: string | null;
    note: string;
    at: string;
  };
  order: Order;
};

/**
 * Submit pickup, delivery, COD, or failure proof.
 * Callers pass only the fields they collected — no silent defaults for OTP.
 */
export async function submitProof(orderId: string, payload: ProofPayload): Promise<ProofResult> {
  return request(`/dispatch/${orderId}/proof`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type LocationPing = {
  id: string;
  orderId: string;
  riderId: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  at: string;
};

/** Post a one-shot location ping. Never store pings client-side. */
export async function postLocation(
  orderId: string,
  coords: { lat: number; lng: number; accuracy?: number | null },
): Promise<LocationPing> {
  const result = await request<{ ping: LocationPing }>(`/dispatch/${orderId}/location`, {
    method: "POST",
    body: JSON.stringify({
      lat: coords.lat,
      lng: coords.lng,
      accuracy: coords.accuracy ?? null,
    }),
  });
  return result.ping;
}

export async function listNotifications(): Promise<Notification[]> {
  const result = await request<{ notifications: Notification[] }>("/notifications");
  return result.notifications;
}

export async function creditBalance(): Promise<{ balanceMinor: number }> {
  return request("/credits/balance");
}

export type Health = {
  ok: boolean;
  /** Present only once the API ships object storage. */
  storage?: { status: "checking" | "available" | "unavailable" };
};

export async function health(): Promise<Health> {
  return request("/health");
}

/**
 * Whether this server can store proof files.
 * "unknown" means the API predates file storage — do not guess either way.
 */
export function storageStatus(health: Health | null): "available" | "unavailable" | "unknown" {
  const status = health?.storage?.status;
  if (status === "available") return "available";
  if (status === "unavailable") return "unavailable";
  return "unknown";
}

/** Format PHP minor units (centavos) for display. */
export function formatPhp(minor: number): string {
  return `₱${(minor / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Whether a string is an internal identifier rather than something to read.
 *
 * The demo API answers failures with `{ error: "not_offerable" }`, and an
 * `HTTP 500` is no better. Either one on a rider's screen is the clearest tell
 * that nobody finished the screen, so anything shaped like a code or a status
 * line is swapped for the caller's own sentence.
 */
export function isInternalCode(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  // snake_case / kebab-case / SCREAMING_CASE identifiers, and "HTTP 503".
  if (/^[a-z][a-z0-9]*([_-][a-z0-9]+)+$/i.test(trimmed)) return true;
  if (/^HTTP\s+\d{3}$/i.test(trimmed)) return true;
  // A single lowercase word with no sentence around it is a code too.
  if (/^[a-z0-9]+$/.test(trimmed)) return true;
  return false;
}

/** Map API errors to rider-facing recovery copy. Never shows a raw code. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const code = typeof error.body === "object" && error.body && "error" in error.body
      ? String((error.body as { error: string }).error)
      : error.message;
    switch (code) {
      case "not_offerable":
        return "Another rider took this job. Pull down to refresh the list.";
      case "order_not_found":
        return "That job is gone. Open Offers to take a new one.";
      case "tracking_not_active":
        return "Location sharing only runs while a package is with you.";
      case "forbidden":
        return "This job is not assigned to you.";
      case "invalid_transition":
      case "invalid_state":
        return "This step is no longer available. Pull down to refresh the trip.";
      case "minio_unavailable":
      case "storage_initializing":
        return "Photo storage is offline, so nothing can be proven yet. Tell Operations.";
      default:
        break;
    }
    if (error.status >= 500) {
      return `${fallback} If it keeps happening, tell Operations the server is failing.`;
    }
    return isInternalCode(code) ? fallback : code;
  }
  if (error instanceof Error && error.message && !isInternalCode(error.message)) {
    return error.message;
  }
  return fallback;
}

