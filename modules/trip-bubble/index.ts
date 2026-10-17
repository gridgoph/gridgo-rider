import { requireOptionalNativeModule } from "expo";

/**
 * The Android delivery bubble (`android/src/main/java/ph/gridgo/tripbubble`).
 *
 * Null wherever the native side is absent: iOS (which has no overlays), web,
 * Expo Go and any build made before this module. Callers treat null as "this
 * phone has no bubble" and change nothing else.
 */
type TripBubbleNative = {
  canDrawOverlays(): boolean;
  openOverlaySettings(): Promise<void>;
  show(count: number, label: string, title: string, body: string, channel: string): boolean;
  hide(): void;
  addListener(event: "onOpen", listener: () => void): { remove(): void };
};

export const TripBubbleModule = requireOptionalNativeModule<TripBubbleNative>("TripBubble");
