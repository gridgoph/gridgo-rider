import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ConfirmModal } from "@/components/ConfirmModal";

function renderModal(ui: ReactElement) {
  return render(ui, {
    wrapper: ({ children }) => (
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
        }}
      >
        {children}
      </SafeAreaProvider>
    ),
  });
}

describe("Sign out confirmation", () => {
  it("is a Modal dialog, not a stacked route on Account", () => {
    const source = require("fs").readFileSync(
      require("path").join(__dirname, "../app/(tabs)/account.tsx"),
      "utf8",
    ) as string;
    expect(source).toContain("ConfirmModal");
    expect(source).not.toContain('router.push("/sign-out")');
    expect(source).toContain("from \"react-native\"");
  });

  it("asks a named question over a dimmed Account", async () => {
    const onCancel = jest.fn();
    await renderModal(
      <ConfirmModal
        visible
        question="Sign out of GRIDGO?"
        body="Offers stop arriving on this phone. Sign in again when you are ready to ride."
        confirmLabel="Sign out"
        cancelLabel="Stay signed in"
        onConfirm={jest.fn()}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText("Sign out of GRIDGO?")).toBeTruthy();
    expect(screen.getByText(/Offers stop arriving/)).toBeTruthy();
    expect(screen.queryByText(/Are you sure/i)).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByText("Stay signed in"));
    });
    expect(onCancel).toHaveBeenCalled();
  });

  it("signs out only after confirm", async () => {
    const onConfirm = jest.fn();
    await renderModal(
      <ConfirmModal
        visible
        question="Sign out of GRIDGO?"
        body="Offers stop arriving on this phone."
        confirmLabel="Sign out"
        cancelLabel="Stay signed in"
        onConfirm={onConfirm}
        onCancel={jest.fn()}
      />,
    );

    await act(async () => {
      fireEvent.press(screen.getByText("Sign out"));
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe("confirmation actions sit as a pair", () => {
  it("gives Stay signed in the same large target as Sign out", () => {
    const source = require("fs").readFileSync(
      require("path").join(__dirname, "../components/ConfirmSheetBody.tsx"),
      "utf8",
    ) as string;
    expect(source).toMatch(/PrimaryButton[\s\S]*size="large"/);
    expect(source).toMatch(/SecondaryButton[\s\S]*size="large"/);
  });
});
