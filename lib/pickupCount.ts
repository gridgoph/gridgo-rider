import type {
  Order,
  PickupCountInput,
  PickupCountItem,
  PickupCountRecord,
} from "@/lib/api";
import type { ChecklistAnswers } from "@/lib/pickupChecklist";

/**
 * The count at the counter.
 *
 * The first of the six checks is not a tick: the rider and the supplier count
 * the pieces together and the rider types the number for each line. The server
 * holds the expected numbers and fails `quantity_match` on any line that is
 * off, whatever was ticked — so here the count *is* that check's answer, and a
 * rider can never pass a quantity the numbers contradict.
 *
 * Counts start empty. An expected number shown in the field would be an answer
 * nobody gave, which is the one thing a count exists to prevent.
 *
 * Pure, so every rule can be tested without a counter.
 */

/** What the rider has typed, by line. Null (or absent) means not counted yet. */
export type CountDraft = Record<string, number | null>;

/** The draft key for an order older than line items, whose line id is null. */
export const ORDER_LINE_KEY = "__order__";

export function countKey(lineItemId: string | null): string {
  return lineItemId ?? ORDER_LINE_KEY;
}

/**
 * How this order is counted.
 *
 * - `count`: the server projects lines to count; one field per line.
 * - `unavailable`: the server says the order has no usable number to count
 *   against. It refuses every submission, so the rider calls Operations.
 * - `legacy`: an API older than counting projects nothing; the quantity check
 *   stays a plain pass or problem and no counts are sent.
 */
export type CountMode =
  | { kind: "count"; items: PickupCountItem[] }
  | { kind: "unavailable" }
  | { kind: "legacy" };

export function countMode(order: Pick<Order, "pickupCountItems">): CountMode {
  const items = order.pickupCountItems;
  if (items === null) return { kind: "unavailable" };
  if (Array.isArray(items) && items.length > 0) return { kind: "count", items };
  // An empty list names nothing to count, which the server would also refuse.
  if (Array.isArray(items)) return { kind: "unavailable" };
  return { kind: "legacy" };
}

/** Largest count a field accepts. Seven digits covers any print run. */
export const MAX_COUNT_DIGITS = 7;

/**
 * Typed text to a count. Digits only, so a pasted "1,200" or "200 pcs" still
 * lands as a number; empty means not counted, never zero.
 */
export function parseCount(text: string): number | null {
  const digits = text.replace(/\D/g, "").slice(0, MAX_COUNT_DIGITS);
  if (!digits) return null;
  return Number.parseInt(digits, 10);
}

export type CountVerdict =
  | { kind: "pending" }
  | { kind: "match" }
  | { kind: "short"; by: number }
  | { kind: "over"; by: number };

export function countVerdict(expected: number, counted: number | null | undefined): CountVerdict {
  if (counted == null) return { kind: "pending" };
  if (counted === expected) return { kind: "match" };
  return counted < expected
    ? { kind: "short", by: expected - counted }
    : { kind: "over", by: counted - expected };
}

/** "Matches", "20 short", "5 over", or null while not counted. */
export function verdictLabel(verdict: CountVerdict): string | null {
  switch (verdict.kind) {
    case "pending":
      return null;
    case "match":
      return "Matches";
    case "short":
      return `${verdict.by.toLocaleString("en-PH")} short`;
    case "over":
      return `${verdict.by.toLocaleString("en-PH")} over`;
  }
}

function countedFor(item: PickupCountItem, counts: CountDraft | undefined): number | null {
  return counts?.[countKey(item.lineItemId)] ?? null;
}

/** Lines not counted yet, in the order the server listed them. */
export function uncountedItems(items: PickupCountItem[], counts: CountDraft | undefined) {
  return items.filter((item) => countedFor(item, counts) == null);
}

/** Lines counted and off, in order. */
export function mismatchedItems(items: PickupCountItem[], counts: CountDraft | undefined) {
  return items.filter((item) => {
    const counted = countedFor(item, counts);
    return counted != null && counted !== item.expectedQuantity;
  });
}

/**
 * The quantity check's answer, read off the count: unanswered until every line
 * is counted, a pass only when every line matches.
 */
export function quantityAnswer(
  items: PickupCountItem[],
  counts: CountDraft | undefined,
): boolean | null {
  if (uncountedItems(items, counts).length) return null;
  return mismatchedItems(items, counts).length === 0;
}

/**
 * The six answers as they will be sent: in count mode `quantity_match` comes
 * from the numbers, never from a tap. In the other modes they are unchanged.
 */
export function effectiveAnswers(
  answers: ChecklistAnswers,
  mode: CountMode,
  counts: CountDraft | undefined,
): ChecklistAnswers {
  if (mode.kind !== "count") return answers;
  return { ...answers, quantity_match: quantityAnswer(mode.items, counts) };
}

/**
 * The `counts` body, one row per projected line, or null when this API has no
 * count to send. Throws if a line is uncounted: the gate must hold first.
 */
export function toCountPayload(
  mode: CountMode,
  counts: CountDraft | undefined,
): PickupCountInput[] | null {
  if (mode.kind !== "count") return null;
  return mode.items.map((item) => {
    const counted = countedFor(item, counts);
    if (counted == null) throw new Error("pickup_count_incomplete");
    return { lineItemId: item.lineItemId, countedQuantity: counted };
  });
}

/**
 * Why the count holds the checklist, before any other reason. Null when the
 * count is complete (or there is none to take).
 */
export function countBlockReason(mode: CountMode, counts: CountDraft | undefined): string | null {
  if (mode.kind === "unavailable") {
    return "This order has no count to check against. Call Operations before you take anything.";
  }
  if (mode.kind === "legacy") return null;
  const left = uncountedItems(mode.items, counts);
  if (left.length === 0) return null;
  if (left.length === 1) {
    return mode.items.length === 1
      ? "Count the pieces with the supplier and type the number."
      : `Count left: ${left[0].itemName}.`;
  }
  return `${left.length} lines left to count.`;
}

/**
 * The count problem in words that sit inside a sentence: "the count is 20
 * short on Business cards". Null when every line matches.
 */
export function countProblemPhrase(
  lines: { itemName: string; verdict: CountVerdict }[],
): string | null {
  const off = lines.filter((line) => line.verdict.kind === "short" || line.verdict.kind === "over");
  if (off.length === 0) return null;
  if (off.length > 1) return `the count is off on ${off.length} lines`;
  return `the count is ${verdictLabel(off[0].verdict)} on ${off[0].itemName}`;
}

/** The same phrase for what the rider has typed so far. */
export function draftCountProblem(
  items: PickupCountItem[],
  counts: CountDraft | undefined,
): string | null {
  return countProblemPhrase(
    items.map((item) => ({
      itemName: item.itemName,
      verdict: countVerdict(item.expectedQuantity, countedFor(item, counts)),
    })),
  );
}

export type RecordedCountLine = {
  key: string;
  itemName: string;
  expectedQuantity: number;
  countedQuantity: number;
  verdict: CountVerdict;
};

/**
 * The counts a recorded checklist carries, named from the order's lines.
 * Null when the record has none — a checklist from before counting, which
 * reads as "not recorded", never as zero.
 */
export function recordedCountLines(
  order: Pick<Order, "pickupChecklist" | "pickupCountItems">,
): RecordedCountLine[] | null {
  const counts: PickupCountRecord[] | undefined = order.pickupChecklist?.counts;
  if (!Array.isArray(counts) || counts.length === 0) return null;
  const names = order.pickupCountItems ?? [];
  return counts.map((line, index) => ({
    key: countKey(line.lineItemId),
    itemName:
      names.find((item) => item.lineItemId === line.lineItemId)?.itemName ??
      (counts.length === 1 ? "This order" : `Line ${index + 1}`),
    expectedQuantity: line.expectedQuantity,
    countedQuantity: line.countedQuantity,
    verdict: countVerdict(line.expectedQuantity, line.countedQuantity),
  }));
}

/** The draft's counts as lines, for the signer's receipt. */
export function draftCountLines(
  items: PickupCountItem[],
  counts: CountDraft | undefined,
): RecordedCountLine[] {
  return items.map((item) => {
    const counted = countedFor(item, counts) ?? 0;
    return {
      key: countKey(item.lineItemId),
      itemName: item.itemName,
      expectedQuantity: item.expectedQuantity,
      countedQuantity: counted,
      verdict: countVerdict(item.expectedQuantity, counted),
    };
  });
}

/** "200 business cards and 50 flyers", for the sentence the supplier signs. */
export function countedPiecesPhrase(lines: RecordedCountLine[]): string {
  const parts = lines.map(
    (line) =>
      `${line.countedQuantity.toLocaleString("en-PH")} ${line.countedQuantity === 1 ? "piece" : "pieces"} of ${line.itemName}`,
  );
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
