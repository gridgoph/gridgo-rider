jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn() },
}));

import { router } from "expo-router";
import { askConfirm, settleConfirm, useSheets } from "@/store/sheets";

const request = {
  question: "Sign out of GRIDGO on this phone?",
  consequence: "Offers stop arriving on this phone.",
  confirmLabel: "Sign out",
  cancelLabel: "Stay signed in",
  destructive: true,
};

describe("askConfirm", () => {
  afterEach(() => {
    useSheets.setState({ confirm: null });
  });

  it("opens the sheet and only then hands the answer back", async () => {
    const pending = askConfirm(request);

    expect(router.push).toHaveBeenCalledWith("/confirm");
    expect(useSheets.getState().confirm?.request.confirmLabel).toBe("Sign out");

    settleConfirm(true);
    await expect(pending).resolves.toBe(true);
  });

  it("treats a second settle as a no-op so unmount cannot flip a yes", async () => {
    const pending = askConfirm(request);
    settleConfirm(true);
    settleConfirm(false);
    await expect(pending).resolves.toBe(true);
  });
});
