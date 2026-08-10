import { radius } from "@/constants/theme";
import {
  confirmSheetScreenOptions,
  multiOriginPushedScreenOptions,
} from "@/lib/navigationHeaders";

describe("multiOriginPushedScreenOptions", () => {
  it("labels the back control 'Back' rather than leaving a bare chevron", () => {
    // Riders reported not finding the way back off pushed screens. The word is
    // set here, not inherited from the previous screen.
    expect(multiOriginPushedScreenOptions.headerBackTitle).toBe("Back");
  });

  it("never lets iOS fall back to the previous screen's title", () => {
    // `headerBackTitle` replaces the origin title outright, so the `(tabs)`
    // route group cannot reach the screen. "minimal" would hide the word too,
    // which is the behaviour this replaced.
    expect(multiOriginPushedScreenOptions.headerBackButtonDisplayMode).toBe("default");
    expect(multiOriginPushedScreenOptions.headerBackTitle).not.toMatch(/tabs/i);
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
