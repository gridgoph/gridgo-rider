import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

/**
 * The client's money reaches a rider in one place only: the acknowledgement
 * receipt on the delivery screen, at the door, during the handover
 * (gridgo-api `docs/LEGAL_API.md`, the receipt-only exception).
 *
 * Enumerated rather than sampled, like `backAffordance`: a receipt drawn on a
 * job card, a past job or an alert would be one import away, and would look
 * like a feature rather than a leak. So the whole source tree is read and each
 * receipt piece is held to the single file allowed to use it. Nothing that
 * persists — a store, the AsyncStorage session — may touch it, and nothing on
 * its path may log.
 */

const ROOTS = ["app", "components", "hooks", "lib", "store", "data"];
const SOURCE = /\.tsx?$/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return entry === "__tests__" ? [] : sourceFiles(path);
    return SOURCE.test(entry) ? [path] : [];
  });
}

const ROOT = join(__dirname, "..");
const files = ROOTS.flatMap((root) => sourceFiles(join(ROOT, root))).map((path) => ({
  path: relative(ROOT, path),
  text: readFileSync(path, "utf8"),
}));

const using = (pattern: RegExp) => files.filter((file) => pattern.test(file.text)).map((file) => file.path).sort();

describe("the receipt stays at the door", () => {
  it("is read and issued only by the door hook", () => {
    expect(using(/\b(getAcknowledgementReceipt|prepareAcknowledgementReceipt)\(/)).toEqual([
      "hooks/useAcknowledgementReceipt.ts",
      "lib/api.ts",
    ]);
  });

  it("is held only by the delivery step", () => {
    expect(using(/\buseAcknowledgementReceipt\(/)).toEqual([
      "app/trip/delivery.tsx",
      "hooks/useAcknowledgementReceipt.ts",
    ]);
  });

  it("is drawn only inside the door card", () => {
    expect(using(/<AcknowledgementReceipt\s/)).toEqual(["components/ReceiptReminder.tsx"]);
  });

  it("the door card is drawn only on the delivery step", () => {
    expect(using(/<ReceiptReminder\b/)).toEqual(["app/trip/delivery.tsx"]);
  });

  it("never reaches anything that persists", () => {
    const persisted = files.filter((file) => file.path.startsWith("store/") || /@react-native-async-storage\/async-storage/.test(file.text));
    expect(persisted.length).toBeGreaterThan(0);
    for (const file of persisted) {
      expect([file.path, /acknowledgementReceipt|AcknowledgementReceipt/i.test(file.text)]).toEqual([file.path, false]);
    }
  });

  it("never logs on its way to the screen", () => {
    for (const path of [
      "lib/acknowledgementReceipt.ts",
      "hooks/useAcknowledgementReceipt.ts",
      "components/AcknowledgementReceipt.tsx",
      "components/ReceiptReminder.tsx",
      "app/trip/delivery.tsx",
    ]) {
      const file = files.find((candidate) => candidate.path === path)!;
      expect([path, /\bconsole\./.test(file.text)]).toEqual([path, false]);
    }
  });
});
