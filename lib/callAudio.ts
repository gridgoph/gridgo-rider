/**
 * What a call sounds like on this phone: the ring, and where the voice comes out.
 *
 * The ring plays through `expo-audio` with `playsInSilentMode: false`, so the
 * phone's own switch decides: on iOS the silent switch mutes it, and on Android
 * expo-audio suppresses playback while the ringer is on silent or vibrate. The
 * vibration pattern runs beside it, as an incoming call does on a phone set to
 * vibrate.
 *
 * During a call the voice goes to the earpiece by default and to the
 * loudspeaker when the rider turns Speaker on — the same audio mode call,
 * `shouldRouteThroughEarpiece`, which on Android switches the phone into
 * communication mode.
 *
 * All of it is best-effort. A phone that cannot ring still shows the incoming
 * call screen; a route that will not change still carries the voice.
 */

import { Platform, Vibration } from "react-native";

import { audio } from "@/constants/audio";

type Player = { play: () => void | Promise<void>; pause: () => void; remove: () => void; loop: boolean };
type AudioModule = {
  createAudioPlayer: (source: number, options?: { downloadFirst?: boolean }) => Player;
  setAudioModeAsync: (mode: {
    playsInSilentMode?: boolean;
    interruptionMode?: "mixWithOthers" | "doNotMix" | "duckOthers";
    allowsRecording?: boolean;
    shouldRouteThroughEarpiece?: boolean;
    shouldPlayInBackground?: boolean;
  }) => Promise<void>;
  setIsAudioActiveAsync?: (active: boolean) => Promise<void>;
};

function audioModule(): AudioModule | null {
  try {
    if (Platform.OS !== "web") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { requireOptionalNativeModule } = require("expo-modules-core") as {
        requireOptionalNativeModule: (name: string) => unknown;
      };
      if (!requireOptionalNativeModule("ExpoAudio")) return null;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-audio") as AudioModule;
  } catch {
    return null;
  }
}

/** Ring, pause, ring: about the rhythm of the tone. */
export const RING_VIBRATION_PATTERN = [0, 400, 250, 400, 1950];

/**
 * Start ringing. Returns the stop, which is safe to call more than once.
 */
export function startRinging(): () => void {
  const module = audioModule();
  let player: Player | null = null;
  let stopped = false;

  if (Platform.OS !== "web") Vibration.vibrate(RING_VIBRATION_PATTERN, true);

  if (module) {
    void (async () => {
      try {
        await module.setAudioModeAsync({
          playsInSilentMode: false,
          interruptionMode: "duckOthers",
          allowsRecording: false,
          shouldRouteThroughEarpiece: false,
        });
        if (stopped) return;
        player = module.createAudioPlayer(audio.ring, { downloadFirst: true });
        player.loop = true;
        // A browser player rejects when the ring is stopped mid-start; that is fine.
        void Promise.resolve(player.play()).catch(() => undefined);
      } catch {
        // Silent ring; the screen and the vibration still say it.
      }
    })();
  }

  return () => {
    if (stopped) return;
    stopped = true;
    if (Platform.OS !== "web") Vibration.cancel();
    try {
      player?.pause();
      player?.remove();
    } catch {
      // Already gone.
    }
    player = null;
  };
}

/** Voice to the earpiece, or the loudspeaker with `speaker`. */
export async function routeCallAudio(speaker: boolean): Promise<void> {
  const module = audioModule();
  if (!module) return;
  try {
    await module.setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: "doNotMix",
      allowsRecording: true,
      shouldRouteThroughEarpiece: !speaker,
    });
  } catch {
    // The voice still plays on the phone's default route.
  }
}

/** Hand the phone's audio back once the call is over. */
export async function releaseCallAudio(): Promise<void> {
  const module = audioModule();
  if (!module) return;
  try {
    await module.setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: "mixWithOthers",
      allowsRecording: false,
      shouldRouteThroughEarpiece: false,
    });
  } catch {
    // Nothing left to release.
  }
}
