import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import TripShopMessagesScreen from "@/app/trip/shop-messages";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ orderId: "order_1" }),
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = require("react");
    useEffect(effect, [effect]);
  },
}));

jest.mock("react-native-keyboard-controller", () => {
  const { View } = require("react-native");
  return { KeyboardAvoidingView: View };
});

jest.mock("@/hooks/useLiveRefresh", () => ({ useLiveRefresh: () => undefined }));

const mockGetPickupChat = jest.fn();
const mockSendPickupMessage = jest.fn();
const mockSendDeliveryMessage = jest.fn();
jest.mock("@/lib/api", () => ({
  getPickupChat: (...args: unknown[]) => mockGetPickupChat(...args),
  sendPickupMessage: (...args: unknown[]) => mockSendPickupMessage(...args),
  sendDeliveryMessage: (...args: unknown[]) => mockSendDeliveryMessage(...args),
}));

function renderScreen(ui: ReactElement) {
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

// One interacting test per file.
it("sends what the rider writes to the shop's thread and never to the client's", async () => {
  const chat = { status: "open", closesAt: null, retentionHours: 24, unread: 0 };
  mockGetPickupChat.mockResolvedValue({ chat, messages: [] });
  mockSendPickupMessage.mockResolvedValue({
    chat,
    message: { id: "p9", senderRole: "rider", body: "Outside now.", createdAt: "2026-10-07T16:05:00.000Z", mine: true },
  });
  await renderScreen(<TripShopMessagesScreen />);
  const field = await screen.findByPlaceholderText("Write to the shop");

  fireEvent.changeText(field, "Outside now.");
  await waitFor(() => expect(screen.getByPlaceholderText("Write to the shop").props.value).toBe("Outside now."));
  fireEvent.press(screen.getByLabelText("Send to the shop"));

  await waitFor(() => expect(mockSendPickupMessage).toHaveBeenCalledWith("order_1", "Outside now."));
  expect(mockSendDeliveryMessage).not.toHaveBeenCalled();
  expect(await screen.findByText("Outside now.")).toBeTruthy();
});
