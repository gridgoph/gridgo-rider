import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import TripMessagesScreen from "@/app/trip/messages";

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

const mockPickChatImages = jest.fn();
const mockUploadChatImage = jest.fn();
jest.mock("@/lib/chatImages", () => ({
  ...jest.requireActual("@/lib/chatImages"),
  pickChatImages: (...args: unknown[]) => mockPickChatImages(...args),
  uploadChatImage: (...args: unknown[]) => mockUploadChatImage(...args),
}));

const mockGetDeliveryChat = jest.fn();
const mockSendDeliveryMessage = jest.fn();
jest.mock("@/lib/api", () => ({
  getDeliveryChat: (...args: unknown[]) => mockGetDeliveryChat(...args),
  sendDeliveryMessage: (...args: unknown[]) => mockSendDeliveryMessage(...args),
  getDownloadUrl: () => Promise.resolve({ url: "https://files.example.invalid/door.jpg" }),
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

// Two presses spend the file, so this is its only test.
it("uploads a picked photo as a delivery chat image and sends it to the client", async () => {
  const open = { status: "open", closesAt: null, retentionHours: 24 };
  mockGetDeliveryChat.mockResolvedValue({ chat: open, messages: [] });
  mockPickChatImages.mockResolvedValue([
    { uri: "file:///cache/door.jpg", name: "door.jpg", mimeType: "image/jpeg", size: 2048 },
  ]);
  mockUploadChatImage.mockResolvedValue("file_door");
  mockSendDeliveryMessage.mockResolvedValue({
    chat: open,
    message: {
      id: "m1",
      senderRole: "rider",
      body: "",
      attachments: [{ fileId: "file_door", contentType: "image/jpeg", originalFilename: "door.jpg" }],
      createdAt: "2026-10-07T16:05:00.000Z",
      mine: true,
    },
  });
  await renderScreen(<TripMessagesScreen />);

  fireEvent.press(await screen.findByLabelText("Add photos"));
  expect(await screen.findByText("door.jpg")).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Send"));

  await waitFor(() => expect(mockSendDeliveryMessage).toHaveBeenCalledWith("order_1", "", { attachmentFileIds: ["file_door"] }));
  expect(mockUploadChatImage).toHaveBeenCalledWith(
    { uri: "file:///cache/door.jpg", name: "door.jpg", mimeType: "image/jpeg" },
    "delivery_chat_image",
  );
  expect(await screen.findByLabelText("door.jpg")).toBeTruthy();
});
