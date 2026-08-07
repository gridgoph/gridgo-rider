import {
  boundsForPoints,
  formatDistanceMetres,
  formatDurationSeconds,
  fromLonLat,
  haversineMetres,
  isValidLatLng,
  straightLineGeometry,
  toLonLat,
} from "@/lib/geo";

describe("lat/lng conversion", () => {
  it("swaps to lon,lat for OSRM and back", () => {
    const point = { lat: 7.064, lng: 125.6085 };
    expect(toLonLat(point)).toEqual([125.6085, 7.064]);
    expect(fromLonLat([125.6085, 7.064])).toEqual(point);
  });

  it("rejects invalid coordinates", () => {
    expect(isValidLatLng(null)).toBe(false);
    expect(isValidLatLng({ lat: 91, lng: 0 })).toBe(false);
    expect(isValidLatLng({ lat: 7, lng: 125 })).toBe(true);
  });
});

describe("haversine and formatting", () => {
  it("measures Davao pickup to dropoff roughly under 5 km", () => {
    const pickup = { lat: 7.064, lng: 125.6085 };
    const dropoff = { lat: 7.04749, lng: 125.58585 };
    const m = haversineMetres(pickup, dropoff);
    expect(m).toBeGreaterThan(2000);
    expect(m).toBeLessThan(5000);
  });

  it("formats metres and kilometres for glanceable UI", () => {
    expect(formatDistanceMetres(420)).toBe("420 m");
    expect(formatDistanceMetres(3871.6)).toBe("3.9 km");
    expect(formatDistanceMetres(12500)).toBe("13 km");
  });

  it("formats duration as minutes or hours", () => {
    expect(formatDurationSeconds(45)).toBe("1 min");
    expect(formatDurationSeconds(527)).toBe("9 min");
    expect(formatDurationSeconds(3720)).toBe("1h 2m");
    expect(formatDurationSeconds(7200)).toBe("2h");
  });
});

describe("geometry helpers", () => {
  it("builds a two-point straight line in lon,lat order", () => {
    const line = straightLineGeometry(
      { lat: 7.064, lng: 125.6085 },
      { lat: 7.047, lng: 125.586 },
    );
    expect(line.coordinates).toEqual([
      [125.6085, 7.064],
      [125.586, 7.047],
    ]);
  });

  it("pads bounds so a single pin is not flush to the edge", () => {
    const b = boundsForPoints([{ lat: 7.064, lng: 125.6085 }]);
    expect(b).not.toBeNull();
    expect(b!.north).toBeGreaterThan(7.064);
    expect(b!.south).toBeLessThan(7.064);
    expect(b!.east).toBeGreaterThan(125.6085);
    expect(b!.west).toBeLessThan(125.6085);
  });
});
