/**
 * Group orders on the rider's side (issue report F54BDF7A, gridgoph/gridgo-api#414;
 * gridgo-api `docs/GROUP_EXPRESS_API.md` → *Rider calls and handover*).
 *
 * A group order is one ordinary job that one person receives: the host. The
 * rider reads `order.groupOrder = {id, memberCount, hostName}` on offers and
 * order reads, calls and messages the host only (today's delivery call and
 * chat already reach nobody else), may share their own arrival estimate with
 * the group, and sees a backup receiver only once the server unlocks it.
 *
 * Nothing here counts missed calls or minutes. The backup is the server's
 * answer to `GET /dispatch/:orderId/group-backup` and nothing else.
 *
 * An order without `groupOrder` is an ordinary job, and every helper here
 * answers null / false for it, so ordinary trips render exactly as before.
 */

/** `hostName` is null when the server sent none; copy then says "the host". */
export type GroupOrder = { id: string; memberCount: number; hostName: string | null };

/** What the server says about the backup receiver right now. */
export type GroupBackup =
  | { unlocked: false }
  | { unlocked: true; receiver: { name: string; phone: string } };

/** The group this job belongs to, or null for an ordinary job or a malformed field. */
export function groupOrderOf(order: { groupOrder?: unknown } | null | undefined): GroupOrder | null {
  const raw = order?.groupOrder;
  if (!raw || typeof raw !== "object") return null;
  const { id, memberCount, hostName } = raw as Record<string, unknown>;
  if (typeof id !== "string" || !id) return null;
  const count = typeof memberCount === "number" && Number.isInteger(memberCount) && memberCount > 0 ? memberCount : null;
  const host = typeof hostName === "string" && hostName.trim() ? hostName.trim() : null;
  if (count === null) return null;
  return { id, memberCount: count, hostName: host };
}

/** "Group order, 5 people". */
export function groupTagTitle(group: GroupOrder): string {
  return `Group order, ${group.memberCount} ${group.memberCount === 1 ? "person" : "people"}`;
}

/** "Host: Ana" — the one person the rider hands everything to. */
export function groupHostLabel(group: GroupOrder): string {
  return group.hostName ? `Host: ${group.hostName}` : "Hand everything to the host";
}

/** One short line for the map's trip panel: "Group order, 5 people, host Ana". */
export function groupTagLine(group: GroupOrder): string {
  return group.hostName ? `${groupTagTitle(group)}, host ${group.hostName}` : `${groupTagTitle(group)}, one host`;
}

/** The whole tag in one sentence, for a screen reader. */
export function groupTagSpoken(group: GroupOrder): string {
  const host = group.hostName ? `${group.hostName}, the host` : "the host";
  return `${groupTagTitle(group)}. Hand everything to ${host}. Call and message only the host.`;
}

/**
 * The receiving person's word: "host" on a group order, "client" otherwise.
 * Used wherever the rider is told who to call, message or hand over to.
 */
export function receiverWord(order: { groupOrder?: unknown } | null | undefined): "host" | "client" {
  return groupOrderOf(order) ? "host" : "client";
}

/** States in which the rider carries the job to the host (the server's own gate). */
const ON_THE_WAY = ["picked_up", "out_for_delivery"];

/**
 * Whether the rider may share an arrival estimate now. The server refuses any
 * other state with `409 group_delivery_not_active`; this only keeps the
 * choices off screen when they could not be sent.
 */
export function canShareArrivalEstimate(order: { state: string; groupOrder?: unknown } | null | undefined): boolean {
  return Boolean(order && groupOrderOf(order) && ON_THE_WAY.includes(order.state));
}

/**
 * Whether to ask the server about the backup receiver. Door deliveries only:
 * the backup is a delivery feature, and it can unlock only while the rider is
 * carrying the job to the host.
 */
export function backupApplies(
  order: { state: string; groupOrder?: unknown; fulfillmentMode?: string | null } | null | undefined,
): boolean {
  return Boolean(order && groupOrderOf(order) && order.fulfillmentMode !== "pickup" && ON_THE_WAY.includes(order.state));
}

/** The server's backup descriptor, read strictly: anything unexpected is locked. */
export function parseGroupBackup(raw: unknown): GroupBackup {
  const backup = raw && typeof raw === "object" ? (raw as { backup?: unknown }).backup : null;
  if (!backup || typeof backup !== "object") return { unlocked: false };
  const { unlocked, receiver } = backup as { unlocked?: unknown; receiver?: unknown };
  if (unlocked !== true || !receiver || typeof receiver !== "object") return { unlocked: false };
  const { name, phone } = receiver as Record<string, unknown>;
  if (typeof name !== "string" || typeof phone !== "string" || !phone.trim()) return { unlocked: false };
  return { unlocked: true, receiver: { name: name.trim() || "Backup receiver", phone: phone.trim() } };
}

/**
 * What the locked row tells the rider. The rule is the one the API documents
 * (`docs/GROUP_EXPRESS_API.md`); the locked descriptor carries no fields for
 * it, so this restates it in words. The app never applies it — only the
 * server's `unlocked: true` opens the row.
 */
export function backupLockedNote(group: GroupOrder): string {
  const host = group.hostName ?? "the host";
  return `Opens if ${host} misses two of your calls, or five minutes after you tell GRIDGO you have arrived. Until then, call and message only the host.`;
}

/** The few choices for "when will you get there", in minutes. All inside the API's 1–180. */
export const ARRIVAL_ESTIMATE_CHOICES = [5, 10, 15, 20, 30] as const;

/** "about 3:42 PM", in the phone's clock. */
export function arrivalClockLabel(iso: string): string | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** The refusals the two group routes can answer, in the rider's words. */
export function groupRefusalMessage(code: string | null, fallback: string): string {
  switch (code) {
    case "group_delivery_not_active":
      return "You can share an arrival time once you have picked the job up.";
    case "invalid_arrival_estimate":
      return "Choose one of the times shown.";
    case "forbidden":
      return "This job is no longer assigned to you.";
    case "order_not_found":
      return "This job is gone. Go back to the map to see where things stand.";
    default:
      return fallback;
  }
}
