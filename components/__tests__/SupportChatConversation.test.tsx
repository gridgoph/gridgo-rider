import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { HeaderHeightContext } from "expo-router/react-navigation";
import { ScrollView } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { SupportChatConversation } from "@/components/SupportChatConversation";

/**
 * gridgo-client#128: opening the keyboard in the Operations chat hid the
 * conversation. The keyboard itself is native and cannot be raised in Jest, so
 * these pin the two things the screen has to hand the native side: the header
 * offset the avoiding view needs, and re-pinning the transcript to its newest
 * message when the keyboard shrinks it.
 */

const mockAvoidingProps = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), canGoBack: () => true }),
}));

jest.mock("react-native-keyboard-controller", () => {
  const { View } = require("react-native");
  return {
    KeyboardAvoidingView: (props: Record<string, unknown>) => {
      mockAvoidingProps(props);
      return <View {...props} />;
    },
  };
});

const mockMessages = Array.from({ length: 30 }, (_, index) => ({
  id: `m${index}`,
  threadId: "t1",
  senderUserId: index % 2 ? "ops" : "me",
  senderRole: index % 2 ? "ops_admin" : "rider",
  body: `Message ${index}`,
  createdAt: "2026-09-28T03:00:00.000Z",
  mine: index % 2 === 0,
}));

jest.mock("@/lib/api", () => ({
  getSupportChatMe: jest.fn(async () => ({
    thread: { id: "t1" },
    threads: [],
    messages: mockMessages,
    unreadCount: 0,
  })),
  markSupportChatRead: jest.fn(async () => ({ thread: null, unreadCount: 0 })),
  sendSupportChatMessage: jest.fn(),
  apiErrorMessage: (_err: unknown, fallback: string) => fallback,
}));

jest.mock("@/lib/supportChatStream", () => ({
  openSupportChatStream: () => ({ close: jest.fn() }),
}));

const HEADER_HEIGHT = 104;

async function renderUnderHeader() {
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 412, height: 915 },
        insets: { top: 48, left: 0, right: 0, bottom: 48 },
      }}
    >
      <HeaderHeightContext.Provider value={HEADER_HEIGHT}>
        <SupportChatConversation />
      </HeaderHeightContext.Provider>
    </SafeAreaProvider>,
  );
  await screen.findByText("Message 29");
  // Let the load finish marking the thread read, and the scroll to the latest
  // message it queued run, before any event is fired.
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
  });
}

function transcript() {
  return screen.getByTestId("support-chat-transcript");
}

async function layout(height: number) {
  await fireEvent(transcript(), "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: 380, height } },
  });
}

async function scrollTo(offsetY: number) {
  await fireEvent.scroll(transcript(), {
    nativeEvent: {
      contentOffset: { x: 0, y: offsetY },
      layoutMeasurement: { width: 380, height: 700 },
      contentSize: { width: 380, height: 2400 },
    },
  });
}

let scrollToEnd: jest.SpyInstance;

beforeEach(() => {
  mockAvoidingProps.mockClear();
  scrollToEnd = jest.spyOn(ScrollView.prototype, "scrollToEnd");
});

afterEach(() => {
  scrollToEnd.mockRestore();
});

it("pads the chat from the keyboard by the header it sits under", async () => {
  await renderUnderHeader();

  // The avoiding view's own layout starts under the stack header, so without
  // this offset the padding comes up one header short and the composer stays
  // under the keyboard.
  const props = mockAvoidingProps.mock.calls.at(-1)?.[0] as Record<string, unknown>;
  expect(props.behavior).toBe("padding");
  expect(props.keyboardVerticalOffset).toBe(HEADER_HEIGHT);
});

it("keeps the newest message in view when the keyboard shrinks the transcript", async () => {
  await renderUnderHeader();
  await layout(700);
  await scrollTo(1700);
  scrollToEnd.mockClear();

  await layout(380);

  expect(scrollToEnd).toHaveBeenCalledWith({ animated: false });
});

it("leaves a rider who scrolled up into history where they are", async () => {
  await renderUnderHeader();
  await layout(700);
  await scrollTo(200);
  scrollToEnd.mockClear();

  await layout(380);

  expect(scrollToEnd).not.toHaveBeenCalled();
});
