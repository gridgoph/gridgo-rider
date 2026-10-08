import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import TripMessagesScreen from "@/app/trip/messages";

let mockParams: { orderId?: string } = { orderId: "order_1" };

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => mockParams,
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
const mockSendDeliveryMessage = jest.fn();
jest.mock("@/lib/api", () => ({
  getDeliveryChat: (...args: unknown[]) => mockGetDeliveryChat(...args),
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

const messages = [
  { id: "m1", senderRole: "rider", body: "On Quimpo Blvd now.", createdAt: "2026-10-07T15:57:00.000Z", mine: true },
  { id: "m2", senderRole: "client", body: "Blue gate, please.", createdAt: "2026-10-07T16:00:00.000Z", mine: false },
];

// One interacting test per file.
it("sends a typed message to the client and shows it at once", async () => {
  mockGetDeliveryChat.mockResolvedValue({ chat: { status: "open", closesAt: null, retentionHours: 24 }, messages });
  mockSendDeliveryMessage.mockResolvedValue({
    chat: { status: "open", closesAt: null, retentionHours: 24 },
    message: { id: "m3", senderRole: "rider", body: "I am at the gate.", createdAt: "2026-10-07T16:05:00.000Z", mine: true },
  });
  await renderScreen(<TripMessagesScreen />);
  const field = await screen.findByPlaceholderText("Write to the client");

  fireEvent.changeText(field, " I am at the gate. ");
  await waitFor(() => expect(screen.getByPlaceholderText("Write to the client").props.value).toBe(" I am at the gate. "));
  fireEvent.press(screen.getByLabelText("Send to the client"));

  await waitFor(() => expect(mockSendDeliveryMessage).toHaveBeenCalledWith("order_1", "I am at the gate."));
  expect(await screen.findByText("I am at the gate.")).toBeTruthy();
});
