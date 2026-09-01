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

  it("draws the office pin on the city map, not a shop letter", () => {
    const html = buildMapHtml({
      ...base,
      pickup: null,
      dropoff: null,
      routeCoordinates: [],
      places: [
        { id: "shop-vicenta", name: "Vicenta Print House", lat: 7.07, lng: 125.61, kind: "shop" },
        { id: "gridgo-office", name: "GRIDGO Office", lat: 7.092, lng: 125.616, kind: "office" },
      ],
    });
    expect(html).toMatch(/place\.kind === 'office'/);
    expect(html).toMatch(/'GO'/);
    expect(html).toMatch(/pin-office/);
    expect(html).toMatch(/GRIDGO Office/);
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

  it("gives up the drag on a card but keeps the zoom", () => {
    // The page underneath owns the vertical drag, so a rider looking one
    // street ahead would scroll the job instead. A zoom button and a pinch
    // cost the page nothing, so those stay.
    const card = buildMapHtml({ ...base, pan: false });
    expect(card).toMatch(/m\.pan !== false/);
    expect(card).toMatch(/m\.zoom !== false/);
    expect(card).toMatch(/map\.dragging\.disable\(\)/);
    expect(card).toMatch(/L\.control\.zoom/);
    expect(card).toMatch(/L\.control\.attribution/);
    expect(card).toMatch(/OpenStreetMap/);
  });

  it("gives the map a view before any layer is added to it", () => {
    // A Leaflet map with no view is not loaded, and layers added before that
    // are parked on a load event rather than attached. Anything that stops the
    // real view being set then leaves them parked forever — streets drawn
    // perfectly, with no rider and no destination on them.
    const html = buildMapHtml(base);
    const created = html.indexOf("map = L.map('map'");
    const opened = html.indexOf("map.setView([7.1907, 125.4553], 12)");
    const firstLayer = html.indexOf("L.control.attribution");
    expect(created).toBeGreaterThan(-1);
    expect(opened).toBeGreaterThan(created);
    expect(opened).toBeLessThan(firstLayer);
  });

  it("starts its overlays clear of a control the screen draws over it", () => {
    // The full-screen map puts a close control in the top-left corner. Both it
    // and the heading strip are dark, so stacked they cancel out — the host
    // says how much room it takes and the strip begins beside it.
    const html = buildMapHtml({ ...base, navTitle: "TO GRIDGO OFFICE", chromeLeft: 68 });
    expect(html).toMatch(/--chrome-left/);
    expect(html).toMatch(/left: var\(--chrome-left, 10px\)/);
    expect(html).toMatch(/m\.chromeLeft/);
  });

  it("centres on the rider and stops following once they pan", () => {
    // Fitting the two stops left the rider wherever the geometry put them,
    // often off a card only tall enough for one thing. The camera sits on the
    // rider; a pan is them saying "let me look over there", and nothing drags
    // it back afterwards.
    const html = buildMapHtml({ ...base, rider: { lat: 7.0592, lng: 125.6 } });
    expect(html).toMatch(/followRider/);
    expect(html).toMatch(/map\.setView\(\[m\.rider\.lat, m\.rider\.lng\], zoom\)/);
    expect(html).toMatch(/dragstart/);
    // The opening zoom mirrors the stop across the rider, so centring on them
    // cannot push where they are going off the edge.
    expect(html).toMatch(/2 \* m\.rider\.lat - stop\.lat/);
    expect(html).toMatch(/getBoundsZoom/);
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
