/**
 * Arrival at the next stop — shop, client door, or GRIDGO Office.
 *
 * GPS is a circle, not a point. A 500 m accuracy reading that happens to
 * contain the pin is not arrival, and a last-known fix from minutes ago is
 * not where the rider is now. This file only answers "are they inside the
 * radius, with a live accurate fix?" The hook owns showing that once.
 */
import type { NextStop, NextStopKind } from "@/lib/tripNav";
import { haversineMetres, isValidLatLng, type LatLng } from "@/lib/geo";
import type { FreshnessLevel } from "@/lib/locationFreshness";

/** How close the rider must be before GRIDGO says they have arrived. */
export const ARRIVAL_RADIUS_METRES = 80;

/**
 * A fix whose reported accuracy is larger than the radius cannot place the
 * rider inside it. Unknown accuracy is treated the same way: do not guess.
 */
export const ARRIVAL_MAX_ACCURACY_METRES = 80;

export type ArrivalSkipReason =
  | "no-trip"
  | "no-stop"
  | "no-point"
  | "no-fix"
  | "stale"
  | "inaccurate"
  | "too-far";

export type ArrivalCopy = {
  question: string;
  consequence: string;
  confirmLabel: string;
  cancelLabel: string;
};

export type ArrivalVerdict =
  | {
      inside: true;
      key: string;
      kind: NextStopKind;
      distanceMetres: number;
    }
  | {
      inside: false;
      reason: ArrivalSkipReason;
      key: string | null;
      distanceMetres: number | null;
    };

const notifiedKeys = new Set<string>();
const sheetedKeys = new Set<string>();

export function arrivalKey(orderId: string, kind: NextStopKind): string {
  return `${orderId}:${kind}`;
}

/** Test seam — production never needs to forget an arrival in the same session. */
export function resetArrivalMemory(): void {
  notifiedKeys.clear();
  sheetedKeys.clear();
}

export function claimArrivalNotice(key: string): boolean {
  if (notifiedKeys.has(key)) return false;
  notifiedKeys.add(key);
  return true;
}

export function claimArrivalSheet(key: string): boolean {
  if (sheetedKeys.has(key)) return false;
  sheetedKeys.add(key);
  return true;
}

export function hasArrivalSheet(key: string): boolean {
  return sheetedKeys.has(key);
}

/**
 * Whether this GPS sample is inside the current stop's radius.
 *
 * Pure: it does not remember previous samples. The claim helpers above are
 * what stop the same shop from buzzing twice.
 */
export function shouldAnnounceArrival(input: {
  orderId: string | null | undefined;
  stop: NextStop | null | undefined;
  rider: LatLng | null | undefined;
  accuracyMetres: number | null | undefined;
  freshness: FreshnessLevel;
}): ArrivalVerdict {
  const orderId = input.orderId?.trim() || null;
  const stop = input.stop ?? null;

  if (!orderId) {
    return { inside: false, reason: "no-trip", key: null, distanceMetres: null };
  }
  if (!stop) {
    return { inside: false, reason: "no-stop", key: null, distanceMetres: null };
  }

  const key = arrivalKey(orderId, stop.kind);

  if (!isValidLatLng(stop.point)) {
    return { inside: false, reason: "no-point", key, distanceMetres: null };
  }
  if (!isValidLatLng(input.rider)) {
    return { inside: false, reason: "no-fix", key, distanceMetres: null };
  }
  if (input.freshness !== "live") {
    return { inside: false, reason: "stale", key, distanceMetres: null };
  }

  const accuracy = input.accuracyMetres;
  if (
    accuracy == null ||
    !Number.isFinite(accuracy) ||
    accuracy <= 0 ||
    accuracy > ARRIVAL_MAX_ACCURACY_METRES
  ) {
    const distanceMetres = haversineMetres(input.rider, stop.point);
    return { inside: false, reason: "inaccurate", key, distanceMetres };
  }

  const distanceMetres = haversineMetres(input.rider, stop.point);
  if (distanceMetres > ARRIVAL_RADIUS_METRES) {
    return { inside: false, reason: "too-far", key, distanceMetres };
  }

  return { inside: true, key, kind: stop.kind, distanceMetres };
}

export function arrivalCopy(stop: NextStop): ArrivalCopy {
  if (stop.kind === "shop") {
    return {
      question: "You've arrived at the shop",
      consequence: `${stop.label}. Check the finished job at the counter before you carry it.`,
      confirmLabel: "Got it",
      cancelLabel: "Close",
    };
  }
  if (stop.kind === "office") {
    return {
      question: "You've arrived at GRIDGO Office",
      consequence: `${stop.label}. Leave the finished job at the GRIDGO counter.`,
      confirmLabel: "Got it",
      cancelLabel: "Close",
    };
  }
  return {
    question: "You've arrived at the client",
    consequence: `${stop.label}. Hand the package to the client.`,
    confirmLabel: "Got it",
    cancelLabel: "Close",
  };
}
