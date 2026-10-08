import { ApiError, apiErrorCode, type Order } from "@/lib/api";
import { endsAtOffice } from "@/lib/riderOrder";

/** The rider reads only the requirement; the client reads the secret aloud. */
export type HandoverCodeLoad =
  | { status: "loading" }
  | { status: "none" }
  | { status: "ready" }
  | { status: "error"; message: string };

export type HandoverRefusal = {
  kind: "mismatch" | "locked";
  message: string;
  retryAtMs: number | null;
};

export const HANDOVER_ESCALATION_REASON =
  "Rider at the drop-off: unable to verify the client's spoken handover code. Package kept by the rider.";

export function riderChecksHandoverCode(order: Pick<Order, "fulfillmentMode">): boolean {
  return !endsAtOffice(order);
}

export function handoverBlockReason(load: HandoverCodeLoad, otp: string): string | null {
  switch (load.status) {
    case "none":
      return null;
    case "loading":
      return "Checking whether a handover code is required.";
    case "error":
      return "The handover requirement did not load. Try again before you hand the package over.";
    case "ready":
      return /^\d{6}$/.test(otp) ? null : "Enter the six-digit code the client reads aloud.";
  }
}

/** Refusals never confirm delivery. Do not invent a remaining attempt count. */
export function handoverRefusal(error: unknown): HandoverRefusal | null {
  const code = apiErrorCode(error);
  if (!(error instanceof ApiError) || !error.body || typeof error.body !== "object") return null;
  if (code === "handover_otp_mismatch") {
    const remaining = "remainingAttempts" in error.body ? error.body.remainingAttempts : null;
    const tries = typeof remaining === "number" && Number.isInteger(remaining) && remaining >= 0
      ? ` ${remaining} ${remaining === 1 ? "try" : "tries"} remaining.`
      : "";
    return { kind: "mismatch", message: `That code does not match.${tries}`, retryAtMs: null };
  }
  if (code === "handover_attempts_exceeded") {
    const retryAfter = "retryAfter" in error.body ? error.body.retryAfter : null;
    const parsed = typeof retryAfter === "string" ? Date.parse(retryAfter) : NaN;
    const retryAtMs = Number.isFinite(parsed) ? parsed : null;
    const when = retryAtMs === null
      ? "Try again after the lockout ends, or contact Operations."
      : `Try again at ${new Date(retryAtMs).toLocaleString("en-PH", {
          month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit",
        })}.`;
    return { kind: "locked", message: `Too many attempts. ${when}`, retryAtMs };
  }
  return null;
}
