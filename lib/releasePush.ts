import { APP_UPDATE_SOURCE } from "./appUpdate";
import type { InstallChannel } from "./buildDistribution";
import { parsePushData } from "./push";

/** This app's package, the one store listing a Play notice may open. */
const PLAY_PACKAGE = "ph.gridgo.rider";

/** Where a release notice sends the rider: the app first, the web if it will not open. */
export type ReleaseDestination = { url: string; fallbackUrl: string | null };

const DESTINATIONS: Record<InstallChannel, { target: string; destination: ReleaseDestination }> = {
  // Never open a URL supplied in the notification payload.
  apk: { target: "apk_download", destination: { url: APP_UPDATE_SOURCE.downloadUrl, fallbackUrl: null } },
  play: {
    target: "play_store",
    destination: {
      url: `market://details?id=${PLAY_PACKAGE}`,
      fallbackUrl: `https://play.google.com/store/apps/details?id=${PLAY_PACKAGE}`,
    },
  },
  ios: { target: "testflight", destination: { url: "itms-beta://", fallbackUrl: "https://testflight.apple.com/" } },
};

function readField(raw: unknown, key: string): string | null {
  if (!raw || typeof raw !== "object") return null;
  const value = (raw as Record<string, unknown>)[key];
  return typeof value === "string" && value ? value : null;
}

/**
 * Where a tapped release notice opens on this install, or `null` for the inbox.
 *
 * The server names the notice's channel and store (`releaseChannel`,
 * `storeTarget`); this app acts only on its own channel and maps the store to
 * its own fixed destination, so a Play or TestFlight install never opens the
 * side-load APK. A notice without those fields is from a server that predates
 * channels, where only the exact APK title identifies a release (anonymous
 * pushes carry nothing else), and only an APK install may act on it.
 */
export function releaseNoticeDestination(
  data: unknown,
  title: unknown,
  channel: InstallChannel | null,
): ReleaseDestination | null {
  if (!channel || parsePushData(data).type !== "announcement") return null;
  const releaseChannel = readField(data, "releaseChannel");
  const storeTarget = readField(data, "storeTarget");
  if (releaseChannel || storeTarget) {
    if (releaseChannel !== channel || storeTarget !== DESTINATIONS[channel].target) return null;
    return DESTINATIONS[channel].destination;
  }
  if (channel !== "apk" || typeof title !== "string") return null;
  if (!/^GRIDGO Rider (0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8}) is ready$/.test(title)) return null;
  return DESTINATIONS.apk.destination;
}

/** Open the destination, falling back to its web page when no app takes the link. */
export async function openReleaseDestination(
  destination: ReleaseDestination,
  open: (url: string) => Promise<unknown>,
): Promise<void> {
  try {
    await open(destination.url);
  } catch {
    if (destination.fallbackUrl) await open(destination.fallbackUrl).catch(() => undefined);
  }
}
