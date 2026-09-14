import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import * as api from "@/lib/api";
import { PUSH_CHANNEL_ID, pushOffer } from "@/lib/push";
import { usePush, pushSupported, DEVICE_REGISTRATION_TIMEOUT_MS, cancelDeviceRegistrations } from "@/store/push";
import { bindClerkSignOut, useSession } from "@/store/session";

/**
 * The registration lifecycle, against a mocked native module (jest.setup.js).
 *
 * The rules being checked are the ones that fail invisibly on a real phone:
 * a device registered before permission exists, a rotated token that never
 * reaches the server, and a sign-out that leaves the previous rider's job
 * offers arriving on the lock screen.
 */

const granted = { status: "granted", granted: true, canAskAgain: false };
const undetermined = { status: "undetermined", granted: false, canAskAgain: true };
const blocked = { status: "denied", granted: false, canAskAgain: false };

const mocked = Notifications as jest.Mocked<typeof Notifications>;

const riderUser = {
  id: "u1",
  email: "rider@example.ph",
  name: "Rider",
  role: "rider" as const,
};

/**
 * This file is about Android.
 *
 * The jest-expo preset runs as iOS, and two of the rules below are Android's
 * alone: the notification channel, and the `platform` value that reaches
 * `POST /devices`. Pinning the platform is what lets them be asserted at all.
 */
beforeAll(() => {
  Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
});

beforeEach(() => {
  jest.clearAllMocks();
  usePush.setState({
    supported: true,
    permission: "unknown",
    token: null,
    claimed: false,
    busy: false,
    error: null,
  });
  api.setToken("session-token");
  mocked.getPermissionsAsync.mockResolvedValue(undetermined as never);
  mocked.requestPermissionsAsync.mockResolvedValue(undetermined as never);
  mocked.getDevicePushTokenAsync.mockResolvedValue({
    type: "android",
    data: "fcm-token-a7c8d3f1",
  } as never);
});

afterEach(() => {
  api.setToken(null);
  api.setTokenProvider(null);
});

describe("pushSupported", () => {
  it("covers the two platforms this app ships to", () => {
    expect(pushSupported("android")).toBe(true);
    expect(pushSupported("ios")).toBe(true);
  });

  it("leaves web out — browser push needs a service worker this MVP has not shipped", () => {
    expect(pushSupported("web")).toBe(false);
  });
});

describe("registerIfGranted", () => {
  it("registers the FCM token against the rider once permission is granted", async () => {
    mocked.getPermissionsAsync.mockResolvedValue(granted as never);
    const register = jest.spyOn(api, "registerDevice").mockResolvedValue({
      device: {
        id: "dev_1",
        userId: "user_rider",
        platform: "android",
        tokenTail: "a7c8d3f1",
        createdAt: "2026-08-11T02:00:00.000Z",
        updatedAt: "2026-08-11T02:00:00.000Z",
      },
      created: true,
      reassigned: false,
    });

    await usePush.getState().registerIfGranted();

    expect(register).toHaveBeenCalledWith("fcm-token-a7c8d3f1", "android", expect.any(AbortSignal));
    expect(usePush.getState().token).toBe("fcm-token-a7c8d3f1");
    expect(usePush.getState().error).toBeNull();
    register.mockRestore();
  });

  it("does not register a phone that has not granted permission", async () => {
    const register = jest.spyOn(api, "registerDevice");
    await usePush.getState().registerIfGranted();
    expect(register).not.toHaveBeenCalled();
    expect(usePush.getState().permission).toBe("undetermined");
    register.mockRestore();
  });

  it("registers unclaimed when nobody is signed in", async () => {
    // A rider that installs GRIDGO and never signs in still has to hear "there
    // is a new version". No bearer exists, so the phone goes on the unclaimed
    // list and signing in claims the same token.
    api.setToken(null);
    mocked.getPermissionsAsync.mockResolvedValue(granted as never);
    const claimed = jest.spyOn(api, "registerDevice");
    const unclaimed = jest.spyOn(api, "registerDeviceUnclaimed").mockResolvedValue(undefined);

    await usePush.getState().registerIfGranted();

    expect(unclaimed).toHaveBeenCalledWith("fcm-token-a7c8d3f1", "android", expect.any(AbortSignal));
    expect(claimed).not.toHaveBeenCalled();
    expect(usePush.getState().token).toBe("fcm-token-a7c8d3f1");
    expect(usePush.getState().claimed).toBe(false);
    claimed.mockRestore();
    unclaimed.mockRestore();
  });

  it("claims the token when Clerk holds the session and getToken is empty", async () => {
    // Clerk never writes tokenMemory. Looking only at getToken() registered
    // the phone unclaimed, so a Rider broadcast had nobody to interrupt.
    api.setToken(null);
    api.setTokenProvider(async () => "clerk-jwt");
    mocked.getPermissionsAsync.mockResolvedValue(granted as never);
    const claimed = jest.spyOn(api, "registerDevice").mockResolvedValue({} as never);
    const unclaimed = jest.spyOn(api, "registerDeviceUnclaimed");

    await usePush.getState().registerIfGranted();

    expect(claimed).toHaveBeenCalledWith("fcm-token-a7c8d3f1", "android", expect.any(AbortSignal));
    expect(unclaimed).not.toHaveBeenCalled();
    expect(usePush.getState().claimed).toBe(true);
    claimed.mockRestore();
    unclaimed.mockRestore();
    api.setTokenProvider(null);
  });

  it("claims the same token the moment a rider signs in", async () => {
    mocked.getPermissionsAsync.mockResolvedValue(granted as never);
    usePush.setState({ permission: "granted", token: "fcm-token-a7c8d3f1", claimed: false });
    const claimed = jest.spyOn(api, "registerDevice").mockResolvedValue({} as never);

    await usePush.getState().registerIfGranted();

    expect(claimed).toHaveBeenCalledWith("fcm-token-a7c8d3f1", "android", expect.any(AbortSignal));
    expect(usePush.getState().claimed).toBe(true);
    claimed.mockRestore();
  });

  it("says nothing when unauthenticated registration is not deployed yet", async () => {
    // The route is provisional. A deployment without it answers 401, and that
    // is GRIDGO's schedule, not something a rider did — so no error is set and
    // nothing is shown. The phone registers for real at the next sign-in.
    api.setToken(null);
    mocked.getPermissionsAsync.mockResolvedValue(granted as never);
    for (const status of [401, 403, 404, 405]) {
      usePush.setState({ token: null, claimed: false, error: null });
      const unclaimed = jest
        .spyOn(api, "registerDeviceUnclaimed")
        .mockRejectedValue(new api.ApiError(status, { error: "unauthorized" }));

      await expect(usePush.getState().registerIfGranted()).resolves.toBeUndefined();

      expect(usePush.getState().error).toBeNull();
      expect(usePush.getState().token).toBeNull();
      expect(usePush.getState().busy).toBe(false);
      unclaimed.mockRestore();
    }
  });

  it("creates the channel before reading permission", async () => {
    // Android 8+ drops a message naming a channel that does not exist, and the
    // Android 13 dialog does not appear until one does. Ordering is the whole
    // point, so it is asserted rather than assumed.
    mocked.getPermissionsAsync.mockResolvedValue(granted as never);
    jest.spyOn(api, "registerDevice").mockResolvedValue({} as never);

    await usePush.getState().registerIfGranted();

    expect(mocked.setNotificationChannelAsync).toHaveBeenCalledWith(
      PUSH_CHANNEL_ID,
      expect.objectContaining({ name: expect.any(String) }),
    );
    const channelOrder = mocked.setNotificationChannelAsync.mock.invocationCallOrder[0];
    const permissionOrder = mocked.getPermissionsAsync.mock.invocationCallOrder[0];
    expect(channelOrder).toBeLessThan(permissionOrder);
  });

  it("survives a native module that throws — Expo Go has no remote push at all", async () => {
    // Android push was removed from Expo Go in SDK 53 and the module throws
    // rather than warns. That must cost push and nothing else.
    mocked.getPermissionsAsync.mockRejectedValue(new Error("Expo Go does not support push"));
    await expect(usePush.getState().registerIfGranted()).resolves.toBeUndefined();
    expect(usePush.getState().permission).toBe("unknown");
  });

  it("keeps a failed registration to itself", async () => {
    // A sign-in must not fail because FCM did.
    mocked.getPermissionsAsync.mockResolvedValue(granted as never);
    const register = jest
      .spyOn(api, "registerDevice")
      .mockRejectedValue(new api.ApiError(400, { error: "device_token_too_long" }));

    await expect(usePush.getState().registerIfGranted()).resolves.toBeUndefined();

    // Plain language, never the raw code: this string can reach the card.
    expect(usePush.getState().error).not.toMatch(/device_token_too_long/);
    expect(usePush.getState().error).toMatch(/still arrive in the app/i);
    expect(usePush.getState().busy).toBe(false);
    register.mockRestore();
  });
});

describe("enable", () => {
  it("raises the dialog and registers when the rider says yes", async () => {
    mocked.requestPermissionsAsync.mockResolvedValue(granted as never);
    mocked.getPermissionsAsync.mockResolvedValue(granted as never);
    const register = jest.spyOn(api, "registerDevice").mockResolvedValue({} as never);

    await expect(usePush.getState().enable()).resolves.toBe(true);

    expect(mocked.requestPermissionsAsync).toHaveBeenCalled();
    expect(register).toHaveBeenCalledWith("fcm-token-a7c8d3f1", "android", expect.any(AbortSignal));
    register.mockRestore();
  });

  it("records a refusal as blocked and registers nothing", async () => {
    mocked.requestPermissionsAsync.mockResolvedValue(blocked as never);
    const register = jest.spyOn(api, "registerDevice");

    await expect(usePush.getState().enable()).resolves.toBe(false);

    expect(usePush.getState().permission).toBe("blocked");
    expect(usePush.getState().busy).toBe(false);
    expect(register).not.toHaveBeenCalled();
    register.mockRestore();
  });
});

describe("adoptToken", () => {
  it("re-registers when Firebase reissues the token", async () => {
    // The silent failure: a rotated token stops delivering and nothing looks
    // wrong until somebody notices they stopped being offered work.
    usePush.setState({ permission: "granted", token: "old-token" });
    mocked.getDevicePushTokenAsync.mockResolvedValue({
      type: "android",
      data: "rotated-token",
    } as never);
    const register = jest.spyOn(api, "registerDevice").mockResolvedValue({} as never);

    await usePush.getState().adoptToken("rotated-token");

    expect(register).toHaveBeenCalledWith("rotated-token", "android", expect.any(AbortSignal));
    register.mockRestore();
  });

  it("ignores a rotation event for the token it already holds", async () => {
    usePush.setState({ permission: "granted", token: "same-token" });
    const register = jest.spyOn(api, "registerDevice");
    await usePush.getState().adoptToken("same-token");
    expect(register).not.toHaveBeenCalled();
    register.mockRestore();
  });
});

describe("signing out", () => {
  it("sends the device token with the sign-out so the phone stops receiving", async () => {
    // It has to ride along with logout: afterwards the bearer token is dead,
    // so POST /devices/unregister could no longer authenticate and this phone
    // would keep waking up for the previous rider's job offers.
    usePush.setState({ token: "fcm-token-a7c8d3f1", claimed: true, permission: "granted" });
    useSession.setState({ user: riderUser });
    const logout = jest.spyOn(api, "logout").mockResolvedValue(undefined);
    const unclaimed = jest.spyOn(api, "registerDeviceUnclaimed").mockResolvedValue(undefined);

    await useSession.getState().logout();

    expect(logout).toHaveBeenCalledWith("fcm-token-a7c8d3f1", expect.any(Promise));
    expect(useSession.getState().user).toBeNull();
    expect(usePush.getState().claimed).toBe(false);
    logout.mockRestore();
    unclaimed.mockRestore();
  });

  it("signs out normally on a phone that never had a token", async () => {
    useSession.setState({ user: riderUser });
    const logout = jest.spyOn(api, "logout").mockResolvedValue(undefined);

    await useSession.getState().logout();

    expect(logout).toHaveBeenCalledWith(null, expect.any(Promise));
    logout.mockRestore();
  });

  it("puts the phone back on the unclaimed list rather than off it entirely", async () => {
    // Signing out is not uninstalling. The phone must stop receiving the
    // previous rider's job offers and stay reachable for "there is a new
    // version" — which is one unclaimed registration, not none.
    api.setToken(null);
    usePush.setState({ permission: "granted", token: "fcm-token-a7c8d3f1", claimed: true });
    const unclaimed = jest.spyOn(api, "registerDeviceUnclaimed").mockResolvedValue(undefined);

    await usePush.getState().release();

    expect(unclaimed).toHaveBeenCalledWith("fcm-token-a7c8d3f1", "android", expect.any(AbortSignal));
    expect(usePush.getState().claimed).toBe(false);
    unclaimed.mockRestore();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

it.each(["native token", "bearer", "unclaimed request"])("cancels stalled %s work and tears down Clerk", async (stage) => {
  jest.useFakeTimers();
  const stalled = deferred<never>();
  const identity = jest.fn(async () => undefined);
  const unbind = bindClerkSignOut(identity);
  usePush.setState({ permission: "granted" });
  const register = jest.spyOn(api, "registerDevice").mockResolvedValue({} as never);
  const unclaimed = jest.spyOn(api, "registerDeviceUnclaimed").mockResolvedValue(undefined);
  const logout = jest.spyOn(api, "logout").mockResolvedValue(undefined);
  if (stage === "native token") mocked.getDevicePushTokenAsync.mockReturnValueOnce(stalled.promise);
  if (stage === "bearer") api.setTokenProvider(() => stalled.promise);
  if (stage === "unclaimed request") {
    api.setToken(null);
    unclaimed.mockReturnValueOnce(stalled.promise);
  }
  try {
    const old = usePush.getState().registerIfGranted();
    await jest.advanceTimersByTimeAsync(0);
    const signingOut = useSession.getState().logout();
    await jest.advanceTimersByTimeAsync(4_000);
    await signingOut;
    await old;
    expect(logout).toHaveBeenCalledTimes(1);
    expect(identity).toHaveBeenCalledTimes(1);
    if (stage === "unclaimed request") expect(unclaimed.mock.calls[0][2]?.aborted).toBe(true);
    stalled.resolve({ type: "android", data: "obsolete" } as never);
    await jest.advanceTimersByTimeAsync(0);
    expect(register).not.toHaveBeenCalled();
    expect(usePush.getState().token).not.toBe("obsolete");
  } finally {
    cancelDeviceRegistrations();
    await jest.advanceTimersByTimeAsync(0);
    unbind();
    jest.restoreAllMocks();
    jest.useRealTimers();
  }
});

it.each(["native token", "bearer", "registration request"])("offers retry after a %s timeout", async (stage) => {
  jest.useFakeTimers();
  const stalled = deferred<never>();
  usePush.setState({ permission: "granted" });
  const register = jest.spyOn(api, "registerDevice").mockResolvedValue({} as never);
  if (stage === "native token") mocked.getDevicePushTokenAsync.mockReturnValueOnce(stalled.promise);
  if (stage === "bearer") jest.spyOn(api, "sessionBearerPresent").mockReturnValueOnce(stalled.promise);
  if (stage === "registration request") register.mockReturnValueOnce(stalled.promise);
  try {
    const pending = usePush.getState().registerIfGranted();
    await jest.advanceTimersByTimeAsync(DEVICE_REGISTRATION_TIMEOUT_MS);
    await pending;
    const state = usePush.getState();
    expect(state).toMatchObject({
      busy: false,
      claimed: false,
      error: "Could not turn on alerts for this phone. Your alerts still arrive in the app.",
    });
    expect(pushOffer({ ...state, signedIn: true, failed: Boolean(state.error) })).toBe("retry");
    if (stage === "registration request") expect(register.mock.calls[0][2]?.aborted).toBe(true);
    stalled.resolve({ type: "android", data: "obsolete" } as never);
    await jest.advanceTimersByTimeAsync(0);
    expect(usePush.getState().error).toBe(state.error);
    expect(usePush.getState().token).not.toBe("obsolete");
    await usePush.getState().registerIfGranted();
    expect(usePush.getState()).toMatchObject({
      busy: false,
      claimed: true,
      token: "fcm-token-a7c8d3f1",
      error: null,
    });
  } finally {
    cancelDeviceRegistrations();
    jest.restoreAllMocks();
    jest.useRealTimers();
  }
});

it("releases the registration queue at its deadline and ignores a late token", async () => {
  jest.useFakeTimers();
  const stalled = deferred<Notifications.DevicePushToken>();
  mocked.getDevicePushTokenAsync.mockReturnValueOnce(stalled.promise);
  usePush.setState({ permission: "granted" });
  const register = jest.spyOn(api, "registerDevice").mockResolvedValue({} as never);
  try {
    const first = usePush.getState().registerIfGranted();
    const second = usePush.getState().registerIfGranted();
    await jest.advanceTimersByTimeAsync(DEVICE_REGISTRATION_TIMEOUT_MS);
    await Promise.all([first, second]);
    expect(register).toHaveBeenCalledTimes(1);
    stalled.resolve({ type: "android", data: "obsolete" } as never);
    await jest.advanceTimersByTimeAsync(0);
    expect(register).toHaveBeenCalledTimes(1);
    expect(usePush.getState().token).toBe("fcm-token-a7c8d3f1");
  } finally {
    jest.restoreAllMocks();
    jest.useRealTimers();
  }
});

it.each(["native token", "bearer"])("finishes push registration when approval changes during %s lookup", async (stage) => {
  jest.useFakeTimers();
  useSession.setState({ user: { ...riderUser, verificationStatus: "pending" } });
  usePush.setState({ permission: "granted", token: "old-token", claimed: true });
  const token = deferred<Notifications.DevicePushToken>();
  const bearer = deferred<boolean>();
  if (stage === "native token") mocked.getDevicePushTokenAsync.mockReturnValueOnce(token.promise);
  else jest.spyOn(api, "sessionBearerPresent").mockReturnValueOnce(bearer.promise);
  const register = jest.spyOn(api, "registerDevice").mockResolvedValue({} as never);
  jest.spyOn(api, "me").mockResolvedValue({ ...riderUser, verificationStatus: "approved" });
  try {
    const pending = usePush.getState().registerIfGranted();
    await jest.advanceTimersByTimeAsync(0);
    await useSession.getState().refreshUser();
    expect(useSession.getState().user?.verificationStatus).toBe("approved");
    token.resolve({ type: "android", data: "rotated-token" } as never);
    bearer.resolve(true);
    await pending;
    expect(register).toHaveBeenCalledWith(
      stage === "native token" ? "rotated-token" : "fcm-token-a7c8d3f1",
      "android",
      expect.any(AbortSignal),
    );
    expect(register.mock.calls[0][2]?.aborted).toBe(false);
    expect(usePush.getState()).toMatchObject({ busy: false, claimed: true, error: null });
  } finally {
    cancelDeviceRegistrations();
    jest.restoreAllMocks();
    jest.useRealTimers();
  }
});

it("cancels an old account's token lookup and lets the next account register", async () => {
  jest.useFakeTimers();
  useSession.setState({ user: riderUser });
  usePush.setState({ permission: "granted" });
  const token = deferred<Notifications.DevicePushToken>();
  mocked.getDevicePushTokenAsync.mockReturnValueOnce(token.promise);
  const register = jest.spyOn(api, "registerDevice").mockResolvedValue({} as never);
  try {
    const old = usePush.getState().registerIfGranted();
    await jest.advanceTimersByTimeAsync(0);
    expect(usePush.getState().busy).toBe(true);
    useSession.setState({ user: { ...riderUser, id: "next-rider" } });
    await old;
    expect(usePush.getState()).toMatchObject({ busy: false, error: null });
    expect(register).not.toHaveBeenCalled();
    await usePush.getState().registerIfGranted();
    token.resolve({ type: "android", data: "obsolete-token" } as never);
    await jest.advanceTimersByTimeAsync(0);
    expect(register).toHaveBeenCalledTimes(1);
    expect(usePush.getState()).toMatchObject({ token: "fcm-token-a7c8d3f1", claimed: true, busy: false });
  } finally {
    cancelDeviceRegistrations();
    jest.restoreAllMocks();
    jest.useRealTimers();
  }
});
