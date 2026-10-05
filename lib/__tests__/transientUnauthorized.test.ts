import * as api from "@/lib/api";
import { bindApiUnauthorizedHandler, bindClerkSignOut, useSession } from "@/store/session";

/*
  gridgo-rider#77: an idle rider on Active was signed out of Clerk (session
  `removed`) by one 401 on the 30-second `/auth/me` poll. gridgo-api answers
  401 to any token it could not verify — one that expired while a slow request
  queued, or a key lookup that timed out under load — so a single 401 on a
  cached Clerk JWT is not proof the session is gone.
*/

const rider = {
  id: "user_rider",
  email: "rider@gridgo.local",
  name: "Rider",
  role: "rider" as const,
};

type Reply = { status: number; body: unknown } | Error;

function reply(status: number, body: unknown): Reply {
  return { status, body };
}

/** Answer each fetch with the next reply; the last one repeats. */
function mockFetch(replies: Reply[]) {
  let index = 0;
  return jest.fn(async () => {
    const next = replies[Math.min(index, replies.length - 1)];
    index += 1;
    if (next instanceof Error) throw next;
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      text: async () => JSON.stringify(next.body),
    };
  });
}

function sentBearers(fetchMock: jest.Mock): string[] {
  return fetchMock.mock.calls.map(
    (call) => (call as unknown as [string, RequestInit])[1].headers as Record<string, string>,
  ).map((headers) => headers.Authorization);
}

const originalFetch = global.fetch;
let clerkSignOut: jest.Mock;
let unbindHandler: () => void;
let unbindSignOut: () => void;

/** A rider signed in through Clerk, idle on Active. */
function clerkRider(provider: (options?: { skipCache?: boolean }) => Promise<string | null>) {
  api.setTokenProvider(provider);
  useSession.setState({ user: rider, authSource: "clerk", loading: false, error: null });
}

beforeEach(() => {
  clerkSignOut = jest.fn(async () => undefined);
  unbindSignOut = bindClerkSignOut(clerkSignOut);
  unbindHandler = bindApiUnauthorizedHandler();
});

afterEach(() => {
  global.fetch = originalFetch;
  unbindHandler();
  useSession.setState({ authSource: null });
  useSession.getState().clearSession();
  unbindSignOut();
  api.setToken(null);
  api.setTokenProvider(null);
});

it("retries a 401 once with a freshly minted Clerk token and keeps the rider signed in", async () => {
  const provider = jest.fn(async (options?: { skipCache?: boolean }) =>
    options?.skipCache ? "clerk_fresh" : "clerk_cached");
  clerkRider(provider);
  const fetchMock = mockFetch([reply(401, { error: "unauthorized" }), reply(200, { user: rider })]);
  global.fetch = fetchMock as unknown as typeof fetch;

  await expect(api.me()).resolves.toMatchObject({ id: rider.id });

  expect(sentBearers(fetchMock)).toEqual(["Bearer clerk_cached", "Bearer clerk_fresh"]);
  expect(provider).toHaveBeenLastCalledWith({ skipCache: true });
  expect(useSession.getState().user).toMatchObject({ id: rider.id });
  expect(clerkSignOut).not.toHaveBeenCalled();
});

it("keeps the rider when Clerk cannot mint a fresh token (slow or offline refresh)", async () => {
  const provider = jest.fn(async (options?: { skipCache?: boolean }) => {
    if (options?.skipCache) throw new Error("network request failed");
    return "clerk_cached";
  });
  clerkRider(provider);
  const fetchMock = mockFetch([reply(401, { error: "unauthorized" })]);
  global.fetch = fetchMock as unknown as typeof fetch;

  await expect(api.listOrders()).rejects.toMatchObject({ status: 401 });

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(useSession.getState().user).toMatchObject({ id: rider.id });
  expect(clerkSignOut).not.toHaveBeenCalled();
});

it("keeps the rider when the fresh mint answers no token", async () => {
  clerkRider(async (options) => (options?.skipCache ? null : "clerk_cached"));
  global.fetch = mockFetch([reply(401, { error: "unauthorized" })]) as unknown as typeof fetch;

  await expect(api.listOrders()).rejects.toMatchObject({ status: 401 });

  expect(useSession.getState().user).toMatchObject({ id: rider.id });
  expect(clerkSignOut).not.toHaveBeenCalled();
});

it("signs out only when the API refuses the freshly minted token too", async () => {
  clerkRider(async (options) => (options?.skipCache ? "clerk_fresh" : "clerk_cached"));
  const fetchMock = mockFetch([reply(401, { error: "unauthorized" })]);
  global.fetch = fetchMock as unknown as typeof fetch;

  await expect(api.listOrders()).rejects.toMatchObject({ status: 401 });

  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(useSession.getState().user).toBeNull();
  expect(clerkSignOut).toHaveBeenCalledTimes(1);
});

it("shares one fresh mint between polls refused in the same moment", async () => {
  const provider = jest.fn(async (options?: { skipCache?: boolean }) =>
    options?.skipCache ? "clerk_fresh" : "clerk_cached");
  clerkRider(provider);
  global.fetch = jest.fn(async (_url: string, init: RequestInit) => {
    const bearer = (init.headers as Record<string, string>).Authorization;
    const ok = bearer === "Bearer clerk_fresh";
    return { ok, status: ok ? 200 : 401, text: async () => JSON.stringify(ok ? [] : { error: "unauthorized" }) };
  }) as unknown as typeof fetch;

  await Promise.all([api.listOrders(), api.listOrders(), api.listOrders()]);

  expect(provider.mock.calls.filter(([options]) => options?.skipCache)).toHaveLength(1);
  expect(clerkSignOut).not.toHaveBeenCalled();
});

it("does not retry an unmapped identity, which a fresher token cannot change", async () => {
  const provider = jest.fn(async () => "clerk_cached");
  clerkRider(provider);
  const fetchMock = mockFetch([reply(401, { error: "unmapped_identity" })]);
  global.fetch = fetchMock as unknown as typeof fetch;

  await expect(api.listOrders()).rejects.toMatchObject({ status: 401 });

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(provider).not.toHaveBeenCalledWith({ skipCache: true });
});

it.each([
  ["a 5xx", [reply(503, { error: "unavailable" })]],
  ["a dropped connection", [new TypeError("Network request failed")]],
])("keeps the rider through %s without minting a token", async (_name, replies) => {
  const provider = jest.fn(async () => "clerk_cached");
  clerkRider(provider);
  global.fetch = mockFetch(replies) as unknown as typeof fetch;

  await expect(api.listOrders()).rejects.toBeDefined();
  await useSession.getState().refreshUser();

  expect(provider).not.toHaveBeenCalledWith({ skipCache: true });
  expect(useSession.getState().user).toMatchObject({ id: rider.id });
  expect(clerkSignOut).not.toHaveBeenCalled();
});

it("keeps the legacy demo bearer rule: its 401 is the server's verdict", async () => {
  api.setToken("tok_legacy");
  useSession.setState({ user: rider, authSource: "legacy", loading: false, error: null });
  const fetchMock = mockFetch([reply(401, { error: "unauthorized" })]);
  global.fetch = fetchMock as unknown as typeof fetch;

  await expect(api.listOrders()).rejects.toMatchObject({ status: 401 });

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(useSession.getState().user).toBeNull();
  expect(clerkSignOut).not.toHaveBeenCalled();
});
