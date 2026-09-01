import { firstOpenView, parseBrowseMapMessage, shopsToMapPlaces, viewOn } from "@/lib/browseMap";

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
      ]),
    ).toEqual([{ id: "user_lovis_printshop", name: "Lovis Printshop", lat: 7.1, lng: 125.6 }]);
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
