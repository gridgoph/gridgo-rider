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

  it("draws a dispatch ticket and GPS pulse on a trip map", () => {
    const html = buildMapHtml({
      ...base,
      navTitle: "TO THE SHOP",
      navSummary: "4.2 km · 14 min",
      pickupKind: "shop",
      dropoffKind: "client",
      focus: "pickup",
      rider: { lat: 7.07, lng: 125.61 },
    });
    expect(html).toMatch(/nav-chip/);
    expect(html).toMatch(/TO THE SHOP/);
    expect(html).toMatch(/gps-pulse/);
    expect(html).toMatch(/pin-halo/);
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

  it("gives every stop the same teardrop, filled per kind", () => {
    // One silhouette that touches its own coordinate, three fills: yellow for
    // a print shop, paper for a client door, GRIDGO's ink and gold for the
    // counter. A plate floating over the tiles never says which doorway.
    const html = buildMapHtml({ ...base, pickupKind: "shop", dropoffKind: "office" });
    expect(html).toMatch(/pin-shop/);
    expect(html).toMatch(/pin-client/);
    expect(html).toMatch(/pin-office/);
    // The anchor sits on the tip, and a contact shadow stands it on the street.
    expect(html).toMatch(/iconAnchor: \[17, 45\]/);
    expect(html).toMatch(/pin-tip/);
    expect(html).toMatch(/pin-ring/);
  });

  it("names the place on the pin and leaves the address to the card", () => {
    const html = buildMapHtml(base);
    expect(html).toMatch(/function pinCaption/);
    expect(html).toMatch(/text\.indexOf\(','\)/);
  });

  it("splits the route summary so distance is the glance target", () => {
    // "1.2 km · 6 min" is two measurements in one string. The strip leads with
    // the distance and rules between them; anything without the separator is a
    // state ("Waiting for GPS"), and a state is not shouted.
    const html = buildMapHtml({ ...base, navTitle: "TO THE SHOP", navSummary: "1.2 km \u00b7 6 min" });
    expect(html).toMatch(/nav-lead/);
    expect(html).toMatch(/nav-rule/);
    expect(html).toMatch(/nav-rest/);
    expect(html).toMatch(/nav-state/);
  });

  it("makes a card map a picture, and keeps attribution visible either way", () => {
    // A map on a scrolling page cannot be driven — the page owns the drag — so
    // the gestures and the unreachable zoom control go, and the licence line
    // moves to the corner the expand control does not occupy.
    const preview = buildMapHtml({ ...base, controls: false });
    expect(preview).toMatch(/m\.controls !== false/);
    expect(preview).toMatch(/map\.dragging\.disable\(\)/);
    expect(preview).toMatch(/'bottomright' : 'bottomleft'/);
    expect(preview).toMatch(/L\.control\.attribution/);
    expect(preview).toMatch(/OpenStreetMap/);
  });

  it("keeps the navigation banner clear of the phone's own status bar", () => {
    // The full-screen map is drawn edge to edge on purpose, which puts the
    // clock and battery straight over anything the map draws at the top. Only
    // the host knows how deep that is, so the banner starts below what it says.
    const html = buildMapHtml({ ...base, navTitle: "TO GRIDGO OFFICE", safeTop: 47 });
    expect(html).toMatch(/--safe-top/);
    expect(html).toMatch(/top: calc\(8px \+ var\(--safe-top, 0px\)\)/);
    expect(html).toMatch(/m\.safeTop/);
  });
});
