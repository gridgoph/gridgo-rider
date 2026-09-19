import type { Order } from "@/lib/api";
import type { EvidenceUpload } from "@/lib/proofEvidence";
import { PICKUP_CHECKS, allPassed, type ChecklistAnswers } from "@/lib/pickupChecklist";
import type { SignatureStroke } from "@/lib/signature";

/**
 * The supplier's signature on the rider's phone.
 *
 * Six passes at the counter move nothing on their own. The supplier signs on
 * the rider's phone to say the handoff happened — the quality check, then
 * the signature, and only then custody. Everything here is pure so the gate
 * on "Done" can be tested without a pad, a server, or a counter.
 */

/** Shortest name the app will send for a signer. The API enforces the same. */
export const MIN_SIGNER_NAME = 2;
export const MAX_SIGNER_NAME = 120;

/** What the rider's phone keeps of the signature between launches. */
export type SignatureDraft = {
  /** Completed strokes in pad coordinates, a typed value rather than a capture. */
  strokes: SignatureStroke[];
  /** Width of the pad the strokes were drawn on, so they can be refitted. */
  padWidth: number;
  signerName: string;
  /**
   * The signature already stored and attached on the server, when the app
   * died between the upload finishing and the checks being sent. The server
   * confirmed this id, so recording it is not a claim the phone cannot keep.
   */
  storedFileId: string | null;
};

/** The name to offer first: whoever the shop profile says is at the counter. */
export function defaultSignerName(order: Pick<Order, "supplierContact">): string {
  return order.supplierContact?.contactName?.trim() ?? "";
}

/** The shop, by the name its own profile gives, falling back to the stop label. */
export function shopDisplayName(order: Pick<Order, "supplierContact" | "pickup">): string {
  return order.supplierContact?.shopName?.trim() || order.pickup?.label?.trim() || "The shop";
}

export function signerNameValid(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= MIN_SIGNER_NAME && trimmed.length <= MAX_SIGNER_NAME;
}

/**
 * Why "Done" is blocked, in words the rider can act on. Null when the
 * signature may be sent.
 *
 * The order of the reasons is the order the counter runs in: the checks must
 * be the ones being signed for, the signer must be named, the paper must be
 * signed, and the server must hold the file before the checks can name it.
 */
export function handoffBlockReason(input: {
  answers: ChecklistAnswers | null;
  signerName: string;
  signed: boolean;
  upload: EvidenceUpload;
  storedFileId: string | null;
}): string | null {
  if (!input.answers || !allPassed(input.answers)) {
    return "Run all six pickup checks with the supplier first.";
  }
  if (!signerNameValid(input.signerName)) {
    return "Type the name of the person signing for the shop.";
  }
  if (input.storedFileId) return null;
  if (!input.signed) {
    return "Ask the supplier to sign on the paper above.";
  }
  switch (input.upload.phase) {
    case "idle":
    case "stored":
      return null;
    case "sending":
    case "processing":
      return "Wait for the signature to save.";
    case "failed":
      // A dropped connection leaves "Done" live: pressing it sends the same
      // signature again. Only a refusal the phone cannot fix stops the step.
      return input.upload.retryable
        ? null
        : "This signature cannot be stored, so the handoff cannot be recorded. Do not take the package — call Operations.";
  }
}

/** What the button says at each point. Same verb throughout. */
export function handoffActionLabel(input: { busy: boolean; signed: boolean }): string {
  if (input.busy) return "Recording the handoff…";
  return input.signed ? "Done — take the package" : "Sign above to continue";
}

/**
 * The sentence the supplier is agreeing to, with the numbers in it.
 *
 * Read by the person signing, not the rider: it names what was checked,
 * how many, when, and who is taking it — so the signature is over a claim
 * rather than a blank.
 */
export function attestationLine(input: {
  signerName: string;
  order: Pick<Order, "quantity" | "title">;
  riderName: string | null;
  checkedAt: string | null;
  nowMs?: number;
}): string {
  const who = signerNameValid(input.signerName) ? input.signerName.trim() : "The signer";
  const count =
    Number.isFinite(input.order.quantity) && input.order.quantity > 0
      ? `${input.order.quantity} ${input.order.quantity === 1 ? "piece" : "pieces"} of ${input.order.title}`
      : input.order.title;
  const when = formatCheckedAt(input.checkedAt, input.nowMs);
  const rider = input.riderName?.trim() ? `GRIDGO rider ${input.riderName.trim()}` : "the GRIDGO rider";
  return `By signing, ${who} confirms that ${count} were checked together at the counter, passed all six checks${when ? ` at ${when}` : ""}, and are handed to ${rider}.`;
}

/** "3:24 PM" for today; "19 Sep, 3:24 PM" for any other day. */
export function formatCheckedAt(iso: string | null, nowMs: number = Date.now()): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const time = at.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
  const now = new Date(nowMs);
  const sameDay =
    at.getFullYear() === now.getFullYear() &&
    at.getMonth() === now.getMonth() &&
    at.getDate() === now.getDate();
  if (sameDay) return time;
  const date = at.toLocaleDateString("en-PH", { day: "numeric", month: "short" });
  return `${date}, ${time}`;
}

/** The six, in the short form the signer reads above the pad. */
export function passedCheckLabels(): string[] {
  return PICKUP_CHECKS.map((check) => check.label);
}
