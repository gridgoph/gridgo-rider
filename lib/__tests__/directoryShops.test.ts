import type { CatalogShopSummary } from "@/lib/api";
import {
  directoryShopFromCatalog,
  directoryShopsFromCatalog,
  filterDirectoryShops,
} from "@/lib/directoryShops";

const lovis: CatalogShopSummary = {
  supplierId: "user_lovis_printshop",
  shopName: "Lovis Printshop",
  shop: {
    lat: 7.086767242919336,
    lng: 125.61613995306057,
    label: "Iñigo, Corner Cervantes St, Poblacion, Davao City",
  },
  categories: ["marketing_collateral"],
  itemCount: 8,
};

describe("directoryShopFromCatalog", () => {
  it("keeps the catalog shop pin a rider would drive to", () => {
    expect(directoryShopFromCatalog(lovis)).toEqual({
      id: "user_lovis_printshop",
      name: "Lovis Printshop",
      address: "Iñigo, Corner Cervantes St, Poblacion, Davao City",
      lat: 7.086767242919336,
      lng: 125.61613995306057,
    });
  });

  it("drops a shop with no usable coordinates rather than inventing a pin", () => {
    expect(
      directoryShopFromCatalog({
        ...lovis,
        shop: { lat: Number.NaN, lng: 125.6, label: "Nowhere" },
      }),
    ).toBeNull();
    expect(directoryShopFromCatalog({ ...lovis, shop: null })).toBeNull();
  });
});

describe("directoryShopsFromCatalog", () => {
  it("keeps only shops that can be plotted", () => {
    const plotted = directoryShopsFromCatalog([
      lovis,
      { ...lovis, supplierId: "user_missing", shop: null },
    ]);
    expect(plotted).toHaveLength(1);
    expect(plotted[0]?.id).toBe("user_lovis_printshop");
  });
});

describe("filterDirectoryShops", () => {
  const shops = directoryShopsFromCatalog([lovis]);

  it("matches name or street", () => {
    expect(filterDirectoryShops(shops, "lovis")).toHaveLength(1);
    expect(filterDirectoryShops(shops, "Cervantes")).toHaveLength(1);
    expect(filterDirectoryShops(shops, "zzzz")).toEqual([]);
  });
});
