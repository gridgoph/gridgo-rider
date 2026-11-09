import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, renderHook } from "@testing-library/react-native";
import { Alert, AppState, Platform, type AppStateStatus } from "react-native";

import { usePlayUpdateCheck } from "@/hooks/usePlayUpdateCheck";
import type { Order } from "@/lib/api";
import * as api from "@/lib/api";
import { loadPlayUpdate } from "@/lib/playUpdate";
import { useActiveTrip } from "@/store/activeTrip";
import { useSession } from "@/store/session";

const mockRequireNative = jest.fn();

jest.mock("@/lib/playUpdate", () => {
  const actual = jest.requireActual<typeof import("@/lib/playUpdate")>("@/lib/playUpdate");
  return { ...actual, loadPlayUpdate: () => actual.loadPlayUpdate(mockRequireNative) };
});

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { android: { versionCode: 90 } } },
}));

const native = {
  checkForUpdate: jest.fn(),
  startFlexibleUpdate: jest.fn(),
  completeUpdate: jest.fn(),
  addListener: jest.fn(),
};
let foreground: (state: AppStateStatus) => void;
let downloaded: () => void;
const removeNative = jest.fn();
const removeAppState = jest.fn();
let now: number;
const originalAppState = AppState.currentState;
const rider = { id: "r1", role: "rider" as const, name: "R", email: "r@test" };
const trip = { id: "o1", riderId: rider.id, state: "out_for_delivery" } as Order;

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  now = 1_800_000_000_000;
  jest.spyOn(Date, "now").mockImplementation(() => now);
  jest.replaceProperty(Platform, "OS", "android");
  AppState.currentState = "active";
  useSession.setState({ hydrated: true, user: rider, loading: false, sessionWait: null });
  useActiveTrip.getState().clear();
  jest.spyOn(api, "listOrders").mockResolvedValue([]);
  await useActiveTrip.getState().refresh(rider.id, "refresh");
  process.env.EXPO_PUBLIC_APP_DISTRIBUTION = "play";
  mockRequireNative.mockReturnValue(native);
  native.checkForUpdate.mockResolvedValue({ available: true, flexibleAllowed: true, downloaded: false });
  native.startFlexibleUpdate.mockResolvedValue(true);
  native.completeUpdate.mockResolvedValue(null);
  native.addListener.mockImplementation((_event, listener) => {
    downloaded = listener;
    return { remove: removeNative };
  });
  jest.spyOn(AppState, "addEventListener").mockImplementation((_event, listener) => {
    foreground = listener;
    return { remove: removeAppState };
  });
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
});

afterEach(() => {
  delete process.env.EXPO_PUBLIC_APP_DISTRIBUTION;
  AppState.currentState = originalAppState;
  jest.restoreAllMocks();
});

it.each(["apk", "ios", "web"] as const)("never loads or calls Play on %s", async (channel) => {
  if (channel === "apk") process.env.EXPO_PUBLIC_APP_DISTRIBUTION = "apk";
  else jest.replaceProperty(Platform, "OS", channel);
  await renderHook(() => usePlayUpdateCheck(true));
  expect(mockRequireNative).not.toHaveBeenCalled();
  expect(native.checkForUpdate).not.toHaveBeenCalled();
  expect(loadPlayUpdate()).toBeNull();
  expect(mockRequireNative).not.toHaveBeenCalled();
});

it("checks on launch and starts only the flexible flow", async () => {
  await renderHook(() => usePlayUpdateCheck(true));
  expect(native.checkForUpdate).toHaveBeenCalledTimes(1);
  expect(native.startFlexibleUpdate).toHaveBeenCalledTimes(1);
  expect(Alert.alert).not.toHaveBeenCalled();
  expect(native.completeUpdate).not.toHaveBeenCalled();
});

it("waits until the launch intro is ready", async () => {
  const hook = await renderHook<void, { ready: boolean }>(({ ready }) => usePlayUpdateCheck(ready), { initialProps: { ready: false } });
  expect(mockRequireNative).not.toHaveBeenCalled();
  await hook.rerender({ ready: true });
  expect(native.checkForUpdate).toHaveBeenCalledTimes(1);
});

it("throttles foreground checks and cold launches for four hours", async () => {
  const hook = await renderHook(() => usePlayUpdateCheck(true));
  now += 3 * 60 * 60 * 1000;
  await act(async () => foreground("active"));
  await hook.unmount();
  await renderHook(() => usePlayUpdateCheck(true));
  expect(native.checkForUpdate).toHaveBeenCalledTimes(1);
  now += 60 * 60 * 1000;
  await act(async () => foreground("background"));
  expect(native.checkForUpdate).toHaveBeenCalledTimes(1);
  await act(async () => foreground("active"));
  await act(async () => useActiveTrip.getState().refresh(rider.id, "refresh"));
  expect(native.checkForUpdate).toHaveBeenCalledTimes(2);
});

it("offers one restart only after download; Later never installs", async () => {
  await renderHook(() => usePlayUpdateCheck(true));
  await act(async () => { downloaded(); downloaded(); });
  expect(Alert.alert).toHaveBeenCalledTimes(1);
  const buttons = jest.mocked(Alert.alert).mock.calls[0][2]!;
  expect(buttons.map((button) => button.text)).toEqual(["Later", "Restart now"]);
  expect(native.completeUpdate).not.toHaveBeenCalled();
  await act(async () => buttons[0].onPress?.());
  expect(native.completeUpdate).not.toHaveBeenCalled();
  await act(async () => buttons[1].onPress?.());
  expect(native.completeUpdate).toHaveBeenCalledTimes(1);
});

it("recovers an already downloaded update without starting another download", async () => {
  native.checkForUpdate.mockResolvedValue({ available: true, flexibleAllowed: false, downloaded: true });
  await renderHook(() => usePlayUpdateCheck(true));
  expect(Alert.alert).toHaveBeenCalledTimes(1);
  expect(native.startFlexibleUpdate).not.toHaveBeenCalled();
});

it("holds a background download prompt until the app is active", async () => {
  await renderHook(() => usePlayUpdateCheck(true));
  AppState.currentState = "background";
  await act(async () => foreground("background"));
  await act(async () => downloaded());
  expect(Alert.alert).not.toHaveBeenCalled();
  AppState.currentState = "active";
  await act(async () => foreground("active"));
  expect(Alert.alert).not.toHaveBeenCalled();
  await act(async () => useActiveTrip.getState().refresh(rider.id, "refresh"));
  expect(Alert.alert).toHaveBeenCalledTimes(1);
  expect(native.checkForUpdate).toHaveBeenCalledTimes(1);
});

it.each([
  { available: false, flexibleAllowed: false, downloaded: false },
  { available: true, flexibleAllowed: false, downloaded: false },
])("silently skips unavailable or disallowed updates: %j", async (info) => {
  native.checkForUpdate.mockResolvedValue(info);
  await renderHook(() => usePlayUpdateCheck(true));
  expect(native.startFlexibleUpdate).not.toHaveBeenCalled();
  expect(Alert.alert).not.toHaveBeenCalled();
});

it.each(["checkForUpdate", "startFlexibleUpdate"] as const)("silently handles %s failure, including not-from-Play", async (method) => {
  native[method].mockRejectedValue(new Error("ERROR_APP_NOT_OWNED"));
  await renderHook(() => usePlayUpdateCheck(true));
  expect(Alert.alert).not.toHaveBeenCalled();
  await act(async () => foreground("active"));
  expect(native.checkForUpdate).toHaveBeenCalledTimes(1);
});

it("silently handles missing native support", async () => {
  mockRequireNative.mockReturnValue(null);
  await renderHook(() => usePlayUpdateCheck(true));
  expect(Alert.alert).not.toHaveBeenCalled();
});

it("silently handles restart failure and releases both listeners on unmount", async () => {
  native.completeUpdate.mockRejectedValue(new Error("install failed"));
  const hook = await renderHook(() => usePlayUpdateCheck(true));
  await act(async () => downloaded());
  await act(async () => jest.mocked(Alert.alert).mock.calls[0][2]![1].onPress?.());
  expect(Alert.alert).toHaveBeenCalledTimes(1);
  await hook.unmount();
  expect(removeNative).toHaveBeenCalledTimes(1);
  expect(removeAppState).toHaveBeenCalledTimes(1);
});


it("does not overlap checks while Play is answering", async () => {
  let answer!: (info: { available: boolean; flexibleAllowed: boolean; downloaded: boolean }) => void;
  native.checkForUpdate.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
  await renderHook(() => usePlayUpdateCheck(true));
  now += 5 * 60 * 60 * 1000;
  await act(async () => { foreground("active"); foreground("active"); });
  expect(native.checkForUpdate).toHaveBeenCalledTimes(1);
  await act(async () => answer({ available: true, flexibleAllowed: true, downloaded: false }));
  expect(native.startFlexibleUpdate).toHaveBeenCalledTimes(1);
});

it("does not open an update flow after unmount", async () => {
  let answer!: (info: { available: boolean; flexibleAllowed: boolean; downloaded: boolean }) => void;
  native.checkForUpdate.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
  const hook = await renderHook(() => usePlayUpdateCheck(true));
  await hook.unmount();
  await act(async () => answer({ available: true, flexibleAllowed: true, downloaded: false }));
  expect(native.startFlexibleUpdate).not.toHaveBeenCalled();
  expect(Alert.alert).not.toHaveBeenCalled();
});

it.each(["rider_assigned", "picked_up", "out_for_delivery"])("defers Play consent during %s", async (state) => {
  useActiveTrip.setState({ order: { ...trip, state } });
  await renderHook(() => usePlayUpdateCheck(true));
  expect(mockRequireNative).not.toHaveBeenCalled();
  expect(native.checkForUpdate).not.toHaveBeenCalled();
  await act(async () => useActiveTrip.getState().setOrder({ ...trip, state: "delivered" }));
  await act(async () => useActiveTrip.getState().refresh(rider.id, "refresh"));
  expect(native.startFlexibleUpdate).toHaveBeenCalledTimes(1);
});

it.each([
  { loaded: false, loading: false, error: null },
  { loaded: true, loading: true, error: null },
  { loaded: true, loading: false, error: "offline" },
])("waits for a successful trip reconciliation: %j", async (state) => {
  useActiveTrip.setState(state);
  await renderHook(() => usePlayUpdateCheck(true));
  expect(mockRequireNative).not.toHaveBeenCalled();
  await act(async () => useActiveTrip.setState({ loaded: true, loading: false, error: null }));
  expect(native.startFlexibleUpdate).toHaveBeenCalledTimes(1);
});

it("defers signed-out checks until rider sign-in and a successful trip read", async () => {
  useSession.setState({ hydrated: false, user: null });
  useActiveTrip.setState({ loaded: false });
  await renderHook(() => usePlayUpdateCheck(true));
  expect(mockRequireNative).not.toHaveBeenCalled();
  await act(async () => useSession.setState({ hydrated: true }));
  expect(mockRequireNative).not.toHaveBeenCalled();
  await act(async () => useSession.setState({ user: rider }));
  expect(mockRequireNative).not.toHaveBeenCalled();
  await act(async () => useActiveTrip.getState().refresh(rider.id, "refresh"));
  expect(native.startFlexibleUpdate).toHaveBeenCalledTimes(1);
});

it("keeps a download pending during the trip and prompts once when the job ends", async () => {
  await renderHook(() => usePlayUpdateCheck(true));
  await act(async () => useActiveTrip.getState().setOrder(trip));
  await act(async () => downloaded());
  await act(async () => foreground("active"));
  expect(Alert.alert).not.toHaveBeenCalled();
  expect(native.completeUpdate).not.toHaveBeenCalled();
  await act(async () => useActiveTrip.getState().setOrder({ ...trip, state: "awaiting_collection" }));
  await act(async () => useActiveTrip.getState().refresh(rider.id, "refresh"));
  expect(Alert.alert).toHaveBeenCalledTimes(1);
  expect(native.checkForUpdate).toHaveBeenCalledTimes(1);
  await act(async () => downloaded());
  expect(Alert.alert).toHaveBeenCalledTimes(1);
});

it("rechecks the job before Restart now and offers again after handover", async () => {
  native.checkForUpdate.mockResolvedValue({ available: true, flexibleAllowed: false, downloaded: true });
  await renderHook(() => usePlayUpdateCheck(true));
  const restart = jest.mocked(Alert.alert).mock.calls[0][2]![1].onPress!;
  await act(async () => useActiveTrip.getState().setOrder(trip));
  await act(async () => restart());
  expect(native.completeUpdate).not.toHaveBeenCalled();
  await act(async () => useActiveTrip.getState().setOrder(null));
  await act(async () => useActiveTrip.getState().refresh(rider.id, "refresh"));
  expect(Alert.alert).toHaveBeenCalledTimes(2);
  await act(async () => jest.mocked(Alert.alert).mock.calls[1][2]![1].onPress?.());
  expect(native.completeUpdate).toHaveBeenCalledTimes(1);
});

it.each([false, true])("does not interrupt a trip accepted while Play answers (downloaded=%s)", async (isDownloaded) => {
  let answer!: (info: { available: boolean; flexibleAllowed: boolean; downloaded: boolean }) => void;
  native.checkForUpdate.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
  await renderHook(() => usePlayUpdateCheck(true));
  await act(async () => useActiveTrip.getState().setOrder(trip));
  await act(async () => answer({ available: true, flexibleAllowed: true, downloaded: isDownloaded }));
  expect(native.startFlexibleUpdate).not.toHaveBeenCalled();
  expect(Alert.alert).not.toHaveBeenCalled();
  if (isDownloaded) {
    await act(async () => useActiveTrip.getState().setOrder(null));
    await act(async () => useActiveTrip.getState().refresh(rider.id, "refresh"));
    expect(Alert.alert).toHaveBeenCalledTimes(1);
  }
});

it("never restarts from a stale prompt after unmount", async () => {
  const hook = await renderHook(() => usePlayUpdateCheck(true));
  await act(async () => downloaded());
  const restart = jest.mocked(Alert.alert).mock.calls[0][2]![1].onPress!;
  await hook.unmount();
  await act(async () => restart());
  expect(native.completeUpdate).not.toHaveBeenCalled();
});

it("waits for the current foreground trip reconciliation before restarting", async () => {
  const api = jest.requireActual<typeof import("@/lib/api")>("@/lib/api");
  let resolveOrders!: (orders: Order[]) => void;
  jest.spyOn(api, "listOrders").mockReturnValue(
    new Promise<Order[]>((resolve) => { resolveOrders = resolve; }),
  );
  await renderHook(() => usePlayUpdateCheck(true));
  AppState.currentState = "background";
  await act(async () => downloaded());
  let reconcile!: Promise<void>;
  await act(async () => {
    reconcile = useActiveTrip.getState().refresh(rider.id, "refresh");
  });
  AppState.currentState = "active";
  await act(async () => foreground("active"));
  const restart = jest.mocked(Alert.alert).mock.calls[0]?.[2]?.[1].onPress;
  await act(async () => restart?.());
  const prematureInstalls = native.completeUpdate.mock.calls.length;
  await act(async () => { resolveOrders([trip]); await reconcile; });
  expect(useActiveTrip.getState().order?.state).toBe("out_for_delivery");
  expect(prematureInstalls).toBe(0);
});

it("requires a new foreground read even when a background read returns no trip", async () => {
  await renderHook(() => usePlayUpdateCheck(true));
  AppState.currentState = "background";
  await act(async () => foreground("background"));
  await act(async () => downloaded());
  let resolveOrders!: (orders: Order[]) => void;
  jest.mocked(api.listOrders).mockReturnValueOnce(new Promise((resolve) => { resolveOrders = resolve; }));
  let oldRead!: Promise<void>;
  await act(async () => { oldRead = useActiveTrip.getState().refresh(rider.id, "refresh"); });
  AppState.currentState = "active";
  await act(async () => foreground("active"));
  expect(Alert.alert).not.toHaveBeenCalled();
  await act(async () => { resolveOrders([]); await oldRead; });
  expect(Alert.alert).not.toHaveBeenCalled();
  await act(async () => useActiveTrip.getState().refresh(rider.id, "refresh"));
  expect(Alert.alert).toHaveBeenCalledTimes(1);
});

it("holds a downloaded update after a failed foreground read until a successful retry", async () => {
  await renderHook(() => usePlayUpdateCheck(true));
  AppState.currentState = "background";
  await act(async () => foreground("background"));
  await act(async () => downloaded());
  AppState.currentState = "active";
  await act(async () => foreground("active"));
  jest.mocked(api.listOrders).mockRejectedValueOnce(new Error("offline"));
  await act(async () => useActiveTrip.getState().refresh(rider.id, "refresh"));
  expect(Alert.alert).not.toHaveBeenCalled();
  expect(native.completeUpdate).not.toHaveBeenCalled();
  await act(async () => useActiveTrip.getState().refresh(rider.id, "refresh"));
  expect(Alert.alert).toHaveBeenCalledTimes(1);
});

it("rechecks current foreground permission when an old Restart now button is tapped", async () => {
  native.checkForUpdate.mockResolvedValue({ available: true, flexibleAllowed: false, downloaded: true });
  await renderHook(() => usePlayUpdateCheck(true));
  const restart = jest.mocked(Alert.alert).mock.calls[0][2]![1].onPress!;
  AppState.currentState = "background";
  await act(async () => foreground("background"));
  AppState.currentState = "active";
  await act(async () => foreground("active"));
  await act(async () => restart());
  expect(native.completeUpdate).not.toHaveBeenCalled();
  await act(async () => useActiveTrip.getState().refresh(rider.id, "refresh"));
  expect(Alert.alert).toHaveBeenCalledTimes(2);
});

it("blocks restart through acceptance and discards idle reads begun before it settled", async () => {
  native.checkForUpdate.mockResolvedValue({ available: true, flexibleAllowed: false, downloaded: true });
  await renderHook(() => usePlayUpdateCheck(true));
  const restart = jest.mocked(Alert.alert).mock.calls[0][2]![1].onPress!;
  let finishAcceptance!: () => void;
  await act(async () => { finishAcceptance = useActiveTrip.getState().beginOfferAcceptance(); });
  await act(async () => restart());
  expect(native.completeUpdate).not.toHaveBeenCalled();
  await act(async () => useActiveTrip.getState().refresh(rider.id, "refresh"));
  await act(async () => downloaded());
  expect(Alert.alert).toHaveBeenCalledTimes(1);
  await act(async () => finishAcceptance());
  await act(async () => restart());
  expect(native.completeUpdate).not.toHaveBeenCalled();
  expect(Alert.alert).toHaveBeenCalledTimes(1);
  await act(async () => useActiveTrip.getState().refresh(rider.id, "refresh"));
  expect(Alert.alert).toHaveBeenCalledTimes(2);
  await act(async () => jest.mocked(Alert.alert).mock.calls[1][2]![1].onPress?.());
  expect(native.completeUpdate).toHaveBeenCalledTimes(1);
});

it("defers Play consent while an offer acceptance is pending", async () => {
  const finishAcceptance = useActiveTrip.getState().beginOfferAcceptance();
  await renderHook(() => usePlayUpdateCheck(true));
  expect(mockRequireNative).not.toHaveBeenCalled();
  await act(async () => finishAcceptance());
  expect(mockRequireNative).not.toHaveBeenCalled();
  await act(async () => useActiveTrip.getState().refresh(rider.id, "refresh"));
  expect(native.startFlexibleUpdate).toHaveBeenCalledTimes(1);
});

it("does not reuse an idle read from the previous rider session", async () => {
  await renderHook(() => usePlayUpdateCheck(true));
  let resolveOrders!: (orders: Order[]) => void;
  jest.mocked(api.listOrders).mockReturnValueOnce(new Promise((resolve) => { resolveOrders = resolve; }));
  let oldRead!: Promise<void>;
  await act(async () => { oldRead = useActiveTrip.getState().refresh(rider.id, "refresh"); });
  await act(async () => useSession.setState({ user: { ...rider, id: "r2" } }));
  await act(async () => downloaded());
  await act(async () => { resolveOrders([]); await oldRead; });
  expect(Alert.alert).not.toHaveBeenCalled();
  await act(async () => useActiveTrip.getState().refresh("r2", "refresh"));
  expect(Alert.alert).toHaveBeenCalledTimes(1);
});

it("keeps acceptance locked across sign-out and sign-in until its HTTP request settles", async () => {
  await renderHook(() => usePlayUpdateCheck(true));
  let answerAccept!: (order: Order) => void;
  jest.spyOn(api, "acceptOffer").mockReturnValueOnce(new Promise((resolve) => { answerAccept = resolve; }));
  let acceptance!: Promise<void>;
  await act(async () => {
    const finish = useActiveTrip.getState().beginOfferAcceptance();
    acceptance = api.acceptOffer(trip.id).then((order) => useActiveTrip.getState().setOrder(order)).finally(finish);
  });
  expect(useActiveTrip.getState().acceptingOffer).toBe(true);
  jest.spyOn(api, "logout").mockResolvedValueOnce(undefined);
  await act(async () => useSession.getState().logout());
  await act(async () => useSession.setState({ user: rider, hydrated: true, loading: false, sessionWait: null }));
  await act(async () => useActiveTrip.getState().refresh(rider.id, "refresh"));
  await act(async () => downloaded());
  const promptCount = jest.mocked(Alert.alert).mock.calls.length;
  await act(async () => jest.mocked(Alert.alert).mock.calls[0]?.[2]?.[1].onPress?.());
  const prematureInstalls = native.completeUpdate.mock.calls.length;
  await act(async () => { answerAccept(trip); await acceptance; });
  expect({ promptCount, prematureInstalls }).toEqual({ promptCount: 0, prematureInstalls: 0 });
});

it.each(["older", "newer"] as const)("holds acceptance locks across cache resets when the %s operation settles first", async (first) => {
  native.checkForUpdate.mockResolvedValue({ available: true, flexibleAllowed: false, downloaded: true });
  await renderHook(() => usePlayUpdateCheck(true));
  const restart = jest.mocked(Alert.alert).mock.calls[0][2]![1].onPress!;
  let finishOld!: () => void;
  let finishNew!: () => void;
  await act(async () => {
    finishOld = useActiveTrip.getState().beginOfferAcceptance();
    useSession.getState().clearSession();
    useSession.setState({ user: rider, hydrated: true, loading: false, sessionWait: null });
    finishNew = useActiveTrip.getState().beginOfferAcceptance();
  });
  const finishFirst = first === "older" ? finishOld : finishNew;
  const finishLast = first === "older" ? finishNew : finishOld;
  await act(async () => finishFirst());
  const lockedForRemaining = useActiveTrip.getState().acceptingOffer;
  await act(async () => finishFirst());
  const lockedAfterDuplicate = useActiveTrip.getState().acceptingOffer;
  await act(async () => useActiveTrip.getState().refresh(rider.id, "refresh"));
  await act(async () => restart());
  const prematureInstalls = native.completeUpdate.mock.calls.length;
  await act(async () => finishLast());
  const lockedAfterBoth = useActiveTrip.getState().acceptingOffer;
  await act(async () => restart());
  const installsBeforeFreshRead = native.completeUpdate.mock.calls.length;
  await act(async () => useActiveTrip.getState().refresh(rider.id, "refresh"));
  await act(async () => finishFirst());
  await act(async () => jest.mocked(Alert.alert).mock.calls.at(-1)?.[2]?.[1].onPress?.());
  expect(lockedForRemaining).toBe(true);
  expect(lockedAfterDuplicate).toBe(true);
  expect(lockedAfterBoth).toBe(false);
  expect(prematureInstalls).toBe(0);
  expect(installsBeforeFreshRead).toBe(0);
  expect(native.completeUpdate).toHaveBeenCalledTimes(1);
});

it.each(["clearSession", "logout"] as const)("requires trip reconciliation if an acceptance settles after %s", async (endSession) => {
  await renderHook(() => usePlayUpdateCheck(true));
  let answerFetch!: (response: Response) => void;
  const originalFetch = global.fetch;
  const fetchMock = jest.fn(() => new Promise<Response>((resolve) => { answerFetch = resolve; }));
  global.fetch = fetchMock as unknown as typeof fetch;
  api.setTokenProvider(null);
  api.setToken("review-old-session");
  let acceptance!: Promise<void>;
  let acceptanceError: unknown;
  try {
    await act(async () => {
      const finish = useActiveTrip.getState().beginOfferAcceptance();
      acceptance = api.acceptOffer(trip.id)
        .then((order) => useActiveTrip.getState().setOrder(order))
        .catch((error: unknown) => { acceptanceError = error; })
        .finally(finish);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    jest.spyOn(api, "logout").mockResolvedValueOnce(undefined);
    await act(async () => useSession.getState()[endSession]());
    expect(useActiveTrip.getState().acceptingOffer).toBe(true);
    AppState.currentState = "background";
    await act(async () => foreground("background"));
    await act(async () => downloaded());
    AppState.currentState = "active";
    await act(async () => foreground("active"));
    expect(Alert.alert).not.toHaveBeenCalled();
    await act(async () => {
      answerFetch({ ok: true, status: 200, text: async () => JSON.stringify({ order: trip }) } as Response);
      await acceptance;
    });
    expect(acceptanceError).toBeInstanceOf(Error);
    expect((acceptanceError as Error).message).toBe("The account changed. Open this screen again.");
    expect(useSession.getState().user).toBeNull();
    expect(useActiveTrip.getState().order).toBeNull();
    expect(useActiveTrip.getState().reconciledGeneration).toBeNull();
    const promptCount = jest.mocked(Alert.alert).mock.calls.length;
    await act(async () => jest.mocked(Alert.alert).mock.calls[0]?.[2]?.[1].onPress?.());
    expect({ promptCount, prematureInstalls: native.completeUpdate.mock.calls.length })
      .toEqual({ promptCount: 0, prematureInstalls: 0 });
  } finally {
    global.fetch = originalFetch;
    api.setToken(null);
  }
});

it.each([
  { loading: true },
  { sessionWait: "in" as const },
  { hydrated: false },
])("requires a new read after same-rider session uncertainty: %j", async (uncertain) => {
  native.checkForUpdate.mockResolvedValue({ available: true, flexibleAllowed: false, downloaded: true });
  await renderHook(() => usePlayUpdateCheck(true));
  const restart = jest.mocked(Alert.alert).mock.calls[0][2]![1].onPress!;
  await act(async () => useSession.setState(uncertain));
  // A read begun before the auth transition settled must also remain unusable.
  await act(async () => useActiveTrip.getState().refresh(rider.id, "refresh"));
  await act(async () => useSession.setState({ loading: false, sessionWait: null, hydrated: true }));
  await act(async () => restart());
  expect(native.completeUpdate).not.toHaveBeenCalled();
  await act(async () => useActiveTrip.getState().refresh(rider.id, "refresh"));
  expect(Alert.alert).toHaveBeenCalledTimes(2);
});

it("requires a new trip read after the same rider's auth owner changes", async () => {
  useSession.setState({ authSource: "legacy" });
  await useActiveTrip.getState().refresh(rider.id, "refresh");
  native.checkForUpdate.mockResolvedValue({ available: true, flexibleAllowed: false, downloaded: true });
  await renderHook(() => usePlayUpdateCheck(true));
  const restart = jest.mocked(Alert.alert).mock.calls[0][2]![1].onPress!;
  await act(async () => useSession.setState({ authSource: "clerk" }));
  await act(async () => restart());
  expect(native.completeUpdate).not.toHaveBeenCalled();
  await act(async () => useActiveTrip.getState().refresh(rider.id, "refresh"));
  expect(Alert.alert).toHaveBeenCalledTimes(2);
});
