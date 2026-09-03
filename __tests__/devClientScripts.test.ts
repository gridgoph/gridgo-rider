import { readFileSync } from "fs";
import { join } from "path";

/**
 * Day-to-day Metro is Expo Go. `android` still builds the native client
 * for push and custom-scheme work that Expo Go cannot do.
 */

const root = join(__dirname, "..");

type PackageJson = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
};

const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as PackageJson;

describe("development build scripts", () => {
  it("starts Metro for Expo Go on this app's port", () => {
    expect(packageJson.scripts?.start).toBe("expo start --go --port 8083");
  });

  it("installs the native client instead of opening Expo Go", () => {
    expect(packageJson.scripts?.android).toBe("expo run:android");
  });

  it("depends on expo-dev-client", () => {
    expect(packageJson.dependencies?.["expo-dev-client"]).toEqual(expect.any(String));
  });
});
