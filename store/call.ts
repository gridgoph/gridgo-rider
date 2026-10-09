import { create } from "zustand";

import * as api from "@/lib/api";
import { releaseCallAudio, routeCallAudio, startRinging } from "@/lib/callAudio";
import { CallSession, type CallSessionDeps, type CallSnapshot } from "@/lib/callSession";
import type { CallPair, OrderCall } from "@/lib/orderCalls";
import { loadWebRTC } from "@/lib/webrtc";

/**
 * The one call this phone is on, shared by the call screen, the bar that
 * leads back to it, and the watcher that rings for incoming calls.
 *
 * The session itself (`lib/callSession.ts`) lives beside the store rather than
 * in it: it owns timers and a peer connection, and the store only mirrors what
 * it reports. Nothing here is persisted — a call is over when the app is.
 */

type CallStore = {
  snapshot: CallSnapshot | null;
  /** Calls this phone has already rung for, so a late or repeated push never rings twice. */
  rung: string[];
  /** Missed calls the rider waved away on the trip. */
  dismissedMissed: string[];
  /**
   * A call the rider just asked for by tapping Call on the trip. The call
   * screen places a call only against this, so a link that opens the screen
   * can never dial on its own.
   */
  armed: { orderId: string; pair: CallPair; atMs: number } | null;
  arm: (orderId: string, pair: CallPair) => void;
  /** True once, for a fresh tap on the same order and person. */
  takeArmed: (orderId: string, pair: CallPair) => boolean;
  /** Whether the call screen is showing (the bar back to it is not needed then). */
  screenOpen: boolean;
  setScreenOpen: (open: boolean) => void;
  place: (orderId: string, pair: CallPair) => void;
  /** Ring for an incoming call. False when it was not taken (already rung, or busy). */
  receive: (call: OrderCall) => boolean;
  answer: () => Promise<void>;
  decline: () => Promise<void>;
  hangUp: () => Promise<void>;
  setMuted: (muted: boolean) => void;
  setSpeaker: (speaker: boolean) => void;
  /** The stream said this order's calls changed. */
  refresh: (orderId?: string) => void;
  /** Put an ended call away. */
  clear: () => void;
  dismissMissed: (callId: string) => void;
  /** The account changed: drop the call without a word to the API. */
  reset: () => void;
};

/** How long a tap on Call stays good for opening the call screen. */
const ARM_FRESH_MS = 15_000;

let session: CallSession | null = null;
let unsubscribe: (() => void) | null = null;

function defaultDeps(): CallSessionDeps {
  return {
    api,
    webrtc: loadWebRTC(),
    audio: { startRinging, routeCallAudio, releaseCallAudio },
  };
}

let makeDeps: () => CallSessionDeps = defaultDeps;

/** Tests only: swap the API, WebRTC and audio the next sessions are built with. */
export function setCallSessionDeps(factory: (() => CallSessionDeps) | null): void {
  makeDeps = factory ?? defaultDeps;
}

/** Whether a call is still going (anything but an ended one). */
export function callInProgress(snapshot: CallSnapshot | null): boolean {
  return Boolean(snapshot && snapshot.phase !== "ended");
}

export const useCall = create<CallStore>((set, get) => {
  function adopt(next: CallSession) {
    unsubscribe?.();
    session = next;
    unsubscribe = next.subscribe((snapshot) => {
      if (session === next) set({ snapshot });
    });
    set({ snapshot: next.snapshot });
  }

  return {
    snapshot: null,
    rung: [],
    dismissedMissed: [],
    screenOpen: false,
    setScreenOpen: (screenOpen) => set({ screenOpen }),
    armed: null,
    arm: (orderId, pair) => set({ armed: { orderId, pair, atMs: Date.now() } }),
    takeArmed: (orderId, pair) => {
      const armed = get().armed;
      set({ armed: null });
      return Boolean(
        armed && armed.orderId === orderId && armed.pair === pair && Date.now() - armed.atMs < ARM_FRESH_MS,
      );
    },

    place: (orderId, pair) => {
      if (callInProgress(get().snapshot)) return;
      const next = new CallSession(makeDeps(), { direction: "outgoing", orderId, pair });
      adopt(next);
      void next.place();
    },

    receive: (call) => {
      const { snapshot, rung } = get();
      if (rung.includes(call.id)) return false;
      set({ rung: [...rung, call.id].slice(-50) });
      if (callInProgress(snapshot)) {
        // Already speaking: the contract asks for the second call to be declined.
        if (snapshot?.call?.id !== call.id) {
          void api.orderCallAction(call.orderId, call.id, "decline").catch(() => undefined);
        }
        return false;
      }
      const next = new CallSession(makeDeps(), { direction: "incoming", call });
      adopt(next);
      next.ring();
      return true;
    },

    answer: async () => {
      await session?.answer();
    },
    decline: async () => {
      await session?.decline();
    },
    hangUp: async () => {
      await session?.hangUp();
    },
    setMuted: (muted) => session?.setMuted(muted),
    setSpeaker: (speaker) => session?.setSpeaker(speaker),

    refresh: (orderId) => {
      const snapshot = get().snapshot;
      if (!session || !snapshot || (orderId && orderId !== snapshot.orderId)) return;
      session.refresh();
    },

    clear: () => {
      if (callInProgress(get().snapshot)) return;
      unsubscribe?.();
      unsubscribe = null;
      session = null;
      set({ snapshot: null });
    },

    dismissMissed: (callId) => {
      const dismissed = get().dismissedMissed;
      if (!dismissed.includes(callId)) set({ dismissedMissed: [...dismissed, callId].slice(-50) });
    },

    reset: () => {
      session?.dispose();
      unsubscribe?.();
      unsubscribe = null;
      session = null;
      set({ snapshot: null, rung: [], dismissedMissed: [], armed: null });
    },
  };
});
