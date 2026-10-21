import {
  ApiError,
  createPrivacyRequest,
  fileAccountDeletionRequest,
  getAccountDeletionRequest,
  revokeAppleAuthorization,
} from "@/lib/api";
import { reauthorizeWithApple } from "@/lib/appleReauthorize";
import {
  APPLE_BUSY_RETRIES,
  APPLE_CHECK_FAILED,
  APPLE_FILE_FAILED,
  APPLE_NOT_CONFIRMED,
  APPLE_SIGN_IN_FAILED,
  appleRevocationFailure,
} from "@/lib/appleRevocation";
import { forgetAppleRevocation, useAccountDeletion } from "@/store/accountDeletion";

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  createPrivacyRequest: jest.fn(),
  fileAccountDeletionRequest: jest.fn(),
  getAccountDeletionRequest: jest.fn(),
  revokeAppleAuthorization: jest.fn(),
}));
jest.mock("@/lib/appleReauthorize", () => ({ reauthorizeWithApple: jest.fn() }));

const send = createPrivacyRequest as jest.Mock;
const file = fileAccountDeletionRequest as jest.Mock;
const revoke = revokeAppleAuthorization as jest.Mock;
const pending = getAccountDeletionRequest as jest.Mock;
const askApple = reauthorizeWithApple as jest.Mock;

const REVOKED = { clientId: "ph.gridgo.rider", status: "revoked", revokedAt: "2026-10-21T02:00:00.000Z", error: null };

function session() {
  return {
    startVerification: jest.fn(async () => ({ status: "needs_first_factor" })),
    prepareFirstFactorVerification: jest.fn(),
    attemptFirstFactorVerification: jest.fn(async () => ({ status: "complete" })),
  };
}

const RIDER = "user_apple_rider";

/** `appleLinked` stands for the screen naming the Clerk user as the owner. */
async function deleteAccount(appleLinked: boolean, owner = RIDER) {
  useAccountDeletion.getState().setSecret("secret-pass");
  await useAccountDeletion.getState().submit("password", session(), appleLinked ? owner : null);
}

/** Leaving the screen: its cleanup is `reset`. */
const leave = () => useAccountDeletion.getState().reset();

let codes = 0;
beforeEach(() => {
  jest.useRealTimers();
  useAccountDeletion.getState().reset();
  forgetAppleRevocation();
  pending.mockReset().mockResolvedValue({ id: "adr_1", appleRevocations: [] });
  send.mockReset().mockImplementation(async () => {
    return { id: "pr_1", kind: "deletion", status: "pending", requestedAt: "2026-10-21T02:00:00.000Z", dueAt: "2026-11-20T02:00:00.000Z" };
  });
  file.mockReset().mockResolvedValue(undefined);
  revoke.mockReset().mockResolvedValue(REVOKED);
  askApple.mockReset().mockImplementation(async () => ({ status: "ok", authorizationCode: `apple-code-${++codes}` }));
});

describe("an Apple-linked iPhone", () => {
  it("files the request first, then disconnects Sign in with Apple with a fresh code", async () => {
    await deleteAccount(true);

    expect(send).toHaveBeenCalledWith("deletion");
    expect(file).toHaveBeenCalledTimes(1);
    expect(askApple).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith("ph.gridgo.rider", `apple-code-${codes}`);
    // The deletion request is on file before Apple is ever asked.
    expect(send.mock.invocationCallOrder[0]).toBeLessThan(file.mock.invocationCallOrder[0]);
    expect(file.mock.invocationCallOrder[0]).toBeLessThan(askApple.mock.invocationCallOrder[0]);
    expect(useAccountDeletion.getState()).toMatchObject({ sent: true, apple: "revoked", busy: null, appleError: null });
  });

  it("never asks Apple again after a disconnect", async () => {
    await deleteAccount(true);
    await useAccountDeletion.getState().revokeApple();

    expect(askApple).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledTimes(1);
  });

  it("keeps the request when the person closes Apple's sheet, and can ask again", async () => {
    askApple.mockResolvedValueOnce({ status: "cancelled" });
    await deleteAccount(true);

    expect(revoke).not.toHaveBeenCalled();
    expect(useAccountDeletion.getState()).toMatchObject({ sent: true, apple: "cancelled", busy: null });

    await useAccountDeletion.getState().revokeApple();
    expect(askApple).toHaveBeenCalledTimes(2);
    // The deletion request it hangs off is not filed twice.
    expect(file).toHaveBeenCalledTimes(1);
    expect(useAccountDeletion.getState().apple).toBe("revoked");
  });

  it("says so when Apple cannot sign the person in", async () => {
    askApple.mockResolvedValueOnce({ status: "failed" });
    await deleteAccount(true);

    expect(revoke).not.toHaveBeenCalled();
    expect(useAccountDeletion.getState()).toMatchObject({ sent: true, apple: "failed", appleError: APPLE_SIGN_IN_FAILED, appleRetry: "fresh" });
  });

  it("resends the same code after a lost answer before asking Apple again", async () => {
    revoke.mockRejectedValueOnce(new TypeError("Network request failed"));
    await deleteAccount(true);
    const first = revoke.mock.calls[0][1];
    expect(useAccountDeletion.getState()).toMatchObject({ apple: "failed", appleRetry: "same" });
    expect(useAccountDeletion.getState().appleError).toBe(appleRevocationFailure("lost").message);

    await useAccountDeletion.getState().revokeApple();
    expect(askApple).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledTimes(2);
    expect(revoke.mock.calls[1][1]).toBe(first);
    expect(useAccountDeletion.getState().apple).toBe("revoked");
  });

  it("waits out GRIDGO's own attempt in flight with the same code", async () => {
    jest.useFakeTimers();
    revoke
      .mockRejectedValueOnce(new ApiError(409, { error: "apple_revocation_in_progress" }))
      .mockResolvedValueOnce(REVOKED);
    const done = deleteAccount(true);
    await jest.advanceTimersByTimeAsync(5000);
    await done;

    expect(askApple).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledTimes(2);
    expect(revoke.mock.calls[1][1]).toBe(revoke.mock.calls[0][1]);
    expect(useAccountDeletion.getState().apple).toBe("revoked");
  });

  it("stops waiting after a few tries and offers the same code again", async () => {
    jest.useFakeTimers();
    revoke.mockRejectedValue(new ApiError(409, { error: "apple_revocation_in_progress" }));
    const done = deleteAccount(true);
    await jest.advanceTimersByTimeAsync(60_000);
    await done;

    expect(revoke).toHaveBeenCalledTimes(APPLE_BUSY_RETRIES + 1);
    expect(useAccountDeletion.getState()).toMatchObject({ apple: "failed", appleRetry: "same" });
  });

  it("files the deletion request again when GRIDGO cannot find it, with the same code", async () => {
    revoke.mockRejectedValueOnce(new ApiError(409, { error: "account_deletion_request_required" }));
    await deleteAccount(true);
    await useAccountDeletion.getState().revokeApple();

    expect(file).toHaveBeenCalledTimes(2);
    expect(askApple).toHaveBeenCalledTimes(1);
    expect(revoke.mock.calls[1][1]).toBe(revoke.mock.calls[0][1]);
    expect(useAccountDeletion.getState().apple).toBe("revoked");
  });

  it("does not ask Apple until the deletion request it hangs off is on file", async () => {
    file.mockRejectedValueOnce(new TypeError("Network request failed"));
    await deleteAccount(true);

    expect(askApple).not.toHaveBeenCalled();
    expect(useAccountDeletion.getState()).toMatchObject({ sent: true, apple: "failed", appleError: APPLE_FILE_FAILED, appleRetry: "same" });

    await useAccountDeletion.getState().revokeApple();
    expect(file).toHaveBeenCalledTimes(2);
    expect(useAccountDeletion.getState().apple).toBe("revoked");
  });

  it("never reads a 200 without 'revoked' as a disconnect", async () => {
    revoke.mockResolvedValueOnce({ ...REVOKED, status: "retry_required", revokedAt: null });
    await deleteAccount(true);
    expect(useAccountDeletion.getState()).toMatchObject({ apple: "failed", appleError: APPLE_NOT_CONFIRMED, appleRetry: "fresh" });
  });

  const fresh: [number, string][] = [
    [400, "invalid_apple_authorization_code"],
    [403, "apple_identity_mismatch"],
    [502, "apple_unavailable"],
    [502, "apple_token_exchange_failed"],
    [502, "apple_identity_invalid"],
    [502, "apple_revocation_failed"],
  ];
  it.each(fresh)("%i %s asks Apple for a fresh code on retry", async (status, code) => {
    revoke.mockRejectedValueOnce(new ApiError(status, { error: code, requestId: "r1", appleRevocation: { status: "retry_required", revokedAt: null } }));
    await deleteAccount(true);
    const state = useAccountDeletion.getState();
    expect(state).toMatchObject({ sent: true, apple: "failed", appleRetry: "fresh" });
    expect(state.appleError).toBeTruthy();

    await useAccountDeletion.getState().revokeApple();
    expect(askApple).toHaveBeenCalledTimes(2);
    expect(revoke.mock.calls[1][1]).not.toBe(revoke.mock.calls[0][1]);
  });

  const final: [number, string][] = [
    [400, "confirmation_required"],
    [400, "invalid_apple_client_id"],
    [401, "unauthorized"],
    [409, "apple_account_not_linked"],
    [503, "apple_revocation_not_configured"],
  ];
  it.each(final)("%i %s is said plainly with nothing to retry", async (status, code) => {
    revoke.mockRejectedValueOnce(new ApiError(status, { error: code }));
    await deleteAccount(true);
    const state = useAccountDeletion.getState();
    expect(state).toMatchObject({ sent: true, apple: "failed", appleRetry: null });
    expect(state.appleError).toMatch(/still stands/);
  });

  it("502 clerk_unavailable retries the same code", async () => {
    revoke.mockRejectedValueOnce(new ApiError(502, { error: "clerk_unavailable" }));
    await deleteAccount(true);
    expect(useAccountDeletion.getState()).toMatchObject({ apple: "failed", appleRetry: "same" });
    await useAccountDeletion.getState().revokeApple();
    expect(askApple).toHaveBeenCalledTimes(1);
    expect(revoke.mock.calls[1][1]).toBe(revoke.mock.calls[0][1]);
  });

  it("keeps Apple's code out of the store's state", async () => {
    revoke.mockRejectedValueOnce(new TypeError("Network request failed"));
    await deleteAccount(true);
    const code = revoke.mock.calls[0][1] as string;
    expect(JSON.stringify(useAccountDeletion.getState())).not.toContain(code);
  });

  it("skips Apple entirely when the request itself did not send", async () => {
    send.mockRejectedValueOnce(new Error("offline"));
    await deleteAccount(true);
    expect(file).not.toHaveBeenCalled();
    expect(askApple).not.toHaveBeenCalled();
    expect(useAccountDeletion.getState().apple).toBe("none");
  });
});

describe("every other account", () => {
  it("sends the request exactly as before and never touches Apple", async () => {
    await deleteAccount(false);

    expect(send).toHaveBeenCalledTimes(1);
    expect(file).not.toHaveBeenCalled();
    expect(askApple).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
    expect(useAccountDeletion.getState()).toMatchObject({ sent: true, apple: "none" });
  });
});

describe("leaving the screen and coming back", () => {
  it("never asks Apple again after a disconnect, even on a second visit", async () => {
    await deleteAccount(true);
    expect(useAccountDeletion.getState().apple).toBe("revoked");
    leave();

    await deleteAccount(true);
    expect(askApple).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(useAccountDeletion.getState().apple).toBe("revoked");
  });

  it("believes GRIDGO's record of a disconnect when this phone has none", async () => {
    // A restarted app: nothing in memory, the server holds the result.
    pending.mockResolvedValue({
      id: "adr_1",
      appleRevocations: [{ ...REVOKED, attemptedAt: "2026-10-21T02:00:00.000Z" }],
    });
    await deleteAccount(true);

    expect(askApple).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
    expect(useAccountDeletion.getState().apple).toBe("revoked");
  });

  it("does not count another app's disconnect as this one's", async () => {
    pending.mockResolvedValue({
      id: "adr_1",
      appleRevocations: [{ ...REVOKED, clientId: "ph.gridgo.client" }],
    });
    await deleteAccount(true);
    expect(askApple).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith("ph.gridgo.rider", expect.any(String));
  });

  it("does not ask Apple when it cannot read GRIDGO's record first", async () => {
    pending.mockRejectedValueOnce(new TypeError("Network request failed"));
    await deleteAccount(true);

    expect(askApple).not.toHaveBeenCalled();
    expect(useAccountDeletion.getState()).toMatchObject({ apple: "failed", appleError: APPLE_CHECK_FAILED, appleRetry: "same" });
    await useAccountDeletion.getState().revokeApple();
    expect(askApple).toHaveBeenCalledTimes(1);
    expect(useAccountDeletion.getState().apple).toBe("revoked");
  });

  it("trusts its own disconnect when GRIDGO's record cannot be read", async () => {
    await deleteAccount(true);
    leave();
    pending.mockRejectedValueOnce(new TypeError("Network request failed"));
    await deleteAccount(true);
    expect(askApple).toHaveBeenCalledTimes(1);
    expect(useAccountDeletion.getState().apple).toBe("revoked");
  });

  it("replays a lost answer's code on the next visit instead of asking Apple", async () => {
    revoke.mockRejectedValueOnce(new TypeError("Network request failed"));
    await deleteAccount(true);
    const first = revoke.mock.calls[0][1];
    leave();

    await deleteAccount(true);
    expect(askApple).toHaveBeenCalledTimes(1);
    expect(revoke.mock.calls[1][1]).toBe(first);
    expect(useAccountDeletion.getState().apple).toBe("revoked");
  });

  it("sends a code Apple returned after the screen closed, rather than asking again", async () => {
    let answer!: (value: unknown) => void;
    askApple.mockImplementationOnce(() => new Promise((resolve) => { answer = resolve; }));
    const running = deleteAccount(true);
    await waitUntil(() => useAccountDeletion.getState().apple === "asking");
    leave();
    answer({ status: "ok", authorizationCode: "late-code" });
    await running;
    expect(revoke).not.toHaveBeenCalled();

    await deleteAccount(true);
    expect(askApple).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith("ph.gridgo.rider", "late-code");
  });

  it("starts over for a new deletion request", async () => {
    await deleteAccount(true);
    leave();
    // Operations finished the first request; this is a new one.
    pending.mockResolvedValue({ id: "adr_2", appleRevocations: [] });
    await deleteAccount(true);
    expect(askApple).toHaveBeenCalledTimes(2);
  });

  it("starts over for another account, and when the account changes", async () => {
    revoke.mockRejectedValueOnce(new TypeError("Network request failed"));
    await deleteAccount(true);
    const first = revoke.mock.calls[0][1];
    leave();

    await deleteAccount(true, "user_someone_else");
    expect(askApple).toHaveBeenCalledTimes(2);
    expect(revoke.mock.calls[1][1]).not.toBe(first);
    leave();

    forgetAppleRevocation();
    await deleteAccount(true, "user_someone_else");
    expect(askApple).toHaveBeenCalledTimes(3);
  });
});

describe("a screen closed while the request is on its way", () => {
  it("never opens Apple's sheet for a privacy request answered after leaving", async () => {
    let finish!: (value: unknown) => void;
    send.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const running = deleteAccount(true);
    await waitUntil(() => useAccountDeletion.getState().busy === "sending");
    leave();
    finish({ id: "pr_1", kind: "deletion", status: "pending", requestedAt: "x", dueAt: "x" });
    await running;

    expect(file).not.toHaveBeenCalled();
    expect(askApple).not.toHaveBeenCalled();
    // The next visit is not repopulated by the old submission.
    expect(useAccountDeletion.getState()).toMatchObject({ sent: false, busy: null, apple: "none" });
  });

  it("never sends for a confirmation answered after leaving", async () => {
    let confirm!: (value: unknown) => void;
    const s = session();
    s.attemptFirstFactorVerification.mockImplementationOnce(
      () => new Promise((resolve) => { confirm = resolve; }) as never,
    );
    useAccountDeletion.getState().setSecret("secret-pass");
    const running = useAccountDeletion.getState().submit("password", s, RIDER);
    await waitUntil(() => typeof confirm === "function");
    leave();
    confirm({ status: "complete" });
    await running;

    expect(send).not.toHaveBeenCalled();
    expect(askApple).not.toHaveBeenCalled();
    expect(useAccountDeletion.getState()).toMatchObject({ confirmedAt: null, busy: null });
  });

  it("stops a busy wait when the screen closes", async () => {
    jest.useFakeTimers();
    revoke.mockRejectedValue(new ApiError(409, { error: "apple_revocation_in_progress" }));
    const running = deleteAccount(true);
    await jest.advanceTimersByTimeAsync(10);
    leave();
    await jest.advanceTimersByTimeAsync(60_000);
    await running;
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(useAccountDeletion.getState().apple).toBe("none");
  });
});

async function waitUntil(condition: () => boolean) {
  for (let n = 0; n < 50 && !condition(); n += 1) await Promise.resolve();
  expect(condition()).toBe(true);
}
