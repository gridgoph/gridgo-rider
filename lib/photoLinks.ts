/**
 * Is a held picture link still good?
 *
 * An artwork preview reaches the phone as a signed link from
 * `GET /files/:id/download-url` that GRIDGO's storage honours for five minutes
 * (`expiresAt`). The trip screens hold that link in state, and a rider's phone
 * sits in the background far longer than that — so on resume the preview drew
 * a link storage answers with `403 Request has expired`, and latched "Preview
 * unavailable". Nothing was wrong with the file; the link was old
 * (gridgoph/gridgo-supplier#84, the rider half of gridgoph/gridgo-client#111).
 *
 * The fix is never a longer-lived link (that is a security trade on the
 * server): it is reading a fresh link when the held one is stale. This module
 * only answers "stale?"; `components/ArtworkPreview.tsx` owns the re-read.
 * Same rules and numbers as gridgo-client's `lib/photoLinks.ts`.
 */

/**
 * How close to expiry a link counts as stale already. A large picture on
 * mobile data can take seconds to arrive, and a link that expires mid-transfer
 * is as dead as one that already has.
 */
export const PHOTO_LINK_MARGIN_MS = 30_000;

/**
 * How old a held link may be before a resume re-reads it regardless of what it
 * says about itself. Under the five-minute signing window by the margin above.
 */
export const HELD_READ_MAX_AGE_MS = 240_000;

/** Milliseconds since epoch the link expires at, or null when it does not say. */
export function photoLinkExpiry(expiresAt: string | null | undefined): number | null {
  if (!expiresAt) return null;
  const at = Date.parse(expiresAt);
  return Number.isFinite(at) ? at : null;
}

/**
 * True when the link has expired or will within the margin. A link with no
 * expiry (or an unreadable one) is not called stale: there is nothing to go on,
 * and a re-read on a guess is a request loop waiting to happen.
 */
export function photoLinkIsStale(expiresAt: string | null | undefined, now: number = Date.now()): boolean {
  const at = photoLinkExpiry(expiresAt);
  return at !== null && at - now <= PHOTO_LINK_MARGIN_MS;
}

/**
 * Should a screen coming back to the foreground re-read the link it holds?
 * Yes when it was read `HELD_READ_MAX_AGE_MS` ago or more, or when the link
 * itself is stale. No when nothing is held.
 */
export function heldLinkIsStale(
  held: { readAt: number | null; expiresAt: string | null | undefined },
  now: number = Date.now(),
): boolean {
  if (held.readAt === null) return false;
  if (now - held.readAt >= HELD_READ_MAX_AGE_MS) return true;
  return photoLinkIsStale(held.expiresAt, now);
}
