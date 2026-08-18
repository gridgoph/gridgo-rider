import * as api from "@/lib/api";
import { resolveAuthRedirect } from "@/lib/authGate";
import { bindApiUnauthorizedHandler, useSession } from "@/store/session";

/**
 * A rider between verifying their email and filing their application.
 *
 * Clerk has authenticated them; GRIDGO holds no rider record, so `/auth/me`
 * answers 401. That answer used to be read as a dead bearer and a wrong
 * password at once: the session was wiped, Clerk was signed out, and the rider
 * was dropped on the sign-in screen under "Wrong email or password" — with a
 * correct password, seconds after a correct code. The application could not be
 * filed because the session it had to be filed against was gone.
 */

const fetchMock = jest.fn();

function respond(status: number, body: unknown) {
  fetchMock.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  });
}

describe("a Clerk identity GRIDGO has no rider record for", () => {
  let unbind: (() => void) | undefined;

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    useSession.getState().clearSession();
    api.setToken(null);
    api.setTokenProvider(null);
    api.setUnauthorizedHandler(null);
    unbind = bindApiUnauthorizedHandler();
  });

  afterEach(() => {
    unbind?.();
    useSession.getState().clearSession();
    api.setToken(null);
    api.setTokenProvider(null);
    api.setUnauthorizedHandler(null);
  });

  it("reports an unassigned identity instead of a failed sign-in", async () => {
    api.setTokenProvider(() => Promise.resolve("clerk_jwt"));
    respond(401, { error: "unauthorized" });

    const adoption = await useSession.getState().adoptClerkSession();

    expect(adoption).toBe("unassigned");
    expect(useSession.getState()).toMatchObject({
      user: null,
      needsApplication: true,
      // Nothing to apologise for: the password was right and the code was right.
      error: null,
      showErrorOnLogin: false,
    });
  });

  it("leaves the bearer installed so the application can authenticate", async () => {
    const provider = jest.fn(() => Promise.resolve("clerk_jwt"));
    api.setTokenProvider(provider);
    respond(401, { error: "unauthorized" });

    await useSession.getState().adoptClerkSession();

    // The 401 must not have reached the handler that wipes local auth, and the
    // Clerk token provider must survive — enrollment is the very next request.
    respond(200, { user: { id: "u1", email: "a@b.c", name: "A", role: "rider" } });
    await api.me();
    expect(provider).toHaveBeenCalled();
    expect(fetchMock.mock.calls[1]?.[1]?.headers?.Authorization).toBe("Bearer clerk_jwt");
  });

  it("routes them to apply rather than to a sign-in screen they cannot use", () => {
    expect(resolveAuthRedirect(false, ["(auth)", "login"], false, true)).toBe(
      "/(auth)/signup",
    );
    expect(resolveAuthRedirect(false, ["sso-callback"], false, true)).toBe(
      "/(auth)/signup",
    );
    // Already applying — including the emailed-code step, which is the same
    // screen. Redirecting here would remount it and lose the typed code.
    expect(resolveAuthRedirect(false, ["(auth)", "signup"], false, true)).toBeNull();
  });

  it("does not strand a rider on sign-in when a stored error is also set", () => {
    // Needing to apply outranks the stored-error redirect: typing the password
    // again cannot create the missing rider record.
    expect(resolveAuthRedirect(false, ["(auth)", "signup"], true, true)).toBeNull();
  });

  it("keeps a genuine failure a failure", async () => {
    api.setTokenProvider(() => Promise.resolve("clerk_jwt"));
    respond(500, { error: "server_error" });

    const adoption = await useSession.getState().adoptClerkSession();

    expect(adoption).toBe("rejected");
    expect(useSession.getState()).toMatchObject({
      needsApplication: false,
      showErrorOnLogin: true,
    });
    expect(useSession.getState().error).toBeTruthy();
  });

  it("discards a probe answer that lands after the application succeeded", async () => {
    api.setTokenProvider(() => Promise.resolve("clerk_jwt"));

    // The probe is still in flight when the rider's application lands.
    let release: (() => void) | undefined;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              ok: false,
              status: 401,
              text: async () => JSON.stringify({ error: "unauthorized" }),
            });
        }),
    );

    const probe = useSession.getState().adoptClerkSession();

    respond(201, { membership: { role: "rider" } });
    respond(200, { user: { id: "u1", email: "a@b.c", name: "A", role: "rider" } });
    const enrolled = await useSession.getState().enrollRider(
      { profile: { phone: "0917", vehicleType: "motorcycle", plateNumber: "ABC 123" } },
      "key_1",
    );
    expect(enrolled).toBe(true);

    release?.();
    await probe;

    // The stale "never heard of you" must not erase the rider just created.
    expect(useSession.getState()).toMatchObject({
      authSource: "clerk",
      needsApplication: false,
    });
    expect(useSession.getState().user).toMatchObject({ role: "rider" });
  });
});

/**
 * A rider who finished, twice.
 *
 * The application reaches GRIDGO and the reply does not — a dropped response, a
 * backgrounded app, a second tap. The retry is refused, because the case it
 * would open is already open. Read as a failure, that leaves a rider who is
 * done looking at a form with nothing left to send and no way onward.
 */
describe("an application that already landed", () => {
  let unbind: (() => void) | undefined;

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    useSession.getState().clearSession();
    api.setToken(null);
    api.setTokenProvider(() => Promise.resolve("clerk_jwt"));
    api.setUnauthorizedHandler(null);
    unbind = bindApiUnauthorizedHandler();
  });

  afterEach(() => {
    unbind?.();
    useSession.getState().clearSession();
    api.setToken(null);
    api.setTokenProvider(null);
    api.setUnauthorizedHandler(null);
  });

  it("lets the rider in instead of reporting a failure", async () => {
    respond(409, { error: "application_already_exists" });
    respond(200, { user: { id: "u1", email: "a@b.c", name: "A", role: "rider" } });

    const enrolled = await useSession.getState().enrollRider(
      { profile: { phone: "0917", vehicleType: "motorcycle", plateNumber: "ABC 123" } },
      "key_1",
    );

    expect(enrolled).toBe(true);
    expect(useSession.getState()).toMatchObject({
      authSource: "clerk",
      needsApplication: false,
      error: null,
    });
    expect(useSession.getState().user).toMatchObject({ role: "rider" });
  });

  it("still reports a failure when the account cannot be read back", async () => {
    respond(409, { error: "application_already_exists" });
    respond(401, { error: "unauthorized" });

    const enrolled = await useSession.getState().enrollRider(
      { profile: { phone: "0917", vehicleType: "motorcycle", plateNumber: "ABC 123" } },
      "key_1",
    );

    expect(enrolled).toBe(false);
    expect(useSession.getState().user).toBeNull();
    expect(useSession.getState().error).toBeTruthy();
  });

  it("does not tell a signed-in rider to sign in when the address is taken", async () => {
    respond(409, { error: "email_already_registered" });

    const enrolled = await useSession.getState().enrollRider(
      { profile: { phone: "0917", vehicleType: "motorcycle", plateNumber: "ABC 123" } },
      "key_1",
    );

    expect(enrolled).toBe(false);
    // Only the application was attempted: this is a settled conflict between two
    // sign-ins, so re-reading the account cannot resolve it.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const message = useSession.getState().error ?? "";
    expect(message).toMatch(/different sign-in/i);
    expect(message).not.toMatch(/sign in instead/i);
  });
});
