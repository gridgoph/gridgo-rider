import { spacing } from "@/constants/theme";
import { sheetBottomPadding } from "@/components/SheetSurface";

describe("sheetBottomPadding", () => {
  it("does not count the home indicator twice on iOS", () => {
    // The native sheet already lays content out above the indicator; adding
    // the inset again left a tall empty panel under the last button.
    expect(sheetBottomPadding("ios", 34)).toBe(spacing.xl);
  });

  it("carries the inset itself where the content runs to the bottom edge", () => {
    expect(sheetBottomPadding("android", 24)).toBe(24 + spacing.xl);
    expect(sheetBottomPadding("web", 0)).toBe(spacing.xl);
  });
});
