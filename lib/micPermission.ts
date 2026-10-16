/**
 * The microphone, asked for at the first call and never before.
 *
 * Read and requested through `expo-audio`, which this app already carries for
 * its launch sound. It is probed first for the same reason `lib/brandSound.ts`
 * probes it: a build without the native module throws from the package's top
 * level, and that must cost calls, never the app.
 *
 * `blocked` is a refusal the phone will not ask about again — only its own
 * settings can undo it, so the call screen offers to open them.
 */

import { Platform } from "react-native";

export type MicPermission = "granted" | "undetermined" | "blocked";

type PermissionAnswer = { granted?: boolean; status?: string; canAskAgain?: boolean };
type AudioPermissions = {
  getRecordingPermissionsAsync: () => Promise<PermissionAnswer>;
  requestRecordingPermissionsAsync: () => Promise<PermissionAnswer>;
};

function audioPermissions(): AudioPermissions | null {
  try {
    if (Platform.OS !== "web") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { requireOptionalNativeModule } = require("expo-modules-core") as {
        requireOptionalNativeModule: (name: string) => unknown;
      };
      if (!requireOptionalNativeModule("ExpoAudio")) return null;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-audio") as AudioPermissions;
  } catch {
    return null;
  }
}

/** Fold the module's answer into the three states the call screen words. */
export function readMicPermission(answer: PermissionAnswer): MicPermission {
  if (answer.granted || answer.status === "granted") return "granted";
  if (answer.status === "undetermined") return "undetermined";
  return answer.canAskAgain === false ? "blocked" : "undetermined";
}

/**
 * Where the microphone stands, without asking. With no way to read it the
 * answer is `undetermined`: the call screen explains first, and the request
 * (or WebRTC itself) raises the phone's own dialog.
 */
export async function getMicPermission(): Promise<MicPermission> {
  // expo-audio's web read *asks* when the browser has not decided, which
  // would skip the explanation; the browser's own permission state does not.
  if (Platform.OS === "web") return browserMicPermission();
  const module = audioPermissions();
  if (!module) return "undetermined";
  try {
    return readMicPermission(await module.getRecordingPermissionsAsync());
  } catch {
    return "undetermined";
  }
}

/** Raise the phone's dialog. Only ever from a tap on the call screen. */
export async function requestMicPermission(): Promise<MicPermission> {
  const module = audioPermissions();
  // Nothing to ask through; opening the microphone for the call will ask.
  if (!module) return "granted";
  try {
    return readMicPermission(await module.requestRecordingPermissionsAsync());
  } catch {
    return "blocked";
  }
}

async function browserMicPermission(): Promise<MicPermission> {
  try {
    const permissions = (globalThis as { navigator?: { permissions?: { query: (d: { name: string }) => Promise<{ state: string }> } } })
      .navigator?.permissions;
    if (!permissions) return "undetermined";
    const { state } = await permissions.query({ name: "microphone" });
    return state === "granted" ? "granted" : state === "denied" ? "blocked" : "undetermined";
  } catch {
    return "undetermined";
  }
}
