import * as api from "@/lib/api";
import { apiErrorMessage } from "@/lib/api";

/**
 * The rider's own name, number, vehicle, plate and licence — the record
 * behind the identity card on Account.
 *
 * **Not open yet.** `/me/rider-profile` is being added to GRIDGO with this
 * screen, so a 404 means either the route is not deployed or the rider has no
 * profile row behind it yet. Neither is the rider's doing and neither is
 * fixed by trying harder, so it is stated plainly rather than shown as a red
 * failure.
 *
 * **Stale.** Every change carries the version it was read at, so GRIDGO
 * refuses a write built on details that have since moved. Treating that
 * refusal as an ordinary failure would invite a retry that puts the old
 * plate back.
 */

export type RiderDetailField = "name" | "phone" | "vehicleType" | "plateNumber" | "licenseNumber";

export type RiderProfileOutcome<T> =
  | { status: "ok"; value: T }
  | { status: "not_open_yet" }
  | { status: "stale" }
  | { status: "failed"; message: string; field?: RiderDetailField };

export const RIDER_DETAILS_NOT_OPEN_YET =
  "GRIDGO has not opened your details on this app yet. Nothing here is lost — check again shortly, and ask Operations to correct anything that cannot wait.";

export const RIDER_DETAILS_STALE =
  "Your details changed somewhere else while this screen was open. Load the latest so nothing you cannot see is overwritten, then make your change again.";

function isRouteAbsent(error: unknown): boolean {
  return error instanceof api.ApiError && (error.status === 404 || error.status === 405);
}

export type RiderDetailDraft = {
  name: string;
  phone: string;
  vehicleType: string | null;
  plateNumber: string;
  licenseNumber: string;
};

export function draftFromProfile(
  profile: api.RiderSelfProfile,
  clerkName?: string,
): RiderDetailDraft {
  return {
    name: clerkName || profile.name || "",
    phone: profile.phone ?? "",
    vehicleType: profile.vehicleType || null,
    plateNumber: profile.plateNumber,
    licenseNumber: profile.licenseNumber ?? "",
  };
}

export function riderDetailPatch(
  profile: api.RiderSelfProfile,
  draft: RiderDetailDraft,
): api.RiderSelfProfilePatch {
  const patch: api.RiderSelfProfilePatch = {};
  const name = draft.name.trim();
  const phone = draft.phone.trim();
  const plateNumber = draft.plateNumber.trim();
  const licenseNumber = draft.licenseNumber.trim();

  if (name !== (profile.name ?? "")) patch.name = name;
  if (phone !== (profile.phone ?? "")) patch.phone = phone;
  if (draft.vehicleType && draft.vehicleType !== profile.vehicleType) {
    patch.vehicleType = draft.vehicleType;
  }
  if (plateNumber !== profile.plateNumber) patch.plateNumber = plateNumber;
  if (licenseNumber !== (profile.licenseNumber ?? "")) patch.licenseNumber = licenseNumber;
  return patch;
}

export function hasRiderDetailChanges(
  profile: api.RiderSelfProfile,
  draft: RiderDetailDraft,
): boolean {
  return Object.keys(riderDetailPatch(profile, draft)).length > 0;
}

export type RiderDetailProblems = Partial<Record<RiderDetailField, string>>;

function isPhoneish(value: string): boolean {
  const compact = value.replaceAll(/[\s()-]/g, "");
  return /^0?9\d{9}$/.test(compact) || /^\+?639\d{9}$/.test(compact);
}

export function riderDetailProblems(draft: RiderDetailDraft): RiderDetailProblems {
  const problems: RiderDetailProblems = {};
  if (!draft.name.trim()) {
    problems.name = "Enter the name this account belongs to.";
  }
  if (!isPhoneish(draft.phone)) {
    problems.phone = "Enter a mobile number GRIDGO and Operations can reach you on.";
  }
  if (!draft.vehicleType) {
    problems.vehicleType = "Choose the vehicle you will ride.";
  }
  if (!draft.plateNumber.trim()) {
    problems.plateNumber = "Enter the plate number on that vehicle.";
  }
  if (!draft.licenseNumber.trim()) {
    problems.licenseNumber = "Enter your driving licence number.";
  }
  return problems;
}

const REFUSED: Record<RiderDetailField, string> = {
  name: "GRIDGO would not accept that name. Use the name this account belongs to.",
  phone: "GRIDGO would not accept that mobile number. Enter one GRIDGO and Operations can reach you on.",
  vehicleType: "GRIDGO would not accept that vehicle. Choose motorcycle, bicycle or car.",
  plateNumber: "GRIDGO would not accept that plate number. Enter the plate on the vehicle you ride.",
  licenseNumber: "GRIDGO would not accept that licence number. Enter the number on your driving licence.",
};

function refusedField(error: unknown): RiderDetailField | null {
  if (!(error instanceof api.ApiError)) return null;
  const body = error.body;
  if (typeof body !== "object" || !body) return null;
  const record = body as Record<string, unknown>;
  if (record.error !== "invalid_rider_profile") return null;
  const field = record.field;
  return field === "name"
    || field === "phone"
    || field === "vehicleType"
    || field === "plateNumber"
    || field === "licenseNumber"
    ? field
    : null;
}

export async function loadRiderDetails(): Promise<RiderProfileOutcome<api.RiderSelfProfile>> {
  try {
    return { status: "ok", value: await api.getRiderProfile() };
  } catch (error) {
    if (isRouteAbsent(error)) return { status: "not_open_yet" };
    return {
      status: "failed",
      message: apiErrorMessage(error, "Could not load your details. Check this phone's connection and try again."),
    };
  }
}

export async function saveRiderDetails(
  version: number,
  patch: api.RiderSelfProfilePatch,
): Promise<RiderProfileOutcome<api.RiderSelfProfile>> {
  try {
    return { status: "ok", value: await api.updateRiderProfile(version, patch) };
  } catch (error) {
    if (isRouteAbsent(error)) return { status: "not_open_yet" };
    if (error instanceof api.ApiError && error.status === 409) return { status: "stale" };

    const field = refusedField(error);
    if (field) return { status: "failed", message: REFUSED[field], field };

    return {
      status: "failed",
      message: apiErrorMessage(error, "Could not save your details. Check this phone's connection and try again."),
    };
  }
}
