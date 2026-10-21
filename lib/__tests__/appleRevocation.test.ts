import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { ApiError } from "@/lib/api";
import {
  APPLE_CLIENT_ID,
  appleRetryLabel,
  appleRevocationApplies,
  appleRevocationFailure,
  appleRevocationRefusal,
  appleReplayOutdated,
  appleRevokedOnServer,
  hasAppleAccount,
} from "@/lib/appleRevocation";

const apple = { externalAccounts: [{ provider: "google" }, { provider: "apple" }] };
const google = { externalAccounts: [{ provider: "google" }] };

describe("who is asked to disconnect Sign in with Apple", () => {
  it("is a Clerk user with an Apple account", () => {
    expect(hasAppleAccount(apple)).toBe(true);
    expect(hasAppleAccount(google)).toBe(false);
    expect(hasAppleAccount({ externalAccounts: [] })).toBe(false);
    expect(hasAppleAccount(null)).toBe(false);
  });

  it("on an iPhone only", () => {
    expect(appleRevocationApplies(apple, "ios")).toBe(true);
    expect(appleRevocationApplies(apple, "android")).toBe(false);
    expect(appleRevocationApplies(apple, "web")).toBe(false);
    expect(appleRevocationApplies(google, "ios")).toBe(false);
  });

  it("names this app's own bundle ID to GRIDGO", () => {
    const appJson = JSON.parse(readFileSync(resolve(__dirname, "../../app.json"), "utf8")) as {
      expo: { ios: { bundleIdentifier: string } };
    };
    expect(APPLE_CLIENT_ID).toBe("ph.gridgo.rider");
    expect(APPLE_CLIENT_ID).toBe(appJson.expo.ios.bundleIdentifier);
  });
});

describe("every refusal in GRIDGO's table", () => {
  const table: [number, string, string, "same" | "fresh" | null][] = [
    [400, "confirmation_required", "app_setup", null],
    [400, "invalid_apple_client_id", "app_setup", null],
    [400, "invalid_apple_authorization_code", "code_expired", "fresh"],
    [401, "unauthorized", "signed_out", null],
    [403, "apple_identity_mismatch", "wrong_apple_id", "fresh"],
    [409, "account_deletion_request_required", "deletion_request_missing", "same"],
    [409, "apple_account_not_linked", "not_linked", null],
    [409, "apple_revocation_in_progress", "busy", "same"],
    [502, "clerk_unavailable", "sign_in_unchecked", "same"],
    [502, "apple_unavailable", "apple_unreachable", "fresh"],
    [502, "apple_token_exchange_failed", "apple_unreachable", "fresh"],
    [502, "apple_identity_invalid", "apple_unchecked", "fresh"],
    [502, "apple_revocation_failed", "apple_unconfirmed", "fresh"],
    [503, "apple_revocation_not_configured", "not_configured", null],
  ];

  it.each(table)("%i %s reads as %s", (status, code, refusal, retry) => {
    const error = new ApiError(status, { error: code });
    expect(appleRevocationRefusal(error)).toBe(refusal);
    const failure = appleRevocationFailure(appleRevocationRefusal(error));
    expect(failure.retry).toBe(retry);
    // Plain words: no code, and never a claim that anything was disconnected.
    expect(failure.message).not.toMatch(/_/);
    expect(failure.message).not.toMatch(/\bis disconnected\b/);
  });

  it("treats no answer at all as lost, so the same code goes again", () => {
    expect(appleRevocationRefusal(new TypeError("Network request failed"))).toBe("lost");
    expect(appleRevocationFailure("lost").retry).toBe("same");
    expect(appleRevocationRefusal(new ApiError(500, { error: "internal" }))).toBe("lost");
  });

  it("says what the retry button does", () => {
    expect(appleRetryLabel("same")).toBe("Try again");
    expect(appleRetryLabel("fresh")).toBe("Sign in with Apple again");
    expect(appleRetryLabel(null)).toBeNull();
  });
});

describe("GRIDGO's record of an earlier disconnect", () => {
  const attempt = (clientId: string, status: string) => ({ clientId, status, revokedAt: null, error: null });

  it("reads only this app's latest attempt", () => {
    expect(appleRevokedOnServer({ id: "adr_1", appleRevocations: [attempt("ph.gridgo.rider", "revoked")] })).toBe(true);
    expect(appleRevokedOnServer({ id: "adr_1", appleRevocations: [attempt("ph.gridgo.rider", "retry_required")] })).toBe(false);
    expect(appleRevokedOnServer({ id: "adr_1", appleRevocations: [attempt("ph.gridgo.client", "revoked")] })).toBeNull();
  });

  it("reads an empty or missing record as unknown, never as done", () => {
    expect(appleRevokedOnServer({ id: "adr_1", appleRevocations: [] })).toBeNull();
    expect(appleRevokedOnServer({ id: "adr_1" })).toBeNull();
    expect(appleRevokedOnServer(null)).toBeNull();
  });
});

describe("a held code's answer against GRIDGO's latest attempt", () => {
  const at = (status: string, attemptedAt?: string) => ({ clientId: "ph.gridgo.rider", status, attemptedAt, revokedAt: null, error: null });

  it("is outdated only by a newer failure", () => {
    expect(appleReplayOutdated(at("revoked", "2026-10-21T02:00:00Z"), at("retry_required", "2026-10-21T03:00:00Z"))).toBe(true);
    expect(appleReplayOutdated(at("revoked", "2026-10-21T04:00:00Z"), at("retry_required", "2026-10-21T03:00:00Z"))).toBe(false);
    expect(appleReplayOutdated(at("revoked", "2026-10-21T02:00:00Z"), at("revoked", "2026-10-21T03:00:00Z"))).toBe(false);
    expect(appleReplayOutdated(at("revoked", "2026-10-21T02:00:00Z"), null)).toBe(false);
  });

  it("reads GRIDGO's microsecond times", () => {
    expect(appleReplayOutdated(at("revoked", "2026-10-21T02:00:00.123Z"), at("retry_required", "2026-10-21T03:00:00.123456+00:00"))).toBe(true);
    expect(appleReplayOutdated(at("revoked", "2026-10-21T04:00:00.123Z"), at("retry_required", "2026-10-21T03:00:00.123456+00:00"))).toBe(false);
  });

  it("is not trusted over a failure when either time is missing", () => {
    expect(appleReplayOutdated(at("revoked"), at("retry_required", "2026-10-21T03:00:00Z"))).toBe(true);
    expect(appleReplayOutdated(at("revoked", "2026-10-21T04:00:00Z"), at("retry_required"))).toBe(true);
  });
});
