import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Prove a production bundle ships neither the rider demo address nor its
 * password.
 *
 * `lib/devLogin.ts` argues that `__DEV__` folds the literals away. This test
 * builds a real production export and greps the output — the only proof that
 * matters, and the kind of guard that rots if it is only a one-off shell grep.
 *
 * Web is the cheapest platform that still runs Metro with `dev: false` and
 * minification. Android/iOS Hermes bytecode is covered by the same Metro
 * substitution of `__DEV__`; we assert against the readable JS export so a
 * failure names the string that leaked.
 */

const ROOT = join(__dirname, "..");
const ACCOUNT_ADDRESS = /[A-Za-z0-9._%+-]+@gridgo\.(?:ph|local)\b/g;
const PILOT_PASSWORD = "Ilovegridgo-0990";
/** Retired shipped password — must not reappear either. */
const LEGACY_DEMO = '"demo"';

const SCANNED_EXTENSIONS = [".js", ".html", ".json", ".txt", ".css"];

function filesIn(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return filesIn(full);
    return SCANNED_EXTENSIONS.some((ext) => full.endsWith(ext)) ? [full] : [];
  });
}

describe("production bundle ships no demo credentials", () => {
  // A real Metro export is slower than a unit test; still cheaper than a
  // silent hosted leak. Bound it generously so a cold cache does not flake.
  jest.setTimeout(10 * 60 * 1000);

  it("drops the rider address and pilot password from a production export", () => {
    const outDir = mkdtempSync(join(tmpdir(), "gridgo-rider-prod-assert-"));

    try {
      execFileSync(
        "npx",
        [
          "expo",
          "export",
          "--platform",
          "web",
          "--output-dir",
          outDir,
          // Production is the default for export; refuse the --dev path.
        ],
        {
          cwd: ROOT,
          env: {
            ...process.env,
            NODE_ENV: "production",
            EXPO_NO_TELEMETRY: "1",
            CI: "1",
          },
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 9 * 60 * 1000,
        },
      );

      const files = filesIn(outDir);
      expect(files.length).toBeGreaterThan(0);

      const addressHits: string[] = [];
      const passwordHits: string[] = [];

      for (const file of files) {
        const body = readFileSync(file, "utf8");
        const addresses = body.match(ACCOUNT_ADDRESS);
        if (addresses) {
          addressHits.push(`${file}: ${[...new Set(addresses)].join(", ")}`);
        }
        if (body.includes(PILOT_PASSWORD)) {
          passwordHits.push(file);
        }
        // A bare JSON "demo" string as a password value is the retired
        // credential shape. Do not over-match the English word "demo" in copy
        // (e.g. "demo server"); require the quoted form used as a literal.
        if (body.includes(LEGACY_DEMO) && /password["']?\s*:\s*["']demo["']/.test(body)) {
          passwordHits.push(`${file}: legacy demo password`);
        }
      }

      expect(addressHits).toEqual([]);
      expect(passwordHits).toEqual([]);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
