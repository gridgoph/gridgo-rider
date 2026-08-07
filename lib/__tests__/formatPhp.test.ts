import { formatPhp } from "@/lib/api";

describe("formatPhp", () => {
  it("formats centavos as peso with two decimals", () => {
    expect(formatPhp(0)).toBe("₱0.00");
    expect(formatPhp(100)).toBe("₱1.00");
    expect(formatPhp(95000)).toBe("₱950.00");
  });

  it("keeps fractional centavos visible", () => {
    expect(formatPhp(150)).toBe("₱1.50");
  });
});
