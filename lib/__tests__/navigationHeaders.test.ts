import { multiOriginPushedScreenOptions } from "@/lib/navigationHeaders";

describe("multiOriginPushedScreenOptions", () => {
  it("uses minimal back display so iOS never shows the (tabs) route name", () => {
    // React Navigation native-stack (Expo Router Stack): current non-deprecated
    // option that hides the previous-screen title on the back control.
    expect(multiOriginPushedScreenOptions.headerBackButtonDisplayMode).toBe(
      "minimal",
    );
  });
});
