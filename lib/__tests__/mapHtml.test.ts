import { buildMapHtml } from "@/lib/mapHtml";

describe("buildMapHtml", () => {
  const base = {
    theme: "light" as const,
    pickup: { lat: 7.064, lng: 125.6085 },
    dropoff: { lat: 7.047, lng: 125.586 },
    pickupLabel: "Shop",
    dropoffLabel: "Client",
    routeCoordinates: [
      [125.6085, 7.064],
      [125.586, 7.047],
    ] as [number, number][],
    routeColor: "#FFDE58",
    rider: null,
    routeUnavailable: false,
  };

  it("includes OpenStreetMap attribution (licence condition)", () => {
    const html = buildMapHtml(base);
    expect(html).toMatch(/OpenStreetMap/i);
    expect(html).toMatch(/contributors/i);
  });

  it("uses dark tiles when theme is dark", () => {
    const html = buildMapHtml({ ...base, theme: "dark" });
    expect(html).toMatch(/cartocdn|dark_all/i);
  });

  it("surfaces the route-unavailable banner flag", () => {
    const html = buildMapHtml({ ...base, routeUnavailable: true });
    expect(html).toMatch(/Route unavailable/);
  });

  it("draws teardrop shop pins and tells the host when one is tapped", () => {
    const html = buildMapHtml({
      ...base,
      pickup: null,
      dropoff: null,
      routeCoordinates: [],
      places: [{ id: "shop-vicenta", name: "Vicenta Print House", lat: 7.07, lng: 125.61 }],
      selectedPlaceId: "shop-vicenta",
    });
    expect(html).toMatch(/pin-shop/);
    expect(html).toMatch(/pin-head/);
    expect(html).toMatch(/pin-tip/);
    expect(html).toMatch(/Vicenta Print House/);
    expect(html).toMatch(/notifyHost/);
    expect(html).toMatch(/type: 'place'/);
    expect(html).not.toMatch(/Create Route|create route/i);
  });
});
