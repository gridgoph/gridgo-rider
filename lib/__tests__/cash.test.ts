import type { CashAmounts, Order, WalletActivity } from "@/lib/api";
import {
  cashAcceptKey,
  cashAmountsOf,
  cashEnabled,
  cashSlipRows,
  cashStage,
  chipPesos,
  deltaLabel,
  isCashOrder,
  newIdempotencyKey,
  noShowReportBlockReason,
  noShowSecondsLeft,
  normaliseReference,
  paymentQrUrl,
  shopCashConfirmLabel,
  signedPesos,
  topupAmounts,
  topupBlockReason,
  waitMinutesLabel,
  walletRows,
} from "@/lib/cash";

// The captain's worked example (gridgo-api#360): 400 / 669 / 197.80 / 71.20.
const EXAMPLE: CashAmounts = { shopMinor: 40_000, collectMinor: 66_900, gridgoMinor: 19_780, riderMinor: 7_120 };

function cashOrder(patch: Partial<Order> = {}): Pick<Order, "cash" | "cashAmounts" | "state"> {
  return {
    state: "rider_assigned",
    cash: { method: "cash", version: 3, status: "reserved", noShowWaitSeconds: 600 },
    cashAmounts: EXAMPLE,
    ...patch,
  } as Pick<Order, "cash" | "cashAmounts" | "state">;
}

describe("a cash job's amounts", () => {
  it("are the server's centavos, untouched", () => {
    expect(cashAmountsOf(cashOrder())).toEqual(EXAMPLE);
  });

  it("are refused when any figure is not a whole non-negative centavo count", () => {
    for (const bad of [{ ...EXAMPLE, gridgoMinor: 197.8 }, { ...EXAMPLE, riderMinor: -1 }, { ...EXAMPLE, shopMinor: "400" }]) {
      expect(cashAmountsOf(cashOrder({ cashAmounts: bad as never }))).toBeNull();
    }
  });

  it("belong only to a cash order", () => {
    expect(isCashOrder({ cash: null })).toBe(false);
    expect(cashAmountsOf({ cash: null, cashAmounts: EXAMPLE })).toBeNull();
  });

  it("read as the slip, in the order the money moves, and never add anything up", () => {
    const rows = cashSlipRows(EXAMPLE);
    expect(rows.map((row) => [row.key, row.minor, row.sign])).toEqual([
      ["shop", 40_000, "out"],
      ["collect", 66_900, "in"],
      ["gridgo", 19_780, "out"],
      ["rider", 7_120, "keep"],
    ]);
    expect(rows.map((row) => row.label)).toEqual(["Pay the shop", "Collect from the client", "GRIDGO's share", "You keep"]);
  });

  it("shows a voucher only when GRIDGO funds one", () => {
    expect(cashSlipRows(EXAMPLE).some((row) => row.key === "voucher")).toBe(false);
    expect(cashSlipRows({ ...EXAMPLE, voucherMinor: 5_000 }).find((row) => row.key === "voucher")?.minor).toBe(5_000);
  });

  it("prints the sign, so the direction never rests on colour", () => {
    expect(signedPesos(40_000, "out")).toBe("−₱400.00");
    expect(signedPesos(66_900, "in")).toBe("+₱669.00");
  });

  it("names the exact shop cash in the tick before Accept", () => {
    expect(shopCashConfirmLabel(EXAMPLE)).toBe("I have ₱400.00 in cash to pay the shop");
  });
});

describe("where a cash job's money stands", () => {
  const unpaid = { shopPaidAt: null, collectedAt: null, noShowApprovedAt: null };

  it("asks for the shop payment first, and only while the job is assigned", () => {
    expect(cashStage(cashOrder(), unpaid)).toBe("pay_shop");
    expect(cashStage(cashOrder({ state: "picked_up" }), unpaid)).toBe("none");
  });

  it("carries the parcel once the shop is paid, until the client's cash is collected", () => {
    expect(cashStage(cashOrder({ state: "picked_up" }), { ...unpaid, shopPaidAt: "2026-11-18T01:00:00Z" })).toBe("carry");
    expect(
      cashStage(cashOrder({ state: "out_for_delivery" }), {
        ...unpaid,
        shopPaidAt: "2026-11-18T01:00:00Z",
        collectedAt: "2026-11-18T02:00:00Z",
      }),
    ).toBe("collected");
  });

  it("knows a returned no-show from the order alone", () => {
    const order = cashOrder({ state: "awaiting_collection", cash: { method: "cash", version: 9, status: "online_repayment_required", noShowWaitSeconds: 600 } });
    expect(cashStage(order, null)).toBe("returned");
  });

  it("says nothing before the cash record has loaded, and nothing for an online job", () => {
    expect(cashStage(cashOrder(), null)).toBe("none");
    expect(cashStage({ state: "rider_assigned", cash: null }, unpaid)).toBe("none");
  });
});

describe("idempotency keys", () => {
  it("are fresh per request and within the server's 120 characters", () => {
    const a = newIdempotencyKey("collect");
    expect(a).not.toBe(newIdempotencyKey("collect"));
    expect(a.length).toBeLessThanOrEqual(120);
  });

  it("are one per offer for a cash accept, so a retry never holds the share twice", () => {
    expect(cashAcceptKey("dof_1")).toBe(cashAcceptKey("dof_1"));
    expect(cashAcceptKey("x".repeat(200)).length).toBe(120);
  });
});

describe("settings", () => {
  it("are on only when the server says so", () => {
    expect(cashEnabled(null)).toBe(false);
    expect(cashEnabled({ cash: { enabled: false, limitMinor: 500_000, noShowWaitSeconds: 600 } })).toBe(false);
    expect(cashEnabled({ cash: { enabled: true, limitMinor: 500_000, noShowWaitSeconds: 600 } })).toBe(true);
  });

  it("give no QR when none is active", () => {
    expect(paymentQrUrl({ paymentQr: { method: "gcash", caption: "GRIDGO" } })).toBeNull();
    expect(paymentQrUrl({ paymentQr: { method: "gcash", caption: "GRIDGO", imageUrl: "/public/payment-qr?v=1" } })).toMatch(
      /\/public\/payment-qr\?v=1$/,
    );
  });
});

describe("a top-up", () => {
  it("offers the server's amounts, smallest first, or the documented three", () => {
    expect(topupAmounts({ topupAmountsMinor: [100_000, 20_000, 50_000] })).toEqual([20_000, 50_000, 100_000]);
    expect(topupAmounts(null)).toEqual([20_000, 50_000, 100_000]);
    expect(chipPesos(100_000)).toBe("₱1,000");
  });

  it("needs an amount and a reference; the screenshot is optional but not mid-send", () => {
    expect(topupBlockReason({ amountMinor: null, reference: "X", screenshot: "none" })).toMatch(/how much/);
    expect(topupBlockReason({ amountMinor: 20_000, reference: "  ", screenshot: "none" })).toMatch(/reference/);
    expect(topupBlockReason({ amountMinor: 20_000, reference: "abc", screenshot: "sending" })).toMatch(/screenshot/);
    expect(topupBlockReason({ amountMinor: 20_000, reference: "abc", screenshot: "none" })).toBeNull();
    expect(normaliseReference("  ab12 ")).toBe("AB12");
  });
});

describe("wallet activity", () => {
  const row = (patch: Partial<WalletActivity>): WalletActivity => ({
    id: patch.id ?? "w",
    type: "wallet_reserved",
    orderId: null,
    at: "2026-11-18T01:00:00Z",
    balanceDeltaMinor: 0,
    availableDeltaMinor: 0,
    reservedDeltaMinor: 0,
    amountMinor: 0,
    ...patch,
  });

  it("folds a top-up and its decision into one row, newest first", () => {
    const rows = walletRows([
      row({ id: "p1", type: "topup_pending", reference: "REF1", amountMinor: 50_000, at: "2026-11-18T01:00:00Z" }),
      row({ id: "c1", type: "topup_confirmed", reference: "REF1", amountMinor: 50_000, availableDeltaMinor: 50_000, at: "2026-11-18T02:00:00Z" }),
      row({ id: "p2", type: "topup_pending", reference: "REF2", amountMinor: 20_000, at: "2026-11-18T03:00:00Z" }),
    ]);
    expect(rows.map((r) => [r.id, r.topup, r.deltaMinor, r.cashMinor])).toEqual([
      ["p2", "pending", null, 20_000],
      ["p1", "confirmed", 50_000, null],
    ]);
  });

  it("pairs a re-sent reference with its own decision, not an older one", () => {
    const rows = walletRows([
      row({ id: "p1", type: "topup_pending", reference: "R", amountMinor: 20_000, at: "2026-11-18T01:00:00Z" }),
      row({ id: "r1", type: "topup_rejected", reference: "R", amountMinor: 20_000, at: "2026-11-18T02:00:00Z" }),
      row({ id: "p2", type: "topup_pending", reference: "R", amountMinor: 20_000, at: "2026-11-18T03:00:00Z" }),
    ]);
    expect(rows.map((r) => [r.id, r.topup])).toEqual([
      ["p2", "pending"],
      ["p1", "rejected"],
    ]);
  });

  it("shows cash that changed hands as cash, not as a wallet change", () => {
    const [paid] = walletRows([row({ type: "shop_paid", amountMinor: 40_000 })]);
    expect(paid).toMatchObject({ title: "Paid the shop", deltaMinor: null, cashMinor: 40_000 });
    const [share] = walletRows([row({ type: "gridgo_share_debited", balanceDeltaMinor: -19_780, amountMinor: 19_780 })]);
    expect(share).toMatchObject({ deltaMinor: -19_780 });
    expect(deltaLabel(-19_780)).toBe("−₱197.80");
  });
});

describe("the no-show wait", () => {
  const start = Date.parse("2026-11-18T01:00:00Z");

  it("counts down from the server's wait and stops at zero", () => {
    expect(noShowSecondsLeft(null, 600, start)).toBeNull();
    expect(noShowSecondsLeft(start, 600, start)).toBe(600);
    expect(noShowSecondsLeft(start, 600, start + 599_500)).toBe(1);
    expect(noShowSecondsLeft(start, 600, start + 700_000)).toBe(0);
    expect(waitMinutesLabel(600)).toBe("10 minutes");
  });

  it("holds the report until the wait is over, a photo is saved and a reason is given", () => {
    expect(noShowReportBlockReason({ secondsLeft: null, reason: "", photo: "none" })).toMatch(/start the wait/);
    expect(noShowReportBlockReason({ secondsLeft: 5, reason: "x", photo: "stored" })).toMatch(/Stay at the door/);
    expect(noShowReportBlockReason({ secondsLeft: 0, reason: "x", photo: "sending" })).toMatch(/finish sending/);
    expect(noShowReportBlockReason({ secondsLeft: 0, reason: " ", photo: "stored" })).toMatch(/one sentence/);
    expect(noShowReportBlockReason({ secondsLeft: 0, reason: "No answer", photo: "stored" })).toBeNull();
  });
});
