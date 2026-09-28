import { Image } from "expo-image";
import { useEffect, useRef, useState } from "react";
import { AppState, View } from "react-native";

import { SkeletonBlock } from "@/components/Skeleton";
import { getDownloadUrl } from "@/lib/api";
import type { PreviewLink } from "@/lib/orderArtwork";
import { heldLinkIsStale, photoLinkIsStale } from "@/lib/photoLinks";

type Props = {
  fileId: string;
  /** The signed link the panel read with the file's metadata. */
  initial: PreviewLink;
  accessibilityLabel: string;
  /** The picture will not load on a good link; the panel says so and offers Retry. */
  onFailed: () => void;
};

type HeldLink = PreviewLink & { readAt: number };

/**
 * An artwork preview that outlives its signed link.
 *
 * **An expired link is not a broken picture.** Storage honours these links for
 * five minutes and a rider's phone holds them far longer, in the background
 * between pickup and the door. So the preview reads a fresh link (never file
 * metadata again) when:
 * - the held link is already stale when it is drawn;
 * - the picture fails on a stale link — once per link, shimmering while it waits;
 * - the app comes back to the foreground holding a link 4+ minutes old.
 *
 * A picture that fails on a good link, or whose re-read could not replace the
 * link, is a real failure: `onFailed` and the panel says "Preview unavailable".
 * If a re-read hands back a link that is already stale (the phone clock runs
 * ahead of the server's), expiry stops driving re-reads, so there is no loop.
 * Rules: `lib/photoLinks.ts`, shared with gridgo-client's `SamplePhoto`.
 */
export function ArtworkPreview({ fileId, initial, accessibilityLabel, onFailed }: Props) {
  const [link, setLink] = useState<HeldLink>(() => ({ ...initial, readAt: Date.now() }));
  // Each of these is remembered against the url it happened to, so a new link
  // starts clean rather than inheriting a refusal.
  const [failure, setFailure] = useState<{ url: string; expired: boolean } | null>(null);
  const [rereadFor, setRereadFor] = useState<string | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const askedFor = useRef<string | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const trustExpiry = useRef(true);
  const mounted = useRef(true);
  const held = useRef(link);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => { held.current = link; }, [link]);

  /** One re-read at a time, shared by every reason to want one. */
  function reread(): Promise<void> {
    if (!inFlight.current) {
      inFlight.current = getDownloadUrl(fileId)
        .then((next) => {
          if (photoLinkIsStale(next.expiresAt)) trustExpiry.current = false;
          if (mounted.current) setLink({ url: next.url, expiresAt: next.expiresAt ?? null, readAt: Date.now() });
        })
        .catch(() => undefined)
        .finally(() => { inFlight.current = null; });
    }
    return inFlight.current;
  }

  function askForFreshLink(stale: string) {
    if (askedFor.current === stale) return;
    askedFor.current = stale;
    void reread().then(() => { if (mounted.current) setRereadFor(stale); });
  }

  function expiryStale(expiresAt: string | null) {
    return trustExpiry.current && photoLinkIsStale(expiresAt);
  }

  // A link already past its expiry is renewed before anyone sees it fail.
  useEffect(() => {
    if (expiryStale(link.expiresAt)) askForFreshLink(link.url);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Keyed by the link, not by helper identity.
  }, [link.url, link.expiresAt]);

  // Resuming is not a re-render: the preview has to notice the app came back.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      const { readAt, expiresAt } = held.current;
      if (heldLinkIsStale({ readAt, expiresAt: trustExpiry.current ? expiresAt : null })) void reread();
    });
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `reread` reads refs only.
  }, [fileId]);

  const failedHere = failure !== null && failure.url === link.url;
  // Waiting on a fresh link: shimmer, never the failure text.
  const refreshing = failedHere && failure.expired && rereadFor !== link.url;
  const failed = failedHere && !refreshing;

  useEffect(() => {
    if (failed) onFailed();
  }, [failed, onFailed]);

  function onImageError() {
    const expired = expiryStale(link.expiresAt);
    setFailure({ url: link.url, expired });
    if (expired) askForFreshLink(link.url);
  }

  // The panel's own "Preview unavailable" takes over once `onFailed` lands.
  if (failed) return null;
  if (refreshing) {
    return (
      <View testID="artwork-preview-refreshing" accessible accessibilityLabel={`${accessibilityLabel}, loading`} className="h-full w-full items-center justify-center">
        <SkeletonBlock />
      </View>
    );
  }

  return (
    <View className="h-full w-full items-center justify-center">
      {/* The sweep sits under the picture until it paints, so a slow picture on
          mobile data reads as arriving rather than missing. */}
      {loadedUrl !== link.url ? (
        <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
          <SkeletonBlock />
        </View>
      ) : null}
      <Image
        testID="artwork-preview-image"
        source={{ uri: link.url }}
        // Third-party Image does not receive NativeWind's RN import transform.
        style={{ width: "100%", height: "100%" }}
        contentFit="contain"
        cachePolicy="none"
        transition={0}
        accessibilityLabel={accessibilityLabel}
        onLoad={() => setLoadedUrl(link.url)}
        onError={onImageError}
      />
    </View>
  );
}
