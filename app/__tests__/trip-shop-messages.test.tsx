import { render, screen } from "@testing-library/react-native";
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

const mockGetDeliveryChat = jest.fn();
const mockGetPickupChat = jest.fn();
jest.mock("@/lib/api", () => ({
  getDeliveryChat: (...args: unknown[]) => mockGetDeliveryChat(...args),
  getPickupChat: (...args: unknown[]) => mockGetPickupChat(...args),
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

beforeEach(() => {
  mockGetDeliveryChat.mockReset();
  mockGetPickupChat.mockReset();
});

it("reads the shop's thread only, and names the shop everywhere the rider could write", async () => {
  mockGetPickupChat.mockResolvedValue({
    chat: { status: "open", closesAt: null, retentionHours: 24, unread: 0 },
    messages: [
      { id: "p1", senderRole: "supplier", body: "Use the side door.", createdAt: "2026-10-07T15:57:00.000Z", mine: false },
      { id: "p2", senderRole: "rider", body: "Ten minutes away.", createdAt: "2026-10-07T16:00:00.000Z", mine: true },
    ],
  });
  await renderScreen(<TripShopMessagesScreen />);

  expect(await screen.findByText("Use the side door.")).toBeTruthy();
  expect(mockGetPickupChat).toHaveBeenCalledWith("order_1");
  expect(mockGetDeliveryChat).not.toHaveBeenCalled();
  expect(screen.getByText("The shop")).toBeTruthy();
  expect(screen.getByText(/^Shop ·/)).toBeTruthy();
  expect(screen.getByText(/^You ·/)).toBeTruthy();
  expect(screen.getByText(/Only you and the shop see these messages\. The client does not\./)).toBeTruthy();
  expect(screen.getByPlaceholderText("Write to the shop")).toBeTruthy();
  expect(screen.getByLabelText("Send to the shop")).toBeTruthy();
  expect(screen.queryByPlaceholderText("Write to the client")).toBeNull();
  expect(screen.queryByText("The client")).toBeNull();
  expect(screen.queryByText(/call/i)).toBeNull();
});

it("tells the rider when the shop's messages are gone, in the shop's words", async () => {
  mockGetPickupChat.mockRejectedValue(
    Object.assign(new Error("pickup_chat_closed"), { status: 410, body: { error: "pickup_chat_closed" } }),
  );
  await renderScreen(<TripShopMessagesScreen />);

  expect(await screen.findByText("These messages were removed")).toBeTruthy();
  expect(screen.getByText(/Messages with the shop are removed one day after/)).toBeTruthy();
});
