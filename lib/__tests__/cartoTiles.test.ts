import { cartoApiKey, cartoDarkTileUrl } from "@/lib/cartoTiles";

describe("cartoDarkTileUrl", () => {
  it("leaves the dark tiles keyless when no key is configured", () => {
    expect(cartoApiKey({})).toBeNull();
    expect(cartoDarkTileUrl({})).toBe(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    );
    expect(cartoDarkTileUrl({})).not.toMatch(/key=/);
  });

  it("appends the Carto key as the documented query param", () => {
    const env = { EXPO_PUBLIC_CARTO_API_KEY: "test-key_1" };
    expect(cartoDarkTileUrl(env)).toContain("?key=test-key_1");
    expect(cartoDarkTileUrl(env)).toMatch(/dark_all/);
  });
});
