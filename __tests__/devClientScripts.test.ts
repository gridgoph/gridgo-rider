import { readFileSync } from "fs";
import { join } from "path";

/**
 * Local Android work is a USB development build, not Expo Go.
 *
 * The LAN Expo Go packager is closed. `start` must target a dev client and
 * `android` must compile and install one — otherwise a later agent types
 * `npm start` / `npm run android` and lands back in the Go workflow.
 */

const root = join(__dirname, "..");

type PackageJson = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
};

const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as PackageJson;

describe("development build scripts", () => {
  it("starts Metro for a development client, not Expo Go", () => {
    expect(packageJson.scripts?.start).toBe("expo start --dev-client");
  });

  it("installs the native client instead of opening Expo Go", () => {
    expect(packageJson.scripts?.android).toBe("expo run:android");
  });

  it("depends on expo-dev-client", () => {
    expect(packageJson.dependencies?.["expo-dev-client"]).toEqual(expect.any(String));
  });
});
