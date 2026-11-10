import { Linking, Platform } from "react-native";
import { create } from "zustand";

import * as api from "@/lib/api";
import { buildDistribution } from "@/lib/buildDistribution";
import { NO_OPT_IN_PROGRESS, optInInstall, type OptInProgress } from "@/lib/playOptIn";

/**
 * This install, as every opt-in call reports it. A development web build may
 * walk the Android path (`EXPO_PUBLIC_PLAY_OPTIN_FORCE_ANDROID=1`); a release
 * ignores the switch, read as the literal so Babel can inline it.
 */
export function playOptInInstall(): api.PlayOptInInstall {
  const force = typeof __DEV__ !== "undefined" && __DEV__ && process.env.EXPO_PUBLIC_PLAY_OPTIN_FORCE_ANDROID === "1";
  return optInInstall(Platform.OS, buildDistribution(), force);
}

const NO_PROGRESS: OptInProgress = NO_OPT_IN_PROGRESS;

type PlayOptInStore = {
  /** The account the answer below belongs to. */
  owner: string | null;
  state: api.PlayOptInState | null;
  /** The last read failed and nothing replaced it. Active stays quiet; the steps offer Try again. */
  readFailed: boolean;
  /** A read is in flight. */
  reading: boolean;
  /** Closed on Active this app session: the card waits for the next launch. */
  closed: boolean;
  /** `shown` / `tapped` already sent this app session. */
  shownSent: boolean;
  tappedSent: boolean;
  progress: OptInProgress;
  /** Read (and report this install). Never throws. */
  load: (userId: string | null) => Promise<void>;
  shown: () => void;
  tapped: () => void;
  dismiss: () => void;
  /** Each returns the refusal in words, or null. */
  confirmGmail: (email: string, googleAccount: boolean) => Promise<string | null>;
  openGroup: () => Promise<string | null>;
  openOptIn: () => Promise<string | null>;
  openPlayStore: () => Promise<string | null>;
  reset: () => void;
};

let sequence = 0;

function report(type: api.PlayOptInEvent): Promise<void> {
  return api.reportPlayOptInEvent(playOptInInstall(), type);
}

/** Whether something on this phone took the link. */
async function open(url: string | null | undefined): Promise<boolean> {
  if (!url) return false;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/** Refusals that mean the steps moved on GRIDGO: read them again. */
const STALE_STEP = new Set(["gmail_not_confirmed", "group_step_required", "campaign_not_available", "install_not_reported"]);

const EMPTY = {
  owner: null,
  state: null,
  readFailed: false,
  reading: false,
  closed: false,
  shownSent: false,
  tappedSent: false,
  progress: NO_PROGRESS,
};

/**
 * The Play opt-in for the signed-in rider, in memory only: GRIDGO holds the
 * Gmail, the steps and the close count, so a new launch asks again rather
 * than trusting anything this phone kept (`docs/PLAY_OPTIN_API.md`).
 */
export const usePlayOptIn = create<PlayOptInStore>()((set, get) => {
  async function refused(error: unknown, fallback: string): Promise<string> {
    if (STALE_STEP.has(api.apiErrorCode(error) ?? "")) await get().load(get().owner);
    return api.apiErrorMessage(error, fallback);
  }

  return {
    ...EMPTY,
    load: async (userId) => {
      if (!userId) {
        get().reset();
        return;
      }
      // Only an Android install can be asked, or counted from a Play report.
      if (playOptInInstall().platform !== "android") return;
      if (get().owner !== userId) set({ ...EMPTY, owner: userId });
      const mine = ++sequence;
      set({ reading: true });
      try {
        const state = await api.getPlayOptIn(playOptInInstall());
        if (mine === sequence) set({ state, readFailed: false });
      } catch {
        // No card on a failed read; the steps screen offers Try again.
        if (mine === sequence) set({ readFailed: true });
      } finally {
        if (mine === sequence) set({ reading: false });
      }
    },
    shown: () => {
      if (get().shownSent || !get().owner) return;
      set({ shownSent: true });
      void report("shown").catch(() => undefined);
    },
    tapped: () => {
      if (get().tappedSent || !get().owner) return;
      set({ tappedSent: true });
      void report("tapped").catch(() => undefined);
    },
    dismiss: () => {
      const state = get().state;
      set({ closed: true, state: state ? { ...state, dismissCount: state.dismissCount + 1 } : state });
      // Counted once per call by GRIDGO, so it is sent once and never retried.
      void report("dismissed").catch(() => undefined);
    },
    confirmGmail: async (email, googleAccount) => {
      try {
        const state = await api.confirmPlayOptInGmail(playOptInInstall(), email.trim(), googleAccount);
        // A new address clears the link steps on GRIDGO; it does here too.
        set({ state, progress: NO_PROGRESS });
        return null;
      } catch (error) {
        return refused(error, "Your Gmail did not go through. Try again.");
      }
    },
    openGroup: async () => {
      const url = get().state?.groupJoinUrl;
      try {
        await report("group_opened");
      } catch (error) {
        return refused(error, "The tester group did not open. Try again.");
      }
      // Progress moves only once the page actually opened; otherwise the
      // group stays the current action, whatever GRIDGO's next read says.
      if (!(await open(url))) {
        set({ progress: { ...get().progress, groupOpened: false, failed: "group" } });
        return "The group page did not open. Try again.";
      }
      set({ progress: { ...get().progress, groupOpened: true, failed: null } });
      return null;
    },
    openOptIn: async () => {
      const url = get().state?.optInUrl;
      try {
        await report("optin_opened");
      } catch (error) {
        return refused(error, "Google Play did not open. Try again.");
      }
      if (!(await open(url))) {
        set({ progress: { ...get().progress, optInOpened: false, failed: "optin" } });
        return "The Play tester page did not open. Try again.";
      }
      set({ progress: { ...get().progress, optInOpened: true, failed: null } });
      return null;
    },
    openPlayStore: async () => ((await open(get().state?.playStoreUrl)) ? null : "Google Play did not open. Try again."),
    reset: () => {
      sequence++;
      set(EMPTY);
    },
  };
});
