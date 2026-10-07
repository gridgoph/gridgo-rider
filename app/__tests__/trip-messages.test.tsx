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
const mockGetDownloadUrl = jest.fn();
jest.mock("@/lib/api", () => ({
  getDeliveryChat: (...args: unknown[]) => mockGetDeliveryChat(...args),
  sendDeliveryMessage: (...args: unknown[]) => mockSendDeliveryMessage(...args),
  getDownloadUrl: (...args: unknown[]) => mockGetDownloadUrl(...args),
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

beforeEach(() => {
  mockParams = { orderId: "order_1" };
  mockGetDeliveryChat.mockReset();
});

it("shows the conversation and a composer while the job is the rider's, with no call or number", async () => {
  mockGetDeliveryChat.mockResolvedValue({ chat: { status: "open", closesAt: null, retentionHours: 24 }, messages });
  await renderScreen(<TripMessagesScreen />);

  expect(await screen.findByText("Blue gate, please.")).toBeTruthy();
  expect(mockGetDeliveryChat).toHaveBeenCalledWith("order_1");
  expect(screen.getByText(/^Client ·/)).toBeTruthy();
  expect(screen.getByText(/^You ·/)).toBeTruthy();
  expect(screen.getByText(/Only you and the client see these messages/)).toBeTruthy();
  expect(screen.getByPlaceholderText("Write to the client")).toBeTruthy();
  expect(screen.queryByText(/call/i)).toBeNull();
});

it("shows a photo the client sent, opened through its signed link, and offers to add photos", async () => {
  mockGetDownloadUrl.mockResolvedValue({ url: "https://files.example.invalid/gate.jpg" });
  mockGetDeliveryChat.mockResolvedValue({
    chat: { status: "open", closesAt: null, retentionHours: 24 },
    messages: [
      {
        id: "m3",
        senderRole: "client",
        body: "This is our gate.",
        attachments: [{ fileId: "file_gate", contentType: "image/jpeg", originalFilename: "gate.jpg" }],
        createdAt: "2026-10-07T16:02:00.000Z",
        mine: false,
      },
    ],
  });
  await renderScreen(<TripMessagesScreen />);

  expect(await screen.findByLabelText("gate.jpg")).toBeTruthy();
  expect(screen.getByText("This is our gate.")).toBeTruthy();
  expect(mockGetDownloadUrl).toHaveBeenCalledWith("file_gate");
  expect(screen.getByLabelText("Add photos")).toBeTruthy();
});

it("keeps a delivered conversation readable but closed to new messages", async () => {
  mockGetDeliveryChat.mockResolvedValue({
    chat: { status: "read_only", closesAt: "2026-10-08T14:03:00.000Z", retentionHours: 24 },
    messages,
  });
  await renderScreen(<TripMessagesScreen />);

  expect(await screen.findByText("Blue gate, please.")).toBeTruthy();
  expect(screen.getByText(/This delivery is finished, so no new messages can be sent/)).toBeTruthy();
  expect(screen.queryByPlaceholderText("Write to the client")).toBeNull();
  expect(screen.queryByLabelText("Add photos")).toBeNull();
  expect(screen.getByText("Back to the trip")).toBeTruthy();
});

it("says the messages were removed once the day after delivery has passed", async () => {
  mockGetDeliveryChat.mockRejectedValue(
    Object.assign(new Error("delivery_chat_closed"), { status: 410, body: { error: "delivery_chat_closed" } }),
  );
  await renderScreen(<TripMessagesScreen />);

  expect(await screen.findByText("These messages were removed")).toBeTruthy();
  expect(screen.queryByText("Blue gate, please.")).toBeNull();
});

it("tells a rider the job moved when the conversation is no longer theirs", async () => {
  mockGetDeliveryChat.mockRejectedValue(
    Object.assign(new Error("forbidden"), { status: 403, body: { error: "forbidden" } }),
  );
  await renderScreen(<TripMessagesScreen />);
  expect(await screen.findByText("This conversation is not available")).toBeTruthy();
});
