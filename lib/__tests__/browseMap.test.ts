import { firstOpenView, parseBrowseMapMessage, shopOrderBadges, shopsToMapPlaces, viewOn } from "@/lib/browseMap";

describe("browse map messages", () => {
  it("accepts a pin tap and ignores everything else", () => {
    expect(parseBrowseMapMessage(JSON.stringify({ type: "place", id: "shop-vicenta" }))).toEqual({
      type: "place",
      id: "shop-vicenta",
    });
    expect(parseBrowseMapMessage("{")).toBeNull();
    expect(parseBrowseMapMessage(JSON.stringify({ type: "route" }))).toBeNull();
    expect(parseBrowseMapMessage(JSON.stringify({ type: "place", id: "  " }))).toBeNull();
  });

  it("keeps shop identity when projecting onto the map model", () => {
    expect(
      shopsToMapPlaces([
        {
          id: "user_lovis_printshop",
          name: "Lovis Printshop",
          address: "Iñigo, Corner Cervantes St, Poblacion, Davao City",
          lat: 7.1,
          lng: 125.6,
        },
        {
          id: "gridgo-office",
          name: "GRIDGO Office",
          address: "Poblacion District, Davao City",
          lat: 7.09,
          lng: 125.62,
          kind: "office",
        },
      ]),
    ).toEqual([
      { id: "user_lovis_printshop", name: "Lovis Printshop", lat: 7.1, lng: 125.6, kind: "shop" },
      { id: "gridgo-office", name: "GRIDGO Office", lat: 7.09, lng: 125.62, kind: "office" },
    ]);
    expect(viewOn({ lat: 7.19, lng: 125.45 }, 14)).toEqual({
      lat: 7.19,
      lng: 125.45,
      zoom: 14,
    });
    expect(firstOpenView({ lat: 7.07, lng: 125.61 }, { lat: 7.19, lng: 125.45 }, 13)).toEqual({
      lat: 7.07,
      lng: 125.61,
      zoom: 15,
    });
    expect(firstOpenView(null, { lat: 7.19, lng: 125.45 }, 13)).toEqual({
      lat: 7.19,
      lng: 125.45,
      zoom: 13,
    });
  });
});

describe("shop order badges", () => {
  it("counts the rider's own orders by the shop they leave from, once each", () => {
    const offer = { id: "ord_1", supplierId: "user_shop_a" };
    const trip = { id: "ord_2", supplierId: "user_shop_a" };
    expect(shopOrderBadges([offer, trip, offer, null, undefined, { id: "ord_3", supplierId: "user_shop_b" }])).toEqual({
      user_shop_a: 2,
      user_shop_b: 1,
    });
  });

  it("puts the count on the shop's pin and nowhere else", () => {
    const places = shopsToMapPlaces(
      [
        { id: "user_shop_a", kind: "shop", name: "A", address: "A St", lat: 7, lng: 125 },
        { id: "user_shop_b", kind: "shop", name: "B", address: "B St", lat: 7.1, lng: 125.1 },
      ] as never,
      { user_shop_a: 2 },
    );
    expect(places.find((place) => place.id === "user_shop_a")?.badge).toBe(2);
    expect(places.find((place) => place.id === "user_shop_b")?.badge).toBeUndefined();
  });
});
