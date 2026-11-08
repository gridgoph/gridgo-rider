import Constants from "expo-constants";
import { Linking, Platform } from "react-native";
import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createJSONStorage, persist } from "zustand/middleware";

import * as api from "@/lib/api";
import { loadExpoNotifications } from "@/lib/expoNotifications";
import { PUSH_CHANNEL_ID } from "@/lib/push";
import {
  PLAY_FEEDBACK_URL,
  reminderPlan,
  TESTER_REMINDER_PREFIX,
  TESTER_REMINDER_TYPE,
  type HeldFeedback,
  type TesterReminder,
} from "@/lib/testerProgram";

const STORAGE_KEY = "gridgo.rider.testerProgram.v1";

type TesterProgramStore = {
  /** The account the answer below belongs to. */
  owner: string | null;
  /** GRIDGO's last answer, or null before one (and after a failed read). */
  program: api.TesterProgramState | null;
  /** When `program` was read: the clock the feedback cooldown is judged by. */
  readAt: number;
  /** The Check in button's own call is running. */
  checkingIn: boolean;
  /** The Check in button's call failed; said on the card. */
  checkInFailed: boolean;
  /** The feedback card on screen, per account. Persisted, so a closed card stays closed. */
  held: HeldFeedback | null;
  /** Read the program; an open on a day not yet in checks it in. */
  load: (userId: string | null) => Promise<void>;
  checkIn: () => Promise<void>;
  feedbackShown: (trigger: api.TesterFeedbackTrigger, now?: number) => void;
  feedbackTapped: () => Promise<void>;
  feedbackDismissed: () => void;
  /** Another account: forget the answer. Its reminders are re-planned by the next read. */
  reset: () => void;
  /** Sign-out: forget the answer and cancel this phone's reminders. */
  forget: () => void;
};

let sequence = 0;
/** Counts every answer drawn from a read, so a button answer can tell it was overtaken. */
let applied = 0;
let checkInAttempt = 0;
/** The read generation an accepted Check in answer moved to; reads older than it are stale. */
let buttonGeneration = 0;

/** GRIDGO's answer to a check-in from an account that is no longer a tester. */
function notEnrolled(error: unknown): boolean {
  return error instanceof api.ApiError && error.status === 404;
}

/** What the check-in records as this build: `1.4.212 (212)`, or the platform for a dev build. */
export function testerAppVersion(): string {
  const version = Constants.expoConfig?.version?.trim();
  const code = Constants.expoConfig?.android?.versionCode;
  if (!version) return Platform.OS;
  return Platform.OS === "android" && code ? `${version} (${code})` : `${version} (${Platform.OS})`;
}

/**
 * The Google Play tester program for the signed-in rider. In memory, except the held
 * feedback card. Every read is silent on failure: an account that is not a
 * tester — or a GRIDGO without the routes — sees nothing at all.
 */
export const useTesterProgram = create<TesterProgramStore>()(
  persist(
    (set, get) => ({
      owner: null,
      program: null,
      readAt: 0,
      checkingIn: false,
      checkInFailed: false,
      held: null,
      load: async (userId) => {
        if (!userId) {
          get().reset();
          return;
        }
        const mine = ++sequence;
        if (get().owner !== userId) set({ owner: userId, program: null, checkInFailed: false });
        let program: api.TesterProgramState;
        try {
          program = await api.getTesterProgram();
        } catch {
          return;
        }
        if (mine !== sequence) return reconcile(userId);
        applied++;
        set({ program, readAt: Date.now() });
        // Opening the app is the check-in; the button is only the way back
        // when this call could not land.
        if (program.enrolled && !program.checkedInToday && !program.stopped) {
          try {
            const checked = await api.testerCheckIn(testerAppVersion(), "open");
            if (mine !== sequence) return reconcile(userId);
            program = checked;
            applied++;
            set({ program, readAt: Date.now() });
          } catch (error) {
            // A newer read, an accepted Check in answer or another account owns the answer now.
            if (mine !== sequence) return reconcile(userId);
            if (notEnrolled(error)) {
              program = { enrolled: false };
              applied++;
              set({ program, readAt: Date.now() });
            }
            // Otherwise the card offers Check in; the reminders still follow the read.
          }
        }
        // Every read reconciles this phone's reminders with GRIDGO: replanned
        // while the run is open, cancelled once it stops or the account is
        // not (or no longer) enrolled.
        void syncTesterReminders(reminderPlan(program, Date.now()));
      },
      checkIn: async () => {
        if (get().checkingIn) return;
        // The button's own attempt, apart from the read generation: a refresh
        // that overtakes it must not leave it spinning (`finally`).
        const attempt = ++checkInAttempt;
        const owner = get().owner;
        // The read generation when the tap went out. A read started since may
        // know more (production approval, unenrolment), so this answer must
        // not be drawn or scheduled over it.
        const readGeneration = sequence;
        // And the answers drawn so far: a read already pending at the tap can
        // land a stop while this call is out (gridgo-supplier#237 review).
        const appliedAtTap = applied;
        const stillMine = () => attempt === checkInAttempt && get().owner === owner;
        const overtaken = () => readGeneration !== sequence || appliedAtTap !== applied;
        // Accepted: any read or automatic check-in still in flight is older
        // than this answer and must not be drawn or scheduled over it.
        const accept = () => {
          buttonGeneration = ++sequence;
          applied++;
        };
        set({ checkingIn: true, checkInFailed: false });
        try {
          const program = await api.testerCheckIn(testerAppVersion(), "button");
          if (!stillMine()) return;
          if (overtaken()) {
            // Ask GRIDGO again rather than trust either snapshot.
            void get().load(owner);
            return;
          }
          accept();
          set({ program, readAt: Date.now() });
          void syncTesterReminders(reminderPlan(program, Date.now()));
        } catch (error) {
          if (!stillMine()) return;
          // 404 not_enrolled is GRIDGO's answer, not a failure: the run has ended.
          if (notEnrolled(error)) {
            if (overtaken()) {
              // Ask GRIDGO again rather than trust either snapshot.
              void get().load(owner);
              return;
            }
            accept();
            set({ program: { enrolled: false }, readAt: Date.now() });
            void syncTesterReminders([]);
            return;
          }
          set({ checkInFailed: true });
        } finally {
          // Requests time out after 20 s, so this always runs.
          if (attempt === checkInAttempt) set({ checkingIn: false });
        }
      },
      feedbackShown: (trigger, now = Date.now()) => {
        const owner = get().owner;
        if (!owner) return;
        set({ held: { userId: owner, trigger, shownAt: now, closed: false } });
        void api.reportTesterFeedback("shown", trigger).catch(() => undefined);
      },
      feedbackTapped: async () => {
        const held = get().held;
        if (!held) return;
        set({ held: { ...held, closed: true } });
        void api.reportTesterFeedback("tapped", held.trigger).catch(() => undefined);
        try {
          await Linking.openURL(PLAY_FEEDBACK_URL);
        } catch {
          // Nothing to open it with; the card has done what it can.
        }
      },
      feedbackDismissed: () => {
        const held = get().held;
        if (!held) return;
        set({ held: { ...held, closed: true } });
        void api.reportTesterFeedback("dismissed", held.trigger).catch(() => undefined);
      },
      reset: () => {
        sequence++;
        checkInAttempt++;
        applied++;
        set({ owner: null, program: null, checkingIn: false, checkInFailed: false });
      },
      forget: () => {
        get().reset();
        void syncTesterReminders([]);
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ held: state.held }),
    },
  ),
);

/**
 * A read made stale only by an accepted Check in answer (no newer read since)
 * may still know something newer than that answer, so ask GRIDGO again rather
 * than trust either snapshot. A newer read or another account owns the answer
 * otherwise.
 */
function reconcile(userId: string): void {
  const store = useTesterProgram.getState();
  if (sequence === buttonGeneration && store.owner === userId) void store.load(userId);
}

/**
 * Replace this phone's tester reminders with `plan`. Local notifications only
 * — GRIDGO sends no tester push. Never asks for permission: without it,
 * nothing is scheduled. Web and Expo Go have no scheduler, so nothing happens.
 */
export function syncTesterReminders(plan: TesterReminder[]): Promise<void> {
  // The newest call wins: it is numbered now, synchronously, and every native
  // mutation runs one after another, so a cancellation (sign-out, stop) can
  // never be overtaken by an older plan still waiting on the OS.
  const generation = ++reminderGeneration;
  const run = reminderQueue.then(() => replaceReminders(plan, generation));
  reminderQueue = run.catch(() => undefined);
  return run;
}

let reminderGeneration = 0;
let reminderQueue: Promise<void> = Promise.resolve();

async function replaceReminders(plan: TesterReminder[], generation: number): Promise<void> {
  if (generation !== reminderGeneration) return; // A newer plan follows in the queue.
  if (Platform.OS === "web") return;
  const Notifications = loadExpoNotifications();
  if (!Notifications) return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((entry) => entry.identifier.startsWith(TESTER_REMINDER_PREFIX))
        .map((entry) => Notifications.cancelScheduledNotificationAsync(entry.identifier)),
    );
    if (!plan.length) return;
    const permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) return;
    for (const reminder of plan) {
      // Superseded mid-way: stop; the newer call cancels whatever landed.
      if (generation !== reminderGeneration) return;
      await Notifications.scheduleNotificationAsync({
        identifier: reminder.id,
        content: { title: reminder.title, body: reminder.body, data: { type: TESTER_REMINDER_TYPE } },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(reminder.at),
          channelId: PUSH_CHANNEL_ID,
        },
      });
    }
  } catch {
    // A reminder is a courtesy; failing to set one costs nothing else.
  }
}
