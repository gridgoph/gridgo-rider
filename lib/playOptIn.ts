import type { PlayOptInChannel, PlayOptInInstall, PlayOptInPlatform, PlayOptInState } from "@/lib/api";
import type { AppDistribution } from "@/lib/appUpdate";

/**
 * Google Play closed-test opt-in (gridgo-api `docs/PLAY_OPTIN_API.md`).
 *
 * An Android rider on the side-loaded APK is asked, by a card on Active or a
 * push, to confirm the Gmail they use on Play, join the tester group, tap
 * "Become a tester" on Play's own page, then install GRIDGO from Play — the
 * APK cannot count. GRIDGO decides who is asked (`show`); this module only
 * turns its answer into what the rider sees. Nothing here touches a job, an
 * offer or pay. Once the Play build reports in, the tester check-in card
 * (`lib/testerProgram.ts`) takes over.
 */

/** The push GRIDGO sends to eligible Android installs; its tap opens the steps. */
export const PLAY_OPTIN_PUSH_TYPE = "play_optin";
export const PLAY_OPTIN_ROUTE = "/play-optin";
/** GRIDGO hides the card after the third close. */
export const PLAY_OPTIN_DISMISS_LIMIT = 3;

/** The campaign's fixed words: the card, the push and the steps say the same thing. */
export const PLAY_OPTIN_COPY = "Help us launch GRIDGO on Play, become a tester.";

/** `platform` as GRIDGO reads it. */
export function optInPlatform(os: string): PlayOptInPlatform {
  if (os === "android") return "android";
  if (os === "ios") return "ios";
  return "web";
}

/** The APK reports `sideload`; only the Play bundle reports `play`. */
export function optInChannel(distribution: AppDistribution): PlayOptInChannel {
  return distribution === "play" ? "play" : "sideload";
}

/**
 * This install, for every call. `forceAndroid` lets a development web build
 * walk the Android path in a browser; the caller honours it only under
 * `__DEV__`, so a release can never claim to be a phone it is not.
 */
export function optInInstall(os: string, distribution: AppDistribution, forceAndroid = false): PlayOptInInstall {
  return { platform: forceAndroid ? "android" : optInPlatform(os), channel: optInChannel(distribution) };
}

/**
 * Whether Active draws the card. GRIDGO's `show` is the rule; the phone's own
 * checks only ever take a card away (Android APK, under three closes, not
 * closed this session), never add one GRIDGO did not offer.
 */
export function optInCardVisible(
  state: PlayOptInState | null,
  install: PlayOptInInstall,
  closedThisSession = false,
): boolean {
  if (closedThisSession || !state?.show) return false;
  if (install.platform !== "android" || install.channel === "play") return false;
  if (state.optedIn || state.step === "opted_in") return false;
  return state.dismissCount < PLAY_OPTIN_DISMISS_LIMIT;
}

const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

/** A Gmail / Googlemail address needs no "this is my Google account". */
export function isGmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@")[1] ?? "";
  return GMAIL_DOMAINS.has(domain);
}

export type GmailCheck =
  | { ok: true; googleAccount: boolean }
  | { ok: false; error: string | null; needsGoogleAccount: boolean };

/**
 * Whether the address can be sent. A Gmail goes as it is. Any other address
 * goes only once the rider says it is a Google account — Play admits a Google
 * account, not an email. `error` is null while the field is only waiting for
 * that assertion.
 */
export function checkGmail(email: string, googleAccount: boolean): GmailCheck {
  const trimmed = email.trim();
  if (!trimmed) return { ok: false, error: "Enter your Gmail.", needsGoogleAccount: false };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { ok: false, error: "That does not look like an email address.", needsGoogleAccount: false };
  }
  if (isGmail(trimmed)) return { ok: true, googleAccount: false };
  if (!googleAccount) return { ok: false, error: null, needsGoogleAccount: true };
  return { ok: true, googleAccount: true };
}

/**
 * The field's starting value. Only a Gmail suggestion is prefilled: a sign-in
 * address from elsewhere invites the rider to confirm an account Play may not
 * know (the same lesson as gridgo-client).
 */
export function prefilledGmail(state: PlayOptInState | null): string {
  const suggestion = state?.gmailSuggestion?.trim() ?? "";
  return suggestion && isGmail(suggestion) ? suggestion : "";
}

export type OptInStepKey = "gmail" | "group" | "optin" | "install";
export type OptInStepStatus = "done" | "current" | "ahead";
export type OptInStepView = { key: OptInStepKey; status: OptInStepStatus };

/** What the phone opened this visit, beyond GRIDGO's last answer. */
export type OptInProgress = { groupOpened: boolean; optInOpened: boolean };

/** The step the rider is on, from GRIDGO's `step` and what this visit opened. */
export function currentOptInStep(state: PlayOptInState, progress: OptInProgress): OptInStepKey | "done" {
  switch (state.step) {
    case "confirm_gmail":
      return "gmail";
    case "join_group":
      if (progress.optInOpened) return "install";
      return progress.groupOpened ? "optin" : "group";
    case "open_optin":
      return progress.optInOpened ? "install" : "optin";
    case "install_from_play":
      return "install";
    case "opted_in":
      return "done";
  }
  return "gmail";
}

/**
 * The steps' track. The group step is drawn only when the rider joins it
 * (`link`); with `automatic` GRIDGO adds the Gmail and the rider goes
 * straight to Play's page.
 */
export function optInSteps(state: PlayOptInState, progress: OptInProgress): OptInStepView[] {
  const keys: OptInStepKey[] =
    state.groupMode === "link" ? ["gmail", "group", "optin", "install"] : ["gmail", "optin", "install"];
  const step = currentOptInStep(state, progress);
  const current = step === "group" && !keys.includes("group") ? "optin" : step;
  const at = current === "done" ? keys.length : keys.indexOf(current);
  return keys.map((key, index) => ({
    key,
    status: index < at ? "done" : index === at ? "current" : "ahead",
  }));
}
