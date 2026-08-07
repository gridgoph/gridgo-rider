import {
  fallbackRoute,
  parseOsrmResponse,
  routeSummaryLabel,
  type OsrmRouteResponse,
} from "@/lib/osrm";
import { fetchRoute } from "@/lib/osrm";

const pickup = { lat: 7.064, lng: 125.6085 };
const dropoff = { lat: 7.04749, lng: 125.58585 };

describe("parseOsrmResponse", () => {
  it("accepts a valid Ok route with geojson coordinates", () => {
    const body: OsrmRouteResponse = {
      code: "Ok",
      routes: [
        {
          distance: 3871.6,
          duration: 527.3,
          geometry: {
            type: "LineString",
            coordinates: [
              [125.6085, 7.064],
              [125.6, 7.055],
              [125.58585, 7.04749],
            ],
          },
        },
      ],
    };
    const result = parseOsrmResponse(body, pickup, dropoff);
    expect(result).not.toBeNull();
    expect(result!.routed).toBe(true);
    expect(result!.distanceMetres).toBe(3871.6);
    expect(result!.durationSeconds).toBe(527.3);
    expect(result!.coordinates).toHaveLength(3);
    expect(result!.statusLabel).toBeNull();
  });

  it("rejects non-Ok or empty geometry", () => {
    expect(parseOsrmResponse({ code: "NoRoute", routes: [] }, pickup, dropoff)).toBeNull();
    expect(
      parseOsrmResponse(
        {
          code: "Ok",
          routes: [{ distance: 1, duration: 1, geometry: { coordinates: [[1, 2]] } }],
        },
        pickup,
        dropoff,
      ),
    ).toBeNull();
  });
});

describe("fallbackRoute", () => {
  it("returns a straight line and an honest status label", () => {
    const result = fallbackRoute(pickup, dropoff);
    expect(result.routed).toBe(false);
    expect(result.coordinates).toHaveLength(2);
    expect(result.coordinates[0]).toEqual([pickup.lng, pickup.lat]);
    expect(result.statusLabel).toMatch(/unavailable/i);
    expect(result.distanceMetres).toBeGreaterThan(0);
  });
});

describe("routeSummaryLabel", () => {
  it("marks estimates when not road-routed", () => {
    const fallback = fallbackRoute(pickup, dropoff);
    expect(routeSummaryLabel(fallback)).toMatch(/est\./);
    expect(routeSummaryLabel(null)).toBe("Distance unknown");
  });

  it("shows distance and duration for a real route", () => {
    const label = routeSummaryLabel({
      routed: true,
      distanceMetres: 3871.6,
      durationSeconds: 527,
      coordinates: [],
      statusLabel: null,
    });
    expect(label).toBe("3.9 km · 9 min");
  });
});

describe("fetchRoute", () => {
  it("falls back when the network rejects", async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error("offline"));
    const result = await fetchRoute(pickup, dropoff, { fetchImpl });
    expect(result.routed).toBe(false);
    expect(result.coordinates.length).toBe(2);
  });

  it("falls back on HTTP error", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({}),
    });
    const result = await fetchRoute(pickup, dropoff, { fetchImpl });
    expect(result.routed).toBe(false);
  });

  it("parses a successful OSRM body", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: "Ok",
        routes: [
          {
            distance: 1000,
            duration: 120,
            geometry: {
              coordinates: [
                [125.6085, 7.064],
                [125.58585, 7.04749],
              ],
            },
          },
        ],
      }),
    });
    const result = await fetchRoute(pickup, dropoff, { fetchImpl });
    expect(result.routed).toBe(true);
    expect(result.distanceMetres).toBe(1000);
    // lon,lat order in the request path
    const url = fetchImpl.mock.calls[0][0] as string;
    expect(url).toContain("125.6085,7.064");
    expect(url).toContain("125.58585,7.04749");
  });
});
