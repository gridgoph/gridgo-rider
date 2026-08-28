import {
  DAVAO_MAP_CENTER,
  filterPlaceholderShops,
  PLACEHOLDER_SHOPS,
} from "@/data/placeholderShops";
import { isValidLatLng } from "@/lib/geo";

describe("placeholder shop directory", () => {
  it("is a non-empty Davao set with unique ids and real coordinates", () => {
    expect(PLACEHOLDER_SHOPS.length).toBeGreaterThanOrEqual(4);
    const ids = PLACEHOLDER_SHOPS.map((shop) => shop.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const shop of PLACEHOLDER_SHOPS) {
      expect(shop.placeholder).toBe(true);
      expect(shop.name.trim()).not.toBe("");
      expect(shop.area.trim()).not.toBe("");
      expect(isValidLatLng({ lat: shop.lat, lng: shop.lng })).toBe(true);
      // Davao, not a default (0, 0) or another country.
      expect(shop.lat).toBeGreaterThan(6.8);
      expect(shop.lat).toBeLessThan(7.4);
      expect(shop.lng).toBeGreaterThan(125.4);
      expect(shop.lng).toBeLessThan(125.8);
    }
    expect(isValidLatLng(DAVAO_MAP_CENTER)).toBe(true);
  });

  it("filters by name, area, and street without inventing rows", () => {
    expect(filterPlaceholderShops(PLACEHOLDER_SHOPS, "  ")).toHaveLength(
      PLACEHOLDER_SHOPS.length,
    );
    const vicenta = filterPlaceholderShops(PLACEHOLDER_SHOPS, "vicenta");
    expect(vicenta).toHaveLength(1);
    expect(vicenta[0]?.name).toMatch(/Vicenta/);
    expect(filterPlaceholderShops(PLACEHOLDER_SHOPS, "Agdao").every((shop) =>
      shop.area === "Agdao" || shop.address.includes("Agdao"),
    )).toBe(true);
    expect(filterPlaceholderShops(PLACEHOLDER_SHOPS, "zzzz-no-shop")).toEqual([]);
  });
});
