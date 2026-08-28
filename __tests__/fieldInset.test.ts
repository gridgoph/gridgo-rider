import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { fieldInputStyle } from "@/constants/theme";

const root = join(__dirname, "..");

function typescriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return typescriptFiles(path);
    return entry.name.endsWith(".tsx") ? [path] : [];
  });
}

describe("gg-field native text inset", () => {
  it("never relies on NativeWind class padding for a TextInput inner inset", () => {
    const fields = [...typescriptFiles(join(root, "app")), ...typescriptFiles(join(root, "components"))]
      .flatMap((path) => {
        const source = readFileSync(path, "utf8");
        return [...source.matchAll(/<TextInput\b[\s\S]*?\/>/g)]
          .map((match) => match[0])
          .filter((input) => input.includes('className="gg-field"'))
          .map((input) => ({ path, input }));
      });

    expect(fields.length).toBeGreaterThan(0);
    for (const { path, input } of fields) {
      const hasExplicitNativeInset =
        /style=\{(?:fieldInputStyle|\[[\s\S]*fieldInputStyle|\{\s*\.\.\.fieldInputStyle)/.test(
          input,
        );
      expect({ path, input, hasExplicitNativeInset }).toMatchObject({
        hasExplicitNativeInset: true,
      });
    }
  });

  it("defines a 16dp Android-native inset and centered line box", () => {
    expect(fieldInputStyle.paddingStart).toBe(16);
    expect(fieldInputStyle.paddingEnd).toBe(16);
    expect(fieldInputStyle).toMatchObject({
      includeFontPadding: false,
      textAlignVertical: "center",
    });
  });

  it("removes class padding that can override the native inset", () => {
    const css = readFileSync(join(root, "global.css"), "utf8");
    const utility = /@utility gg-field \{([\s\S]*?)\}/.exec(css)?.[1] ?? "";
    expect(utility).not.toMatch(/\bp[xe]-/);
  });
});
