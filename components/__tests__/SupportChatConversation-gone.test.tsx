import { fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { SupportChatConversation } from "@/components/SupportChatConversation";
import * as api from "@/lib/api";

/**
 * A tapped support push can name a conversation that has since been removed
 * or is no longer the rider's. That must read as gone, with the way to the
 * rest of their history, and never offer a composer posting into nothing.
 */

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), replace: mockReplace, canGoBack: () => true }),
}));
jest.mock("react-native-keyboard-controller", () => {
  const { View } = require("react-native");
  return { KeyboardAvoidingView: (props: Record<string, unknown>) => <View {...props} /> };
});
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getSupportChatThread: jest.fn(),
  markSupportChatRead: jest.fn(async () => ({ unreadCount: 0 })),
}));
jest.mock("@/lib/supportChatStream", () => ({ openSupportChatStream: () => ({ close: jest.fn() }) }));

const THREAD = "0b9a1f2c-3d4e-4f5a-8b6c-7d8e9f0a1b2c";
const renderThread = () => render(
  <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 412, height: 915 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
    <SupportChatConversation threadId={THREAD} />
  </SafeAreaProvider>,
);

beforeEach(() => jest.clearAllMocks());

it.each([403, 404])("says a %s conversation is gone and leads to chat history", async (status) => {
  (api.getSupportChatThread as jest.Mock).mockRejectedValue(new api.ApiError(status, { error: "not_found" }));
  await renderThread();
  expect(await screen.findByText("This conversation is no longer available")).toBeTruthy();
  expect(screen.queryByLabelText("Message Operations")).toBeNull();
  expect(screen.queryByText("Could not load chat")).toBeNull();
  await fireEvent.press(screen.getByText("Open chat history"));
  expect(mockReplace).toHaveBeenCalledWith("/chat");
});

it("keeps Try again for a failure that is not about the conversation", async () => {
  (api.getSupportChatThread as jest.Mock).mockRejectedValue(new TypeError("Network request failed"));
  await renderThread();
  expect(await screen.findByText("Could not load chat")).toBeTruthy();
  expect(screen.getByLabelText("Message Operations")).toBeTruthy();
});
