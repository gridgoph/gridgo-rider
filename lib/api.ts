import { assertLiveGeneration, liveGeneration } from "@/lib/live";
import Constants from "expo-constants";
import { Platform } from "react-native";

import { shouldInvalidateSessionOnStatus } from "@/lib/authGate";
import type { DevicePlatform } from "@/lib/push";

/**
 * GRIDGO demo API client.
 *
 * Points at the local `gridgo-api` server. Replace this module's base URL and
 * auth storage later when Clerk / Supabase land — keep call sites stable.
 */

export type Role = "client" | "supplier" | "rider" | "ops_admin" | "super_admin";

/**
 * Where an account stands with Operations.
 *
 * Riders apply themselves, so a newly created account can sign in while still
 * being unable to take any work at all. That gap is a state the app has to
 * show honestly, not a loading spinner.
 */
export type VerificationStatus =
  | "unverified"
  | "pending"
  | "approved"
  | "suspended"
  | "rejected";

export type RiderProfile = {
  vehicleType: string;
  vehiclePlate: string;
  licenseNumber: string;
};

export type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
  phone?: string;
  verificationStatus?: VerificationStatus;
  /** Operations' own words on the decision. Shown as-is when present. */
  verificationNote?: string;
  riderProfile?: RiderProfile;
};

/** Structured stop with coordinates from the API — never geocode at runtime. */
export type OrderStop = {
  lat: number;
  lng: number;
  label: string;
};

/** The six checks, in the order the rider works through them. */
export type PickupCheckCode =
  | "quantity_match"
  | "specification_match"
  | "visible_defects"
  | "packaging_integrity"
  | "documentation"
  | "supplier_sign_off";

export type PickupCheckResult = { code: PickupCheckCode; passed: boolean };

export type PickupChecklistStatus =
  | "not_started"
  | "passed"
  | "failed_escalated"
  | "escalation_resolved"
  | "legacy_passed";

export type PickupChecklistRecord = {
  status: PickupChecklistStatus;
  checks: PickupCheckResult[];
  evidenceFileIds: string[];
  failureNote: string | null;
  completedAt: string | null;
  completedBy: string | null;
  escalationId: string | null;
  /** The trained line the rider says at sign-off. The server owns the words. */
  signOffPrompt: string | null;
};

/**
 * One half of the client's digital payment.
 *
 * The rider is shown the *status* and never the amount: what the client paid is
 * not the rider's business now that no money changes hands at the door.
 */
export type PaymentInstallmentStatus =
  | "not_submitted"
  | "pending_confirmation"
  | "confirmed"
  | "legacy_confirmed";

export type PaymentInstallment = {
  amountMinor: number;
  method: string;
  status: PaymentInstallmentStatus;
  submittedAt: string | null;
  confirmedAt: string | null;
  confirmationSource: string | null;
};

export type PayoutMilestoneCode = "printing" | "packaging_qc" | "delivered" | "retention";

export type PayoutMilestone = {
  code: PayoutMilestoneCode;
  sharePercent: number;
  status: "pending_pof" | "pof_attached" | "released";
  pofFileIds: string[];
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
  finish?: string;
  deadline: string | null;
  address: string;
  zone: string;
  /**
   * The rider's fee for the job, banded by distance. This is the only money in
   * this type the rider app puts on screen — the client's subtotal and total
   * are visible to this role but say nothing a rider can act on, and showing
   * them was only ever there to support cash collection.
   */
  deliveryFeeMinor: number;
  /** Straight-line metres the fee band was derived from. */
  deliveryDistanceMeters?: number | null;
  subtotalMinor: number;
  totalMinor: number;
  downpaymentMinor: number;
  balanceMinor: number;
  paymentMethod: string | null;
  paymentStatus: string;
  payments?: {
    downpayment?: PaymentInstallment;
    balance?: PaymentInstallment;
  } | null;
  payoutMilestones?: PayoutMilestone[];
  payoutHold?: boolean;
  pickupChecklist?: PickupChecklistRecord | null;
  deliveryEvidence?: {
    fileId: string;
    evidenceType: "photo" | "signature";
    riderId: string;
    recordedAt: string;
  } | null;
  issueWindowOpenedAt?: string | null;
  issueWindowExpiresAt?: string | null;
  promisedDate: string | null;
  artworkName: string | null;
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  timeline: { at: string; state: string; by: string; note: string }[];
  /** Supplier pickup stop with lat/lng from the API. */
  pickup?: OrderStop | null;
  /** Client drop-off stop with lat/lng from the API. */
  dropoff?: OrderStop | null;
  /**
   * How the client receives the job. `"pickup"` means the rider's second
   * stop is GRIDGO Office, not a client door.
   */
  fulfillmentMode?: "delivery" | "pickup" | null;
};

export type Notification = {
  id: string;
  userId: string;
  title: string;
  body: string;
  /** Broadcast picture. Public HTTPS link or `/public/announcement-images/<fileId>`. */
  imageUrl?: string | null;
  read: boolean;
  at: string;
  /** Internal kind. Never rendered — it decides nothing the rider reads. */
  type?: string;
  /** Present when the alert is about one job, which most rider alerts are. */
  orderId?: string;
};

/**
 * A phone registered to receive push.
 *
 * The raw token is never returned by any route: `tokenTail` is its last eight
 * characters, which is enough to recognise a registration in a support
 * conversation and not enough to send to it.
 */
export type Device = {
  id: string;
  userId: string;
  platform: DevicePlatform;
  tokenTail: string;
  createdAt: string;
  updatedAt: string;
};

let tokenMemory: string | null = null;
let tokenProvider: (() => Promise<string | null>) | null = null;

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
  /**
   * `false` only for an Android emulator. Loopback then becomes `10.0.2.2`.
   * A physical phone (or unknown) keeps IPv4 loopback so USB reverse of
   * `:8787` works on any Wi-Fi without baking a LAN address into the app.
   */
  isDevice?: boolean;
};

/**
 * Resolve the demo API base URL.
 *
 * Precedence:
 * 1. Explicit EXPO_PUBLIC_API_URL (trailing slash stripped)
 * 2. Hostname from the Expo dev server + apiPort
 * 3. Android loopback: emulator → 10.0.2.2; USB phone → 127.0.0.1
 * 4. http://127.0.0.1:apiPort
 */
export function resolveApiBase({
  envUrl,
  envPort,
  devHostUri,
  platformOS,
  isDevice,
}: ResolveApiBaseInput): string {
  const trimmed = envUrl?.trim().replace(/\/$/, "");
  if (trimmed) return trimmed;

  const apiPort = (envPort?.trim() || DEFAULT_API_PORT).replace(/^:/, "");
  const hostname = hostnameFromDevHostUri(devHostUri);

  if (hostname) {
    const loopback = hostname === "localhost" || hostname === "127.0.0.1";
    if (loopback && platformOS === "android") {
      if (isDevice === false) {
        return `http://10.0.2.2:${apiPort}`;
      }
      // `localhost` can resolve to IPv6 ::1; adb reverse only tunnels IPv4.
      return `http://127.0.0.1:${apiPort}`;
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
    isDevice: Constants.isDevice,
  });
}

/** In-app picture URL. Hosted broadcast paths resolve against this app's API. */
export function notificationImageUrl(imageUrl?: string | null): string | null {
  const value = typeof imageUrl === "string" ? imageUrl.trim() : "";
  if (!value) return null;
  if (value.startsWith("/")) return `${getApiBase().replace(/\/$/, "")}${value}`;
  return value;
}

export function setToken(token: string | null): void {
  tokenMemory = token;
}

/** Install Clerk's fresh-token reader without changing any domain call site. */
export function setTokenProvider(
  provider: (() => Promise<string | null>) | null,
): () => void {
  tokenProvider = provider;
  return () => {
    if (tokenProvider === provider) tokenProvider = null;
  };
}

export function getToken(): string | null {
  return tokenMemory;
}

/**
 * The bearer every authenticated call must send.
 *
 * Clerk never writes {@link getToken}'s memory. It installs a provider that
 * mints a fresh JWT. JSON `request()` already waits on that provider; file
 * uploads used to read memory and went out with no Authorization, which the
 * Android stack then reported as a dead connection.
 */
export async function resolveBearer(): Promise<string | null> {
  const provider = tokenProvider;
  if (!provider) return tokenMemory;
  const token = await provider();
  // A superseded identity must never fall back to a previous legacy bearer.
  if (provider !== tokenProvider) return null;
  return token?.trim() || null;
}

/**
 * Whether this phone currently has a GRIDGO bearer — a stored demo token *or*
 * a live Clerk session that can mint one.
 *
 * Push registration used to look at {@link getToken} only. Clerk never writes
 * that memory: it installs a provider, so a signed-in rider looked unsigned-in
 * and the phone registered unclaimed (or failed the unclaimed shape check).
 * A Rider broadcast then had nobody to interrupt.
 */
export async function sessionBearerPresent(): Promise<boolean> {
  try { return Boolean(await resolveBearer()); } catch { return false; }
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

type RequestInitWithProbe = RequestInit & {
  /*
    Ask a question without betting the session on the answer.

    A 401 normally means the bearer died, so it wipes local auth and the gate
    leaves the authenticated area. But `/auth/me` is also how this app asks
    "does GRIDGO know this Clerk identity yet?", and for someone who has just
    created their account the honest answer is 401 — the enrollment that
    creates their rider record has not run yet. Letting that answer tear the
    session down signed brand-new riders out mid-application.
  */
  ignoreUnauthorized?: boolean;
};

export const API_REQUEST_MS = 20_000;

async function request<T>(path: string, init: RequestInitWithProbe = {}): Promise<T> {
  const generation = liveGeneration();
  const { ignoreUnauthorized, ...fetchInit } = init;
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_REQUEST_MS);
  const aborted = new Promise<never>((_, reject) => {
    controller.signal.addEventListener("abort", () => reject(new Error("GRIDGO did not answer in time. Check this phone’s connection, then try again.")), { once: true });
  });
  let res: Response;
  let text: string;
  let sentBearer = false;
  try {
    const bearer = await Promise.race([resolveBearer(), aborted]);
    assertLiveGeneration(generation);
    sentBearer = Boolean(bearer);
    if (bearer) { headers.Authorization = `Bearer ${bearer}`; headers["X-GRIDGO-Role"] = "rider"; }
    res = await Promise.race([fetch(`${getApiBase()}${path}`, { ...fetchInit, headers, signal: controller.signal }), aborted]);
    text = await Promise.race([res.text(), aborted]);
  } finally { clearTimeout(timer); }
  assertLiveGeneration(generation);
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
    if (!ignoreUnauthorized && sentBearer && shouldInvalidateSessionOnStatus(res.status, path)) {
      tokenMemory = null;
      unauthorizedHandler?.();
    }
    throw new ApiError(res.status, data);
  }
  return data as T;
}

/**
 * `/auth/me` and the rider profile both speak `plateNumber`. This app's
 * session has always called it `vehiclePlate`, so both reads are mapped here
 * rather than at every screen.
 */
function sessionUser(user: User): User {
  if (!user) return user;
  const profile = user.riderProfile as (RiderProfile & { plateNumber?: string }) | undefined;
  if (!profile) return user;
  return {
    ...user,
    riderProfile: {
      vehicleType: profile.vehicleType,
      vehiclePlate: profile.vehiclePlate || profile.plateNumber || "",
      licenseNumber: profile.licenseNumber || "",
    },
  };
}

export async function login(email: string, password: string): Promise<{ token: string; user: User }> {
  const result = await request<{ token: string; user: User }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setToken(result.token);
  return { ...result, user: sessionUser(result.user) };
}

/**
 * Public rider apply — `POST /auth/clerk/enroll/rider`.
 *
 * Body is exact: the API rejects unexpected keys, so `role`, `email`,
 * `password` and `name` must not appear. Clerk owns the identity and the API
 * reads the name and email from the authenticated Clerk user.
 */
export type RiderEnrollment = {
  profile: {
    phone: string;
    vehicleType: RiderProfile["vehicleType"];
    plateNumber: string;
    licenseNumber?: string;
  };
};

/**
 * Open a pending rider account from a live Clerk session.
 *
 * The caller must already have a Clerk JWT on the token provider. The enroll
 * reply is a membership projection rather than the rider `User` this app
 * hydrates, so `/auth/me` is the adopt step.
 */
export async function enrollRider(
  input: RiderEnrollment,
  idempotencyKey: string,
): Promise<User> {
  await request("/auth/clerk/enroll/rider", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(input),
  });
  return me({ ignoreUnauthorized: true });
}

/**
 * Sign out, and stop this phone receiving the account's push in the same call.
 *
 * The device token goes with the sign-out rather than through
 * `POST /devices/unregister` for a sequencing reason the contract is explicit
 * about: after logout the bearer token is invalid, so a phone that signs out
 * first can no longer authenticate an unregister and would keep waking for the
 * previous rider's job offers. Sending no token stays valid and behaves exactly
 * as it did before push existed.
 *
 * `deviceUnregistered` is `false` — with a 200 and a completed sign-out —
 * when no token was sent, the session had already expired, or the token now
 * belongs to somebody else. None of those is a failure worth showing anyone.
 */
/** Captures this identity before UI teardown clears the provider. */
export function captureLogoutBearer(): Promise<string | null> {
  const provider = tokenProvider;
  const token = tokenMemory;
  if (!provider) return Promise.resolve(token);
  return new Promise((resolve) => {
    const deadline = setTimeout(() => resolve(null), 2_500);
    void Promise.resolve().then(provider).then(resolve, () => resolve(null)).finally(() => clearTimeout(deadline));
  });
}

export async function logout(deviceToken?: string | null, capturedBearer?: Promise<string | null>): Promise<void> {
  if (capturedBearer) {
    const bearer = await capturedBearer;
    if (!bearer) return;
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 5_000);
    try {
      await fetch(`${getApiBase()}/auth/logout`, {
        method: "POST", signal: controller.signal,
        headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json", "X-GRIDGO-Role": "rider" },
        body: JSON.stringify(deviceToken ? { deviceToken } : {}),
      });
    } finally { clearTimeout(deadline); }
    // This old session must never clear a newer account's token or handle its 401.
    return;
  }
  try {
    await request("/auth/logout", {
      method: "POST",
      body: JSON.stringify(deviceToken ? { deviceToken } : {}),
      ignoreUnauthorized: true,
    });
  } finally {
    setToken(null);
  }
}

/**
 * Register this installation's FCM token against the signed-in rider.
 *
 * Idempotent and cheap by design, so it is called on every launch and on every
 * token refresh: re-registering the same token under the same account updates
 * the one record, and registering a token held by another account **moves** it,
 * which is what a shared handset produces. `201` means the token was new,
 * `200` that it was updated or moved — both are success, so only the body is
 * read.
 */
export async function registerDevice(
  token: string,
  platform: DevicePlatform,
): Promise<{ device: Device; created: boolean; reassigned: boolean }> {
  return request<{ device: Device; created: boolean; reassigned: boolean }>("/devices", {
    method: "POST",
    body: JSON.stringify({ token, platform, appRole: "rider", tokenProvider: platform === "ios" ? "apns" : "fcm" }),
  });
}

/**
 * Provisional. Register this phone **before anyone has signed in**.
 *
 * A rider that installs GRIDGO and does not sign in for a week is still a
 * phone GRIDGO needs to reach — "there is a new version, update your app" is
 * exactly the announcement that must land on a handset with no session.
 * `POST /devices` requires a bearer today; the platform is opening it to an
 * unauthenticated caller in parallel with this app, registering the token
 * **unclaimed**. Signing in then claims it through the ordinary
 * {@link registerDevice}, because the contract already moves a token from one
 * owner to another on registration.
 *
 * Two deliberate differences from every other call in this module:
 *
 * - It never sends a bearer, even when one exists. A claimed registration is
 *   {@link registerDevice}'s job, and mixing the two would make which one ran
 *   depend on timing.
 * - It does not go through `request()`, so its `401` cannot clear the session.
 *   A deployment without this route answers `401`, and routing that through the
 *   unauthorized handler would sign a rider out because a *provisional* route
 *   is not live yet. `store/push.ts` reads the status and treats `401`, `403`,
 *   `404` and `405` as "not open yet" rather than a failure.
 *
 * Throws {@link ApiError} exactly as `request()` would, so callers read one
 * shape.
 */
export async function registerDeviceUnclaimed(
  token: string,
  platform: DevicePlatform,
): Promise<void> {
  const res = await fetch(`${getApiBase()}/devices`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ token, platform, appRole: "rider", tokenProvider: platform === "ios" ? "apns" : "fcm" }),
  });
  if (!res.ok) {
    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    throw new ApiError(res.status, data);
  }
}

/** The caller's own registrations, always — there is no route to anyone else's. */
export async function listDevices(): Promise<Device[]> {
  const result = await request<{ devices: Device[] }>("/devices");
  return result.devices;
}

/**
 * Drop one registration.
 *
 * Prefer passing the token to {@link logout}. This exists for the case where
 * the session is still valid and only push is being turned off. A token
 * registered to a different account returns `404`, exactly as an unregistered
 * one does, so that asking cannot answer "is this token someone else's?".
 */
export async function unregisterDevice(token: string): Promise<void> {
  await request("/devices/unregister", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function me(options: { ignoreUnauthorized?: boolean } = {}): Promise<User> {
  const result = await request<{ user: User }>("/auth/me", {
    ignoreUnauthorized: options.ignoreUnauthorized,
  });
  return sessionUser(result.user);
}

/* --------------------------------------------------------------------------
   The rider's own details

   The record behind the identity card on Account: the name Operations sees,
   the number they call, and the vehicle on the application. GRIDGO owns those.
   The portrait belongs to the GRIDGO sign-in and never goes through this pair.

   The write carries the version it was read at, as both `expectedVersion` in
   the body and `If-Match` in the header, or GRIDGO answers
   `400 expected_version_required`. Email is deliberately absent from the
   patch type — the platform refuses it.
   -------------------------------------------------------------------------- */

export type RiderSelfProfile = {
  userId: string;
  name: string | null;
  /** Canonical `+639XXXXXXXXX`, or null when the rider has never given one. */
  phone: string | null;
  /** Owned by the GRIDGO sign-in. Read-only everywhere in this app. */
  email: string;
  vehicleType: string;
  plateNumber: string;
  licenseNumber: string | null;
  version: number;
  updatedAt: string;
};

export type RiderSelfProfilePatch = {
  name?: string;
  phone?: string;
  vehicleType?: string;
  plateNumber?: string;
  licenseNumber?: string;
};

export async function getRiderProfile(): Promise<RiderSelfProfile> {
  const result = await request<{ profile: RiderSelfProfile }>("/me/rider-profile");
  return result.profile;
}

export async function updateRiderProfile(
  version: number,
  patch: RiderSelfProfilePatch,
): Promise<RiderSelfProfile> {
  const result = await request<{ profile: RiderSelfProfile }>("/me/rider-profile", {
    method: "PATCH",
    headers: { "If-Match": String(version) },
    body: JSON.stringify({ ...patch, expectedVersion: version }),
  });
  return result.profile;
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

export type PickupChecklistResult = {
  order: Order;
  /** Present only when all six passed. The line the rider says out loud. */
  signOffPrompt?: string;
  /** Present only when a check failed and transport is now blocked. */
  escalation?: { id: string; status: string };
};

/**
 * Submit all six pickup checks.
 *
 * All passing moves the job to "package with you" and returns the sign-off
 * line. Any failure needs the note and at least one already-attached photo, and
 * leaves the job where it is with an escalation open — the rider does not
 * transport.
 */
export async function submitPickupChecklist(
  orderId: string,
  checks: PickupCheckResult[],
  failure?: { failureNote: string; evidenceFileIds: string[] },
): Promise<PickupChecklistResult> {
  return request(`/dispatch/${orderId}/pickup-checklist`, {
    method: "POST",
    body: JSON.stringify({ checks, ...(failure ?? {}) }),
  });
}

/**
 * Record the delivery against evidence the server already holds.
 *
 * The file must be attached to the order first — see `lib/attachments.ts`.
 * Success moves the job to delivered and opens the issue window in one step.
 */
export async function recordDelivery(
  orderId: string,
  evidence: { evidenceFileId: string; evidenceType: "photo" | "signature" },
): Promise<Order> {
  const result = await request<{ order: Order }>(`/dispatch/${orderId}/delivery`, {
    method: "POST",
    body: JSON.stringify(evidence),
  });
  return result.order;
}

export type OperationalSettings = {
  /** How long a client has to raise an issue after delivery. One global value. */
  issueWindowHours: number;
  deliveryFeeBands: { maxDistanceMeters: number | null; feeMinor: number }[];
};

/** The platform's operational settings. Read-only for a rider. */
export async function getSettings(): Promise<OperationalSettings> {
  const result = await request<{ settings: OperationalSettings }>("/settings");
  return result.settings;
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
  coords: { lat: number; lng: number; accuracy?: number | null; recordedAt?: string },
): Promise<LocationPing> {
  const result = await request<{ ping: LocationPing }>(`/dispatch/${orderId}/location`, {
    method: "POST",
    body: JSON.stringify({
      lat: coords.lat,
      lng: coords.lng,
      accuracy: coords.accuracy ?? null,
      ...(coords.recordedAt ? { recordedAt: coords.recordedAt } : {}),
    }),
  });
  return result.ping;
}

export async function listNotifications(): Promise<Notification[]> {
  const result = await request<{ notifications: Notification[] }>("/notifications?role=rider");
  return result.notifications;
}

/** A snapshot of IDs avoids acknowledging notifications that arrive during the request. */
export async function markNotificationsRead(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => request(`/notifications/${encodeURIComponent(id)}`, {
    method: "PATCH", body: JSON.stringify({ read: true }),
  })));
}

/**
 * Soft-delete one of the caller's own inbox rows.
 *
 * `GET /notifications` never returns a deleted row again. Retrying the same
 * owner delete is a success — the platform keeps the record as evidence and
 * only hides it from this inbox.
 */
export async function deleteNotification(id: string): Promise<{ id: string; deletedAt: string }> {
  return request(`/notifications/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** Approved shop on the public catalog, with the pin a rider drives to. */
export type CatalogShopPoint = {
  lat: number;
  lng: number;
  label: string;
};

export type CatalogShopSummary = {
  supplierId: string;
  shopName: string;
  shop: CatalogShopPoint | null;
  categories: string[];
  itemCount: number;
};

const CATALOG_SHOP_PAGE_CAP = 25;

/**
 * Every approved shop with a live listing.
 *
 * `GET /catalog/shops` pages; the Map tab needs the whole set so it follows
 * `nextCursor` rather than stopping at the first page.
 */
export async function listCatalogShops(): Promise<CatalogShopSummary[]> {
  const shops: CatalogShopSummary[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < CATALOG_SHOP_PAGE_CAP; page += 1) {
    const query: string = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    const pageBody = await request<{
      shops?: CatalogShopSummary[];
      nextCursor?: string | null;
    }>(`/catalog/shops${query}`);
    shops.push(...(pageBody.shops ?? []));
    if (!pageBody.nextCursor) break;
    cursor = pageBody.nextCursor;
  }
  return shops;
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

/**
 * The machine-readable reason the API refused, for the few callers that must
 * branch on it rather than just show a sentence. Null when the failure never
 * reached the API, so a caller cannot mistake a dead connection for a verdict.
 */
export function apiErrorCode(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  return typeof error.body === "object" && error.body && "error" in error.body
    ? String((error.body as { error: string }).error)
    : null;
}

/** Map API errors to rider-facing recovery copy. Never shows a raw code. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const code = apiErrorCode(error) ?? error.message;
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
      case "rider_not_approved":
        return "Operations has not approved this rider account yet, so no work can be taken on it.";
      case "pickup_escalation_open":
        return "Do not transport this package. Operations is still handling the failed check — wait for their instruction, then run all six checks again.";
      case "pickup_checklist_not_available":
        return "The checks only run before you leave the shop. Pull down to refresh the trip and see where it is now.";
      case "invalid_pickup_checklist":
        return "Answer all six checks before submitting them.";
      case "checklist_evidence_required":
        return "Photograph the problem and describe it before the escalation can be filed.";
      case "invalid_checklist_evidence":
        return "The photo did not reach the job. Take it again and send it before escalating.";
      case "balance_not_confirmed":
        return "Operations has not confirmed the client's final payment yet, so this delivery cannot be closed. Call Operations before handing the package over.";
      case "pof_required":
        return "The proof of fulfilment did not reach the server. Take the photo again and wait for it to save.";
      case "delivery_not_available":
        return "Delivery opens once you have passed the pickup checks and left the shop. Pull down to refresh the trip.";
      case "delivery_evidence_required":
      case "invalid_delivery_evidence_type":
        return "The evidence is not on the job yet. Take the photo again and wait for it to save.";
      case "email_already_registered":
        /*
          Two situations arrive as the same refusal, and the app cannot tell them
          apart: the address is held by a second live sign-in, or by an account
          whose sign-in no longer exists. So this must not promise that another
          sign-in will work — for an orphaned account none will, and a rider
          told to go and find one would hunt for something unreachable. Name
          what is true of both, and who can actually release the address.
        */
        return "Another GRIDGO account already holds this email. Sign out and try your other sign-in if you have one — otherwise Operations has to release the address before you can apply.";
      case "application_already_exists":
        return "Your application is already on file. Sign out and sign back in to see where it stands.";
      case "invalid_password":
        return "Use a password with at least 8 characters.";
      case "invalid_email":
        return "Enter a complete email address.";
      case "name_required":
        return "Enter the name this account belongs to.";
      case "phone_required":
        return "Enter a number Operations can reach you on.";
      case "invalid_rider_profile":
        return "Fill in your vehicle, plate number and licence number.";
      case "invitation_required":
        return "This server is not taking public rider applications. Open the invitation sent by Operations.";
      case "dispatch_proof_route_retired":
      case "payment_route_retired":
        return "This app is out of date for the current GRIDGO process. Update it before taking more work.";
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
