import { radius } from "@/constants/theme";
import {
  confirmSheetContentStyle,
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

describe("confirmSheetContentStyle", () => {
  it("paints an iOS sheet surface down to the screen edge, under the home indicator", () => {
    // Unset, the strip below the content is the stack's canvas: a black band
    // under the panel in Dark (the captain's iPhone, "Clear these notifications?").
    expect(confirmSheetContentStyle("ios", "#141414")).toEqual({ backgroundColor: "#141414" });
  });

  it("leaves Android on the stack default", () => {
    expect(confirmSheetContentStyle("android", "#141414")).toBeUndefined();
  });
});
