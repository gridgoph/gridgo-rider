import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");

function source(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

describe("invitation-first rider onboarding", () => {
  it("configures Clerk and SecureStore through Expo", () => {
    const appJson = JSON.parse(source("app.json")) as {
      expo: { plugins: Array<string | [string, unknown]> };
    };
    const pluginNames = appJson.expo.plugins.map((plugin) =>
      typeof plugin === "string" ? plugin : plugin[0],
    );

    expect(pluginNames).toEqual(expect.arrayContaining(["@clerk/expo", "expo-secure-store"]));
  });

  it("removes the public rider sign-up screen", () => {
    expect(existsSync(join(ROOT, "app/(auth)/signup.tsx"))).toBe(false);
  });

  it("accepts account creation only from Clerk's invitation ticket", () => {
    const invitation = source("app/(auth)/accept-invitation.tsx");
    expect(invitation).toContain("__clerk_ticket");
    expect(invitation).toContain("signUp.ticket");
    expect(invitation).toContain('nativeID="clerk-captcha"');
  });

  it("does not call the legacy rider signup route from an auth screen", () => {
    const authFiles = [
      "app/(auth)/welcome.tsx",
      "app/(auth)/login.tsx",
      "app/(auth)/accept-invitation.tsx",
      "app/(auth)/reset-password.tsx",
    ];
    expect(authFiles.map(source).join("\n")).not.toContain("signupRider");
    expect(authFiles.map(source).join("\n")).not.toContain("/auth/signup");
  });
});
