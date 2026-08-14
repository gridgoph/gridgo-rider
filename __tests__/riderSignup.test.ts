import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");

function source(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

describe("public rider self-signup", () => {
  it("configures Clerk and SecureStore through Expo", () => {
    const appJson = JSON.parse(source("app.json")) as {
      expo: { plugins: Array<string | [string, unknown]> };
    };
    const pluginNames = appJson.expo.plugins.map((plugin) =>
      typeof plugin === "string" ? plugin : plugin[0],
    );

    expect(pluginNames).toEqual(expect.arrayContaining(["@clerk/expo", "expo-secure-store"]));
  });

  it("ships a public apply screen", () => {
    expect(existsSync(join(ROOT, "app/(auth)/signup.tsx"))).toBe(true);
  });

  it("makes public apply the welcome primary, with sign-in beside it", () => {
    const welcome = source("app/(auth)/welcome.tsx");
    expect(welcome).toContain('label="Sign up"');
    expect(welcome).toContain('label="Sign in"');
    expect(welcome).toContain("/(auth)/signup");
    expect(welcome).toContain("/(auth)/login");
    expect(welcome).toMatch(/approve/i);
    expect(welcome).not.toMatch(/Client accounts/i);
  });

  it("keeps invitation accept as a secondary path", () => {
    const welcome = source("app/(auth)/welcome.tsx");
    const invitation = source("app/(auth)/accept-invitation.tsx");
    expect(welcome).toContain("/(auth)/accept-invitation");
    expect(welcome).not.toContain('label="Accept an invitation"');
    expect(invitation).toContain("__clerk_ticket");
    expect(invitation).toContain("signUp.ticket");
  });

  it("sends the legacy rider signup body from the apply screen", () => {
    const signup = source("app/(auth)/signup.tsx");
    const api = source("lib/api.ts");
    expect(signup).toContain("signup(");
    expect(api).toContain("signupRider");
    expect(api).toContain("/auth/signup");
    expect(api).toContain('role: "rider"');
  });

  it("does not put Turn on alerts on login", () => {
    const login = source("app/(auth)/login.tsx");
    expect(login).not.toContain("PushEnableCard");
  });

  it("uses the native stack header for auth screens, not a custom back control", () => {
    expect(existsSync(join(ROOT, "components/AuthBackButton.tsx"))).toBe(false);
    const layout = source("app/_layout.tsx");
    for (const route of [
      "(auth)/signup",
      "(auth)/login",
      "(auth)/accept-invitation",
      "(auth)/reset-password",
    ]) {
      expect(layout).toContain(`name="${route}"`);
    }
    expect(layout).toMatch(/name="\(auth\)\/signup"[\s\S]*?multiOriginPushedScreenOptions/);
    expect(layout).toMatch(/name="\(auth\)\/login"[\s\S]*?multiOriginPushedScreenOptions/);
    const authFiles = [
      "app/(auth)/signup.tsx",
      "app/(auth)/login.tsx",
      "app/(auth)/accept-invitation.tsx",
      "app/(auth)/reset-password.tsx",
    ];
    expect(authFiles.map(source).join("\n")).not.toContain("AuthBackButton");
  });

  it("does not statically import expo-notifications on the launch path", () => {
    // A static import evaluates the native module. Expo Go Android SDK 53
    // throws from that evaluation; require() inside try/catch does not.
    const launchFiles = [
      "store/push.ts",
      "hooks/usePushNotifications.ts",
      "store/session.ts",
      "app/_layout.tsx",
    ];
    for (const file of launchFiles) {
      expect(source(file)).not.toMatch(
        /import\s+\*\s+as\s+Notifications\s+from\s+["']expo-notifications["']/,
      );
    }
    expect(source("lib/expoNotifications.ts")).toContain("require(\"expo-notifications\")");
  });
});
