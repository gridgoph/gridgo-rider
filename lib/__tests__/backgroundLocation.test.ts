import { pickServiceFix, pingEndsTracking } from "@/lib/backgroundLocation";
import { ApiError } from "@/lib/api";

const NOW = Date.parse("2026-10-14T01:00:00.000Z");
const at = (ageMs: number, lat = 7.07) => ({ coords: { latitude: lat, longitude: 125.61, accuracy: 9 }, timestamp: NOW - ageMs });

describe("pickServiceFix", () => {
  it("sends only the newest fix of a batch, with its own time", () => {
    expect(pickServiceFix([at(9_000, 7.01), at(2_000, 7.02), at(5_000, 7.03)], { lastSentFixMs: null, nowMs: NOW })).toEqual({
      lat: 7.02, lng: 125.61, accuracy: 9, fixAtMs: NOW - 2_000,
    });
  });

  it("never replays a backlog as current GPS", () => {
    expect(pickServiceFix([at(60_000), at(50_000)], { lastSentFixMs: null, nowMs: NOW })).toBeNull();
    expect(pickServiceFix([at(-20_000)], { lastSentFixMs: null, nowMs: NOW })).toBeNull();
  });

  it("keeps to the ping cadence, with a little room for timer jitter", () => {
    expect(pickServiceFix([at(1_000)], { lastSentFixMs: NOW - 6_000, nowMs: NOW })).toBeNull();
    expect(pickServiceFix([at(1_000)], { lastSentFixMs: NOW - 15_000, nowMs: NOW })).not.toBeNull();
  });

  it("drops nonsense rather than posting it", () => {
    expect(pickServiceFix([], { lastSentFixMs: null, nowMs: NOW })).toBeNull();
    expect(pickServiceFix(undefined, { lastSentFixMs: null, nowMs: NOW })).toBeNull();
    expect(pickServiceFix([{ coords: { latitude: Number.NaN, longitude: 1 }, timestamp: NOW }], { lastSentFixMs: null, nowMs: NOW })).toBeNull();
    expect(pickServiceFix([{ coords: { latitude: 7, longitude: 125, accuracy: -1 }, timestamp: NOW }], { lastSentFixMs: null, nowMs: NOW })?.accuracy).toBeNull();
  });
});

describe("pingEndsTracking", () => {
  it("stops for a job that left the window or the rider", () => {
    expect(pingEndsTracking(new ApiError(409, { error: "tracking_not_active" }))).toBe(true);
    expect(pingEndsTracking(new ApiError(403, { error: "forbidden" }))).toBe(true);
    expect(pingEndsTracking(new ApiError(404, { error: "not_found" }))).toBe(true);
  });

  it("keeps going through a stale token, a bad fix or the road", () => {
    expect(pingEndsTracking(new ApiError(401, { error: "unauthorized" }))).toBe(false);
    expect(pingEndsTracking(new ApiError(400, { error: "invalid_location_timestamp" }))).toBe(false);
    expect(pingEndsTracking(new ApiError(409, { error: "something_else" }))).toBe(false);
    expect(pingEndsTracking(new TypeError("Network request failed"))).toBe(false);
  });
});
