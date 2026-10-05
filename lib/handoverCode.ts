import { apiErrorCode, type Order } from "@/lib/api";
import { endsAtOffice } from "@/lib/riderOrder";

/**
 * The handover code at the client's door (gridgo-api#125).
 *
 * When a delivery becomes ready the server mints one six-digit code and shows
 * the same digits to the client and to the assigned rider. At the door the
 * rider asks the client to show theirs and hands the package over only if the
 * two match. The rider is the one comparing, so the rider's answer is what
 * gates the confirm button; the server then checks the code the app sends
 * with the evidence.
 *
 * A mismatch is a stop, not a warning: the package stays with the rider and
 * Operations is told. Escalating records the report — it never unlocks the
 * delivery. A rider who misread the client's screen can check again.
 *
 * Jobs that end at GRIDGO Office carry no code for the rider: the client's
 * code is checked by hub staff when they collect.
 */

/** What the server said about this job's code. */
export type HandoverCodeLoad =
  | { status: "loading" }
  /** No code on this job: the rider delivers as before. */
  | { status: "none" }
  | { status: "ready"; otp: string }
  | { status: "error"; message: string };

/** The rider's own comparison against the client's screen. */
export type CodeMatch = "unchecked" | "match" | "mismatch";

/** The sentence Operations reads on the escalation. */
export const HANDOVER_ESCALATION_REASON =
  "Rider at the drop-off: the client's handover code does not match the rider's code. Package kept by the rider.";

/** Whether this job could have a code for the rider at all. */
export function riderChecksHandoverCode(order: Pick<Order, "fulfillmentMode">): boolean {
  return !endsAtOffice(order);
}

/** "482913" → ["482", "913"]: two groups of three are read aloud and compared faster. */
export function handoverCodeGroups(otp: string): [string, string] {
  return [otp.slice(0, 3), otp.slice(3)];
}

/** What a screen reader says: one digit at a time, so "482" is never "four hundred". */
export function spokenHandoverCode(otp: string): string {
  return otp.split("").join(" ");
}

/**
 * Why the delivery cannot be confirmed yet because of the code, or null when
 * the code is no obstacle.
 */
export function handoverBlockReason(
  load: HandoverCodeLoad,
  match: CodeMatch,
  escalated: boolean,
): string | null {
  switch (load.status) {
    case "none":
      return null;
    case "loading":
      return "Loading the handover code.";
    case "error":
      return "The handover code did not load. Try again before you hand the package over.";
    case "ready":
      if (match === "match") return null;
      if (match === "mismatch") {
        return escalated
          ? "Operations has been alerted. Keep the package until they tell you what to do."
          : "The codes do not match. Keep the package and escalate to Operations.";
      }
      return "Ask the client for their handover code and check it against yours.";
  }
}

/**
 * The server's own refusal of the code, from the delivery request. Either one
 * means the screen goes to the mismatch state; anything else is an ordinary
 * failure to record.
 */
export function isHandoverRefusal(error: unknown): boolean {
  const code = apiErrorCode(error);
  return code === "handover_otp_mismatch" || code === "handover_attempts_exceeded";
}
