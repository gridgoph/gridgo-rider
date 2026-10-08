import { ApiError } from "@/lib/api";
import { handoverBlockReason, handoverRefusal, riderChecksHandoverCode } from "@/lib/handoverCode";

describe("spoken handover code rules", () => {
  it("asks at the client's door, never GRIDGO Office", () => {
    expect(riderChecksHandoverCode({ fulfillmentMode: "delivery" })).toBe(true);
    expect(riderChecksHandoverCode({ fulfillmentMode: null })).toBe(true);
    expect(riderChecksHandoverCode({ fulfillmentMode: "pickup" })).toBe(false);
  });

  it("requires six digits only when the server requires a code", () => {
    expect(handoverBlockReason({ status: "none" }, "")).toBeNull();
    expect(handoverBlockReason({ status: "ready" }, "012345")).toBeNull();
    for (const otp of ["", "12345", "1234567", "abcdef", " 12345"]) {
      expect(handoverBlockReason({ status: "ready" }, otp)).toMatch(/six-digit/);
    }
    expect(handoverBlockReason({ status: "loading" }, "012345")).not.toBeNull();
    expect(handoverBlockReason({ status: "error", message: "offline" }, "012345")).not.toBeNull();
  });

  it("distinguishes mismatch and lockout, ignoring unrelated errors", () => {
    expect(handoverRefusal(new ApiError(409, { error: "handover_otp_mismatch" }))).toEqual({
      kind: "mismatch", message: "That code does not match.", retryAtMs: null,
    });
    const retryAfter = "2026-10-08T09:15:00.000Z";
    expect(handoverRefusal(new ApiError(429, { error: "handover_attempts_exceeded", retryAfter })))
      .toMatchObject({ kind: "locked", retryAtMs: Date.parse(retryAfter) });
    expect(handoverRefusal(new ApiError(409, { error: "balance_not_confirmed" }))).toBeNull();
    expect(handoverRefusal(new Error("offline"))).toBeNull();
  });

  it("does not invent counts or a retry time when metadata is absent or malformed", () => {
    for (const remainingAttempts of [undefined, -1, 1.5, "3"]) {
      expect(handoverRefusal(new ApiError(409, { error: "handover_otp_mismatch", remainingAttempts }))?.message)
        .toBe("That code does not match.");
    }
    expect(handoverRefusal(new ApiError(409, { error: "handover_otp_mismatch", remainingAttempts: 1 }))?.message)
      .toContain("1 try remaining");
    const locked = handoverRefusal(new ApiError(429, { error: "handover_attempts_exceeded", retryAfter: "bad" }));
    expect(locked?.retryAtMs).toBeNull();
    expect(locked?.message).not.toContain("Invalid Date");
  });
});
