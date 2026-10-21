import * as api from "@/lib/api";
import { reauthorizeWithApple } from "@/lib/appleReauthorize";
import { appleRevocationFailure } from "@/lib/appleRevocation";
import { forgetAppleRevocation, useAccountDeletion } from "@/store/accountDeletion";
import { bindApiUnauthorizedHandler, bindClerkSignOut, useSession } from "@/store/session";

/*
  A 401 on Sign in with Apple's disconnect, through the real transport and the
  real session store. Normally a confirmed 401 clears the session at once, and
  the auth gate then removes Delete account before it can say that the
  deletion request still stands. The Apple step holds that back: the reason is
  shown first, and the session ends when the rider taps "Sign in again" or
  leaves the screen.
*/

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  createPrivacyRequest: jest.fn(async () => ({
    id: "pr_1",
    kind: "deletion",
    status: "pending",
    requestedAt: "2026-10-21T02:00:00.000Z",
    dueAt: "2026-11-20T02:00:00.000Z",
  })),
}));
jest.mock("@/lib/appleReauthorize", () => ({ reauthorizeWithApple: jest.fn() }));

const rider = { id: "user_rider", email: "rider@gridgo.local", name: "Rider", role: "rider" as const };
const askApple = reauthorizeWithApple as jest.Mock;
const originalFetch = global.fetch;
let unbindHandler: () => void;
let unbindSignOut: () => void;
let fetchMock: jest.Mock;

/** Answers by route; the revocation and the privacy list refuse the bearer. */
function answer(path: string) {
  if (path.endsWith("/apple-revocation") || path.endsWith("/me/privacy-requests")) {
    return { status: 401, body: { error: "unauthorized" } };
  }
  if (path.endsWith("/me/account-deletion-request")) {
    return { status: 200, body: { ok: true, request: { id: "adr_1", appleRevocations: [] } } };
  }
  return { status: 404, body: { error: "not_found" } };
}

beforeEach(() => {
  process.env.EXPO_PUBLIC_API_URL = "http://api.test";
  unbindSignOut = bindClerkSignOut(jest.fn(async () => undefined));
  unbindHandler = bindApiUnauthorizedHandler();
  api.setTokenProvider(async () => "clerk-token");
  useSession.setState({ user: rider, authSource: "clerk", loading: false, error: null });
  useAccountDeletion.getState().reset();
  forgetAppleRevocation();
  askApple.mockReset().mockResolvedValue({ status: "ok", authorizationCode: "apple-code" });
  fetchMock = jest.fn(async (url: string) => {
    const reply = answer(new URL(url).pathname);
    return {
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      text: async () => JSON.stringify(reply.body),
    };
  });
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  unbindHandler();
  unbindSignOut();
  api.setTokenProvider(null);
  global.fetch = originalFetch;
  delete process.env.EXPO_PUBLIC_API_URL;
});

async function deleteAccount() {
  useAccountDeletion.getState().setSecret("secret-pass");
  await useAccountDeletion.getState().submit(
    "password",
    {
      startVerification: async () => ({ status: "needs_first_factor" }),
      prepareFirstFactorVerification: async () => ({ status: "needs_first_factor" }),
      attemptFirstFactorVerification: async () => ({ status: "complete" }),
    },
    "user_clerk_rider",
  );
}

it("says why before the session ends, and ends it on Sign in again", async () => {
  await deleteAccount();

  // The fresh-token retry still ran: the 401 is a verdict, not a blip.
  const revocations = fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/apple-revocation"));
  expect(revocations).toHaveLength(2);
  expect(useAccountDeletion.getState()).toMatchObject({
    sent: true,
    apple: "failed",
    appleError: appleRevocationFailure("signed_out").message,
    appleRetry: null,
    appleSessionEnded: true,
  });
  // Still signed in, so the screen is still there to show it.
  expect(useSession.getState().user).toEqual(rider);

  useAccountDeletion.getState().endSession();
  expect(useSession.getState().user).toBeNull();
  expect(useAccountDeletion.getState().appleSessionEnded).toBe(false);
});

it("ends the session when the rider leaves instead", async () => {
  await deleteAccount();
  expect(useSession.getState().user).toEqual(rider);

  useAccountDeletion.getState().reset();
  expect(useSession.getState().user).toBeNull();
});

it("leaves every other 401 to the global handler as before", async () => {
  await expect(api.listPrivacyRequests()).rejects.toBeInstanceOf(api.ApiError);
  expect(useSession.getState().user).toBeNull();
});
