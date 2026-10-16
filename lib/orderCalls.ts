/*
  Voice calls on a job (16B159C0, gridgoph/gridgo-client#233; gridgo-api
  `docs/CALLS_API.md` is the contract and wins over anything here).

  Calls run inside GRIDGO over mobile data or Wi-Fi. Nobody dials a number and
  nobody sees one: the API names the other person by role and first name only.
  A rider has two people to call on one job, and they are different calls on
  different windows:

  - `delivery` — the client, while the rider has a door delivery. The same
    window the client conversation is writable in (`deliveryChat.status ===
    "open"`).
  - `pickup` — the shop, from accepting the pick-up until the package leaves
    the counter (`rider_assigned`). The shop conversation stays open longer;
    the call does not.

  The order carries no call window of its own, so this module reads the chat
  windows the API already projects and adds the one state the contract names.
  The server still decides: a call it refuses arrives as `call_not_available`
  and is worded below.

  Nothing in this file touches WebRTC, so every rule here is unit-tested.
*/

import type { TripChatParty } from "@/lib/tripChat";

export type CallPair = "delivery" | "pickup";
export type CallState = "ringing" | "accepted" | "declined" | "cancelled" | "missed" | "ended";
export type CallRole = "client" | "rider" | "supplier";

export type CallPerson = { firstName: string; role: CallRole };

export type OrderCall = {
  id: string;
  orderId: string;
  pair: CallPair;
  state: CallState;
  caller: CallPerson;
  callee: CallPerson;
  /** True when this phone placed the call. */
  mine: boolean;
  createdAt: string;
  ringExpiresAt: string;
  acceptedAt: string | null;
  endedAt: string | null;
  leaseExpiresAt: string | null;
};

const STATES: readonly CallState[] = ["ringing", "accepted", "declined", "cancelled", "missed", "ended"];
const ROLES: readonly CallRole[] = ["client", "rider", "supplier"];

export const LIVE_CALL_STATES: readonly CallState[] = ["ringing", "accepted"];

/** How often a live call asks for state and signals, even with the stream open. */
export const CALL_POLL_MS = 2_000;
/** How often an answered call renews its lease. */
export const CALL_HEARTBEAT_MS = 20_000;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function person(value: unknown): CallPerson | null {
  if (!value || typeof value !== "object") return null;
  const { firstName, role } = value as Record<string, unknown>;
  if (!ROLES.includes(role as CallRole)) return null;
  return { firstName: text(firstName) ?? roleWord(role as CallRole), role: role as CallRole };
}

/** One call off the wire, or null when it is not one. Unknown fields are dropped. */
export function parseOrderCall(raw: unknown): OrderCall | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const id = text(value.id);
  const orderId = text(value.orderId);
  const caller = person(value.caller);
  const callee = person(value.callee);
  const ringExpiresAt = text(value.ringExpiresAt);
  const createdAt = text(value.createdAt);
  if (!id || !orderId || !caller || !callee || !ringExpiresAt || !createdAt) return null;
  if (value.pair !== "delivery" && value.pair !== "pickup") return null;
  if (!STATES.includes(value.state as CallState)) return null;
  return {
    id,
    orderId,
    pair: value.pair,
    state: value.state as CallState,
    caller,
    callee,
    mine: value.mine === true,
    createdAt,
    ringExpiresAt,
    acceptedAt: text(value.acceptedAt),
    endedAt: text(value.endedAt),
    leaseExpiresAt: text(value.leaseExpiresAt),
  };
}

export function parseOrderCalls(raw: unknown): OrderCall[] {
  const list = raw && typeof raw === "object" ? (raw as { calls?: unknown }).calls : null;
  return Array.isArray(list) ? list.map(parseOrderCall).filter((call): call is OrderCall => call !== null) : [];
}

export function isLiveCall(call: Pick<OrderCall, "state">): boolean {
  return LIVE_CALL_STATES.includes(call.state);
}

export function pairOfParty(party: TripChatParty): CallPair {
  return party === "shop" ? "pickup" : "delivery";
}

export function partyOfPair(pair: CallPair): TripChatParty {
  return pair === "pickup" ? "shop" : "client";
}

/** "Client", "Shop", "Rider" — the role in the words this app uses for it. */
export function roleWord(role: CallRole): string {
  return role === "supplier" ? "Shop" : role === "rider" ? "Rider" : "Client";
}

/** The person on the other end of the call. */
export function counterpartOf(call: Pick<OrderCall, "mine" | "caller" | "callee">): CallPerson {
  return call.mine ? call.callee : call.caller;
}

/** "Sam, the client" — role and first name together, for screen readers and notices. */
export function counterpartPhrase(person: CallPerson): string {
  const role = roleWord(person.role).toLowerCase();
  // A name that fell back to the role word ("Shop") would read "Shop, the shop".
  return person.firstName.toLowerCase() === role ? `the ${role}` : `${person.firstName}, the ${role}`;
}

/** The incoming call that should ring now: still ringing, not ours, not past its deadline. */
export function ringingIncoming(calls: readonly OrderCall[], nowMs: number): OrderCall | null {
  return (
    calls.find(
      (call) => call.state === "ringing" && !call.mine && Date.parse(call.ringExpiresAt) > nowMs,
    ) ?? null
  );
}

// ---------------------------------------------------------------------------
// Whether the trip offers a call to each party.

export type CallWindow =
  | { open: true }
  /** `note` explains a closed window the rider might expect; null hides the button silently. */
  | { open: false; note: string | null };

type CallableOrder = {
  state: string;
  deliveryChat?: unknown;
  pickupChat?: unknown;
};

function chatStatus(raw: unknown): string | null {
  return raw && typeof raw === "object" ? String((raw as { status?: unknown }).status ?? "") || null : null;
}

/**
 * The call window for one party on this job.
 *
 * Client: exactly the writable client conversation. A job carried to GRIDGO
 * Office has no client conversation, so it has no client call either.
 *
 * Shop: the shop conversation must be open *and* the package still at the
 * counter. After pick-up the conversation stays and the call goes, which is
 * worth one plain line rather than a button that vanishes without a word.
 */
export function callWindow(order: CallableOrder | null | undefined, party: TripChatParty): CallWindow {
  if (!order) return { open: false, note: null };
  if (party === "client") {
    return chatStatus(order.deliveryChat) === "open" ? { open: true } : { open: false, note: null };
  }
  const chat = chatStatus(order.pickupChat);
  if (chat === "open" && order.state === "rider_assigned") return { open: true };
  if (chat === "open") {
    return { open: false, note: "Calls with the shop end at pick-up. You can still message them." };
  }
  return { open: false, note: null };
}

// ---------------------------------------------------------------------------
// What the call screen says.

export type CallDirection = "outgoing" | "incoming";

/**
 * Where a call is, as the rider reads it. `calling` is before the other phone
 * has been reached; `connecting` is after the answer while the audio path is
 * being found; `reconnecting` is a connected call whose path dropped.
 */
export type CallPhase =
  | "permission"
  | "calling"
  | "ringing"
  | "incoming"
  | "answering"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "ended";

export type CallEndReason =
  | "declined"
  | "declined_by_you"
  | "no_answer"
  | "missed"
  | "cancelled"
  | "ended"
  | "network_lost"
  | "not_available"
  | "busy"
  | "too_many"
  | "mic_blocked"
  | "unsupported"
  | "failed";

export function phaseLabel(phase: CallPhase): string {
  switch (phase) {
    case "permission":
      return "Microphone needed";
    case "calling":
      return "Calling…";
    case "ringing":
      return "Ringing…";
    case "incoming":
      return "Incoming call";
    case "answering":
    case "connecting":
      return "Connecting…";
    case "connected":
      return "On call";
    case "reconnecting":
      return "Reconnecting…";
    case "ended":
      return "Call ended";
  }
}

/** The headline and the line under it once a call is over. */
export function endReasonCopy(reason: CallEndReason, person: CallPerson | null): { title: string; body: string } {
  const who = person ? counterpartPhrase(person) : "the other person";
  const name = person && person.firstName.toLowerCase() !== roleWord(person.role).toLowerCase() ? person.firstName : null;
  switch (reason) {
    case "declined":
      return {
        title: "Call declined",
        body: `${name ?? "They"} could not take the call. Send a message, or try again in a moment.`,
      };
    case "declined_by_you":
      return { title: "You declined the call", body: `Call ${who} back from the trip when you are ready.` };
    case "no_answer":
      return {
        title: "No answer",
        body: `${name ?? "They"} did not pick up. They will see a missed call. Send a message, or try again.`,
      };
    case "missed":
      return { title: "Missed call", body: `You missed a call from ${who}. Call back while the job is open.` };
    case "cancelled":
      return { title: "Call cancelled", body: "Nothing was connected." };
    case "ended":
      return { title: "Call ended", body: `Your call with ${who} has ended.` };
    case "network_lost":
      return {
        title: "Call dropped",
        body: "The connection was lost. Check your mobile data or Wi-Fi, then call again.",
      };
    case "not_available":
      return {
        title: "Calling is closed for this job",
        body: "Calls only run while the job is yours: the shop until pick-up, the client during a door delivery. You can still send a message.",
      };
    case "busy":
      return {
        title: "Already on a call",
        body: "There is already a call on this job. Wait for it to finish, then try again.",
      };
    case "too_many":
      return {
        title: "Too many calls",
        body: "You have started many calls in the last few minutes. Wait a little, or send a message instead.",
      };
    case "mic_blocked":
      return {
        title: "Microphone is off for GRIDGO",
        body: "Calls need the microphone. Allow it in your phone's settings, then call again.",
      };
    case "unsupported":
      return {
        title: "Calls need the latest GRIDGO app",
        body: "This version cannot make calls. Install the latest GRIDGO app from the download page. Messages still work here.",
      };
    case "failed":
      return {
        title: "The call did not connect",
        body: "Check your mobile data or Wi-Fi, then try again. You can also send a message.",
      };
  }
}

/** How a call that finished on the server reads from this phone. */
export function endReasonOf(call: Pick<OrderCall, "state" | "mine" | "acceptedAt">): CallEndReason {
  switch (call.state) {
    case "declined":
      return call.mine ? "declined" : "declined_by_you";
    case "missed":
      return call.mine ? "no_answer" : "missed";
    case "cancelled":
      return call.mine ? "cancelled" : "missed";
    default:
      return "ended";
  }
}

/** The API's refusal as an end reason, or null for a failure a retry may fix. */
export function endReasonOfError(code: string | null): CallEndReason | null {
  switch (code) {
    case "call_not_available":
    case "call_not_active":
    case "call_history_closed":
    case "forbidden":
    case "order_not_found":
    case "call_not_found":
      return "not_available";
    case "call_already_active":
      return "busy";
    case "too_many_requests":
      return "too_many";
    default:
      return null;
  }
}

/** "0:07", "12:40", "1:02:09". */
export function callDurationLabel(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

// ---------------------------------------------------------------------------
// The missed call on the trip.

export type MissedCall = { call: OrderCall; person: CallPerson; declined: boolean };

/**
 * The newest call to this rider that went unanswered, worth a "call back" on
 * the trip: nothing newer on the same pair (a call back, or another try from
 * them, makes it old news), and not dismissed.
 */
export function latestMissedCall(calls: readonly OrderCall[], dismissed: readonly string[] = []): MissedCall | null {
  const newest = new Map<CallPair, OrderCall>();
  for (const call of calls) {
    const seen = newest.get(call.pair);
    if (!seen || Date.parse(call.createdAt) > Date.parse(seen.createdAt)) newest.set(call.pair, call);
  }
  const missed = [...newest.values()]
    .filter((call) => !call.mine && ["missed", "cancelled", "declined"].includes(call.state))
    .filter((call) => !dismissed.includes(call.id))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const call = missed[0];
  return call ? { call, person: call.caller, declined: call.state === "declined" } : null;
}

/** "3:40 PM", in Davao time. */
export function callTimeLabel(at: string): string {
  return new Date(at).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
}
