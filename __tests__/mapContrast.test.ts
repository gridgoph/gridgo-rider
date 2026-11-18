import { readFileSync } from "node:fs";
import { join } from "node:path";

import { colors as palette } from "@/constants/theme";

/*
  The offer and trip surfaces are read at arm's length in sunlight, and their
  labels are 12–16px. Light `textMuted` on white is 4.29:1 and `warning` text
  2.65:1 — both under WCAG AA's 4.5:1 for that size (PR 207 review, P2-2). These
  surfaces use `textSecondary` for supporting words and say urgency in words
  and an icon, not in warning-coloured text. Muted stays allowed only for a
  disabled control's label, which AA exempts.
*/
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

it.each(["light", "dark"] as const)("textSecondary reaches AA on the %s sheet surface", (mode) => {
  expect(contrast(palette[mode].textSecondary, palette[mode].surface)).toBeGreaterThanOrEqual(4.5);
});

it("documents why muted and warning text are kept off these surfaces", () => {
  expect(contrast(palette.light.textMuted, palette.light.surface)).toBeLessThan(4.5);
  expect(contrast(palette.light.warning, palette.light.surface)).toBeLessThan(4.5);
});

const SURFACES = [
  "components/OfferSheet.tsx",
  "components/StopList.tsx",
  "components/MapStatusStrip.tsx",
  "components/TripPanel.tsx",
  "components/ReceiptSignature.tsx",
];

it.each(SURFACES)("%s sets no text in muted or warning colour", (file) => {
  const source = readFileSync(join(__dirname, "..", file), "utf8");
  expect(source).not.toMatch(/text-text-muted/);
  expect(source).not.toMatch(/text-warning/);
});
