import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AppState } from "react-native";

import { pushPromptHold, usePushPrompt } from "@/hooks/usePushPrompt";
import type { User } from "@/lib/api";
import { PUSH_PROMPT_REOFFER_MS, PUSH_PROMPT_STORAGE_KEY } from "@/lib/push";
import { resetAppUpdateForTests, useAppUpdate } from "@/store/appUpdate";
import { usePush } from "@/store/push";
import { closePushPrompt, resetPushPromptForTests, usePushPromptStore } from "@/store/pushPrompt";
import { useSession } from "@/store/session";

/**
 * When the notifications explainer is put in front of a rider.
 *
 * Production had almost no rider phones registered because the dialog was
 * only reachable from a card on a few screens. These are the rules that fix
 * that without nagging: once after sign-in (or on the first launch of this
 * build for a rider already signed in), a week's quiet after "Not now", and
 * never over a sign-in screen, a proof step or another sheet.
 */

const mockPush = jest.fn();
let mockSegments: string[] = ["(tabs)", "active"];
jest.mock("expo-router", () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), back: jest.fn() },
  useRootNavigationState: () => ({ key: "root" }),
  useSegments: () => mockSegments,
}));

// The native sheet hand-off waits on animation frames, whose jest polyfill
// keys off the wall clock this file moves by days.
jest.mock("@/store/sheets", () => ({
  ...jest.requireActual("@/store/sheets"),
  afterNativePresentation: () => Promise.resolve(),
}));

const rider: User = { id: "u1", email: "rider@example.ph", name: "Rider", role: "rider" };
const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 8, 25, 2);
let now = T0;
let clock: jest.SpyInstance;
const mounted: { unmount: () => unknown }[] = [];

async function mount(ready = true) {
  const view = await renderHook(({ r }: { r: boolean }) => usePushPrompt({ ready: r }), {
    initialProps: { r: ready },
  });
  await act(async () => {});
  mounted.push(view);
  return view;
}

/** Wait long enough for the presentation to have happened if it was going to. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

const testAppState = AppState.currentState;
beforeAll(() => {
  Object.defineProperty(AppState, "currentState", { value: "active", configurable: true });
});
afterAll(() => {
  Object.defineProperty(AppState, "currentState", { value: testAppState, configurable: true });
});

beforeEach(async () => {
  jest.clearAllMocks();
  mockSegments = ["(tabs)", "active"];
  now = T0;
  clock = jest.spyOn(Date, "now").mockImplementation(() => now);
  await AsyncStorage.clear();
  resetPushPromptForTests();
  resetAppUpdateForTests();
  useSession.setState({ user: null, loading: false, sessionWait: null });
  usePush.setState({ supported: true, permission: "undetermined", busy: false, error: null });
});

afterEach(async () => {
  for (const view of mounted.splice(0)) await act(async () => { await view.unmount(); });
  clock.mockRestore();
});

it("appears once, right after a rider signs in and lands on the tabs", async () => {
  mockSegments = ["(auth)", "login"];
  const view = await mount();
  await settle();
  expect(mockPush).not.toHaveBeenCalled();

  // Sign-in succeeds and the gate lands the rider on Active.
  useSession.setState({ user: rider });
  mockSegments = ["(tabs)", "active"];
  await view.rerender({ r: true });

  await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/push-permission"));
  await view.rerender({ r: true });
  await settle();
  expect(mockPush).toHaveBeenCalledTimes(1);
});

it("appears for a rider already signed in, on the first launch of this build", async () => {
  useSession.setState({ user: rider });
  await mount();
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/push-permission"));
  expect(JSON.parse((await AsyncStorage.getItem(PUSH_PROMPT_STORAGE_KEY)) ?? "{}")).toEqual({
    offeredAtMs: T0,
  });
});

it("remembers 'Not now' on this phone", async () => {
  useSession.setState({ user: rider });
  const view = await mount();
  await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
  await act(async () => closePushPrompt("answered"));
  await view.rerender({ r: true });
  await settle();

  expect(mockPush).toHaveBeenCalledTimes(1);
  expect(JSON.parse((await AsyncStorage.getItem(PUSH_PROMPT_STORAGE_KEY)) ?? "{}")).toEqual({
    offeredAtMs: T0,
  });
});

it("stays away on a later launch within the week after 'Not now'", async () => {
  await AsyncStorage.setItem(PUSH_PROMPT_STORAGE_KEY, JSON.stringify({ offeredAtMs: T0 }));
  now = T0 + 6 * DAY;
  useSession.setState({ user: rider });
  await mount();
  await settle();
  expect(usePushPromptStore.getState().hydrated).toBe(true);
  expect(mockPush).not.toHaveBeenCalled();
});

it("offers again a week after 'Not now' while notifications are still off", async () => {
  await AsyncStorage.setItem(PUSH_PROMPT_STORAGE_KEY, JSON.stringify({ offeredAtMs: T0 }));
  now = T0 + PUSH_PROMPT_REOFFER_MS;
  useSession.setState({ user: rider });
  await mount();
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/push-permission"));
});

it("offers a blocked phone the explainer too, so it can point at settings", async () => {
  useSession.setState({ user: rider });
  usePush.setState({ permission: "blocked" });
  await mount();
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/push-permission"));
});

it("stays away from a phone with notifications on", async () => {
  usePush.setState({ permission: "granted" });
  useSession.setState({ user: rider });
  await mount();
  await settle();
  expect(mockPush).not.toHaveBeenCalled();
});

it("stays away from a signed-out phone, which has the card at the door", async () => {
  await mount();
  await settle();
  expect(mockPush).not.toHaveBeenCalled();
});

it("waits for the opening, and for a waiting update sheet to go first", async () => {
  useSession.setState({ user: rider });
  useAppUpdate.setState({
    offer: {
      installed: { versionName: "1.0.75", versionCode: 75 },
      latest: { versionName: "1.0.80", versionCode: 80 },
    },
  });
  const view = await mount(false);
  await settle();
  expect(mockPush).not.toHaveBeenCalled();

  await view.rerender({ r: true });
  await settle();
  expect(mockPush).not.toHaveBeenCalled();

  useAppUpdate.setState({ offer: null });
  await view.rerender({ r: true });
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/push-permission"));
});

it("is offered again when an account change takes it down unanswered", async () => {
  useSession.setState({ user: rider });
  await mount();
  await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
  await act(async () => closePushPrompt("interrupted"));
  // Nobody answered, so it is not put off for a week: it comes straight back
  // on the new stack.
  await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(2));
  expect(usePushPromptStore.getState().open).toBe(true);
});

describe("pushPromptHold", () => {
  const clear = {
    ready: true,
    navigatorReady: true,
    appState: "active" as const,
    confirmOpen: false,
    updateSheet: false,
    segments: ["(tabs)", "offers"],
  };

  it("presents only over the tab shell", () => {
    expect(pushPromptHold(clear)).toBeNull();
    expect(pushPromptHold({ ...clear, segments: [] })).not.toBeNull();
    expect(pushPromptHold({ ...clear, segments: ["(auth)", "welcome"] })).not.toBeNull();
    expect(pushPromptHold({ ...clear, segments: ["trip", "pickup"] })).not.toBeNull();
    expect(pushPromptHold({ ...clear, segments: ["app-update"] })).not.toBeNull();
  });

  it("holds for the app in the background and for another sheet", () => {
    expect(pushPromptHold({ ...clear, appState: "background" })).not.toBeNull();
    expect(pushPromptHold({ ...clear, confirmOpen: true })).not.toBeNull();
    expect(pushPromptHold({ ...clear, navigatorReady: false })).not.toBeNull();
  });
});
