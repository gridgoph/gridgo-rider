import {
  resolveAuthRedirect,
  shouldInvalidateSessionOnStatus,
} from "@/lib/authGate";

describe("resolveAuthRedirect", () => {
  it("sends a signed-out rider out of the tab shell to login", () => {
    expect(resolveAuthRedirect(false, ["(tabs)", "active"])).toBe("/(auth)/login");
    expect(resolveAuthRedirect(false, ["(tabs)", "account"])).toBe("/(auth)/login");
    expect(resolveAuthRedirect(false, ["(tabs)", "offers"])).toBe("/(auth)/login");
  });

  it("sends a signed-out rider off other protected roots", () => {
    expect(resolveAuthRedirect(false, ["design-system"])).toBe("/(auth)/login");
  });

  it("does not bounce a signed-out rider already on login", () => {
    expect(resolveAuthRedirect(false, ["(auth)", "login"])).toBeNull();
  });

  it("leaves public routes alone when signed out", () => {
    expect(resolveAuthRedirect(false, ["onboarding"])).toBeNull();
    // index has no group root until navigation settles — wait.
    expect(resolveAuthRedirect(false, [])).toBeNull();
  });

  it("sends a signed-in rider past login into Active", () => {
    expect(resolveAuthRedirect(true, ["(auth)", "login"])).toBe("/(tabs)/active");
  });

  it("does not redirect a signed-in rider already in tabs", () => {
    expect(resolveAuthRedirect(true, ["(tabs)", "active"])).toBeNull();
    expect(resolveAuthRedirect(true, ["(tabs)", "offers"])).toBeNull();
  });

  it("does not redirect a signed-in rider on public routes", () => {
    expect(resolveAuthRedirect(true, ["onboarding"])).toBeNull();
    expect(resolveAuthRedirect(true, ["design-system"])).toBeNull();
  });
});

describe("shouldInvalidateSessionOnStatus", () => {
  it("invalidates on 401 for authenticated domain calls", () => {
    expect(shouldInvalidateSessionOnStatus(401, "/orders")).toBe(true);
    expect(shouldInvalidateSessionOnStatus(401, "/dispatch/offers")).toBe(true);
    expect(shouldInvalidateSessionOnStatus(401, "/auth/me")).toBe(true);
  });

  it("does not treat wrong-password login 401 as session expiry", () => {
    expect(shouldInvalidateSessionOnStatus(401, "/auth/login")).toBe(false);
  });

  it("ignores non-401 failures", () => {
    expect(shouldInvalidateSessionOnStatus(403, "/orders")).toBe(false);
    expect(shouldInvalidateSessionOnStatus(500, "/orders")).toBe(false);
    expect(shouldInvalidateSessionOnStatus(200, "/orders")).toBe(false);
  });
});
