import {
  resolveAuthRedirect,
  riderAuthHold,
  shouldInvalidateSessionOnStatus,
} from "@/lib/authGate";

describe("resolveAuthRedirect", () => {
  it("sends a signed-out rider out of the tab shell to welcome", () => {
    expect(resolveAuthRedirect(false, ["(tabs)", "active"])).toBe("/(auth)/welcome");
    expect(resolveAuthRedirect(false, ["(tabs)", "account"])).toBe("/(auth)/welcome");
    expect(resolveAuthRedirect(false, ["(tabs)", "offers"])).toBe("/(auth)/welcome");
  });

  it("sends a signed-out rider off other protected roots", () => {
    expect(resolveAuthRedirect(false, ["design-system"])).toBe("/(auth)/welcome");
    expect(resolveAuthRedirect(false, ["settings"])).toBe("/(auth)/welcome");
  });

  it("does not bounce a signed-out rider already in the auth flow", () => {
    expect(resolveAuthRedirect(false, ["(auth)", "login"])).toBeNull();
  });

  it("does not dump onto Welcome while Google is still joining", () => {
    expect(resolveAuthRedirect(false, ["(tabs)", "active"], false, false, "in")).toBeNull();
    expect(resolveAuthRedirect(false, ["sso-callback"], false, false, "in")).toBeNull();
  });

  it("takes a signing-out rider to Welcome, which shows Signing you out", () => {
    expect(resolveAuthRedirect(false, ["(tabs)", "account"], false, false, "out")).toBe(
      "/(auth)/welcome",
    );
    expect(resolveAuthRedirect(false, ["(auth)", "welcome"], false, false, "out")).toBeNull();
  });

  it("holds Signing you in while Clerk is restoring or Google is returning", () => {
    expect(
      riderAuthHold({
        hasUser: false,
        sessionWait: null,
        loading: false,
        clerkLoaded: false,
        clerkSignedIn: false,
        googleReturn: false,
      }),
    ).toBe("in");
    expect(
      riderAuthHold({
        hasUser: false,
        sessionWait: null,
        loading: true,
        clerkLoaded: true,
        clerkSignedIn: true,
        googleReturn: false,
      }),
    ).toBe("in");
    expect(
      riderAuthHold({
        hasUser: false,
        sessionWait: null,
        loading: false,
        clerkLoaded: true,
        clerkSignedIn: false,
        googleReturn: true,
      }),
    ).toBe("in");
    expect(
      riderAuthHold({
        hasUser: false,
        sessionWait: null,
        loading: false,
        clerkLoaded: true,
        clerkSignedIn: false,
        googleReturn: false,
      }),
    ).toBeNull();
    expect(
      riderAuthHold({
        hasUser: true,
        sessionWait: "in",
        loading: true,
        clerkLoaded: true,
        clerkSignedIn: true,
        googleReturn: true,
      }),
    ).toBe("in");
    expect(
      riderAuthHold({
        hasUser: false,
        sessionWait: "out",
        loading: false,
        clerkLoaded: true,
        clerkSignedIn: true,
        googleReturn: false,
        signedOut: true,
      }),
    ).toBe("out");
    expect(
      riderAuthHold({
        hasUser: false,
        sessionWait: null,
        loading: false,
        clerkLoaded: true,
        clerkSignedIn: true,
        googleReturn: false,
        signedOut: true,
      }),
    ).toBeNull();
  });

  it("does not keep Signing you in after a signed-in adopt has finished or timed out", () => {
    // Clerk restored a session, GRIDGO has no rider, and /auth/me is not in
    // flight: the old clerkSignedIn-only hold spun here forever.
    expect(
      riderAuthHold({
        hasUser: false,
        sessionWait: null,
        loading: false,
        clerkLoaded: true,
        clerkSignedIn: true,
        googleReturn: false,
      }),
    ).toBeNull();
    expect(
      riderAuthHold({
        hasUser: false,
        sessionWait: "in",
        loading: false,
        clerkLoaded: true,
        clerkSignedIn: true,
        googleReturn: false,
        hasError: true,
      }),
    ).toBeNull();
    expect(
      riderAuthHold({
        hasUser: false,
        sessionWait: "in",
        loading: false,
        clerkLoaded: true,
        clerkSignedIn: true,
        googleReturn: false,
        needsApplication: true,
      }),
    ).toBeNull();
  });

  it("sends an unassigned Clerk identity to apply even while Signing you in", () => {
    expect(resolveAuthRedirect(false, ["(auth)", "welcome"], false, true, "in")).toBe(
      "/(auth)/signup",
    );
  });

  it("leaves public routes alone when signed out", () => {
    expect(resolveAuthRedirect(false, ["onboarding"])).toBeNull();
    // index has no group root until navigation settles — wait.
    expect(resolveAuthRedirect(false, [])).toBeNull();
  });

  it("returns a Clerk callback failure to login even while Signing you in", () => {
    expect(resolveAuthRedirect(false, ["sso-callback"], true, false, "in")).toBe(
      "/(auth)/login",
    );
    expect(
      riderAuthHold({
        hasUser: false,
        sessionWait: "in",
        loading: false,
        clerkLoaded: true,
        clerkSignedIn: true,
        googleReturn: true,
        hasError: true,
      }),
    ).toBeNull();
  });

  it("returns a Clerk callback failure to login where its message is visible", () => {
    expect(resolveAuthRedirect(false, ["sso-callback"], true)).toBe(
      "/(auth)/login",
    );
    expect(resolveAuthRedirect(false, ["(auth)", "welcome"], true)).toBe(
      "/(auth)/login",
    );
    expect(resolveAuthRedirect(false, ["(auth)", "login"], true)).toBeNull();
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
