import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { DEV_LOGIN } from "@/lib/devLogin";

/**
 * The sign-in screen is the first thing a hosted pilot build shows. An account
 * address rendered there — or merely present in the bundle behind a runtime
 * flag — publishes a way in to anyone who opens the app.
 *
 * The production-export assertion greps a real bundle; these run on every
 * `npm test` so a reintroduction is caught at review time and the export
 * assertion is the backstop rather than the first line of defence.
 */

const ROOT = resolve(__dirname, "../..");
const GUARDED_MODULE = resolve(ROOT, "lib/devLogin.ts");
/** No `g` flag — this is reused with `.test()`, which is stateful when global. */
const ACCOUNT_ADDRESS =
  /(?:[A-Za-z0-9._%+-]+@(?:gridgo\.(?:ph|local)|usep\.edu\.ph)\b|sgeto509@gmail\.com)/;
/** The pilot password from gridgo-api `DEMO_PASSWORD`. */
const PILOT_PASSWORD = "Ilovegridgo-0990";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    if (
      entry === "node_modules" ||
      entry === ".git" ||
      entry === "dist" ||
      entry === ".expo" ||
      entry === "coverage" ||
      entry === "docs"
    ) {
      return [];
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      // Tests may name accounts; they are never shipped.
      return entry === "__tests__" ? [] : sourceFiles(full);
    }
    return /\.(ts|tsx)$/.test(full) ? [full] : [];
  });
}

describe("dev login credential guard", () => {
  it("keeps every account address in the one build-time guarded module", () => {
    const offenders = sourceFiles(ROOT)
      .filter((file) => file !== GUARDED_MODULE)
      .filter((file) => ACCOUNT_ADDRESS.test(readFileSync(file, "utf8")))
      .map((file) => relative(ROOT, file));

    expect(offenders).toEqual([]);
  });

  it("keeps the pilot password only in the guarded module (outside tests)", () => {
    const offenders = sourceFiles(ROOT)
      .filter((file) => file !== GUARDED_MODULE)
      .filter((file) => readFileSync(file, "utf8").includes(PILOT_PASSWORD))
      .map((file) => relative(ROOT, file));

    expect(offenders).toEqual([]);
  });

  it("guards credentials with __DEV__, not a runtime flag", () => {
    const source = readFileSync(GUARDED_MODULE, "utf8");

    // Metro substitutes __DEV__ at bundle time, folding the dead branch away.
    // A runtime check (process.env.X, a settings toggle) still ships the
    // literals inside the JS a phone downloads.
    expect(source).toMatch(/__DEV__/);
    expect(source).toMatch(/:\s*null/);
    expect(source).not.toMatch(/process\.env\./);
  });

  it("prefills the official Clerk rider, not a @gridgo.ph fixture", () => {
    // Jest runs with __DEV__ true, so the live branch is what we assert on.
    expect(DEV_LOGIN).not.toBeNull();
    expect(DEV_LOGIN?.email).toBe("sgeto509@gmail.com");
    expect(DEV_LOGIN?.password).toBe(PILOT_PASSWORD);
  });
});
