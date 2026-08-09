/**
 * How much to trust the position on screen.
 *
 * A GPS fix has a shelf life. Showing a five-minute-old dot as "you are here"
 * is the same lie as inventing a position, so every reading carries its age
 * and the rider is told when it has gone stale.
 */

export type FreshnessLevel = "live" | "stale" | "waiting" | "off";

export type LocationFreshness = {
  level: FreshnessLevel;
  /** Says the state, not the mechanism. */
  label: string;
  /** One line of consequence, or null when the label says everything. */
  detail: string | null;
  tone: "success" | "warning" | "neutral";
  icon: "circle-check" | "triangle-alert" | "clock" | "circle-x";
};

/** A fix older than this is no longer a description of where the rider is. */
export const STALE_FIX_MS = 45_000;

export type FreshnessInput = {
  /** Epoch ms of the last fix, or null when there has never been one. */
  fixAtMs: number | null;
  nowMs: number;
  permission: "unknown" | "granted" | "denied";
  /** Reported accuracy radius in metres, when the platform gives one. */
  accuracyMetres?: number | null;
};

/** Whole seconds, minutes, or hours since a fix — never a bare timestamp. */
export function formatAge(ageMs: number): string {
  const seconds = Math.max(0, Math.floor(ageMs / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

/**
 * Classify the current fix. Pure so the stale threshold is testable without
 * waiting 45 seconds for a real one to age.
 */
export function classifyLocation({
  fixAtMs,
  nowMs,
  permission,
  accuracyMetres = null,
}: FreshnessInput): LocationFreshness {
  if (permission === "denied") {
    return {
      level: "off",
      label: "Location is off",
      detail:
        "The client cannot see you moving. Turn location on for GRIDGO in your phone settings.",
      tone: "warning",
      icon: "circle-x",
    };
  }

  if (fixAtMs == null) {
    return {
      level: "waiting",
      label: "Finding your position",
      detail: "The map has no fix yet. Trip actions still work.",
      tone: "neutral",
      icon: "clock",
    };
  }

  const age = Math.max(0, nowMs - fixAtMs);
  if (age >= STALE_FIX_MS) {
    return {
      level: "stale",
      label: `Position is stale — last fix ${formatAge(age)}`,
      detail: "You may have moved since. Step into the open to get a new fix.",
      tone: "warning",
      icon: "triangle-alert",
    };
  }

  const accuracy =
    accuracyMetres != null && Number.isFinite(accuracyMetres) && accuracyMetres > 0
      ? ` · within ${Math.round(accuracyMetres)} m`
      : "";

  return {
    level: "live",
    label: `Position is live — updated ${formatAge(age)}${accuracy}`,
    detail: null,
    tone: "success",
    icon: "circle-check",
  };
}
