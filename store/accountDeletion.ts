import { create } from "zustand";

import {
  confirmationStands,
  confirmWithCode,
  confirmWithPassword,
  DELETION_NO_SESSION,
  DELETION_REQUEST_FAILED,
  sendDeletionCode,
  type DeletionConfirmMethod,
  type ReverifySession,
} from "@/lib/accountDeletion";
import {
  ApiError,
  createPrivacyRequest,
  endExpiredSession,
  fileAccountDeletionRequest,
  getAccountDeletionRequest,
  revokeAppleAuthorization,
  type PrivacyRequest,
} from "@/lib/api";
import { reauthorizeWithApple } from "@/lib/appleReauthorize";
import {
  APPLE_BUSY_RETRIES,
  APPLE_BUSY_WAIT_MS,
  APPLE_CHECK_FAILED,
  APPLE_CLIENT_ID,
  APPLE_FILE_FAILED,
  APPLE_NOT_CONFIRMED,
  APPLE_SIGN_IN_FAILED,
  appleRevocationFailure,
  appleRevocationRefusal,
  appleRevokedOnServer,
  type AppleRetry,
} from "@/lib/appleRevocation";
import { usePrivacyRequests } from "@/store/privacyRequests";

/**
 * The Delete account screen's flow: confirm it is the account holder, then
 * send the request.
 *
 * A store rather than `useState` for the reason `store/loginFlow.ts` gives:
 * every step lands from an async continuation, and on this test stack a plain
 * `useState` write there never re-renders. Nothing is persisted — the password
 * and the code live only while the screen is open, and `reset` on leaving
 * drops them.
 *
 * On an Apple-linked iPhone the sent request is followed by disconnecting
 * Sign in with Apple (`lib/appleRevocation.ts`). The request is already filed
 * by then, so nothing in that step can take it back. The session is not
 * ended: the account stays available while Operations review the request.
 * What that step learns outlives the screen (see `AppleAttempt`).
 */
type AccountDeletionState = {
  /** Typed password or emailed code. Never persisted, never logged. */
  secret: string;
  /** A code has been emailed and is waiting to be typed. */
  codeSent: boolean;
  /** Where Clerk sent the code, masked by Clerk. */
  destination: string;
  busy: "checking" | "sending" | "emailing" | "apple" | "revoking" | null;
  /** About what was typed: drawn under the field. */
  fieldError: string | null;
  /** About everything else: drawn as a notice. */
  error: string | null;
  /** When the account holder last proved it was them, for a retried send. */
  confirmedAt: number | null;
  sent: boolean;
  /** The privacy request the send created, for its answer-by date. */
  request: PrivacyRequest | null;
  /** Sign in with Apple's disconnect; `none` wherever it does not apply. */
  apple: "none" | "asking" | "sending" | "revoked" | "cancelled" | "failed";
  appleError: string | null;
  appleRetry: AppleRetry;
  /** A 401 ended the session mid-step; it is ended once the rider has read why. */
  appleSessionEnded: boolean;
  setSecret: (secret: string) => void;
  emailCode: (session: ReverifySession | null | undefined) => Promise<void>;
  submit: (
    method: DeletionConfirmMethod,
    session: ReverifySession | null | undefined,
    /**
     * The Clerk user ID when `appleRevocationApplies` (an iPhone whose Clerk
     * user has an Apple account), otherwise null: whose Apple attempt this is.
     */
    appleOwner?: string | null,
  ) => Promise<void>;
  /** Disconnect Sign in with Apple, or retry it: after the request is sent only. */
  revokeApple: () => Promise<void>;
  /** End the session a 401 already proved over, after its explanation was read. */
  endSession: () => void;
  reset: () => void;
};

const initial = {
  secret: "",
  codeSent: false,
  destination: "",
  busy: null,
  fieldError: null,
  error: null,
  confirmedAt: null,
  sent: false,
  request: null,
  apple: "none" as const,
  appleError: null,
  appleRetry: null,
  appleSessionEnded: false,
};

/**
 * One account's disconnect, kept in memory across visits to the screen.
 *
 * Leaving Delete account must not forget it: a rider who reopens the screen
 * after a disconnect would otherwise be sent through Apple's sign-in again,
 * which can authorize the app all over again, and one who left after a lost
 * answer would spend a new code instead of replaying the first. So `reset`
 * leaves this alone; it is scoped to the Clerk user and the pending deletion
 * request, and `forgetAppleRevocation` drops it when the signed-in account
 * changes. The code is never persisted, never logged, and never in store state.
 */
type AppleAttempt = {
  owner: string;
  /** The pending deletion request GRIDGO last named, from its own record. */
  requestId: string | null;
  /** Apple's code, held between a lost answer and its retry. */
  code: string | null;
  /** The deletion request the Apple route checks for is on file this visit. */
  filed: boolean;
  revoked: boolean;
};

let attempt: AppleAttempt | null = null;

function attemptFor(owner: string): AppleAttempt {
  if (attempt?.owner !== owner) {
    attempt = { owner, requestId: null, code: null, filed: false, revoked: false };
  }
  return attempt;
}

/** The signed-in account changed or ended: nothing of its attempt carries over. */
export function forgetAppleRevocation(): void {
  attempt = null;
}

/** Bumped by `reset`, so a continuation from a left screen changes nothing. */
let flow = 0;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const useAccountDeletion = create<AccountDeletionState>((set, get) => {
  /**
   * Disconnect Sign in with Apple for the flow `mine` started. A submission or
   * tap from a screen that has since closed (`flow` moved on) changes nothing
   * and never opens Apple's sheet.
   */
  const disconnect = async (mine: number, owner: string) => {
    const live = () => mine === flow;
    const a = attemptFor(owner);
    const fail = (message: string, retry: AppleRetry) =>
      live() && set({ apple: "failed", appleError: message, appleRetry: retry });
    /** A 401 says why first; the session ends when the rider moves on. */
    const failRefused = (error: unknown, otherwise: () => void) => {
      if (appleRevocationRefusal(error) !== "signed_out") return otherwise();
      const failure = appleRevocationFailure("signed_out");
      fail(failure.message, failure.retry);
      if (live() && error instanceof ApiError && error.sessionEnded) {
        set({ appleSessionEnded: true });
      }
    };
    set({ appleError: null, appleRetry: null });
    try {
      if (!a.filed) {
        set({ busy: "revoking", apple: "sending" });
        try {
          await fileAccountDeletionRequest();
        } catch (error) {
          failRefused(error, () => fail(APPLE_FILE_FAILED, "same"));
          return;
        }
        if (!live()) return;
        a.filed = true;
      }

      if (!a.code) {
        // GRIDGO's record first: a disconnect it already holds, from this
        // visit or an earlier one, means Apple is never asked again.
        set({ busy: "revoking", apple: "sending" });
        let revokedBefore = a.revoked;
        try {
          const pending = await getAccountDeletionRequest();
          if (!live()) return;
          if (a.requestId && pending?.id !== a.requestId) a.revoked = false;
          a.requestId = pending?.id ?? null;
          revokedBefore = a.revoked || appleRevokedOnServer(pending);
        } catch (error) {
          if (!live()) return;
          if (!revokedBefore) {
            failRefused(error, () => fail(APPLE_CHECK_FAILED, "same"));
            return;
          }
        }
        if (revokedBefore) {
          a.revoked = true;
          set({ apple: "revoked" });
          return;
        }

        set({ busy: "apple", apple: "asking" });
        const outcome = await reauthorizeWithApple();
        // Kept even if the screen closed meanwhile: the next visit sends this
        // code rather than asking Apple for another.
        if (outcome.status === "ok") a.code = outcome.authorizationCode;
        if (!live()) return;
        if (outcome.status === "cancelled") {
          set({ apple: "cancelled" });
          return;
        }
        if (outcome.status === "failed") {
          fail(APPLE_SIGN_IN_FAILED, "fresh");
          return;
        }
      }

      const code = a.code;
      if (!code) return;
      set({ busy: "revoking", apple: "sending" });
      for (let tries = 0; ; tries += 1) {
        try {
          const result = await revokeAppleAuthorization(APPLE_CLIENT_ID, code);
          // Spent either way: a recorded result is all this code can return now.
          a.code = null;
          if (result?.status === "revoked") {
            a.revoked = true;
            if (live()) set({ apple: "revoked" });
          } else {
            fail(APPLE_NOT_CONFIRMED, "fresh");
          }
          return;
        } catch (error) {
          if (!live()) return;
          const refusal = appleRevocationRefusal(error);
          // GRIDGO's own attempt is still in flight: the same code, after a pause.
          if (refusal === "busy" && tries < APPLE_BUSY_RETRIES) {
            await wait(APPLE_BUSY_WAIT_MS);
            if (!live()) return;
            continue;
          }
          if (refusal === "deletion_request_missing") a.filed = false;
          const failure = appleRevocationFailure(refusal);
          if (failure.retry !== "same") a.code = null;
          failRefused(error, () => fail(failure.message, failure.retry));
          return;
        }
      }
    } finally {
      if (live()) set({ busy: null });
    }
  };

  /** Whose attempt the visible flow is running, once a submit names one. */
  let owner: string | null = null;

  return {
    ...initial,

    setSecret: (secret) => set({ secret, fieldError: null }),

    emailCode: async (session) => {
      if (get().busy) return;
      if (!session) {
        set({ error: DELETION_NO_SESSION });
        return;
      }
      const mine = flow;
      set({ busy: "emailing", error: null, fieldError: null });
      try {
        const outcome = await sendDeletionCode(session);
        if (mine !== flow) return;
        if (outcome.status === "ok") {
          set({ codeSent: true, destination: outcome.destination, secret: "" });
        } else {
          set({ error: outcome.message });
        }
      } finally {
        if (mine === flow) set({ busy: null });
      }
    },

    submit: async (method, session, appleOwner = null) => {
      if (get().busy) return;
      // Captured before any await: a screen closed while this runs must not
      // have Apple's sheet opened over wherever the rider went.
      const mine = flow;
      const live = () => mine === flow;
      set({ error: null, fieldError: null });

      // Only the send can fail once the person is confirmed. A retry inside the
      // window goes straight to the send rather than spending another code.
      if (!confirmationStands(get().confirmedAt, Date.now())) {
        if (!session) {
          set({ error: DELETION_NO_SESSION });
          return;
        }
        set({ busy: "checking" });
        const secret = get().secret;
        const outcome =
          method === "password"
            ? await confirmWithPassword(session, secret)
            : await confirmWithCode(session, secret);
        if (!live()) return;
        if (outcome.status !== "ok") {
          set(
            outcome.status === "refused"
              ? { busy: null, fieldError: outcome.message }
              : { busy: null, error: outcome.message },
          );
          return;
        }
        set({ confirmedAt: Date.now(), secret: "" });
      }

      set({ busy: "sending" });
      try {
        // The privacy queue, not the legacy `/me/account-deletion-request`: it
        // is where See my data and Correct my data land too, with a due date
        // and a record of what GRIDGO kept. An Apple-linked iPhone files the
        // legacy one too, in `disconnect`, because Apple's disconnect is
        // checked against it.
        const request = await createPrivacyRequest("deletion");
        usePrivacyRequests.getState().remember(request);
        if (!live()) return;
        set({ sent: true, secret: "", request });
      } catch {
        if (live()) set({ error: DELETION_REQUEST_FAILED });
      } finally {
        if (live()) set({ busy: null });
      }
      if (!appleOwner || !live() || !get().sent) return;
      owner = appleOwner;
      // A new request is filed this visit, so file the one Apple's route reads too.
      attemptFor(appleOwner).filed = false;
      await disconnect(mine, appleOwner);
    },

    revokeApple: async () => {
      const { busy, sent, apple } = get();
      if (busy || !sent || apple === "revoked" || !owner) return;
      await disconnect(flow, owner);
    },

    endSession: () => {
      if (!get().appleSessionEnded) return;
      set({ appleSessionEnded: false });
      endExpiredSession();
    },

    reset: () => {
      const ended = get().appleSessionEnded;
      flow += 1;
      owner = null;
      set(initial);
      if (ended) endExpiredSession();
    },
  };
});
