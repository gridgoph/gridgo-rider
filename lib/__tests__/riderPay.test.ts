import { riderPay, riderPayA11y, riderPayDetail, shareLabel } from "@/lib/riderPay";

describe("what the rider earns from one job", () => {
  it("reads the gross from the effective fee after a delivery-pin change", () => {
    // A pin moved to a dearer band: ₱25 → ₱35, the rider's 85% of the ₱10 folded in.
    const pay = riderPay({
      deliveryFeeMinor: 2500,
      effectiveDeliveryFeeMinor: 3500,
      riderCommissionBps: 8500,
      riderPayoutMinor: 2975,
    });

    expect(pay).toEqual({ earnedMinor: 2975, deliveryFeeMinor: 3500, shareBps: 8500, split: true });
    expect(riderPayDetail(pay)).toBe("85% of the ₱35.00 delivery fee");
  });

  it("keeps a whole-fee rider whole after a dearer pin", () => {
    const pay = riderPay({ deliveryFeeMinor: 2500, effectiveDeliveryFeeMinor: 3500, riderPayoutMinor: 3500 });

    expect(pay).toEqual({ earnedMinor: 3500, deliveryFeeMinor: 3500, shareBps: null, split: false });
  });

  it("leads with the API's payout and keeps the gross beside it", () => {
    const pay = riderPay({ deliveryFeeMinor: 2500, riderCommissionBps: 8500, riderPayoutMinor: 2125 });

    expect(pay).toEqual({ earnedMinor: 2125, deliveryFeeMinor: 2500, shareBps: 8500, split: true });
    expect(riderPayDetail(pay)).toBe("85% of the ₱25.00 delivery fee");
    expect(riderPayA11y(pay)).toBe("₱21.25 of the ₱25.00 delivery fee");
  });

  it("falls back to the whole fee when the API has no split", () => {
    const pay = riderPay({ deliveryFeeMinor: 2500 });

    expect(pay).toEqual({ earnedMinor: 2500, deliveryFeeMinor: 2500, shareBps: null, split: false });
    expect(riderPayDetail(pay)).toBeNull();
    expect(riderPayA11y(pay)).toBe("₱25.00");
  });

  it("treats null split fields as absent", () => {
    const pay = riderPay({ deliveryFeeMinor: 2500, riderCommissionBps: null, riderPayoutMinor: null });

    expect(pay.earnedMinor).toBe(2500);
    expect(pay.split).toBe(false);
  });

  it("says nothing extra for a legacy order the rider keeps in full", () => {
    const pay = riderPay({ deliveryFeeMinor: 2500, riderCommissionBps: 10_000, riderPayoutMinor: 2500 });

    expect(pay.earnedMinor).toBe(2500);
    expect(riderPayDetail(pay)).toBeNull();
  });

  it("uses the server's rounding rather than recomputing it", () => {
    const pay = riderPay({ deliveryFeeMinor: 10, riderCommissionBps: 8500, riderPayoutMinor: 9 });

    expect(pay.earnedMinor).toBe(9);
  });

  it("still explains the split when only the payout arrives", () => {
    const pay = riderPay({ deliveryFeeMinor: 2500, riderPayoutMinor: 2125 });

    expect(riderPayDetail(pay)).toBe("Of the ₱25.00 delivery fee");
  });

  it("shows the fee rather than a payout it cannot explain", () => {
    expect(riderPay({ deliveryFeeMinor: 2500, riderPayoutMinor: 9999 }).earnedMinor).toBe(2500);
    expect(riderPay({ deliveryFeeMinor: 2500, riderPayoutMinor: -1 }).earnedMinor).toBe(2500);
    expect(riderPay({ deliveryFeeMinor: 2500, riderPayoutMinor: 21.5 }).earnedMinor).toBe(2500);
  });

  it("keeps a zero-fee pickup job at zero", () => {
    const pay = riderPay({ deliveryFeeMinor: 0, riderCommissionBps: 8500, riderPayoutMinor: 0 });

    expect(pay.earnedMinor).toBe(0);
    expect(riderPayDetail(pay)).toBeNull();
  });

  it("drops a share rate outside 0–100%", () => {
    const pay = riderPay({ deliveryFeeMinor: 2500, riderCommissionBps: 12_000, riderPayoutMinor: 2125 });

    expect(riderPayDetail(pay)).toBe("Of the ₱25.00 delivery fee");
  });

  it("prints the share the way a rider says it", () => {
    expect(shareLabel(8500)).toBe("85%");
    expect(shareLabel(8750)).toBe("87.5%");
    expect(shareLabel(8333)).toBe("83.33%");
  });
});
