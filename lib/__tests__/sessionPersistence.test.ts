import AsyncStorage from "@react-native-async-storage/async-storage";

import * as api from "@/lib/api";
import { canGateNavigate, resolveAuthRedirect } from "@/lib/authGate";
import {
  parseStoredSession,
  serialiseSession,
  SESSION_STORAGE_KEY,
} from "@/lib/sessionStorage";
import { bindApiUnauthorizedHandler, useSession } from "@/store/session";

const rider = {
  id: "user_rider",
  email: "rider@gridgo.local",
  name: "Carlo Rider",
  role: "rider" as const,
};

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    status,
    text: async () => JSON.stringify(body),
  }) as unknown as typeof fetch;
}

describe("a signed-in rider stays signed in across launches", () => {
  const originalFetch = global.fetch;

  beforeEach(async () => {
    await AsyncStorage.clear();
    api.setToken(null);
    useSession.setState({ user: null, hydrated: false, loading: false, error: null });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("writes the token and the rider when login succeeds", async () => {
    mockFetchOnce({ token: "tok_live", user: rider });

    await useSession.getState().login(rider.email, "demo");

    expect(useSession.getState().user).toEqual(rider);
    expect(await AsyncStorage.getItem(SESSION_STORAGE_KEY)).toBe(
      serialiseSession({ token: "tok_live", user: rider }),
    );
  });

  it("reads the session back on the next launch, without a network call", async () => {
    await AsyncStorage.setItem(
      SESSION_STORAGE_KEY,
      serialiseSession({ token: "tok_live", user: rider }),
    );
    global.fetch = jest.fn(() => {
      throw new Error("no network call expected during hydration");
    }) as unknown as typeof fetch;

    await useSession.getState().hydrate();

    expect(useSession.getState().user).toEqual(rider);
    expect(useSession.getState().hydrated).toBe(true);
    // The bearer is back in the API client, so the first screen can load data.
    expect(api.getToken()).toBe("tok_live");
  });

  it("forgets the session on sign-out, so the next launch lands on login", async () => {
    await AsyncStorage.setItem(
      SESSION_STORAGE_KEY,
      serialiseSession({ token: "tok_live", user: rider }),
    );
    await useSession.getState().hydrate();
    mockFetchOnce({ ok: true });

    await useSession.getState().logout();

    expect(useSession.getState().user).toBeNull();
    expect(await AsyncStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it("keeps the stored session when a 401 came back from a request with no bearer", async () => {
    // The cold-start bug: a screen fired its load before hydration finished,
    // the server answered 401, and the handler deleted the session that was
    // still being read back.
    await AsyncStorage.setItem(
      SESSION_STORAGE_KEY,
      serialiseSession({ token: "tok_live", user: rider }),
    );
    api.setToken(null);
    const unbind = bindApiUnauthorizedHandler();
    mockFetchOnce({ error: "unauthorized" }, false, 401);

    try {
      await expect(api.listOrders()).rejects.toMatchObject({ status: 401 });
      expect(await AsyncStorage.getItem(SESSION_STORAGE_KEY)).not.toBeNull();
    } finally {
      unbind();
    }
  });

  it("forgets the session when a 401 proves the token is dead", async () => {
    await AsyncStorage.setItem(
      SESSION_STORAGE_KEY,
      serialiseSession({ token: "tok_live", user: rider }),
    );
    await useSession.getState().hydrate();

    useSession.getState().clearSession();

    expect(await AsyncStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });
});

describe("parseStoredSession refuses anything it cannot trust", () => {
  it("accepts a well-formed rider session", () => {
    const raw = serialiseSession({ token: "tok", user: rider });
    expect(parseStoredSession(raw)).toEqual({ token: "tok", user: rider });
  });

  it("rejects absent, malformed, and half-written records", () => {
    expect(parseStoredSession(null)).toBeNull();
    expect(parseStoredSession("")).toBeNull();
    expect(parseStoredSession("{not json")).toBeNull();
    expect(parseStoredSession(JSON.stringify({ user: rider }))).toBeNull();
    expect(parseStoredSession(JSON.stringify({ token: "  " , user: rider }))).toBeNull();
    expect(parseStoredSession(JSON.stringify({ token: "tok" }))).toBeNull();
    expect(
      parseStoredSession(JSON.stringify({ token: "tok", user: { id: "u" } })),
    ).toBeNull();
  });

  it("rejects a session belonging to another role's app", () => {
    const supplier = { ...rider, role: "supplier" as const };
    expect(parseStoredSession(JSON.stringify({ token: "tok", user: supplier }))).toBeNull();
  });
});

/**
 * The crash this guards against: `router.replace` from the auth gate before the
 * root navigator existed threw "Attempted to navigate before mounting the Root
 * Layout component" and replaced the whole app with an error screen. It fired
 * on any cold start that began on a protected route — a deep link, a
 * notification tap, or a browser reload on Expo web.
 */
describe("the auth gate does not navigate before it is allowed to", () => {
  it("waits for the root navigator to exist", () => {
    expect(canGateNavigate({ rootNavigatorKey: undefined, sessionHydrated: true })).toBe(false);
    expect(canGateNavigate({ rootNavigatorKey: null, sessionHydrated: true })).toBe(false);
    expect(canGateNavigate({ rootNavigatorKey: "", sessionHydrated: true })).toBe(false);
  });

  it("waits for the stored session to be read back", () => {
    expect(canGateNavigate({ rootNavigatorKey: "stack-1", sessionHydrated: false })).toBe(false);
  });

  it("navigates once both are true", () => {
    expect(canGateNavigate({ rootNavigatorKey: "stack-1", sessionHydrated: true })).toBe(true);
  });

  it("still sends a signed-out rider off a deep-linked trip step", () => {
    expect(resolveAuthRedirect(false, ["trip", "pickup"])).toBe("/(auth)/login");
    expect(resolveAuthRedirect(false, ["alerts"])).toBe("/(auth)/login");
    expect(resolveAuthRedirect(true, ["trip", "pickup"])).toBeNull();
  });
});
