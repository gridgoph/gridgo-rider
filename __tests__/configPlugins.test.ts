import { readFileSync } from "fs";
import { join } from "path";

/**
 * Every module named in `expo.plugins` must be a real dependency.
 *
 * A config plugin is resolved from `node_modules` by name, and that resolution
 * happens during config evaluation — `expo start` and native builds — not during
 * bundling. So a plugin entry naming a package that is no longer installed kills
 * the app at launch with `PluginError: Failed to resolve plugin for module …`
 * while every other check stays green: Metro never reads `expo.plugins`, so
 * tests pass and both platform bundles build.
 *
 * That is exactly how a stale `@react-native-community/datetimepicker` entry
 * survived the v2 rebuild that dropped the dependency, and it is the same shape
 * as the blank-screen bug — a green suite that never exercised the failing path.
 *
 * The real check is `npx expo config --type public`, which needs an install and
 * a subprocess. This is the cheap hermetic half: names in, dependencies out.
 */

const root = join(__dirname, "..");

type AppConfig = { expo?: { plugins?: unknown } };
type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const appJson = JSON.parse(readFileSync(join(root, "app.json"), "utf8")) as AppConfig;
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as PackageJson;

const declared = new Set([
  ...Object.keys(packageJson.dependencies ?? {}),
  ...Object.keys(packageJson.devDependencies ?? {}),
]);

/** `["expo-splash-screen", { … }]` and `"expo-router"` both name a module. */
function moduleName(entry: unknown): string | null {
  const value = Array.isArray(entry) ? entry[0] : entry;
  return typeof value === "string" ? value : null;
}

/** `@scope/pkg/plugin` → `@scope/pkg`; `pkg/app.plugin.js` → `pkg`. */
function packageName(module: string): string {
  const parts = module.split("/");
  return module.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

const plugins = Array.isArray(appJson.expo?.plugins) ? appJson.expo.plugins : [];

describe("expo.plugins names only packages this app installs", () => {
  it("finds plugins to check", () => {
    expect(plugins.length).toBeGreaterThan(0);
  });

  it("has a dependency for every plugin module", () => {
    const missing = plugins
      .map(moduleName)
      .filter((module): module is string => module !== null)
      // A relative path is a plugin file in this repo, not a package.
      .filter((module) => !module.startsWith("."))
      .map(packageName)
      .filter((name) => !declared.has(name));

    expect(missing).toEqual([]);
  });
});
