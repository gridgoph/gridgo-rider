import { cartoApiKey, cartoDarkTileUrl } from "@/lib/cartoTiles";

describe("cartoDarkTileUrl", () => {
  const original = process.env.EXPO_PUBLIC_CARTO_API_KEY;

  afterEach(() => {
    if (original === undefined) delete process.env.EXPO_PUBLIC_CARTO_API_KEY;
    else process.env.EXPO_PUBLIC_CARTO_API_KEY = original;
  });

  it("leaves the dark tiles keyless when no key is configured", () => {
    expect(cartoApiKey("")).toBeNull();
    expect(cartoApiKey(undefined)).toBeNull();
    expect(cartoDarkTileUrl("")).toBe(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    );
    expect(cartoDarkTileUrl("")).not.toMatch(/key=/);
  });

  it("appends the Carto key as the documented query param", () => {
    expect(cartoDarkTileUrl("test-key_1")).toContain("?key=test-key_1");
    expect(cartoDarkTileUrl("test-key_1")).toMatch(/dark_all/);
  });

  it("reads the literal EXPO_PUBLIC_CARTO_API_KEY on the default path", () => {
    process.env.EXPO_PUBLIC_CARTO_API_KEY = "inline-key_9";
    expect(cartoDarkTileUrl()).toContain("?key=inline-key_9");

    delete process.env.EXPO_PUBLIC_CARTO_API_KEY;
    expect(cartoDarkTileUrl()).not.toMatch(/key=/);
  });
});
