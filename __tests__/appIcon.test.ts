import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { ExpoConfig } from "expo/config";

/**
 * The home-screen icon is the GRIDGO RIDER wordmark lockup on a black
 * plate, not the Expo chevron and not the 3×3 mark.
 *
 * `app.json` is the source of the paths Expo prebuild copies into the
 * native project. A leftover `react-logo*` asset or the default Expo
 * `#E6F4FE` plate would put the blue chevron back on the launcher.
 */

const root = join(__dirname, "..");
const images = join(root, "assets/images");
const appJson = JSON.parse(readFileSync(join(root, "app.json"), "utf8")) as {
  expo: ExpoConfig;
};

function pngSize(path: string): { width: number; height: number } {
  const buf = readFileSync(path);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function pluginOptions(name: string): Record<string, unknown> {
  const entry = (appJson.expo.plugins ?? []).find(
    (plugin) => Array.isArray(plugin) && plugin[0] === name,
  );
  if (!Array.isArray(entry) || entry[1] == null || typeof entry[1] !== "object") {
    throw new Error(`app.json is missing the ${name} plugin options`);
  }
  return entry[1] as Record<string, unknown>;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/** Sample an RGB triple from an 8-bit RGB/RGBA PNG at (x, y). */
function pngPixel(path: string, x: number, y: number): [number, number, number] {
  const zlib = require("node:zlib") as typeof import("node:zlib");
  const buf = readFileSync(path);
  const width = buf.readUInt32BE(16);
  const bitDepth = buf[24];
  const colorType = buf[25];
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`${path} is not 8-bit RGB/RGBA`);
  }
  const chunks: Buffer[] = [];
  let offset = 8;
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString("ascii");
    if (type === "IDAT") {
      chunks.push(buf.subarray(offset + 8, offset + 8 + length));
    }
    if (type === "IEND") break;
    offset += 12 + length;
  }
  const data = zlib.inflateSync(Buffer.concat(chunks));
  const channels = colorType === 6 ? 4 : 3;
  const stride = 1 + width * channels;
  const height = data.length / stride;
  const recon = Buffer.alloc(width * height * channels);
  let prev = Buffer.alloc(width * channels);
  for (let row = 0; row < height; row++) {
    const filter = data[row * stride];
    const raw = data.subarray(row * stride + 1, row * stride + stride);
    const out = Buffer.alloc(width * channels);
    for (let i = 0; i < raw.length; i++) {
      const left = i >= channels ? out[i - channels] : 0;
      const up = prev[i];
      const upLeft = i >= channels ? prev[i - channels] : 0;
      let value = raw[i];
      if (filter === 1) value = (value + left) & 255;
      else if (filter === 2) value = (value + up) & 255;
      else if (filter === 3) value = (value + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) value = (value + paeth(left, up, upLeft)) & 255;
      else if (filter !== 0) throw new Error(`unsupported PNG filter ${filter}`);
      out[i] = value;
    }
    out.copy(recon, row * width * channels);
    prev = out;
  }
  const i = (y * width + x) * channels;
  return [recon[i], recon[i + 1], recon[i + 2]];
}

function near(
  pixel: [number, number, number],
  target: [number, number, number],
  tol = 8,
): boolean {
  return (
    Math.abs(pixel[0] - target[0]) <= tol &&
    Math.abs(pixel[1] - target[1]) <= tol &&
    Math.abs(pixel[2] - target[2]) <= tol
  );
}

describe("GRIDGO app icon", () => {
  it("points icon, adaptive layers, favicon and splash at the mark files", () => {
    expect(appJson.expo.icon).toBe("./assets/images/icon.png");
    expect(appJson.expo.android?.adaptiveIcon).toEqual({
      backgroundColor: "#000000",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    });
    expect(appJson.expo.web?.favicon).toBe("./assets/images/favicon.png");

    const splash = pluginOptions("expo-splash-screen");
    expect(splash.image).toBe("./assets/images/splash-icon.png");
    expect(splash.backgroundColor).toBe("#000000");
    expect(splash.dark).toEqual({
      image: "./assets/images/splash-icon-dark.png",
      backgroundColor: "#000000",
    });
  });

  it("does not keep the Expo blue plate or a white plate", () => {
    const encoded = JSON.stringify(appJson);
    expect(encoded).not.toContain("#E6F4FE");
    expect(encoded).not.toContain("#e6f4fe");
    expect(appJson.expo.android?.adaptiveIcon?.backgroundColor).toBe("#000000");
    expect(appJson.expo.android?.adaptiveIcon?.backgroundColor).not.toBe(
      "#FFFFFF",
    );
  });

  it("ships 1024×1024 icon, adaptive and splash rasters", () => {
    const expected = [
      "icon.png",
      "android-icon-foreground.png",
      "android-icon-background.png",
      "android-icon-monochrome.png",
      "splash-icon.png",
      "splash-icon-dark.png",
    ];
    for (const name of expected) {
      const path = join(images, name);
      expect(existsSync(path)).toBe(true);
      expect(pngSize(path)).toEqual({ width: 1024, height: 1024 });
    }
    expect(pngSize(join(images, "favicon.png"))).toEqual({
      width: 48,
      height: 48,
    });
  });

  it("paints a black plate, not white", () => {
    const plate: [number, number, number] = [0, 0, 0];
    const icon = join(images, "icon.png");
    const background = join(images, "android-icon-background.png");
    expect(near(pngPixel(icon, 8, 8), plate)).toBe(true);
    expect(near(pngPixel(icon, 1016, 8), plate)).toBe(true);
    expect(near(pngPixel(icon, 8, 1016), plate)).toBe(true);
    expect(near(pngPixel(background, 0, 0), plate)).toBe(true);
    expect(near(pngPixel(background, 512, 512), plate)).toBe(true);
  });

  it("paints the GRIDGO RIDER lockup, not the 3x3 mark", () => {
    const icon = join(images, "icon.png");
    const at = (cx: number, cy: number) =>
      pngPixel(icon, Math.round((cx / 108) * 1024), Math.round((cy / 108) * 1024));
    expect(near(at(70, 38), [0, 0, 0])).toBe(true);
    expect(near(pngPixel(icon, 634, 491), [255, 222, 89], 12)).toBe(true);
    expect(near(pngPixel(icon, 512, 573), [255, 255, 255], 8)).toBe(true);

    const generator = readFileSync(
      join(root, "scripts/generate-app-icon.py"),
      "utf8",
    );
    expect(generator).toContain("wordmark lockup");
    expect(generator).not.toContain("CENTRES = (38, 54, 70)");
  });

  it("drops leftover Expo react-logo assets", () => {
    const names = readdirSync(images);
    expect(names.filter((name) => name.includes("react-logo"))).toEqual([]);
    expect(names).not.toContain("partial-react-logo.png");
  });
});
