import type { HandoverFlow, Order, PickupCheckCode, PickupCheckResult } from "@/lib/api";
import { countProblemPhrase, recordedCountLines } from "@/lib/pickupCount";

/**
 * The six-point pickup check.
 *
 * The rider and supplier run this together at the counter before the package moves.
 * All six have to pass; any one failing stops transport outright.
 *
 * The reason that rule is absolute, and the reason it belongs in the copy the
 * rider reads rather than in a policy document: a defect that leaves the
 * supplier without being logged stops being the supplier's defect and becomes
 * GRIDGO's. The Zero-Risk Reprint Guarantee is only payable by whoever caused
 * the fault, and the pickup counter is the last place the app can still say who
 * that was.
 *
 * Everything here is pure so the gate can be tested without a counter, a
 * camera, or a server.
 */

/** Codes in the order the API defines them, which is the order riders work in. */
export const PICKUP_CHECK_CODES: readonly PickupCheckCode[] = [
  "quantity_match",
  "specification_match",
  "visible_defects",
  "packaging_integrity",
  "documentation",
  "supplier_sign_off",
] as const;

export type PickupCheckDefinition = {
  code: PickupCheckCode;
  /** What the rider is confirming, as a thing rather than an instruction. */
  label: string;
  /** How to check it, in the words someone standing at a counter needs. */
  verify: string;
  /**
   * What it means when this one fails.
   *
   * Not the label with a "not" in front of it. Several of these read as their
   * own opposite when a failure borrows them — "no visible defects" at the
   * front of a sentence about a blocked pickup says exactly the wrong thing.
   */
  failure: string;
};

export const PICKUP_CHECKS: readonly PickupCheckDefinition[] = [
  {
    code: "quantity_match",
    label: "Quantity matches",
    verify: "Count the pieces together with the supplier against the order ticket.",
    failure: "the count does not match the order",
  },
  {
    code: "specification_match",
    label: "Specification matches",
    verify: "Size, colour, material and design are what the order describes.",
    failure: "the item is not what the order describes",
  },
  {
    code: "visible_defects",
    label: "No visible defects",
    verify: "No tears, misprints, colour shifts, cracks or stains anywhere you can see.",
    failure: "there are visible defects",
  },
  {
    code: "packaging_integrity",
    label: "Packaging holds up",
    verify: "Wrapped or boxed well enough to survive the ride on a motorcycle.",
    failure: "the packaging will not survive the ride",
  },
  {
    code: "documentation",
    label: "Paperwork is in",
    verify: "Delivery receipt, invoice or order slip is included, and its order number matches this job.",
    failure: "the paperwork is missing or does not match",
  },
  {
    code: "supplier_sign_off",
    label: "Supplier signs off",
    verify: "After checking together, the supplier agrees to hand the job over and will sign on your phone next.",
    failure: "the supplier would not sign the handoff off",
  },
] as const;

/**
 * The same six on a `rider_packs` job, where nothing is packed yet.
 *
 * The codes and their order are the server's, so only the words change: the
 * count, the specification and the defects are checked on the pieces out of
 * their wrapping; `packaging_integrity` is the box or wrap the shop has ready;
 * `supplier_sign_off` is the shop agreeing to the joint check. The signature
 * itself comes after the packing, at the hand-over.
 */
const UNPACKED_WORDING: Partial<
  Record<PickupCheckCode, Pick<PickupCheckDefinition, "label" | "verify" | "failure">>
> = {
  quantity_match: {
    label: "Quantity matches",
    verify: "Count the pieces unpacked, together with the shop, against the order ticket.",
    failure: "the count does not match the order",
  },
  specification_match: {
    label: "Specification matches",
    verify: "Size, colour, material and design are what the order describes. Look at the pieces, not the wrapping.",
    failure: "the item is not what the order describes",
  },
  visible_defects: {
    label: "No visible defects",
    verify: "Look over every piece unpacked: no tears, misprints, colour shifts, cracks or stains.",
    failure: "there are visible defects",
  },
  packaging_integrity: {
    label: "Packing materials ready",
    verify: "The box, wrap or bag the shop will use is ready and strong enough for a motorcycle ride. Nothing is packed yet.",
    failure: "the packing materials will not survive the ride",
  },
  supplier_sign_off: {
    label: "Checked together",
    verify: "The shop agrees these are the right pieces. They pack them in front of you next, then sign on your phone.",
    failure: "the shop would not agree to the check",
  },
};

/** The six as this job's counter words them. Legacy unless the server says otherwise. */
export function pickupChecksFor(
  flow: HandoverFlow | null | undefined,
): readonly PickupCheckDefinition[] {
  if (flow !== "rider_packs") return PICKUP_CHECKS;
  return PICKUP_CHECKS.map((check) => ({ ...check, ...UNPACKED_WORDING[check.code] }));
}

/** What the rider answered for one check. `null` means not answered yet. */
export type CheckAnswer = boolean | null;

export type ChecklistAnswers = Record<PickupCheckCode, CheckAnswer>;

export const EMPTY_ANSWERS: ChecklistAnswers = {
  quantity_match: null,
  specification_match: null,
  visible_defects: null,
  packaging_integrity: null,
  documentation: null,
  supplier_sign_off: null,
};

export function checkDefinition(
  code: PickupCheckCode,
  flow: HandoverFlow | null = null,
): PickupCheckDefinition {
  const checks = pickupChecksFor(flow);
  return checks.find((check) => check.code === code) ?? checks[0];
}

/** Codes still unanswered, in checklist order. */
export function unansweredCodes(answers: ChecklistAnswers): PickupCheckCode[] {
  return PICKUP_CHECK_CODES.filter((code) => answers[code] == null);
}

/** Codes the rider marked as a problem, in checklist order. */
export function failedCodes(answers: ChecklistAnswers): PickupCheckCode[] {
  return PICKUP_CHECK_CODES.filter((code) => answers[code] === false);
}

export function allAnswered(answers: ChecklistAnswers): boolean {
  return unansweredCodes(answers).length === 0;
}

export function allPassed(answers: ChecklistAnswers): boolean {
  return PICKUP_CHECK_CODES.every((code) => answers[code] === true);
}

/** A recorded checklist's answers, for screens that sign over the server's record. */
export function answersFromChecks(checks: readonly PickupCheckResult[] | null | undefined): ChecklistAnswers {
  const answers: ChecklistAnswers = { ...EMPTY_ANSWERS };
  for (const check of checks ?? []) {
    if (PICKUP_CHECK_CODES.includes(check.code)) answers[check.code] = check.passed;
  }
  return answers;
}

/** The request body shape, once every check has an answer. */
export function toChecklistPayload(answers: ChecklistAnswers): PickupCheckResult[] {
  return PICKUP_CHECK_CODES.map((code) => ({ code, passed: answers[code] === true }));
}

/**
 * Why the checklist cannot be submitted yet, in words the rider can act on.
 * Returns null when it is ready to send.
 *
 * A failed check needs more than a tap: without a photo and a sentence, the
 * escalation reaching Operations says a package was refused and nothing else,
 * which is no better than the package leaving unlogged.
 */
export function checklistBlockReason(
  answers: ChecklistAnswers,
  failure: { note: string; evidenceStored: boolean },
  flow: HandoverFlow | null = null,
): string | null {
  const unanswered = unansweredCodes(answers);
  if (unanswered.length === 1) {
    return `One check left: ${checkDefinition(unanswered[0], flow).label.toLowerCase()}.`;
  }
  if (unanswered.length > 1) {
    return `${unanswered.length} checks left to answer.`;
  }
  if (allPassed(answers)) return null;

  if (!failure.evidenceStored) {
    return "Photograph the problem before you escalate it. Without it, the fault becomes GRIDGO's.";
  }
  if (failure.note.trim().length < 10) {
    return "Describe the problem in a sentence so Operations knows what they are looking at.";
  }
  return null;
}

/** What the confirm button says, given where the checklist has landed. */
export function checklistActionLabel(
  answers: ChecklistAnswers,
  flow: HandoverFlow | null = null,
): string {
  if (!allAnswered(answers)) return "Confirm all six checks";
  if (!allPassed(answers)) return "Do not transport — escalate this";
  return flow === "rider_packs" ? "All six pass — shop packs next" : "All six pass — supplier signs next";
}

/**
 * The consequence line above the button.
 *
 * The rider is told what their answers do before they commit, because the two
 * outcomes are not variations of each other: one starts a delivery, the other
 * stops one and puts Operations and the founder in the loop.
 *
 * `countProblem` is the count's own phrase ("the count is 20 short on
 * Business cards") and replaces the generic quantity failure when it is the
 * only thing wrong, so the rider reads the number they typed back.
 */
export function checklistConsequence(
  answers: ChecklistAnswers,
  countProblem: string | null = null,
  flow: HandoverFlow | null = null,
): string | null {
  if (!allAnswered(answers)) return null;
  if (allPassed(answers)) {
    return flow === "rider_packs"
      ? "GRIDGO records the check. Nothing moves yet: the shop packs it in front of you, you photograph it, then they sign."
      : "Nothing is recorded yet. Next, the supplier signs on your phone — that is what makes the package yours to carry.";
  }
  const failed = failedCodes(answers);
  const which =
    failed.length === 1
      ? failed[0] === "quantity_match" && countProblem
        ? countProblem
        : checkDefinition(failed[0], flow).failure
      : `${failed.length} problems you found`;
  return `The package stays at the shop. GRIDGO logs that ${which}, alerts Operations and the founder, and tells you when to move.`;
}

/** Plain-language summary of a recorded checklist, for the trip screen. */
export function checklistSummary(
  order: Pick<Order, "pickupChecklist"> & Partial<Pick<Order, "pickupCountItems" | "handoverFlow">>,
): string | null {
  const record = order.pickupChecklist;
  if (!record) return null;
  const flow = order.handoverFlow ?? null;
  switch (record.status) {
    case "passed":
    case "legacy_passed":
      return "All six pickup checks passed.";
    case "inspected":
      return "All six checks passed on the unpacked items.";
    case "failed_escalated": {
      const failed = record.checks.filter((check) => !check.passed);
      if (!failed.length) return "A pickup check failed and transport is on hold.";
      // The recorded count says more than "does not match": which line, by how much.
      const countPhrase = countProblemPhrase(
        recordedCountLines({ pickupCountItems: null, ...order }) ?? [],
      );
      const names = failed.map((check) =>
        check.code === "quantity_match" && countPhrase
          ? countPhrase
          : checkDefinition(check.code, flow).failure,
      );
      const list =
        names.length === 1
          ? names[0]
          : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
      // Capitalised here rather than in the data, so the same phrase can also
      // sit mid-sentence in the consequence line.
      return `${list.charAt(0).toUpperCase()}${list.slice(1)}.`;
    }
    case "escalation_resolved":
      return "Operations has answered. Run all six checks again before you carry anything.";
    default:
      return null;
  }
}

/** Server authorization remains authoritative; do not offer checks outside pickup. */
export function canRunPickupChecks(order: Pick<Order, "state" | "pickupChecklist">): boolean {
  return order.state === "rider_assigned" && order.pickupChecklist?.status !== "failed_escalated";
}
