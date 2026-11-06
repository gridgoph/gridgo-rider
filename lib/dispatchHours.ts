import { apiErrorCode, type ApiError, type OperatingStatus } from "@/lib/api";

/**
 * What a rider reads while dispatch is outside operating hours.
 *
 * The API hides new jobs from every rider while GRIDGO is closed, so without
 * this an empty Offers list reads as "no jobs" and a ready order looks lost.
 */
export const DISPATCH_CLOSED_TITLE = "Dispatch is closed";

// The API's schedule is fixed to Asia/Manila, which has one offset all year, so
// plain arithmetic reads its clock the same on a phone set to any time zone.
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const manilaDay = (ms: number) => Math.floor((ms + MANILA_OFFSET_MS) / DAY_MS);

/**
 * "Opens 8:00 AM tomorrow". A closure can run for weeks, and a weekday name only
 * means the coming one, so anything a week or more away carries its date.
 */
export function dispatchOpensLine(opensAt: string | null, nowMs: number): string {
  const opensMs = opensAt ? Date.parse(opensAt) : Number.NaN;
  if (Number.isNaN(opensMs)) return "Check back during operating hours";

  const clock = new Date(opensMs + MANILA_OFFSET_MS);
  const hour = clock.getUTCHours();
  const minute = String(clock.getUTCMinutes()).padStart(2, "0");
  const time = `${hour % 12 || 12}:${minute} ${hour < 12 ? "AM" : "PM"}`;

  const weekday = WEEKDAYS[clock.getUTCDay()];
  const days = manilaDay(opensMs) - manilaDay(nowMs);
  if (days === 0) return `Opens ${time} today`;
  if (days === 1) return `Opens ${time} tomorrow`;
  if (days > 1 && days < 7) return `Opens ${time} ${weekday}`;
  return `Opens ${time} ${weekday}, ${MONTHS[clock.getUTCMonth()]} ${clock.getUTCDate()}`;
}

/** The notice as one sentence, for the line on an offer card. */
export function dispatchClosedSentence(opensAt: string | null, nowMs = Date.now()): string {
  return `${DISPATCH_CLOSED_TITLE}. ${dispatchOpensLine(opensAt, nowMs)}.`;
}

/** The hours inside an accept the API refused for being closed; null for any other failure. */
export function closedFromRefusal(error: unknown): OperatingStatus | null {
  if (apiErrorCode(error) !== "outside_operating_hours") return null;
  const opensAt = ((error as ApiError).body as { scheduledReviewAt?: unknown }).scheduledReviewAt;
  return { isOpenNow: false, scheduledReviewAt: typeof opensAt === "string" ? opensAt : null };
}
