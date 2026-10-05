import { ApiError } from "@/lib/api";
import {
  handoverBlockReason,
  handoverCodeGroups,
  isHandoverRefusal,
  riderChecksHandoverCode,
  spokenHandoverCode,
} from "@/lib/handoverCode";

describe("handover code rules", () => {
  it("splits the code into two groups of three and spells it digit by digit", () => {
    expect(handoverCodeGroups("482913")).toEqual(["482", "913"]);
    expect(handoverCodeGroups("007100")).toEqual(["007", "100"]);
    expect(spokenHandoverCode("007100")).toBe("0 0 7 1 0 0");
  });

  it("asks for a code at a client's door, never at GRIDGO Office", () => {
    expect(riderChecksHandoverCode({ fulfillmentMode: "delivery" })).toBe(true);
    expect(riderChecksHandoverCode({ fulfillmentMode: null })).toBe(true);
    expect(riderChecksHandoverCode({ fulfillmentMode: "pickup" })).toBe(false);
  });

  it("only a match, or no code at all, clears the gate", () => {
    const ready = { status: "ready", otp: "482913" } as const;
    expect(handoverBlockReason({ status: "none" }, "unchecked", false)).toBeNull();
    expect(handoverBlockReason(ready, "match", false)).toBeNull();
    expect(handoverBlockReason(ready, "unchecked", false)).toMatch(/check it against yours/);
    expect(handoverBlockReason(ready, "mismatch", false)).toMatch(/escalate to Operations/);
    expect(handoverBlockReason(ready, "mismatch", true)).toMatch(/Operations has been alerted/);
    expect(handoverBlockReason({ status: "loading" }, "unchecked", false)).not.toBeNull();
    expect(handoverBlockReason({ status: "error", message: "x" }, "match", false)).not.toBeNull();
  });

  it("recognises the server's refusals of the code and nothing else", () => {
    expect(isHandoverRefusal(new ApiError(409, { error: "handover_otp_mismatch" }))).toBe(true);
    expect(isHandoverRefusal(new ApiError(429, { error: "handover_attempts_exceeded" }))).toBe(true);
    expect(isHandoverRefusal(new ApiError(409, { error: "balance_not_confirmed" }))).toBe(false);
    expect(isHandoverRefusal(new Error("offline"))).toBe(false);
  });
});
