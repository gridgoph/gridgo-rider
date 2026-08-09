import {
  hasEnoughInk,
  inkLength,
  MIN_SIGNATURE_INK,
  strokeToPath,
  type SignatureStroke,
} from "@/lib/signature";

function horizontal(length: number): SignatureStroke {
  return Array.from({ length: length + 1 }, (_, i) => ({ x: i, y: 0 }));
}

describe("strokeToPath", () => {
  it("returns nothing for an empty stroke", () => {
    expect(strokeToPath([])).toBe("");
  });

  it("still leaves a mark for a single tap", () => {
    expect(strokeToPath([{ x: 10, y: 20 }])).toBe("M10 20 L10.5 20");
  });

  it("joins points into one path", () => {
    expect(
      strokeToPath([
        { x: 0, y: 0 },
        { x: 1.25, y: 2 },
        { x: 4, y: 3 },
      ]),
    ).toBe("M0 0 L1.3 2 L4 3");
  });
});

describe("ink", () => {
  it("measures the drawn length, not the point count", () => {
    expect(inkLength([horizontal(10)])).toBeCloseTo(10);
    expect(inkLength([[{ x: 0, y: 0 }]])).toBe(0);
    expect(inkLength([])).toBe(0);
  });

  it("rejects a tap and accepts a real signature", () => {
    expect(hasEnoughInk([[{ x: 5, y: 5 }]])).toBe(false);
    expect(hasEnoughInk([horizontal(MIN_SIGNATURE_INK - 1)])).toBe(false);
    expect(hasEnoughInk([horizontal(MIN_SIGNATURE_INK)])).toBe(true);
  });

  it("adds up across separate strokes", () => {
    expect(hasEnoughInk([horizontal(MIN_SIGNATURE_INK / 2), horizontal(MIN_SIGNATURE_INK / 2)])).toBe(
      true,
    );
  });
});
