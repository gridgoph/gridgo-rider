import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import * as Notifications from "expo-notifications";
import { Linking, Platform } from "react-native";

import PushPermissionSheet from "@/app/push-permission";
import * as api from "@/lib/api";
import { PUSH_CHANNEL_ID } from "@/lib/push";
import { usePush } from "@/store/push";
import { openPushPrompt, resetPushPromptForTests, usePushPromptStore } from "@/store/pushPrompt";
import { useSession } from "@/store/session";

/**
 * The explainer sheet: what its two buttons actually do.
 *
 * "Turn on notifications" must create the channel before the dialog (Android
 * 13 shows no dialog until one exists), raise the dialog only from the tap,
 * and register the token the moment it is granted. A phone that can no longer
 * be asked goes to its settings instead. "Not now" only closes.
 */

const mockBack = jest.fn();
jest.mock("expo-router", () => ({ router: { back: () => mockBack(), push: jest.fn() } }));

const mocked = Notifications as jest.Mocked<typeof Notifications>;
const granted = { status: "granted", granted: true, canAskAgain: true };

beforeAll(() => {
  Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
});

beforeEach(() => {
  jest.clearAllMocks();
  resetPushPromptForTests();
  api.setToken("session-token");
  useSession.setState({
    user: { id: "u1", email: "rider@example.ph", name: "Rider", role: "rider" },
  });
  usePush.setState({
    supported: true,
    permission: "undetermined",
    token: null,
    claimed: false,
    busy: false,
    error: null,
  });
  openPushPrompt(Date.UTC(2026, 8, 25));
});

afterEach(() => {
  api.setToken(null);
});

it("says what will arrive before anything is asked", async () => {
  await render(<PushPermissionSheet />);

  expect(screen.getByText("Get job offers with GRIDGO closed")).toBeTruthy();
  expect(screen.getByText("A job is offered to you")).toBeTruthy();
  expect(screen.getByText("Operations answers a failed pickup check")).toBeTruthy();
  // An approved rider (no status on record) is not promised an approval alert.
  expect(screen.queryByText("Your account is approved")).toBeNull();
  expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();
});

it("promises the approval alert to a rider still in review", async () => {
  useSession.setState({
    user: {
      id: "u1",
      email: "rider@example.ph",
      name: "Rider",
      role: "rider",
      verificationStatus: "pending",
    },
  });
  await render(<PushPermissionSheet />);
  expect(screen.getByText("Your account is approved")).toBeTruthy();
});

it("'Not now' closes the sheet and asks nothing", async () => {
  const view = await render(<PushPermissionSheet />);
  await act(async () => {
    fireEvent.press(screen.getByText("Not now"));
  });

  expect(mockBack).toHaveBeenCalled();
  expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();

  await act(async () => {
    await view.unmount();
  });
  // Closed as an answer: the offer stays on record for the week.
  expect(usePushPromptStore.getState().open).toBe(false);
  expect(usePushPromptStore.getState().memory.offeredAtMs).toBe(Date.UTC(2026, 8, 25));
});

it("sends a phone that can no longer be asked to its settings", async () => {
  usePush.setState({ permission: "blocked" });
  const openSettings = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
  await render(<PushPermissionSheet />);

  expect(screen.getByText("Notifications are off for GRIDGO")).toBeTruthy();
  await act(async () => {
    fireEvent.press(screen.getByText("Open phone settings"));
  });

  expect(openSettings).toHaveBeenCalled();
  expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();
  expect(mockBack).toHaveBeenCalled();
  openSettings.mockRestore();
});

// Last on purpose: the press settles async work in a store outside React.
it("creates the channel, raises the dialog, then registers the token", async () => {
  mocked.requestPermissionsAsync.mockResolvedValue(granted as never);
  mocked.getPermissionsAsync.mockResolvedValue(granted as never);
  const register = jest.spyOn(api, "registerDevice").mockResolvedValue({} as never);
  await render(<PushPermissionSheet />);

  await act(async () => {
    fireEvent.press(screen.getByText("Turn on notifications"));
  });

  await waitFor(() =>
    expect(register).toHaveBeenCalledWith("test-fcm-token", "android", expect.any(AbortSignal)),
  );
  const channel = mocked.setNotificationChannelAsync.mock.invocationCallOrder[0];
  const dialog = mocked.requestPermissionsAsync.mock.invocationCallOrder[0];
  expect(mocked.setNotificationChannelAsync).toHaveBeenCalledWith(PUSH_CHANNEL_ID, expect.anything());
  expect(channel).toBeLessThan(dialog);
  expect(usePush.getState().permission).toBe("granted");
  await waitFor(() => expect(mockBack).toHaveBeenCalled());
  register.mockRestore();
});
