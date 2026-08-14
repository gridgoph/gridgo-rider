/**
 * Load `expo-notifications` without taking the app down.
 *
 * Expo Go on Android SDK 53 has no remote-push native module. A static
 * import evaluates the module and throws (`Cannot find native module
 * 'ExpoPushTokenManager'`), which is a white screen on launch — observed
 * as that error followed by `Cannot read property 'ErrorBoundary' of
 * undefined`. A `require` inside try/catch costs push, never the first
 * frame.
 *
 * Call sites still wrap each native call: a later access can throw even
 * when the module object loaded.
 */
export function loadExpoNotifications(): typeof import("expo-notifications") | null {
  try {
    // Metro and Jest resolve this the same way a static import would.
    // The try is for Expo Go Android, where evaluating the native module throws.
    return require("expo-notifications") as typeof import("expo-notifications");
  } catch {
    return null;
  }
}
