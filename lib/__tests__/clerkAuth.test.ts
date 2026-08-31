import {
  awaitClerkSessionToken,
  clerkErrorMessage,
  clerkPublishableKey,
  readGridgoRole,
  resolveClerkPublishableKey,
  resolveGridgoRole,
  riderAccessError,
} from "@/lib/clerkAuth";

describe("clerkErrorMessage", () => {
  it("prefers Clerk's structured copy", () => {
    expect(
      clerkErrorMessage(
        { errors: [{ longMessage: "Password is incorrect." }] },
        "Wrong email or password.",
      ),
    ).toBe("Password is incorrect.");
  });

  it("does not hide a thrown Error behind the password fallback", () => {
    expect(
      clerkErrorMessage(new Error("Additional verification is required."), "Wrong email or password."),
    ).toBe("Additional verification is required.");
  });
});

describe("Clerk rider role policy", () => {
  it("accepts only the rider role from public metadata", () => {
    expect(readGridgoRole({ gridgoRole: "rider" })).toBe("rider");
  });

  it("treats missing and unknown metadata as unassigned", () => {
    expect(readGridgoRole({})).toBeNull();
    expect(readGridgoRole({ gridgoRole: "driver" })).toBeNull();
    expect(readGridgoRole(null)).toBeNull();
  });

  it("defers an unassigned account to /auth/me instead of rejecting it", () => {
    // Enrollment writes a GRIDGO membership, not Clerk role metadata, so an
    // approved rider and a brand-new applicant both arrive with no role.
    // Rejecting here locked riders out and blocked self-signup.
    expect(riderAccessError(null)).toBeNull();
  });

  it("names the correct app for a known role mismatch", () => {
    expect(riderAccessError("client")).toMatch(/GRIDGO Client app/);
    expect(riderAccessError("supplier")).toMatch(/GRIDGO Supplier app/);
  });

  it("returns no access error for a rider", () => {
    expect(riderAccessError("rider")).toBeNull();
  });

  it("fails closed while metadata and a cached claim disagree", () => {
    expect(resolveGridgoRole("rider", "client")).toBe("client");
    expect(resolveGridgoRole("supplier", "rider")).toBe("supplier");
    expect(resolveGridgoRole(null, "rider")).toBe("rider");
  });
});

describe("Clerk publishable key policy", () => {
  it("allows a development key only in development", () => {
    expect(clerkPublishableKey("pk_test_example", true)).toBe("pk_test_example");
    expect(() => clerkPublishableKey("pk_test_example", false)).toThrow(/pk_live_/);
  });

  it("requires an explicit live key in production", () => {
    expect(clerkPublishableKey("pk_live_example", false)).toBe("pk_live_example");
    expect(() => clerkPublishableKey(undefined, false)).toThrow(/missing or invalid/i);
  });

  it("prefers the Expo extra value and falls back to the statically read env", () => {
    const original = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
    process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_live_envFallback";
    try {
      expect(resolveClerkPublishableKey("pk_live_bakedExtra", false)).toBe(
        "pk_live_bakedExtra",
      );
      expect(resolveClerkPublishableKey(undefined, false)).toBe("pk_live_envFallback");
    } finally {
      if (original === undefined) delete process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
      else process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = original;
    }
  });
});

describe("awaitClerkSessionToken", () => {
  it("returns a token when Clerk answers", async () => {
    await expect(awaitClerkSessionToken(async () => "jwt", 1, 0)).resolves.toBe("jwt");
  });

  it("gives up when Clerk never returns a token", async () => {
    jest.useFakeTimers();
    try {
      const hung = () => new Promise<string>(() => {});
      const pending = awaitClerkSessionToken(hung, 1, 0);
      await jest.advanceTimersByTimeAsync(2500);
      await expect(pending).resolves.toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
