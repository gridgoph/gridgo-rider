import type { PickupChecklistRecord, PickupCountItem } from "@/lib/api";
import { attestationLine } from "@/lib/handoffSignature";
import { checklistConsequence, checklistSummary, EMPTY_ANSWERS } from "@/lib/pickupChecklist";
import {
  countBlockReason,
  countKey,
  countMode,
  countVerdict,
  draftCountLines,
  draftCountProblem,
  effectiveAnswers,
  ORDER_LINE_KEY,
  parseCount,
  quantityAnswer,
  recordedCountLines,
  toCountPayload,
  verdictLabel,
} from "@/lib/pickupCount";

const CARDS: PickupCountItem = { lineItemId: "cline_cards", itemName: "Business cards", expectedQuantity: 200 };
const FLYERS: PickupCountItem = { lineItemId: "cline_flyers", itemName: "A5 flyers", expectedQuantity: 50 };
const LEGACY: PickupCountItem = { lineItemId: null, itemName: "Tarpaulin 3×6 ft", expectedQuantity: 12 };

const otherFivePass = {
  ...EMPTY_ANSWERS,
  specification_match: true,
  visible_defects: true,
  packaging_integrity: true,
  documentation: true,
  supplier_sign_off: true,
};

describe("how an order is counted", () => {
  it("counts the lines the server projects", () => {
    expect(countMode({ pickupCountItems: [CARDS, FLYERS] })).toEqual({
      kind: "count",
      items: [CARDS, FLYERS],
    });
  });

  it("stops when the server says there is no number to count against", () => {
    expect(countMode({ pickupCountItems: null })).toEqual({ kind: "unavailable" });
    expect(countMode({ pickupCountItems: [] })).toEqual({ kind: "unavailable" });
    expect(countBlockReason({ kind: "unavailable" }, {})).toMatch(/call operations/i);
  });

  it("keeps an API older than counting working, sending no counts", () => {
    const mode = countMode({});
    expect(mode).toEqual({ kind: "legacy" });
    expect(countBlockReason(mode, {})).toBeNull();
    expect(toCountPayload(mode, {})).toBeNull();
    // The tapped answer stands.
    expect(effectiveAnswers({ ...otherFivePass, quantity_match: true }, mode, {})).toEqual({
      ...otherFivePass,
      quantity_match: true,
    });
  });

  it("keys a pre-line-item order under its own key and sends its null id back", () => {
    expect(countKey(null)).toBe(ORDER_LINE_KEY);
    const mode = countMode({ pickupCountItems: [LEGACY] });
    expect(toCountPayload(mode, { [ORDER_LINE_KEY]: 12 })).toEqual([
      { lineItemId: null, countedQuantity: 12 },
    ]);
  });
});

describe("what the rider types", () => {
  it("reads digits only, and empty is not zero", () => {
    expect(parseCount("")).toBeNull();
    expect(parseCount("  ")).toBeNull();
    expect(parseCount("0")).toBe(0);
    expect(parseCount("1,200")).toBe(1200);
    expect(parseCount("200 pcs")).toBe(200);
    expect(parseCount("-5")).toBe(5);
    expect(parseCount("123456789")).toBe(1234567);
  });

  it("says short and over in words", () => {
    expect(countVerdict(200, null)).toEqual({ kind: "pending" });
    expect(verdictLabel(countVerdict(200, 200))).toBe("Matches");
    expect(verdictLabel(countVerdict(200, 180))).toBe("20 short");
    expect(verdictLabel(countVerdict(200, 205))).toBe("5 over");
    expect(verdictLabel(countVerdict(200, null))).toBeNull();
  });
});

describe("the count answers the quantity check", () => {
  const mode = countMode({ pickupCountItems: [CARDS, FLYERS] });

  it("is unanswered until every line is counted, never defaulted", () => {
    expect(quantityAnswer([CARDS, FLYERS], {})).toBeNull();
    expect(quantityAnswer([CARDS, FLYERS], { cline_cards: 200 })).toBeNull();
    expect(countBlockReason(mode, { cline_cards: 200 })).toBe("Count left: A5 flyers.");
    expect(countBlockReason(mode, {})).toBe("2 lines left to count.");
    expect(countBlockReason(countMode({ pickupCountItems: [CARDS] }), {})).toMatch(/count the pieces/i);
  });

  it("passes only when every line matches", () => {
    const counts = { cline_cards: 200, cline_flyers: 50 };
    expect(countBlockReason(mode, counts)).toBeNull();
    expect(effectiveAnswers(otherFivePass, mode, counts).quantity_match).toBe(true);
    expect(toCountPayload(mode, counts)).toEqual([
      { lineItemId: "cline_cards", countedQuantity: 200 },
      { lineItemId: "cline_flyers", countedQuantity: 50 },
    ]);
  });

  it("fails on a short line, and a surplus elsewhere cannot hide it", () => {
    const counts = { cline_cards: 180, cline_flyers: 70 };
    expect(effectiveAnswers(otherFivePass, mode, counts).quantity_match).toBe(false);
    expect(draftCountProblem([CARDS, FLYERS], counts)).toBe("the count is off on 2 lines");
    expect(draftCountProblem([CARDS, FLYERS], { cline_cards: 180, cline_flyers: 50 })).toBe(
      "the count is 20 short on Business cards",
    );
  });

  it("ignores a tapped quantity answer in count mode", () => {
    const tapped = { ...otherFivePass, quantity_match: true };
    expect(effectiveAnswers(tapped, mode, {}).quantity_match).toBeNull();
  });

  it("names the shortfall in the consequence the rider reads before committing", () => {
    const counts = { cline_cards: 180, cline_flyers: 50 };
    const answers = effectiveAnswers(otherFivePass, mode, counts);
    expect(checklistConsequence(answers, draftCountProblem([CARDS, FLYERS], counts))).toMatch(
      /the count is 20 short on Business cards, alerts Operations/,
    );
  });

  it("refuses to build a payload with a line uncounted", () => {
    expect(() => toCountPayload(mode, { cline_cards: 200 })).toThrow();
  });
});

describe("a recorded count", () => {
  const record: PickupChecklistRecord = {
    status: "failed_escalated",
    checks: [
      { code: "quantity_match", passed: false },
      { code: "specification_match", passed: true },
      { code: "visible_defects", passed: true },
      { code: "packaging_integrity", passed: true },
      { code: "documentation", passed: true },
      { code: "supplier_sign_off", passed: true },
    ],
    counts: [
      { lineItemId: "cline_cards", expectedQuantity: 200, countedQuantity: 180 },
      { lineItemId: "cline_flyers", expectedQuantity: 50, countedQuantity: 50 },
    ],
    evidenceFileIds: ["fil_1"],
    failureNote: "Twenty cards missing from the second box",
    completedAt: "2026-09-27T07:00:00.000Z",
    completedBy: "user_rider",
    escalationId: "esc_1",
    signOffPrompt: null,
  };

  it("names each line from the order and reads its verdict", () => {
    const lines = recordedCountLines({ pickupChecklist: record, pickupCountItems: [CARDS, FLYERS] });
    expect(lines?.map((line) => [line.itemName, verdictLabel(line.verdict)])).toEqual([
      ["Business cards", "20 short"],
      ["A5 flyers", "Matches"],
    ]);
  });

  it("reads a checklist from before counting as not recorded, never zero", () => {
    const { counts: _omit, ...historical } = record;
    expect(recordedCountLines({ pickupChecklist: historical, pickupCountItems: [CARDS] })).toBeNull();
    expect(checklistSummary({ pickupChecklist: historical })).toBe(
      "The count does not match the order.",
    );
  });

  it("tells the trip screen which line was short", () => {
    expect(checklistSummary({ pickupChecklist: record, pickupCountItems: [CARDS, FLYERS] })).toBe(
      "The count is 20 short on Business cards.",
    );
  });
});

describe("the sentence the supplier signs", () => {
  it("names the pieces counted, line by line", () => {
    const lines = draftCountLines([CARDS, FLYERS], { cline_cards: 200, cline_flyers: 50 });
    expect(
      attestationLine({
        signerName: "Ana Reyes",
        order: { quantity: 2, title: "Print bundle" },
        counts: lines,
        riderName: "Mark Prado",
        checkedAt: null,
      }),
    ).toBe(
      "By signing, Ana Reyes confirms that 200 pieces of Business cards and 50 pieces of A5 flyers were counted and checked together at the counter, passed all six checks, and are handed to GRIDGO rider Mark Prado.",
    );
  });
});
