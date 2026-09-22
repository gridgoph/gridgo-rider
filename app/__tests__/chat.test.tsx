import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import RiderChatScreen from "@/app/chat";

const mockGetSupportChatMe = jest.fn(async () => ({ thread: null, messages: [] }));
const mockSendSupportChatMessage = jest.fn();

jest.mock("react-native-keyboard-controller", () => {
  const { View } = require("react-native");
  return { KeyboardAvoidingView: View };
});

jest.mock("@/lib/api", () => ({
  getSupportChatMe: () => mockGetSupportChatMe(),
  sendSupportChatMessage: (...args: unknown[]) => mockSendSupportChatMessage(...args),
  markSupportChatRead: jest.fn(async () => ({ thread: null })),
  apiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

jest.mock("@/lib/supportChatStream", () => ({
  openSupportChatStream: () => ({ close: jest.fn() }),
}));

function renderInSafeArea(ui: ReactElement) {
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

describe("rider chat", () => {
  it("opens a live Operations thread", async () => {
    await renderInSafeArea(<RiderChatScreen />);
    expect(await screen.findByText("Operations")).toBeTruthy();
    expect(screen.getByText("No messages yet")).toBeTruthy();
  });

  it("sends to Operations", async () => {
    mockSendSupportChatMessage.mockResolvedValue({
      thread: { id: "t1", unreadCount: 0 },
      message: {
        id: "m1",
        threadId: "t1",
        senderUserId: "rider",
        senderRole: "rider",
        body: "The gate is locked.",
        createdAt: "2026-09-20T03:00:00.000Z",
        mine: true,
      },
    });
    await renderInSafeArea(<RiderChatScreen />);
    await screen.findByText("Operations");
    fireEvent.changeText(screen.getByPlaceholderText("Write to Operations"), "The gate is locked.");
    await screen.findByDisplayValue("The gate is locked.");
    fireEvent.press(screen.getByLabelText("Send"));
    await waitFor(() => {
      expect(mockSendSupportChatMessage).toHaveBeenCalledWith("The gate is locked.");
    });
  });
});
