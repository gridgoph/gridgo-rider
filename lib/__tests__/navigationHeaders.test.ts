import { radius } from "@/constants/theme";
import {
  confirmSheetScreenOptions,
  multiOriginPushedScreenOptions,
} from "@/lib/navigationHeaders";

describe("multiOriginPushedScreenOptions", () => {
  it("draws the bare chevron, with no word beside it", () => {
    // The captain's call: the chevron alone, as iOS does inside a flow. An
    // earlier build set headerBackTitle: "Back"; that has been overruled.
    expect(multiOriginPushedScreenOptions.headerBackButtonDisplayMode).toBe("minimal");
  });

  it("never lets iOS fall back to the previous screen's title", () => {
    // This is the protection the label was also providing, and it must survive
    // dropping the label: with no back title at all there is nothing for the
    // `(tabs)` route group to leak into.
    expect(multiOriginPushedScreenOptions).not.toHaveProperty("headerBackTitle");
  });
});

describe("confirmSheetScreenOptions", () => {
  it("takes its corner radius from the token scale, not a literal", () => {
    expect(confirmSheetScreenOptions.sheetCornerRadius).toBe(radius.xl);
  });

  it("sizes the sheet to its contents", () => {
    expect(confirmSheetScreenOptions.sheetAllowedDetents).toBe("fitToContents");
  });
});
