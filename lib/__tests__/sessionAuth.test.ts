import * as api from "@/lib/api";
import { bindApiUnauthorizedHandler, useSession } from "@/store/session";

const rider = {
  id: "user_rider",
  email: "rider@gridgo.local",
  name: "Rider",
  role: "rider" as const,
};

function signedIn() {
  api.setToken("tok_live");
  useSession.setState({ user: rider, loading: false, error: null });
}

describe("session clear + 401 wiring", () => {
  beforeEach(() => {
    useSession.getState().clearSession();
    api.setToken(null);
    api.setUnauthorizedHandler(null);
  });

  afterEach(() => {
    useSession.getState().clearSession();
    api.setToken(null);
    api.setUnauthorizedHandler(null);
  });

  it("clearSession drops the user and the bearer token", () => {
    signedIn();
    useSession.getState().clearSession();
    expect(useSession.getState().user).toBeNull();
    expect(api.getToken()).toBeNull();
  });

  it("logout clears the user even when the API call fails (expired token)", async () => {
    signedIn();
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: "unauthorized" }),
    }) as unknown as typeof fetch;

    try {
      // Server may reject an already-dead token; local session must still wipe.
      await expect(useSession.getState().logout()).resolves.toBeUndefined();
      expect(useSession.getState().user).toBeNull();
      expect(api.getToken()).toBeNull();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("a 401 on a protected call clears the session via the unauthorized handler", async () => {
    signedIn();
    const unbind = bindApiUnauthorizedHandler();

    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: "unauthorized" }),
    }) as unknown as typeof fetch;

    try {
      await expect(api.listOrders()).rejects.toMatchObject({ status: 401 });
      // Handler wiped session so the auth gate will leave (tabs).
      expect(useSession.getState().user).toBeNull();
      expect(api.getToken()).toBeNull();
    } finally {
      global.fetch = originalFetch;
      unbind();
    }
  });

  it("login 401 does not clear a session (wrong password, not expiry)", async () => {
    // No existing session — wrong password must not thrash handlers.
    const unbind = bindApiUnauthorizedHandler();
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: "invalid_credentials" }),
    }) as unknown as typeof fetch;

    try {
      await expect(api.login("bad@x.com", "nope")).rejects.toMatchObject({
        status: 401,
      });
      expect(useSession.getState().user).toBeNull();
      expect(api.getToken()).toBeNull();
    } finally {
      global.fetch = originalFetch;
      unbind();
    }
  });
});
