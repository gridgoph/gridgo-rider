import { ApiError, apiErrorMessage, isInternalCode } from "@/lib/api";

const FALLBACK = "That did not go through. Pull down and try again.";

describe("no internal identifier reaches a rider's screen", () => {
  it("recognises codes, status lines, and bare tokens as internal", () => {
    expect(isInternalCode("not_offerable")).toBe(true);
    expect(isInternalCode("storage-initializing")).toBe(true);
    expect(isInternalCode("INVALID_STATE")).toBe(true);
    expect(isInternalCode("HTTP 503")).toBe(true);
    expect(isInternalCode("forbidden")).toBe(true);
    expect(isInternalCode("   ")).toBe(true);
  });

  it("leaves a real sentence alone", () => {
    expect(isInternalCode("Your pickup code has expired.")).toBe(false);
    expect(isInternalCode("The supplier already handed this job to someone else")).toBe(false);
  });

  it("translates the codes the API actually returns", () => {
    expect(apiErrorMessage(new ApiError(409, { error: "not_offerable" }), FALLBACK)).toMatch(
      /another rider took this job/i,
    );
    expect(apiErrorMessage(new ApiError(404, { error: "order_not_found" }), FALLBACK)).toMatch(
      /open offers/i,
    );
    expect(apiErrorMessage(new ApiError(403, { error: "forbidden" }), FALLBACK)).toMatch(
      /not assigned to you/i,
    );
    expect(
      apiErrorMessage(new ApiError(503, { error: "minio_unavailable" }), FALLBACK),
    ).toMatch(/photo storage is offline/i);
    expect(
      apiErrorMessage(new ApiError(403, { error: "invitation_required" }), FALLBACK),
    ).toMatch(/invitation/i);
    expect(
      apiErrorMessage(new ApiError(400, { error: "invalid_rider_profile" }), FALLBACK),
    ).toMatch(/vehicle/i);
  });

  it("falls back to the caller's sentence for an unmapped code", () => {
    // This is the regression: the old code returned the raw string, so a rider
    // saw "cod_already_collected" on the screen.
    const message = apiErrorMessage(
      new ApiError(409, { error: "cod_already_collected" }),
      FALLBACK,
    );
    expect(message).toBe(FALLBACK);
    expect(message).not.toContain("_");
  });

  it("never prints an HTTP status line", () => {
    expect(apiErrorMessage(new ApiError(418, "teapot"), FALLBACK)).not.toMatch(/HTTP/);
  });

  it("says a server failure is the server's, without a code", () => {
    const message = apiErrorMessage(new ApiError(500, { error: "internal_error" }), FALLBACK);
    expect(message).toContain(FALLBACK);
    expect(message).toMatch(/tell operations/i);
    expect(message).not.toContain("internal_error");
  });

  it("passes through a human message the server did write", () => {
    expect(
      apiErrorMessage(new ApiError(422, { error: "The pickup code does not match." }), FALLBACK),
    ).toBe("The pickup code does not match.");
  });

  it("uses the fallback for a bare Error with a code-shaped message", () => {
    expect(apiErrorMessage(new Error("network_request_failed"), FALLBACK)).toBe(FALLBACK);
    expect(apiErrorMessage(new Error("Network request failed"), FALLBACK)).toBe(
      "Network request failed",
    );
  });
});
