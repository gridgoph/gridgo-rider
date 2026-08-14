import {
  clerkPublishableKey,
  readGridgoRole,
  resolveClerkPublishableKey,
  resolveGridgoRole,
  riderAccessError,
} from "@/lib/clerkAuth";

describe("Clerk rider role policy", () => {
  it("accepts only the rider role from public metadata", () => {
    expect(readGridgoRole({ gridgoRole: "rider" })).toBe("rider");
  });

  it("treats missing and unknown metadata as unassigned", () => {
    expect(readGridgoRole({})).toBeNull();
    expect(readGridgoRole({ gridgoRole: "driver" })).toBeNull();
    expect(readGridgoRole(null)).toBeNull();
  });

  it("gives an invitation recovery path when access is unassigned", () => {
    expect(riderAccessError(null)).toMatch(/Operations invite/i);
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
