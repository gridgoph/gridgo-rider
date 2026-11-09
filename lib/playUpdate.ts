import { requireOptionalNativeModule } from "expo-modules-core";

import { installChannel } from "@/lib/buildDistribution";

export type PlayUpdateInfo = {
  available: boolean;
  flexibleAllowed: boolean;
  downloaded: boolean;
};

type PlayUpdateModule = {
  checkForUpdate(): Promise<PlayUpdateInfo>;
  startFlexibleUpdate(): Promise<boolean>;
  completeUpdate(): Promise<void>;
  addListener(event: "downloaded", listener: () => void): { remove(): void };
};

/** Resolve native code only on Play builds; Expo Go simply has no module. */
export function loadPlayUpdate(
  requireModule: typeof requireOptionalNativeModule = requireOptionalNativeModule,
): PlayUpdateModule | null {
  if (installChannel() !== "play") return null;
  return requireModule<PlayUpdateModule>("GridgoPlayUpdate");
}
