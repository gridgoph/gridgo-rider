import { ApiError } from "@/lib/api";
import {
  paymentMethodLabel,
  paymentStageLabel,
  receiptAdjustments,
  receiptIssuedLabel,
  receiptProblem,
  receiptSigned,
  receiptStage,
} from "@/lib/acknowledgementReceipt";

const ARRIVED = [
  { code: "picked_up", label: "Picked up", status: "completed", at: "2026-10-21T00:30:00.000Z" },
  { code: "arrived", label: "Arrived", status: "completed", at: "2026-10-21T01:00:00.000Z" },
] as const;

const onTheWay = {
  state: "out_for_delivery",
  fulfillmentMode: "delivery" as const,
  deliveryEvidence: null,
  deliveryMilestones: [
    { code: "arrived" as const, label: "Arrived", status: "pending" as const, at: null },
  ],
};

describe("the receipt window, as this phone can see it", () => {
  it("opens only once arrival is recorded on a door delivery in transport", () => {
    expect(receiptStage(onTheWay)).toBe("before_arrival");
    expect(receiptStage({ ...onTheWay, deliveryMilestones: [...ARRIVED] })).toBe("at_door");
    expect(receiptStage({ ...onTheWay, state: "picked_up", deliveryMilestones: [...ARRIVED] })).toBe("at_door");
  });

  it("does not count an arrival that was only passed over, or has no time", () => {
    expect(
      receiptStage({
        ...onTheWay,
        deliveryMilestones: [{ code: "arrived", label: "Arrived", status: "passed", at: null }],
      }),
    ).toBe("before_arrival");
    expect(
      receiptStage({
        ...onTheWay,
        deliveryMilestones: [{ code: "arrived", label: "Arrived", status: "completed", at: null }],
      }),
    ).toBe("before_arrival");
    // An API without milestones never opens it on its own say-so.
    expect(receiptStage({ ...onTheWay, deliveryMilestones: undefined })).toBe("before_arrival");
  });

  it.each([
    ["delivered", { state: "issue_window_open" }],
    ["cancelled", { state: "cancelled" }],
    ["still at the shop", { state: "rider_assigned" }],
    ["evidence already recorded", { deliveryEvidence: { fileId: "f", evidenceType: "photo" as const, riderId: "r", recordedAt: "2026-10-21T01:05:00.000Z" } }],
    ["a GRIDGO Office drop", { fulfillmentMode: "pickup" as const }],
  ])("is closed when %s", (_label, change) => {
    expect(receiptStage({ ...onTheWay, deliveryMilestones: [...ARRIVED], ...change })).toBe("none");
  });

  it("is closed with no job", () => {
    expect(receiptStage(null)).toBe("none");
  });
});

describe("the figures as the rider copies them", () => {
  it("lists the delivery fee, and discounts and rounding only when they are there", () => {
    expect(
      receiptAdjustments({
        deliveryFeeMinor: 5000,
        organizationDiscountMinor: 0,
        voucherDiscountMinor: 0,
        roundingAdjustmentMinor: 0,
      }),
    ).toEqual([{ label: "Delivery fee", value: "₱50.00" }]);

    expect(
      receiptAdjustments({
        deliveryFeeMinor: 5000,
        organizationDiscountMinor: 1000,
        voucherDiscountMinor: 250,
        roundingAdjustmentMinor: -1,
      }),
    ).toEqual([
      { label: "Delivery fee", value: "₱50.00" },
      { label: "Organization discount", value: "−₱10.00" },
      { label: "Voucher discount", value: "−₱2.50" },
      { label: "Rounding adjustment", value: "−₱0.01" },
    ]);
  });

  it("keeps the rounding adjustment's sign either way", () => {
    expect(receiptSigned(1)).toBe("+₱0.01");
    expect(receiptSigned(-2)).toBe("−₱0.02");
  });

  it("dates the receipt on Davao's clock", () => {
    // 16:30 UTC is half past midnight the next day in Manila.
    expect(receiptIssuedLabel("2026-10-20T16:30:00.000Z")).toMatch(/21/);
    expect(receiptIssuedLabel("2026-10-20T16:30:00.000Z")).toMatch(/12:30/);
    expect(receiptIssuedLabel("not a date")).toBe("Not recorded");
  });

  it("names a manual QR as what it is, never as a wallet it cannot prove", () => {
    const label = paymentMethodLabel({ method: "qr_manual", type: "digital" });
    expect(label).toBe("Digital payment (manual QR)");
    expect(label).not.toMatch(/gcash|maya|qr ph/i);
    expect(paymentMethodLabel({ method: "gcash", type: "digital" })).toBe("GCash");
    expect(paymentMethodLabel({ method: "cash", type: "cash" })).toBe("Cash");
  });

  it("never shows a method code it does not know", () => {
    expect(paymentMethodLabel({ method: "paymongo_link", type: "unknown" })).toBe("Payment method not recorded");
    expect(paymentMethodLabel({ method: "new_wallet", type: "digital" })).toBe("Digital payment");
    expect(paymentMethodLabel({ method: null, type: "unknown" })).toBe("Payment method not recorded");
    expect(paymentStageLabel("mystery_code")).toBe("Payment");
  });
});

describe("every documented receipt refusal reads as a reason and a next step", () => {
  const problem = (status: number, error: string) => receiptProblem(new ApiError(status, { error }));

  it("closes the receipt on 403, whatever the reason", () => {
    expect(problem(403, "forbidden")).toMatchObject({ kind: "closed", title: "The receipt is closed" });
  });

  it("closes it when the job is past door transport", () => {
    expect(problem(409, "acknowledgement_not_available").kind).toBe("closed");
  });

  it("reads a job that no longer exists as gone", () => {
    expect(problem(404, "order_not_found").kind).toBe("gone");
  });

  it("falls back to the paper receipt on an API older than the route", () => {
    expect(problem(404, "not_found")).toMatchObject({ kind: "unsupported" });
  });

  it.each([
    "acknowledgement_payment_pending",
    "acknowledgement_amount_unavailable",
    "acknowledgement_amount_mismatch",
    "acknowledgement_customer_unavailable",
  ])("%s tells the rider to call Operations, and can be tried again", (code) => {
    const result = problem(409, code);
    expect(result.kind).toBe("retry");
    expect(result.body).toMatch(/call Operations/);
    expect(result.body).not.toContain("_");
  });

  it("does not let the rider fix amounts by hand", () => {
    expect(problem(409, "acknowledgement_amount_mismatch").body).toMatch(/Do not write the amounts yourself/);
  });

  it("separates a failing server from a dead connection", () => {
    expect(problem(500, "internal").body).toMatch(/server is failing/);
    expect(receiptProblem(new Error("Network request failed")).body).toMatch(/connection/);
  });
});
