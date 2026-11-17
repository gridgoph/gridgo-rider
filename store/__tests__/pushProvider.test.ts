import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import * as api from "@/lib/api";
import type { FirebaseMessaging } from "@/lib/firebaseMessaging";
import { subscribePushTokenRotation, usePush } from "@/store/push";

let mockFirebase: FirebaseMessaging | null = null;
jest.mock("@/lib/firebaseMessaging", () => ({
  getFirebaseMessaging: () => mockFirebase,
}));

const native = Notifications as jest.Mocked<typeof Notifications>;
const originalOS = Platform.OS;

// Keep the store and both API registration paths real: a correct native token
// is useless if POST /devices assigns it to the wrong delivery provider.
describe.each([
  { source: "Firebase iOS", platform: "ios", provider: "fcm", channel: "ios", firebase: true },
  { source: "native iOS", platform: "ios", provider: "apns", channel: "ios", firebase: false },
  { source: "Android", platform: "android", provider: "fcm", channel: "apk", firebase: false },
] as const)("$source registration body", ({ platform, provider, channel, firebase }) => {
  let fetchSpy: jest.SpyInstance;
  let refresh: ((token: string) => void) | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, "OS", { value: platform, configurable: true });
    usePush.setState({ supported: true, permission: "granted", token: null, claimed: false, busy: false, error: null });
    api.setTokenProvider(null);
    refresh = undefined;
    mockFirebase = firebase ? {
      getToken: async () => "firebase-token:" + "x".repeat(64),
      onTokenRefresh: (listener) => {
        refresh = listener;
        return () => undefined;
      },
    } : null;
    native.getDevicePushTokenAsync.mockResolvedValue({ type: platform, data: "a".repeat(64) });
    fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 201 }));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    api.setToken(null);
    mockFirebase = null;
    Object.defineProperty(Platform, "OS", { value: originalOS, configurable: true });
  });

  it.each([false, true])("carries the acquired provider when claimed=%s", async (claimed) => {
    api.setToken(claimed ? "rider-session" : null);

    await usePush.getState().registerIfGranted();

    expectRegistration(firebase ? "firebase-token:" + "x".repeat(64) : "a".repeat(64), claimed);
  });

  it.each([false, true])("carries the rotated provider when claimed=%s", async (claimed) => {
    api.setToken(claimed ? "rider-session" : null);
    const token = firebase ? "rotated-fcm:" + "y".repeat(64) : "b".repeat(64);
    let registration: Promise<void> | undefined;
    const unsubscribe = subscribePushTokenRotation((rotated) => {
      registration = usePush.getState().adoptToken(rotated);
    });
    try {
      if (firebase) refresh?.(token);
      else native.addPushTokenListener.mock.calls[0][0]({ type: platform, data: token });
      await registration;

      expectRegistration(token, claimed);
      expect(native.getDevicePushTokenAsync).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
    }
  });

  function expectRegistration(token: string, claimed: boolean): void {
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/devices$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      token, platform, tokenProvider: provider, appRole: "rider", installChannel: channel,
    });
    expect((init.headers as Record<string, string>).Authorization).toBe(claimed ? "Bearer rider-session" : undefined);
    expect(usePush.getState()).toMatchObject({ token, claimed, busy: false, error: null });
  }
});
