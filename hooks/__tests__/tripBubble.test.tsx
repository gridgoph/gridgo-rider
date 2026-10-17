import { act, renderHook } from "@testing-library/react-native";
import { router } from "expo-router";
import { AppState, Platform } from "react-native";

import type * as api from "@/lib/api";
import { handleServiceFixes, setTripLocationTarget } from "@/lib/tripLocationTask";
import { useActiveTrip } from "@/store/activeTrip";
import { useBubblePermission } from "@/store/bubblePermission";
import { useNotifications } from "@/store/notifications";
import { useSession } from "@/store/session";
import { useTripBubble } from "@/hooks/useTripBubble";

const mockNative = {
  canDrawOverlays: jest.fn(() => true),
  openOverlaySettings: jest.fn(async () => undefined),
  show: jest.fn(() => true),
  hide: jest.fn(),
  addListener: jest.fn((_event: string, _listener: () => void) => ({ remove: jest.fn() })),
};

// A getter: the hook's import runs before this file's constants exist.
jest.mock("@/modules/trip-bubble", () => ({
  get TripBubbleModule() {
    return mockNative;
  },
}));
jest.mock("expo-router", () => ({ router: { navigate: jest.fn() } }));
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  postLocation: jest.fn(async () => ({})),
}));

const rider = { id: "r1", role: "rider" as const, name: "R", email: "r@test", verificationStatus: "approved" as const };
const trip = { id: "o1", riderId: "r1", state: "out_for_delivery" } as api.Order;
const alert = (id: string, orderId?: string) =>
  ({ id, userId: "r1", title: "t", body: "b", read: false, at: "2026-10-17T00:00:00Z", orderId }) as api.Notification;

let appStateChange: (state: string) => void = () => {};

beforeAll(() => {
  Object.defineProperty(Platform, "OS", { get: () => "android", configurable: true });
});

beforeEach(() => {
  jest.clearAllMocks();
  mockNative.canDrawOverlays.mockReturnValue(true);
  mockNative.show.mockReturnValue(true);
  jest.spyOn(AppState, "addEventListener").mockImplementation((_event, fn) => {
    appStateChange = fn as (state: string) => void;
    return { remove: jest.fn() };
  });
  useSession.setState({ user: rider });
  useActiveTrip.setState({ order: trip });
  useNotifications.setState({ items: [], readIds: [] });
  useBubblePermission.setState({ permission: "granted" });
});

afterEach(() => {
  jest.restoreAllMocks();
});

it("shows the bubble for the active job with its unread count, and updates it", async () => {
  useNotifications.setState({ items: [alert("n1", "o1"), alert("n2", "o2"), alert("n3")] });
  await renderHook(() => useTripBubble());
  expect(mockNative.show).toHaveBeenLastCalledWith(
    1,
    "GRIDGO, 1 new message or update. Open your delivery",
    expect.any(String),
    expect.any(String),
    expect.any(String),
  );

  await act(async () => {
    useNotifications.setState({ items: [alert("n1", "o1"), alert("n4", "o1")] });
  });
  expect(mockNative.show).toHaveBeenLastCalledWith(2, expect.any(String), expect.any(String), expect.any(String), expect.any(String));

  // Reading one in Alerts takes it off the bubble too.
  await act(async () => {
    useNotifications.setState({ readIds: ["n1"] });
  });
  expect(mockNative.show).toHaveBeenLastCalledWith(1, expect.any(String), expect.any(String), expect.any(String), expect.any(String));
  expect(mockNative.hide).not.toHaveBeenCalled();
});

it("hides the bubble when the delivery ends or the rider signs out", async () => {
  await renderHook(() => useTripBubble());
  expect(mockNative.show).toHaveBeenCalledTimes(1);

  await act(async () => {
    useActiveTrip.setState({ order: { ...trip, state: "delivered" } });
  });
  expect(mockNative.hide).toHaveBeenCalledTimes(1);

  await act(async () => {
    useActiveTrip.setState({ order: { ...trip, id: "o2", state: "rider_assigned" } });
  });
  expect(mockNative.show).toHaveBeenCalledTimes(2);

  await act(async () => {
    useSession.setState({ user: null });
  });
  expect(mockNative.hide).toHaveBeenCalledTimes(2);
});

it("does nothing at all when the rider said no, and starts once they allow it", async () => {
  useBubblePermission.setState({ permission: "denied" });
  mockNative.canDrawOverlays.mockReturnValue(false);
  await renderHook(() => useTripBubble());
  expect(mockNative.show).not.toHaveBeenCalled();
  expect(mockNative.hide).not.toHaveBeenCalled();

  // Back from the phone's settings with the switch turned on.
  mockNative.canDrawOverlays.mockReturnValue(true);
  await act(async () => {
    appStateChange("active");
  });
  expect(useBubblePermission.getState().permission).toBe("granted");
  expect(mockNative.show).toHaveBeenCalledTimes(1);

  // And turned off again: the bubble goes.
  mockNative.canDrawOverlays.mockReturnValue(false);
  await act(async () => {
    appStateChange("active");
  });
  expect(mockNative.hide).toHaveBeenCalledTimes(1);
});

it("asks again on the next return when Android refused to start it", async () => {
  mockNative.show.mockReturnValueOnce(false);
  await renderHook(() => useTripBubble());
  expect(mockNative.show).toHaveBeenCalledTimes(1);
  await act(async () => {
    appStateChange("active");
  });
  expect(mockNative.show).toHaveBeenCalledTimes(2);
});

it("opens the active job when the bubble is tapped", async () => {
  await renderHook(() => useTripBubble());
  const [event, listener] = mockNative.addListener.mock.calls[0];
  expect(event).toBe("onOpen");
  listener();
  expect(router.navigate).toHaveBeenCalledWith("/(tabs)/active");
});

it("re-reads the inbox and the job on background fixes, at most every 30 seconds", async () => {
  const unread = jest.spyOn(useNotifications.getState(), "refreshUnread").mockResolvedValue(undefined);
  const refresh = jest.spyOn(useActiveTrip.getState(), "refresh").mockResolvedValue(undefined);
  await renderHook(() => useTripBubble());
  setTripLocationTarget({ orderId: "o1" });
  Object.defineProperty(AppState, "currentState", { value: "background", configurable: true });
  const fix = (at: number) => [{ coords: { latitude: 7, longitude: 125, accuracy: 8 }, timestamp: at }];

  await handleServiceFixes(fix(1_000), 1_000);
  await handleServiceFixes(fix(20_000), 20_000);
  expect(unread).toHaveBeenCalledTimes(1);
  expect(refresh).toHaveBeenCalledWith("r1", "refresh");

  await handleServiceFixes(fix(31_000), 31_000);
  expect(unread).toHaveBeenCalledTimes(2);

  Object.defineProperty(AppState, "currentState", { value: "active", configurable: true });
  setTripLocationTarget(null);
});
