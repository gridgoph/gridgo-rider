import { HELD_READ_MAX_AGE_MS, PHOTO_LINK_MARGIN_MS, heldLinkIsStale, photoLinkIsStale } from "@/lib/photoLinks";

const NOW = Date.parse("2026-09-28T08:00:00.000Z");
const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

describe("photoLinkIsStale", () => {
  it("calls an expired link stale", () => {
    expect(photoLinkIsStale(at(-1_000), NOW)).toBe(true);
  });

  it("calls a link inside the margin stale before it expires", () => {
    expect(photoLinkIsStale(at(PHOTO_LINK_MARGIN_MS - 1), NOW)).toBe(true);
    expect(photoLinkIsStale(at(PHOTO_LINK_MARGIN_MS + 1_000), NOW)).toBe(false);
  });

  it("never guesses about a link that carries no expiry", () => {
    expect(photoLinkIsStale(undefined, NOW)).toBe(false);
    expect(photoLinkIsStale(null, NOW)).toBe(false);
    expect(photoLinkIsStale("not a date", NOW)).toBe(false);
  });
});

describe("heldLinkIsStale", () => {
  it("re-reads a link held four minutes or more even when it says nothing of expiry", () => {
    expect(heldLinkIsStale({ readAt: NOW - HELD_READ_MAX_AGE_MS, expiresAt: null }, NOW)).toBe(true);
    expect(heldLinkIsStale({ readAt: NOW - 60_000, expiresAt: null }, NOW)).toBe(false);
  });

  it("re-reads a young link that is itself stale", () => {
    expect(heldLinkIsStale({ readAt: NOW - 10_000, expiresAt: at(5_000) }, NOW)).toBe(true);
    expect(heldLinkIsStale({ readAt: NOW - 10_000, expiresAt: at(290_000) }, NOW)).toBe(false);
  });

  it("does nothing when nothing is held", () => {
    expect(heldLinkIsStale({ readAt: null, expiresAt: at(-1) }, NOW)).toBe(false);
  });
});
